/**
 * Bootstrap session routes — mirrors vite-plugin-data-api.ts /bootstrap section.
 *
 * Endpoints (D8-D12 of 2026-04-bootstrap-skill):
 *   GET    /bootstrap/sessions           → summary list (newest first)
 *   GET    /bootstrap/sessions/:id       → full session JSON + markdown report
 *   POST   /bootstrap/sessions/:id/commit → 501 in packaged Tauri (see note)
 *   DELETE /bootstrap/sessions/:id       → remove session .json + .md
 *
 * Sessions live OUTSIDE the data dir (user-level metadata, not knowledge atoms).
 * Path: ~/.atomsyn/bootstrap-sessions/<id>.{json,md}
 *
 * Commit caveat (packaged Tauri only): runCommit (scripts/lib/bootstrap/commit.mjs)
 * spawns `atomsyn-cli ingest/write` subprocesses and calls the user's LLM API. The
 * Tauri TS side has neither subprocess access (no shell plugin enabled in
 * src-tauri/capabilities/default.json) nor a centralized LLM client. In tauri:dev
 * mode the GUI hits the Vite middleware path which can do both, so commit works.
 * For packaged mode, GUI should fall back to invoking the CLI directly via the
 * shim (~/.atomsyn/bin/atomsyn-cli bootstrap --commit <id>) until a Tauri command
 * wraps this. Returning 501 here makes that contract explicit.
 */

import type { RouteResult } from '../router'
import { fileExists, ensureDir } from '../fsHelpers'
import { readTextFile, readDir, remove } from '@tauri-apps/plugin-fs'
import { homeDir, join as joinPath } from '@tauri-apps/api/path'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

async function sessionsDir(): Promise<string> {
  return joinPath(await homeDir(), '.atomsyn', 'bootstrap-sessions')
}

async function sessionFile(id: string): Promise<string> {
  return joinPath(await sessionsDir(), `${id}.json`)
}

async function sessionMarkdownFile(id: string): Promise<string> {
  return joinPath(await sessionsDir(), `${id}.md`)
}

async function loadSession(id: string): Promise<any | null> {
  const file = await sessionFile(id)
  if (!(await fileExists(file))) return null
  try { return JSON.parse(await readTextFile(file)) } catch { return null }
}

export async function handleBootstrap(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams,
): Promise<RouteResult | null> {
  // /bootstrap/sessions ...
  if (parts[1] !== 'sessions') return null

  // GET /bootstrap/sessions — list summaries
  if (method === 'GET' && parts.length === 2) {
    const dir = await sessionsDir()
    if (!(await fileExists(dir))) return ok({ sessions: [] })
    let entries: { name: string; isFile?: boolean }[] = []
    try { entries = await readDir(dir) as any } catch { return ok({ sessions: [] }) }
    const summaries: any[] = []
    for (const e of entries) {
      if (!e.name.endsWith('.json')) continue
      const id = e.name.slice(0, -5)
      const session = await loadSession(id)
      if (!session) continue
      summaries.push({
        id: session.id,
        status: session.status || 'unknown',
        paths: session.paths,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        atoms_created: session.atoms_created,
      })
    }
    summaries.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    return ok({ sessions: summaries })
  }

  // GET /bootstrap/sessions/:id
  if (method === 'GET' && parts.length === 3) {
    const id = parts[2]
    const session = await loadSession(id)
    if (!session) return err('session not found')
    let markdown: string | null = null
    const mdFile = await sessionMarkdownFile(id)
    if (await fileExists(mdFile)) {
      try { markdown = await readTextFile(mdFile) } catch { markdown = null }
    }
    return ok({ session, markdown })
  }

  // POST /bootstrap/sessions/:id/commit
  if (method === 'POST' && parts.length === 4 && parts[3] === 'commit') {
    return err(
      'commit is not implemented in packaged Tauri yet — fall back to CLI: ' +
        '`~/.atomsyn/bin/atomsyn-cli bootstrap --commit <session-id>`. ' +
        '(In Vite/tauri:dev mode the middleware handles this.)',
      501,
    )
  }

  // DELETE /bootstrap/sessions/:id
  if (method === 'DELETE' && parts.length === 3) {
    const id = parts[2]
    const session = await loadSession(id)
    if (!session) return err('session not found')
    await ensureDir(await sessionsDir())
    try { await remove(await sessionFile(id)) } catch { /* tolerate */ }
    const mdFile = await sessionMarkdownFile(id)
    if (await fileExists(mdFile)) {
      try { await remove(mdFile) } catch { /* tolerate */ }
    }
    return ok({ ok: true, id })
  }

  return null
}

