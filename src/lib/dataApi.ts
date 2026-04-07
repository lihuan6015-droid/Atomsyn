/**
 * Frontend data access layer.
 *
 * v1: talks to the Vite dev plugin at /api/* (file system on disk).
 * Future: when wrapped in Tauri, swap implementations to call
 *         @tauri-apps/api/fs directly. The exported surface stays the same.
 */

import type {
  AppVersionResult,
  Atom,
  AtomAny,
  Framework,
  KnowledgeIndex,

  Practice,
  Project,
  PsychologicalEntry,
  SeedCheckResult,
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
  create: (atom: Partial<AtomAny>) =>
    http<AtomAny>('/atoms', { method: 'POST', body: JSON.stringify(atom) }),
  update: (id: string, atom: Atom) =>
    http<Atom>(`/atoms/${id}`, { method: 'PUT', body: JSON.stringify(atom) }),
  remove: (id: string) => http<{ ok: true }>(`/atoms/${id}`, { method: 'DELETE' }),
  /** V2.0 M2: bump humanViewCount on an atom (lightweight PATCH, no full body). */
  trackView: (id: string) =>
    http<{ ok: true; humanViewCount: number }>(`/atoms/${id}/track-view`, { method: 'PATCH' }),
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

// ---------- Skill scanner (V1.5 · hot rescan) ----------
export const skillScanApi = {
  rescan: () =>
    http<{ ok: boolean; added: number; unchanged: number; removed: number }>(
      '/scan-skills',
      { method: 'POST' },
    ),
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

// ---------- Seed methodology updates (V1.5) ----------
export const seedApi = {
  check: () => http<SeedCheckResult>('/seed-check'),
  sync: () =>
    http<{ ok: boolean; synced: number; skipped: number }>('/seed-sync', {
      method: 'POST',
    }),
  dismiss: (version: string) =>
    http<{ ok: boolean }>('/seed-dismiss', {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
  resetDismiss: () =>
    http<{ ok: boolean }>('/seed-reset-dismiss', { method: 'POST' }),
}

// ---------- App version check (V1.5 stub · V1.6 will hit GitHub Releases) ----------
export const appVersionApi = {
  check: () => http<AppVersionResult>('/app-version'),
}

// ---------- Convenience: track usage events without throwing ----------
export function trackUsage(event: Omit<UsageEvent, 'ts'>) {
  usageApi.log(event).catch(() => {
    /* fail silently — logging should never break UX */
  })
}
