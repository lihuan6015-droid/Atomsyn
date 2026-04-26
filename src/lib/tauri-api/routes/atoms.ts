/**
 * Atoms routes — mirrors vite-plugin-data-api.ts atoms section.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  writeJSON,
  walk,
  fileExists,
  removeFile,
  ensureDir,
  relativePath,
  appendJSONL,
} from '../fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { loadAllAtoms, findAtomFile, rebuildIndex } from '../rebuildIndex'
import {
  computeStaleness,
  detectPruneCandidates,
} from '@/lib/atomEvolution'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleAtoms(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()

  // GET /atoms — list all
  if (method === 'GET' && parts.length === 1) {
    return ok(await loadAllAtoms(dataDir))
  }

  // V2.x cognitive-evolution · GET /atoms/prune-candidates
  if (method === 'GET' && parts.length === 2 && parts[1] === 'prune-candidates') {
    const limitParam = _sp.get('limit')
    const limit = limitParam ? Math.max(1, parseInt(limitParam, 10) || 10) : 10
    const all = await loadAllAtoms(dataDir)
    const corpus = all.filter((a: any) => a && a.kind !== 'profile' && a.kind !== 'skill-inventory')
    const result = detectPruneCandidates(corpus, { limit })
    try {
      const logFile = joinPathSync(dataDir, 'growth', 'usage-log.jsonl')
      await ensureDir(joinPathSync(dataDir, 'growth'))
      await appendJSONL(logFile, {
        ts: new Date().toISOString(),
        action: 'prune.scanned',
        candidates_count: result.summary.candidates_count,
        summary: result.summary,
      })
    } catch { /* non-fatal */ }
    return ok({ ok: true, ...result })
  }

  // GET /atoms/:id
  if (method === 'GET' && parts.length === 2) {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    const atomData = JSON.parse(await readTextFile(file))
    atomData._file = relativePath(dataDir, file)
    atomData._absPath = file
    return ok(atomData)
  }

  // V2.x cognitive-evolution · GET /atoms/:id/staleness
  if (method === 'GET' && parts.length === 3 && parts[2] === 'staleness') {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    const atom = JSON.parse(await readTextFile(file))
    return ok(computeStaleness(atom))
  }

  // POST /atoms — create
  if (method === 'POST' && parts.length === 1) {
    const now = new Date().toISOString()
    body.createdAt ||= now
    body.updatedAt = now
    body.bookmarks ||= []
    body.stats ||= { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
    body.schemaVersion = 1

    // Experience atoms
    if (body.kind === 'experience') {
      if (!body.id) return err('id is required for experience atoms', 400)
      const slug = body.id.replace(/^atom_(exp|frag)_/, '').replace(/_/g, '-')
      const folder = joinPathSync(dataDir, 'atoms', 'experience', slug)
      await ensureDir(folder)
      const file = joinPathSync(folder, `${body.id}.json`)
      await writeJSON(file, body)
      await rebuildIndex(dataDir)
      return ok(body, 201)
    }

    // Methodology atoms
    const fw = body.frameworkId
    if (!fw || !body.id) return err('frameworkId and id are required', 400)

    const fwFile = joinPathSync(dataDir, 'frameworks', `${fw}.json`)
    if (!(await fileExists(fwFile))) return err(`framework not found: ${fw}`, 400)

    const fwData = JSON.parse(await readTextFile(fwFile))
    let atomCategoryPath: string | undefined
    if (fwData.layoutType === 'matrix' && fwData.matrix?.cells) {
      const cell = fwData.matrix.cells.find((c: any) => c.stepNumber === body.cellId)
      atomCategoryPath = cell?.atomCategoryPath
    } else if (fwData.layoutType === 'list' && fwData.list?.categories) {
      const cat = fwData.list.categories.find((c: any) => c.id === body.cellId)
      atomCategoryPath = cat?.atomCategoryPath
    } else if (fwData.layoutType === 'tree' && fwData.tree?.roots) {
      const findNode = (nodes: any[]): any => {
        for (const n of nodes) {
          if (n.id === body.cellId) return n
          if (n.children) {
            const found = findNode(n.children)
            if (found) return found
          }
        }
        return null
      }
      const node = findNode(fwData.tree.roots)
      atomCategoryPath = node?.atomCategoryPath
    }

    if (!atomCategoryPath) return err(`cellId ${body.cellId} not in framework`, 400)

    const folder = joinPathSync(dataDir, 'atoms', ...atomCategoryPath.split('/'))
    const slug = body.id.replace(/^atom_/, '').replace(/_/g, '-')
    const file = joinPathSync(folder, `${slug}.json`)
    await writeJSON(file, body)
    await rebuildIndex(dataDir)
    return ok(body, 201)
  }

  // PUT /atoms/:id
  if (method === 'PUT' && parts.length === 2) {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    body.updatedAt = new Date().toISOString()
    body.schemaVersion = 1
    await writeJSON(file, body)
    await rebuildIndex(dataDir)
    return ok(body)
  }

  // PATCH /atoms/:id/track-view
  if (method === 'PATCH' && parts.length === 3 && parts[2] === 'track-view') {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    const atom = JSON.parse(await readTextFile(file))
    atom.stats = atom.stats || {}
    atom.stats.humanViewCount = (atom.stats.humanViewCount || 0) + 1
    atom.stats.lastUsedAt = new Date().toISOString()
    await writeJSON(file, atom)
    return ok({ ok: true, humanViewCount: atom.stats.humanViewCount })
  }

  // GET /atoms/:id/related-fragments
  if (method === 'GET' && parts.length === 3 && parts[2] === 'related-fragments') {
    const targetId = parts[1]
    const experienceDir = joinPathSync(dataDir, 'atoms', 'experience')
    const results: Array<{ atom: any; confidence: number; locked: boolean }> = []
    const files = await walk(experienceDir)
    for (const f of files) {
      try {
        const atom = JSON.parse(await readTextFile(f))
        const lm = atom.linked_methodologies
        if (!Array.isArray(lm) || !lm.includes(targetId)) continue
        if (atom.stats?.userDemoted) continue
        const isLocked = atom.stats?.locked === true
        const confidence = isLocked ? 1.0 : (atom.confidence || 0)
        results.push({ atom, confidence, locked: isLocked })
      } catch { /* skip */ }
    }
    results.sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1
      return b.confidence - a.confidence
    })
    return ok(results.slice(0, 10))
  }

  // PATCH /atoms/:id/calibrate
  if (method === 'PATCH' && parts.length === 3 && parts[2] === 'calibrate') {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    const atom = JSON.parse(await readTextFile(file))
    atom.stats = atom.stats || {}
    if (body.locked !== undefined) atom.stats.locked = body.locked
    if (body.confidence !== undefined) atom.confidence = body.confidence
    if (body.locked === true) atom.confidence = 1.0
    atom.updatedAt = new Date().toISOString()
    await writeJSON(file, atom)
    return ok({ ok: true, locked: atom.stats.locked, confidence: atom.confidence })
  }

  // V2.x cognitive-evolution · POST /atoms/:id/supersede
  if (method === 'POST' && parts.length === 3 && parts[2] === 'supersede') {
    const oldId = parts[1]
    const { newAtom, archiveOld = true } = body || {}
    if (!newAtom || typeof newAtom !== 'object') return err('newAtom is required', 400)

    const oldFile = await findAtomFile(dataDir, oldId)
    if (!oldFile) return err('old atom not found', 404)
    const oldAtom = JSON.parse(await readTextFile(oldFile))
    if (oldAtom.stats?.locked) return err('old atom is locked', 423)
    if (oldAtom.archivedAt) return err('old atom is already archived', 409)

    const now = new Date().toISOString()

    // Generate new atom id if missing
    if (!newAtom.id) {
      const slug = String(newAtom.name || 'atom').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'atom'
      const ts = Math.floor(Date.now() / 1000)
      newAtom.id = `atom_exp_${slug}_${ts}`
    }
    newAtom.kind = newAtom.kind || 'experience'
    newAtom.subKind = newAtom.subKind || 'crystallized'
    newAtom.schemaVersion = 1
    newAtom.createdAt = newAtom.createdAt || now
    newAtom.updatedAt = now
    newAtom.stats = newAtom.stats || { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
    newAtom.supersedes = Array.from(new Set([oldId, ...(oldAtom.supersedes || []), ...(newAtom.supersedes || [])]))

    const slug = String(newAtom.id).replace(/^atom_(exp|frag)_/, '').replace(/_\d+$/, '').replace(/_/g, '-') || 'atom'
    const newFolder = joinPathSync(dataDir, 'atoms', 'experience', slug)
    await ensureDir(newFolder)
    const newFile = joinPathSync(newFolder, `${newAtom.id}.json`)
    await writeJSON(newFile, newAtom)

    oldAtom.supersededBy = newAtom.id
    oldAtom.updatedAt = now
    if (archiveOld) oldAtom.archivedAt = now
    await writeJSON(oldFile, oldAtom)

    await rebuildIndex(dataDir)
    try {
      const logFile = joinPathSync(dataDir, 'growth', 'usage-log.jsonl')
      await ensureDir(joinPathSync(dataDir, 'growth'))
      await appendJSONL(logFile, {
        ts: now,
        action: 'supersede.applied',
        oldId,
        newId: newAtom.id,
        archivedOld: archiveOld,
      })
    } catch { /* non-fatal */ }

    return ok({ ok: true, oldId, newId: newAtom.id, oldPath: oldFile, newPath: newFile, archivedOld: archiveOld })
  }

  // V2.x cognitive-evolution · POST /atoms/:id/archive
  if (method === 'POST' && parts.length === 3 && parts[2] === 'archive') {
    const id = parts[1]
    const reason = body?.reason
    if (reason && typeof reason === 'string' && reason.length > 500) return err('reason exceeds 500 chars', 400)
    const file = await findAtomFile(dataDir, id)
    if (!file) return err('atom not found', 404)
    const atom = JSON.parse(await readTextFile(file))
    if (atom.stats?.locked) return err('atom is locked', 423)
    const now = new Date().toISOString()
    atom.archivedAt = now
    if (reason) atom.archivedReason = String(reason).slice(0, 500)
    atom.updatedAt = now
    await writeJSON(file, atom)
    await rebuildIndex(dataDir)
    try {
      const logFile = joinPathSync(dataDir, 'growth', 'usage-log.jsonl')
      await ensureDir(joinPathSync(dataDir, 'growth'))
      await appendJSONL(logFile, {
        ts: now,
        action: 'archive.applied',
        atomId: id,
        ...(reason ? { reason } : {}),
      })
    } catch { /* non-fatal */ }
    return ok({ ok: true, atomId: id, archivedAt: now, ...(reason ? { reason } : {}) })
  }

  // V2.x cognitive-evolution · POST /atoms/:id/restore
  if (method === 'POST' && parts.length === 3 && parts[2] === 'restore') {
    const id = parts[1]
    const file = await findAtomFile(dataDir, id)
    if (!file) return err('atom not found', 404)
    const atom = JSON.parse(await readTextFile(file))
    if (!atom.archivedAt) return err('atom is not archived', 400)
    delete atom.archivedAt
    delete atom.archivedReason
    const now = new Date().toISOString()
    atom.updatedAt = now
    await writeJSON(file, atom)
    await rebuildIndex(dataDir)
    try {
      const logFile = joinPathSync(dataDir, 'growth', 'usage-log.jsonl')
      await ensureDir(joinPathSync(dataDir, 'growth'))
      await appendJSONL(logFile, {
        ts: now,
        action: 'archive.restored',
        atomId: id,
      })
    } catch { /* non-fatal */ }
    return ok({ ok: true, atomId: id, restored: true })
  }

  // DELETE /atoms/:id
  if (method === 'DELETE' && parts.length === 2) {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    await removeFile(file)
    await rebuildIndex(dataDir)
    return ok({ ok: true })
  }

  return null
}
