/**
 * V2.0 M6-Pre · Atom mode overview page (default view)
 *
 * Shown when entering Atom mode with no specific section selected.
 * Hero branding + two section cards with stats.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BookOpen, Flower2, BookMarked } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { atomsApi, frameworksApi } from '@/lib/dataApi'
import type { Framework, AtomAny } from '@/types'
import { useNavigate } from 'react-router-dom'
import atomsynLogo from '@/assets/atomsyn-logo.png'

export function AtomOverviewPage() {
  const nav = useNavigate()
  const setActiveSectionFocus = useAppStore((s) => s.setActiveSectionFocus)
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const [atoms, setAtoms] = useState<AtomAny[]>([])

  useEffect(() => {
    frameworksApi.list().then(setFrameworks).catch(() => setFrameworks([]))
    atomsApi.list().then((a) => setAtoms(a as AtomAny[])).catch(() => setAtoms([]))
  }, [])

  const methodologyCount = atoms.filter((a) => a.kind === 'methodology').length
  const experienceCount = atoms.filter((a) => a.kind === 'experience').length
  const roleSet = new Set(atoms.filter((a) => a.kind === 'experience').map((a) => (a as any).role).filter(Boolean))

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl w-full space-y-10"
      >
        {/* Hero */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-16 h-16 mx-auto rounded-[18px] overflow-hidden shadow-xl shadow-violet-500/15 ring-1 ring-black/[0.04] dark:ring-white/10"
          >
            <div className="w-full h-full bg-gradient-to-br from-[#f4f4fc] via-white to-[#ebebf6] dark:from-[#2a2a3e] dark:via-[#1e1e30] dark:to-[#28283c] flex items-center justify-center p-1">
              <img src={atomsynLogo} alt="" className="w-full h-full object-contain drop-shadow-md scale-125" />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="flex items-center justify-center gap-2"
          >
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-200 bg-clip-text text-transparent">
              你的认知资产
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[0.6875rem] font-semibold tracking-wide bg-gradient-to-r from-violet-500/10 to-sky-500/10 dark:from-violet-500/20 dark:to-sky-500/20 text-violet-600 dark:text-violet-300 border border-violet-500/15 dark:border-violet-500/25">
              100% 本地主权
            </span>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-[0.8125rem] text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-md mx-auto"
          >
            在 Claude Code、Cursor、Codex 等任何 AI 工具中,它们看到的不再是空白的你,而是一直在复盘、一直在进步的你。
          </motion.p>
        </div>

        {/* Three hero cards */}
        <div className="grid grid-cols-3 gap-3">
          {/* Method Library card */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { setActiveSectionFocus('method-library'); nav('/atom/garden') }}
            className="group text-left p-4 rounded-2xl border border-violet-200/60 dark:border-violet-500/20 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-500/[0.06] dark:to-transparent hover:border-violet-300 dark:hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/8 hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/15 to-violet-600/10 dark:from-violet-500/25 dark:to-violet-600/15 flex items-center justify-center mb-3 ring-1 ring-violet-500/10">
              <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-[0.875rem] font-semibold text-neutral-800 dark:text-neutral-100 mb-1">方法库</div>
            <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2.5">
              你的科学思维工具箱。沉淀学科知识为结构化骨架,让 AI 理解你的思维方式。
            </p>
            <div className="flex items-center gap-2 text-[0.625rem] text-violet-600/70 dark:text-violet-400/70">
              <span>{frameworks.length} 套方法论</span>
              <span className="w-px h-2.5 bg-violet-300/30" />
              <span>{methodologyCount} 个知识点</span>
            </div>
          </motion.button>

          {/* Memory Garden card */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { setActiveSectionFocus('memory-garden'); nav('/atom/garden') }}
            className="group text-left p-4 rounded-2xl border border-emerald-200/60 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-500/[0.06] dark:to-transparent hover:border-emerald-300 dark:hover:border-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/8 hover:-translate-y-0.5 transition-all duration-300"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-600/10 dark:from-emerald-500/25 dark:to-emerald-600/15 flex items-center justify-center mb-3 ring-1 ring-emerald-500/10">
              <Flower2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-[0.875rem] font-semibold text-neutral-800 dark:text-neutral-100 mb-1">记忆花园</div>
            <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2.5">
              涌现中的隐形认知。对话中不经意沉淀的实战智慧,在恰当时刻与你"相遇"。
            </p>
            <div className="flex items-center gap-2 text-[0.625rem] text-emerald-600/70 dark:text-emerald-400/70">
              <span>{experienceCount} 条经验</span>
              <span className="w-px h-2.5 bg-emerald-300/30" />
              <span>{roleSet.size} 个角色</span>
            </div>
          </motion.button>

          {/* Bookshelf card */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => nav('/atom/bookshelf')}
            className="group relative text-left p-4 rounded-2xl border border-sky-200/60 dark:border-sky-500/20 bg-gradient-to-br from-sky-50/80 to-white dark:from-sky-500/[0.06] dark:to-transparent hover:border-sky-300 dark:hover:border-sky-500/30 hover:shadow-xl hover:shadow-sky-500/8 hover:-translate-y-0.5 transition-all duration-300"
          >
            {/* Coming soon badge */}
            <div className="absolute top-3 right-3 px-1.5 py-0.5 rounded-md text-[0.5625rem] font-medium bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/15">
              即将开放
            </div>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500/15 to-sky-600/10 dark:from-sky-500/25 dark:to-sky-600/15 flex items-center justify-center mb-3 ring-1 ring-sky-500/10">
              <BookMarked className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="text-[0.875rem] font-semibold text-neutral-800 dark:text-neutral-100 mb-1">书架</div>
            <p className="text-[0.6875rem] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2.5">
              让阅读变成活知识。划过的线不再只是线,而是能和你的实践对话的认知节点。
            </p>
            <div className="flex items-center gap-2 text-[0.625rem] text-sky-600/70 dark:text-sky-400/70">
              <span>阅读笔记提炼</span>
            </div>
          </motion.button>
        </div>

        {/* Bottom tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="text-center"
        >
          <div className="text-[0.6875rem] text-neutral-400/60 dark:text-neutral-500/60 italic">
            Atomsyn — it remembers, so you can grow.
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
