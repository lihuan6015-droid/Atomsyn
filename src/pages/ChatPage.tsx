/**
 * V2.x · AI Chat Page — full redesign with streaming Markdown,
 * skill-driven conversation, session management, and memory system.
 *
 * Architecture:
 * - ChatMessageList: renders conversation with Streamdown markdown + [[atom:id]] cards
 * - ChatInput: multi-line input with attachments, /commands, model selector
 * - Context Harness: SOUL.md + AGENTS.md + knowledge index + memory + history
 * - Streaming LLM Client: dual-branch (Anthropic/OpenAI) streaming
 * - Memory Manager: async background extraction of user preferences
 */

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Sparkles } from 'lucide-react'
import { BootstrapWizard } from '@/pages/Chat/BootstrapWizard'
import { useBootstrapStore } from '@/stores/useBootstrapStore'
import { useAppStore } from '@/stores/useAppStore'
import { useChatStore } from '@/stores/useChatStore'
import { useModelConfigStore, getModelApiKey } from '@/stores/useModelConfigStore'
import { atomsApi, chatApi, indexApi, trackUsage } from '@/lib/dataApi'
import { streamChat } from '@/lib/chatLlmClient'
import { buildSystemPrompt, trimHistory, estimateTokens } from '@/lib/contextHarness'
import { extractMemories, loadMemories } from '@/lib/memoryManager'
import { getStoredApiKey } from '@/lib/llmClient'
import type { ChatAttachment, KnowledgeIndex, MemoryEntry } from '@/types'
import { cn } from '@/lib/cn'
import atomsynLogo from '@/assets/atomsyn-logo.png'

import { ChatMessageList } from '@/components/chat/ChatMessageList'
import { ChatInput } from '@/components/chat/ChatInput'

export function ChatPage() {
  const showToast = useAppStore((s) => s.showToast)

  // Chat store
  const {
    currentSession,
    currentSessionId,
    isStreaming,
    streamingContent,
    createSession,
    addUserMessage,
    startStreaming,
    appendStreamToken,
    completeStreaming,
    cancelStreaming,
  } = useChatStore()

  // Local state
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeIndex | null>(null)
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [soulContent, setSoulContent] = useState('')
  const [agentsContent, setAgentsContent] = useState('')
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => !!getStoredApiKey())
  const [wizardOpen, setWizardOpen] = useState(false)
  const openWizard = useBootstrapStore((s) => s.open)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<{ focus: () => void }>(null)

  // Load context on mount
  useEffect(() => {
    indexApi.get().then(setKnowledgeIndex).catch(() => undefined)
    chatApi.getSoul().then((r) => setSoulContent(r.content)).catch(() => undefined)
    chatApi.getAgents().then((r) => setAgentsContent(r.content)).catch(() => undefined)
    loadMemories().then(setMemories).catch(() => undefined)
    setHasApiKey(!!getStoredApiKey())
  }, [])

  // ⌘N shortcut: new session
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        createSession()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createSession])

  // ─── Send message handler ─────────────────────────────────────────

  const handleSend = useCallback(async (text: string, attachments?: ChatAttachment[]) => {
    if (!text.trim() || isStreaming) return

    // Ensure we have a session
    let sessionId = currentSessionId
    if (!sessionId) {
      sessionId = await createSession()
    }

    // Get model config
    const store = useModelConfigStore.getState()
    const chatStore = useChatStore.getState()
    const sessionModelId = chatStore.sessionModelId
    const modelConfig = sessionModelId
      ? store.models.find((m) => m.id === sessionModelId && m.enabled)
      : store.getDefault('llm')

    if (!modelConfig) {
      showToast('请先在设置中配置一个 LLM 模型')
      return
    }

    const apiKey = getModelApiKey(modelConfig.id) || getStoredApiKey()
    if (!apiKey) {
      showToast('请先在设置中填入 API Key')
      return
    }

    // Add user message
    await addUserMessage(text, attachments)
    trackUsage({ type: 'chat-send', meta: { length: text.length } })

    // Build system prompt from context harness
    const systemPrompt = await buildSystemPrompt({
      soul: soulContent,
      agents: agentsContent,
      knowledgeIndex,
      memories,
      sessionSummary: useChatStore.getState().currentSession?.summary,
      userMessage: text,
    })

    // Prepare message history (smart trimming based on model context window)
    const currentMessages = useChatStore.getState().currentSession?.messages ?? []
    const systemTokens = estimateTokens(systemPrompt)
    const maxContextK = modelConfig.maxContextTokens ?? 128
    const trimmed = trimHistory(currentMessages, systemTokens, maxContextK)
    // Convert messages to ChatMessage format, including multimodal attachments
    const chatMessages = trimmed.map((m) => {
      // If message has image attachments, build ContentPart[]
      const imageAtts = m.attachments?.filter((a) => a.type === 'image' && a.data)
      if (imageAtts && imageAtts.length > 0) {
        const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
        // Add text content first
        if (m.content) {
          parts.push({ type: 'text' as const, text: m.content })
        }
        // Add images as data URLs
        for (const att of imageAtts) {
          parts.push({
            type: 'image_url' as const,
            image_url: { url: `data:${att.mediaType};base64,${att.data}` },
          })
        }
        return { role: m.role as 'user' | 'assistant', content: parts }
      }
      // Text-only or file attachments (inject file content into text)
      let content = m.content
      const fileAtts = m.attachments?.filter((a) => a.type === 'file' && a.data)
      if (fileAtts && fileAtts.length > 0) {
        const fileTexts = fileAtts.map((a) => `\n\n--- 附件: ${a.name} ---\n${a.data}`).join('')
        content = content + fileTexts
      }
      return { role: m.role as 'user' | 'assistant', content }
    })

    // Start streaming
    startStreaming()
    const abort = new AbortController()
    abortRef.current = abort

    try {
      let fullText = ''
      await streamChat({
        messages: chatMessages,
        systemPrompt,
        modelConfig: {
          provider: modelConfig.provider,
          baseUrl: modelConfig.baseUrl,
          modelId: modelConfig.modelId,
        },
        apiKey,
        onToken: (token) => {
          fullText += token
          appendStreamToken(token)
        },
        onComplete: () => {
          // handled below
        },
        onError: (err) => {
          if (err.name !== 'AbortError') {
            showToast('AI 回复失败：' + err.message)
          }
        },
        signal: abort.signal,
      })

      // Complete the stream
      await completeStreaming(fullText, { model: modelConfig.modelId })

      // Async: extract memories in background (non-blocking)
      const sessId = useChatStore.getState().currentSessionId
      if (sessId) {
        extractMemories(text, fullText, sessId, {
          provider: modelConfig.provider,
          baseUrl: modelConfig.baseUrl,
          modelId: modelConfig.modelId,
        }, apiKey).then(() => {
          // Reload memories for next turn
          loadMemories().then(setMemories).catch(() => undefined)
        }).catch(() => undefined)
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        cancelStreaming()
        showToast('发送失败：' + (err?.message ?? '未知错误'))
      }
    }
  }, [
    isStreaming, currentSessionId, createSession, addUserMessage,
    startStreaming, appendStreamToken, completeStreaming, cancelStreaming,
    soulContent, agentsContent, knowledgeIndex, memories, showToast,
  ])

  // ─── Ingest confirm handler (from [[ingest:confirm|json]]) ────────

  const handleIngestConfirm = useCallback(async (data: Record<string, unknown>) => {
    try {
      const store = useModelConfigStore.getState()
      const defaultLlm = store.getDefault('llm')
      const now = new Date().toISOString()
      const ts = Date.now()
      const name = (data.name as string) || '未命名经验'
      const slug = name
        .toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'fragment'
      const id = `atom_frag_${slug}_${ts}`

      const fragment = {
        id,
        schemaVersion: 1 as const,
        kind: 'experience' as const,
        subKind: 'crystallized' as const,
        title: name,
        name,
        insight: (data.insight as string) || '',
        sourceContext: (data.sourceContext as string) || '',
        role: (data.role as string) || '',
        situation: (data.situation as string) || '',
        activity: (data.activity as string) || '',
        insight_type: (data.insight_type as string) || '纯好奇',
        tags: (data.tags as string[]) || [],
        rawContent: '',
        linked_methodologies: [],
        confidence: (data.confidence as number) || 0.8,
        context: { source: 'gui' as const, ingestModel: defaultLlm?.modelId ?? '' },
        private: data.insight_type === '情绪复盘',
        stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
        createdAt: now,
        updatedAt: now,
      }

      await atomsApi.create(fragment)
      showToast('已沉淀到记忆花园')
    } catch (e: any) {
      showToast('保存失败：' + (e?.message ?? ''))
    }
  }, [showToast])

  // ─── Prompt suggestions for welcome screen ─────────────────────────

  const handleSuggestion = useCallback((prompt: string) => {
    handleSend(prompt)
  }, [handleSend])

  const messages = currentSession?.messages ?? []
  const hasTurns = messages.length > 0 || isStreaming

  return (
    <div className="h-full flex flex-col items-center relative overflow-hidden">
      {/* macOS drag region */}
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-[28px] z-10"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      {/* Welcome state — shown when no conversation turns */}
      {!hasTurns && (
        <div className="flex-1 flex flex-col items-center justify-center pb-20 px-6 max-w-2xl w-full">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-20 h-20 rounded-[22px] overflow-hidden mb-6 shadow-xl shadow-violet-500/15 ring-1 ring-black/[0.04] dark:ring-white/10"
          >
            <div className="w-full h-full bg-gradient-to-br from-[#f4f4fc] via-white to-[#ebebf6] dark:from-[#2a2a3e] dark:via-[#1e1e30] dark:to-[#28283c] flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent dark:from-white/5 rounded-[22px]" />
              <img
                src={atomsynLogo}
                alt="Atomsyn"
                className="w-full h-full object-contain drop-shadow-md relative z-[1] scale-[1.25]"
              />
            </div>
          </motion.div>

          {/* Hero tagline */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[1.625rem] font-bold tracking-tight whitespace-nowrap mb-8"
          >
            <span className="bg-gradient-to-r from-neutral-900 to-neutral-600 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent">让你积累的认知</span>
            <span className="bg-gradient-to-r from-violet-600 via-sky-500 to-emerald-500 dark:from-violet-400 dark:via-sky-400 dark:to-emerald-400 bg-clip-text text-transparent ml-1">在需要时醒来。</span>
          </motion.h1>

          {/* Value phrases */}
          <div className="text-center space-y-2.5 mb-10">
            {[
              { text: <>
                <span className="font-semibold tracking-wide text-neutral-800 dark:text-neutral-100" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Atomsyn</span>
                {' '}<span className="font-semibold text-violet-500 dark:text-violet-400">记住</span>你的方法论
              </>, delay: 0.35 },
              { text: <><span className="font-semibold text-sky-500 dark:text-sky-400">发现</span>你的盲区</>, delay: 0.5 },
              { text: <>在你需要时<span className="font-semibold text-emerald-500 dark:text-emerald-400">唤醒</span>它们</>, delay: 0.65 },
            ].map((item, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: item.delay }}
                className="text-[0.8125rem] text-neutral-400 dark:text-neutral-500"
              >
                {item.text}
              </motion.p>
            ))}
          </div>

          {/* Prompt suggestions */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-wrap items-center justify-center gap-2.5 mb-10 max-w-lg"
          >
            {[
              '看看我的知识盲区',
              '复盘上周的实践',
              '推荐调研方法',
            ].map((prompt, i) => (
              <motion.button
                key={prompt}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.85 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => handleSuggestion(prompt)}
                className="group px-4 py-2 rounded-full border border-neutral-200/60 dark:border-white/[0.06] bg-white/40 dark:bg-white/[0.02] hover:border-violet-400/40 dark:hover:border-violet-500/20 hover:bg-violet-500/[0.03] transition-all text-[0.75rem] text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200"
              >
                {prompt}
              </motion.button>
            ))}
          </motion.div>

          {/* V2.x bootstrap-skill (D-009) · 初始化向导入口 */}
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 1.05, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { openWizard(); setWizardOpen(true) }}
            className="group inline-flex items-center gap-1.5 px-4 py-2 mb-6 rounded-full border border-violet-300/50 dark:border-violet-500/30 bg-violet-500/[0.04] dark:bg-violet-500/10 hover:border-violet-500/70 dark:hover:border-violet-400/50 hover:bg-violet-500/10 dark:hover:bg-violet-500/20 transition-all text-[0.75rem] text-violet-700 dark:text-violet-300 font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            初始化向导 · 把硬盘上的笔记导入 Atomsyn
          </motion.button>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.2 }}
            className="text-[0.6875rem] text-neutral-400/60 dark:text-neutral-500/60 italic"
          >
            Atomsyn — it remembers, so you can grow.
          </motion.p>

          {/* API key warning */}
          {!hasApiKey && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="mt-6 rounded-xl border border-amber-300/50 dark:border-amber-400/30 bg-amber-50/80 dark:bg-amber-500/10 p-3 text-xs max-w-lg w-full"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium text-amber-800 dark:text-amber-200">需要配置 API Key</span>
                  {' · '}
                  <span className="text-amber-700/80 dark:text-amber-200/80">在设置中填入后即可对话</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Conversation area */}
      {hasTurns && (
        <div className="flex-1 overflow-hidden w-full mt-[28px]">
          <ChatMessageList
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
            onIngestConfirm={handleIngestConfirm}
            onIngestCancel={() => { /* no-op: card dismisses itself */ }}
          />
        </div>
      )}

      {/* Input area */}
      <div className={cn(
        'shrink-0 w-full max-w-3xl px-6 pb-6',
        !hasTurns && 'absolute bottom-0 left-1/2 -translate-x-1/2'
      )}>
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming}
          placeholder="描述你遇到的问题，Enter 发送 · Shift+Enter 换行"
        />
      </div>

      {/* V2.x bootstrap-skill (D-009) · 初始化向导 modal */}
      <BootstrapWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  )
}

export default ChatPage
