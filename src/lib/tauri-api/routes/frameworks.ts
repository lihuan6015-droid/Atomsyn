/**
 * Frameworks routes — mirrors vite-plugin-data-api.ts frameworks section.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  readJSON,
  writeJSON,
  walk,
  fileExists,
  removeFile,
  removeDir,
  ensureDir,
} from '../fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { loadAllFrameworks, rebuildIndex } from '../rebuildIndex'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleFrameworks(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()

  // GET /frameworks — list all
  if (method === 'GET' && parts.length === 1) {
    return ok(await loadAllFrameworks(dataDir))
  }

  // GET /frameworks/:id/stats — coverage statistics
  if (method === 'GET' && parts.length === 3 && parts[2] === 'stats') {
    const fwFile = joinPathSync(dataDir, 'frameworks', `${parts[1]}.json`)
    if (!(await fileExists(fwFile))) return err('not found')
    const fw = JSON.parse(await readTextFile(fwFile))

    type NodeInfo = { id: string | number; name: string; path: string }
    const nodes: NodeInfo[] = []
    if (fw.layoutType === 'matrix') {
      for (const c of fw.matrix?.cells ?? []) {
        nodes.push({ id: c.stepNumber, name: c.name, path: c.atomCategoryPath })
      }
    } else if (fw.layoutType === 'list') {
      for (const c of fw.list?.categories ?? []) {
        nodes.push({ id: c.id, name: c.name, path: c.atomCategoryPath })
      }
    } else if (fw.layoutType === 'tree') {
      const walkTree = (treeNodes: any[]) => {
        for (const n of treeNodes) {
          nodes.push({ id: n.id, name: n.name, path: n.atomCategoryPath })
          if (n.children) walkTree(n.children)
        }
      }
      walkTree(fw.tree?.roots ?? [])
    }

    const fwAtomsDir = joinPathSync(dataDir, 'atoms', parts[1])
    const methodologyFiles = await walk(fwAtomsDir)
    const methodologies: any[] = []
    for (const f of methodologyFiles) {
      try {
        methodologies.push(JSON.parse(await readTextFile(f)))
      } catch { /* skip */ }
    }

    const experienceDir = joinPathSync(dataDir, 'atoms', 'experience')
    const expFiles = await walk(experienceDir)
    const fragmentsByMethodology: Record<string, number> = {}
    for (const f of expFiles) {
      try {
        const frag = JSON.parse(await readTextFile(f))
        const lm = frag.linked_methodologies
        if (!Array.isArray(lm)) continue
        for (const mid of lm) {
          fragmentsByMethodology[mid] = (fragmentsByMethodology[mid] || 0) + 1
        }
      } catch { /* skip */ }
    }

    const methodologiesByNode: Record<string, any[]> = {}
    for (const m of methodologies) {
      const nodeId = String(m.cellId ?? '')
      if (!methodologiesByNode[nodeId]) methodologiesByNode[nodeId] = []
      methodologiesByNode[nodeId].push(m)
    }

    let totalMethodologies = 0
    let totalFragments = 0
    let coveredNodes = 0
    const statsNodes = nodes.map((node) => {
      const nodeKey = String(node.id)
      const nodeMethods = methodologiesByNode[nodeKey] ?? []
      const methodologyIds = nodeMethods.map((m: any) => m.id)
      let fragmentCount = 0
      for (const mid of methodologyIds) {
        fragmentCount += fragmentsByMethodology[mid] || 0
      }
      totalMethodologies += nodeMethods.length
      totalFragments += fragmentCount
      if (fragmentCount > 0) coveredNodes++
      return {
        nodeId: node.id,
        name: node.name,
        methodologyCount: nodeMethods.length,
        fragmentCount,
        methodologyIds,
      }
    })

    return ok({
      frameworkId: parts[1],
      frameworkName: fw.name,
      nodes: statsNodes,
      total: {
        nodeCount: nodes.length,
        coveredNodes,
        totalMethodologies,
        totalFragments,
        coveragePercent: nodes.length > 0 ? Math.round((coveredNodes / nodes.length) * 100) : 0,
      },
    })
  }

  // GET /frameworks/:id
  if (method === 'GET' && parts.length === 2) {
    const all = await loadAllFrameworks(dataDir)
    const f = all.find((x: any) => x.id === parts[1])
    return f ? ok(f) : err('not found')
  }

  // POST /frameworks
  if (method === 'POST' && parts.length === 1) {
    if (!body.name) return err('name is required', 400)
    const id =
      body.id ||
      body.name
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '')
    const now = new Date().toISOString()
    const fw = { ...body, id, schemaVersion: 1, createdAt: now, updatedAt: now }
    const fwFile = joinPathSync(dataDir, 'frameworks', `${id}.json`)
    if (await fileExists(fwFile)) return err(`framework already exists: ${id}`, 409)
    await writeJSON(fwFile, fw)

    // Create atom directory structure
    if (fw.layoutType === 'matrix') {
      for (const cell of fw.matrix?.cells ?? []) {
        const segments = cell.atomCategoryPath.split('/')
        const folder = joinPathSync(dataDir, 'atoms', ...segments)
        await ensureDir(folder)
      }
    } else if (fw.layoutType === 'list') {
      for (const cat of fw.list?.categories ?? []) {
        const folder = joinPathSync(dataDir, 'atoms', id, cat.id)
        await ensureDir(folder)
      }
    } else if (fw.layoutType === 'tree') {
      const mkdirTree = async (treeNodes: any[]) => {
        for (const n of treeNodes) {
          const folder = joinPathSync(dataDir, 'atoms', id, n.id)
          await ensureDir(folder)
          if (n.children) await mkdirTree(n.children)
        }
      }
      await mkdirTree(fw.tree?.roots ?? [])
    }

    await rebuildIndex(dataDir)
    return ok(fw, 201)
  }

  // PUT /frameworks/:id
  if (method === 'PUT' && parts.length === 2) {
    const fwFile = joinPathSync(dataDir, 'frameworks', `${parts[1]}.json`)
    if (!(await fileExists(fwFile))) return err('not found')
    const existing = JSON.parse(await readTextFile(fwFile))
    const merged = { ...existing, ...body, id: existing.id, updatedAt: new Date().toISOString() }
    await writeJSON(fwFile, merged)
    await rebuildIndex(dataDir)
    return ok(merged)
  }

  // DELETE /frameworks/:id
  if (method === 'DELETE' && parts.length === 2) {
    const fwFile = joinPathSync(dataDir, 'frameworks', `${parts[1]}.json`)
    if (!(await fileExists(fwFile))) return err('not found')
    await removeFile(fwFile)
    const atomsDir = joinPathSync(dataDir, 'atoms', parts[1])
    if (await fileExists(atomsDir)) {
      await removeDir(atomsDir)
    }
    await rebuildIndex(dataDir)
    return ok({ ok: true })
  }

  return null
}
