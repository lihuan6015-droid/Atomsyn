/**
 * AI Copilot side panel.
 * Slides in from the right; chat with the methodology navigator.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pin, PinOff, Send, Sparkles, X, ArrowRight, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/useAppStore'
import { indexApi, trackUsage } from '@/lib/dataApi'
import {
  callCopilot,
  getStoredApiKey,
  type CopilotResponse,
} from '@/lib/llmClient'
import type { KnowledgeIndex } from '@/types'

interface ChatTurn {
  id: string
  role: 'user' | 'ai'
  text?: string
  ai?: CopilotResponse
}

export function CopilotPanel() {
  const open = useAppStore((s) => s.copilotOpen)
  const close = useAppStore((s) => s.closeCopilot)
  const navigate = useNavigate()

  const [pinned, setPinned] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [knowledgeIndex, setKnowledgeIndex] = useState<KnowledgeIndex | null>(null)
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => !!getStoredApiKey())
  const [indexError, setIndexError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // Load index once on first open
  useEffect(() => {
    if (!open || knowledgeIndex) return
    indexApi
      .get()
      .then((idx) => {
        setKnowledgeIndex(idx)
        setIndexError(null)
      })
      .catch((err) => {
        setIndexError(err?.message ?? '索引加载失败')
      })
  }, [open, knowledgeIndex])

  // Re-check api key when panel opens
  useEffect(() => {
    if (open) setHasApiKey(!!getStoredApiKey())
  }, [open])

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pinned) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, pinned, close])

  // autoscroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turns, busy])

  async function handleSend() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const userTurn: ChatTurn = { id: 'u-' + Date.now(), role: 'user', text }
    setTurns((t) => [...t, userTurn])
    setBusy(true)
    trackUsage({ type: 'copilot-query', meta: { length: text.length } })
    const resp = await callCopilot({
      userMessage: text,
      knowledgeIndex,
      currentProjectContext: null,
    })
    setTurns((t) => [...t, { id: 'a-' + Date.now(), role: 'ai', ai: resp }])
    setBusy(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function openAtom(atomId: string) {
    navigate(`/atoms/${atomId}`)
    if (!pinned) close()
  }

  // Look up atom name from index for nicer recommendation cards
  function atomName(atomId: string): string {
    return knowledgeIndex?.atoms.find((a) => a.id === atomId)?.name ?? atomId
  }
  function atomTagline(atomId: string): string {
    const a = knowledgeIndex?.atoms.find((a) => a.id === atomId)
    return a?.tagline ?? a?.whenToUse ?? ''
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {!pinned && (
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            />
          )}
          <motion.aside
            key="panel"
            initial={{ x: '100%', opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] flex flex-col
                       bg-white/85 dark:bg-[#0a0a0b]/85 glass
                       border-l border-neutral-200/60 dark:border-white/10
                       shadow-2xl shadow-black/20"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/60 dark:border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold">方法论副驾驶</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    场景导航 · 只读模式
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPinned((p) => !p)}
                  className="p-1.5 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors"
                  title={pinned ? '取消钉住' : '钉住面板'}
                >
                  {pinned ? (
                    <PinOff className="w-4 h-4" />
                  ) : (
                    <Pin className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={close}
                  className="p-1.5 rounded-lg hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors"
                  title="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Body */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto scrollbar-subtle px-4 py-4 space-y-4"
            >
              {!hasApiKey && (
                <div className="rounded-xl border border-amber-300/50 dark:border-amber-400/30 bg-amber-50/80 dark:bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-medium text-amber-800 dark:text-amber-200">
                        AI 副驾驶尚未配置
                      </div>
                      <div className="text-amber-700/80 dark:text-amber-200/80 mt-0.5 text-xs">
                        填入 API Key 后即可对话。
                      </div>
                      <button
                        onClick={() => {
                          navigate('/settings')
                          if (!pinned) close()
                        }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline"
                      >
                        去设置 → AI 副驾驶 配置 <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {indexError && (
                <div className="text-xs text-red-500">索引加载失败：{indexError}</div>
              )}

              {turns.length === 0 && (
                <div className="rounded-2xl border border-dashed border-neutral-300/60 dark:border-white/10 p-4 text-sm text-neutral-600 dark:text-neutral-300">
                  <div className="text-2xl mb-2">👋</div>
                  我能帮你在迷茫时快速找到该用哪个方法论。
                  <div className="mt-2 text-xs text-neutral-500">
                    试试问我：「我要做用户调研，该用什么？」
                  </div>
                </div>
              )}

              {turns.map((t) =>
                t.role === 'user' ? (
                  <div key={t.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-500 text-white px-3 py-2 text-sm shadow-md shadow-violet-500/20">
                      {t.text}
                    </div>
                  </div>
                ) : (
                  <div key={t.id} className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 px-3 py-2 text-sm space-y-2">
                      {t.ai?.message && <div>{t.ai.message}</div>}
                      {t.ai?.recommendations && t.ai.recommendations.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          {t.ai.recommendations.map((r) => (
                            <div
                              key={r.atomId}
                              className="rounded-xl bg-white dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 p-2.5"
                            >
                              <div className="text-[13px] font-medium leading-snug">
                                {atomName(r.atomId)}
                              </div>
                              {atomTagline(r.atomId) && (
                                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                                  {atomTagline(r.atomId)}
                                </div>
                              )}
                              {r.reason && (
                                <div className="text-[11px] text-violet-600 dark:text-violet-300 mt-1">
                                  {r.reason}
                                </div>
                              )}
                              <button
                                onClick={() => openAtom(r.atomId)}
                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-300 hover:underline"
                              >
                                打开这张卡片 <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {t.ai?.followUp && (
                        <div className="text-[11px] italic text-neutral-500 dark:text-neutral-400 pt-1">
                          {t.ai.followUp}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/5 px-3 py-2 text-sm text-neutral-500">
                    <span className="inline-flex gap-1">
                      <span className="animate-pulse">●</span>
                      <span className="animate-pulse [animation-delay:120ms]">●</span>
                      <span className="animate-pulse [animation-delay:240ms]">●</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <footer className="border-t border-neutral-200/60 dark:border-white/10 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="描述你遇到的问题，Enter 发送 · Shift+Enter 换行"
                  className="flex-1 resize-none rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 scrollbar-subtle"
                />
                <button
                  onClick={handleSend}
                  disabled={busy || !input.trim()}
                  className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform"
                  title="发送"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export default CopilotPanel
