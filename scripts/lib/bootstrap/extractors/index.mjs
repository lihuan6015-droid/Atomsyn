/**
 * scripts/lib/bootstrap/extractors/index.mjs · bootstrap-tools change.
 *
 * Single entry point that downstream code (sampling, deepDive, agentic loop,
 * agentTools.read) calls to turn an arbitrary file path into
 * `{ text, meta, skipped?, reason? }`. The extractor is responsible for:
 *   1. Dispatching by extension to the right per-format reader.
 *   2. Applying privacy.scanText + redactWeakInText (unless caller opts out).
 *   3. Capping output to a sensible size for an LLM round.
 *
 * Schema:
 *   {
 *     text?: string,         // present when not skipped
 *     meta: {
 *       ext: string,
 *       bytes: number,       // raw file size on disk
 *       source: 'markdown' | 'docx' | 'pdf' | 'code' | 'text',
 *       truncated?: boolean,
 *       trimmed?: boolean,
 *       frontmatter?: object,        // markdown
 *       pageCount?: number,          // pdf
 *       pagesRead?: number,          // pdf
 *       documentMeta?: object,       // pdf
 *       warnings?: string[],         // docx mammoth warnings
 *       redactionApplied?: object,   // privacy redact stats
 *     },
 *     skipped?: boolean,
 *     reason?: 'unsupported' | 'strong-sensitive' | 'binary' | 'unreadable'
 *            | 'parse-error' | 'encrypted' | 'extractor-unavailable',
 *   }
 *
 * `applyPrivacy: true` is the default. Tests / agentic.read can opt out
 * (`applyPrivacy: false`) to inspect raw extractor output.
 */

import { extname } from 'node:path'
import { extractMarkdown } from './markdown.mjs'
import { extractText } from './text.mjs'
import { extractCode } from './code.mjs'
import { extractDocx } from './docx.mjs'
import { extractPdf } from './pdf.mjs'
import { scanText, isStrongSensitive, redactWeakInText } from '../privacy.mjs'

const MARKDOWN_EXTS = new Set(['.md', '.markdown'])
const DOCX_EXTS = new Set(['.docx'])
const PDF_EXTS = new Set(['.pdf'])
const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.rb', '.cpp', '.c', '.h', '.hpp', '.cs', '.php',
])
const TEXT_EXTS = new Set([
  '.txt', '.json', '.jsonl', '.yaml', '.yml',
  '.toml', '.ini', '.cfg', '.conf',
  '.html', '.css', '.scss', '.less',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql',
])

export const SUPPORTED_EXTS = new Set([
  ...MARKDOWN_EXTS, ...DOCX_EXTS, ...PDF_EXTS, ...CODE_EXTS, ...TEXT_EXTS,
])

export function pickExtractor(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (MARKDOWN_EXTS.has(ext)) return { fn: extractMarkdown, name: 'markdown' }
  if (DOCX_EXTS.has(ext)) return { fn: extractDocx, name: 'docx' }
  if (PDF_EXTS.has(ext)) return { fn: extractPdf, name: 'pdf' }
  if (CODE_EXTS.has(ext)) return { fn: extractCode, name: 'code' }
  if (TEXT_EXTS.has(ext) || ext === '') return { fn: extractText, name: 'text' }
  return null
}

/**
 * Extract a file. Returns the unified schema described above.
 *
 * @param {string} filePath
 * @param {object} [opts]
 * @param {boolean} [opts.applyPrivacy=true] · run scanText + redactWeakInText
 * @param {number}  [opts.maxBytes=16384]    · cap on returned text
 * @param {number}  [opts.maxBytesRead]      · per-extractor read cap
 * @param {number}  [opts.pdfMaxPages=5]
 */
export async function extract(filePath, opts = {}) {
  const applyPrivacy = opts.applyPrivacy !== false
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 16 * 1024

  const picked = pickExtractor(filePath)
  if (!picked) {
    return {
      skipped: true,
      reason: 'unsupported',
      meta: { ext: extname(filePath).toLowerCase(), source: 'unsupported' },
    }
  }

  let result
  try {
    result = await picked.fn(filePath, opts)
  } catch (err) {
    return {
      skipped: true,
      reason: 'parse-error',
      meta: { ext: extname(filePath).toLowerCase(), source: picked.name, error: String(err?.message || err).slice(0, 200) },
    }
  }
  if (result.skipped) return result

  let text = result.text || ''

  if (applyPrivacy) {
    const scan = scanText(text)
    if (isStrongSensitive(scan)) {
      return {
        skipped: true,
        reason: 'strong-sensitive',
        meta: {
          ...result.meta,
          sensitiveHits: scan.strong.map((h) => h.name),
        },
      }
    }
    const { text: redacted, replaced } = redactWeakInText(text)
    text = redacted
    if (Object.keys(replaced).length > 0) {
      result.meta.redactionApplied = replaced
    }
  }

  if (text.length > maxBytes) {
    text = text.slice(0, maxBytes) + '\n…[extractor: output capped at ' + maxBytes + ' bytes]'
    result.meta.truncated = true
  }

  return { text, meta: result.meta }
}
