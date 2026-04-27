/**
 * Tauri API Router — dispatches method+path to route handlers.
 * Mirrors the routing logic in vite-plugin-data-api.ts.
 */

import { handleFrameworks } from './routes/frameworks'
import { handleAtoms } from './routes/atoms'
import { handleProjects } from './routes/projects'
import { handleNotes } from './routes/notes'
import { handleChat } from './routes/chat'
import { handleAnalysis } from './routes/analysis'
import { handleMisc } from './routes/misc'
import { handleFileServing } from './routes/fileServing'
import { handleBootstrap } from './routes/bootstrap'

export interface RouteResult<T = any> {
  status: number
  body: T
}

export type RouteHandler = (
  method: string,
  parts: string[],
  body: any,
  searchParams: URLSearchParams
) => Promise<RouteResult | null>

const handlers: Array<{ prefix: string; handler: RouteHandler }> = [
  { prefix: 'fs', handler: handleFileServing },
  { prefix: 'frameworks', handler: handleFrameworks },
  { prefix: 'atoms', handler: handleAtoms },
  { prefix: 'projects', handler: handleProjects },
  { prefix: 'notes', handler: handleNotes },
  { prefix: 'index', handler: handleMisc },
  { prefix: 'scan-skills', handler: handleMisc },
  { prefix: 'seed-check', handler: handleMisc },
  { prefix: 'seed-sync', handler: handleMisc },
  { prefix: 'seed-dismiss', handler: handleMisc },
  { prefix: 'seed-reset-dismiss', handler: handleMisc },
  { prefix: 'app-version', handler: handleMisc },
  { prefix: 'usage-log', handler: handleMisc },
  { prefix: 'psychological-log', handler: handleMisc },
  { prefix: 'llm-config', handler: handleMisc },
  { prefix: 'analysis', handler: handleAnalysis },
  { prefix: 'chat', handler: handleChat },
  { prefix: 'bootstrap', handler: handleBootstrap },
]

export async function dispatch(method: string, path: string, body?: any): Promise<any> {
  const url = new URL(path, 'http://localhost')
  const parts = url.pathname
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)
  const searchParams = url.searchParams

  for (const { prefix, handler } of handlers) {
    if (parts[0] === prefix) {
      try {
        const result = await handler(method, parts, body, searchParams)
        if (result) {
          if (result.status >= 400) {
            throw new Error(
              (result.body as any)?.error || `HTTP ${result.status}`
            )
          }
          return result.body
        }
      } catch (err) {
        console.error(`[tauri-api] ${method} /${parts.join('/')} failed:`, err)
        throw err
      }
    }
  }
  throw new Error(`route not handled: ${method} ${path}`)
}
