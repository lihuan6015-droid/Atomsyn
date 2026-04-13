/**
 * Projects + Practices routes.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  writeJSON,
  fileExists,
  removeFile,
  removeDir,
  ensureDir,
} from '../fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'
import {
  loadAllProjects,
  loadProjectPractices,
  findPracticeFile,
  rebuildIndex,
} from '../rebuildIndex'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleProjects(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()

  // GET /projects
  if (method === 'GET' && parts.length === 1) {
    return ok(await loadAllProjects(dataDir))
  }

  // GET /projects/:id
  if (method === 'GET' && parts.length === 2) {
    const all = await loadAllProjects(dataDir)
    const p = all.find((x: any) => x.id === parts[1])
    return p ? ok(p) : err('not found')
  }

  // POST /projects
  if (method === 'POST' && parts.length === 1) {
    if (!body.id || !body.name) return err('id and name required', 400)
    const now = new Date().toISOString()
    body.createdAt ||= now
    body.updatedAt = now
    body.schemaVersion = 1
    body.pinnedAtoms ||= []
    body.stageHistory ||= []
    const file = joinPathSync(dataDir, 'projects', body.id, 'meta.json')
    await writeJSON(file, body)
    await ensureDir(joinPathSync(dataDir, 'projects', body.id, 'practices'))
    await rebuildIndex(dataDir)
    return ok(body, 201)
  }

  // PUT /projects/:id
  if (method === 'PUT' && parts.length === 2) {
    const file = joinPathSync(dataDir, 'projects', parts[1], 'meta.json')
    if (!(await fileExists(file))) return err('not found')
    body.updatedAt = new Date().toISOString()
    body.schemaVersion = 1
    await writeJSON(file, body)
    await rebuildIndex(dataDir)
    return ok(body)
  }

  // DELETE /projects/:id
  if (method === 'DELETE' && parts.length === 2) {
    const dir = joinPathSync(dataDir, 'projects', parts[1])
    if (!(await fileExists(dir))) return err('not found')
    await removeDir(dir)
    await rebuildIndex(dataDir)
    return ok({ ok: true })
  }

  // --- Practices ---
  if (parts.length >= 3 && parts[2] === 'practices') {
    const projectId = parts[1]

    // GET /projects/:id/practices
    if (method === 'GET' && parts.length === 3) {
      return ok(await loadProjectPractices(dataDir, projectId))
    }

    // POST /projects/:id/practices
    if (method === 'POST' && parts.length === 3) {
      if (!body.id) return err('id required', 400)
      body.projectId = projectId
      body.schemaVersion = 1
      const now = new Date().toISOString()
      body.createdAt ||= now
      body.updatedAt = now
      const file = joinPathSync(
        dataDir,
        'projects',
        projectId,
        'practices',
        `${body.id}.json`
      )
      await writeJSON(file, body)
      await rebuildIndex(dataDir)
      return ok(body, 201)
    }

    // PUT /projects/:id/practices/:pid
    if (method === 'PUT' && parts.length === 4) {
      const file = await findPracticeFile(dataDir, projectId, parts[3])
      if (!file) return err('not found')
      body.updatedAt = new Date().toISOString()
      body.schemaVersion = 1
      await writeJSON(file, body)
      await rebuildIndex(dataDir)
      return ok(body)
    }

    // DELETE /projects/:id/practices/:pid
    if (method === 'DELETE' && parts.length === 4) {
      const file = await findPracticeFile(dataDir, projectId, parts[3])
      if (!file) return err('not found')
      await removeFile(file)
      await rebuildIndex(dataDir)
      return ok({ ok: true })
    }
  }

  return null
}
