import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { FrameworkCell, StageColumnId } from '@/types'

const STAGE_HEX: Record<string, { hex: string; glow: string }> = {
  discover: { hex: '#A78BFA', glow: 'rgba(167,139,250,0.35)' },
  define: { hex: '#60A5FA', glow: 'rgba(96,165,250,0.35)' },
  ideate: { hex: '#34D399', glow: 'rgba(52,211,153,0.35)' },
  develop: { hex: '#FBBF24', glow: 'rgba(251,191,36,0.35)' },
  validate: { hex: '#FB923C', glow: 'rgba(251,146,60,0.35)' },
  evolve: { hex: '#F472B6', glow: 'rgba(244,114,182,0.35)' },
}

interface Props {
  cell: FrameworkCell
  index: number
  atomCount: number
  firstAtomId?: string
  atomNames?: string[]
  frameworkId?: string
  columnColor?: string
}

export function MatrixCell({ cell, index, atomCount, firstAtomId, atomNames = [], frameworkId, columnColor }: Props) {
  const fallback = STAGE_HEX[cell.column as StageColumnId] || STAGE_HEX.discover
  const c = columnColor
    ? { hex: columnColor, glow: columnColor.replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgba(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)},0.35)`) }
    : fallback
  const featured = cell.featured
  const hasAtoms = atomCount > 0 && firstAtomId

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.625rem] font-mono font-semibold tracking-wider text-neutral-400 dark:text-neutral-500">
            STEP
          </span>
          <span className="text-lg font-bold tabular-nums" style={{ color: c.hex }}>
            {String(cell.stepNumber).padStart(2, '0')}
          </span>
        </div>
        {atomCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/50 dark:border-neutral-700/50">
            <span className="w-1 h-1 rounded-full" style={{ background: c.hex }} />
            <span className="text-[0.625rem] font-semibold tabular-nums" style={{ color: c.hex }}>
              {atomCount}
            </span>
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
          {cell.name}
        </div>
        <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-tight truncate">
          {cell.nameEn}
        </div>
        {cell.tagline ? (
          <div className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 mt-1.5 truncate font-mono">
            {cell.tagline}
          </div>
        ) : (
          <div className="text-[0.625rem] mt-1.5">&nbsp;</div>
        )}
      </div>

      {hasAtoms && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10">
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId, cellId: cell.stepNumber } }))
            }}
            className="w-5 h-5 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-center text-neutral-400 hover:text-violet-500 hover:border-violet-300 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
          <div className="w-5 h-5 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
            <span className="text-[0.625rem]">{'\u2192'}</span>
          </div>
        </div>
      )}

      {!hasAtoms && (
        <button
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            window.dispatchEvent(new CustomEvent('ccl:open-new-atom', { detail: { frameworkId, cellId: cell.stepNumber } }))
          }}
        >
          <div className="flex items-center gap-0.5 px-1.5 h-5 rounded-md bg-white dark:bg-neutral-800 shadow-lg border border-neutral-200 dark:border-neutral-700 text-[0.625rem] text-neutral-500 hover:text-violet-500 hover:border-violet-300 transition-colors">
            <Plus className="w-2.5 h-2.5" /> 添加
          </div>
        </button>
      )}

      {featured && (
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-emerald-400/20 blur-2xl" />
      )}

      {/* Hover preview tooltip (US-05) */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-2 w-56 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/95 dark:bg-neutral-900/95 glass shadow-2xl p-3 text-left">
          <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mb-1.5">
            {cell.tagline || cell.nameEn}
          </div>
          {atomNames.length > 0 ? (
            <ul className="space-y-0.5">
              {atomNames.slice(0, 5).map((n) => (
                <li
                  key={n}
                  className="text-[0.6875rem] text-neutral-700 dark:text-neutral-300 truncate"
                >
                  · {n}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[0.6875rem] text-neutral-400">暂无原子</div>
          )}
        </div>
      </div>
    </>
  )

  const className = cn(
    'cell-glow group relative block rounded-2xl border transition-all duration-300 p-4 h-[132px] flex flex-col justify-between overflow-hidden',
    featured
      ? 'border-transparent bg-gradient-to-br from-emerald-400/20 via-emerald-500/10 to-transparent ring-1 ring-emerald-400/30 dark:ring-emerald-400/40'
      : 'border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40 hover:border-neutral-300 dark:hover:border-neutral-700',
    hasAtoms ? 'cursor-pointer' : 'cursor-default'
  )

  const style = { ['--glow-color' as string]: c.glow } as React.CSSProperties

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.015, ease: [0.16, 1, 0.3, 1] }}
    >
      {hasAtoms && firstAtomId ? (
        <Link to={`/atom/atoms/${firstAtomId}`} className={className} style={style}>
          {inner}
        </Link>
      ) : (
        <div className={className} style={style}>
          {inner}
        </div>
      )}
    </motion.div>
  )
}
