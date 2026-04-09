import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, AlertTriangle } from 'lucide-react'
import { frameworksApi } from '@/lib/dataApi'
import type { FrameworkStats, FrameworkStatsNode } from '@/types'

interface Props {
  frameworkId: string
}

export function CoverageStatsView({ frameworkId }: Props) {
  const [stats, setStats] = useState<FrameworkStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    frameworksApi
      .stats(frameworkId)
      .then(setStats)
      .catch((e) => setError(e.message || '加载统计数据失败'))
      .finally(() => setLoading(false))
  }, [frameworkId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400 dark:text-neutral-500" />
        <span className="ml-2 text-sm text-neutral-400 dark:text-neutral-500">加载统计中...</span>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-neutral-400 dark:text-neutral-500">
        <AlertTriangle className="w-6 h-6 mb-2 opacity-60" />
        <p className="text-sm">{error || '暂无统计数据'}</p>
      </div>
    )
  }

  const maxCount = Math.max(
    ...stats.nodes.map((n) => n.fragmentCount),
    1
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white/60 dark:bg-neutral-900/40 glass overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800/60">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {stats.frameworkName} · 实践覆盖
        </h3>
      </div>

      {/* Bar chart rows */}
      <div className="px-5 py-3 space-y-2.5">
        {stats.nodes.map((node, i) => (
          <StatsRow key={String(node.nodeId)} node={node} maxCount={maxCount} index={i} />
        ))}
      </div>

      {/* Summary footer */}
      <div className="px-5 py-3 border-t border-neutral-100 dark:border-neutral-800/60 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400">覆盖率:</span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {stats.total.coveredNodes}/{stats.total.nodeCount}
          </span>
          <span className="text-[0.6875rem] font-mono text-violet-600 dark:text-violet-400">
            ({stats.total.coveragePercent}%)
          </span>
        </div>
        <div className="w-px h-3 bg-neutral-200 dark:bg-neutral-700" />
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400">总碎片:</span>
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {stats.total.totalFragments}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function StatsRow({
  node,
  maxCount,
  index,
}: {
  node: FrameworkStatsNode
  maxCount: number
  index: number
}) {
  const total = node.fragmentCount
  const barWidth = maxCount > 0 ? (total / maxCount) * 100 : 0
  const isEmpty = total === 0

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.025, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3"
    >
      {/* Label */}
      <div className="w-28 shrink-0 text-right">
        <span className="text-[0.75rem] text-neutral-700 dark:text-neutral-300 truncate block">
          {node.name}
        </span>
      </div>

      {/* Bar */}
      <div className="flex-1 h-5 relative">
        <div className="absolute inset-0 rounded-md bg-neutral-100 dark:bg-neutral-800/60" />
        {total > 0 ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.5, delay: index * 0.025 + 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 top-0 bottom-0 rounded-md bg-violet-500/80 dark:bg-violet-500/70"
          />
        ) : (
          <div className="absolute inset-0 rounded-md border border-dashed border-amber-400/60 dark:border-amber-500/40" />
        )}
      </div>

      {/* Count label */}
      <div className="w-20 shrink-0 flex items-center gap-1.5">
        <span
          className={
            'text-[0.75rem] font-semibold tabular-nums ' +
            (isEmpty
              ? 'text-neutral-400 dark:text-neutral-500'
              : 'text-neutral-700 dark:text-neutral-300')
          }
        >
          {total} 碎片
        </span>
        {isEmpty && (
          <span className="text-[0.625rem] text-amber-500 dark:text-amber-400">空白</span>
        )}
      </div>
    </motion.div>
  )
}
