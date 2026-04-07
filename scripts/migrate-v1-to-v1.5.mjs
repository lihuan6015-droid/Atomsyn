#!/usr/bin/env node
/**
 * CCL Atlas · V1 → V1.5 Migration Script
 *
 * What it does:
 *   - Scans data/atoms/**\/*.json
 *   - For each atom file missing the `kind` field, backfills `kind: "methodology"`
 *   - Updates `updatedAt` to now() only if the file actually changed
 *   - Reports: scanned / updated / skipped / errors
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/migrate-v1-to-v1.5.mjs
 *   node scripts/migrate-v1-to-v1.5.mjs --dry-run   # preview without writing
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ATOMS_DIR = join(ROOT, 'data', 'atoms')
const DRY_RUN = process.argv.includes('--dry-run')

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

/**
 * Recursively walk a directory and yield .json file paths.
 */
async function* walkJsonFiles(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkJsonFiles(full)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      yield full
    }
  }
}

async function migrateFile(filePath) {
  const raw = await readFile(filePath, 'utf8')
  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    return { path: filePath, status: 'error', reason: `Invalid JSON: ${err.message}` }
  }

  // Only touch files that look like an atom (have id + schemaVersion)
  if (typeof json.id !== 'string' || json.schemaVersion !== 1) {
    return { path: filePath, status: 'skipped', reason: 'Not an atom shape' }
  }

  if (typeof json.kind === 'string') {
    return { path: filePath, status: 'already-migrated', kind: json.kind }
  }

  // Backfill: any atom without `kind` in V1 was a methodology atom by definition.
  json.kind = 'methodology'
  json.updatedAt = new Date().toISOString()

  if (!DRY_RUN) {
    const formatted = JSON.stringify(json, null, 2) + '\n'
    await writeFile(filePath, formatted, 'utf8')
  }

  return { path: filePath, status: 'updated' }
}

async function main() {
  console.log(`${color.bold}${color.cyan}CCL Atlas · V1 → V1.5 Migration${color.reset}`)
  console.log(`${color.dim}Scanning: ${ATOMS_DIR}${color.reset}`)
  if (DRY_RUN) {
    console.log(`${color.yellow}⚠ DRY RUN mode — no files will be modified${color.reset}`)
  }
  console.log()

  const counts = { total: 0, updated: 0, alreadyMigrated: 0, skipped: 0, errors: 0 }
  const errors = []
  const touched = []

  try {
    await stat(ATOMS_DIR)
  } catch {
    console.log(`${color.yellow}No data/atoms directory found. Nothing to migrate.${color.reset}`)
    return
  }

  for await (const filePath of walkJsonFiles(ATOMS_DIR)) {
    counts.total++
    const relPath = filePath.replace(ROOT + '/', '')
    try {
      const result = await migrateFile(filePath)
      if (result.status === 'updated') {
        counts.updated++
        touched.push(relPath)
        console.log(`${color.green}✓${color.reset} ${relPath} ${color.dim}→ kind: "methodology"${color.reset}`)
      } else if (result.status === 'already-migrated') {
        counts.alreadyMigrated++
        console.log(`${color.dim}· ${relPath} (already ${result.kind})${color.reset}`)
      } else if (result.status === 'skipped') {
        counts.skipped++
        console.log(`${color.dim}· ${relPath} (${result.reason})${color.reset}`)
      } else {
        counts.errors++
        errors.push({ path: relPath, reason: result.reason })
        console.log(`${color.red}✗ ${relPath}${color.reset} — ${result.reason}`)
      }
    } catch (err) {
      counts.errors++
      errors.push({ path: relPath, reason: err.message })
      console.log(`${color.red}✗ ${relPath}${color.reset} — ${err.message}`)
    }
  }

  console.log()
  console.log(`${color.bold}Summary${color.reset}`)
  console.log(`  Total files scanned: ${counts.total}`)
  console.log(`  ${color.green}Updated: ${counts.updated}${color.reset}${DRY_RUN ? color.yellow + ' (dry run — not written)' + color.reset : ''}`)
  console.log(`  Already migrated:    ${counts.alreadyMigrated}`)
  console.log(`  Skipped:             ${counts.skipped}`)
  console.log(`  Errors:              ${counts.errors}`)

  if (errors.length > 0) {
    console.log()
    console.log(`${color.red}${color.bold}Errors:${color.reset}`)
    for (const e of errors) console.log(`  ${e.path}: ${e.reason}`)
    process.exit(1)
  }

  if (!DRY_RUN && counts.updated > 0) {
    console.log()
    console.log(`${color.cyan}Next:${color.reset} run ${color.bold}npm run reindex${color.reset} to rebuild the knowledge index.`)
  }
}

main().catch((err) => {
  console.error(`${color.red}${color.bold}Migration failed:${color.reset}`, err)
  process.exit(1)
})
