/**
 * Frontend data access layer.
 *
 * v1: talks to the Vite dev plugin at /api/* (file system on disk).
 * Future: when wrapped in Tauri, swap implementations to call
 *         @tauri-apps/api/fs directly. The exported surface stays the same.
 */

import type {
  Atom,
  Framework,
  KnowledgeIndex,
  LLMConfig,
  Practice,
  Project,
  PsychologicalEntry,
  UsageEvent,
} from '@/types'

const BASE = '/api'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let body: any = null
    try {
      body = await res.json()
    } catch {}
    throw new Error(body?.error || `HTTP ${res.status} ${url}`)
  }
  return res.json() as Promise<T>
}

// ---------- Frameworks ----------
export const frameworksApi = {
  list: () => http<Framework[]>('/frameworks'),
  get: (id: string) => http<Framework>(`/frameworks/${id}`),
}

// ---------- Atoms ----------
export const atomsApi = {
  list: () => http<Atom[]>('/atoms'),
  get: (id: string) => http<Atom>(`/atoms/${id}`),
  create: (atom: Partial<Atom>) =>
    http<Atom>('/atoms', { method: 'POST', body: JSON.stringify(atom) }),
  update: (id: string, atom: Atom) =>
    http<Atom>(`/atoms/${id}`, { method: 'PUT', body: JSON.stringify(atom) }),
  remove: (id: string) => http<{ ok: true }>(`/atoms/${id}`, { method: 'DELETE' }),
}

// ---------- Projects ----------
export const projectsApi = {
  list: () => http<Project[]>('/projects'),
  get: (id: string) => http<Project>(`/projects/${id}`),
  create: (p: Partial<Project>) =>
    http<Project>('/projects', { method: 'POST', body: JSON.stringify(p) }),
  update: (id: string, p: Project) =>
    http<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  remove: (id: string) => http<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' }),
}

// ---------- Practices ----------
export const practicesApi = {
  list: (projectId: string) => http<Practice[]>(`/projects/${projectId}/practices`),
  create: (projectId: string, p: Partial<Practice>) =>
    http<Practice>(`/projects/${projectId}/practices`, {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  update: (projectId: string, practiceId: string, p: Practice) =>
    http<Practice>(`/projects/${projectId}/practices/${practiceId}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }),
  remove: (projectId: string, practiceId: string) =>
    http<{ ok: true }>(`/projects/${projectId}/practices/${practiceId}`, {
      method: 'DELETE',
    }),
}

// ---------- Index ----------
export const indexApi = {
  get: () => http<KnowledgeIndex>('/index'),
  rebuild: () => http<KnowledgeIndex>('/index/rebuild', { method: 'POST' }),
}

// ---------- Usage Log ----------
export const usageApi = {
  list: () => http<UsageEvent[]>('/usage-log'),
  log: (event: Omit<UsageEvent, 'ts'>) =>
    http<UsageEvent>('/usage-log', { method: 'POST', body: JSON.stringify(event) }),
}

// ---------- Psychological Log ----------
export const psychApi = {
  list: () => http<PsychologicalEntry[]>('/psychological-log'),
  add: (entry: Omit<PsychologicalEntry, 'submittedAt'>) =>
    http<PsychologicalEntry>('/psychological-log', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),
}

// ---------- LLM Config ----------
export const llmConfigApi = {
  get: () => http<LLMConfig>('/llm-config'),
  save: (cfg: LLMConfig) =>
    http<LLMConfig>('/llm-config', { method: 'PUT', body: JSON.stringify(cfg) }),
}

// ---------- Convenience: track usage events without throwing ----------
export function trackUsage(event: Omit<UsageEvent, 'ts'>) {
  usageApi.log(event).catch(() => {
    /* fail silently — logging should never break UX */
  })
}
