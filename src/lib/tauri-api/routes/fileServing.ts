/**
 * File serving — /api/fs/{path} for images and other binary files.
 * In Tauri mode, reads file from data dir and returns a blob URL.
 */

import type { RouteResult } from '../router'
import { getDataDir, joinPathSync, fileExists, readBinary } from '../fsHelpers'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

function getMimeType(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
  if (path.endsWith('.webp')) return 'image/webp'
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

export async function handleFileServing(
  method: string,
  parts: string[],
  _body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  if (method !== 'GET') return err('Method Not Allowed', 405)

  const dataDir = await getDataDir()
  const relativePath = parts.slice(1).join('/')
  const absPath = joinPathSync(dataDir, relativePath)

  // Basic path traversal check
  const normalizedDataDir = dataDir.replace(/\\/g, '/')
  const normalizedAbs = absPath.replace(/\\/g, '/')
  if (!normalizedAbs.startsWith(normalizedDataDir)) {
    return err('Forbidden', 403)
  }

  if (!(await fileExists(absPath))) {
    return err('not found')
  }

  const data = await readBinary(absPath)
  const mimeType = getMimeType(absPath)
  const blob = new Blob([new Uint8Array(data)], { type: mimeType })
  const blobUrl = URL.createObjectURL(blob)

  // Return blob URL as the response body — the caller will handle it
  return ok(blobUrl)
}
