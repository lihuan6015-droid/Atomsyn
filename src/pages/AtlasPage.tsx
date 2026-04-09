import { useEffect, useMemo, useState } from 'react'
import { Library, ChevronRight, Sparkles, Bot, BarChart3, Pencil, Plus } from 'lucide-react'
import { frameworksApi, indexApi, atomsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Framework, KnowledgeIndex, Atom } from '@/types'
import { isMatrixFramework, isListFramework, isTreeFramework } from '@/types'
import { MatrixCell } from '@/components/atlas/MatrixCell'
import { ListFrameworkView } from '@/components/framework/ListFrameworkView'
import { TreeFrameworkView } from '@/components/framework/TreeFrameworkView'
import { CoverageStatsView } from '@/components/framework/CoverageStatsView'
import { SpotlightPalette } from '@/components/atlas/SpotlightPalette'
import { AgentActivityFeed } from '@/components/growth/AgentActivityFeed'
import { NewAtomDialog } from './NewAtomDialog'


export default function AtlasPage() {
  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [index, setIndex] = useState<KnowledgeIndex | null>(null)
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [activeTag, setActiveTag] = useState<string>('all')
  const [feedOpen, setFeedOpen] = useState(false)
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    if (!activeFrameworkId) return
    frameworksApi.get(activeFrameworkId).then(setFramework).catch(() => setFramework(null))
  }, [activeFrameworkId])

  useEffect(() => {
    indexApi.get().then(setIndex).catch(() => undefined)
    atomsApi.list().then(setAtoms).catch(() => undefined)
  }, [])

  // Refresh atoms/index when atoms are created or deleted elsewhere
  useEffect(() => {
    const refresh = () => {
      atomsApi.list().then(setAtoms).catch(() => undefined)
      indexApi.get().then(setIndex).catch(() => undefined)
    }
    window.addEventListener('atomsyn:atoms-changed', refresh)
    return () => window.removeEventListener('atomsyn:atoms-changed', refresh)
  }, [])

  // Build cell -> atoms map
  const atomsByCell = useMemo(() => {
    const map = new Map<number | string, Atom[]>()
    for (const a of atoms) {
      if (a.frameworkId !== activeFrameworkId) continue
      if (activeTag !== 'all' && !a.tags.includes(activeTag)) continue
      const list = map.get(a.cellId) ?? []
      list.push(a)
      map.set(a.cellId, list)
    }
    return map
  }, [atoms, activeFrameworkId, activeTag])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    atoms.filter((a) => a.frameworkId === activeFrameworkId).forEach((a) => a.tags.forEach((t) => s.add(t)))
    return Array.from(s)
  }, [atoms, activeFrameworkId])

  if (!framework) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-neutral-400 dark:text-neutral-500">
        <p className="text-sm">加载骨架中...</p>
        <p className="text-xs mt-2 opacity-60">如果长时间未加载，该方法库可能已被删除</p>
      </div>
    )
  }

  // --- Derive node count label for summary card ---
  const nodeCountLabel = isMatrixFramework(framework)
    ? `${framework.matrix?.cells?.length ?? 0} 步`
    : isListFramework(framework)
      ? `${framework.list?.categories?.length ?? 0} 类`
      : '树形'

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-6 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            <Library className="w-3 h-3" />
            <span>知识图书馆</span>
            <ChevronRight className="w-3 h-3" />
            <span>{framework.name}</span>
          </div>
          <h1 className="text-[1.75rem] font-bold tracking-tight leading-tight">{framework.name}</h1>
        </div>

        {/* Edit button */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('atomsyn:edit-framework', { detail: { frameworkId: framework.id } }))}
          className="flex items-center gap-2 px-3 h-9 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 hover:border-violet-400 dark:hover:border-violet-500 transition-colors shrink-0"
          title="编辑方法库"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span>编辑</span>
        </button>

        {/* Stats toggle button */}
        <button
          onClick={() => setShowStats((v) => !v)}
          className={
            'flex items-center gap-2 px-3 h-9 rounded-xl border text-xs transition-colors shrink-0 ' +
            (showStats
              ? 'border-violet-400 dark:border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400'
              : 'border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:border-violet-400 dark:hover:border-violet-500')
          }
          title="覆盖统计"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span>统计</span>
        </button>

        <button
          onClick={() => setFeedOpen(true)}
          className="flex items-center gap-2 px-3 h-9 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 text-xs text-neutral-500 dark:text-neutral-400 hover:border-violet-400 dark:hover:border-violet-500 transition-colors shrink-0"
          title="Agent 活动"
        >
          <Bot className="w-3.5 h-3.5 text-violet-500" />
          <span>Agent 活动</span>
        </button>

        <button
          onClick={() => window.dispatchEvent(new CustomEvent('ccl:open-spotlight'))}
          className="flex items-center gap-2 px-3.5 h-9 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/60 text-xs text-neutral-400 dark:text-neutral-500 hover:border-violet-400 dark:hover:border-violet-500 transition-colors min-w-[280px] shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <span>描述你现在的痛点场景...</span>
          <div className="ml-auto flex items-center gap-0.5">
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[0.625rem] font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[0.625rem] font-mono">K</kbd>
          </div>
        </button>
      </div>

      {/* Framework summary card — glass + gradient accent + meta pills */}
      {(framework.description || framework.source) && (
        <div className="relative mt-4 mb-2 rounded-2xl border border-neutral-200/70 dark:border-neutral-800/70 bg-white/60 dark:bg-neutral-900/40 glass overflow-hidden">
          {/* gradient accent strip */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{
              background: isMatrixFramework(framework)
                ? 'linear-gradient(180deg, rgb(var(--stage-discover)), rgb(var(--stage-define)), rgb(var(--stage-ideate)), rgb(var(--stage-develop)), rgb(var(--stage-validate)), rgb(var(--stage-evolve)))'
                : 'linear-gradient(180deg, #A78BFA, #60A5FA, #34D399)',
            }}
          />
          <div className="pl-5 pr-4 py-3.5 flex items-center gap-4 flex-wrap">
            {framework.description && (
              <p className="text-[0.8125rem] leading-relaxed text-neutral-700 dark:text-neutral-300 flex-1 min-w-[280px]">
                {framework.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {framework.source && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-[0.625rem] font-medium text-neutral-600 dark:text-neutral-300">
                  <span className="w-1 h-1 rounded-full bg-violet-400" />
                  {framework.source}
                </span>
              )}
              {framework.version && (
                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-[0.625rem] font-mono text-neutral-500 dark:text-neutral-400">
                  v{framework.version}
                </span>
              )}
              <span className="inline-flex items-center px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[0.625rem] font-mono text-violet-600 dark:text-violet-400">
                {nodeCountLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Stats view (toggle) */}
      {showStats ? (
        <div className="mt-6">
          <CoverageStatsView frameworkId={framework.id} />
        </div>
      ) : (
        <>
          {/* Tag Filter Chips */}
          <div className="flex items-center gap-2 mt-6 mb-6 overflow-x-auto scrollbar-hide">
            <div className="text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 shrink-0 mr-1">
              标签
            </div>
            <TagChip active={activeTag === 'all'} onClick={() => setActiveTag('all')}>
              全部
            </TagChip>
            {allTags.map((t) => (
              <TagChip key={t} active={activeTag === t} onClick={() => setActiveTag(t)}>
                {t}
              </TagChip>
            ))}
          </div>

          {/* Layout-specific rendering */}
          {isListFramework(framework) && (
            <ListFrameworkView framework={framework} atoms={atoms} />
          )}

          {isTreeFramework(framework) && (
            <TreeFrameworkView framework={framework} atoms={atoms} />
          )}

          {isMatrixFramework(framework) && (
            <>
              {/* Column Headers */}
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `repeat(${framework.matrix.columnHeaders.length}, minmax(0, 1fr))` }}>
                {framework.matrix.columnHeaders.map((header) => (
                  <div key={header.id} className="text-center">
                    <div
                      className="text-xs font-bold tracking-wider"
                      style={{ color: header.color }}
                    >
                      {header.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Matrix */}
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${framework.matrix.columnHeaders.length}, minmax(0, 1fr))` }}>
                {Array.from({ length: framework.matrix.rows }, (_, rowIdx) =>
                  framework.matrix.columnHeaders.map((header) => {
                    const row = rowIdx + 1
                    const cell = framework.matrix.cells.find((c) => c.row === row && c.column === header.id)
                    if (cell) {
                      const cellAtoms = atomsByCell.get(cell.stepNumber) ?? []
                      const indexCount =
                        index?.atoms.filter(
                          (a) => a.frameworkId === activeFrameworkId && a.cellId === cell.stepNumber
                        ).length ?? 0
                      const count = cellAtoms.length || indexCount
                      return (
                        <MatrixCell
                          key={cell.stepNumber}
                          cell={cell}
                          index={cell.stepNumber}
                          atomCount={count}
                          firstAtomId={cellAtoms[0]?.id}
                          atomNames={cellAtoms.map((a) => a.name)}
                          frameworkId={framework.id}
                          columnColor={header.color}
                        />
                      )
                    }
                    // Empty placeholder for sparse matrix
                    return (
                      <div
                        key={`empty-${row}-${header.id}`}
                        className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 min-h-[120px] flex items-center justify-center"
                      >
                        <button
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('ccl:open-new-atom', { detail: { frameworkId: framework.id } })
                            )
                          }
                          className="text-neutral-300 dark:text-neutral-600 hover:text-violet-400 transition-colors"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Hint Banner */}
      <div className="mt-10 flex items-center justify-center gap-3 text-xs text-neutral-400 dark:text-neutral-500">
        <Hint k="⌘K" label="搜索" />
        <Sep />
        <Hint k="⌘J" label="AI 副驾驶" />
        <Sep />
        <Hint k="N" label="新建原子" />
      </div>

      <SpotlightPalette />
      <NewAtomDialog />
      <AgentActivityFeed open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  )
}

function TagChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={
        'shrink-0 px-2.5 py-1 rounded-full text-xs transition-colors border ' +
        (active
          ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium border-violet-500/20'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-500 dark:text-neutral-400 border-transparent')
      }
    >
      {children}
    </button>
  )
}

function Hint({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[0.625rem] font-mono">
        {k}
      </kbd>
      {label}
    </div>
  )
}

function Sep() {
  return <div className="w-px h-3 bg-neutral-200 dark:bg-neutral-800" />
}
