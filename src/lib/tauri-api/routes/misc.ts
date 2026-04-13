/**
 * Misc routes — index, usage-log, psych-log, llm-config, app-version,
 * seed management, scan-skills.
 */

import type { RouteResult } from '../router'
import {
  getDataDir,
  joinPathSync,
  readJSON,
  writeJSON,
  readJSONL,
  appendJSONL,
  fileExists,
  walk,
  readBinary,
} from '../fsHelpers'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { rebuildIndex } from '../rebuildIndex'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleMisc(
  method: string,
  parts: string[],
  body: any,
  sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()

  // ---------- index ----------
  if (parts[0] === 'index') {
    if (method === 'GET' && parts.length === 1) {
      const file = joinPathSync(dataDir, 'index', 'knowledge-index.json')
      if (!(await fileExists(file))) {
        return ok(await rebuildIndex(dataDir))
      }
      return ok(await readJSON(file, {}))
    }
    if (method === 'POST' && parts[1] === 'rebuild') {
      return ok(await rebuildIndex(dataDir))
    }
  }

  // ---------- scan-skills (delegate to Rust) ----------
  if (parts[0] === 'scan-skills' && method === 'POST') {
    try {
      const result = await invoke('scan_skills')
      await rebuildIndex(dataDir)
      return ok({ ok: true, ...(result as any) })
    } catch (e) {
      return err(String(e), 500)
    }
  }

  // ---------- app-version ----------
  if (parts[0] === 'app-version' && method === 'GET') {
    try {
      const result = await invoke('app_version_check')
      return ok(result)
    } catch {
      return ok({
        current: '0.1.0',
        latest: null,
        hasUpdate: false,
        reason: 'invoke-failed',
      })
    }
  }

  // ---------- usage-log ----------
  if (parts[0] === 'usage-log') {
    const file = joinPathSync(dataDir, 'growth', 'usage-log.jsonl')
    if (method === 'GET') {
      return ok(await readJSONL(file))
    }
    if (method === 'POST') {
      const event = { ts: new Date().toISOString(), ...body }
      await appendJSONL(file, event)
      return ok(event, 201)
    }
  }

  // ---------- psychological-log ----------
  if (parts[0] === 'psychological-log') {
    const file = joinPathSync(dataDir, 'growth', 'psychological-log.json')
    if (method === 'GET') {
      return ok(await readJSON(file, []))
    }
    if (method === 'POST') {
      const list = await readJSON<any[]>(file, [])
      list.push({ ...body, submittedAt: new Date().toISOString() })
      await writeJSON(file, list)
      return ok(body, 201)
    }
  }

  // ---------- llm-config ----------
  if (parts[0] === 'llm-config') {
    // config lives at dataDir/../config/llm.config.json
    // In Tauri mode, resolve relative to parent of dataDir
    const configFile = joinPathSync(dataDir, '..', 'config', 'llm.config.json')
    if (method === 'GET') {
      return ok(await readJSON(configFile, {}))
    }
    if (method === 'PUT') {
      await writeJSON(configFile, body)
      return ok(body)
    }
  }

  // ---------- seed management ----------
  // In Tauri packaged mode, seed operations use Rust commands
  if (parts[0] === 'seed-check' && method === 'GET') {
    try {
      const result = await invoke('seed_check')
      return ok(result)
    } catch {
      return ok({
        seedVersion: 'unknown',
        installedVersion: null,
        hasUpdate: false,
        dismissed: false,
        reason: 'invoke-failed',
      })
    }
  }

  if (parts[0] === 'seed-sync' && method === 'POST') {
    try {
      const result = await invoke('seed_sync')
      await rebuildIndex(dataDir)
      return ok({ ok: true, ...(result as any) })
    } catch (e) {
      return err(String(e), 500)
    }
  }

  if (parts[0] === 'seed-dismiss' && method === 'POST') {
    try {
      const version = body?.version
      if (!version) return err('version required', 400)
      await invoke('seed_dismiss', { version })
      return ok({ ok: true })
    } catch (e) {
      return err(String(e), 500)
    }
  }

  if (parts[0] === 'seed-reset-dismiss' && method === 'POST') {
    try {
      await invoke('seed_reset_dismiss')
      return ok({ ok: true })
    } catch (e) {
      return err(String(e), 500)
    }
  }

  return null
}
