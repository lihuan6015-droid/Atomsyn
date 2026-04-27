/**
 * V2.x bootstrap-tools (D-002) · PathDetectionBanner
 *
 * Floats above ChatInput when the user pastes an absolute filesystem path
 * into the textarea. Offers a one-click jump to the BootstrapWizard with
 * the path pre-filled. Includes a dismiss button and a "记住选择" toggle
 * (persists to localStorage `atomsyn:bootstrap-paste-dismissed`) so users
 * who opt out are not pestered again.
 *
 * The banner is purely presentational — it dispatches
 * `atomsyn:open-bootstrap` (consumed by ChatPage) when the user accepts.
 */

import { motion } from 'framer-motion'
import { FolderOpen, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PathDetectionBannerProps {
  path: string
  onAccept: () => void
  onDismiss: (rememberChoice: boolean) => void
}

export function PathDetectionBanner({ path, onAccept, onDismiss }: PathDetectionBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'mb-2 rounded-xl border border-violet-200/60 dark:border-violet-500/20',
        'bg-gradient-to-r from-violet-50/80 to-sky-50/60 dark:from-violet-500/[0.07] dark:to-sky-500/[0.05]',
        'shadow-sm',
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-2.5">
        <div
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5',
            'bg-violet-500/15 dark:bg-violet-500/20',
          )}
        >
          <FolderOpen size={14} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-neutral-700 dark:text-neutral-300 font-medium">
            检测到本地路径，是否启动 bootstrap 导入？
          </div>
          <div className="text-[0.625rem] font-mono text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
            {path}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onAccept}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-md',
                'bg-gradient-to-r from-violet-500 to-sky-500 text-white text-xs font-medium',
                'hover:from-violet-600 hover:to-sky-600 transition-all',
              )}
            >
              <Sparkles size={11} /> 导入
            </button>
            <button
              type="button"
              onClick={() => onDismiss(false)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md',
                'text-xs text-neutral-500 dark:text-neutral-400',
                'hover:text-neutral-700 dark:hover:text-neutral-200',
                'hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors',
              )}
            >
              暂不
            </button>
            <button
              type="button"
              onClick={() => onDismiss(true)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md',
                'text-[0.625rem] text-neutral-400 dark:text-neutral-500',
                'hover:text-neutral-600 dark:hover:text-neutral-300',
                'transition-colors',
              )}
              title="30 天内不再提示"
            >
              不再提示
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(false)}
          className={cn(
            'p-1 rounded-md shrink-0',
            'text-neutral-400 dark:text-neutral-500',
            'hover:text-neutral-700 dark:hover:text-neutral-200',
            'hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors',
          )}
          aria-label="关闭"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  )
}

const ABSOLUTE_PATH_RE = /^(\/[^\s]+|~\/[^\s]+|[A-Za-z]:[\\/][^\s]+)$/

/**
 * Detects whether a pasted string looks like an absolute filesystem path.
 * Used by ChatInput's onPaste handler. Conservative on purpose — pure URL
 * pastes (http://...) or anything with whitespace get rejected.
 */
export function detectAbsolutePath(text: string): string | null {
  const trimmed = String(text || '').trim()
  if (!trimmed || trimmed.length > 4096) return null
  if (!ABSOLUTE_PATH_RE.test(trimmed)) return null
  // Reject URL-like strings that could accidentally start with "/"
  if (/^[a-z]+:\/\//i.test(trimmed)) return null
  return trimmed
}

const DISMISS_KEY = 'atomsyn:bootstrap-paste-dismissed'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

export function isPasteDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export function setPasteDismissed(value: boolean) {
  try {
    if (value) localStorage.setItem(DISMISS_KEY, String(Date.now()))
    else localStorage.removeItem(DISMISS_KEY)
  } catch { /* ignore */ }
}
