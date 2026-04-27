/**
 * scripts/lib/bootstrap/privacy.mjs · bootstrap-skill change · privacy scanner.
 *
 * D-005 (B+C combo): 14 hard-coded sensitive patterns + .atomsynignore (handled in ignore.mjs).
 *
 * STRONG sensitive (Secrets / Keys / PrivateKeys / Credentials):
 *   → entire file is SKIPPED. Listed in phase1 sensitive_skipped[]. User can
 *     manually allowlist via Phase 1 markdown report.
 *
 * WEAK sensitive (email / phone / SSN / 身份证):
 *   → file still ingested, but matches REDACTED before sending to LLM and
 *     replaced by [REDACTED-XXX] markers in atom content.
 *
 * Pure / synchronous module — all I/O happens in the caller (deepDive / triage).
 */

import { readFile } from 'node:fs/promises'

// ----- Pattern table -------------------------------------------------------

/**
 * Strong-sensitive patterns. Hitting ANY of these in a file → skip entire file.
 * Each entry: { name, pattern, kind: 'strong' }.
 *
 * Source: design.md §7.2. Conservative regex (length floors deter false +).
 */
export const STRONG_SENSITIVE_PATTERNS = [
  // API keys
  { name: 'openai-api-key', pattern: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'anthropic-api-key', pattern: /sk-ant-[a-zA-Z0-9-]{20,}/g },
  { name: 'github-pat', pattern: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'slack-token', pattern: /xox[baprs]-[0-9]{10,}-/g },
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'google-oauth', pattern: /ya29\.[0-9A-Za-z\-_]+/g },
  { name: 'private-key-block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // Credential assignments
  { name: 'password-assignment', pattern: /password\s*[:=]\s*['"][^'"]{6,}['"]/gi },
  { name: 'secret-assignment', pattern: /secret\s*[:=]\s*['"][^'"]{6,}['"]/gi },
  { name: 'apikey-assignment', pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{6,}['"]/gi },
  { name: 'token-assignment', pattern: /token\s*[:=]\s*['"][^'"]{6,}['"]/gi },
]

/**
 * Weak-sensitive patterns. Hits do NOT block ingest, but caller redacts each
 * match before LLM submission and stores [REDACTED-<KIND>] in atom content.
 */
export const WEAK_SENSITIVE_PATTERNS = [
  { name: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, marker: '[REDACTED-EMAIL]' },
  { name: 'cn-phone', pattern: /(?<![0-9])1[3-9][0-9]{9}(?![0-9])/g, marker: '[REDACTED-PHONE]' },
  { name: 'us-ssn', pattern: /(?<![0-9])\d{3}-\d{2}-\d{4}(?![0-9])/g, marker: '[REDACTED-SSN]' },
  { name: 'cn-id-card', pattern: /(?<![0-9A-Za-z])[1-9]\d{16}[0-9Xx](?![0-9A-Za-z])/g, marker: '[REDACTED-CN-ID]' },
]

// ----- Public API ----------------------------------------------------------

/**
 * Scan file content for sensitive matches (sync, no I/O).
 *
 * @param {string} text · file content
 * @returns {{ strong: Array<{name, count}>, weak: Array<{name, count}> }}
 */
export function scanText(text) {
  const strong = []
  for (const p of STRONG_SENSITIVE_PATTERNS) {
    const matches = text.match(p.pattern)
    if (matches && matches.length > 0) strong.push({ name: p.name, count: matches.length })
  }
  const weak = []
  for (const p of WEAK_SENSITIVE_PATTERNS) {
    const matches = text.match(p.pattern)
    if (matches && matches.length > 0) weak.push({ name: p.name, count: matches.length })
  }
  return { strong, weak }
}

/**
 * Read a file from disk and scan it. Returns the scan result + the raw text
 * (so the caller can redact + reuse without re-reading).
 *
 * Failures (read error / not text) → returns { strong: [], weak: [], text: null,
 * unreadable: true }. Caller decides whether to skip or surface.
 *
 * @param {string} filePath · absolute path
 * @param {{ maxBytes?: number }} [opts] · cap (default 256 KB) to avoid OOM on huge files
 */
export async function scanFile(filePath, { maxBytes = 256 * 1024 } = {}) {
  let buf
  try {
    buf = await readFile(filePath)
  } catch {
    return { strong: [], weak: [], text: null, unreadable: true }
  }
  // Heuristic: if NUL byte appears in first 4KB, treat as binary and skip.
  const sniff = buf.subarray(0, Math.min(4096, buf.length))
  if (sniff.includes(0)) {
    return { strong: [], weak: [], text: null, binary: true }
  }
  const text = buf.toString('utf8', 0, Math.min(buf.length, maxBytes))
  const result = scanText(text)
  return { ...result, text, truncated: buf.length > maxBytes }
}

/**
 * Apply weak-sensitive redactions to a string. Returns the redacted text +
 * a tally of replacements (for telemetry / debug logging).
 */
export function redactWeakInText(text) {
  let out = String(text || '')
  const replaced = {}
  for (const p of WEAK_SENSITIVE_PATTERNS) {
    let count = 0
    out = out.replace(p.pattern, () => {
      count++
      return p.marker
    })
    if (count > 0) replaced[p.name] = count
  }
  return { text: out, replaced }
}

/**
 * Convenience: should this file be SKIPPED entirely (strong-sensitive hit)?
 * @returns {boolean}
 */
export function isStrongSensitive(scanResult) {
  return Array.isArray(scanResult?.strong) && scanResult.strong.length > 0
}
