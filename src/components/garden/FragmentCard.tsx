/**
 * V2.0 M3 · Fragment Card — 4-level progressive disclosure.
 *
 * L1 瞥一眼: title + insight_type chip + 1 tag
 * L2 扫描:   + role·situation breadcrumb + summary
 * L3 细节:   + activity chip + domain_hint + all tags + linked_methodologies
 * L4 全展开:  + rawContent + timestamps + source + calibration
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Clock, Eye, Lock, ThumbsDown, Thermometer, Archive, ArrowRight } from 'lucide-react'
import type { ExperienceFragment } from '@/types'
import { getInsightColor } from '@/lib/insightColors'
import { computeStaleness } from '@/lib/atomEvolution'
import { cn } from '@/lib/cn'

interface Props {
  fragment: ExperienceFragment
  onNavigate?: (atomId: string) => void
}

export function FragmentCard({ fragment: f, onNavigate }: Props) {
  const [level, setLevel] = useState(1)
  const ic = getInsightColor(f.insight_type)

  function cycleLevel() {
    setLevel((l) => (l >= 4 ? 1 : l + 1))
  }

  const relTime = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime()
    const days = Math.floor(d / 86400000)
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 30) return `${days} 天前`
    return iso.slice(0, 10)
  }

  // V2.x cognitive-evolution · staleness signal + archived/supersededBy state
  const stale = computeStaleness(f)
  const archivedAt = (f as { archivedAt?: string }).archivedAt
  const supersededBy = (f as { supersededBy?: string }).supersededBy
  const isArchived = Boolean(archivedAt)
  const isSuperseded = Boolean(supersededBy)
  const isStale = stale.is_stale && !isArchived

  return (
    <motion.div
      layout
      onClick={cycleLevel}
      className={cn(
        'group cursor-pointer rounded-xl border px-4 py-3 transition-all',
        'border-neutral-200/60 dark:border-white/8',
        'hover:border-neutral-300 dark:hover:border-white/15',
        'bg-white/80 dark:bg-white/[0.02]',
        f.private && 'border-l-2 border-l-pink-400/60',
        isArchived && 'opacity-60 grayscale-[0.4] border-l-2 border-l-neutral-400/40',
      )}
      whileHover={{ scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      title={
        isArchived
          ? `已归档于 ${new Date(archivedAt!).toLocaleDateString()}`
          : isStale
            ? `本条经验沉淀已 ${stale.age_days} 天, confidence 衰减 ${(stale.confidence_decay * 100).toFixed(0)}%。建议在当前情境再校准一次。`
            : undefined
      }
    >
      {/* V2.x · archived banner */}
      {isArchived && (
        <div className="flex items-center gap-1.5 mb-1.5 text-[0.625rem] text-neutral-500 dark:text-neutral-400">
          <Archive className="w-3 h-3" />
          <span>已归档于 {new Date(archivedAt!).toLocaleDateString()}</span>
        </div>
      )}

      {/* L1: 🌡 + title + insight_type + 1 tag + supersededBy chip */}
      <div className="flex items-center gap-2">
        {isStale && (
          <Thermometer
            className="w-3.5 h-3.5 shrink-0 text-amber-500"
            aria-label="staleness signal"
          />
        )}
        <span className="text-sm font-medium truncate flex-1">{f.title}</span>
        <span
          className={cn(
            'shrink-0 px-2 py-0.5 rounded-full text-[0.625rem] font-medium font-mono',
            ic.bg, ic.text, ic.darkBg, ic.darkText,
          )}
        >
          {f.insight_type}
        </span>
        {f.tags[0] && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[0.625rem] bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono">
            {f.tags[0]}
          </span>
        )}
        {isSuperseded && (
          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.625rem] bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-500/20">
            <ArrowRight className="w-2.5 h-2.5" />已被取代
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-neutral-400 transition-transform shrink-0',
            level >= 2 && 'rotate-180',
          )}
        />
      </div>

      <AnimatePresence initial={false}>
        {/* L2: breadcrumb + summary */}
        {level >= 2 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[0.6875rem] text-neutral-500">
                <span>{f.role}</span>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span>{f.situation}</span>
                <span className="text-neutral-300 dark:text-neutral-600">·</span>
                <span className="text-neutral-400">{relTime(f.createdAt)}</span>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed line-clamp-2">
                {f.summary}
              </p>
            </div>
          </motion.div>
        )}

        {/* L3: activity + domain + all tags + linked methodologies */}
        {level >= 3 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-medium bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {f.activity}
                </span>
                {f.context?.domain_hint && (
                  <span className="px-2 py-0.5 rounded-full text-[0.625rem] bg-neutral-100 dark:bg-white/5 text-neutral-500 italic">
                    {f.context.domain_hint}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {f.tags.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 rounded text-[0.625rem] bg-neutral-100 dark:bg-white/5 text-neutral-500 font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
              {f.linked_methodologies.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {f.linked_methodologies.map((id) => (
                    <button
                      key={id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate?.(id)
                      }}
                      className="px-1.5 py-0.5 rounded text-[0.625rem] bg-violet-500/10 text-violet-600 dark:text-violet-400 font-mono hover:bg-violet-500/20"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* L4: raw content + meta + calibration */}
        {level >= 4 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-neutral-200/50 dark:border-white/5 pt-3">
              <div className="text-[0.625rem] uppercase tracking-wider text-neutral-400 font-semibold">
                原始内容
              </div>
              <div className="text-xs text-neutral-600 dark:text-neutral-300 whitespace-pre-wrap bg-neutral-50 dark:bg-white/[0.02] rounded-lg p-3 max-h-40 overflow-y-auto">
                {f.rawContent}
              </div>
              <div className="grid grid-cols-3 gap-2 text-[0.625rem] text-neutral-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {f.createdAt.slice(0, 16).replace('T', ' ')}
                </div>
                <div className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {f.context?.source === 'gui' ? '人类输入' : f.context?.source === 'cli' ? 'Agent 写入' : '未知'}
                </div>
                <div className="font-mono">
                  conf: {((f.confidence ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
              {/* Calibration indicators */}
              <div className="flex items-center gap-3 text-[0.625rem] text-neutral-400">
                {f.stats.locked && (
                  <span className="flex items-center gap-1 text-amber-500">
                    <Lock className="w-3 h-3" /> 已锁定
                  </span>
                )}
                {f.stats.userDemoted && (
                  <span className="flex items-center gap-1 text-red-400">
                    <ThumbsDown className="w-3 h-3" /> 已降权
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
