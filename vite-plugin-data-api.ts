/**
 * Vite dev plugin: exposes a tiny REST API over the local /data folder.
 *
 * Endpoints (all under /api):
 *   GET    /api/frameworks                        → list all frameworks
 *   GET    /api/frameworks/:id                    → one framework
 *
 *   GET    /api/atoms                             → list all atoms (flat)
 *   GET    /api/atoms/:id                         → one atom (looked up by id)
 *   POST   /api/atoms                             → create atom { ...Atom }
 *   PUT    /api/atoms/:id                         → update atom
 *   DELETE /api/atoms/:id                         → delete atom
 *
 *   GET    /api/projects                          → list projects
 *   GET    /api/projects/:id                      → one project
 *   POST   /api/projects                          → create
 *   PUT    /api/projects/:id                      → update
 *   DELETE /api/projects/:id                      → delete
 *
 *   GET    /api/projects/:id/practices            → list practices in project
 *   POST   /api/projects/:id/practices            → create practice
 *   PUT    /api/projects/:id/practices/:pid       → update practice
 *   DELETE /api/projects/:id/practices/:pid       → delete practice
 *
 *   GET    /api/index                             → knowledge index
 *   POST   /api/index/rebuild                     → force rebuild
 *
 *   GET    /api/usage-log                         → recent usage events
 *   POST   /api/usage-log                         → append one event
 *
 *   GET    /api/llm-config                        → llm.config.json
 *   PUT    /api/llm-config                        → save (sans api key)
 *
 *   GET    /api/psychological-log                 → psych entries
 *   POST   /api/psychological-log                 → append
 *
 * Side effects: any write to atoms / projects / practices triggers an
 * automatic index rebuild.
 *
 * This plugin is intentionally framework-free (no express) so the dev
 * server stays a single Vite process. When the user later wraps this app
 * in Tauri, swap src/lib/dataApi.ts to call @tauri-apps/api/fs instead.
 */

import type { Plugin, Connect } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

interface Options {
  dataDir: string
}

// ---------- helpers ---------------------------------------------------------

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJSON(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

async function walk(dir: string, exts = ['.json']): Promise<string[]> {
  const out: string[] = []
  if (!existsSync(dir)) return out
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(full, exts)))
    } else if (exts.some((x) => e.name.endsWith(x))) {
      out.push(full)
    }
  }
  return out
}

function send(res: any, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

async function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (chunk: Buffer) => (buf += chunk.toString()))
    req.on('end', () => {
      if (!buf) return resolve({})
      try {
        resolve(JSON.parse(buf))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

// ---------- core entity locators -------------------------------------------

async function findAtomFile(dataDir: string, atomId: string): Promise<string | null> {
  const atomsDir = path.join(dataDir, 'atoms')
  const files = await walk(atomsDir)
  for (const f of files) {
    try {
      const j = JSON.parse(await fs.readFile(f, 'utf-8'))
      if (j.id === atomId) return f
    } catch {}
  }
  return null
}

async function findPracticeFile(
  dataDir: string,
  projectId: string,
  practiceId: string
): Promise<string | null> {
  const dir = path.join(dataDir, 'projects', projectId, 'practices')
  if (!existsSync(dir)) return null
  const files = await walk(dir)
  for (const f of files) {
    try {
      const j = JSON.parse(await fs.readFile(f, 'utf-8'))
      if (j.id === practiceId) return f
    } catch {}
  }
  return null
}

async function loadAllAtoms(dataDir: string) {
  const files = await walk(path.join(dataDir, 'atoms'))
  const atoms: any[] = []
  for (const f of files) {
    try {
      atoms.push({ ...(JSON.parse(await fs.readFile(f, 'utf-8'))), _file: path.relative(dataDir, f) })
    } catch {}
  }
  return atoms
}

async function loadAllFrameworks(dataDir: string) {
  const dir = path.join(dataDir, 'frameworks')
  if (!existsSync(dir)) return []
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
  const result: any[] = []
  for (const f of files) {
    try {
      result.push(JSON.parse(await fs.readFile(path.join(dir, f), 'utf-8')))
    } catch {}
  }
  return result
}

async function loadAllProjects(dataDir: string) {
  const dir = path.join(dataDir, 'projects')
  if (!existsSync(dir)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const projects: any[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const metaFile = path.join(dir, e.name, 'meta.json')
    if (existsSync(metaFile)) {
      try {
        projects.push(JSON.parse(await fs.readFile(metaFile, 'utf-8')))
      } catch {}
    }
  }
  return projects
}

async function loadProjectPractices(dataDir: string, projectId: string) {
  const dir = path.join(dataDir, 'projects', projectId, 'practices')
  if (!existsSync(dir)) return []
  const files = await walk(dir)
  const out: any[] = []
  for (const f of files) {
    try {
      out.push(JSON.parse(await fs.readFile(f, 'utf-8')))
    } catch {}
  }
  return out
}

// ---------- index rebuild --------------------------------------------------

async function rebuildIndex(dataDir: string) {
  const frameworks = await loadAllFrameworks(dataDir)
  const atoms = await loadAllAtoms(dataDir)
  const projects = await loadAllProjects(dataDir)

  // count atoms per framework
  const fwAtomCount: Record<string, number> = {}
  for (const a of atoms) {
    fwAtomCount[a.frameworkId] = (fwAtomCount[a.frameworkId] || 0) + 1
  }

  const cellNameByFrameworkAndCell: Record<string, Record<number, string>> = {}
  for (const f of frameworks) {
    cellNameByFrameworkAndCell[f.id] = {}
    for (const c of f.matrix?.cells ?? []) {
      cellNameByFrameworkAndCell[f.id][c.stepNumber] = c.name
    }
  }

  // collect projectsByAtomId for stats sync
  const projectsUsingAtom: Record<string, string[]> = {}
  for (const p of projects) {
    const practices = await loadProjectPractices(dataDir, p.id)
    const atomIds = new Set<string>()
    for (const pr of practices) atomIds.add(pr.atomId)
    for (const pin of p.pinnedAtoms ?? []) atomIds.add(pin.atomId)
    for (const aid of atomIds) {
      ;(projectsUsingAtom[aid] ??= []).push(p.id)
    }
  }

  const indexedAtoms = atoms.map((a) => ({
    id: a.id,
    name: a.name,
    nameEn: a.nameEn,
    frameworkId: a.frameworkId,
    cellId: a.cellId,
    cellName: cellNameByFrameworkAndCell[a.frameworkId]?.[a.cellId] ?? '',
    tags: a.tags ?? [],
    tagline: (a.coreIdea ?? '').slice(0, 80),
    whenToUse: a.whenToUse ?? '',
    path: a._file,
  }))

  const indexedProjects = projects.map((p) => {
    const practiceAtoms = (projectsUsingAtom['__byProject'] || [])
    return {
      id: p.id,
      name: p.name,
      innovationStage: p.innovationStage,
      atomsUsed: Array.from(
        new Set([...(p.pinnedAtoms?.map((x: any) => x.atomId) ?? [])])
      ),
    }
  })

  const index = {
    generatedAt: new Date().toISOString(),
    version: 1,
    frameworks: frameworks.map((f) => ({
      id: f.id,
      name: f.name,
      atomCount: fwAtomCount[f.id] || 0,
    })),
    atoms: indexedAtoms,
    projects: indexedProjects,
  }

  await writeJSON(path.join(dataDir, 'index', 'knowledge-index.json'), index)

  // also reverse-sync atom.stats.usedInProjects from practice data
  for (const a of atoms) {
    const used = projectsUsingAtom[a.id] ?? []
    if (
      JSON.stringify(a.stats?.usedInProjects ?? []) !== JSON.stringify(used)
    ) {
      const file = path.join(dataDir, a._file)
      const fresh = JSON.parse(await fs.readFile(file, 'utf-8'))
      fresh.stats = fresh.stats || { usedInProjects: [], useCount: 0 }
      fresh.stats.usedInProjects = used
      fresh.updatedAt = new Date().toISOString()
      await writeJSON(file, fresh)
    }
  }

  return index
}

// ---------- main plugin ----------------------------------------------------

export function dataApiPlugin(opts: Options): Plugin {
  const { dataDir } = opts

  return {
    name: 'ccl-pm-data-api',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean)
        const method = req.method?.toUpperCase() || 'GET'

        try {
          // ---------- frameworks ----------
          if (parts[0] === 'frameworks') {
            if (method === 'GET' && parts.length === 1) {
              return send(res, 200, await loadAllFrameworks(dataDir))
            }
            if (method === 'GET' && parts.length === 2) {
              const all = await loadAllFrameworks(dataDir)
              const f = all.find((x) => x.id === parts[1])
              return f ? send(res, 200, f) : send(res, 404, { error: 'not found' })
            }
          }

          // ---------- atoms ----------
          if (parts[0] === 'atoms') {
            if (method === 'GET' && parts.length === 1) {
              return send(res, 200, await loadAllAtoms(dataDir))
            }
            if (method === 'GET' && parts.length === 2) {
              const file = await findAtomFile(dataDir, parts[1])
              if (!file) return send(res, 404, { error: 'not found' })
              return send(res, 200, JSON.parse(await fs.readFile(file, 'utf-8')))
            }
            if (method === 'POST' && parts.length === 1) {
              const body = await readBody(req)
              const fw = body.frameworkId
              if (!fw || !body.id) {
                return send(res, 400, { error: 'frameworkId and id are required' })
              }
              // resolve cell folder from framework cell mapping
              const fwFile = path.join(dataDir, 'frameworks', `${fw}.json`)
              if (!existsSync(fwFile)) {
                return send(res, 400, { error: `framework not found: ${fw}` })
              }
              const fwData = JSON.parse(await fs.readFile(fwFile, 'utf-8'))
              const cell = fwData.matrix.cells.find((c: any) => c.stepNumber === body.cellId)
              if (!cell) {
                return send(res, 400, { error: `cellId ${body.cellId} not in framework` })
              }
              const folder = path.join(dataDir, 'atoms', cell.atomCategoryPath)
              const slug = body.id.replace(/^atom_/, '').replace(/_/g, '-')
              const file = path.join(folder, `${slug}.json`)
              const now = new Date().toISOString()
              body.createdAt ||= now
              body.updatedAt = now
              body.bookmarks ||= []
              body.stats ||= { usedInProjects: [], useCount: 0 }
              body.schemaVersion = 1
              await writeJSON(file, body)
              await rebuildIndex(dataDir)
              return send(res, 201, body)
            }
            if (method === 'PUT' && parts.length === 2) {
              const file = await findAtomFile(dataDir, parts[1])
              if (!file) return send(res, 404, { error: 'not found' })
              const body = await readBody(req)
              body.updatedAt = new Date().toISOString()
              body.schemaVersion = 1
              await writeJSON(file, body)
              await rebuildIndex(dataDir)
              return send(res, 200, body)
            }
            if (method === 'DELETE' && parts.length === 2) {
              const file = await findAtomFile(dataDir, parts[1])
              if (!file) return send(res, 404, { error: 'not found' })
              await fs.unlink(file)
              await rebuildIndex(dataDir)
              return send(res, 200, { ok: true })
            }
          }

          // ---------- projects ----------
          if (parts[0] === 'projects') {
            if (method === 'GET' && parts.length === 1) {
              return send(res, 200, await loadAllProjects(dataDir))
            }
            if (method === 'GET' && parts.length === 2) {
              const all = await loadAllProjects(dataDir)
              const p = all.find((x) => x.id === parts[1])
              return p ? send(res, 200, p) : send(res, 404, { error: 'not found' })
            }
            if (method === 'POST' && parts.length === 1) {
              const body = await readBody(req)
              if (!body.id || !body.name) return send(res, 400, { error: 'id and name required' })
              const now = new Date().toISOString()
              body.createdAt ||= now
              body.updatedAt = now
              body.schemaVersion = 1
              body.pinnedAtoms ||= []
              body.stageHistory ||= []
              const file = path.join(dataDir, 'projects', body.id, 'meta.json')
              await writeJSON(file, body)
              // ensure practices dir exists
              await fs.mkdir(path.join(dataDir, 'projects', body.id, 'practices'), {
                recursive: true,
              })
              await rebuildIndex(dataDir)
              return send(res, 201, body)
            }
            if (method === 'PUT' && parts.length === 2) {
              const file = path.join(dataDir, 'projects', parts[1], 'meta.json')
              if (!existsSync(file)) return send(res, 404, { error: 'not found' })
              const body = await readBody(req)
              body.updatedAt = new Date().toISOString()
              body.schemaVersion = 1
              await writeJSON(file, body)
              await rebuildIndex(dataDir)
              return send(res, 200, body)
            }
            if (method === 'DELETE' && parts.length === 2) {
              const dir = path.join(dataDir, 'projects', parts[1])
              if (!existsSync(dir)) return send(res, 404, { error: 'not found' })
              await fs.rm(dir, { recursive: true, force: true })
              await rebuildIndex(dataDir)
              return send(res, 200, { ok: true })
            }

            // /api/projects/:id/practices ...
            if (parts.length >= 3 && parts[2] === 'practices') {
              const projectId = parts[1]
              if (method === 'GET' && parts.length === 3) {
                return send(res, 200, await loadProjectPractices(dataDir, projectId))
              }
              if (method === 'POST' && parts.length === 3) {
                const body = await readBody(req)
                if (!body.id) return send(res, 400, { error: 'id required' })
                body.projectId = projectId
                body.schemaVersion = 1
                const now = new Date().toISOString()
                body.createdAt ||= now
                body.updatedAt = now
                const file = path.join(
                  dataDir,
                  'projects',
                  projectId,
                  'practices',
                  `${body.id}.json`
                )
                await writeJSON(file, body)
                await rebuildIndex(dataDir)
                return send(res, 201, body)
              }
              if (method === 'PUT' && parts.length === 4) {
                const file = await findPracticeFile(dataDir, projectId, parts[3])
                if (!file) return send(res, 404, { error: 'not found' })
                const body = await readBody(req)
                body.updatedAt = new Date().toISOString()
                body.schemaVersion = 1
                await writeJSON(file, body)
                await rebuildIndex(dataDir)
                return send(res, 200, body)
              }
              if (method === 'DELETE' && parts.length === 4) {
                const file = await findPracticeFile(dataDir, projectId, parts[3])
                if (!file) return send(res, 404, { error: 'not found' })
                await fs.unlink(file)
                await rebuildIndex(dataDir)
                return send(res, 200, { ok: true })
              }
            }
          }

          // ---------- index ----------
          if (parts[0] === 'index') {
            if (method === 'GET' && parts.length === 1) {
              const file = path.join(dataDir, 'index', 'knowledge-index.json')
              if (!existsSync(file)) {
                return send(res, 200, await rebuildIndex(dataDir))
              }
              return send(res, 200, await readJSON(file, {}))
            }
            if (method === 'POST' && parts[1] === 'rebuild') {
              return send(res, 200, await rebuildIndex(dataDir))
            }
          }

          // ---------- usage log ----------
          if (parts[0] === 'usage-log') {
            const file = path.join(dataDir, 'growth', 'usage-log.jsonl')
            if (method === 'GET') {
              if (!existsSync(file)) return send(res, 200, [])
              const raw = await fs.readFile(file, 'utf-8')
              const lines = raw
                .split('\n')
                .filter(Boolean)
                .map((l) => {
                  try {
                    return JSON.parse(l)
                  } catch {
                    return null
                  }
                })
                .filter(Boolean)
              return send(res, 200, lines)
            }
            if (method === 'POST') {
              const body = await readBody(req)
              const event = { ts: new Date().toISOString(), ...body }
              await fs.mkdir(path.dirname(file), { recursive: true })
              await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf-8')
              return send(res, 201, event)
            }
          }

          // ---------- llm config ----------
          if (parts[0] === 'llm-config') {
            const file = path.join(dataDir, '..', 'config', 'llm.config.json')
            if (method === 'GET') {
              return send(res, 200, await readJSON(file, {}))
            }
            if (method === 'PUT') {
              const body = await readBody(req)
              await writeJSON(file, body)
              return send(res, 200, body)
            }
          }

          // ---------- psychological log ----------
          if (parts[0] === 'psychological-log') {
            const file = path.join(dataDir, 'growth', 'psychological-log.json')
            if (method === 'GET') {
              return send(res, 200, await readJSON(file, []))
            }
            if (method === 'POST') {
              const body = await readBody(req)
              const list = await readJSON<any[]>(file, [])
              list.push({ ...body, submittedAt: new Date().toISOString() })
              await writeJSON(file, list)
              return send(res, 201, body)
            }
          }

          send(res, 404, { error: `route not handled: ${method} ${url.pathname}` })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[data-api] error', err)
          send(res, 500, { error: String(err) })
        }
      }

      server.middlewares.use(middleware)

      // build index on server boot
      rebuildIndex(dataDir).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[data-api] initial index rebuild failed:', err)
      })
    },
  }
}
