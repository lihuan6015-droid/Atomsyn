/**
 * Chat routes — sessions, soul, agents, memory.
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
  removeFile,
  ensureDir,
  readText,
} from '../fsHelpers'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

function ok(body: any, status = 200): RouteResult {
  return { status, body }
}
function err(msg: string, status = 404): RouteResult {
  return { status, body: { error: msg } }
}

export async function handleChat(
  method: string,
  parts: string[],
  body: any,
  _sp: URLSearchParams
): Promise<RouteResult | null> {
  const dataDir = await getDataDir()
  const chatDir = joinPathSync(dataDir, 'chat')
  const sessionsDir = joinPathSync(chatDir, 'sessions')
  const memoryDir = joinPathSync(chatDir, 'memory')
  await ensureDir(sessionsDir)
  await ensureDir(memoryDir)

  // /chat/soul
  if (parts[1] === 'soul' && method === 'GET') {
    const soulFile = joinPathSync(chatDir, 'SOUL.md')
    const content = await readText(soulFile)
    return ok({ content })
  }

  // /chat/agents
  if (parts[1] === 'agents' && method === 'GET') {
    const agentsFile = joinPathSync(chatDir, 'AGENTS.md')
    const content = await readText(agentsFile)
    return ok({ content })
  }

  // /chat/memory
  if (parts[1] === 'memory') {
    const memFile = joinPathSync(memoryDir, 'memories.jsonl')
    if (method === 'GET') {
      const entries = await readJSONL(memFile)
      return ok(entries)
    }
    if (method === 'POST') {
      const entry = {
        ...body,
        id: `mem_${Date.now()}`,
        createdAt: new Date().toISOString(),
      }
      await appendJSONL(memFile, entry)
      return ok(entry, 201)
    }
  }

  // /chat/sessions
  if (parts[1] === 'sessions') {
    const indexFile = joinPathSync(sessionsDir, 'index.json')

    async function readSessionIndex(): Promise<{ sessions: any[] }> {
      return readJSON(indexFile, { sessions: [] })
    }

    async function writeSessionIndex(idx: { sessions: any[] }) {
      await writeTextFile(indexFile, JSON.stringify(idx, null, 2))
    }

    // No :id → list or create
    if (!parts[2]) {
      if (method === 'GET') {
        return ok(await readSessionIndex())
      }
      if (method === 'POST') {
        const now = new Date().toISOString()
        const id = body.id || `sess_${Date.now()}`
        const session = {
          id,
          title: body.title || '新对话',
          createdAt: now,
          updatedAt: now,
          modelId: body.modelId || undefined,
          messages: body.messages || [],
          summary: undefined,
        }
        const sessFile = joinPathSync(sessionsDir, `${id}.json`)
        await writeTextFile(sessFile, JSON.stringify(session, null, 2))
        const idx = await readSessionIndex()
        idx.sessions.unshift({
          id,
          title: session.title,
          updatedAt: now,
          messageCount: session.messages.length,
          preview: '',
        })
        await writeSessionIndex(idx)
        return ok(session, 201)
      }
    }

    // Routes with :id
    if (parts[2]) {
      const sessId = parts[2]
      const sessFile = joinPathSync(sessionsDir, `${sessId}.json`)

      if (method === 'GET') {
        if (!(await fileExists(sessFile))) return err('session not found')
        return ok(JSON.parse(await readTextFile(sessFile)))
      }

      if (method === 'PUT') {
        let session: any = { id: sessId, messages: [] }
        try {
          session = JSON.parse(await readTextFile(sessFile))
        } catch { /* new */ }
        const merged = {
          ...session,
          ...body,
          id: sessId,
          updatedAt: new Date().toISOString(),
        }
        await writeTextFile(sessFile, JSON.stringify(merged, null, 2))
        const idx = await readSessionIndex()
        const entry = idx.sessions.find((s: any) => s.id === sessId)
        if (entry) {
          entry.title = merged.title || entry.title
          entry.updatedAt = merged.updatedAt
          entry.messageCount = (merged.messages || []).length
          const lastMsg = (merged.messages || []).slice(-1)[0]
          entry.preview = lastMsg ? (lastMsg.content || '').slice(0, 80) : ''
        } else {
          idx.sessions.unshift({
            id: sessId,
            title: merged.title || '新对话',
            updatedAt: merged.updatedAt,
            messageCount: (merged.messages || []).length,
            preview: '',
          })
        }
        await writeSessionIndex(idx)
        return ok(merged)
      }

      if (method === 'DELETE') {
        await removeFile(sessFile)
        const idx = await readSessionIndex()
        idx.sessions = idx.sessions.filter((s: any) => s.id !== sessId)
        await writeSessionIndex(idx)
        return ok({ ok: true })
      }
    }
  }

  return null
}
