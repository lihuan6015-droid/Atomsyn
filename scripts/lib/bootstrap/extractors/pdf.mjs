/**
 * scripts/lib/bootstrap/extractors/pdf.mjs · bootstrap-tools change.
 *
 * Wraps `pdfjs-dist` (legacy ESM build) for `.pdf` → plain text (D-004). We
 * read at most `pdfMaxPages` pages (default 5) to bound runtime; this is
 * deliberate — bootstrap's goal is to surface the document's intent, not the
 * full body. Encrypted / scanned / corrupted PDFs surface as
 * `{ skipped: true, reason: 'parse-error' | 'encrypted' }`.
 *
 * pdfjs-dist's worker is disabled (Node has no worker_thread bootstrap that
 * pdfjs's worker file expects). Without a worker pdfjs runs a bit slower per
 * page but stays inside one process.
 */

import { readFile, stat } from 'node:fs/promises'

let _pdfjs = null

async function loadPdfJs() {
  if (_pdfjs) return _pdfjs
  try {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (mod.GlobalWorkerOptions) mod.GlobalWorkerOptions.workerSrc = ''
    _pdfjs = mod
    return mod
  } catch (err) {
    const e = new Error(`pdfjs-dist not installed; run \`npm install pdfjs-dist\`. Underlying: ${err.message}`)
    e.code = 'EXTRACTOR_DEP_MISSING'
    throw e
  }
}

export async function extractPdf(filePath, opts = {}) {
  const pdfMaxPages = Number.isFinite(opts.pdfMaxPages) ? opts.pdfMaxPages : 5
  const maxOutBytes = Number.isFinite(opts.maxBytesRead) ? opts.maxBytesRead : 256 * 1024

  let s
  try { s = await stat(filePath) } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: '.pdf', source: 'pdf', error: err.message } }
  }

  let buf
  try { buf = await readFile(filePath) } catch (err) {
    return { skipped: true, reason: 'unreadable', meta: { ext: '.pdf', source: 'pdf', error: err.message } }
  }

  let pdfjs
  try {
    pdfjs = await loadPdfJs()
  } catch (err) {
    return { skipped: true, reason: 'extractor-unavailable', meta: { ext: '.pdf', source: 'pdf', error: err.message } }
  }

  let doc
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
      verbosity: 0,
      isEvalSupported: false,
      disableFontFace: true,
    })
    doc = await task.promise
  } catch (err) {
    const reason = /password|encrypt/i.test(err?.message || '') ? 'encrypted' : 'parse-error'
    return { skipped: true, reason, meta: { ext: '.pdf', source: 'pdf', error: err?.message } }
  }

  const pageCount = doc.numPages
  const pagesToRead = Math.min(pdfMaxPages, pageCount)
  const parts = []
  for (let i = 1; i <= pagesToRead; i++) {
    let page
    try { page = await doc.getPage(i) } catch { continue }
    let tc
    try { tc = await page.getTextContent() } catch { continue }
    const pageText = tc.items.map((it) => it.str || '').join(' ')
    parts.push(pageText)
    if (parts.join('\n\n').length > maxOutBytes) break
  }

  let text = parts.join('\n\n').trim()
  const truncated = text.length > maxOutBytes || pagesToRead < pageCount
  if (text.length > maxOutBytes) text = text.slice(0, maxOutBytes)

  let documentMeta = null
  try {
    const md = await doc.getMetadata()
    if (md?.info) documentMeta = { Title: md.info.Title || null, Author: md.info.Author || null }
  } catch { /* ignore */ }

  try { await doc.destroy() } catch { /* ignore */ }

  return {
    text,
    meta: {
      ext: '.pdf',
      bytes: s.size,
      source: 'pdf',
      truncated,
      pageCount,
      pagesRead: pagesToRead,
      documentMeta,
    },
  }
}
