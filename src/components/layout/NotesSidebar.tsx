/**
 * V2.0 M6 Sprint 4 · Notes mode sidebar — folder tree + CTA
 *
 * Structure:
 * 1. "新建笔记" CTA (amber gradient)
 * 2. 📁 全部笔记 (fixed entry)
 * 3. User folder tree (recursive, right-click CRUD, DnD drop target)
 * 4. 🗑 废纸篓 (fixed bottom, right-click: clear all)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { FilePlus, FileText, FolderOpen, FolderClosed, FolderPlus, Trash2, PanelLeftClose, ChevronRight } from 'lucide-react'
import { useNotesStore } from '@/stores/useNotesStore'
import { ContextMenu } from '@/components/shared/ContextMenu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import type { ContextMenuItem } from '@/components/shared/ContextMenu'
import type { NoteGroup } from '@/types'
import { cn } from '@/lib/cn'

export function NotesSidebar() {
  const notes = useNotesStore((s) => s.notes)
  const trashNotes = useNotesStore((s) => s.trashNotes)
  const activeGroupId = useNotesStore((s) => s.activeGroupId)
  const showTrash = useNotesStore((s) => s.showTrash)
  const setActiveGroup = useNotesStore((s) => s.setActiveGroup)
  const setShowTrash = useNotesStore((s) => s.setShowTrash)
  const createNote = useNotesStore((s) => s.createNote)
  const globalMeta = useNotesStore((s) => s.globalMeta)
  const createGroup = useNotesStore((s) => s.createGroup)
  const renameGroup = useNotesStore((s) => s.renameGroup)
  const deleteGroup = useNotesStore((s) => s.deleteGroup)
  const moveNote = useNotesStore((s) => s.moveNote)

  const groups = globalMeta?.groups ?? []

  // ─── Folder expand/collapse ────────────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Auto-expand ancestors of the active group
  useMemo(() => {
    if (!activeGroupId) return
    const toExpand = new Set(expandedGroups)
    let changed = false
    // Walk up the parent chain
    let current = groups.find((g) => g.id === activeGroupId)
    while (current?.parentId) {
      if (!toExpand.has(current.parentId)) {
        toExpand.add(current.parentId)
        changed = true
      }
      current = groups.find((g) => g.id === current!.parentId)
    }
    if (changed) setExpandedGroups(toExpand)
  }, [activeGroupId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpanded(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })
  }

  // ─── Context menu state ────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  // ─── Inline create/rename ──────────────────────────────────────
  const [inlineMode, setInlineMode] = useState<{
    type: 'create' | 'rename'
    parentId: string | null
    groupId?: string
    value: string
  } | null>(null)
  const inlineRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inlineMode && inlineRef.current) inlineRef.current.focus()
  }, [inlineMode])

  const commitInline = useCallback(() => {
    if (!inlineMode) return
    const val = inlineMode.value.trim()
    if (inlineMode.type === 'create' && val) {
      createGroup(val, inlineMode.parentId)
    } else if (inlineMode.type === 'rename' && val && inlineMode.groupId) {
      renameGroup(inlineMode.groupId, val)
    }
    setInlineMode(null)
  }, [inlineMode, createGroup, renameGroup])

  // ─── Delete folder confirm ─────────────────────────────────────
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<NoteGroup | null>(null)
  const notesInGroup = confirmDeleteGroup
    ? notes.filter(
        (n) =>
          n.groupId === confirmDeleteGroup.id ||
          n.groupId.startsWith(confirmDeleteGroup.id + '/'),
      ).length
    : 0

  // ─── Clear trash confirm ───────────────────────────────────────
  const [confirmClearTrash, setConfirmClearTrash] = useState(false)

  async function handleCreate() {
    try {
      await createNote(activeGroupId || '')
    } catch (err) {
      // Show error visibly in packaged mode where DevTools may not be open
      console.error('[NotesSidebar] create failed:', err)
      alert(`笔记创建失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ─── Root right-click: new folder ──────────────────────────────
  function handleRootContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: '新建文件夹',
          icon: FolderPlus,
          action: () => {
            setInlineMode({ type: 'create', parentId: null, value: '' })
            setCtxMenu(null)
          },
        },
      ],
    })
  }

  // ─── Folder right-click ────────────────────────────────────────
  function handleFolderContextMenu(e: React.MouseEvent, group: NoteGroup) {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: '新建子文件夹',
          icon: FolderPlus,
          action: () => {
            setInlineMode({ type: 'create', parentId: group.id, value: '' })
            setCtxMenu(null)
          },
        },
        {
          label: '重命名',
          action: () => {
            setInlineMode({ type: 'rename', parentId: group.parentId, groupId: group.id, value: group.name })
            setCtxMenu(null)
          },
        },
        {
          label: '删除',
          icon: Trash2,
          danger: true,
          action: () => {
            setConfirmDeleteGroup(group)
            setCtxMenu(null)
          },
        },
      ],
    })
  }

  // ─── Trash right-click ─────────────────────────────────────────
  function handleTrashContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    if (trashNotes.length === 0) return
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: '清空废纸篓',
          icon: Trash2,
          danger: true,
          action: () => {
            setConfirmClearTrash(true)
            setCtxMenu(null)
          },
        },
      ],
    })
  }

  // ─── DnD drop on folder ────────────────────────────────────────
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null)
  const dragLeaveTimer = useRef<ReturnType<typeof setTimeout>>()

  function handleDrop(e: React.DragEvent, targetGroupId: string) {
    e.preventDefault()
    e.stopPropagation()
    clearTimeout(dragLeaveTimer.current)
    setDragOverGroupId(null)
    const noteId = e.dataTransfer.getData('note-id')
    if (noteId) moveNote(noteId, targetGroupId)
  }

  function handleDragOver(e: React.DragEvent, groupId: string) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    // Clear any pending drag-leave so child→parent transitions don't flicker
    clearTimeout(dragLeaveTimer.current)
    setDragOverGroupId(groupId)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.stopPropagation()
    // Delay clearing to avoid flicker when moving between child elements
    // (dragLeave fires on parent before dragEnter fires on child)
    clearTimeout(dragLeaveTimer.current)
    dragLeaveTimer.current = setTimeout(() => setDragOverGroupId(null), 50)
  }

  // Sidebar root must also preventDefault on dragOver to allow cross-panel drops
  function handleSidebarDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // ─── Render folder tree item ───────────────────────────────────
  function renderGroup(group: NoteGroup, depth: number) {
    const isActive = !showTrash && activeGroupId === group.id
    const isEditing = inlineMode?.type === 'rename' && inlineMode.groupId === group.id
    const isDragOver = dragOverGroupId === group.id
    const children = groups
      .filter((g) => g.parentId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const hasChildren = children.length > 0
    const isExpanded = expandedGroups.has(group.id)
    const FolderIcon = isExpanded || isActive ? FolderOpen : FolderClosed

    return (
      <div key={group.id}>
        <button
          onClick={() => {
            setActiveGroup(group.id)
            // Auto-expand when selecting a folder with children
            if (hasChildren && !isExpanded) toggleExpanded(group.id)
          }}
          onContextMenu={(e) => handleFolderContextMenu(e, group)}
          onDrop={(e) => handleDrop(e, group.id)}
          onDragOver={(e) => handleDragOver(e, group.id)}
          onDragLeave={(e) => handleDragLeave(e)}
          className={cn(
            'w-full flex items-center gap-1.5 py-1.5 rounded-lg text-[0.8125rem] transition-colors',
            isActive
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900',
            isDragOver && 'ring-2 ring-amber-400/60 bg-amber-500/5',
          )}
          style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: 12 }}
        >
          {/* Chevron for folders with children */}
          {hasChildren ? (
            <span
              onClick={(e) => { e.stopPropagation(); toggleExpanded(group.id) }}
              className="w-4 h-4 flex items-center justify-center shrink-0"
            >
              <ChevronRight className={cn(
                'w-3 h-3 transition-transform duration-150',
                isExpanded && 'rotate-90',
              )} />
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <FolderIcon className="w-3.5 h-3.5 shrink-0" />
          {isEditing ? (
            <input
              ref={inlineRef}
              value={inlineMode!.value}
              onChange={(e) => setInlineMode({ ...inlineMode!, value: e.target.value })}
              onBlur={commitInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInline()
                if (e.key === 'Escape') setInlineMode(null)
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[0.8125rem] bg-transparent border-b border-amber-400 dark:border-amber-700 dark:text-neutral-200 focus:outline-none flex-1 min-w-0"
            />
          ) : (
            <span className="truncate">{group.name}</span>
          )}
        </button>

        {/* Children (only rendered when expanded) */}
        {isExpanded && (
          <>
            {/* Inline create child */}
            {inlineMode?.type === 'create' && inlineMode.parentId === group.id && (
              <div
                className="flex items-center gap-1.5 py-1.5 rounded-lg"
                style={{ paddingLeft: `${8 + (depth + 1) * 16}px`, paddingRight: 12 }}
              >
                <span className="w-4 shrink-0" />
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                <input
                  ref={inlineRef}
                  value={inlineMode.value}
                  onChange={(e) => setInlineMode({ ...inlineMode, value: e.target.value })}
                  onBlur={commitInline}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitInline()
                    if (e.key === 'Escape') setInlineMode(null)
                  }}
                  placeholder="文件夹名称"
                  className="text-[0.8125rem] bg-transparent border-b border-amber-400 focus:outline-none flex-1 min-w-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                />
              </div>
            )}
            {children.map((c) => renderGroup(c, depth + 1))}
          </>
        )}

        {/* When creating a child but parent not expanded, auto-expand */}
        {!isExpanded && inlineMode?.type === 'create' && inlineMode.parentId === group.id && (
          <div
            className="flex items-center gap-1.5 py-1.5 rounded-lg"
            style={{ paddingLeft: `${8 + (depth + 1) * 16}px`, paddingRight: 12 }}
          >
            <span className="w-4 shrink-0" />
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
            <input
              ref={inlineRef}
              value={inlineMode.value}
              onChange={(e) => setInlineMode({ ...inlineMode, value: e.target.value })}
              onBlur={commitInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInline()
                if (e.key === 'Escape') setInlineMode(null)
              }}
              placeholder="文件夹名称"
              className="text-[0.8125rem] bg-transparent border-b border-amber-400 focus:outline-none flex-1 min-w-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
        )}
      </div>
    )
  }

  const rootGroups = groups.filter((g) => !g.parentId).sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div
      className="px-3 py-2 space-y-1 flex flex-col h-full"
      onDragOver={handleSidebarDragOver}
      onContextMenu={(e) => {
        // Only trigger root context menu if clicking on empty area
        if ((e.target as HTMLElement).closest('button')) return
        handleRootContextMenu(e)
      }}
    >
      {/* ─── Primary CTA ─── */}
      <button
        onClick={handleCreate}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.98] transition-all"
      >
        <FilePlus className="w-4 h-4" />
        新建笔记
        <kbd className="ml-auto text-[0.625rem] font-mono opacity-60">⌘N</kbd>
      </button>

      {/* ─── Fixed: 全部笔记 (also a DnD drop target for "root") ─── */}
      <div className="pt-3">
        <button
          onClick={() => setActiveGroup(null)}
          onDrop={(e) => handleDrop(e, '')}
          onDragOver={(e) => handleDragOver(e, '__all__')}
          onDragLeave={(e) => handleDragLeave(e)}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.8125rem] transition-colors',
            !showTrash && activeGroupId === null
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900',
            dragOverGroupId === '__all__' && 'ring-2 ring-amber-400/60 bg-amber-500/5',
          )}
        >
          <FileText className="w-4 h-4" />
          全部笔记
          <span className="ml-auto text-[0.625rem] text-neutral-400 dark:text-neutral-500 tabular-nums">
            {notes.length}
          </span>
        </button>
      </div>

      {/* ─── User folder tree ─── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pt-2 space-y-0.5">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            文件夹
          </span>
          <button
            onClick={() => useNotesStore.getState().setSidebarCollapsed(true)}
            className="p-0.5 rounded hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
            title="折叠侧边栏 (⌘\)"
          >
            <PanelLeftClose className="w-3 h-3 text-neutral-400" />
          </button>
        </div>

        {rootGroups.length === 0 && !inlineMode ? (
          <p className="text-[0.6875rem] text-neutral-400/60 dark:text-neutral-500/60 px-3 leading-relaxed">
            右键可新建文件夹
          </p>
        ) : (
          rootGroups.map((group) => renderGroup(group, 0))
        )}

        {/* Inline create at root level */}
        {inlineMode?.type === 'create' && inlineMode.parentId === null && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg">
            <FolderOpen className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
            <input
              ref={inlineRef}
              value={inlineMode.value}
              onChange={(e) => setInlineMode({ ...inlineMode, value: e.target.value })}
              onBlur={commitInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInline()
                if (e.key === 'Escape') setInlineMode(null)
              }}
              placeholder="文件夹名称"
              className="text-[0.8125rem] bg-transparent border-b border-amber-400 focus:outline-none flex-1 min-w-0 placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
            />
          </div>
        )}
      </div>

      {/* ─── Fixed: 废纸篓 ─── */}
      <div className="shrink-0 pt-1 border-t border-neutral-200/50 dark:border-neutral-800/50">
        <button
          onClick={() => setShowTrash(true)}
          onContextMenu={handleTrashContextMenu}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[0.8125rem] transition-colors',
            showTrash
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium'
              : 'text-neutral-500 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900',
          )}
        >
          <Trash2 className="w-4 h-4" />
          废纸篓
          {trashNotes.length > 0 && (
            <span className="ml-auto text-[0.625rem] text-neutral-400 dark:text-neutral-500 tabular-nums">
              {trashNotes.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── Context menu portal ─── */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ─── Confirm: delete folder ─── */}
      <ConfirmDialog
        open={!!confirmDeleteGroup}
        title={`删除文件夹"${confirmDeleteGroup?.name ?? ''}"？`}
        description={
          notesInGroup > 0
            ? `文件夹中有 ${notesInGroup} 条笔记，将移至根目录。`
            : '文件夹为空，将直接删除。'
        }
        confirmLabel="删除"
        danger
        onConfirm={async () => {
          if (confirmDeleteGroup) {
            await deleteGroup(confirmDeleteGroup.id)
            if (activeGroupId === confirmDeleteGroup.id) setActiveGroup(null)
          }
          setConfirmDeleteGroup(null)
        }}
        onCancel={() => setConfirmDeleteGroup(null)}
      />

      {/* ─── Confirm: clear trash ─── */}
      <ConfirmDialog
        open={confirmClearTrash}
        title="清空废纸篓？"
        description={`将永久删除 ${trashNotes.length} 条笔记，此操作不可撤销。`}
        confirmLabel="清空"
        danger
        onConfirm={async () => {
          const permDel = useNotesStore.getState().permanentDelete
          for (const n of trashNotes) {
            await permDel(n.id)
          }
          setConfirmClearTrash(false)
        }}
        onCancel={() => setConfirmClearTrash(false)}
      />
    </div>
  )
}
