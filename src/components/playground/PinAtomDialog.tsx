import { Check, Pin, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { atomsApi, frameworksApi, projectsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Atom, Framework, InnovationStage, Project, StageColumnId } from '@/types'

// Map a project's innovationStage → the framework column id it represents.
// Both share the same identifier scheme today; kept as a function for clarity
// and future divergence (e.g. an "ideation" project stage that doesn't exist as a column).
const FILTERABLE_STAGES: ReadonlyArray<{ id: StageColumnId; label: string; bg: string; text: string }> = [
  { id: 'discover', label: '发现', bg: 'bg-stage-discover/10', text: 'text-stage-discover' },
  { id: 'define',   label: '定义', bg: 'bg-stage-define/10',   text: 'text-stage-define' },
  { id: 'ideate',   label: '创意', bg: 'bg-stage-ideate/10',   text: 'text-stage-ideate' },
  { id: 'develop',  label: '开发', bg: 'bg-stage-develop/10',  text: 'text-stage-develop' },
  { id: 'validate', label: '验证', bg: 'bg-stage-validate/10', text: 'text-stage-validate' },
  { id: 'evolve',   label: '进化', bg: 'bg-stage-evolve/10',   text: 'text-stage-evolve' },
] as const

function projectStageToColumn(stage: InnovationStage): StageColumnId | null {
  return FILTERABLE_STAGES.some((s) => s.id === stage) ? (stage as StageColumnId) : null
}

interface Props {
  open: boolean
  project: Project
  onClose: () => void
  onUpdated: (p: Project) => void
}

export function PinAtomDialog({ open, project, onClose, onUpdated }: Props) {
  const showToast = useAppStore((s) => s.showToast)
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  // Stage filter: defaults to project's current innovationStage if it maps to a column.
  // 'all' shows everything (escape hatch).
  const initialStage: StageColumnId | 'all' = projectStageToColumn(project.innovationStage) ?? 'all'
  const [stageFilter, setStageFilter] = useState<StageColumnId | 'all'>(initialStage)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setQuery('')
    // Reset to project's current stage each time the dialog is reopened
    setStageFilter(projectStageToColumn(project.innovationStage) ?? 'all')
    setLoading(true)
    Promise.all([atomsApi.list(), frameworksApi.list()])
      .then(([a, f]) => {
        setAtoms(a)
        setFrameworks(f)
      })
      .catch((e) => showToast(`加载失败: ${e.message ?? e}`))
      .finally(() => setLoading(false))
  }, [open, showToast])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pinnedSet = useMemo(
    () => new Set(project.pinnedAtoms.map((p) => p.atomId)),
    [project.pinnedAtoms]
  )

  // Build a quick lookup: (frameworkId, cellId) → column
  const cellColumnIndex = useMemo(() => {
    const m = new Map<string, StageColumnId>()
    for (const f of frameworks) {
      for (const c of f.matrix?.cells ?? []) {
        m.set(`${f.id}::${c.stepNumber}`, c.column as StageColumnId)
      }
    }
    return m
  }, [frameworks])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byFramework = new Map<string, Atom[]>()
    for (const a of atoms) {
      if (stageFilter !== 'all') {
        const col = cellColumnIndex.get(`${a.frameworkId}::${a.cellId}`)
        if (col !== stageFilter) continue
      }
      if (q) {
        const hay = `${a.name} ${a.nameEn ?? ''} ${a.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      const list = byFramework.get(a.frameworkId) ?? []
      list.push(a)
      byFramework.set(a.frameworkId, list)
    }
    return frameworks
      .map((f) => ({ framework: f, atoms: byFramework.get(f.id) ?? [] }))
      .filter((g) => g.atoms.length > 0)
  }, [atoms, frameworks, query, stageFilter, cellColumnIndex])

  if (!open) return null

  const toggle = (id: string) => {
    if (pinnedSet.has(id)) return
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (selected.size === 0) {
      onClose()
      return
    }
    setSubmitting(true)
    try {
      const now = new Date().toISOString()
      const updated: Project = {
        ...project,
        pinnedAtoms: [
          ...project.pinnedAtoms,
          ...Array.from(selected).map((atomId) => ({ atomId, pinnedAt: now })),
        ],
        updatedAt: now,
      }
      const saved = await projectsApi.update(project.id, updated)
      onUpdated(saved)
      showToast(`已引入 ${selected.size} 个原子`)
      onClose()
    } catch (e: any) {
      showToast(`引入失败: ${e.message ?? e}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 shadow-2xl animate-slide-up"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/80 dark:border-neutral-800/80">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <Pin className="w-4 h-4" /> 引入方法论原子
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-neutral-200/80 dark:border-neutral-800/80 space-y-3">
          {/* Stage filter row */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 shrink-0 mr-1">
              阶段
            </span>
            <button
              onClick={() => setStageFilter('all')}
              className={cn(
                'shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors border',
                stageFilter === 'all'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 border-transparent'
                  : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
              )}
            >
              全部
            </button>
            {FILTERABLE_STAGES.map((s) => {
              const isActive = stageFilter === s.id
              const isProjectStage = projectStageToColumn(project.innovationStage) === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setStageFilter(s.id)}
                  className={cn(
                    'shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors border inline-flex items-center gap-1',
                    isActive
                      ? `${s.bg} ${s.text} border-current/30 font-medium`
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
                  )}
                  title={isProjectStage ? '当前项目所在阶段' : undefined}
                >
                  {s.label}
                  {isProjectStage && <span className="w-1 h-1 rounded-full bg-current" />}
                </button>
              )
            })}
          </div>

          {/* Search row */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索原子名称或标签…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-neutral-100/60 dark:bg-neutral-800/60 border border-transparent focus:border-stage-discover/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-subtle px-6 py-4 space-y-5">
          {loading && <div className="text-sm text-neutral-400">加载中…</div>}
          {!loading && grouped.length === 0 && (
            <div className="text-sm text-neutral-400 text-center py-10 space-y-2">
              <div>当前筛选下没有匹配的原子</div>
              {stageFilter !== 'all' && (
                <button
                  onClick={() => setStageFilter('all')}
                  className="text-xs text-violet-500 hover:text-violet-600 font-medium"
                >
                  → 查看全部阶段
                </button>
              )}
            </div>
          )}
          {grouped.map(({ framework, atoms }) => (
            <div key={framework.id}>
              <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-2">
                {framework.name}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {atoms.map((a) => {
                  const isPinned = pinnedSet.has(a.id)
                  const isSelected = selected.has(a.id)
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={isPinned}
                      onClick={() => toggle(a.id)}
                      className={cn(
                        'group flex items-start gap-2 p-3 rounded-xl text-left text-sm border transition-all',
                        isPinned
                          ? 'opacity-50 cursor-not-allowed border-neutral-200/60 dark:border-neutral-800/60 bg-neutral-100/40 dark:bg-neutral-800/30'
                          : isSelected
                            ? 'border-stage-discover/60 bg-stage-discover/10'
                            : 'border-neutral-200/80 dark:border-neutral-800/80 hover:border-stage-discover/40 hover:bg-neutral-50 dark:hover:bg-neutral-800/40'
                      )}
                    >
                      <div
                        className={cn(
                          'mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0',
                          isSelected || isPinned
                            ? 'border-stage-discover bg-stage-discover text-white'
                            : 'border-neutral-300 dark:border-neutral-700'
                        )}
                      >
                        {(isSelected || isPinned) && <Check className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{a.name}</div>
                        {a.tags.length > 0 && (
                          <div className="text-[10px] text-neutral-500 mt-0.5 truncate">
                            {a.tags.slice(0, 4).join(' · ')}
                          </div>
                        )}
                        {isPinned && (
                          <div className="text-[10px] text-stage-discover mt-0.5">已引入</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-neutral-200/80 dark:border-neutral-800/80">
          <div className="text-xs text-neutral-500">已选 {selected.size} 个</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || selected.size === 0}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-stage-discover text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? '保存中…' : `引入 ${selected.size} 个`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
