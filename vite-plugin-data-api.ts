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
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

interface Options {
  dataDir: string
  /**
   * Optional path to a read-only seed directory. On plugin startup, if
   * `dataDir` is empty or missing frameworks/, the plugin will copy
   * frameworks + methodology atoms from `seedFrom` non-destructively
   * (existing files are never overwritten). Usually this is the project's
   * own `/data/` directory, which ships V1's seed content.
   */
  seedFrom?: string
}

/**
 * Non-destructively copy bundled seed data into a user's data directory.
 * Mirrors the semantics of src-tauri/src/lib.rs `init_seed_*` commands.
 * Only runs when the target is empty for that sub-tree.
 */
async function seedDataDir(dataDir: string, seedFrom: string): Promise<void> {
  if (dataDir === seedFrom) return
  if (!existsSync(seedFrom)) return

  async function copyRecursiveNoOverwrite(src: string, dst: string): Promise<number> {
    if (!existsSync(src)) return 0
    let copied = 0
    await fs.mkdir(dst, { recursive: true })
    const entries = await fs.readdir(src, { withFileTypes: true })
    for (const e of entries) {
      const s = path.join(src, e.name)
      const d = path.join(dst, e.name)
      if (e.isDirectory()) {
        copied += await copyRecursiveNoOverwrite(s, d)
      } else if (e.isFile()) {
        if (!existsSync(d)) {
          await fs.copyFile(s, d)
          copied += 1
        }
      }
    }
    return copied
  }

  async function countJsonRecursive(dir: string): Promise<number> {
    if (!existsSync(dir)) return 0
    let n = 0
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) n += await countJsonRecursive(full)
      else if (e.isFile() && e.name.endsWith('.json')) n += 1
    }
    return n
  }

  // Seed frameworks (only if target frameworks dir has zero .json files)
  const fwTarget = path.join(dataDir, 'frameworks')
  const fwSource = path.join(seedFrom, 'frameworks')
  if (existsSync(fwSource)) {
    const existing = await countJsonRecursive(fwTarget)
    if (existing === 0) {
      const n = await copyRecursiveNoOverwrite(fwSource, fwTarget)
      // eslint-disable-next-line no-console
      console.log(`[atomsyn] seeded ${n} frameworks → ${fwTarget}`)
    }
  }

  // Seed methodology atoms (all subtrees under atoms/ except experience/skill-inventory)
  const atomsSource = path.join(seedFrom, 'atoms')
  const atomsTarget = path.join(dataDir, 'atoms')
  if (existsSync(atomsSource)) {
    const entries = await fs.readdir(atomsSource, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory()) continue
      // User-mutable trees — never seeded (user grows them)
      if (e.name === 'experience' || e.name === 'skill-inventory') continue
      const s = path.join(atomsSource, e.name)
      const d = path.join(atomsTarget, e.name)
      const existing = await countJsonRecursive(d)
      if (existing === 0) {
        const n = await copyRecursiveNoOverwrite(s, d)
        // eslint-disable-next-line no-console
        console.log(`[atomsyn] seeded ${n} methodology atoms → ${d}`)
      }
    }
  }

  // Ensure user-mutable subdirs exist (so walks + writes don't fail)
  for (const sub of [
    'atoms/experience',
    'atoms/skill-inventory',
    'growth',
    'index',
    'projects',
  ]) {
    await fs.mkdir(path.join(dataDir, sub), { recursive: true })
  }

  // V1.5 fix · write initial .seed-state.json the very first time we seed.
  // Without this, the seed-check endpoint short-circuits to
  // "first-install" forever and the user never sees the update prompt
  // when they edit SEED_VERSION.json locally. We record the current seed
  // version + a manifest of the files we just copied so subsequent
  // bumps to SEED_VERSION.json diff cleanly.
  try {
    const stateFile = path.join(dataDir, '.seed-state.json')
    if (!existsSync(stateFile)) {
      const manifest = await loadSeedManifest(seedFrom)
      if (manifest?.version) {
        const fileManifest: Record<string, string> = {}
        const rootPaths = manifest.contents?.rootPaths ?? [
          'data/frameworks/',
          'data/atoms/product-innovation-24/',
        ]
        const files = await collectSeedFiles(seedFrom, rootPaths)
        for (const rel of files) {
          const userAbs = path.join(dataDir, rel)
          if (existsSync(userAbs)) {
            fileManifest[rel] = await sha256File(userAbs)
          }
        }
        await writeSeedState(dataDir, {
          installedVersion: manifest.version,
          dismissedVersions: [],
          lastSyncedAt: new Date().toISOString(),
          manifest: fileManifest,
        })
        // eslint-disable-next-line no-console
        console.log(
          `[atomsyn] initialized .seed-state.json at version ${manifest.version}`,
        )
      }
    }
  } catch (err) {
    // Non-fatal — the seed-check endpoint will just keep reporting
    // first-install until the next successful write.
    // eslint-disable-next-line no-console
    console.warn('[atomsyn] seed-state init failed (non-fatal):', err)
  }
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
      atoms.push({
        ...(JSON.parse(await fs.readFile(f, 'utf-8'))),
        _file: path.relative(dataDir, f),
        // Absolute path so the frontend can open the enclosing folder via
        // the openContainingFolder helper in src/lib/openPath.ts.
        _absPath: path.resolve(f),
      })
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
  const allAtoms = await loadAllAtoms(dataDir)
  // V1.5: The knowledge-index.json `atoms` field stays methodology-only for
  // backward compatibility with Copilot/Spotlight search. Experience atoms
  // and skill-inventory items live under data/atoms/{experience,skill-inventory}/
  // and will get their own index fields in Sprint 2. Treat missing kind as
  // methodology (pre-V1.5 legacy).
  const atoms = allAtoms.filter((a: any) => (a.kind ?? 'methodology') === 'methodology')
  const experienceAtoms = allAtoms.filter((a: any) => a.kind === 'experience')
  const skillInventoryAtoms = allAtoms.filter((a: any) => a.kind === 'skill-inventory')
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

  const indexedExperiences = experienceAtoms.map((e: any) => ({
    id: e.id,
    name: e.name,
    tags: e.tags ?? [],
    sourceAgent: e.sourceAgent ?? 'user',
    sourceContext: e.sourceContext ?? '',
    insightExcerpt: (e.insight ?? '').slice(0, 200),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    path: e._file,
  }))

  const indexedSkillInventory = skillInventoryAtoms.map((s: any) => ({
    id: s.id,
    name: s.name,
    toolName: s.toolName ?? 'custom',
    rawDescription: s.rawDescription ?? '',
    aiGeneratedSummary: s.aiGeneratedSummary,
    tags: s.tags ?? [],
    localPath: s.localPath ?? '',
    updatedAt: s.updatedAt,
  }))

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
    experiences: indexedExperiences,
    skillInventory: indexedSkillInventory,
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
      fresh.stats = fresh.stats || { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
      fresh.stats.aiInvokeCount ??= 0
      fresh.stats.humanViewCount ??= 0
      fresh.stats.usedInProjects = used
      fresh.updatedAt = new Date().toISOString()
      await writeJSON(file, fresh)
    }
  }

  return index
}

// ---------- V1.5 · seed methodology version updates ------------------------

interface SeedManifest {
  version: string
  releaseDate: string
  description?: string
  changelog?: Array<{ version: string; date: string; notes: string[] }>
  contents: {
    frameworks: string[]
    methodologyAtomCount: number
    rootPaths: string[]
  }
}

interface SeedState {
  installedVersion: string
  dismissedVersions: string[]
  lastSyncedAt: string
  manifest: Record<string, string>
}

interface SeedDiff {
  added: string[]
  updated: string[]
  userModifiedKept: string[]
  removedFromSeed: string[]
  unchanged: number
}

function sha256File(file: string): Promise<string> {
  return fs.readFile(file).then((buf) => 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'))
}

async function walkRelative(root: string): Promise<string[]> {
  const out: string[] = []
  if (!existsSync(root)) return out
  async function recur(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await recur(full)
      else if (e.isFile()) out.push(path.relative(root, full))
    }
  }
  await recur(root)
  return out
}

async function loadSeedManifest(seedRoot: string): Promise<SeedManifest | null> {
  const file = path.join(seedRoot, 'SEED_VERSION.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as SeedManifest
  } catch {
    return null
  }
}

function seedStateFile(dataDir: string): string {
  return path.join(dataDir, '.seed-state.json')
}

async function loadSeedState(dataDir: string): Promise<SeedState | null> {
  const file = seedStateFile(dataDir)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as SeedState
  } catch {
    return null
  }
}

async function writeSeedState(dataDir: string, state: SeedState) {
  await writeJSON(seedStateFile(dataDir), state)
}

/**
 * Walk all files under each rootPath relative to seedRoot. Returns
 * relative paths (relative to seedRoot) so the same paths can be looked up
 * inside dataDir for diffing.
 */
async function collectSeedFiles(seedRoot: string, rootPaths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const rp of rootPaths) {
    const stripped = rp.replace(/^data\//, '').replace(/\/$/, '')
    const abs = path.join(seedRoot, stripped)
    if (!existsSync(abs)) continue
    const files = await walkRelative(abs)
    for (const rel of files) {
      out.push(path.join(stripped, rel))
    }
  }
  return out
}

/**
 * Compute the diff between seed and user data. Uses the saved manifest from
 * the previous sync (if any) to detect user modifications:
 *  - file in seed but not in user → added
 *  - file in both, content equal → unchanged
 *  - file in both, content differs, local hash === manifest[path] → updated (safe to overwrite)
 *  - file in both, content differs, local hash !== manifest[path] → user-modified-kept
 *  - file in user under seed paths but not in seed → removed-from-seed
 */
async function computeSeedDiff(
  seedRoot: string,
  dataDir: string,
  rootPaths: string[],
  prevManifest: Record<string, string>,
): Promise<SeedDiff> {
  const seedFiles = await collectSeedFiles(seedRoot, rootPaths)
  const seedSet = new Set(seedFiles)

  const diff: SeedDiff = {
    added: [],
    updated: [],
    userModifiedKept: [],
    removedFromSeed: [],
    unchanged: 0,
  }

  for (const rel of seedFiles) {
    const seedAbs = path.join(seedRoot, rel)
    const userAbs = path.join(dataDir, rel)
    if (!existsSync(userAbs)) {
      diff.added.push(rel)
      continue
    }
    const [seedHash, userHash] = await Promise.all([sha256File(seedAbs), sha256File(userAbs)])
    if (seedHash === userHash) {
      diff.unchanged += 1
      continue
    }
    const pristine = prevManifest[rel] && prevManifest[rel] === userHash
    if (pristine) {
      diff.updated.push(rel)
    } else {
      diff.userModifiedKept.push(rel)
    }
  }

  // detect removed-from-seed: walk user-side roots
  const userFiles = await collectSeedFiles(dataDir, rootPaths)
  for (const rel of userFiles) {
    if (!seedSet.has(rel)) diff.removedFromSeed.push(rel)
  }

  return diff
}

/**
 * Apply the diff: copy `added` + `updated` files from seed to user. Skips
 * userModifiedKept and removedFromSeed entirely. Rebuilds the manifest from
 * the post-sync state and writes .seed-state.json.
 */
async function applySeedSync(
  seedRoot: string,
  dataDir: string,
  manifest: SeedManifest,
  diff: SeedDiff,
): Promise<{ synced: number; skipped: number }> {
  const toCopy = [...diff.added, ...diff.updated]
  let synced = 0
  for (const rel of toCopy) {
    const src = path.join(seedRoot, rel)
    const dst = path.join(dataDir, rel)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.copyFile(src, dst)
    synced += 1
  }

  // rebuild manifest from post-sync user state for ALL seed paths
  const postFiles = await collectSeedFiles(seedRoot, manifest.contents.rootPaths)
  const newManifest: Record<string, string> = {}
  for (const rel of postFiles) {
    const userAbs = path.join(dataDir, rel)
    if (existsSync(userAbs)) {
      newManifest[rel] = await sha256File(userAbs)
    }
  }

  const state: SeedState = {
    installedVersion: manifest.version,
    dismissedVersions: (await loadSeedState(dataDir))?.dismissedVersions ?? [],
    lastSyncedAt: new Date().toISOString(),
    manifest: newManifest,
  }
  await writeSeedState(dataDir, state)

  return { synced, skipped: diff.userModifiedKept.length }
}

// ---------- main plugin ----------------------------------------------------

export function dataApiPlugin(opts: Options): Plugin {
  const { dataDir, seedFrom } = opts

  return {
    name: 'ccl-pm-data-api',
    async configureServer(server) {
      // First-run seed: non-destructively copy V1 seed data from the project
      // /data/ (or whatever seedFrom points at) into the resolved user data
      // directory if it's empty. Mirrors src-tauri/src/lib.rs init_seed_*.
      if (seedFrom) {
        try {
          await seedDataDir(dataDir, seedFrom)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[atomsyn] seed failed (non-fatal):', err)
        }
      }
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
              const now = new Date().toISOString()
              body.createdAt ||= now
              body.updatedAt = now
              body.bookmarks ||= []
              body.stats ||= { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
              body.schemaVersion = 1

              // 1) Handle 'experience' / 'fragment' (V2.0)
              if (body.kind === 'experience') {
                if (!body.id) {
                  return send(res, 400, { error: 'id is required for experience atoms' })
                }
                const slug = body.id.replace(/^atom_(exp|frag)_/, '').replace(/_/g, '-')
                const folder = path.join(dataDir, 'atoms', 'experience', slug)
                await fs.mkdir(folder, { recursive: true })
                const file = path.join(folder, `${body.id}.json`)
                await writeJSON(file, body)
                await rebuildIndex(dataDir)
                return send(res, 201, body)
              }

              // 2) Handle 'methodology' (Legacy/Default)
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
            // V2.0 M2: lightweight view counter bump (no full atom body required)
            if (method === 'PATCH' && parts.length === 3 && parts[2] === 'track-view') {
              const file = await findAtomFile(dataDir, parts[1])
              if (!file) return send(res, 404, { error: 'not found' })
              const atom = JSON.parse(await fs.readFile(file, 'utf-8'))
              atom.stats = atom.stats || {}
              atom.stats.humanViewCount = (atom.stats.humanViewCount || 0) + 1
              atom.stats.lastUsedAt = new Date().toISOString()
              await writeJSON(file, atom)
              return send(res, 200, { ok: true, humanViewCount: atom.stats.humanViewCount })
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

          // ---------- scan skills (V1.5 · hot rescan) ----------
          if (parts[0] === 'scan-skills' && method === 'POST') {
            try {
              const { spawn } = await import('node:child_process')
              const scriptPath = path.resolve(process.cwd(), 'scripts', 'scan-skills.mjs')
              const result: { added: number; unchanged: number; removed: number } =
                await new Promise((resolve, reject) => {
                  let stdout = ''
                  let stderr = ''
                  const proc = spawn('node', [scriptPath, '--verbose'], {
                    env: { ...process.env, ATOMSYN_SCAN_DATA_DIR: dataDir },
                    stdio: ['ignore', 'pipe', 'pipe'],
                  })
                  proc.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
                  proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
                  proc.on('error', reject)
                  proc.on('exit', (code) => {
                    if (code !== 0) {
                      return reject(
                        new Error(`scan-skills exited ${code}: ${stderr || stdout}`),
                      )
                    }
                    // Parse summary from stdout (scan-skills prints `N added / M unchanged / K removed`)
                    const m = stdout.match(
                      /(\d+)\s*added[^\d]+(\d+)\s*unchanged(?:[^\d]+(\d+)\s*removed)?/i,
                    )
                    resolve({
                      added: m ? parseInt(m[1], 10) : 0,
                      unchanged: m ? parseInt(m[2], 10) : 0,
                      removed: m && m[3] ? parseInt(m[3], 10) : 0,
                    })
                  })
                })
              await rebuildIndex(dataDir)
              return send(res, 200, { ok: true, ...result })
            } catch (err) {
              return send(res, 500, {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              })
            }
          }

          // ---------- V1.5 · seed methodology updates ----------
          if (parts[0] === 'seed-check' && method === 'GET') {
            if (!seedFrom) {
              return send(res, 200, {
                seedVersion: 'unknown',
                installedVersion: null,
                hasUpdate: false,
                dismissed: false,
                reason: 'no-seed-configured',
              })
            }
            const manifest = await loadSeedManifest(seedFrom)
            if (!manifest) {
              return send(res, 200, {
                seedVersion: 'unknown',
                installedVersion: null,
                hasUpdate: false,
                dismissed: false,
                reason: 'no-seed-manifest',
              })
            }
            // Dogfood: when project /data IS the user data dir, comparing
            // seed to itself is meaningless — treat as already in sync.
            if (path.resolve(seedFrom) === path.resolve(dataDir)) {
              return send(res, 200, {
                seedVersion: manifest.version,
                installedVersion: manifest.version,
                hasUpdate: false,
                dismissed: false,
                reason: 'dogfood-same-dir',
                changelog: manifest.changelog,
              })
            }
            const state = await loadSeedState(dataDir)
            const installedVersion = state?.installedVersion ?? null
            const dismissed = state?.dismissedVersions?.includes(manifest.version) ?? false
            // First install (no .seed-state.json yet) — don't spam the prompt;
            // first-run seeding already copied the files. Just record the version.
            if (!installedVersion) {
              return send(res, 200, {
                seedVersion: manifest.version,
                installedVersion: null,
                hasUpdate: false,
                dismissed: false,
                reason: 'first-install',
                changelog: manifest.changelog,
              })
            }
            const isNewer = manifest.version !== installedVersion
            const diff = isNewer
              ? await computeSeedDiff(seedFrom, dataDir, manifest.contents.rootPaths, state?.manifest ?? {})
              : undefined
            return send(res, 200, {
              seedVersion: manifest.version,
              installedVersion,
              hasUpdate: isNewer,
              dismissed,
              diff,
              changelog: manifest.changelog,
              lastSyncedAt: state?.lastSyncedAt,
            })
          }

          if (parts[0] === 'seed-sync' && method === 'POST') {
            if (!seedFrom) return send(res, 400, { error: 'no-seed-configured' })
            const manifest = await loadSeedManifest(seedFrom)
            if (!manifest) return send(res, 400, { error: 'no-seed-manifest' })
            if (path.resolve(seedFrom) === path.resolve(dataDir)) {
              return send(res, 200, { ok: true, synced: 0, skipped: 0, reason: 'dogfood-same-dir' })
            }
            const state = await loadSeedState(dataDir)
            const diff = await computeSeedDiff(
              seedFrom,
              dataDir,
              manifest.contents.rootPaths,
              state?.manifest ?? {},
            )
            const result = await applySeedSync(seedFrom, dataDir, manifest, diff)
            await rebuildIndex(dataDir)
            return send(res, 200, { ok: true, ...result })
          }

          if (parts[0] === 'seed-dismiss' && method === 'POST') {
            const body = await readBody(req)
            const version = typeof body.version === 'string' ? body.version : null
            if (!version) return send(res, 400, { error: 'version required' })
            const state =
              (await loadSeedState(dataDir)) ?? {
                installedVersion: '',
                dismissedVersions: [],
                lastSyncedAt: '',
                manifest: {},
              }
            if (!state.dismissedVersions.includes(version)) {
              state.dismissedVersions.push(version)
            }
            await writeSeedState(dataDir, state)
            return send(res, 200, { ok: true })
          }

          if (parts[0] === 'seed-reset-dismiss' && method === 'POST') {
            const state = await loadSeedState(dataDir)
            if (state) {
              state.dismissedVersions = []
              await writeSeedState(dataDir, state)
            }
            return send(res, 200, { ok: true })
          }

          // ---------- V1.5 · app version (stub for V1.6 GitHub Releases) ----------
          if (parts[0] === 'app-version' && method === 'GET') {
            // TODO(V1.6): once the repo ships, fetch
            //   https://api.github.com/repos/circlelee/atomsyn/releases/latest
            // and compare tag_name vs APP_VERSION using semver. Set
            //   { latest, hasUpdate: latest > current, releaseUrl, changelogUrl }
            return send(res, 200, {
              current: '0.1.0',
              latest: null,
              hasUpdate: false,
              reason: 'v1.5-not-published',
            })
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
