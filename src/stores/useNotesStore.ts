/**
 * V2.0 M6 · Notes Zustand store
 *
 * File-backed state — notes are loaded from API on mount.
 * Panel widths are persisted separately to localStorage.
 */

import { create } from 'zustand'
import { notesApi } from '@/lib/dataApi'
import type { Note, NoteGroup, NotesMeta, NotesSortOrder } from '@/types'

const PANEL_WIDTHS_KEY = 'atomsyn-notes-panel-widths'

interface PanelWidths {
  list: number
}

function loadPanelWidths(): PanelWidths {
  try {
    const raw = localStorage.getItem(PANEL_WIDTHS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { list: 280 }
}

function savePanelWidths(w: PanelWidths) {
  localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(w))
}

// ─── Bigram search ───────────────────────────────────────────────────

function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  const lower = s.toLowerCase()
  for (let i = 0; i < lower.length - 1; i++) {
    set.add(lower.slice(i, i + 2))
  }
  return set
}

function bigramScore(query: string, text: string): number {
  const qBigrams = bigrams(query)
  const tBigrams = bigrams(text)
  let hits = 0
  for (const b of qBigrams) {
    if (tBigrams.has(b)) hits++
  }
  return qBigrams.size > 0 ? hits / qBigrams.size : 0
}

// ─── Store ───────────────────────────────────────────────────────────

interface NotesState {
  // Data
  notes: Note[]
  trashNotes: Note[]
  globalMeta: NotesMeta | null
  loaded: boolean

  // UI state
  activeNoteId: string | null
  activeGroupId: string | null  // null = "全部笔记"
  showTrash: boolean
  searchQuery: string
  sortOrder: NotesSortOrder
  panelWidths: PanelWidths
  unsavedNoteIds: Set<string>
  sidebarCollapsed: boolean

  // Actions
  loadAll: () => Promise<void>
  createNote: (groupId: string) => Promise<Note>
  updateNote: (id: string, data: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  restoreNote: (id: string) => Promise<void>
  permanentDelete: (id: string) => Promise<void>
  moveNote: (id: string, targetGroupId: string) => Promise<void>
  togglePin: (id: string) => Promise<void>
  setActiveNote: (id: string | null) => void
  setActiveGroup: (id: string | null) => void
  setShowTrash: (v: boolean) => void
  setSearchQuery: (q: string) => void
  setSortOrder: (s: NotesSortOrder) => void
  setPanelWidths: (w: PanelWidths) => void
  markUnsaved: (id: string, unsaved: boolean) => void
  setSidebarCollapsed: (v: boolean) => void

  // Group management
  createGroup: (name: string, parentId?: string | null) => Promise<void>
  renameGroup: (id: string, name: string) => Promise<void>
  deleteGroup: (id: string) => Promise<void>

  // Computed
  filteredNotes: () => Note[]
}

function sortNotes(notes: Note[], order: NotesSortOrder): Note[] {
  const sorted = [...notes]
  sorted.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    switch (order) {
      case 'updatedAt':
        return b.updatedAt.localeCompare(a.updatedAt)
      case 'createdAt':
        return b.createdAt.localeCompare(a.createdAt)
      case 'title':
        return a.title.localeCompare(b.title, 'zh-CN')
      default:
        return 0
    }
  })
  return sorted
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  trashNotes: [],
  globalMeta: null,
  loaded: false,

  activeNoteId: null,
  activeGroupId: null,
  showTrash: false,
  searchQuery: '',
  sortOrder: 'updatedAt',
  panelWidths: loadPanelWidths(),
  unsavedNoteIds: new Set(),
  sidebarCollapsed: false,

  loadAll: async () => {
    const [notes, trashNotes, meta] = await Promise.all([
      notesApi.list(),
      notesApi.listTrash(),
      notesApi.meta(),
    ])
    set({ notes, trashNotes, globalMeta: meta, loaded: true })
  },

  createNote: async (groupId: string) => {
    const note = await notesApi.create({ title: '', groupId })
    set((s) => ({
      notes: [note, ...s.notes],
      activeNoteId: note.id,
      showTrash: false,
    }))
    return note
  },

  updateNote: async (id: string, data: Partial<Note>) => {
    const updated = await notesApi.update(id, data)
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...updated } : n)),
    }))
  },

  deleteNote: async (id: string) => {
    await notesApi.remove(id)
    const note = get().notes.find((n) => n.id === id)
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      trashNotes: note ? [{ ...note, deletedAt: new Date().toISOString() }, ...s.trashNotes] : s.trashNotes,
      activeNoteId: s.activeNoteId === id ? null : s.activeNoteId,
    }))
  },

  restoreNote: async (id: string) => {
    const restored = await notesApi.restore(id)
    set((s) => ({
      trashNotes: s.trashNotes.filter((n) => n.id !== id),
      notes: [restored, ...s.notes],
    }))
  },

  permanentDelete: async (id: string) => {
    await notesApi.permDelete(id)
    set((s) => ({
      trashNotes: s.trashNotes.filter((n) => n.id !== id),
    }))
  },

  moveNote: async (id: string, targetGroupId: string) => {
    const moved = await notesApi.move(id, targetGroupId)
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...moved } : n)),
    }))
  },

  togglePin: async (id: string) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    const updated = await notesApi.update(id, { pinned: !note.pinned })
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...updated } : n)),
    }))
  },

  setActiveNote: (id) => set({ activeNoteId: id }),
  setActiveGroup: (id) => set({ activeGroupId: id, showTrash: false }),
  setShowTrash: (v) => set({ showTrash: v, activeGroupId: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortOrder: (s) => set({ sortOrder: s }),
  setPanelWidths: (w) => {
    set({ panelWidths: w })
    savePanelWidths(w)
  },
  markUnsaved: (id, unsaved) =>
    set((s) => {
      const next = new Set(s.unsavedNoteIds)
      unsaved ? next.add(id) : next.delete(id)
      return { unsavedNoteIds: next }
    }),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  // ─── Group management ────────────────────────────────────────────

  createGroup: async (name: string, parentId?: string | null) => {
    const meta = get().globalMeta
    if (!meta) return
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'group'
    const now = new Date().toISOString()
    const newGroup: NoteGroup = {
      id: parentId ? `${parentId}/${id}` : id,
      name,
      parentId: parentId ?? null,
      sortOrder: meta.groups.length,
      createdAt: now,
      updatedAt: now,
    }
    const updated = { ...meta, groups: [...meta.groups, newGroup] }
    await notesApi.updateMeta(updated)
    set({ globalMeta: updated })
  },

  renameGroup: async (id: string, name: string) => {
    const meta = get().globalMeta
    if (!meta) return
    const updated = {
      ...meta,
      groups: meta.groups.map((g) =>
        g.id === id ? { ...g, name, updatedAt: new Date().toISOString() } : g,
      ),
    }
    await notesApi.updateMeta(updated)
    set({ globalMeta: updated })
  },

  deleteGroup: async (id: string) => {
    const meta = get().globalMeta
    if (!meta) return
    const updated = {
      ...meta,
      groups: meta.groups.filter((g) => g.id !== id && g.parentId !== id),
    }
    await notesApi.updateMeta(updated)
    set({ globalMeta: updated })
  },

  // ─── Computed ────────────────────────────────────────────────────

  filteredNotes: () => {
    const { notes, trashNotes, showTrash, activeGroupId, searchQuery, sortOrder } = get()
    let pool = showTrash ? trashNotes : notes

    // Filter by group
    if (!showTrash && activeGroupId) {
      pool = pool.filter(
        (n) => n.groupId === activeGroupId || n.groupId.startsWith(activeGroupId + '/'),
      )
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim()
      pool = pool
        .map((n) => ({
          note: n,
          score: bigramScore(q, `${n.title} ${n.content}`),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.note)
    }

    return sortNotes(pool, sortOrder)
  },
}))
