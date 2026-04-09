/**
 * ReportViewer — View/generate an AI analysis report.
 *
 * If the report's status is 'generating', this component will call
 * the LLM to produce the analysis and persist the result via the API.
 * If the report is 'completed', it displays the saved analysis.
 *
 * Follows the same "phase" pattern as CrystallizePopover in the Notes module.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
  Loader2,
  ShieldAlert,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { analysisApi } from '@/lib/dataApi'
import { generateAnalysisReport } from '@/lib/analyzeReport'
import { RadarChart } from './RadarChart'
import type { AnalysisReport, AnalysisReportResult } from '@/types'

const EASE = [0.16, 1, 0.3, 1] as const

interface Props {
  report: AnalysisReport
  onBack: () => void
  onCompleted: (updated: AnalysisReport) => void
}

export function ReportViewer({ report, onBack, onCompleted }: Props) {
  const [phase, setPhase] = useState<'generating' | 'completed' | 'error'>(
    report.status === 'completed' && report.analysis ? 'completed' : 'generating'
  )
  const [analysis, setAnalysis] = useState<AnalysisReportResult | undefined>(report.analysis)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const runCountRef = useRef(0)

  useEffect(() => {
    // Reset on (re-)mount — critical for React StrictMode double-mount
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Generate or re-generate
  const doGenerate = useCallback(async () => {
    setPhase('generating')
    setError(null)
    runCountRef.current++
    const runId = runCountRef.current

    try {
      const result = await generateAnalysisReport(report.snapshot)
      if (runId !== runCountRef.current || !mountedRef.current) return

      const updated = await analysisApi.updateReport(report.id, {
        status: 'completed',
        analysis: result,
        modelUsed: 'default',
      })
      if (!mountedRef.current) return

      setAnalysis(result)
      setPhase('completed')
      onCompleted(updated as AnalysisReport)
    } catch (err: any) {
      const msg = err.message || '生成分析报告失败'
      // eslint-disable-next-line no-console
      console.error('[ReportViewer] LLM generation failed:', msg, err)

      // Always mark as failed in backend (even if component unmounted)
      await analysisApi.updateReport(report.id, { status: 'failed' }).catch(() => {})

      if (runId !== runCountRef.current || !mountedRef.current) return
      setError(msg)
      setPhase('error')
    }
  }, [report.id, report.snapshot, onCompleted])

  // Auto-generate on mount if not completed
  useEffect(() => {
    if (report.status === 'completed' && report.analysis) return
    // If report was previously marked as failed, start in error state
    if (report.status === 'failed') {
      setPhase('error')
      setError('上次生成失败，点击"重试生成"重新尝试')
      return
    }
    doGenerate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="space-y-5"
    >
      {/* Back button + meta */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回分析
        </button>
        <span className="text-neutral-300 dark:text-neutral-600">|</span>
        <span className="text-xs text-neutral-500">
          {report.timeRange?.label} · {new Date(report.createdAt).toLocaleString()}
        </span>
      </div>

      {/* Generating state */}
      {phase === 'generating' && (
        <div className="rounded-2xl border border-violet-200/60 dark:border-violet-500/20 bg-violet-50/30 dark:bg-violet-500/5 p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">正在生成分析报告...</p>
          <p className="text-xs text-violet-500/70 mt-1">AI 正在分析你的认知数据快照，这可能需要 10-30 秒</p>
          <p className="text-[0.625rem] text-violet-400/50 mt-3">如果长时间没有响应，请检查设置中的 LLM 模型配置和 API Key</p>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="rounded-2xl border border-rose-200/60 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 p-6">
          <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 mb-2">
            <XCircle className="w-5 h-5" />
            <span className="text-sm font-medium">生成失败</span>
          </div>
          <p className="text-xs text-rose-500">{error}</p>
          <p className="text-xs text-neutral-500 mt-2">
            请检查 LLM 配置是否正确（设置 → 模型配置），然后重新生成。
          </p>
          <button
            onClick={doGenerate}
            className="mt-3 px-4 py-1.5 text-xs bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
          >
            重试生成
          </button>
        </div>
      )}

      {/* Completed report */}
      {phase === 'completed' && analysis && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          {/* Summary card */}
          <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">总体评估</span>
            </div>
            <p className="text-[0.8125rem] leading-relaxed text-neutral-700 dark:text-neutral-300">
              {analysis.summary}
            </p>
          </div>

          {/* Radar chart snapshot */}
          {analysis.radar && analysis.radar.length > 0 && (
            <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">认知雷达</span>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <RadarChart data={analysis.radar} size={240} className="shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {analysis.radar.map((d) => (
                    <div key={d.axis} className="flex items-start gap-2">
                      <div className="mt-1 w-8 text-right">
                        <span className="text-sm font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{d.score}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[0.75rem] font-medium text-neutral-700 dark:text-neutral-300">{d.axis}</div>
                        <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 leading-snug">{d.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Strengths & Blind spots side by side */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Strengths */}
            <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-500/15 bg-emerald-50/30 dark:bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-semibold">优势领域</span>
              </div>
              <ul className="space-y-2">
                {analysis.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.75rem] text-emerald-800 dark:text-emerald-300">
                    <span className="mt-0.5 text-emerald-500 shrink-0">--</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Blind spots */}
            <div className="rounded-2xl border border-amber-200/60 dark:border-amber-500/15 bg-amber-50/30 dark:bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3 text-amber-700 dark:text-amber-400">
                <ShieldAlert className="w-4 h-4" />
                <span className="text-sm font-semibold">盲区警告</span>
              </div>
              <ul className="space-y-2">
                {analysis.blindSpots.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-[0.75rem] text-amber-800 dark:text-amber-300">
                    <span className="mt-0.5 text-amber-500 shrink-0">--</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Suggestions */}
          <div className="rounded-2xl border border-violet-200/60 dark:border-violet-500/15 bg-violet-50/30 dark:bg-violet-500/5 p-4">
            <div className="flex items-center gap-2 mb-3 text-violet-700 dark:text-violet-400">
              <Target className="w-4 h-4" />
              <span className="text-sm font-semibold">行动建议</span>
            </div>
            <ul className="space-y-2">
              {analysis.suggestions.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-[0.75rem] text-violet-800 dark:text-violet-300">
                  <span className="mt-0.5 text-violet-500 shrink-0 font-bold">{i + 1}.</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Full narrative */}
          {analysis.narrative && (
            <div className="rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="w-4 h-4 text-sky-500" />
                <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">详细分析</span>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[0.8125rem] leading-relaxed">
                <ReactMarkdown>{analysis.narrative}</ReactMarkdown>
              </div>
            </div>
          )}
        </motion.div>
      )}

    </motion.div>
  )
}
