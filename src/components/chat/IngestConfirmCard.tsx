/**
 * V2.x · IngestConfirmCard — confirmation card when AI suggests ingesting an experience.
 *
 * Shows title, insight preview, role/situation chips, insight_type chip,
 * and confirm/cancel buttons. Uses the project's violet accent style.
 */

import { motion } from 'framer-motion'
import { Sparkles, Loader2 } from 'lucide-react'
import { getInsightColor } from '@/lib/insightColors'
import { cn } from '@/lib/cn'

interface IngestData {
  name: string
  insight: string
  sourceContext?: string
  role?: string
  situation?: string
  activity?: string
  insight_type?: string
  tags?: string[]
  confidence?: number
}

interface IngestConfirmCardProps {
  data: IngestData
  onConfirm: () => void
  onCancel: () => void
  saving?: boolean
}

export function IngestConfirmCard({ data, onConfirm, onCancel, saving }: IngestConfirmCardProps) {
  const ic = data.insight_type ? getInsightColor(data.insight_type) : null
  const truncatedInsight =
    data.insight.length > 150 ? data.insight.slice(0, 150) + '...' : data.insight

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'rounded-xl border-l-2 border border-neutral-200/60 dark:border-white/8',
        'border-l-violet-500 dark:border-l-violet-400',
        'bg-white/90 dark:bg-white/[0.03]',
        'p-4 space-y-3',
        'shadow-sm',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-violet-500 dark:text-violet-400 shrink-0" />
        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">
          {data.name}
        </span>
        {data.confidence != null && (
          <span className="ml-auto text-[0.625rem] font-mono text-neutral-400 dark:text-neutral-500">
            {Math.round(data.confidence * 100)}%
          </span>
        )}
      </div>

      {/* Insight preview */}
      <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {truncatedInsight}
      </p>

      {/* Chips row */}
      <div className="flex flex-wrap gap-1.5">
        {data.role && (
          <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-medium bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            {data.role}
          </span>
        )}
        {data.situation && (
          <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-medium bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            {data.situation}
          </span>
        )}
        {ic && data.insight_type && (
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[0.625rem] font-medium font-mono',
              ic.bg, ic.text, ic.darkBg, ic.darkText,
            )}
          >
            {data.insight_type}
          </span>
        )}
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded text-[0.625rem] text-neutral-500 dark:text-neutral-500 bg-neutral-100 dark:bg-white/5"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'bg-gradient-to-r from-violet-500 to-violet-600',
            'text-white shadow-sm',
            'hover:from-violet-600 hover:to-violet-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200',
          )}
        >
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              沉淀中...
            </>
          ) : (
            '确认沉淀'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-medium',
            'border border-neutral-200 dark:border-white/10',
            'text-neutral-600 dark:text-neutral-400',
            'hover:bg-neutral-50 dark:hover:bg-white/5',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200',
          )}
        >
          取消
        </button>
      </div>
    </motion.div>
  )
}
