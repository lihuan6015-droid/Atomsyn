/**
 * V2.x · ChatSessionList — session list for the chat sidebar.
 *
 * Shows a "新建对话" button at top, list of sessions with title/preview/time,
 * current session highlighted with violet accent, hover menu for rename/delete.
 */

import { useState, useRef, useEffect, forwardRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, FolderOpen } from 'lucide-react'
import type { ChatSessionIndexEntry } from '@/types'
import { cn } from '@/lib/cn'

interface ChatSessionListProps {
  sessions: ChatSessionIndexEntry[]
  currentId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}

// ─── Relative time ──────────────────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  const days = Math.floor(hours / 24)
  if (days < 7) return rtf.format(-days, 'day')
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// ─── Open local session file (Tauri) ─────────────────────────────────

async function openSessionFolder(sessionId: string) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const info = await invoke<{ path: string }>('get_data_dir')
    const sessionDir = info.path + '/chat/sessions'
    await invoke('open_path', { path: sessionDir })
  } catch {
    // Web mode — no-op
  }
}

// ─── Session item with inline rename + context menu ──────────────────

const SessionItem = forwardRef<HTMLDivElement, {
  session: ChatSessionIndexEntry
  isCurrent: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}>(function SessionItem({ session, isCurrent, onSelect, onDelete, onRename }, ref) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isRenaming) inputRef.current?.focus()
  }, [isRenaming])

  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== session.title) onRename(trimmed)
    setIsRenaming(false)
    setShowMenu(false)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setShowMenu(true)
  }

  // Render the menu items (shared between hover menu and context menu)
  const menuItems = (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setRenameValue(session.title)
          setIsRenaming(true)
          setShowMenu(false)
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5"
      >
        <Pencil size={11} />
        重命名
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openSessionFolder(session.id)
          setShowMenu(false)
        }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5"
      >
        <FolderOpen size={11} />
        打开本地目录
      </button>
      <div className="my-0.5 border-t border-neutral-100 dark:border-white/5" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false) }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <Trash2 size={11} />
        删除
      </button>
    </>
  )

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
      className={cn(
        'group relative flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer',
        'transition-colors duration-150',
        isCurrent
          ? 'bg-violet-500/8 dark:bg-violet-500/10 border-l-2 border-l-violet-500'
          : 'hover:bg-neutral-50 dark:hover:bg-white/5',
      )}
    >
      <MessageSquare
        size={14}
        className={cn(
          'shrink-0 mt-0.5',
          isCurrent
            ? 'text-violet-500 dark:text-violet-400'
            : 'text-neutral-300 dark:text-neutral-600',
        )}
      />

      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit()
              if (e.key === 'Escape') { setIsRenaming(false); setShowMenu(false) }
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full text-xs font-medium bg-transparent outline-none',
              'border-b border-violet-400 dark:border-violet-500',
              'text-neutral-800 dark:text-neutral-200',
            )}
          />
        ) : (
          <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">
            {session.title}
          </div>
        )}
        {session.preview && !isRenaming && (
          <div className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 truncate mt-0.5">
            {session.preview}
          </div>
        )}
        <div className="text-[0.625rem] text-neutral-300 dark:text-neutral-600 mt-0.5">
          {relativeTime(session.updatedAt)}
        </div>
      </div>

      {/* Hover menu trigger */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShowMenu((o) => !o); setMenuPos(null) }}
          className={cn(
            'p-1 rounded',
            'opacity-0 group-hover:opacity-100',
            'text-neutral-300 dark:text-neutral-600',
            'hover:text-neutral-500 dark:hover:text-neutral-400',
            'hover:bg-neutral-100 dark:hover:bg-white/5',
            'transition-all duration-150',
          )}
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      {/* Context menu / dropdown menu */}
      {showMenu && (
        <div
          ref={menuRef}
          style={menuPos ? { position: 'fixed', left: menuPos.x, top: menuPos.y } : undefined}
          className={cn(
            !menuPos && 'absolute right-2 top-full mt-1',
            'z-50 rounded-lg border border-neutral-200/80 dark:border-white/10',
            'bg-white/95 dark:bg-neutral-900/95',
            'backdrop-blur-xl shadow-lg',
            'py-1 min-w-[120px]',
          )}
        >
          {menuItems}
        </div>
      )}
    </motion.div>
  )
})

// ─── Main component ──────────────────────────────────────────────────

export function ChatSessionList({
  sessions,
  currentId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ChatSessionListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* New session button */}
      <div className="px-3 py-3">
        <button
          type="button"
          onClick={onCreate}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg',
            'text-xs font-medium',
            'border border-dashed border-neutral-300 dark:border-white/15',
            'text-neutral-500 dark:text-neutral-400',
            'hover:border-violet-400 dark:hover:border-violet-500/40',
            'hover:text-violet-600 dark:hover:text-violet-400',
            'hover:bg-violet-50/50 dark:hover:bg-violet-500/5',
            'transition-all duration-200',
          )}
        >
          <Plus size={14} />
          新建对话
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-3 scrollbar-thin">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare size={24} className="text-neutral-200 dark:text-neutral-700 mb-2" />
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              还没有对话记录
            </p>
            <p className="text-[0.625rem] text-neutral-300 dark:text-neutral-600 mt-0.5">
              点击上方按钮开始新对话
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {sessions.map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                isCurrent={s.id === currentId}
                onSelect={() => onSelect(s.id)}
                onDelete={() => onDelete(s.id)}
                onRename={(title) => onRename(s.id, title)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
