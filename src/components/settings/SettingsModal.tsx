/**
 * V2.0-layout · Settings Modal
 *
 * Replaces the full-page SettingsPage route with a centered modal over
 * a frosted-glass backdrop. The modal preserves the same internal
 * sidebar + pane layout. ESC / backdrop-click closes.
 */

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import SettingsPage from '@/pages/SettingsPage'

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen)
  const close = useAppStore((s) => s.closeSettings)

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          {/* Frosted backdrop */}
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-xl"
            onClick={close}
          />

          {/* Modal card */}
          <motion.div
            key="settings-card"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative w-[90vw] max-w-4xl h-[85vh] max-h-[720px] rounded-2xl border border-neutral-200/70 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Close button */}
            <button
              onClick={close}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4 text-neutral-500" />
            </button>

            {/* Settings content — reuse the existing SettingsPage component */}
            <div className="flex-1 overflow-hidden">
              <SettingsPage />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
