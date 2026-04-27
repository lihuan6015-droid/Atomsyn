/**
 * scripts/lib/bootstrap/extractors/markdown.mjs · bootstrap-tools change.
 *
 * Extracts text + frontmatter from `.md` / `.markdown` files. The extractor is
 * intentionally minimal: it reads UTF-8, peels off optional YAML frontmatter
 * (lines bounded by leading `---` and a trailing `---`), and returns the rest
 * verbatim. We do NOT render markdown to plain text — downstream consumers
 * (LLM agents) read it as-is so the structural cues (headings, lists, code
 * fences) survive.
 *
 * Frontmatter parsing is best-effort: malformed YAML returns the whole text
 * (no skip), with `meta.frontmatter = null` so callers can detect.
 */

import { readFile, stat } from 'node:fs/promises'

const MAX_READ_BYTES = 256 * 1024

export async function extractMarkdown(filePath, opts = {}) {
  const maxBytes = Number.isFinite(opts.maxBytesRead) ? opts.maxBytesRead : MAX_READ_BYTES
  let buf
  try {
    buf = await readFile(filePath)
  } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: '.md', source: 'markdown', error: err.message } }
  }
  let s
  try { s = await stat(filePath) } catch { s = { size: buf.length } }
  const truncated = buf.length > maxBytes
  const text = buf.toString('utf8', 0, Math.min(buf.length, maxBytes))

  const { body, frontmatter } = peelFrontmatter(text)
  return {
    text: body,
    meta: {
      ext: filePath.toLowerCase().endsWith('.markdown') ? '.markdown' : '.md',
      bytes: s.size,
      source: 'markdown',
      truncated,
      frontmatter,
    },
  }
}

/**
 * Pull off a YAML frontmatter block. Returns { body, frontmatter } where
 * frontmatter is a flat object of `key: value` lines (string values) when the
 * block is well-formed, or `null` otherwise.
 *
 * We deliberately avoid pulling a full YAML parser dependency — bootstrap
 * frontmatter is almost always single-line scalars (title, date, tags), and a
 * malformed block falls back to returning the original text untouched.
 */
function peelFrontmatter(text) {
  if (!text.startsWith('---')) return { body: text, frontmatter: null }
  const end = text.indexOf('\n---', 3)
  if (end < 0) return { body: text, frontmatter: null }
  const block = text.slice(3, end).replace(/^\n/, '')
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const fm = {}
  let ok = true
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/)
    if (!m) { ok = false; break }
    fm[m[1]] = stripQuotes(m[2])
  }
  return ok ? { body, frontmatter: fm } : { body: text, frontmatter: null }
}

function stripQuotes(v) {
  const s = String(v).trim()
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1)
    }
  }
  return s
}
