/**
 * V2.x · SkillCommandPalette — popup command list for / commands.
 *
 * Positioned above the chat input. Shows available skill commands
 * with icons, keyboard navigable (arrow keys + enter).
 */

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, PenLine, Brain, Sparkles } from 'lucide-react'
import { cn } from '@/lib/cn'

interface SkillCommandPaletteProps {
  onSelect: (command: string) => void
  onClose: () => void
  visible: boolean
}

const COMMANDS = [
  {
    command: '/read',
    label: '知识检索',
    description: '从知识库中检索相关方法论和经验',
    icon: Search,
  },
  {
    command: '/write',
    label: '经验沉淀',
    description: '将当前对话中的洞察沉淀为经验原子',
    icon: PenLine,
  },
  {
    command: '/mentor',
    label: '认知复盘',
    description: '启动导师模式，分析盲区和成长趋势',
    icon: Brain,
  },
  {
    command: '/bootstrap',
    label: '导入硬盘文档',
    description: '把存量笔记 / 文档 / 历史聊天导入 Atomsyn (支持 .md / .docx / .pdf)',
    icon: Sparkles,
  },
] as const

export function SkillCommandPalette({ onSelect, onClose, visible }: SkillCommandPaletteProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  // Reset active index when palette opens
  useEffect(() => {
    if (visible) setActiveIndex(0)
  }, [visible])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % COMMANDS.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + COMMANDS.length) % COMMANDS.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onSelect(COMMANDS[activeIndex].command)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [visible, activeIndex, onSelect, onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'absolute bottom-full left-0 right-0 mb-2 z-50',
            'rounded-xl border border-neutral-200/80 dark:border-white/10',
            'bg-white dark:bg-neutral-900',
            'shadow-lg shadow-neutral-200/50 dark:shadow-black/30',
            'overflow-hidden',
          )}
        >
          <div className="px-3 py-2 border-b border-neutral-100 dark:border-white/5">
            <span className="text-[0.625rem] font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              技能命令
            </span>
          </div>
          <div className="py-1">
            {COMMANDS.map((cmd, i) => {
              const Icon = cmd.icon
              return (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => onSelect(cmd.command)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 text-left',
                    'transition-colors duration-100',
                    i === activeIndex
                      ? 'bg-violet-500/8 dark:bg-violet-500/10'
                      : 'hover:bg-neutral-50 dark:hover:bg-white/5',
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-lg',
                      'bg-violet-500/10 dark:bg-violet-500/15',
                    )}
                  >
                    <Icon size={14} className="text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                        {cmd.command}
                      </span>
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        {cmd.label}
                      </span>
                    </div>
                    <p className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 truncate">
                      {cmd.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
