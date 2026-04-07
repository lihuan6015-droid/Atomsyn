#!/usr/bin/env node
/**
 * Rebuild the knowledge index from the data folder.
 * Used by `npm run reindex` when the dev server is not running.
 *
 * Mirrors the logic in vite-plugin-data-api.ts (rebuildIndex).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '..', 'data')

async function walk(dir, exts = ['.json']) {
  const out = []
  if (!existsSync(dir)) return out
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(full, exts)))
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full)
  }
  return out
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'))
  } catch {
    return fallback
  }
}

async function loadFrameworks() {
  const dir = path.join(dataDir, 'frameworks')
  if (!existsSync(dir)) return []
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'))
  return Promise.all(files.map((f) => readJson(path.join(dir, f), null))).then((arr) =>
    arr.filter(Boolean)
  )
}

async function loadAllAtomsAny() {
  const files = await walk(path.join(dataDir, 'atoms'))
  const out = []
  for (const f of files) {
    const j = await readJson(f, null)
    if (!j) continue
    out.push({ ...j, _file: path.relative(dataDir, f) })
  }
  return out
}

async function loadProjects() {
  const dir = path.join(dataDir, 'projects')
  if (!existsSync(dir)) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const meta = await readJson(path.join(dir, e.name, 'meta.json'), null)
    if (meta) out.push(meta)
  }
  return out
}

async function loadPractices(projectId) {
  const dir = path.join(dataDir, 'projects', projectId, 'practices')
  if (!existsSync(dir)) return []
  const files = await walk(dir)
  return Promise.all(files.map((f) => readJson(f, null))).then((arr) => arr.filter(Boolean))
}

async function rebuild() {
  const frameworks = await loadFrameworks()
  const allAtoms = await loadAllAtomsAny()
  // V1.5: backward compat — `atoms` index field stays methodology-only.
  const atoms = allAtoms.filter((a) => (a.kind ?? 'methodology') === 'methodology')
  const experienceAtoms = allAtoms.filter((a) => a.kind === 'experience')
  const skillInventoryAtoms = allAtoms.filter((a) => a.kind === 'skill-inventory')
  const projects = await loadProjects()

  const fwAtomCount = {}
  for (const a of atoms) {
    fwAtomCount[a.frameworkId] = (fwAtomCount[a.frameworkId] || 0) + 1
  }

  const cellNameByFwAndCell = {}
  for (const f of frameworks) {
    cellNameByFwAndCell[f.id] = {}
    for (const c of f.matrix?.cells ?? []) {
      cellNameByFwAndCell[f.id][c.stepNumber] = c.name
    }
  }

  const projectsUsingAtom = {}
  for (const p of projects) {
    const practices = await loadPractices(p.id)
    const atomIds = new Set()
    for (const pr of practices) atomIds.add(pr.atomId)
    for (const pin of p.pinnedAtoms ?? []) atomIds.add(pin.atomId)
    for (const aid of atomIds) {
      ;(projectsUsingAtom[aid] ??= []).push(p.id)
    }
  }

  const indexed = {
    generatedAt: new Date().toISOString(),
    version: 1,
    frameworks: frameworks.map((f) => ({
      id: f.id,
      name: f.name,
      atomCount: fwAtomCount[f.id] || 0,
    })),
    atoms: atoms.map((a) => ({
      id: a.id,
      name: a.name,
      nameEn: a.nameEn,
      frameworkId: a.frameworkId,
      cellId: a.cellId,
      cellName: cellNameByFwAndCell[a.frameworkId]?.[a.cellId] ?? '',
      tags: a.tags ?? [],
      tagline: (a.coreIdea ?? '').slice(0, 80),
      whenToUse: a.whenToUse ?? '',
      path: a._file,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      innovationStage: p.innovationStage,
      atomsUsed: Array.from(new Set([...(p.pinnedAtoms?.map((x) => x.atomId) ?? [])])),
    })),
    experiences: experienceAtoms.map((e) => ({
      id: e.id,
      name: e.name,
      tags: e.tags ?? [],
      sourceAgent: e.sourceAgent ?? 'user',
      sourceContext: e.sourceContext ?? '',
      insightExcerpt: (e.insight ?? '').slice(0, 200),
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      path: e._file,
    })),
    skillInventory: skillInventoryAtoms.map((s) => ({
      id: s.id,
      name: s.name,
      toolName: s.toolName ?? 'custom',
      rawDescription: s.rawDescription ?? '',
      aiGeneratedSummary: s.aiGeneratedSummary,
      tags: s.tags ?? [],
      localPath: s.localPath ?? '',
      updatedAt: s.updatedAt,
    })),
  }

  const outFile = path.join(dataDir, 'index', 'knowledge-index.json')
  await fs.mkdir(path.dirname(outFile), { recursive: true })
  await fs.writeFile(outFile, JSON.stringify(indexed, null, 2) + '\n', 'utf-8')

  // sync atom.stats.usedInProjects
  for (const a of atoms) {
    const used = projectsUsingAtom[a.id] ?? []
    if (JSON.stringify(a.stats?.usedInProjects ?? []) !== JSON.stringify(used)) {
      const file = path.join(dataDir, a._file)
      const fresh = await readJson(file, null)
      if (!fresh) continue
      fresh.stats = fresh.stats || { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 }
      fresh.stats.usedInProjects = used
      fresh.updatedAt = new Date().toISOString()
      await fs.writeFile(file, JSON.stringify(fresh, null, 2) + '\n', 'utf-8')
    }
  }

  console.log(
    `✅ Index rebuilt: ${indexed.frameworks.length} frameworks · ${indexed.atoms.length} atoms · ${indexed.experiences.length} experiences · ${indexed.skillInventory.length} skills · ${indexed.projects.length} projects`
  )
}

rebuild().catch((err) => {
  console.error('❌ rebuild-index failed:', err)
  process.exit(1)
})
