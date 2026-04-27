/**
 * scripts/lib/bootstrap/triage.mjs · bootstrap-skill change · Phase 1 TRIAGE.
 *
 * Walks the user-provided paths, reads ONLY metadata (stat + small content
 * sniff for sensitive files), applies privacy + .atomsynignore filters, and
 * returns:
 *   - fileList[]      — one entry per kept file (path/size/mtime/ext)
 *   - sensitiveSkipped[] — files dropped because of strong sensitive matches
 *   - byExt           — { ext: { count, totalBytes } }
 *   - markdown        — human-readable summary for the user gate
 *
 * Hard rules (D-003):
 *   - No LLM call.
 *   - Wall-clock target < 30s @ 10000 files.
 *   - Honour .atomsynignore + built-in fallback (ignore.mjs).
 *   - Strong sensitive (sk-*, password=, etc.) → drop the file, list it.
 *   - Caller (cmdBootstrap) is responsible for showing the markdown +
 *     prompting the user via AskUserQuestion in the Skill layer.
 */

import { stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { loadIgnoreForRoot, relPathFor } from './ignore.mjs'
import { scanFile, isStrongSensitive } from './privacy.mjs'

const TEXT_EXTS = new Set([
  '.md', '.markdown', '.txt', '.json', '.jsonl', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.html', '.css', '.scss', '.less',
  '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql',
])

/**
 * Walk a directory recursively, applying a filter. Yields absolute paths.
 * Pure DFS, no Promise.all parallelism (predictable order for snapshots).
 *
 * @param {string} root
 * @param {(absPath: string, isDir: boolean, relPath: string) => boolean} filterFn
 *   true → keep; false → skip (and don't descend into the dir)
 * @returns {AsyncGenerator<{ absPath, relPath, ext, size, mtime }>}
 */
async function* walkFiles(root, filterFn) {
  async function* recurse(dir) {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      const abs = join(dir, e.name)
      const rel = relPathFor(root, abs)
      if (e.isDirectory()) {
        if (!filterFn(abs, true, rel)) continue
        yield* recurse(abs)
      } else if (e.isFile()) {
        if (!filterFn(abs, false, rel)) continue
        let s
        try { s = await stat(abs) } catch { continue }
        yield {
          absPath: abs,
          relPath: rel,
          ext: extname(e.name).toLowerCase(),
          size: s.size,
          mtime: s.mtime,
        }
      }
    }
  }
  yield* recurse(root)
}

/**
 * Run TRIAGE for a list of root paths.
 *
 * @param {object} opts
 * @param {string[]} opts.paths            scan roots (absolute)
 * @param {string}   [opts.includePattern] csv glob whitelist
 * @param {string}   [opts.excludePattern] csv glob blacklist (stacks with .atomsynignore)
 * @param {number}   [opts.privacyByteCap=8192] max bytes read per file for privacy scan
 *
 * @returns {Promise<{
 *   fileList: Array<{ absPath, relPath, ext, size, mtime, root }>,
 *   sensitiveSkipped: Array<{ relPath, root, hits: string[] }>,
 *   ignoredCount: number,
 *   byExt: Record<string, { count: number, totalBytes: number }>,
 *   recencyBuckets: { last30d, last90d, last1y, older },
 *   totalBytes: number,
 *   markdown: string,
 *   warnings: string[]
 * }>}
 */
export async function runTriage(opts) {
  const { paths, includePattern, excludePattern, privacyByteCap = 8 * 1024 } = opts
  const includes = parseCsvGlob(includePattern)
  const excludes = parseCsvGlob(excludePattern)
  const warnings = []

  const fileList = []
  const sensitiveSkipped = []
  const byExt = {}
  let ignoredCount = 0
  let totalBytes = 0

  const recency = { last30d: 0, last90d: 0, last1y: 0, older: 0 }
  const now = Date.now()

  for (const rootPath of paths) {
    if (!existsSync(rootPath)) {
      warnings.push(`Path not found: ${rootPath}`)
      continue
    }
    const { matcher, sourceFile, patternCount } = await loadIgnoreForRoot(rootPath)
    if (!sourceFile) {
      warnings.push(`No .atomsynignore in ${rootPath} — using built-in fallback (${patternCount} patterns)`)
    }
    const filterFn = (abs, isDir, rel) => {
      if (matcher(rel, isDir)) return false
      if (!isDir) {
        if (includes.length > 0 && !includes.some((g) => g(rel))) return false
        if (excludes.length > 0 && excludes.some((g) => g(rel))) return false
      }
      return true
    }
    for await (const entry of walkFiles(rootPath, filterFn)) {
      // Light privacy peek (8 KB). Only on text-ish files; binaries get
      // sniffed-out by scanFile's NUL byte heuristic.
      if (TEXT_EXTS.has(entry.ext) || entry.ext === '') {
        const scan = await scanFile(entry.absPath, { maxBytes: privacyByteCap })
        if (isStrongSensitive(scan)) {
          sensitiveSkipped.push({
            relPath: entry.relPath,
            root: rootPath,
            hits: scan.strong.map((h) => h.name),
          })
          continue
        }
      }
      fileList.push({ ...entry, root: rootPath })
      totalBytes += entry.size
      const k = entry.ext || '(no-ext)'
      byExt[k] ??= { count: 0, totalBytes: 0 }
      byExt[k].count++
      byExt[k].totalBytes += entry.size
      const age = now - entry.mtime.getTime()
      const day = 86400_000
      if (age < 30 * day) recency.last30d++
      else if (age < 90 * day) recency.last90d++
      else if (age < 365 * day) recency.last1y++
      else recency.older++
    }
  }

  const markdown = renderMarkdown({
    paths,
    fileList,
    sensitiveSkipped,
    byExt,
    recency,
    totalBytes,
    warnings,
  })

  return {
    fileList,
    sensitiveSkipped,
    ignoredCount, // currently unused (filterFn drops silently); reserved for diagnostics
    byExt,
    recencyBuckets: recency,
    totalBytes,
    markdown,
    warnings,
  }
}

/** Convert a CSV glob list (e.g. "*.md,*.txt") to predicate functions. */
function parseCsvGlob(csv) {
  if (!csv) return []
  return String(csv).split(',').map((g) => g.trim()).filter(Boolean).map((g) => {
    // Reuse ignore.mjs glob → regex compiler? Simpler inline:
    const re = '^' + g.replace(/[.+^$()|{}\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$'
    const r = new RegExp(re)
    return (rel) => r.test(rel) || r.test(rel.split('/').pop() || '')
  })
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function renderMarkdown({ paths, fileList, sensitiveSkipped, byExt, recency, totalBytes, warnings }) {
  const lines = []
  lines.push(`## Phase 1 · TRIAGE — scan overview`)
  lines.push('')
  lines.push(`**Roots scanned**: ${paths.length}`)
  for (const p of paths) lines.push(`- \`${p}\``)
  lines.push('')
  lines.push(`**Total files kept**: ${fileList.length}`)
  lines.push(`**Total size**: ${fmtBytes(totalBytes)}`)
  lines.push(`**Sensitive files skipped**: ${sensitiveSkipped.length}`)
  lines.push('')
  lines.push(`### Files by extension`)
  lines.push('')
  lines.push(`| Ext | Count | Total size |`)
  lines.push(`|---|---|---|`)
  const sortedExts = Object.entries(byExt).sort((a, b) => b[1].count - a[1].count).slice(0, 20)
  for (const [ext, data] of sortedExts) {
    lines.push(`| \`${ext}\` | ${data.count} | ${fmtBytes(data.totalBytes)} |`)
  }
  lines.push('')
  lines.push(`### Recency`)
  lines.push('')
  lines.push(`- last 30 days: **${recency.last30d}**`)
  lines.push(`- 30-90 days:   ${recency.last90d}`)
  lines.push(`- 90-365 days:  ${recency.last1y}`)
  lines.push(`- older:        ${recency.older}`)
  lines.push('')
  if (sensitiveSkipped.length > 0) {
    lines.push(`### ⚠ Sensitive files skipped (review before allowlisting)`)
    lines.push('')
    for (const s of sensitiveSkipped.slice(0, 30)) {
      lines.push(`- \`${s.relPath}\` (${s.hits.join(', ')})`)
    }
    if (sensitiveSkipped.length > 30) lines.push(`- ... and ${sensitiveSkipped.length - 30} more`)
    lines.push('')
  }
  if (warnings.length > 0) {
    lines.push(`### Warnings`)
    lines.push('')
    for (const w of warnings) lines.push(`- ${w}`)
    lines.push('')
  }
  lines.push(`---`)
  lines.push(`Next: confirm scope → Phase 2 SAMPLING (1 LLM call to infer profile hypothesis).`)
  return lines.join('\n')
}
