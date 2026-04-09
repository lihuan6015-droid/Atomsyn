/**
 * V2.0 M6-Pre · Method Library welcome/landing page
 *
 * Shown when clicking "方法库" section header without selecting a specific skeleton.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Star, ArrowRight, Layers } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { frameworksApi } from '@/lib/dataApi'
import type { Framework } from '@/types'
import { getFrameworkNodeCount } from '@/types'
import { useNavigate } from 'react-router-dom'

export function MethodLibraryWelcome() {
  const nav = useNavigate()
  const setActiveFramework = useAppStore((s) => s.setActiveFramework)
  const [frameworks, setFrameworks] = useState<Framework[]>([])

  useEffect(() => {
    frameworksApi.list().then(setFrameworks).catch(() => setFrameworks([]))
  }, [])

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
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/15 to-violet-600/10 dark:from-violet-500/25 dark:to-violet-600/15 flex items-center justify-center ring-1 ring-violet-500/10">
              <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-violet-700 to-violet-500 dark:from-violet-300 dark:to-violet-400 bg-clip-text text-transparent">方法库</h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            将感兴趣的学科知识沉淀为结构化骨架 — 产品、管理、心理学、工程...每个领域一套方法论体系。
          </p>
        </motion.div>

        {/* Value proposition */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-violet-200/50 dark:border-violet-500/15 bg-violet-50/50 dark:bg-violet-500/[0.04] p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-500" />
            <span className="text-sm font-medium text-violet-800 dark:text-violet-300">双向闭环</span>
          </div>
          <p className="text-[0.8125rem] text-neutral-600 dark:text-neutral-400 leading-relaxed">
            这些方法论不止在这里静静躺着 — 当你在 Claude Code、Cursor、Trae 或任何支持 Atomsyn 的 AI 工具中工作时,它们会被自动感知,成为 AI 理解你思维方式的一部分。你整理的每一条方法论,都在悄悄训练属于你自己的认知层。
          </p>
        </motion.div>

        {/* Existing frameworks */}
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

        {frameworks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-3"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              已有方法库
            </div>
            <div className="grid gap-3">
              {frameworks.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setActiveFramework(f.id); nav('/atom/garden') }}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02] hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-md hover:shadow-violet-500/5 transition-all text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-violet-500/10 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
                    <Star className="w-4.5 h-4.5 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{f.name}</div>
                    <div className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                      {getFrameworkNodeCount(f)} 个方法论单元
                      {f.description && ` · ${f.description.slice(0, 40)}...`}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-violet-500 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
