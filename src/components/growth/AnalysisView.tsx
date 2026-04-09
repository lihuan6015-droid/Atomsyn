/**
 * AnalysisView — AI 分析 tab (P1 · §3 记忆花园 AI 复盘)
 *
 * Renders four data cards (no LLM required) + a "Generate Report" CTA
 * + historical report list. All statistics come from /api/analysis/*.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  Clock,
  FileText,
  Flame,
  Grid3X3,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { analysisApi } from '@/lib/dataApi'
import type {
  AnalysisReport,
  CoverageAnalysis,
  DimensionAnalysis,
  GapAnalysis,
  TimelineAnalysis,
} from '@/types'
import { cn } from '@/lib/cn'
import { ReportViewer } from './ReportViewer'

const EASE = [0.16, 1, 0.3, 1] as const

export function AnalysisView() {
  const navigate = useNavigate()
  const [dimensions, setDimensions] = useState<DimensionAnalysis | null>(null)
  const [timeline, setTimeline] = useState<TimelineAnalysis | null>(null)
  const [coverage, setCoverage] = useState<CoverageAnalysis | null>(null)
  const [gaps, setGaps] = useState<GapAnalysis | null>(null)
  const [reports, setReports] = useState<AnalysisReport[]>([])
  const [loading, setLoading] = useState(true)

  // Report viewer state
  const [viewingReportId, setViewingReportId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [rangeMenu, setRangeMenu] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [d, t, c, g, r] = await Promise.all([
        analysisApi.dimensions().catch(() => null),
        analysisApi.timeline(12).catch(() => null),
        analysisApi.coverage().catch(() => null),
        analysisApi.gaps().catch(() => null),
        analysisApi.listReports().catch(() => []),
      ])
      setDimensions(d)
      setTimeline(t)
      setCoverage(c)
      setGaps(g)
      setReports(r)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleGenerateReport = useCallback(async (label: string) => {
    setRangeMenu(false)
    if (!dimensions || !timeline || !coverage || !gaps) return

    const now = new Date()
    let from: string
    if (label === '近一周') {
      from = new Date(now.getTime() - 7 * 86400000).toISOString()
    } else if (label === '近一月') {
      from = new Date(now.getTime() - 30 * 86400000).toISOString()
    } else {
      from = '2020-01-01T00:00:00.000Z'
    }

    const report = await analysisApi.createReport({
      status: 'generating',
      timeRange: { from, to: now.toISOString(), label },
      snapshot: { dimensions, timeline, coverage, gaps },
    })
    setReports((prev) => [report, ...prev])
    setViewingReportId(report.id)
    setGenerating(true)
  }, [dimensions, timeline, coverage, gaps])

  const handleDeleteReport = useCallback(async (id: string) => {
    await analysisApi.deleteReport(id)
    setReports((prev) => prev.filter((r) => r.id !== id))
    if (viewingReportId === id) setViewingReportId(null)
  }, [viewingReportId])

  const handleReportCompleted = useCallback((updated: AnalysisReport) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    setGenerating(false)
  }, [])

  // Show report viewer if one is selected
  if (viewingReportId) {
    const report = reports.find((r) => r.id === viewingReportId)
    if (report) {
      return (
        <ReportViewer
          report={report}
          onBack={() => setViewingReportId(null)}
          onCompleted={handleReportCompleted}
        />
      )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        <span className="ml-2 text-sm text-neutral-400">加载分析数据...</span>
      </div>
    )
  }

  const totalGapWarnings =
    (gaps?.uncoveredMethodologies.length ?? 0) +
    (gaps?.staleDimensions.length ?? 0) +
    ((gaps?.theoryPracticeRatio.ratio ?? 999) < 3 ? 1 : 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="space-y-5"
    >
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setRangeMenu((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            生成分析报告
            <ChevronRight className={cn('w-3 h-3 transition-transform', rangeMenu && 'rotate-90')} />
          </button>
          <AnimatePresence>
            {rangeMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-lg overflow-hidden min-w-[160px]"
              >
                {['近一周', '近一月', '全部'].map((label) => (
                  <button
                    key={label}
                    onClick={() => handleGenerateReport(label)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {reports.length > 0 && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            <FileText className="w-3 h-3 inline mr-1" />
            {reports.length} 份历史报告
          </span>
        )}
      </div>

      {/* Stats cards grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Dimension heatmap card */}
        {dimensions && <DimensionHeatmapCard data={dimensions} />}

        {/* Velocity card */}
        {timeline && <VelocityCard data={timeline} />}
      </div>

      {/* Coverage card (full width) */}
      {coverage && <CoverageCard data={coverage} navigate={navigate} />}

      {/* Gap warnings card */}
      {gaps && totalGapWarnings > 0 && <GapCard data={gaps} />}

      {/* Historical reports */}
      {reports.length > 0 && (
        <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800/60 flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium">历史报告</span>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
            {reports.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer group"
              >
                <button
                  onClick={() => setViewingReportId(r.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {r.timeRange?.label || '分析报告'}
                    </span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[0.625rem] font-medium',
                      r.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : r.status === 'generating'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                    )}>
                      {r.status === 'completed' ? '已完成' : r.status === 'generating' ? '生成中' : '失败'}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {new Date(r.createdAt).toLocaleString()}
                    {r.analysis?.summary && (
                      <span className="ml-2 text-neutral-400 dark:text-neutral-500">
                        {r.analysis.summary.slice(0, 60)}...
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteReport(r.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-neutral-400 hover:text-rose-500 transition-all"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DimensionHeatmapCard({ data }: { data: DimensionAnalysis }) {
  const { crossMatrix, total, recency } = data
  const maxCount = useMemo(
    () => Math.max(1, ...crossMatrix.counts.flat()),
    [crossMatrix]
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05, ease: EASE }}
      className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-1.5 mb-3 text-sm font-medium">
        <Grid3X3 className="w-4 h-4 text-violet-500" />
        维度分布 · {total} 条碎片
      </div>

      {crossMatrix.roles.length === 0 ? (
        <div className="text-xs text-neutral-500 italic py-6 text-center border border-dashed border-neutral-200/60 dark:border-white/10 rounded-xl">
          暂无经验碎片数据
        </div>
      ) : (
        <>
          {/* Heatmap grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[320px]">
              {/* Column headers */}
              <div className="flex" style={{ paddingLeft: 80 }}>
                {crossMatrix.situations.slice(0, 6).map((s) => (
                  <div
                    key={s}
                    className="flex-1 text-center text-[0.625rem] text-neutral-500 dark:text-neutral-400 truncate px-0.5"
                    title={s}
                  >
                    {s.slice(0, 4)}
                  </div>
                ))}
              </div>
              {/* Rows */}
              {crossMatrix.roles.slice(0, 6).map((role, ri) => (
                <div key={role} className="flex items-center gap-1 mt-1">
                  <div className="w-[76px] text-right text-[0.6875rem] text-neutral-600 dark:text-neutral-300 truncate shrink-0 pr-1" title={role}>
                    {role}
                  </div>
                  {crossMatrix.situations.slice(0, 6).map((sit, si) => {
                    const count = crossMatrix.counts[ri]?.[si] ?? 0
                    const intensity = count === 0 ? 0 : 0.15 + 0.75 * (count / maxCount)
                    return (
                      <div
                        key={sit}
                        className="flex-1 aspect-square rounded-md border border-neutral-200/30 dark:border-white/5"
                        style={{
                          backgroundColor: count === 0
                            ? 'rgba(127,127,127,0.06)'
                            : `rgba(139,92,246,${intensity})`,
                        }}
                        title={`${role} × ${sit}: ${count}`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Recency breakdown */}
          <div className="flex items-center gap-3 mt-3 text-[0.625rem] text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-500" />
              30天内 {recency.recent}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-300" />
              30-90天 {recency.moderate}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-600" />
              90天+ {recency.stale}
            </span>
          </div>
        </>
      )}
    </motion.div>
  )
}

function VelocityCard({ data }: { data: TimelineAnalysis }) {
  const { velocity, streak, months } = data
  const trendIcon = velocity.trend === 'up'
    ? <ArrowUp className="w-3 h-3 text-emerald-500" />
    : velocity.trend === 'down'
      ? <ArrowDown className="w-3 h-3 text-rose-500" />
      : <Minus className="w-3 h-3 text-neutral-400" />
  const trendLabel = velocity.trend === 'up' ? '上升' : velocity.trend === 'down' ? '下降' : '稳定'

  // Sparkline
  const counts = months.map((m) => m.fragmentCount)
  const maxC = Math.max(1, ...counts)
  const W = 200
  const H = 40
  const step = counts.length > 1 ? W / (counts.length - 1) : 0
  const sparkPath = counts
    .map((v, i) => {
      const x = i * step
      const y = H - (v / maxC) * (H - 4) - 2
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1)
    })
    .join(' ')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
      className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-1.5 mb-3 text-sm font-medium">
        <Zap className="w-4 h-4 text-amber-500" />
        认知速度
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-lg font-bold text-neutral-900 dark:text-white">{velocity.last7d}</div>
          <div className="text-[0.625rem] text-neutral-500">近 7 天</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-neutral-900 dark:text-white">{velocity.last30d}</div>
          <div className="text-[0.625rem] text-neutral-500">近 30 天</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            {trendIcon}
            <span className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{trendLabel}</span>
          </div>
          <div className="text-[0.625rem] text-neutral-500">趋势</div>
        </div>
      </div>

      {/* Streak */}
      <div className="flex items-center gap-2 mb-3 text-[0.6875rem]">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <span className="text-neutral-600 dark:text-neutral-300">
          连续 <strong>{streak.current}</strong> 天有产出
        </span>
        <span className="text-neutral-400 dark:text-neutral-500">
          (最长 {streak.longest} 天)
        </span>
      </div>

      {/* Mini sparkline */}
      <div className="mt-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10">
          <path d={sparkPath} fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" />
        </svg>
        <div className="flex justify-between text-[0.5625rem] text-neutral-400">
          <span>{months[0]?.month}</span>
          <span>{months[months.length - 1]?.month}</span>
        </div>
      </div>
    </motion.div>
  )
}

function CoverageCard({
  data,
  navigate,
}: {
  data: CoverageAnalysis
  navigate: ReturnType<typeof useNavigate>
}) {
  const maxFragments = Math.max(1, ...data.frameworks.map((f) => f.totalFragments))

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15, ease: EASE }}
      className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-neutral-100 dark:border-neutral-800/60 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <BarChart3 className="w-4 h-4 text-sky-500" />
          跨框架覆盖率
        </div>
        <div className="text-[0.6875rem] text-neutral-500">
          总覆盖 <strong>{data.overall.coveragePercent}%</strong> ({data.overall.coveredNodes}/{data.overall.totalNodes})
        </div>
      </div>
      <div className="px-5 py-3 space-y-2.5">
        {data.frameworks.map((fw, i) => (
          <motion.div
            key={fw.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03, ease: EASE }}
            className="flex items-center gap-3"
          >
            <div className="w-36 shrink-0 text-right">
              <span className="text-[0.75rem] text-neutral-700 dark:text-neutral-300 truncate block">
                {fw.name}
              </span>
            </div>
            <div className="flex-1 h-5 relative">
              <div className="absolute inset-0 rounded-md bg-neutral-100 dark:bg-neutral-800/60" />
              {fw.coveragePercent > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${fw.coveragePercent}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 + 0.1, ease: EASE }}
                  className="absolute left-0 top-0 bottom-0 rounded-md bg-sky-500/70 dark:bg-sky-500/60"
                />
              )}
            </div>
            <div className="w-24 shrink-0 text-[0.75rem] tabular-nums text-neutral-600 dark:text-neutral-400">
              {fw.coveragePercent}% ({fw.coveredNodes}/{fw.nodeCount})
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function GapCard({ data }: { data: GapAnalysis }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2, ease: EASE }}
      className="rounded-2xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-4"
    >
      <div className="flex items-center gap-1.5 mb-3 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4" />
        盲区警示
      </div>
      <div className="space-y-2 text-[0.75rem]">
        {data.uncoveredMethodologies.slice(0, 5).map((u) => (
          <div key={`${u.frameworkId}-${u.nodeId}`} className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <span className="mt-0.5 text-amber-500">--</span>
            <span>
              <strong>{u.frameworkName}</strong> / {u.nodeName} — {u.methodologyCount} 个方法论但无实践碎片
            </span>
          </div>
        ))}
        {data.staleDimensions.slice(0, 3).map((s) => (
          <div key={`${s.dimension}-${s.value}`} className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <span className="mt-0.5 text-amber-500">--</span>
            <span>
              "{s.value}" 类{s.dimension === 'insight_type' ? '洞察' : s.dimension === 'role' ? '角色' : s.dimension === 'situation' ? '场景' : '活动'}已 {s.daysSince} 天未新增
            </span>
          </div>
        ))}
        {data.theoryPracticeRatio.ratio < 3 && (
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
            <span className="mt-0.5 text-amber-500">--</span>
            <span>
              知行比 {data.theoryPracticeRatio.ratio} (建议 &gt; 3) — {data.theoryPracticeRatio.methodologies} 个方法论 vs {data.theoryPracticeRatio.fragments} 条碎片
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
