/**
 * V2.0 M6-Pre · Memory Garden welcome/landing page
 *
 * Shown when clicking "记忆花园" section header without selecting a specific role.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Flower2, Sparkles, Tag } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { atomsApi } from '@/lib/dataApi'
import type { AtomAny } from '@/types'
import { useNavigate } from 'react-router-dom'

export function MemoryGardenWelcome() {
  const nav = useNavigate()
  const setActiveRole = useAppStore((s) => s.setActiveRole)
  const [atoms, setAtoms] = useState<AtomAny[]>([])

  useEffect(() => {
    atomsApi.list().then((a) => setAtoms(a as AtomAny[])).catch(() => setAtoms([]))
  }, [])

  const roleGroups = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of atoms) {
      if (a.kind === 'skill-inventory' || a.kind === 'methodology') continue
      const role = (a as any).role as string | undefined
      const key = role || '未分类'
      map.set(key, (map.get(key) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }))
  }, [atoms])

  const totalExperiences = roleGroups.reduce((sum, g) => sum + g.count, 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 dark:from-emerald-500/25 dark:to-emerald-600/15 flex items-center justify-center ring-1 ring-emerald-500/10">
              <Flower2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-700 to-emerald-500 dark:from-emerald-300 dark:to-emerald-400 bg-clip-text text-transparent">记忆花园</h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            对话中不经意沉淀的实战智慧——训练数据里没有的，只属于你的认知印记。
          </p>
        </motion.div>

        {/* Value proposition */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-emerald-200/50 dark:border-emerald-500/15 bg-emerald-50/50 dark:bg-emerald-500/[0.04] p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">在恰当的时刻，与你重逢</span>
          </div>
          <p className="text-[0.8125rem] text-neutral-600 dark:text-neutral-400 leading-relaxed">
            当你在 Claude Code、Cursor 中工作时，你曾经的某个顿悟会安静地出现在回答里——不是被搜索出来的，是它自己找到了你。你上次踩过的坑，AI 不会让你再踩第二次。
          </p>
        </motion.div>

        {/* Role distribution */}
        {roleGroups.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                按角色分布
              </span>
              <span className="text-[0.6875rem] text-neutral-400">{totalExperiences} 条经验</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {roleGroups.map(({ role, count }) => (
                <button
                  key={role}
                  onClick={() => { setActiveRole(role); nav('/atom/garden') }}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] hover:border-emerald-300 dark:hover:border-emerald-500/30 transition-all text-left"
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[0.8125rem] font-medium flex-1 truncate">{role}</span>
                  <span className="text-[0.6875rem] text-neutral-400 font-mono">{count}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {roleGroups.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center py-8 text-neutral-400"
          >
            <p className="text-sm">还没有经验碎片</p>
            <p className="text-xs mt-1">在 AI 对话中自然产生,无需刻意操作</p>
          </motion.div>
        )}

        {/* Bottom tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center pt-4"
        >
          <p className="text-[0.6875rem] text-neutral-400/60 dark:text-neutral-500/60 italic">
            Atomsyn — it remembers, so you can grow.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
