/**
 * Notes routes — full lifecycle: CRUD, trash, move, restore, attachments, crystallize-cache.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  readJSON,
  writeJSON,
  fileExists,
  removeDir,
  removeFile,
  renamePath,
  ensureDir,
  readText,
  writeText,
  writeBinary,
  relativePath,
} from '../fsHelpers'
import { readDir } from '@tauri-apps/plugin-fs'
import { convertFileSrc } from '@tauri-apps/api/core'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

function slugifyNote(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'note'
  )
}

async function loadNoteMeta(noteDir: string): Promise<any> {
  const metaFile = joinPathSync(noteDir, 'meta.json')
  return readJSON(metaFile, null)
}

async function loadNoteContent(noteDir: string): Promise<string> {
  const contentFile = joinPathSync(noteDir, 'content.md')
  return readText(contentFile)
}

async function loadFullNote(noteDir: string, notesDir: string): Promise<any> {
  const meta = await loadNoteMeta(noteDir)
  if (!meta) return null
  let content = await loadNoteContent(noteDir)
  const relDir = relativePath(notesDir, noteDir)
  const noteSlug = noteDir.replace(/\\/g, '/').split('/').pop() || ''

  // Heal stale image paths
  const correctPrefix = `/api/fs/notes/${encodeURIComponent(relDir).replace(/%2F/g, '/')}/attachments/`
  const stalePattern = new RegExp(
    `/api/fs/notes/[^)\\s]*?${noteSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/attachments/`,
    'g'
  )
  if (content && stalePattern.test(content)) {
    const healed = content.replace(stalePattern, correctPrefix)
    if (healed !== content) {
      content = healed
      await writeText(joinPathSync(noteDir, 'content.md'), content)
    }
  }

  // In Tauri mode, rewrite /api/fs/ references to asset:// URLs
  if (content) {
    const dataDir = await getDataDir()
    content = content.replace(
      /\/api\/fs\/([^)\s"']+)/g,
      (_match: string, relPath: string) => {
        const decoded = decodeURIComponent(relPath)
        // joinPath is async, but we need sync replacement. Build the path manually.
        const absPath = dataDir.replace(/\\/g, '/') + '/' + decoded
        return convertFileSrc(absPath)
      }
    )
  }

  return { ...meta, content, _dirPath: relDir }
}

// `_trash` is the soft-delete bucket and must never appear in regular note
// scans. Without this exclusion, refreshing the page after a soft delete
// would surface the trashed note in both the regular list AND the trash list.
function isReservedNotesEntry(name: string): boolean {
  return name.startsWith('.') || name === '_trash'
}

async function findNoteDirById(
  searchDir: string,
  noteId: string
): Promise<string | null> {
  if (!(await fileExists(searchDir))) return null
  let entries: any[]
  try {
    entries = await readDir(searchDir)
  } catch {
    return null
  }
  for (const e of entries) {
    if (!e.isDirectory || isReservedNotesEntry(e.name)) continue
    const candidate = joinPathSync(searchDir, e.name)
    const metaFile = joinPathSync(candidate, 'meta.json')
    if (await fileExists(metaFile)) {
      const meta = await readJSON(metaFile, null) as any
      if (meta?.id === noteId) return candidate
    } else {
      const found = await findNoteDirById(candidate, noteId)
      if (found) return found
    }
  }
  return null
}

async function collectAllNotes(dir: string, notesDir: string): Promise<any[]> {
  const notes: any[] = []
  if (!(await fileExists(dir))) return notes
  let entries: any[]
  try {
    entries = await readDir(dir)
  } catch {
    return notes
  }
  for (const e of entries) {
    if (!e.isDirectory || isReservedNotesEntry(e.name)) continue
    const full = joinPathSync(dir, e.name)
    const metaFile = joinPathSync(full, 'meta.json')
    if (await fileExists(metaFile)) {
      const note = await loadFullNote(full, notesDir)
      if (note) notes.push(note)
    } else {
      notes.push(...(await collectAllNotes(full, notesDir)))
    }
  }
  return notes
}

export async function handleNotes(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()
  const notesDir = joinPathSync(dataDir, 'notes')
  const trashDir = joinPathSync(notesDir, '_trash')
  // Only create notes dir eagerly; _trash is created on demand to avoid
  // Tauri FS scope issues with dot-prefixed directories.
  await ensureDir(notesDir)

  // GET /notes/meta
  if (parts.length === 2 && parts[1] === 'meta') {
    const metaFile = joinPathSync(notesDir, 'meta.json')
    if (method === 'GET') {
      return ok(
        await readJSON(metaFile, {
          version: 1,
          groups: [],
          defaultGroup: '',
          sortOrder: 'updatedAt',
        })
      )
    }
    if (method === 'PUT') {
      await writeJSON(metaFile, body)
      return ok(body)
    }
  }

  // GET /notes/trash
  if (parts.length === 2 && parts[1] === 'trash' && method === 'GET') {
    await ensureDir(trashDir)
    return ok(await collectAllNotes(trashDir, notesDir))
  }

  // DELETE /notes/trash/:noteId — permanent delete
  if (parts.length === 3 && parts[1] === 'trash' && method === 'DELETE') {
    const noteId = parts[2]
    const noteDir = await findNoteDirById(trashDir, noteId)
    if (!noteDir) return err('note not found in trash')
    await removeDir(noteDir)
    return ok({ ok: true })
  }

  // GET /notes — list all
  if (parts.length === 1 && method === 'GET') {
    return ok(await collectAllNotes(notesDir, notesDir))
  }

  // POST /notes — create
  if (parts.length === 1 && method === 'POST') {
    const title = body.title || ''
    const groupId = body.groupId || ''
    const ts = Date.now()
    const slug = slugifyNote(title || 'note')
    const id = `note_${slug}_${ts}`
    const dirName = `${slug}_${ts}`
    const now = new Date().toISOString()

    const targetDir = groupId
      ? joinPathSync(notesDir, groupId, dirName)
      : joinPathSync(notesDir, dirName)
    await ensureDir(targetDir)

    const meta = {
      id,
      title,
      tags: body.tags || [],
      pinned: false,
      crystallizeStatus: 'none',
      linkedFragments: [],
      groupId,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    }

    const content = body.content || ''
    await writeJSON(joinPathSync(targetDir, 'meta.json'), meta)
    await writeText(joinPathSync(targetDir, 'content.md'), content)
    await ensureDir(joinPathSync(targetDir, 'attachments'))

    return ok(
      { ...meta, content, _dirPath: relativePath(notesDir, targetDir) },
      201
    )
  }

  // Routes with :noteId
  if (parts.length >= 2 && parts[1] !== 'meta' && parts[1] !== 'trash') {
    const noteId = parts[1]

    // GET /notes/:noteId
    if (parts.length === 2 && method === 'GET') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      return ok(await loadFullNote(noteDir, notesDir))
    }

    // PUT /notes/:noteId
    if (parts.length === 2 && method === 'PUT') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      const existingMeta = await loadNoteMeta(noteDir)
      const updatedMeta = {
        ...existingMeta,
        ...body,
        id: existingMeta.id,
        updatedAt: new Date().toISOString(),
      }
      delete updatedMeta.content
      delete updatedMeta._dirPath
      if (body.content !== undefined) {
        updatedMeta.wordCount = body.content.replace(/\s+/g, ' ').trim().length
      }
      await writeJSON(joinPathSync(noteDir, 'meta.json'), updatedMeta)
      if (body.content !== undefined) {
        await writeText(joinPathSync(noteDir, 'content.md'), body.content)
      }
      return ok({
        ...updatedMeta,
        content: body.content ?? (await loadNoteContent(noteDir)),
        _dirPath: relativePath(notesDir, noteDir),
      })
    }

    // DELETE /notes/:noteId — soft delete
    if (parts.length === 2 && method === 'DELETE') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      const meta = await loadNoteMeta(noteDir)
      meta.deletedAt = new Date().toISOString()
      await writeJSON(joinPathSync(noteDir, 'meta.json'), meta)
      const basename = noteDir.replace(/\\/g, '/').split('/').pop() || ''
      await ensureDir(trashDir)
      const trashTarget = joinPathSync(trashDir, basename)
      await renamePath(noteDir, trashTarget)
      return ok({ ok: true })
    }

    // POST /notes/:noteId/move
    if (parts.length === 3 && parts[2] === 'move' && method === 'POST') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      const targetGroupId = body.targetGroupId ?? ''
      const oldRelDir = relativePath(notesDir, noteDir)
      const basename = noteDir.replace(/\\/g, '/').split('/').pop() || ''
      const targetParent = targetGroupId
        ? joinPathSync(notesDir, targetGroupId)
        : notesDir
      await ensureDir(targetParent)
      const targetDir = joinPathSync(targetParent, basename)
      await renamePath(noteDir, targetDir)
      const newRelDir = relativePath(notesDir, targetDir)

      // Rewrite image paths in content.md
      const contentFile = joinPathSync(targetDir, 'content.md')
      try {
        let content = await readText(contentFile)
        const oldPrefix = `/api/fs/notes/${encodeURIComponent(oldRelDir).replace(/%2F/g, '/')}`
        const newPrefix = `/api/fs/notes/${encodeURIComponent(newRelDir).replace(/%2F/g, '/')}`
        if (content.includes(oldPrefix)) {
          content = content.split(oldPrefix).join(newPrefix)
          await writeText(contentFile, content)
        }
      } catch { /* content.md may not exist */ }

      const meta = await loadNoteMeta(targetDir)
      meta.groupId = targetGroupId
      meta.updatedAt = new Date().toISOString()
      await writeJSON(joinPathSync(targetDir, 'meta.json'), meta)

      return ok({
        ...meta,
        content: await loadNoteContent(targetDir),
        _dirPath: relativePath(notesDir, targetDir),
      })
    }

    // POST /notes/:noteId/restore
    if (parts.length === 3 && parts[2] === 'restore' && method === 'POST') {
      const noteDir = await findNoteDirById(trashDir, noteId)
      if (!noteDir) return err('note not found in trash')
      const meta = await loadNoteMeta(noteDir)
      const targetGroupId = meta.groupId || ''
      delete meta.deletedAt
      meta.updatedAt = new Date().toISOString()
      const targetParent = targetGroupId
        ? joinPathSync(notesDir, targetGroupId)
        : notesDir
      await ensureDir(targetParent)
      const basename = noteDir.replace(/\\/g, '/').split('/').pop() || ''
      const targetDir = joinPathSync(targetParent, basename)
      await renamePath(noteDir, targetDir)
      await writeJSON(joinPathSync(targetDir, 'meta.json'), meta)
      return ok({
        ...meta,
        content: await loadNoteContent(targetDir),
        _dirPath: relativePath(notesDir, targetDir),
      })
    }

    // GET /notes/:noteId/crystallize-cache
    if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'GET') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      const cacheFile = joinPathSync(noteDir, 'crystallize-cache.json')
      const cache = await readJSON(cacheFile, null)
      return ok(cache)
    }

    // PUT /notes/:noteId/crystallize-cache
    if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'PUT') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      await writeJSON(joinPathSync(noteDir, 'crystallize-cache.json'), body)
      return ok(body)
    }

    // DELETE /notes/:noteId/crystallize-cache
    if (parts.length === 3 && parts[2] === 'crystallize-cache' && method === 'DELETE') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      await removeFile(joinPathSync(noteDir, 'crystallize-cache.json'))
      return ok({ ok: true })
    }

    // POST /notes/:noteId/attachment
    if (parts.length === 3 && parts[2] === 'attachment' && method === 'POST') {
      const noteDir = await findNoteDirById(notesDir, noteId)
      if (!noteDir) return err('note not found')
      const { filename, base64 } = body
      if (!filename || !base64) return err('filename and base64 required', 400)

      const attachDir = joinPathSync(noteDir, 'attachments')
      await ensureDir(attachDir)
      // Decode base64 to Uint8Array
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const filePath = joinPathSync(attachDir, filename)
      await writeBinary(filePath, bytes)

      const noteRelPath = relativePath(notesDir, filePath)
      return ok({ path: `notes/${noteRelPath}` }, 201)
    }
  }

  return null
}
