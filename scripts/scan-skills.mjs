#!/usr/bin/env node
/**
 * Atomsyn · Local AI Skill Scanner (T-4.1)
 *
 * Scans known skill directories (~/.claude/skills, ~/.cursor/skills, etc.)
 * for SKILL.md files, parses their YAML frontmatter, and emits
 * SkillInventoryItem JSON files under data/atoms/skill-inventory/<tool>/<slug>.json.
 *
 * Iron rules:
 *   - No new npm deps (YAML parser implemented inline).
 *   - Idempotent: unchanged files are skipped via fileMtime comparison.
 *   - Preserves aiGenerated*, userMarked, stats fields on re-scan.
 *   - Gracefully handles missing directories.
 *
 * Usage:
 *   node scripts/scan-skills.mjs
 *   node scripts/scan-skills.mjs --dry-run
 *   node scripts/scan-skills.mjs --paths /path/a,/path/b
 *   node scripts/scan-skills.mjs --verbose
 */

import { readFile, writeFile, readdir, stat, mkdir, unlink, rmdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, basename, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
// Output dir resolution: env var wins so the vite plugin / Rust shell /
// GUI refresh button can all point the scan at the same data directory
// that the rest of the app reads from. Falls back to project /data in
// dogfood mode.
const OUT_DATA_DIR =
  process.env.ATOMSYN_SCAN_DATA_DIR ||
  process.env.ATOMSYN_DEV_DATA_DIR ||
  join(ROOT, 'data')
const OUT_ROOT = join(OUT_DATA_DIR, 'atoms', 'skill-inventory')

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const VERBOSE = args.includes('--verbose')
const pathsArgIdx = args.indexOf('--paths')
const CUSTOM_PATHS =
  pathsArgIdx >= 0 && args[pathsArgIdx + 1]
    ? args[pathsArgIdx + 1].split(',').map((p) => p.trim()).filter(Boolean)
    : null

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
}

// ---------- helpers ----------

function log(msg) {
  if (VERBOSE) console.log(msg)
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function inferToolName(absPath) {
  const p = absPath.replace(/\\/g, '/')
  if (p.includes('/.claude/')) return 'claude'
  if (p.includes('/.cursor/')) return 'cursor'
  if (p.includes('/.codex/')) return 'codex'
  if (p.includes('/.trae/')) return 'trae'
  if (p.includes('/.openclaw/')) return 'openclaw'
  if (p.includes('/.opencode/')) return 'opencode'
  return 'custom'
}

/**
 * Minimal tolerant YAML frontmatter parser.
 * Handles:
 *   - `key: value`
 *   - `key: "quoted"` / `key: 'quoted'`
 *   - `key: |` or `key: >` multi-line blocks (indent-based)
 *   - arrays written as `[a, b, c]` (inline)
 * Returns { frontmatter, body }.
 */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) {
    return { frontmatter: {}, body: text }
  }
  const lines = text.split(/\r?\n/)
  if (lines[0].trim() !== '---') {
    return { frontmatter: {}, body: text }
  }
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx < 0) return { frontmatter: {}, body: text }

  const fmLines = lines.slice(1, endIdx)
  const body = lines.slice(endIdx + 1).join('\n')
  const fm = {}

  let i = 0
  while (i < fmLines.length) {
    const line = fmLines[i]
    if (!line.trim() || line.trim().startsWith('#')) {
      i++
      continue
    }
    const m = line.match(/^([A-Za-z_][\w.-]*)\s*:\s*(.*)$/)
    if (!m) {
      i++
      continue
    }
    const key = m[1]
    let rest = m[2]

    if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
      // multi-line block; collect indented continuation lines
      const blockLines = []
      i++
      // Determine base indent from first non-empty line
      let baseIndent = null
      while (i < fmLines.length) {
        const l = fmLines[i]
        if (l.trim() === '') {
          blockLines.push('')
          i++
          continue
        }
        const indent = l.match(/^(\s*)/)[1].length
        if (baseIndent === null) {
          if (indent === 0) break
          baseIndent = indent
        }
        if (indent < baseIndent) break
        blockLines.push(l.slice(baseIndent))
        i++
      }
      const joiner = rest.startsWith('>') ? ' ' : '\n'
      fm[key] = blockLines.join(joiner).replace(/\s+$/, '')
      continue
    }

    // single-line value
    rest = rest.trim()
    // strip trailing comment (only if unquoted)
    if (!/^["'\[]/.test(rest)) {
      const hashIdx = rest.indexOf(' #')
      if (hashIdx >= 0) rest = rest.slice(0, hashIdx).trim()
    }
    if (
      (rest.startsWith('"') && rest.endsWith('"')) ||
      (rest.startsWith("'") && rest.endsWith("'"))
    ) {
      rest = rest.slice(1, -1)
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim()
      fm[key] = inner
        ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
        : []
      i++
      continue
    }
    fm[key] = rest
    i++
  }

  return { frontmatter: fm, body }
}

function firstParagraph(body) {
  if (!body) return ''
  const trimmed = body.replace(/^\s+/, '')
  const paras = trimmed.split(/\n\s*\n/)
  for (const p of paras) {
    const t = p.trim()
    if (!t) continue
    if (t.startsWith('#')) continue // skip headings
    return t.replace(/\s+/g, ' ').slice(0, 800)
  }
  return ''
}

async function* walkSkillFiles(dir, visited = new Set()) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return
    throw err
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)

    // Follow symlinks — scan-skills previously missed entries like
    // ~/.claude/skills/frontend-design → ../../.agents/skills/frontend-design
    // because Dirent.isDirectory() is false on a symlink. Resolve the real
    // path via stat() (which follows symlinks) and re-classify. Guard
    // against cycles via the `visited` realpath set.
    let isDir = entry.isDirectory()
    let isFile = entry.isFile()
    let isSkillMd = isFile && entry.name === 'SKILL.md'
    if (entry.isSymbolicLink()) {
      try {
        const st = await stat(full)
        isDir = st.isDirectory()
        isFile = st.isFile()
        isSkillMd = isFile && entry.name === 'SKILL.md'
      } catch {
        // dangling symlink — skip
        continue
      }
    }

    if (isDir) {
      // Cycle guard: only recurse if we haven't seen this real path before
      try {
        const realFull = await stat(full)
        const key = `${realFull.dev}:${realFull.ino}`
        if (visited.has(key)) continue
        visited.add(key)
      } catch {
        /* stat failed, skip */
        continue
      }
      yield* walkSkillFiles(full, visited)
    } else if (isSkillMd) {
      yield full
    }
  }
}

async function loadUserConfig() {
  const cfgPath = join(homedir(), '.atomsyn-config.json')
  try {
    const raw = await readFile(cfgPath, 'utf8')
    const json = JSON.parse(raw)
    if (Array.isArray(json.skillPaths)) return json.skillPaths
  } catch {
    /* ignore */
  }
  return []
}

function derivePathTags(skillPath, rootPath) {
  // Use path segments between rootPath and SKILL.md as tags (dir hierarchy)
  const rel = skillPath.startsWith(rootPath)
    ? skillPath.slice(rootPath.length)
    : skillPath
  const parts = rel.split(sep).filter(Boolean)
  // drop trailing SKILL.md
  if (parts[parts.length - 1] === 'SKILL.md') parts.pop()
  return parts.filter((p) => p !== 'skills').slice(0, 6)
}

async function readExistingItem(outPath) {
  try {
    const raw = await readFile(outPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Walk OUT_ROOT recursively and return absolute paths of inventory JSON
 * files that should be considered orphans:
 *  - the file was NOT touched during this scan, AND
 *  - the SKILL.md at `localPath` no longer exists on disk
 */
async function findOrphanInventoryFiles(outRoot, seenSet) {
  const orphans = []
  let entries
  try {
    entries = await readdir(outRoot, { withFileTypes: true })
  } catch {
    return orphans
  }
  for (const entry of entries) {
    const full = join(outRoot, entry.name)
    if (entry.isDirectory()) {
      const sub = await findOrphanInventoryFiles(full, seenSet)
      orphans.push(...sub)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    // Touched this scan → not an orphan
    if (seenSet.has(full)) continue
    // Touched but localPath now gone → orphan
    try {
      const raw = await readFile(full, 'utf8')
      const obj = JSON.parse(raw)
      if (typeof obj.localPath !== 'string') continue
      if (!existsSync(obj.localPath)) {
        orphans.push(full)
      }
    } catch {
      // malformed JSON — treat as orphan to self-heal
      orphans.push(full)
    }
  }
  return orphans
}

async function cleanupEmptyDirs(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const sub = join(root, entry.name)
    await cleanupEmptyDirs(sub)
    try {
      const inner = await readdir(sub)
      if (inner.length === 0) {
        await rmdir(sub)
      }
    } catch {
      /* ignore */
    }
  }
}

async function processSkillFile(skillPath, rootPath, summary, seenSet) {
  try {
    const [raw, st] = await Promise.all([
      readFile(skillPath, 'utf8'),
      stat(skillPath),
    ])
    const { frontmatter, body } = parseFrontmatter(raw)
    const mtimeIso = st.mtime.toISOString()
    const fileHash = createHash('sha256').update(raw).digest('hex')

    const toolName = inferToolName(skillPath)
    const dirName = basename(dirname(skillPath))
    const fmName =
      typeof frontmatter.name === 'string' && frontmatter.name.trim()
        ? frontmatter.name.trim()
        : null
    const slug = slugify(fmName || dirName)
    if (!slug) {
      throw new Error(`could not derive slug for ${skillPath}`)
    }
    const id = `skill_${toolName}_${slug}`
    const displayName = fmName || dirName

    const description =
      typeof frontmatter.description === 'string'
        ? frontmatter.description
        : ''
    const rawDescription = description || firstParagraph(body)

    const pathTags = derivePathTags(skillPath, rootPath)
    const tags = Array.from(new Set([toolName, ...pathTags])).filter(
      (t) => t && t !== dirName
    )

    const outDir = join(OUT_ROOT, toolName)
    const outPath = join(outDir, `${slug}.json`)
    // Mark as touched regardless of downstream decision (unchanged / updated / added),
    // so the orphan pruner won't consider this entry stale.
    seenSet.add(outPath)
    const existing = await readExistingItem(outPath)

    const now = new Date().toISOString()

    if (existing && existing.fileMtime === mtimeIso && existing.fileHash === fileHash) {
      summary.unchanged++
      log(`${color.dim}  unchanged  ${color.reset}${id}`)
      return
    }

    // Build item, preserving existing enrichment + stats
    const item = {
      id,
      schemaVersion: 1,
      kind: 'skill-inventory',
      name: displayName,
      tags,
      localPath: skillPath,
      toolName,
      frontmatter,
      rawDescription,
      fileMtime: mtimeIso,
      fileHash,
      stats:
        existing && existing.stats
          ? existing.stats
          : { usedInProjects: [], useCount: 0, aiInvokeCount: 0, humanViewCount: 0 },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }

    // Preserve optional enrichment fields
    if (existing) {
      for (const k of [
        'aiGeneratedSummary',
        'aiGeneratedTags',
        'typicalScenarios',
        'triggerKeywords',
        'userMarked',
        'nameEn',
      ]) {
        if (existing[k] !== undefined) item[k] = existing[k]
      }
    }

    if (DRY_RUN) {
      if (existing) {
        summary.updated++
        log(`${color.yellow}  would update${color.reset} ${id}`)
      } else {
        summary.added++
        log(`${color.green}  would add   ${color.reset}${id}`)
      }
      return
    }

    await mkdir(outDir, { recursive: true })
    await writeFile(outPath, JSON.stringify(item, null, 2) + '\n', 'utf8')
    if (existing) {
      summary.updated++
      log(`${color.yellow}  updated    ${color.reset}${id}`)
    } else {
      summary.added++
      log(`${color.green}  added      ${color.reset}${id}`)
    }
  } catch (err) {
    summary.errors.push({ file: skillPath, error: err.message })
    console.error(
      `${color.red}  error      ${color.reset}${skillPath}: ${err.message}`
    )
  }
}

async function main() {
  const defaultRoots = [
    join(homedir(), '.claude', 'skills'),
    join(homedir(), '.cursor', 'skills'),
    join(homedir(), '.codex', 'skills'),
    join(homedir(), '.trae', 'skills'),
    join(homedir(), '.opencode', 'skills'),
  ]
  const userPaths = await loadUserConfig()
  let roots = CUSTOM_PATHS || [...defaultRoots, ...userPaths]

  // de-dupe & resolve
  roots = Array.from(new Set(roots.map((p) => resolve(p.replace(/^~/, homedir())))))

  console.log(
    `${color.bold}${color.cyan}Atomsyn · Local Skill Scanner${color.reset}${
      DRY_RUN ? color.dim + ' (dry-run)' + color.reset : ''
    }`
  )
  console.log(`${color.dim}output → ${OUT_ROOT}${color.reset}\n`)

  const summary = {
    scanned: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    pruned: 0,
    errors: [],
    byTool: {},
  }

  // Track which inventory JSONs we touched this scan so we can prune
  // orphans at the end. Path-keyed set (absolute out paths).
  const seenOutPaths = new Set()
  // Patch processSkillFile via a closure — simpler: we'll compute the
  // outPath the same way processSkillFile does and add to seenOutPaths
  // after each call by re-deriving. Actually we can just track in-process:
  // wrap the call site.

  for (const root of roots) {
    let exists = false
    try {
      const s = await stat(root)
      exists = s.isDirectory()
    } catch {
      exists = false
    }
    if (!exists) {
      console.log(`${color.dim}  skip (not found): ${root}${color.reset}`)
      continue
    }
    console.log(`${color.cyan}scanning${color.reset} ${root}`)
    for await (const skillPath of walkSkillFiles(root)) {
      summary.scanned++
      const tool = inferToolName(skillPath)
      summary.byTool[tool] = (summary.byTool[tool] || 0) + 1
      await processSkillFile(skillPath, root, summary, seenOutPaths)
    }
  }

  // ─── Orphan pruning ───────────────────────────────────────────────
  // Walk OUT_ROOT, find any inventory JSON whose on-disk SKILL.md no
  // longer exists (or was not touched during this scan) and remove it.
  // Skipped when --dry-run or when --paths (partial scan) is in effect,
  // because a partial scan must not delete entries outside its scope.
  if (!DRY_RUN && !CUSTOM_PATHS) {
    const orphans = await findOrphanInventoryFiles(OUT_ROOT, seenOutPaths)
    for (const o of orphans) {
      try {
        await unlink(o)
        summary.pruned++
        log(`${color.dim}  pruned     ${color.reset}${o}`)
      } catch (err) {
        summary.errors.push({ file: o, error: `prune failed: ${err.message}` })
      }
    }
    // Clean up any now-empty tool directories
    await cleanupEmptyDirs(OUT_ROOT)
  }

  console.log(`\n${color.bold}Summary${color.reset}`)
  console.log(`  scanned   : ${summary.scanned}`)
  console.log(`  ${color.green}added     : ${summary.added}${color.reset}`)
  console.log(`  ${color.yellow}updated   : ${summary.updated}${color.reset}`)
  console.log(`  ${color.dim}unchanged : ${summary.unchanged}${color.reset}`)
  if (summary.pruned > 0) {
    console.log(`  ${color.dim}pruned    : ${summary.pruned} (orphans removed)${color.reset}`)
  }
  console.log(
    `  ${summary.errors.length ? color.red : color.dim}errors    : ${
      summary.errors.length
    }${color.reset}`
  )
  if (Object.keys(summary.byTool).length) {
    console.log(`  by tool   : ${JSON.stringify(summary.byTool)}`)
  }
  if (summary.errors.length) {
    console.log(`\n${color.red}Errors:${color.reset}`)
    for (const e of summary.errors) {
      console.log(`  - ${e.file}: ${e.error}`)
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`${color.red}fatal:${color.reset}`, err)
  process.exit(1)
})
