/**
 * Index rebuild — port of vite-plugin-data-api.ts rebuildIndex().
 * Uses Tauri FS plugin for all I/O.
 */

import {
  getDataDir,
  joinPathSync,
  readJSON,
  writeJSON,
  walk,
  fileExists,
  relativePath,
} from './fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'

// ---------------------------------------------------------------------------
// Entity loaders (mirrors vite plugin helpers)
// ---------------------------------------------------------------------------

export async function loadAllFrameworks(dataDir: string): Promise<any[]> {
  const dir = joinPathSync(dataDir, 'frameworks')
  if (!(await fileExists(dir))) return []
  const files = await walk(dir, ['.json'])
  const result: any[] = []
  for (const f of files) {
    try {
      result.push(JSON.parse(await readTextFile(f)))
    } catch { /* skip */ }
  }
  return result
}

export async function loadAllAtoms(dataDir: string): Promise<any[]> {
  const atomsDir = joinPathSync(dataDir, 'atoms')
  const files = await walk(atomsDir)
  const atoms: any[] = []
  for (const f of files) {
    try {
      const atom = JSON.parse(await readTextFile(f))
      atom._file = relativePath(dataDir, f)
      atom._absPath = f
      atoms.push(atom)
    } catch { /* skip */ }
  }
  return atoms
}

export async function loadAllProjects(dataDir: string): Promise<any[]> {
  const dir = joinPathSync(dataDir, 'projects')
  if (!(await fileExists(dir))) return []
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const entries = await readDir(dir)
  const projects: any[] = []
  for (const e of entries) {
    if (!e.isDirectory) continue
    const metaFile = joinPathSync(dir, e.name, 'meta.json')
    if (await fileExists(metaFile)) {
      try {
        projects.push(JSON.parse(await readTextFile(metaFile)))
      } catch { /* skip */ }
    }
  }
  return projects
}

export async function loadProjectPractices(
  dataDir: string,
  projectId: string
): Promise<any[]> {
  const dir = joinPathSync(dataDir, 'projects', projectId, 'practices')
  if (!(await fileExists(dir))) return []
  const files = await walk(dir)
  const out: any[] = []
  for (const f of files) {
    try {
      out.push(JSON.parse(await readTextFile(f)))
    } catch { /* skip */ }
  }
  return out
}

export async function findAtomFile(
  dataDir: string,
  atomId: string
): Promise<string | null> {
  const atomsDir = joinPathSync(dataDir, 'atoms')
  const files = await walk(atomsDir)
  for (const f of files) {
    try {
      const j = JSON.parse(await readTextFile(f))
      if (j.id === atomId) return f
    } catch { /* skip */ }
  }
  return null
}

export async function findPracticeFile(
  dataDir: string,
  projectId: string,
  practiceId: string
): Promise<string | null> {
  const dir = joinPathSync(dataDir, 'projects', projectId, 'practices')
  if (!(await fileExists(dir))) return null
  const files = await walk(dir)
  for (const f of files) {
    try {
      const j = JSON.parse(await readTextFile(f))
      if (j.id === practiceId) return f
    } catch { /* skip */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// Index rebuild
// ---------------------------------------------------------------------------

export async function rebuildIndex(dataDir?: string): Promise<any> {
  const dd = dataDir || (await getDataDir())
  const frameworks = await loadAllFrameworks(dd)
  const allAtoms = await loadAllAtoms(dd)
  const atoms = allAtoms.filter((a: any) => (a.kind ?? 'methodology') === 'methodology')
  const experienceAtoms = allAtoms.filter((a: any) => a.kind === 'experience')
  const skillInventoryAtoms = allAtoms.filter((a: any) => a.kind === 'skill-inventory')
  const projects = await loadAllProjects(dd)

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
    const practices = await loadProjectPractices(dd, p.id)
    const atomIds = new Set<string>()
    for (const pr of practices) atomIds.add(pr.atomId)
    for (const pin of p.pinnedAtoms ?? []) atomIds.add(pin.atomId)
    for (const aid of atomIds) {
      ;(projectsUsingAtom[aid] ??= []).push(p.id)
    }
  }

  const indexedAtoms = atoms.map((a: any) => ({
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

  const indexedProjects = projects.map((p: any) => ({
    id: p.id,
    name: p.name,
    innovationStage: p.innovationStage,
    atomsUsed: Array.from(
      new Set([...(p.pinnedAtoms?.map((x: any) => x.atomId) ?? [])])
    ),
  }))

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
    frameworks: frameworks.map((f: any) => ({
      id: f.id,
      name: f.name,
      atomCount: fwAtomCount[f.id] || 0,
    })),
    atoms: indexedAtoms,
    projects: indexedProjects,
    experiences: indexedExperiences,
    skillInventory: indexedSkillInventory,
  }

  const indexFile = joinPathSync(dd, 'index', 'knowledge-index.json')
  await writeJSON(indexFile, index)

  // reverse-sync atom.stats.usedInProjects from practice data
  for (const a of atoms) {
    const used = projectsUsingAtom[a.id] ?? []
    if (
      JSON.stringify(a.stats?.usedInProjects ?? []) !== JSON.stringify(used)
    ) {
      const file = joinPathSync(dd, a._file)
      try {
        const fresh = JSON.parse(await readTextFile(file))
        fresh.stats = fresh.stats || {
          usedInProjects: [],
          useCount: 0,
          aiInvokeCount: 0,
          humanViewCount: 0,
        }
        fresh.stats.aiInvokeCount ??= 0
        fresh.stats.humanViewCount ??= 0
        fresh.stats.usedInProjects = used
        fresh.updatedAt = new Date().toISOString()
        await writeJSON(file, fresh)
      } catch { /* skip */ }
    }
  }

  return index
}
