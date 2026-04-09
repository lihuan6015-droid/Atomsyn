/**
 * V2.0 M6 Sprint 5 · CrystallizePopover
 *
 * Unified entry point for the note crystallize feature.
 *
 * States:
 * - idle: no cache, no parsing → show "全文提炼" / "选中内容提炼" buttons
 * - loading: LLM call in progress
 * - results: fragments ready for review (from cache or fresh LLM)
 * - error: LLM call failed
 * - empty: LLM returned no fragments
 *
 * Safety: uses `mountedRef` to prevent setState-after-unmount crashes
 * that cause white screens in Tauri when switching notes mid-LLM-call.
 */

import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import {
  Loader2,
  Sparkles,
  Check,
  RotateCcw,
  PackageOpen,
  AlertCircle,
  FileText,
  TextSelect,
  AlertTriangle,
} from 'lucide-react'
import { crystallizeNote, contentHash, type CrystallizeFragment } from '@/lib/crystallize'
import { useModelConfigStore } from '@/stores/useModelConfigStore'
import { atomsApi, notesApi } from '@/lib/dataApi'
import { useNotesStore } from '@/stores/useNotesStore'
import { useAppStore } from '@/stores/useAppStore'
import { getInsightColor } from '@/lib/insightColors'
import { cn } from '@/lib/cn'

// ─── Error boundary to prevent white-screen crash ────────────────────

class CrystallizeErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: ReactNode; onClose: () => void }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message || '未知错误' }
  }
  render() {
    if (this.state.hasError) {
      return createPortal(
        <div className="fixed z-[9999] top-20 right-4 w-[320px] rounded-xl bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-900/50 shadow-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-[0.75rem] font-semibold text-red-600 dark:text-red-400">提炼组件出错</span>
          </div>
          <p className="text-[0.6875rem] text-neutral-500 mb-3">{this.state.error}</p>
          <button
            onClick={this.props.onClose}
            className="px-3 py-1.5 rounded-lg text-[0.6875rem] bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10"
          >
            关闭
          </button>
        </div>,
        document.body,
      )
    }
    return this.props.children
  }
}

// ─── Types ───────────────────────────────────────────────────────────

type Phase = 'init' | 'idle' | 'loading' | 'results' | 'error' | 'empty'

interface CrystallizePopoverProps {
  noteId: string
  fullMarkdown: string
  selectedText?: string
  autoStart?: 'full' | 'selection'
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

function charCount(text: string): number {
  return text.replace(/\s+/g, '').length
}

// ─── Exported wrapper with error boundary ────────────────────────────

export function CrystallizePopover(props: CrystallizePopoverProps) {
  return (
    <CrystallizeErrorBoundary onClose={props.onClose}>
      <CrystallizePopoverInner {...props} />
    </CrystallizeErrorBoundary>
  )
}

// ─── Inner popover ───────────────────────────────────────────────────

function CrystallizePopoverInner({
  noteId,
  fullMarkdown,
  selectedText,
  autoStart,
  anchorRef,
  onClose,
}: CrystallizePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const showToast = useAppStore((s) => s.showToast)
  const updateNote = useNotesStore((s) => s.updateNote)
  const notes = useNotesStore((s) => s.notes)

  const [phase, setPhase] = useState<Phase>('init')
  const [error, setError] = useState<string | null>(null)
  const [fragments, setFragments] = useState<CrystallizeFragment[]>([])
  const [checked, setChecked] = useState<boolean[]>([])
  const [saving, setSaving] = useState(false)
  const [contentChanged, setContentChanged] = useState(false)
  const [crystallizeScope, setCrystallizeScope] = useState<'full' | 'selection' | null>(null)

  // ─── Unmount guard ─────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  /** Safe setState — no-op if unmounted */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function safeSet(setter: (v: any) => void, value: any) {
    if (mountedRef.current) setter(value)
  }

  // ─── Click outside to close ────────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        if (!saving && phase !== 'loading') onClose()
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handle, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handle, true)
    }
  }, [onClose, anchorRef, saving, phase])

  // ─── On mount: check cache, decide initial state ───────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const currentHash = contentHash(fullMarkdown || '')

        // Check cache
        try {
          const cache = await notesApi.getCrystallizeCache(noteId)
          if (cancelled || !mountedRef.current) return

          if (cache && Array.isArray(cache.fragments) && cache.fragments.length > 0) {
            // Filter out malformed fragments (missing required fields)
            const valid = (cache.fragments as any[]).filter(
              (f) => f && typeof f.title === 'string' && f.title,
            )
            if (valid.length > 0) {
              setFragments(valid)
              setChecked(valid.map(() => true))
              setContentChanged(cache.contentHash !== currentHash)
              setCrystallizeScope(cache.scope ?? 'full')
              setPhase('results')
              return
            }
            // Corrupt cache — clear and fall through
            try { await notesApi.clearCrystallizeCache(noteId) } catch { /* */ }
          }
        } catch {
          // No cache or API error — continue
        }

        if (cancelled || !mountedRef.current) return

        // No cache — auto-start or idle
        if (autoStart) {
          await doStartCrystallize(autoStart, cancelled)
        } else {
          safeSet(setPhase, 'idle')
        }
      } catch (e: any) {
        if (!cancelled && mountedRef.current) {
          setError(e?.message ?? '初始化失败')
          setPhase('error')
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Core LLM call ─────────────────────────────────────────────────
  async function doStartCrystallize(scope: 'full' | 'selection', cancelled?: boolean) {
    const content = scope === 'selection' && selectedText ? selectedText : fullMarkdown
    if (!content?.trim()) {
      safeSet(setPhase, 'idle')
      return
    }

    safeSet(setCrystallizeScope, scope)
    safeSet(setPhase, 'loading')
    safeSet(setError, null)
    safeSet(setContentChanged, false)

    const currentHash = contentHash(fullMarkdown || '')

    try {
      const raw = await crystallizeNote(content)
      if (cancelled || !mountedRef.current) return

      // Validate fragments — LLM may return malformed objects
      const result = (Array.isArray(raw) ? raw : []).filter(
        (f: any) => f && typeof f.title === 'string' && f.title,
      )
      setFragments(result)
      setChecked(result.map(() => true))
      setPhase(result.length === 0 ? 'empty' : 'results')

      // Save to cache (non-critical)
      try {
        await notesApi.saveCrystallizeCache(noteId, {
          contentHash: currentHash,
          scope,
          fragments: result,
          createdAt: new Date().toISOString(),
        })
      } catch { /* */ }
    } catch (e: any) {
      if (cancelled || !mountedRef.current) return
      setError(e?.message ?? '提炼失败')
      setPhase('error')
      try { await updateNote(noteId, { crystallizeStatus: 'failed' } as any) } catch { /* */ }
    }
  }

  // ─── User-triggered start ──────────────────────────────────────────
  function handleStart(scope: 'full' | 'selection') {
    doStartCrystallize(scope)
  }

  // ─── Toggle checkbox ───────────────────────────────────────────────
  function toggleCheck(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  const selectedCount = checked.filter(Boolean).length

  // ─── Re-crystallize ────────────────────────────────────────────────
  function handleRecrystallize(scope?: 'full' | 'selection') {
    setFragments([])
    setChecked([])
    doStartCrystallize(scope ?? crystallizeScope ?? 'full')
  }

  // ─── Confirm and save ──────────────────────────────────────────────
  async function handleConfirm() {
    const selected = fragments.filter((_, i) => checked[i])
    if (selected.length === 0) return

    const content = crystallizeScope === 'selection' && selectedText ? selectedText : fullMarkdown
    setSaving(true)
    try {
      const store = useModelConfigStore.getState()
      const defaultLlm = store.getDefault('llm')
      const now = new Date().toISOString()
      const newIds: string[] = []

      for (const frag of selected) {
        const ts = Date.now()
        const slug = frag.title
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40) || 'fragment'
        const id = `atom_frag_${slug}_${ts}`

        await atomsApi.create({
          id,
          schemaVersion: 1,
          kind: 'experience',
          subKind: 'crystallized',
          title: frag.title,
          name: frag.title,
          insight: frag.insight,
          sourceContext: frag.sourceContext,
          role: frag.role,
          situation: frag.situation,
          activity: frag.activity,
          insight_type: frag.insight_type,
          tags: frag.tags,
          rawContent: content,
          linked_methodologies: [],
          confidence: frag.confidence,
          context: {
            source: 'note',
            noteId,
            ingestModel: defaultLlm?.modelId ?? '',
          },
          private: frag.insight_type === '情绪复盘',
          stats: { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
          createdAt: now,
          updatedAt: now,
        } as any)

        newIds.push(id)
        if (selected.length > 1) await new Promise((r) => setTimeout(r, 5))
      }

      if (!mountedRef.current) return

      // Update note meta
      const note = notes.find((n) => n.id === noteId)
      const existingLinked = note?.linkedFragments ?? []
      await updateNote(noteId, {
        crystallizeStatus: 'parsed',
        crystallizedAt: now,
        linkedFragments: [...existingLinked, ...newIds],
      } as any)

      // Clear cache
      try { await notesApi.clearCrystallizeCache(noteId) } catch { /* */ }

      if (mountedRef.current) showToast(`已提炼 ${newIds.length} 条经验碎片`)
      onClose()
    } catch (e: any) {
      if (mountedRef.current) setError(e?.message ?? '保存失败')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  // ─── Position ──────────────────────────────────────────────────────
  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + 6
  const right = window.innerWidth - (rect?.right ?? 0)

  const hasSelection = !!selectedText?.trim()

  return createPortal(
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[9999] w-[380px] max-h-[480px] rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50 flex flex-col"
      style={{ top, right }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-neutral-200/50 dark:border-neutral-800/50 flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-[0.75rem] font-semibold text-neutral-700 dark:text-neutral-300">
          笔记提炼
        </span>
        {phase === 'loading' && (
          <span className="text-[0.625rem] text-amber-500 ml-auto">
            {crystallizeScope === 'selection' ? '选中内容' : '全文'}
          </span>
        )}
      </div>

      {/* Content changed banner */}
      {contentChanged && phase === 'results' && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-[0.6875rem] text-amber-700 dark:text-amber-300 flex-1">
            笔记内容已修改，当前为上次提炼结果
          </span>
          <button
            onClick={() => handleRecrystallize()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[0.625rem] font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> 重新提炼
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Init */}
        {phase === 'init' && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
          </div>
        )}

        {/* Idle */}
        {phase === 'idle' && (
          <div className="space-y-3 py-2">
            <p className="text-[0.6875rem] text-neutral-500 text-center">选择提炼范围</p>
            <button
              onClick={() => handleStart('full')}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-neutral-200/70 dark:border-white/10 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-colors"
            >
              <FileText className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="text-left flex-1">
                <div className="text-[0.75rem] font-medium text-neutral-800 dark:text-neutral-200">全文提炼</div>
                <div className="text-[0.625rem] text-neutral-400">从整篇笔记中提取有价值的认知碎片</div>
              </div>
            </button>
            <button
              onClick={() => handleStart('selection')}
              disabled={!hasSelection}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-neutral-200/70 dark:border-white/10 transition-colors',
                hasSelection
                  ? 'hover:bg-amber-500/5 dark:hover:bg-amber-500/10'
                  : 'opacity-40 cursor-not-allowed',
              )}
            >
              <TextSelect className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="text-left flex-1">
                <div className="text-[0.75rem] font-medium text-neutral-800 dark:text-neutral-200">
                  选中内容提炼
                  {hasSelection && (
                    <span className="text-[0.625rem] text-neutral-400 font-normal ml-1.5">
                      ({charCount(selectedText!)} 字)
                    </span>
                  )}
                </div>
                <div className="text-[0.625rem] text-neutral-400">
                  {hasSelection ? '仅提炼编辑器中选中的文字' : '请先在编辑器中选中文字'}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            <span className="text-[0.75rem] text-neutral-500">
              正在提炼{crystallizeScope === 'selection' ? '选中内容' : '全文'}...
            </span>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-2">
            <div className="rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-2 text-[0.75rem]">
              {error}
            </div>
            <button
              onClick={() => handleRecrystallize()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.6875rem] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5"
            >
              <RotateCcw className="w-3 h-3" /> 重试
            </button>
          </div>
        )}

        {/* Empty */}
        {phase === 'empty' && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <PackageOpen className="w-5 h-5 text-neutral-400" />
            <span className="text-[0.75rem] text-neutral-500">没有发现值得提炼的内容</span>
          </div>
        )}

        {/* Fragment list */}
        {phase === 'results' && fragments.map((frag, i) => {
          const insight = frag.insight ?? frag.sourceContext ?? ''
          const ic = getInsightColor(frag.insight_type ?? '纯好奇')
          return (
            <label
              key={i}
              className={cn(
                'flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors',
                checked[i]
                  ? 'bg-amber-500/5 dark:bg-amber-500/10'
                  : 'bg-neutral-50 dark:bg-neutral-800/30 opacity-60',
              )}
            >
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggleCheck(i)}
                className="mt-0.5 accent-amber-500 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[0.75rem] font-medium text-neutral-800 dark:text-neutral-200 leading-snug">
                  {frag.title}
                </div>
                <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed">
                  {insight.length > 120 ? insight.slice(0, 120) + '...' : insight}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className={cn('px-1.5 py-0.5 rounded-full text-[0.5625rem] font-medium', ic.bg, ic.text, ic.darkBg, ic.darkText)}>
                    {frag.insight_type}
                  </span>
                  {frag.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded-full text-[0.5625rem] bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400">
                      {tag}
                    </span>
                  ))}
                  <span className="text-[0.5625rem] text-neutral-400 ml-auto tabular-nums">
                    {(frag.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </label>
          )
        })}
      </div>

      {/* Footer — results */}
      {phase === 'results' && (
        <div className="px-3 py-2.5 border-t border-neutral-200/50 dark:border-neutral-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg text-[0.6875rem] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            >
              取消
            </button>
            {!contentChanged && (
              <button
                onClick={() => handleRecrystallize()}
                disabled={saving}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[0.6875rem] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
                title="重新提炼"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.6875rem] font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm disabled:opacity-50 hover:scale-[1.02] active:scale-95 transition-transform"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            确认提炼 {selectedCount} 条
          </button>
        </div>
      )}

      {/* Footer — idle / empty */}
      {(phase === 'idle' || phase === 'empty') && (
        <div className="px-3 py-2 border-t border-neutral-200/50 dark:border-neutral-800/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-[0.6875rem] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
          >
            关闭
          </button>
        </div>
      )}
    </motion.div>,
    document.body,
  )
}
