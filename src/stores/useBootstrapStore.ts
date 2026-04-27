/**
 * src/stores/useBootstrapStore.ts · V2.x bootstrap-skill (D-009 + D-011)
 *
 * Wizard-side state for the BootstrapWizard 5-screen flow.
 *
 * The CLI (atomsyn-cli bootstrap) owns all phase logic and persists session
 * state to ~/.atomsyn/bootstrap-sessions/<id>.json. This store is purely
 * UI scaffolding: which screen is active + the locally-edited markdown
 * before the user hits "Confirm write".
 *
 * NOT persisted (sessions live on disk, re-attach on resume).
 */
import { create } from 'zustand'
import { bootstrapApi } from '@/lib/dataApi'
import type { BootstrapSession } from '@/lib/dataApi'

export type WizardScreen =
  | 'paths'
  | 'triage'
  | 'sampling'
  | 'dryrun'
  | 'commit'
  | 'done'

interface BootstrapState {
  screen: WizardScreen
  /** Selected scan roots (absolute paths). */
  paths: string[]
  /** Active session id (undefined until phase 1 emits one). */
  sessionId: string | null
  /** Loaded session metadata (null until fetched via getSession). */
  session: BootstrapSession | null
  /** Original markdown report from dry-run. */
  markdownOriginal: string | null
  /** User-edited markdown (becomes the commit input). */
  markdownDraft: string | null
  /** Commit-time aggregate from /bootstrap/sessions/:id/commit. */
  commitResult: {
    atoms_created: { profile: number; experience: number; fragment: number }
    atom_ids: string[]
    skipped: any[]
    duplicates: any[]
  } | null
  loading: boolean
  error: string | null

  open: () => void
  close: () => void
  setScreen: (s: WizardScreen) => void
  addPath: (p: string) => void
  removePath: (p: string) => void
  attachSession: (id: string) => Promise<void>
  setMarkdownDraft: (md: string) => void
  resetMarkdownDraft: () => void
  /** Calls POST /bootstrap/sessions/:id/commit; transitions to 'done'. */
  runCommit: () => Promise<void>
  reset: () => void
}

const INITIAL: Omit<BootstrapState, 'open' | 'close' | 'setScreen' | 'addPath' | 'removePath' | 'attachSession' | 'setMarkdownDraft' | 'resetMarkdownDraft' | 'runCommit' | 'reset'> = {
  screen: 'paths',
  paths: [],
  sessionId: null,
  session: null,
  markdownOriginal: null,
  markdownDraft: null,
  commitResult: null,
  loading: false,
  error: null,
}

export const useBootstrapStore = create<BootstrapState>((set, get) => ({
  ...INITIAL,

  open: () => set({ screen: 'paths', error: null }),
  close: () => set(INITIAL),
  setScreen: (s) => set({ screen: s }),

  addPath: (p) =>
    set((s) => (s.paths.includes(p) ? s : { paths: [...s.paths, p] })),
  removePath: (p) =>
    set((s) => ({ paths: s.paths.filter((x) => x !== p) })),

  async attachSession(id) {
    set({ loading: true, error: null })
    try {
      const { session, markdown } = await bootstrapApi.getSession(id)
      set({
        sessionId: id,
        session,
        markdownOriginal: markdown,
        markdownDraft: markdown,
        loading: false,
      })
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? String(e) })
    }
  },

  setMarkdownDraft: (md) => set({ markdownDraft: md }),
  resetMarkdownDraft: () =>
    set((s) => ({ markdownDraft: s.markdownOriginal })),

  async runCommit() {
    const { sessionId, markdownDraft, markdownOriginal } = get()
    if (!sessionId) {
      set({ error: 'no active session' })
      return
    }
    set({ loading: true, error: null, screen: 'commit' })
    try {
      const opts =
        markdownDraft && markdownDraft !== markdownOriginal
          ? { markdown_corrected: markdownDraft }
          : {}
      const result = await bootstrapApi.commit(sessionId, opts)
      set({
        commitResult: {
          atoms_created: result.atoms_created,
          atom_ids: result.atom_ids,
          skipped: result.skipped,
          duplicates: result.duplicates,
        },
        session: result.session,
        loading: false,
        screen: 'done',
      })
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? String(e) })
    }
  },

  reset: () => set(INITIAL),
}))
