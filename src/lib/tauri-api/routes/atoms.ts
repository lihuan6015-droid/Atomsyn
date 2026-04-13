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
} from '../fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { loadAllAtoms, findAtomFile, rebuildIndex } from '../rebuildIndex'

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

  // GET /atoms/:id
  if (method === 'GET' && parts.length === 2) {
    const file = await findAtomFile(dataDir, parts[1])
    if (!file) return err('not found')
    const atomData = JSON.parse(await readTextFile(file))
    atomData._file = relativePath(dataDir, file)
    atomData._absPath = file
    return ok(atomData)
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
