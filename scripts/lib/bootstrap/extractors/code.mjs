/**
 * scripts/lib/bootstrap/extractors/code.mjs · bootstrap-tools change.
 *
 * Source-code extractor for `.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.rs/.go/.java/
 * .kt/.swift/.rb/.cpp/.c/.h/.hpp/.cs/.php`. We read the whole file (capped),
 * but for files larger than `headTailThreshold` we keep the head + tail and
 * elide the middle — the bootstrap goal is "tell the LLM what this file is
 * for", not give it a full code review.
 */

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const MAX_READ_BYTES = 256 * 1024
const HEAD_TAIL_THRESHOLD = 24 * 1024  // > 24KB → head/tail trim
const HEAD_BYTES = 12 * 1024
const TAIL_BYTES = 4 * 1024

export async function extractCode(filePath, opts = {}) {
  const maxBytes = Number.isFinite(opts.maxBytesRead) ? opts.maxBytesRead : MAX_READ_BYTES
  let buf
  try {
    buf = await readFile(filePath)
  } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: extname(filePath), source: 'code', error: err.message } }
  }
  const sniff = buf.subarray(0, Math.min(4096, buf.length))
  if (sniff.includes(0)) {
    return { skipped: true, reason: 'binary', meta: { ext: extname(filePath), source: 'code' } }
  }
  let s
  try { s = await stat(filePath) } catch { s = { size: buf.length } }
  const truncated = buf.length > maxBytes
  let text = buf.toString('utf8', 0, Math.min(buf.length, maxBytes))

  let trimmed = false
  if (text.length > HEAD_TAIL_THRESHOLD) {
    const head = text.slice(0, HEAD_BYTES)
    const tail = text.slice(text.length - TAIL_BYTES)
    text = `${head}\n\n…[code-extractor: middle elided, original ${text.length} bytes]…\n\n${tail}`
    trimmed = true
  }

  return {
    text,
    meta: {
      ext: extname(filePath).toLowerCase(),
      bytes: s.size,
      source: 'code',
      truncated,
      trimmed,
    },
  }
}
