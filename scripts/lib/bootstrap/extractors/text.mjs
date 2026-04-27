/**
 * scripts/lib/bootstrap/extractors/text.mjs · bootstrap-tools change.
 *
 * Generic UTF-8 text extractor for `.txt` / `.json` / `.jsonl` / `.yaml` /
 * `.toml` / `.ini` / `.cfg` / `.conf` / `.html` / `.css` / `.scss` / `.less` /
 * `.sh` / `.bash` / `.zsh` / `.fish` / `.sql`. Falls back to a binary check
 * (NUL byte in the first 4 KB) so a `.txt` file that's actually a binary blob
 * gets skipped rather than streamed into the LLM.
 */

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

const MAX_READ_BYTES = 256 * 1024

export async function extractText(filePath, opts = {}) {
  const maxBytes = Number.isFinite(opts.maxBytesRead) ? opts.maxBytesRead : MAX_READ_BYTES
  let buf
  try {
    buf = await readFile(filePath)
  } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: extname(filePath), source: 'text', error: err.message } }
  }
  const sniff = buf.subarray(0, Math.min(4096, buf.length))
  if (sniff.includes(0)) {
    return { skipped: true, reason: 'binary', meta: { ext: extname(filePath), source: 'text' } }
  }
  let s
  try { s = await stat(filePath) } catch { s = { size: buf.length } }
  const truncated = buf.length > maxBytes
  const text = buf.toString('utf8', 0, Math.min(buf.length, maxBytes))
  return {
    text,
    meta: {
      ext: extname(filePath).toLowerCase(),
      bytes: s.size,
      source: 'text',
      truncated,
    },
  }
}
