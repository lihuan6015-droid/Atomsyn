/**
 * scripts/lib/bootstrap/ignore.mjs · bootstrap-skill change · .atomsynignore parser.
 *
 * D-005: gitignore-style syntax + built-in fallback. Lightweight implementation
 * (no third-party deps) — supports the subset that covers all reasonable
 * bootstrap scenarios:
 *
 *   - `# comment` at line start (ignored)
 *   - blank lines (ignored)
 *   - `pattern` matches anywhere in the path
 *   - `dir/` matches a directory (and everything beneath)
 *   - `/pattern` anchors to scan root
 *   - `!pattern` negates a previous rule
 *   - glob chars: `*` (anything except /), `**` (anything including /), `?` (one char)
 *
 * Built-in fallback (applied when no .atomsynignore is found in the scan root)
 * matches the design.md §7.2 list.
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// Internal fallback list (verbatim from design.md §7.2, with comments stripped)
export const FALLBACK_PATTERNS = [
  '.git/', '.svn/', '.hg/',
  'node_modules/', '.next/', '.nuxt/',
  'dist/', 'build/', 'target/', '.cargo/', '.cache/',
  '.DS_Store',
  '.ssh/', '.aws/', '.gnupg/', '.atomsyn/',
  '*.env', '*.env.local',
  '*.pem', '*.key', 'id_rsa*', 'id_ed25519*',
  '*.p12', '*.pfx',
  '.npmrc', '.pypirc', '.netrc',
]

/**
 * Translate a single gitignore-ish pattern into a RegExp. Returns the compiled
 * regex + meta (anchored / dirOnly / negated) so the matcher can decide.
 *
 * Implementation note: this is intentionally simpler than the full git spec —
 * we don't support character classes [...] or extglob. Sufficient for the
 * paths a bootstrap user is likely to want excluded.
 */
function compilePattern(raw) {
  let p = raw.trim()
  if (!p || p.startsWith('#')) return null

  let negated = false
  if (p.startsWith('!')) { negated = true; p = p.slice(1) }

  let anchored = false
  if (p.startsWith('/')) { anchored = true; p = p.slice(1) }

  let dirOnly = false
  if (p.endsWith('/')) { dirOnly = true; p = p.slice(0, -1) }

  // Convert glob → regex source
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*') {
      if (p[i + 1] === '*') { re += '.*'; i++ }
      else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if ('.+()^$|{}[]\\'.includes(c)) re += '\\' + c
    else re += c
  }

  // anchoring: anchored → ^pattern; otherwise → match anywhere with leading /
  // Match against POSIX-style relative path with leading slash.
  const body = anchored ? `^/${re}` : `(^|/)${re}`
  // dirOnly → must be followed by / or end-of-string
  const tail = dirOnly ? `(/|$)` : `(/|$)`

  return {
    raw,
    regex: new RegExp(body + tail),
    negated,
    dirOnly,
  }
}

/**
 * Build a path matcher from a list of pattern strings.
 *
 * @param {string[]} patternList
 * @returns {(relPath: string, isDir?: boolean) => boolean}
 *   true → ignore this path; false → keep
 *
 * Evaluates patterns in order; later rules override earlier ones (gitignore semantics).
 */
export function buildMatcher(patternList) {
  const compiled = patternList.map(compilePattern).filter(Boolean)
  return function matches(relPath, isDir = false) {
    // Normalize to POSIX with leading slash for regex consistency.
    const norm = '/' + String(relPath).split(sep).join('/').replace(/^\/+/, '')
    let ignored = false
    for (const c of compiled) {
      if (c.dirOnly && !isDir) {
        // dirOnly pattern can also match a file IF the dir is in the path.
        // Check via prefix: e.g. "node_modules/" matches "/x/node_modules/y.js"
        if (!c.regex.test(norm)) continue
      } else if (!c.regex.test(norm)) continue
      ignored = !c.negated
    }
    return ignored
  }
}

/**
 * Parse the contents of a .atomsynignore file into a pattern list.
 * Splits on newlines, drops comments / blanks (compilePattern would also drop
 * them, but pre-filtering keeps the matcher table small).
 */
export function parseIgnoreFile(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/**
 * Load the matcher for a scan root directory. If `<root>/.atomsynignore` exists,
 * parse it AND combine with the fallback (user file takes precedence — gitignore
 * semantics: user can `!pattern` to override a fallback).
 *
 * If the file is absent, fall back to the built-in list only.
 */
export async function loadIgnoreForRoot(root) {
  const file = join(root, '.atomsynignore')
  let userList = []
  if (existsSync(file)) {
    try { userList = parseIgnoreFile(await readFile(file, 'utf8')) }
    catch { /* unreadable — treat as missing */ }
  }
  // Order: fallback first, then user. User patterns can override (negate) fallback.
  const combined = [...FALLBACK_PATTERNS, ...userList]
  return {
    matcher: buildMatcher(combined),
    sourceFile: existsSync(file) ? file : null,
    patternCount: combined.length,
    userOverrideCount: userList.length,
  }
}

/** Convenience: produce a relative path for matcher input. */
export function relPathFor(root, absPath) {
  return relative(root, absPath)
}
