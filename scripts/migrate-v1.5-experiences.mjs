#!/usr/bin/env node
/**
 * V2.0 M3 · Migrate V1.5 crystallized experiences.
 *
 * What it does:
 * 1. Reads all experience atoms (non-fragment)
 * 2. Adds `subKind: 'crystallized'` if missing
 * 3. Backfills new stats fields (aiInvokeCount, humanViewCount) if missing
 * 4. Writes back to disk
 *
 * What it does NOT do:
 * - Does NOT call LLM to reclassify (that would be destructive)
 * - Does NOT add four-dimension fields (role/situation/activity/insight_type)
 * - Does NOT move files to fragment/ directory
 *
 * Run: node scripts/migrate-v1.5-experiences.mjs [--dry-run]
 */

import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
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

async function main() {
  const dataDir = resolveDataDir()
  const experienceDir = join(dataDir, 'atoms', 'experience')
  console.log(`Data dir: ${dataDir}`)
  console.log(`Experience dir: ${experienceDir}`)
  console.log(`Dry run: ${dryRun}\n`)

  const files = await walkJson(experienceDir)
  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const f of files) {
    // Skip fragment/ directory — those are already V2.0
    if (f.includes('/fragment/')) {
      skipped++
      continue
    }

    try {
      const raw = await readFile(f, 'utf8')
      const atom = JSON.parse(raw)

      if (atom.kind !== 'experience') {
        skipped++
        continue
      }

      // Already migrated?
      if (atom.subKind === 'crystallized') {
        skipped++
        continue
      }

      let changed = false

      // Add subKind
      if (!atom.subKind) {
        atom.subKind = 'crystallized'
        changed = true
      }

      // Backfill new stats fields
      if (atom.stats) {
        if (typeof atom.stats.aiInvokeCount !== 'number') {
          atom.stats.aiInvokeCount = 0
          changed = true
        }
        if (typeof atom.stats.humanViewCount !== 'number') {
          atom.stats.humanViewCount = 0
          changed = true
        }
      }

      if (!changed) {
        skipped++
        continue
      }

      atom.updatedAt = new Date().toISOString()

      if (dryRun) {
        console.log(`[DRY] Would migrate: ${atom.id} (${f})`)
      } else {
        await writeFile(f, JSON.stringify(atom, null, 2) + '\n')
        console.log(`[OK]  Migrated: ${atom.id}`)
      }
      migrated++
    } catch (e) {
      console.error(`[ERR] ${f}: ${e.message}`)
      errors++
    }
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
