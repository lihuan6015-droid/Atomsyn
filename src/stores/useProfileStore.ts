/**
 * src/stores/useProfileStore.ts · V2.x bootstrap-skill (D-010 + D-013)
 *
 * Singleton profile state for ProfileCalibration UI.
 *
 * Responsibilities:
 *   - Hydrate `profile` + `versions` from /atoms/profile and
 *     /atoms/profile/versions on demand
 *   - Hold a `draft` overlay so user edits don't mutate `profile` until they
 *     hit "Save" (calibrate-profile API)
 *   - Track which fields have been touched so dirty banner / leave warning
 *     can show
 *
 * NOT persisted to localStorage — profile data is the source of truth on
 * disk (atom_profile_main.json) and re-fetched on mount.
 */
import { create } from 'zustand'
import type {
  ProfileAtom,
  ProfileIdentity,
  ProfilePreferences,
  ProfileVersionSnapshot,
} from '@/types'
import { profileApi } from '@/lib/dataApi'

export interface ProfileDraft {
  identity?: ProfileIdentity
  preferences?: ProfilePreferences
  knowledge_domains?: string[]
  recurring_patterns?: string[]
}

interface ProfileState {
  /** Loaded profile JSON. null = not yet loaded OR no profile on disk yet. */
  profile: ProfileAtom | null
  /** previous_versions[] cache; refreshed on demand. */
  versions: ProfileVersionSnapshot[]
  /** Local edits that have not been committed via calibrate-profile API. */
  draft: ProfileDraft
  /** Set of field names that have diverged from `profile`. */
  dirtyFields: Set<keyof ProfileDraft>
  loading: boolean
  saving: boolean
  /** Last error from API, surfaced as a banner or inline. */
  error: string | null

  load: () => Promise<void>
  loadVersions: () => Promise<void>
  setDraftField: <K extends keyof ProfileDraft>(field: K, value: ProfileDraft[K]) => void
  resetDraft: () => void
  /** Saves `draft` via /atoms/:id/calibrate-profile and rehydrates state. */
  save: () => Promise<void>
  /** Restores a historic version and refreshes state (D-010). */
  restore: (version: number) => Promise<void>
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  versions: [],
  draft: {},
  dirtyFields: new Set(),
  loading: false,
  saving: false,
  error: null,

  async load() {
    set({ loading: true, error: null })
    try {
      const { atom } = await profileApi.get()
      set({
        profile: atom,
        versions: atom?.previous_versions ?? [],
        draft: {},
        dirtyFields: new Set(),
        loading: false,
      })
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? String(e) })
    }
  },

  async loadVersions() {
    try {
      const { versions } = await profileApi.versions()
      set({ versions })
    } catch (e: any) {
      // Non-fatal — leave existing snapshot in place but surface error
      set({ error: e?.message ?? String(e) })
    }
  },

  setDraftField(field, value) {
    set((s) => {
      const next = { ...s.draft, [field]: value }
      const dirty = new Set(s.dirtyFields)
      dirty.add(field)
      return { draft: next, dirtyFields: dirty }
    })
  },

  resetDraft() {
    set({ draft: {}, dirtyFields: new Set(), error: null })
  },

  async save() {
    const { profile, draft, dirtyFields } = get()
    if (!profile) {
      set({ error: 'profile not loaded; run bootstrap first' })
      return
    }
    if (dirtyFields.size === 0) {
      // Nothing to save — but still flip verified=true via empty calibrate
      // call, which is the standard "I confirm this profile" gesture.
    }
    set({ saving: true, error: null })
    try {
      const { atom } = await profileApi.calibrate(profile.id, draft)
      set({
        profile: atom,
        versions: atom.previous_versions ?? [],
        draft: {},
        dirtyFields: new Set(),
        saving: false,
      })
    } catch (e: any) {
      set({ saving: false, error: e?.message ?? String(e) })
    }
  },

  async restore(version) {
    set({ saving: true, error: null })
    try {
      const { atom } = await profileApi.restore(version)
      set({
        profile: atom,
        versions: atom.previous_versions ?? [],
        draft: {},
        dirtyFields: new Set(),
        saving: false,
      })
    } catch (e: any) {
      set({ saving: false, error: e?.message ?? String(e) })
    }
  },
}))
