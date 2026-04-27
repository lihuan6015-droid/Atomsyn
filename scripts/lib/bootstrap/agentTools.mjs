/**
 * scripts/lib/bootstrap/agentTools.mjs · bootstrap-tools change.
 *
 * Five primitive filesystem tools exposed to the LLM tool-use loop in
 * `agentic.mjs`:
 *
 *   ls(path)              → list directory entries (≤ 200)
 *   stat(path)            → size / mtime / type
 *   glob(pattern, root)   → match files by glob (≤ 500)
 *   grep(pattern, file)   → regex match inside file (≤ 50 lines, ≤ 16 KB scan)
 *   read(file, opts?)     → run extractor + privacy chain (≤ 16 KB output)
 *
 * Sandbox model (D-006): every path is normalized + checked to live under one
 * of `sandboxRoots` (the user-provided bootstrap paths). Any attempt to
 * traverse outside throws `SANDBOX_VIOLATION`. macOS HFS+ stores filenames as
 * NFD; we normalize to NFC so `开发过程资料` matches whether the LLM types it
 * with composed or decomposed code points.
 *
 * Tracing: every successful (or failed) call invokes `onTrace(entry)` where
 * `entry = { ts, tool, args, result_summary, duration_ms, error? }`. The
 * caller (agentic.mjs) appends these into `session.agent_trace[]` (D-003).
 */

import { readFile, readdir, stat as fsStat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { extract } from './extractors/index.mjs'

const LS_MAX_ENTRIES = 200
const GLOB_MAX_MATCHES = 500
const GREP_MAX_HITS = 50
const GREP_SCAN_BYTES = 16 * 1024
const READ_MAX_BYTES = 16 * 1024

function nfc(s) {
  return String(s).normalize('NFC')
}

/**
 * Resolve `path` to an absolute, NFC-normalized path that must live under one
 * of `sandboxRoots`. Throws `SANDBOX_VIOLATION` otherwise.
 */
export function resolveInSandbox(path, sandboxRoots) {
  if (!path || typeof path !== 'string') {
    const e = new Error('SANDBOX_VIOLATION: path must be a non-empty string')
    e.code = 'SANDBOX_VIOLATION'
    throw e
  }
  const abs = nfc(resolve(path))
  for (const root of sandboxRoots) {
    const rootAbs = nfc(resolve(root))
    if (abs === rootAbs) return abs
    const rootWithSep = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep
    if (abs.startsWith(rootWithSep)) return abs
  }
  const e = new Error(
    `SANDBOX_VIOLATION: ${path} resolves to ${abs}, which is not under any of: ${sandboxRoots.join(', ')}`,
  )
  e.code = 'SANDBOX_VIOLATION'
  throw e
}

/**
 * Compile a gitignore-ish glob pattern to RegExp. Supports `*`, `**`, `?`, and
 * `{a,b,c}` brace expansion. Other regex meta-chars are escaped. Anchored to
 * full path (`^…$`).
 */
export function compileGlob(pattern) {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    // `**/` matches zero or more directory segments. So `**/*.md` matches both
    // `foo.md` (zero dirs) and `a/b/foo.md` (two dirs).
    if (c === '*' && pattern[i + 1] === '*' && pattern[i + 2] === '/') {
      re += '(?:.*/)?'
      i += 3
    } else if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i += 2 }
      else { re += '[^/]*'; i++ }
    } else if (c === '?') { re += '[^/]'; i++ }
    else if (c === '{') {
      const end = pattern.indexOf('}', i)
      if (end < 0) { re += '\\{'; i++ }
      else {
        const opts = pattern.slice(i + 1, end)
          .split(',')
          .map((s) => s.replace(/[.+^$()|[\]\\?*]/g, '\\$&'))
        re += '(' + opts.join('|') + ')'
        i = end + 1
      }
    } else if ('.+^$()|[]\\'.includes(c)) {
      re += '\\' + c; i++
    } else {
      re += c; i++
    }
  }
  return new RegExp('^' + re + '$')
}

function compileGrepRe(pattern) {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    const escaped = String(pattern).replace(/[.+^$()|{}[\]\\?*]/g, '\\$&')
    return new RegExp(escaped, 'i')
  }
}

function summarize(tool, result) {
  switch (tool) {
    case 'ls': {
      const dirs = result.entries.filter((e) => e.type === 'dir').length
      const files = result.entries.filter((e) => e.type === 'file').length
      const tail = result.truncated ? ` (truncated, total ${result.total})` : ''
      return `${result.entries.length} entries (${dirs} dirs, ${files} files)${tail}`
    }
    case 'stat':
      return `${result.type} ${result.size}B`
    case 'glob':
      return `${result.matches.length} matches${result.truncated ? ' (truncated)' : ''}`
    case 'grep':
      return `${result.hits.length} hits in ${result.scanned_bytes}B`
    case 'read':
      if (result.skipped) return `skipped: ${result.reason}`
      return `text=${(result.text || '').length}B source=${result.meta?.source || '?'}`
    default:
      return ''
  }
}

/**
 * Build the agent toolset. `sandboxRoots` is required and must be a non-empty
 * array of absolute or resolvable paths — typically the user's bootstrap paths.
 */
export function createAgentTools({ sandboxRoots, onTrace = () => {} } = {}) {
  if (!Array.isArray(sandboxRoots) || sandboxRoots.length === 0) {
    throw new Error('createAgentTools: sandboxRoots must be a non-empty array')
  }
  const roots = sandboxRoots.map((r) => nfc(resolve(r)))

  async function trace(tool, args, fn) {
    const start = Date.now()
    try {
      const result = await fn()
      onTrace({
        ts: new Date().toISOString(),
        tool,
        args,
        result_summary: summarize(tool, result),
        duration_ms: Date.now() - start,
      })
      return result
    } catch (err) {
      onTrace({
        ts: new Date().toISOString(),
        tool,
        args,
        result_summary: `error: ${err.code || err.message}`,
        duration_ms: Date.now() - start,
        error: true,
      })
      throw err
    }
  }

  return {
    sandboxRoots: roots,

    async ls(path) {
      return trace('ls', { path }, async () => {
        const abs = resolveInSandbox(path, roots)
        let entries
        try {
          entries = await readdir(abs, { withFileTypes: true })
        } catch (err) {
          const e = new Error(`ls failed: ${err.message}`)
          e.code = 'IO_ERROR'
          throw e
        }
        const out = entries.slice(0, LS_MAX_ENTRIES).map((e) => ({
          name: nfc(e.name),
          type: e.isDirectory() ? 'dir' : (e.isFile() ? 'file' : 'other'),
        }))
        return { entries: out, truncated: entries.length > LS_MAX_ENTRIES, total: entries.length }
      })
    },

    async stat(path) {
      return trace('stat', { path }, async () => {
        const abs = resolveInSandbox(path, roots)
        const s = await fsStat(abs)
        return {
          size: s.size,
          mtime: s.mtime.toISOString(),
          type: s.isDirectory() ? 'dir' : (s.isFile() ? 'file' : 'other'),
        }
      })
    },

    async glob(pattern, root) {
      return trace('glob', { pattern, root }, async () => {
        if (!root) {
          const e = new Error('glob: root is required')
          e.code = 'BAD_ARGS'
          throw e
        }
        const absRoot = resolveInSandbox(root, roots)
        const re = compileGlob(pattern)
        const matches = []
        let truncated = false
        async function walk(dir) {
          if (matches.length >= GLOB_MAX_MATCHES) { truncated = true; return }
          let entries
          try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
          for (const e of entries) {
            if (matches.length >= GLOB_MAX_MATCHES) { truncated = true; return }
            const abs = join(dir, e.name)
            if (e.isDirectory()) {
              await walk(abs)
            } else if (e.isFile()) {
              const rel = nfc(relative(absRoot, abs).split(sep).join('/'))
              if (re.test(rel)) matches.push(rel)
            }
          }
        }
        await walk(absRoot)
        return { matches, truncated }
      })
    },

    async grep(pattern, file) {
      return trace('grep', { pattern, file }, async () => {
        const abs = resolveInSandbox(file, roots)
        const re = compileGrepRe(pattern)
        let buf
        try { buf = await readFile(abs) } catch (err) {
          const e = new Error(`grep read failed: ${err.message}`)
          e.code = 'IO_ERROR'
          throw e
        }
        const sniff = buf.subarray(0, Math.min(4096, buf.length))
        if (sniff.includes(0)) {
          return { hits: [], scanned_bytes: 0, truncated: false, binary: true }
        }
        const scanned = Math.min(buf.length, GREP_SCAN_BYTES)
        const text = buf.toString('utf8', 0, scanned)
        const lines = text.split(/\r?\n/)
        const hits = []
        for (let i = 0; i < lines.length; i++) {
          if (hits.length >= GREP_MAX_HITS) break
          if (re.test(lines[i])) {
            hits.push({ line: i + 1, content: lines[i].slice(0, 240) })
          }
        }
        return {
          hits,
          scanned_bytes: scanned,
          truncated: buf.length > GREP_SCAN_BYTES || hits.length >= GREP_MAX_HITS,
        }
      })
    },

    async read(file, readOpts = {}) {
      return trace('read', { file }, async () => {
        const abs = resolveInSandbox(file, roots)
        const result = await extract(abs, {
          applyPrivacy: true,
          maxBytes: Number.isFinite(readOpts.maxBytes) ? readOpts.maxBytes : READ_MAX_BYTES,
          pdfMaxPages: readOpts.pdfMaxPages,
        })
        return result
      })
    },
  }
}
