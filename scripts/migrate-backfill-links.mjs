#!/usr/bin/env node
/**
 * M4 migration: backfill linked_methodologies for existing experience atoms.
 *
 * Uses the same keyword-scoring logic as cmdIngest to automatically
 * link existing fragments/experiences to methodology atoms.
 *
 * Usage: node scripts/migrate-backfill-links.mjs [--dry-run]
 */

import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'

function platformAppDataDir() {
  const home = homedir()
  switch (platform()) {
    case 'darwin': return join(home, 'Library', 'Application Support')
    case 'win32': return process.env.APPDATA || join(home, 'AppData', 'Roaming')
    default: return join(home, '.local', 'share')
  }
}

function resolveDataDir() {
  if (process.env.ATOMSYN_DEV_DATA_DIR) return process.env.ATOMSYN_DEV_DATA_DIR
  return join(platformAppDataDir(), 'atomsyn')
}

async function walkJson(dir) {
  const out = []
  if (!existsSync(dir)) return out
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walkJson(full)))
    else if (e.isFile() && e.name.endsWith('.json')) out.push(full)
  }
  return out
}

const dryRun = process.argv.includes('--dry-run')
const dataDir = resolveDataDir()
const atomsRoot = join(dataDir, 'atoms')

console.log(`Data dir: ${dataDir}`)
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
console.log('')

// Step 1: Load all methodology atoms into memory
const methodologyAtoms = []
const topEntries = await readdir(atomsRoot, { withFileTypes: true })
for (const e of topEntries) {
  if (!e.isDirectory()) continue
  if (['experience', 'methodology', 'skill-inventory'].includes(e.name)) continue
  const files = await walkJson(join(atomsRoot, e.name))
  for (const f of files) {
    try {
      const atom = JSON.parse(await readFile(f, 'utf8'))
      if (atom.kind === 'skill-inventory') continue
      const haystack = (
        (atom.name || '') + ' ' + (atom.nameEn || '') + ' ' +
        (atom.coreIdea || '') + ' ' + (atom.whenToUse || '') + ' ' +
        (atom.tags || []).join(' ')
      ).toLowerCase()
      methodologyAtoms.push({ id: atom.id, name: atom.name, haystack })
    } catch { /* skip */ }
  }
}
console.log(`Loaded ${methodologyAtoms.length} methodology atoms`)

// Step 2: Scan all experience atoms and backfill
const experienceDir = join(atomsRoot, 'experience')
const expFiles = await walkJson(experienceDir)
let updated = 0
let skipped = 0

for (const f of expFiles) {
  try {
    const atom = JSON.parse(await readFile(f, 'utf8'))

    // Skip if already has links
    if (Array.isArray(atom.linked_methodologies) && atom.linked_methodologies.length > 0) {
      console.log(`  SKIP (already linked): ${atom.title || atom.name} → ${atom.linked_methodologies.length} links`)
      skipped++
      continue
    }

    // Build query from atom fields
    const q = (
      (atom.title || atom.name || '') + ' ' +
      (atom.tags || []).join(' ') + ' ' +
      (atom.role || '') + ' ' +
      (atom.summary || atom.insight || '')
    ).toLowerCase()
    const qTerms = q.split(/\s+/).filter(Boolean)

    // Score against methodology atoms
    const scored = []
    for (const m of methodologyAtoms) {
      let score = 0
      for (const t of qTerms) {
        score += m.haystack.split(t).length - 1
      }
      if (score >= 2) scored.push({ id: m.id, name: m.name, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const links = scored.slice(0, 5)

    if (links.length === 0) {
      console.log(`  NO MATCH: ${atom.title || atom.name}`)
      continue
    }

    atom.linked_methodologies = links.map(l => l.id)
    atom.updatedAt = new Date().toISOString()

    console.log(`  LINK: ${(atom.title || atom.name || '').slice(0, 50)}`)
    for (const l of links) {
      console.log(`    → ${l.name} (score: ${l.score})`)
    }

    if (!dryRun) {
      await writeFile(f, JSON.stringify(atom, null, 2) + '\n')
    }
    updated++
  } catch (err) {
    console.log(`  ERROR: ${f} — ${err.message}`)
  }
}

console.log('')
console.log(`Done. Updated: ${updated}, Skipped: ${skipped}, Total: ${expFiles.length}`)
if (dryRun) console.log('(Dry run — no files modified)')
