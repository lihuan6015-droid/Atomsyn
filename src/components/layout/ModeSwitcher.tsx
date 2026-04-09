/**
 * V2.0 M6-Pre · Mode Switcher (pill-shaped, spring animated)
 *
 * Top-level mode selector: 聊天 | 元认知 | 笔记
 * Uses Framer Motion layoutId for a sliding background indicator
 * with macOS SegmentedControl spring feel.
 */

import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAppStore, type AppMode } from '@/stores/useAppStore'
import type { SectionFocus } from '@/stores/useAppStore'
import { cn } from '@/lib/cn'

const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

const modes: { key: AppMode; label: string; route: string; clearSelection?: boolean }[] = [
  { key: 'chat', label: '聊天', route: '/chat' },
  { key: 'atom', label: '元认知', route: '/atom/garden', clearSelection: true },
  { key: 'notes', label: '笔记', route: '/notes' },
]

export function ModeSwitcher() {
  const nav = useNavigate()
  const activeMode = useAppStore((s) => s.activeMode)
  const setActiveMode = useAppStore((s) => s.setActiveMode)
  const clearSelection = useAppStore((s) => s.clearSelection)

  function handleSwitch(m: { key: AppMode; route: string; clearSelection?: boolean }) {
    if (m.key === activeMode && !m.clearSelection) return
    setActiveMode(m.key)
    if (m.clearSelection) clearSelection()
    nav(m.route)
  }

  return (
    <div
      style={noDragStyle}
      className="relative flex items-center p-[3px] bg-neutral-100/80 dark:bg-neutral-900/80 backdrop-blur-sm rounded-xl shadow-inner shadow-black/[0.04] dark:shadow-black/20"
    >
      {modes.map((m) => {
        const isActive = activeMode === m.key
        return (
          <button
            key={m.key}
            onClick={() => handleSwitch(m)}
            className="relative flex-1 z-[1] px-2 py-1.5 text-xs font-medium rounded-[10px] transition-colors duration-200"
          >
            <span
              className={cn(
                'relative z-[1] transition-colors duration-200',
                isActive
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              )}
            >
              {m.label}
            </span>
            {isActive && (
              <motion.div
                layoutId="mode-indicator"
                className="absolute inset-0 bg-white dark:bg-neutral-800 rounded-[10px] shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
