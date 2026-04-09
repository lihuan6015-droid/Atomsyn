/**
 * V2.0 M6-Pre · Reusable right-click context menu
 *
 * Uses React portal to render outside sidebar overflow constraints.
 * Registers listeners after one frame to avoid closing on the same
 * right-click event that opened the menu.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

export interface ContextMenuItem {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  action: () => void
  danger?: boolean
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    function handleContextMenu(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        e.preventDefault()
        onClose()
      }
    }
    // Delay registration by one frame so the opening right-click
    // event doesn't immediately trigger the close handler
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClick, true)
      document.addEventListener('keydown', handleEsc)
      document.addEventListener('contextmenu', handleContextMenu, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handleClick, true)
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('contextmenu', handleContextMenu, true)
    }
  }, [onClose])

  // Clamp position to viewport
  const menuWidth = 180
  const menuHeight = items.length * 32 + 8
  const clampedX = Math.min(x, window.innerWidth - menuWidth - 8)
  const clampedY = Math.min(y, window.innerHeight - menuHeight - 8)

  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className="fixed z-[9999] min-w-[160px] py-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50 backdrop-blur-sm"
      style={{ left: clampedX, top: clampedY }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            onClick={item.action}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-1.5 text-[0.8125rem] transition-colors text-left',
              item.danger
                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5'
            )}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            {item.label}
          </button>
        )
      })}
    </motion.div>,
    document.body
  )
}
