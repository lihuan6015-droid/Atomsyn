/**
 * Tauri FS helpers — mirrors the patterns in vite-plugin-data-api.ts
 * but uses @tauri-apps/plugin-fs for disk I/O in packaged mode.
 */

import {
  readTextFile,
  writeTextFile,
  readDir,
  mkdir,
  exists,
  remove,
  rename,
  readFile,
  writeFile,
} from '@tauri-apps/plugin-fs'
import { join, dirname } from '@tauri-apps/api/path'
import { invoke } from '@tauri-apps/api/core'
import type { DataDirInfo } from '@/lib/dataPath'

// ---------------------------------------------------------------------------
// Data directory resolution (cached)
// ---------------------------------------------------------------------------

let _dataDirCache: string | null = null

export async function getDataDir(): Promise<string> {
  if (_dataDirCache) return _dataDirCache
  const info = await invoke<DataDirInfo>('get_data_dir')
  _dataDirCache = info.path
  return _dataDirCache
}

export function resetDataDirCache(): void {
  _dataDirCache = null
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export async function joinPath(...segments: string[]): Promise<string> {
  return join(...segments)
}

export async function dirName(filePath: string): Promise<string> {
  return dirname(filePath)
}

/**
 * Synchronous path join — avoids IPC overhead for simple concatenation.
 * Use this when constructing paths within an already-resolved data directory.
 * Handles `..` segments by resolving them against prior segments.
 */
export function joinPathSync(...segments: string[]): string {
  const combined = segments
    .map((s) => s.replace(/[\\/]+$/, ''))
    .filter(Boolean)
    .join('/')
  // Resolve . and .. segments
  const parts = combined.split('/')
  const resolved: string[] = []
  for (const p of parts) {
    if (p === '.' || p === '') continue
    if (p === '..') {
      resolved.pop()
    } else {
      resolved.push(p)
    }
  }
  // Preserve leading slash for absolute paths
  return (combined.startsWith('/') ? '/' : '') + resolved.join('/')
}

/**
 * Synchronous dirname — extracts parent directory from a path.
 */
export function dirNameSync(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : normalized
}

// ---------------------------------------------------------------------------
// JSON I/O
// ---------------------------------------------------------------------------

export async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readTextFile(filePath)
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const dir = dirNameSync(filePath)
  await mkdir(dir, { recursive: true })
  await writeTextFile(filePath, JSON.stringify(data, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// File existence
// ---------------------------------------------------------------------------

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    return await exists(filePath)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Directory walking
// ---------------------------------------------------------------------------

export async function walk(dir: string, exts = ['.json']): Promise<string[]> {
  const out: string[] = []
  if (!(await fileExists(dir))) return out
  try {
    const entries = await readDir(dir)
    for (const e of entries) {
      const full = joinPathSync(dir, e.name)
      if (e.isDirectory) {
        out.push(...(await walk(full, exts)))
      } else if (e.isFile && exts.some((x) => e.name.endsWith(x))) {
        out.push(full)
      }
    }
  } catch {
    // directory may not exist or be unreadable
  }
  return out
}

// ---------------------------------------------------------------------------
// JSONL (append-only log files)
// ---------------------------------------------------------------------------

export async function readJSONL<T>(filePath: string): Promise<T[]> {
  try {
    const raw = await readTextFile(filePath)
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T
        } catch {
          return null
        }
      })
      .filter(Boolean) as T[]
  } catch {
    return []
  }
}

export async function appendJSONL(filePath: string, entry: unknown): Promise<void> {
  const dir = dirNameSync(filePath)
  await mkdir(dir, { recursive: true })
  let existing = ''
  try {
    existing = await readTextFile(filePath)
  } catch {
    // file doesn't exist yet
  }
  const line = JSON.stringify(entry) + '\n'
  await writeTextFile(filePath, existing + line)
}

// ---------------------------------------------------------------------------
// Binary I/O (for attachments)
// ---------------------------------------------------------------------------

export async function readBinary(filePath: string): Promise<Uint8Array> {
  return readFile(filePath)
}

export async function writeBinary(filePath: string, data: Uint8Array): Promise<void> {
  const dir = dirNameSync(filePath)
  await mkdir(dir, { recursive: true })
  await writeFile(filePath, data)
}

// ---------------------------------------------------------------------------
// File operations
// ---------------------------------------------------------------------------

export async function removeFile(filePath: string): Promise<void> {
  try {
    await remove(filePath)
  } catch {
    // file may not exist
  }
}

export async function removeDir(dirPath: string): Promise<void> {
  try {
    await remove(dirPath, { recursive: true })
  } catch {
    // directory may not exist
  }
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  await rename(oldPath, newPath)
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

// ---------------------------------------------------------------------------
// Plain text I/O
// ---------------------------------------------------------------------------

export async function readText(filePath: string): Promise<string> {
  try {
    return await readTextFile(filePath)
  } catch {
    return ''
  }
}

export async function writeText(filePath: string, content: string): Promise<void> {
  const dir = dirNameSync(filePath)
  await mkdir(dir, { recursive: true })
  await writeTextFile(filePath, content)
}

// ---------------------------------------------------------------------------
// Relative path computation
// ---------------------------------------------------------------------------

/**
 * Compute a relative path from `from` to `to`.
 * Simple implementation sufficient for our flat/nested data directory structure.
 */
export function relativePath(from: string, to: string): string {
  // Normalize separators
  const normFrom = from.replace(/\\/g, '/').replace(/\/$/, '')
  const normTo = to.replace(/\\/g, '/').replace(/\/$/, '')
  if (normTo.startsWith(normFrom + '/')) {
    return normTo.slice(normFrom.length + 1)
  }
  return normTo
}
