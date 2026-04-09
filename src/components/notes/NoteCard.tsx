/**
 * V2.0 M6 Sprint 3-4 · NoteCard — single note item in the list
 *
 * Shows: title, preview, relative date, tags, pin indicator,
 * crystallize status. Right-click: pin, rename, move, delete.
 * Draggable for cross-panel DnD onto sidebar folders.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Pin, Trash2, FolderInput, ArrowUpFromLine, Trash, Undo2, Pen, ChevronRight, FolderOpen, FolderClosed } from 'lucide-react'
import { cn } from '@/lib/cn'
import { ContextMenu } from '@/components/shared/ContextMenu'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'
import type { Note, NoteGroup } from '@/types'

// ─── Relative date formatting ─────────────────────────────────────

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })

function relativeDate(iso: string): string {
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

// ─── Helpers ──────────────────────────────────────────────────────

export function noteDisplayName(note: Note): string {
  if (note.title) return note.title
  const firstLine = note.content?.split('\n').find((l) => l.trim()) || ''
  const clean = firstLine.replace(/^#+\s*/, '').trim()
  return clean.slice(0, 40) || '新笔记'
}

function notePreview(note: Note): string {
  return (
    note.content
      ?.split('\n')
      .slice(1)
      .filter((l) => l.trim() && !l.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .slice(0, 80) || ''
  )
}

// ─── CrystallizeStatus dot ────────────────────────────────────────

function StatusDot({ status, updatedAt, crystallizedAt }: {
  status: Note['crystallizeStatus']
  updatedAt: string
  crystallizedAt?: string
}) {
  if (status === 'none') return null
  if (status === 'parsing') {
    return (
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="正在解析..." />
    )
  }
  if (status === 'parsed') {
    const hasUpdates = crystallizedAt && updatedAt > crystallizedAt
    return (
      <span
        className={cn('w-2 h-2 rounded-full', hasUpdates ? 'bg-amber-400' : 'bg-emerald-400')}
        title={hasUpdates ? '有新修改，可再次沉淀' : '已沉淀'}
      />
    )
  }
  if (status === 'failed') {
    return <span className="w-2 h-2 rounded-full bg-red-400" title="沉淀失败" />
  }
  return null
}

// ─── Move popover ─────────────────────────────────────────────────

function MovePopover({ groups, currentGroupId, onMove, onClose }: {
  groups: NoteGroup[]
  currentGroupId: string
  onMove: (groupId: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Auto-expand ancestors of the current group
    const set = new Set<string>()
    let cur = groups.find((g) => g.id === currentGroupId)
    while (cur?.parentId) {
      set.add(cur.parentId)
      cur = groups.find((g) => g.id === cur!.parentId)
    }
    return set
  })

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handle, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handle, true)
    }
  }, [onClose])

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const rootGroups = groups.filter((g) => !g.parentId).sort((a, b) => a.sortOrder - b.sortOrder)

  function renderGroup(group: NoteGroup, depth: number) {
    const children = groups.filter((g) => g.parentId === group.id).sort((a, b) => a.sortOrder - b.sortOrder)
    const isCurrent = group.id === currentGroupId
    const hasChildren = children.length > 0
    const isOpen = expanded.has(group.id)
    const Icon = isOpen ? FolderOpen : FolderClosed
    return (
      <div key={group.id}>
        <div className="flex items-center">
          {hasChildren ? (
            <button
              onClick={() => toggle(group.id)}
              className="w-5 h-5 flex items-center justify-center shrink-0"
              style={{ marginLeft: `${4 + depth * 14}px` }}
            >
              <ChevronRight className={cn('w-3 h-3 text-neutral-400 transition-transform duration-150', isOpen && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-5 shrink-0" style={{ marginLeft: `${4 + depth * 14}px` }} />
          )}
          <button
            onClick={() => { onMove(group.id); onClose() }}
            disabled={isCurrent}
            className={cn(
              'flex-1 flex items-center gap-1.5 py-1.5 pr-3 text-[0.75rem] transition-colors text-left',
              isCurrent
                ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5',
            )}
          >
            <Icon className="w-3 h-3 shrink-0" />
            {group.name}
            {isCurrent && <span className="text-[0.625rem] text-neutral-400/60 ml-1">(当前)</span>}
          </button>
        </div>
        {hasChildren && isOpen && children.map((c) => renderGroup(c, depth + 1))}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 min-w-[180px] max-h-[240px] overflow-y-auto py-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50"
    >
      <div className="px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        移动到
      </div>
      {/* Root level (no group) */}
      <button
        onClick={() => { onMove(''); onClose() }}
        disabled={!currentGroupId}
        className={cn(
          'w-full text-left px-3 py-1.5 text-[0.75rem] transition-colors',
          !currentGroupId
            ? 'text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
            : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5',
        )}
      >
        <FolderOpen className="w-3 h-3 shrink-0 inline mr-1.5" />
        根目录
        {!currentGroupId && <span className="text-[0.625rem] text-neutral-400/60 ml-1">(当前)</span>}
      </button>
      {rootGroups.map((g) => renderGroup(g, 0))}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────

interface NoteCardProps {
  note: Note
  isActive: boolean
  isTrash?: boolean
  groups?: NoteGroup[]
  onSelect: () => void
  onPin?: () => void
  onDelete?: () => void
  onRestore?: () => void
  onPermDelete?: () => void
  onMove?: (groupId: string) => void
  onRename?: (newTitle: string) => void
}

export function NoteCard({
  note,
  isActive,
  isTrash,
  groups = [],
  onSelect,
  onPin,
  onDelete,
  onRestore,
  onPermDelete,
  onMove,
  onRename,
}: NoteCardProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [showMovePopover, setShowMovePopover] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const title = noteDisplayName(note)
  const preview = notePreview(note)
  const date = relativeDate(note.updatedAt)

  // ─── Rename ─────────────────────────────────────────────────────
  function startRename() {
    setRenameValue(note.title || title)
    setIsRenaming(true)
    setCtxMenu(null)
  }

  function commitRename() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== note.title) {
      onRename?.(trimmed)
    }
    setIsRenaming(false)
  }

  useEffect(() => {
    if (isRenaming && renameRef.current) renameRef.current.focus()
  }, [isRenaming])

  // Build context menu items
  const menuItems: ContextMenuItem[] = isTrash
    ? [
        { label: '恢复', icon: Undo2, action: () => { onRestore?.(); setCtxMenu(null) } },
        { label: '永久删除', icon: Trash, action: () => { onPermDelete?.(); setCtxMenu(null) }, danger: true },
      ]
    : [
        {
          label: note.pinned ? '取消置顶' : '置顶',
          icon: Pin,
          action: () => { onPin?.(); setCtxMenu(null) },
        },
        {
          label: '重命名',
          icon: Pen,
          action: startRename,
        },
        {
          label: '移动到...',
          icon: FolderInput,
          action: () => { setShowMovePopover(true); setCtxMenu(null) },
        },
        {
          label: '删除',
          icon: Trash2,
          action: () => { onDelete?.(); setCtxMenu(null) },
          danger: true,
        },
      ]

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        draggable={!isTrash && !isRenaming}
        onDragStart={(e) => {
          e.dataTransfer.setData('note-id', note.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        className={cn(
          'w-full text-left rounded-lg px-3 py-2.5 transition-colors group relative',
          isActive
            ? 'bg-amber-500/10 border-l-2 border-amber-500'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-900',
        )}
      >
        {/* Pin indicator */}
        {note.pinned && (
          <ArrowUpFromLine className="absolute top-2 right-2 w-3 h-3 text-amber-500/60" />
        )}

        {/* Title (inline rename or display) */}
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium w-full bg-transparent border-b border-amber-400 dark:border-amber-700 dark:text-neutral-200 focus:outline-none pr-5"
          />
        ) : (
          <div className="text-sm font-medium truncate pr-5">{title}</div>
        )}

        {/* Preview */}
        {preview && !isRenaming && (
          <div className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500 line-clamp-2 mt-0.5">
            {preview}
          </div>
        )}

        {/* Footer: date + tags + status */}
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[0.625rem] text-neutral-400/60 dark:text-neutral-500/60">
            {date}
          </span>

          {/* Tags (max 3) */}
          {note.tags.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  {tag}
                </span>
              ))}
              {note.tags.length > 3 && (
                <span className="text-[0.5625rem] text-neutral-400 dark:text-neutral-500">
                  +{note.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Crystallize status */}
          <div className="ml-auto">
            <StatusDot
              status={note.crystallizeStatus}
              updatedAt={note.updatedAt}
              crystallizedAt={note.crystallizedAt}
            />
          </div>
        </div>

        {/* Trash indicator */}
        {isTrash && (
          <div className="text-[0.5625rem] text-red-400/70 mt-0.5">已删除</div>
        )}
      </button>

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Move popover */}
      {showMovePopover && (
        <MovePopover
          groups={groups}
          currentGroupId={note.groupId}
          onMove={(gid) => onMove?.(gid)}
          onClose={() => setShowMovePopover(false)}
        />
      )}
    </div>
  )
}
