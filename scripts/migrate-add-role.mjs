#!/usr/bin/env node
/**
 * V2.0 M3 · Add role dimension to existing atoms.
 *
 * - All methodology atoms under product-innovation-24/ → role: "产品"
 * - Experience atoms: manually mapped by known IDs
 * - Backfills subKind, aiInvokeCount, humanViewCount
 *
 * Run: node scripts/migrate-add-role.mjs [--dry-run]
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { existsSync, readFileSync } from 'node:fs'

const dryRun = process.argv.includes('--dry-run')

function resolveDataDir() {
  if (process.env.ATOMSYN_DEV_DATA_DIR) return process.env.ATOMSYN_DEV_DATA_DIR
  const configPath = join(homedir(), '.atomsyn-config.json')
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
      if (cfg.dataDir) return cfg.dataDir
    } catch {}
  }
  const home = homedir()
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'atomsyn')
  if (platform() === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'atomsyn')
  return join(home, '.local', 'share', 'atomsyn')
}

async function walkJson(dir) {
  const out = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) out.push(...(await walkJson(full)))
      else if (e.name.endsWith('.json')) out.push(full)
    }
  } catch {}
  return out
}

// Known experience atom mappings
const EXPERIENCE_MAP = {
  'atom_exp_zustand-selector-rerender_1775651326': {
    role: '工程',
    situation: '代码审查',
    activity: '调试',
    insight_type: '方法验证',
  },
  'atom_exp_macos-tauri-hit-test-vs-drag-region_1775656757': {
    role: '工程',
    situation: '踩坑当下',
    activity: '调试',
    insight_type: '反直觉',
  },
}

async function main() {
  const dataDir = resolveDataDir()
  console.log(`Data dir: ${dataDir}`)
  console.log(`Dry run: ${dryRun}\n`)

  let migrated = 0
  let skipped = 0

  // 1. Methodology atoms: add role: "产品"
  const methDir = join(dataDir, 'atoms', 'product-innovation-24')
  const methFiles = await walkJson(methDir)
  console.log(`Found ${methFiles.length} methodology atom files\n`)

  for (const f of methFiles) {
    try {
      const raw = await readFile(f, 'utf8')
      const atom = JSON.parse(raw)
      if (atom.kind !== 'methodology') { skipped++; continue }

      let changed = false
      if (!atom.role) { atom.role = '产品'; changed = true }
      if (atom.stats) {
        if (typeof atom.stats.aiInvokeCount !== 'number') { atom.stats.aiInvokeCount = 0; changed = true }
        if (typeof atom.stats.humanViewCount !== 'number') { atom.stats.humanViewCount = 0; changed = true }
      }

      if (!changed) { skipped++; continue }
      atom.updatedAt = new Date().toISOString()

      if (dryRun) {
        console.log(`[DRY] methodology: ${atom.id} → role: "${atom.role}"`)
      } else {
        await writeFile(f, JSON.stringify(atom, null, 2) + '\n')
        console.log(`[OK]  methodology: ${atom.id} → role: "${atom.role}"`)
      }
      migrated++
    } catch (e) {
      console.error(`[ERR] ${f}: ${e.message}`)
    }
  }

  // 2. Experience atoms: map by known IDs
  const expDir = join(dataDir, 'atoms', 'experience')
  const expFiles = await walkJson(expDir)
  console.log(`\nFound ${expFiles.length} experience atom files\n`)

  for (const f of expFiles) {
    if (f.includes('/fragment/')) { skipped++; continue }
    try {
      const raw = await readFile(f, 'utf8')
      const atom = JSON.parse(raw)
      if (atom.kind !== 'experience') { skipped++; continue }

      let changed = false
      const mapping = EXPERIENCE_MAP[atom.id]
      if (mapping) {
        if (!atom.role) { atom.role = mapping.role; changed = true }
        if (!atom.situation) { atom.situation = mapping.situation; changed = true }
        if (!atom.activity) { atom.activity = mapping.activity; changed = true }
        if (!atom.insight_type) { atom.insight_type = mapping.insight_type; changed = true }
      }
      if (!atom.subKind) { atom.subKind = 'crystallized'; changed = true }
      if (atom.stats) {
        if (typeof atom.stats.aiInvokeCount !== 'number') { atom.stats.aiInvokeCount = 0; changed = true }
        if (typeof atom.stats.humanViewCount !== 'number') { atom.stats.humanViewCount = 0; changed = true }
      }

      if (!changed) { skipped++; continue }
      atom.updatedAt = new Date().toISOString()

      if (dryRun) {
        console.log(`[DRY] experience: ${atom.id} → role: "${atom.role || '?'}"`)
      } else {
        await writeFile(f, JSON.stringify(atom, null, 2) + '\n')
        console.log(`[OK]  experience: ${atom.id} → role: "${atom.role || '?'}"`)
      }
      migrated++
    } catch (e) {
      console.error(`[ERR] ${f}: ${e.message}`)
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
