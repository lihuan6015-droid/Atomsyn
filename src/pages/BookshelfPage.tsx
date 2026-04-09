/**
 * BookshelfPage — §4 书架模块占位引导页
 *
 * MVP 阶段的占位页面，展示书架模块的价值主张和未来功能预告。
 * 实际功能待 P2 阶段实现。
 */

import { motion } from 'framer-motion'
import { BookOpen, Sparkles, Brain, Link2, ArrowRight } from 'lucide-react'

const EASE = [0.16, 1, 0.3, 1] as const

export default function BookshelfPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500/15 to-sky-600/10 dark:from-sky-500/25 dark:to-sky-600/15 flex items-center justify-center ring-1 ring-sky-500/10">
              <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-700 to-sky-500 dark:from-sky-300 dark:to-sky-400 bg-clip-text text-transparent">
              书架
            </h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            你读过的每一本书，都在悄悄塑造你的认知。书架模块将帮你把阅读中的核心知识点提炼出来，让它们不再只是划过的线，而是能被唤醒、能和你的实践经验对话的活知识。
          </p>
        </motion.div>

        {/* Value cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
          className="grid gap-3"
        >
          <FeatureCard
            icon={<Sparkles className="w-4 h-4 text-sky-500" />}
            title="LLM 智能提炼"
            description="上传一本书或粘贴文本，AI 帮你提取 5-15 个核心知识点，用方法论的视角帮你读书。"
            delay={0.15}
          />
          <FeatureCard
            icon={<Brain className="w-4 h-4 text-violet-500" />}
            title="理论与实践对标"
            description="书中的理念可以和你的经验碎片关联——你读过的「刻意练习」和你项目中的踩坑，会在这里相遇。"
            delay={0.2}
          />
          <FeatureCard
            icon={<Link2 className="w-4 h-4 text-emerald-500" />}
            title="认知网络扩展"
            description="书架的知识点将自动纳入导师模式的分析维度，让你的「理论储备」在认知雷达上真正亮起来。"
            delay={0.25}
          />
        </motion.div>

        {/* Coming soon banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3, ease: EASE }}
          className="rounded-2xl border border-sky-200/60 dark:border-sky-500/15 bg-sky-50/50 dark:bg-sky-500/5 p-5 text-center"
        >
          <div className="text-sm font-medium text-sky-700 dark:text-sky-300 mb-2">
            即将开放
          </div>
          <p className="text-xs text-sky-600/70 dark:text-sky-400/60 leading-relaxed max-w-md mx-auto">
            书架模块正在设计中。当前版本你可以通过笔记模块记录阅读笔记，然后用"提炼"功能将它们转化为经验碎片——这些碎片已经能被方法库和导师模式感知。
          </p>
          <div className="flex items-center justify-center gap-1 mt-3 text-[0.6875rem] text-sky-500">
            <span>前往笔记模块</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </motion.div>

        {/* Bottom tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
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

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode
  title: string
  description: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay, ease: EASE }}
      className="flex items-start gap-3 rounded-xl border border-neutral-200/60 dark:border-neutral-800/60 bg-white/60 dark:bg-neutral-900/30 glass p-4"
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</div>
        <p className="text-[0.75rem] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-0.5">{description}</p>
      </div>
    </motion.div>
  )
}
