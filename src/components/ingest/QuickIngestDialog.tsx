/**
 * V2.0 M2 · Quick Ingest Dialog — human-facing knowledge ingestion.
 *
 * User inputs raw text → calls M1 default LLM with classify.md prompt →
 * shows classification preview → user confirms → writes fragment via API.
 *
 * This component is standalone for M2; M3 will wire it into Memory Garden "+".
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  X,
  Check,
  RotateCcw,
  Pen,
} from 'lucide-react'
import { useModelConfigStore, getModelApiKey } from '@/stores/useModelConfigStore'
import { getStoredApiKey } from '@/lib/llmClient'
import { atomsApi } from '@/lib/dataApi'
import { getInsightColor } from '@/lib/insightColors'
import { cn } from '@/lib/cn'
import type { InsightType } from '@/types'
import Anthropic from '@anthropic-ai/sdk'

interface Props {
  open: boolean
  onClose: () => void
  onIngested?: (atomId: string) => void
}

interface ClassifyResult {
  title: string
  insight: string
  sourceContext: string
  role: string
  situation: string
  activity: string
  insight_type: InsightType
  tags: string[]
  confidence: number
}

// Load classify prompt from the project
const CLASSIFY_PROMPT_URL = '/scripts/ingest/prompts/classify.md'
let cachedPrompt: string | null = null

async function loadClassifyPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt
  try {
    const res = await fetch(CLASSIFY_PROMPT_URL)
    if (res.ok) {
      cachedPrompt = await res.text()
      return cachedPrompt
    }
  } catch { /* fallback */ }
  return 'Classify the following text into a structured knowledge fragment. Return JSON with: title, insight, sourceContext, role, situation, activity, insight_type (one of: 反直觉/方法验证/方法证伪/情绪复盘/关系观察/时机判断/原则提炼/纯好奇), tags, confidence.'
}

async function callLlmClassify(rawText: string): Promise<ClassifyResult> {
  const store = useModelConfigStore.getState()
  const defaultLlm = store.getDefault('llm')
  if (!defaultLlm) throw new Error('请先在设置中配置一个 LLM 模型')

  const apiKey = getModelApiKey(defaultLlm.id) || getStoredApiKey()
  if (!apiKey) throw new Error('请先在设置中填入 API Key')

  const systemPrompt = await loadClassifyPrompt()

  // Dynamically fetch and append existing taxonomy to the prompt
  let dynamicTaxonomy = ''
  try {
    const allAtoms = await atomsApi.list() as any[]
    const roles = new Set<string>()
    const situations = new Set<string>()
    const activities = new Set<string>()
    const insightTypes = new Set<string>()
    
    for (const a of allAtoms) {
      if (a.role) roles.add(a.role)
      if (a.situation) situations.add(a.situation)
      if (a.activity) activities.add(a.activity)
      if (a.insight_type) insightTypes.add(a.insight_type)
    }
    
    dynamicTaxonomy = `
### Existing Dimension Values
To avoid creating semantically duplicated categories, please prioritize these existing values if they fit the context:
- roles: ${Array.from(roles).join(', ')}
- situations: ${Array.from(situations).join(', ')}
- activities: ${Array.from(activities).join(', ')}
- insight_types: ${Array.from(insightTypes).join(', ')}
`
  } catch (e) { /* ignore if data api fails to list */ }

  const userContent = systemPrompt + '\n' + dynamicTaxonomy + '\n\n' + rawText

  let rawJson = ''

  if (defaultLlm.provider === 'anthropic') {
    const client = new Anthropic({
      apiKey,
      baseURL: defaultLlm.baseUrl || undefined,
      dangerouslyAllowBrowser: true,
    })
    const resp = await client.messages.create({
      model: defaultLlm.modelId,
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: 'user', content: userContent }],
    })
    rawJson = resp.content
      .map((b: any) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim()
  } else {
    const baseUrl = (defaultLlm.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: defaultLlm.modelId,
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
    const data: any = await res.json()
    rawJson = data?.choices?.[0]?.message?.content ?? ''
  }

  // Strip markdown fences if present
  let cleaned = rawJson.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  return JSON.parse(cleaned) as ClassifyResult
}

export function QuickIngestDialog({ open, onClose, onIngested }: Props) {
  const [rawText, setRawText] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [result, setResult] = useState<ClassifyResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClassify() {
    if (!rawText.trim()) return
    setClassifying(true)
    setError(null)
    setResult(null)
    try {
      const r = await callLlmClassify(rawText.trim())
      setResult(r)
    } catch (e: any) {
      setError(e?.message ?? '分类失败')
    } finally {
      setClassifying(false)
    }
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    setError(null)
    try {
      const store = useModelConfigStore.getState()
      const defaultLlm = store.getDefault('llm')
      const now = new Date().toISOString()
      const ts = Date.now()
      const slug = result.title
        .toLowerCase()
        .normalize('NFKD')
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
        title: result.title,
        name: result.title,
        insight: result.insight,
        sourceContext: result.sourceContext,
        role: result.role,
        situation: result.situation,
        activity: result.activity,
        insight_type: result.insight_type,
        tags: result.tags,
        rawContent: rawText,
        linked_methodologies: [],
        confidence: result.confidence,
        context: {
          source: 'gui' as const,
          ingestModel: defaultLlm?.modelId ?? '',
        },
        private: result.insight_type === '情绪复盘',
        stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
        createdAt: now,
        updatedAt: now,
      }

      await atomsApi.create(fragment)
      onIngested?.(id)
      // Reset
      setRawText('')
      setResult(null)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setResult(null)
    setError(null)
  }

  const springTransition = { type: 'spring' as const, stiffness: 400, damping: 30 }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />
          <div className="absolute inset-0 flex items-start justify-center pt-[8vh] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={springTransition}
              className="w-[580px] max-h-[80vh] overflow-y-auto rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-2xl pointer-events-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-3">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  快速沉淀
                </h2>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 pb-6 space-y-4">
                {/* Input */}
                <div>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="粘贴你的笔记、灵感、踩坑记录……LLM 会帮你分类"
                    rows={5}
                    className="w-full rounded-xl bg-white dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
                    disabled={classifying || saving}
                  />
                  <p className="text-[0.6875rem] text-neutral-400 mt-1">
                    未来将支持 URL 和图片输入
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 px-4 py-2.5 text-sm">
                    {error}
                  </div>
                )}

                {/* Classification preview */}
                {result && (
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 dark:bg-violet-500/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                        分类预览
                      </span>
                      <span className="text-[0.625rem] text-neutral-500 font-mono">
                        confidence: {(result.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-sm font-medium">{result.title}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-300"><b>背景:</b> {result.sourceContext}</div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-300"><b>洞察:</b> {result.insight.length > 200 ? result.insight.slice(0, 200) + '...' : result.insight}</div>
                    <div className="flex flex-wrap gap-1.5">
                      <Chip label={result.role} color="sky" />
                      <Chip label={result.situation} color="emerald" />
                      <Chip label={result.activity} color="amber" />
                      {(() => {
                        const ic = getInsightColor(result.insight_type)
                        return (
                          <span className={cn('px-2 py-0.5 rounded-full text-[0.6875rem] font-medium', ic.bg, ic.text, ic.darkBg, ic.darkText)}>
                            {result.insight_type}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {result.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full text-[0.625rem] bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  {!result ? (
                    <button
                      onClick={handleClassify}
                      disabled={!rawText.trim() || classifying}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/20 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
                    >
                      {classifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {classifying ? 'AI 分类中…' : '分类'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white text-sm shadow-lg shadow-violet-500/20 disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        确认沉淀
                      </button>
                      <button
                        onClick={handleReset}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-300/70 dark:border-white/10 text-sm hover:bg-neutral-100 dark:hover:bg-white/5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> 重新分类
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

function Chip({ label, color }: { label: string; color: 'sky' | 'emerald' | 'amber' }) {
  const styles = {
    sky: 'bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    amber: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  }
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[0.6875rem] font-medium', styles[color])}>
      {label}
    </span>
  )
}
