/**
 * Frontend data access layer.
 *
 * Dual-channel architecture:
 *   - Dev mode (Vite): fetch('/api/*') → vite-plugin-data-api.ts middleware
 *   - Tauri packaged mode: dispatch to src/lib/tauri-api/router.ts → @tauri-apps/plugin-fs
 *
 * The `http()` helper auto-detects the runtime and routes accordingly.
 */

import { isTauri } from '@/lib/dataPath'

import type {
  AnalysisReport,
  AppVersionResult,
  Atom,
  AtomAny,
  ChatSession,
  ChatSessionIndex,
  ChatSessionIndexEntry,
  CoverageAnalysis,
  DimensionAnalysis,
  Framework,
  FrameworkStats,
  GapAnalysis,
  KnowledgeIndex,
  MemoryEntry,
  Note,
  NotesMeta,
  Practice,
  Project,
  PsychologicalEntry,
  SeedCheckResult,
  TimelineAnalysis,
  UsageEvent,
} from '@/types'

const BASE = '/api'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  // Tauri packaged mode: route through local TypeScript API router.
  // In tauri:dev, the Vite dev server handles /api/* — only use the
  // router in production builds where there's no HTTP server.
  if (isTauri() && import.meta.env.PROD) {
    const { dispatch } = await import('./tauri-api/router')
    const method = init?.method?.toUpperCase() || 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    try {
      return await dispatch(method, url, body) as T
    } catch (err) {
      console.error(`[dataApi] Tauri dispatch failed: ${method} ${url}`, err)
      throw err
    }
  }

  // Dev mode: fetch from Vite dev plugin
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
  create: (fw: Partial<Framework>) =>
    http<Framework>('/frameworks', { method: 'POST', body: JSON.stringify(fw) }),
  update: (id: string, fw: Partial<Framework>) =>
    http<Framework>(`/frameworks/${id}`, { method: 'PUT', body: JSON.stringify(fw) }),
  remove: (id: string) => http<{ ok: true }>(`/frameworks/${id}`, { method: 'DELETE' }),
  stats: (id: string) => http<FrameworkStats>(`/frameworks/${id}/stats`),
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
  /** V2.0 M4: find experience fragments linked to a methodology atom. */
  relatedFragments: (id: string) =>
    http<Array<{ atom: AtomAny; confidence: number; locked: boolean }>>(`/atoms/${id}/related-fragments`),
  /** V2.0 M4: calibrate a fragment's link (lock/unlock + confidence adjustment). */
  calibrate: (id: string, opts: { locked?: boolean; confidence?: number }) =>
    http<{ ok: true; locked: boolean; confidence: number }>(`/atoms/${id}/calibrate`, {
      method: 'PATCH',
      body: JSON.stringify(opts),
    }),
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
  rescan: async (): Promise<{ ok: boolean; added: number; unchanged: number; removed: number }> => {
    // In Tauri desktop mode, use the native Rust command
    if ((window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import('@tauri-apps/api/core')
      const res = await invoke<{ ok: boolean; added: number; unchanged: number }>('scan_skills')
      return { ...res, removed: 0 }
    }
    // In dev mode, use the Vite plugin API
    return http('/scan-skills', { method: 'POST' })
  },
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

// ---------- Notes (V2.0 M6) ----------
export const notesApi = {
  meta: () => http<NotesMeta>('/notes/meta'),
  updateMeta: (m: NotesMeta) =>
    http<NotesMeta>('/notes/meta', { method: 'PUT', body: JSON.stringify(m) }),
  list: () => http<Note[]>('/notes'),
  get: (id: string) => http<Note>(`/notes/${id}`),
  create: (data: { title: string; groupId: string; content?: string; tags?: string[] }) =>
    http<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Note>) =>
    http<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: string) => http<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
  move: (id: string, targetGroupId: string) =>
    http<Note>(`/notes/${id}/move`, { method: 'POST', body: JSON.stringify({ targetGroupId }) }),
  restore: (id: string) =>
    http<Note>(`/notes/${id}/restore`, { method: 'POST' }),
  listTrash: () => http<Note[]>('/notes/trash'),
  permDelete: (id: string) =>
    http<{ ok: true }>(`/notes/trash/${id}`, { method: 'DELETE' }),
  uploadAttachment: (noteId: string, filename: string, base64: string) =>
    http<{ path: string }>(`/notes/${noteId}/attachment`, {
      method: 'POST',
      body: JSON.stringify({ filename, base64 }),
    }),
  /** V2.0 M6 Sprint 5: Crystallize cache — persisted per-note LLM results */
  getCrystallizeCache: (noteId: string) =>
    http<any>(`/notes/${noteId}/crystallize-cache`),
  saveCrystallizeCache: (noteId: string, data: any) =>
    http<any>(`/notes/${noteId}/crystallize-cache`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  clearCrystallizeCache: (noteId: string) =>
    http<{ ok: true }>(`/notes/${noteId}/crystallize-cache`, {
      method: 'DELETE',
    }),
}

// ---------- Analysis (P1 · AI 复盘 + 导师模式) ----------
export const analysisApi = {
  dimensions: () => http<DimensionAnalysis>('/analysis/dimensions'),
  timeline: (months?: number) =>
    http<TimelineAnalysis>(`/analysis/timeline${months ? `?months=${months}` : ''}`),
  coverage: () => http<CoverageAnalysis>('/analysis/coverage'),
  gaps: () => http<GapAnalysis>('/analysis/gaps'),

  // Report CRUD
  listReports: () => http<AnalysisReport[]>('/analysis/reports'),
  getReport: (id: string) => http<AnalysisReport>(`/analysis/reports/${id}`),
  createReport: (data: Partial<AnalysisReport>) =>
    http<AnalysisReport>('/analysis/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateReport: (id: string, data: Partial<AnalysisReport>) =>
    http<AnalysisReport>(`/analysis/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteReport: (id: string) =>
    http<{ ok: true }>(`/analysis/reports/${id}`, { method: 'DELETE' }),
}

// ---------- Chat Module (V2.x) ----------
export const chatApi = {
  // Sessions
  listSessions: () => http<ChatSessionIndex>('/chat/sessions'),
  getSession: (id: string) => http<ChatSession>(`/chat/sessions/${encodeURIComponent(id)}`),
  createSession: (data: Partial<ChatSession>) =>
    http<ChatSession>('/chat/sessions', { method: 'POST', body: JSON.stringify(data) }),
  updateSession: (id: string, data: Partial<ChatSession>) =>
    http<ChatSession>(`/chat/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSession: (id: string) =>
    http<{ ok: true }>(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // SOUL + AGENTS prompts
  getSoul: () => http<{ content: string }>('/chat/soul'),
  getAgents: () => http<{ content: string }>('/chat/agents'),

  // Memory
  getMemories: () => http<MemoryEntry[]>('/chat/memory'),
  addMemory: (entry: Omit<MemoryEntry, 'id' | 'createdAt'>) =>
    http<MemoryEntry>('/chat/memory', { method: 'POST', body: JSON.stringify(entry) }),
}

// ---------- Convenience: track usage events without throwing ----------
export function trackUsage(event: Omit<UsageEvent, 'ts'>) {
  usageApi.log(event).catch(() => {
    /* fail silently — logging should never break UX */
  })
}
