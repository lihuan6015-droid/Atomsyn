/**
 * scripts/lib/bootstrap/extractors/docx.mjs · bootstrap-tools change.
 *
 * Wraps `mammoth` for `.docx` → plain text extraction (D-004). mammoth is
 * lazy-imported to keep CLI start-up snappy — the import only happens the
 * first time a `.docx` shows up in a session.
 *
 * Encrypted / corrupted / malformed `.docx` files surface as
 * `{ skipped: true, reason: 'parse-error' }`.
 */

import { stat } from 'node:fs/promises'
import { extname } from 'node:path'

let _mammoth = null

async function loadMammoth() {
  if (_mammoth) return _mammoth
  try {
    const mod = await import('mammoth')
    _mammoth = mod.default || mod
    return _mammoth
  } catch (err) {
    const e = new Error(`mammoth not installed; run \`npm install mammoth\`. Underlying: ${err.message}`)
    e.code = 'EXTRACTOR_DEP_MISSING'
    throw e
  }
}

export async function extractDocx(filePath, opts = {}) {
  let s
  try { s = await stat(filePath) } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: '.docx', source: 'docx', error: err.message } }
  }

  let mammoth
  try {
    mammoth = await loadMammoth()
  } catch (err) {
    return { skipped: true, reason: 'extractor-unavailable', meta: { ext: '.docx', source: 'docx', error: err.message } }
  }

  let result
  try {
    result = await mammoth.extractRawText({ path: filePath })
  } catch (err) {
    return { skipped: true, reason: 'parse-error', meta: { ext: '.docx', source: 'docx', error: err.message } }
  }

  const text = String(result.value || '').replace(/\r\n/g, '\n')
  const warnings = (result.messages || []).map((m) => `${m.type}: ${m.message}`).slice(0, 10)
  const maxBytes = Number.isFinite(opts.maxBytesRead) ? opts.maxBytesRead : 256 * 1024
  const truncated = text.length > maxBytes
  const out = truncated ? text.slice(0, maxBytes) : text

  return {
    text: out,
    meta: {
      ext: extname(filePath).toLowerCase() || '.docx',
      bytes: s.size,
      source: 'docx',
      truncated,
      warnings,
    },
  }
}
