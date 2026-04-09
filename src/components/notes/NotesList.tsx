/**
 * V2.0 M6 Sprint 3-4 · NotesList — notes list panel
 *
 * Search bar (bigram, 200ms debounce) + sort selector + pinned
 * section + note cards + empty states. Trash view with restore/
 * perm-delete. Delete & perm-delete use ConfirmDialog.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Search, X, ArrowDownWideNarrow } from 'lucide-react'
import { useNotesStore } from '@/stores/useNotesStore'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { NoteCard } from './NoteCard'
import type { Note, NotesSortOrder } from '@/types'

const SORT_OPTIONS: { value: NotesSortOrder; label: string }[] = [
  { value: 'updatedAt', label: '最近修改' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'title', label: '标题' },
]

interface NotesListProps {
  notes: Note[]
  activeNoteId: string | null
}

export function NotesList({ notes, activeNoteId }: NotesListProps) {
  const showTrash = useNotesStore((s) => s.showTrash)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const sortOrder = useNotesStore((s) => s.sortOrder)
  const globalMeta = useNotesStore((s) => s.globalMeta)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setSortOrder = useNotesStore((s) => s.setSortOrder)
  const setActiveNote = useNotesStore((s) => s.setActiveNote)
  const togglePin = useNotesStore((s) => s.togglePin)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const restoreNote = useNotesStore((s) => s.restoreNote)
  const permanentDelete = useNotesStore((s) => s.permanentDelete)
  const moveNote = useNotesStore((s) => s.moveNote)
  const updateNote = useNotesStore((s) => s.updateNote)

  const groups = globalMeta?.groups ?? []

  // ─── Confirm dialogs ───────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmPermDelete, setConfirmPermDelete] = useState<string | null>(null)

  // ─── Search with 200ms debounce ────────────────────────────────
  const [localQuery, setLocalQuery] = useState(searchQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setLocalQuery(searchQuery)
  }, [searchQuery])

  const handleSearch = useCallback(
    (value: string) => {
      setLocalQuery(value)
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => setSearchQuery(value), 200)
    },
    [setSearchQuery],
  )

  const clearSearch = useCallback(() => {
    setLocalQuery('')
    setSearchQuery('')
  }, [setSearchQuery])

  // ─── Sort dropdown ─────────────────────────────────────────────
  const [showSort, setShowSort] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showSort) return
    function handleClick(e: MouseEvent) {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setShowSort(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showSort])

  // ─── Pinned / unpinned split ───────────────────────────────────
  const pinnedNotes = notes.filter((n) => n.pinned)
  const unpinnedNotes = notes.filter((n) => !n.pinned)
  const hasPinned = pinnedNotes.length > 0 && !showTrash && !searchQuery.trim()

  // ─── Rename handler ────────────────────────────────────────────
  const handleRename = useCallback(
    (id: string, newTitle: string) => {
      updateNote(id, { title: newTitle })
    },
    [updateNote],
  )

  // ─── Move handler ──────────────────────────────────────────────
  const handleMove = useCallback(
    (id: string, groupId: string) => {
      moveNote(id, groupId)
    },
    [moveNote],
  )

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header: count + search + sort ─── */}
      <div className="shrink-0 px-3 pt-[36px] pb-1.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            {showTrash ? '废纸篓' : `${notes.length} 条笔记`}
          </span>

          {/* Sort button */}
          {!showTrash && (
            <div className="relative" ref={sortRef}>
              <button
                onClick={() => setShowSort(!showSort)}
                className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="排序"
              >
                <ArrowDownWideNarrow className="w-3.5 h-3.5" />
              </button>

              {showSort && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] py-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortOrder(opt.value); setShowSort(false) }}
                      className={`w-full text-left px-3 py-1.5 text-[0.75rem] transition-colors ${
                        sortOrder === opt.value
                          ? 'text-amber-600 dark:text-amber-400 bg-amber-500/5'
                          : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search bar */}
        {!showTrash && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索笔记..."
              className="w-full pl-8 pr-7 py-1.5 text-[0.75rem] rounded-lg bg-neutral-100 dark:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 outline-none focus:ring-1 focus:ring-amber-500/30 transition-all"
            />
            {localQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ─── Notes list ─── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-4">
        {notes.length === 0 ? (
          <EmptyState isTrash={showTrash} hasSearch={!!searchQuery.trim()} />
        ) : (
          <>
            {/* Pinned section */}
            {hasPinned && (
              <>
                <div className="px-2 pt-2 pb-1">
                  <span className="text-[0.625rem] font-medium text-neutral-400/70 dark:text-neutral-500/60 uppercase tracking-wider">
                    已置顶
                  </span>
                </div>
                <div className="space-y-0.5">
                  {pinnedNotes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      isActive={activeNoteId === note.id}
                      groups={groups}
                      onSelect={() => setActiveNote(note.id)}
                      onPin={() => togglePin(note.id)}
                      onDelete={() => setConfirmDelete(note.id)}
                      onMove={(gid) => handleMove(note.id, gid)}
                      onRename={(t) => handleRename(note.id, t)}
                    />
                  ))}
                </div>
                <div className="mx-3 my-2 border-t border-neutral-200/40 dark:border-neutral-800/40" />
              </>
            )}

            {/* Regular / trash notes */}
            <div className="space-y-0.5">
              {(hasPinned ? unpinnedNotes : notes).map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  isActive={activeNoteId === note.id}
                  isTrash={showTrash}
                  groups={groups}
                  onSelect={() => setActiveNote(note.id)}
                  onPin={() => togglePin(note.id)}
                  onDelete={() => setConfirmDelete(note.id)}
                  onRestore={() => restoreNote(note.id)}
                  onPermDelete={() => setConfirmPermDelete(note.id)}
                  onMove={(gid) => handleMove(note.id, gid)}
                  onRename={(t) => handleRename(note.id, t)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── Confirm: soft delete ─── */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除笔记"
        description="笔记将移到废纸篓，可以随时恢复。"
        confirmLabel="删除"
        danger
        onConfirm={async () => {
          if (confirmDelete) await deleteNote(confirmDelete)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ─── Confirm: permanent delete ─── */}
      <ConfirmDialog
        open={!!confirmPermDelete}
        title="永久删除"
        description="此操作不可撤销，笔记将被彻底删除。"
        confirmLabel="永久删除"
        danger
        onConfirm={async () => {
          if (confirmPermDelete) await permanentDelete(confirmPermDelete)
          setConfirmPermDelete(null)
        }}
        onCancel={() => setConfirmPermDelete(null)}
      />
    </div>
  )
}

// ─── Empty states ─────────────────────────────────────────────────

function EmptyState({ isTrash, hasSearch }: { isTrash: boolean; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 text-center px-4">
        <Search className="w-5 h-5 text-neutral-300 dark:text-neutral-600 mb-2" />
        <p className="text-xs text-neutral-400 dark:text-neutral-500">没有匹配的笔记</p>
      </div>
    )
  }

  if (isTrash) {
    return (
      <div className="flex flex-col items-center justify-center pt-20 text-center px-4">
        <p className="text-xs text-neutral-400 dark:text-neutral-500">废纸篓是空的</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center pt-20 text-center px-4">
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
        <FileText className="w-5 h-5 text-amber-500" />
      </div>
      <p className="text-xs text-neutral-400 dark:text-neutral-500">还没有笔记</p>
      <p className="text-[0.625rem] text-neutral-400/60 dark:text-neutral-500/60 mt-1">
        按 ⌘N 新建笔记
      </p>
    </div>
  )
}
