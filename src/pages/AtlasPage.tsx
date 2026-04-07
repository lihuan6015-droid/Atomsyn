import { useEffect, useMemo, useState } from 'react'
import { Library, ChevronRight, Sparkles, Bot } from 'lucide-react'
import { frameworksApi, indexApi, atomsApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import type { Framework, KnowledgeIndex, Atom } from '@/types'
import { MatrixCell } from '@/components/atlas/MatrixCell'
import { SpotlightPalette } from '@/components/atlas/SpotlightPalette'
import { AgentActivityFeed } from '@/components/growth/AgentActivityFeed'
import { NewAtomDialog } from './NewAtomDialog'

const COLUMN_ORDER = ['discover', 'define', 'ideate', 'develop', 'validate', 'evolve'] as const
const COLUMN_LABELS: Record<string, { en: string; zh: string }> = {
  discover: { en: 'DISCOVER', zh: '发现' },
  define: { en: 'DEFINE', zh: '定义' },
  ideate: { en: 'IDEATE', zh: '创意' },
  develop: { en: 'DEVELOP', zh: '开发' },
  validate: { en: 'VALIDATE', zh: '验证' },
  evolve: { en: 'EVOLVE', zh: '进化' },
}

export default function AtlasPage() {
  const activeFrameworkId = useAppStore((s) => s.activeFrameworkId)
  const [framework, setFramework] = useState<Framework | null>(null)
  const [index, setIndex] = useState<KnowledgeIndex | null>(null)
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [activeTag, setActiveTag] = useState<string>('all')
  const [feedOpen, setFeedOpen] = useState(false)

  useEffect(() => {
    if (!activeFrameworkId) return
    frameworksApi.get(activeFrameworkId).then(setFramework).catch(() => setFramework(null))
  }, [activeFrameworkId])

  useEffect(() => {
    indexApi.get().then(setIndex).catch(() => undefined)
    atomsApi.list().then(setAtoms).catch(() => undefined)
  }, [])

  // Build cell -> atoms map
  const atomsByCell = useMemo(() => {
    const map = new Map<number, Atom[]>()
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

  // Reorder cells row-major (CSS grid is row-major already, but cells JSON is column-major)
  const orderedCells = useMemo(() => {
    if (!framework) return []
    const out: typeof framework.matrix.cells = []
    for (let row = 1; row <= framework.matrix.rows; row++) {
      for (const col of COLUMN_ORDER) {
        const cell = framework.matrix.cells.find((c) => c.column === col && c.row === row)
        if (cell) out.push(cell)
      }
    }
    return out
  }, [framework])

  if (!framework) {
    return (
      <div className="p-10 text-sm text-neutral-500">加载骨架中...</div>
    )
  }

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
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">{framework.name}</h1>
        </div>

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
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono">⌘</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-[10px] font-mono">K</kbd>
          </div>
        </button>
      </div>

      {/* Framework summary card — glass + gradient accent + meta pills */}
      {(framework.description || framework.source) && (
        <div className="relative mt-4 mb-2 rounded-2xl border border-neutral-200/70 dark:border-neutral-800/70 bg-white/60 dark:bg-neutral-900/40 glass overflow-hidden">
          {/* gradient accent strip mirrors the 6 stage colors */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{
              background:
                'linear-gradient(180deg, rgb(var(--stage-discover)), rgb(var(--stage-define)), rgb(var(--stage-ideate)), rgb(var(--stage-develop)), rgb(var(--stage-validate)), rgb(var(--stage-evolve)))',
            }}
          />
          <div className="pl-5 pr-4 py-3.5 flex items-center gap-4 flex-wrap">
            {framework.description && (
              <p className="text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300 flex-1 min-w-[280px]">
                {framework.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              {framework.source && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                  <span className="w-1 h-1 rounded-full bg-violet-400" />
                  {framework.source}
                </span>
              )}
              {framework.version && (
                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200/60 dark:border-neutral-700/60 text-[10px] font-mono text-neutral-500 dark:text-neutral-400">
                  v{framework.version}
                </span>
              )}
              <span className="inline-flex items-center px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-[10px] font-mono text-violet-600 dark:text-violet-400">
                {framework.matrix?.cells?.length ?? 0} 步
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tag Filter Chips */}
      <div className="flex items-center gap-2 mt-6 mb-6 overflow-x-auto scrollbar-hide">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 shrink-0 mr-1">
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

      {/* Column Headers */}
      <div className="grid grid-cols-6 gap-3 mb-3">
        {COLUMN_ORDER.map((col) => (
          <div key={col} className="text-center">
            <div
              className="text-xs font-bold tracking-wider"
              style={{ color: HEX[col] }}
            >
              {COLUMN_LABELS[col].en}
            </div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {COLUMN_LABELS[col].zh}
            </div>
          </div>
        ))}
      </div>

      {/* Matrix */}
      <div className="grid grid-cols-6 gap-3">
        {orderedCells.map((cell, i) => {
          const cellAtoms = atomsByCell.get(cell.stepNumber) ?? []
          // fallback to index counts when atoms not loaded
          const indexCount =
            index?.atoms.filter(
              (a) => a.frameworkId === activeFrameworkId && a.cellId === cell.stepNumber
            ).length ?? 0
          const count = cellAtoms.length || indexCount
          return (
            <MatrixCell
              key={cell.stepNumber}
              cell={cell}
              index={i}
              atomCount={count}
              firstAtomId={cellAtoms[0]?.id}
              atomNames={cellAtoms.map((a) => a.name)}
            />
          )
        })}
      </div>

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

const HEX: Record<string, string> = {
  discover: '#A78BFA',
  define: '#60A5FA',
  ideate: '#34D399',
  develop: '#FBBF24',
  validate: '#FB923C',
  evolve: '#F472B6',
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
      <kbd className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[10px] font-mono">
        {k}
      </kbd>
      {label}
    </div>
  )
}

function Sep() {
  return <div className="w-px h-3 bg-neutral-200 dark:bg-neutral-800" />
}
