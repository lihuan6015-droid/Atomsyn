/**
 * V2.0 M6 · Note types for the local notes module.
 *
 * Notes are stored as physical folders with meta.json + content.md.
 * Groups map to physical directories. All paths are relative to
 * the notes root (e.g., `~/Library/Application Support/atomsyn/notes/`).
 */

// ─── Crystallize status ──────────────────────────────────────────────

/** Tracks whether a note has been crystallized into experience fragments */
export type CrystallizeStatus = 'none' | 'parsing' | 'parsed' | 'failed'

// ─── Note Group (folder) ─────────────────────────────────────────────

export interface NoteGroup {
  /** Unique id, typically slugified folder name */
  id: string
  /** Display name */
  name: string
  /** Parent group id for nested folders, null for root level */
  parentId: string | null
  /** Order within sibling groups */
  sortOrder: number
  createdAt: string
  updatedAt: string
}

// ─── Global notes metadata ───────────────────────────────────────────

export interface NotesMeta {
  version: 1
  groups: NoteGroup[]
  defaultGroup: string
  sortOrder: NotesSortOrder
}

export type NotesSortOrder = 'updatedAt' | 'createdAt' | 'title'

// ─── Per-note metadata (stored in <note-dir>/meta.json) ──────────────

export interface NoteMeta {
  /** Format: note_<slug>_<timestamp> */
  id: string
  title: string
  tags: string[]
  pinned: boolean
  crystallizeStatus: CrystallizeStatus
  crystallizedAt?: string
  /** IDs of fragments crystallized from this note */
  linkedFragments: string[]
  /** Matches group.id */
  groupId: string
  wordCount: number
  createdAt: string
  updatedAt: string
  /** Non-null when in trash */
  deletedAt?: string
}

// ─── Runtime Note (meta + content combined) ──────────────────────────

export interface Note extends NoteMeta {
  /** Raw markdown content from content.md */
  content: string
  /** Runtime-only: relative path to note directory from notes root */
  _dirPath: string
}

// ─── Default factories ───────────────────────────────────────────────

export function defaultNotesMeta(): NotesMeta {
  return {
    version: 1,
    groups: [],
    defaultGroup: '',
    sortOrder: 'updatedAt',
  }
}

export function defaultNoteMeta(id: string, groupId: string): NoteMeta {
  const now = new Date().toISOString()
  return {
    id,
    title: '无标题笔记',
    tags: [],
    pinned: false,
    crystallizeStatus: 'none',
    linkedFragments: [],
    groupId,
    wordCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}
