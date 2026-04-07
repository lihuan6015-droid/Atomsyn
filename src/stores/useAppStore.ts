import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

/** V2.0 M3: user-defined skeleton container */
export interface CustomSkeleton {
  id: string
  name: string
  atomIds: string[]
  createdAt: string
}

interface AppState {
  theme: Theme
  activeFrameworkId: string | null
  /** V2.0 M3: active role filter (mutually exclusive with activeFrameworkId) */
  activeRole: string | null
  /** V2.0 M3: active custom skeleton ID (mutually exclusive with framework/role) */
  activeSkeletonId: string | null
  copilotOpen: boolean
  toast: { message: string; visible: boolean }
  seedUpdateAvailable: boolean
  appUpdateAvailable: boolean
  /** V2.0 M3: user-created skeleton containers */
  customSkeletons: CustomSkeleton[]

  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setActiveFramework: (id: string) => void
  setActiveRole: (role: string) => void
  setActiveSkeleton: (id: string) => void
  clearSelection: () => void
  addCustomSkeleton: (name: string) => string
  renameCustomSkeleton: (id: string, newName: string) => void
  removeCustomSkeleton: (id: string) => void
  addAtomToSkeleton: (skeletonId: string, atomId: string) => void
  removeAtomFromSkeleton: (skeletonId: string, atomId: string) => void
  openCopilot: () => void
  closeCopilot: () => void
  toggleCopilot: () => void
  showToast: (message: string, ms?: number) => void
  setSeedUpdateAvailable: (v: boolean) => void
  setAppUpdateAvailable: (v: boolean) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // V1.5 · default to light mode on first launch. The persist
      // middleware below will restore the user's choice on subsequent
      // launches. Splash + AppShell both read `theme` from this store so
      // the brand moment matches the user's persisted preference.
      theme: 'light',
      activeFrameworkId: 'product-innovation-24',
      activeRole: null,
      activeSkeletonId: null,
      copilotOpen: false,
      toast: { message: '', visible: false },
      seedUpdateAvailable: false,
      appUpdateAvailable: false,
      customSkeletons: [],

      setSeedUpdateAvailable: (v) => set({ seedUpdateAvailable: v }),
      setAppUpdateAvailable: (v) => set({ appUpdateAvailable: v }),

      setTheme: (t) => {
        document.documentElement.classList.toggle('dark', t === 'dark')
        set({ theme: t })
        // V1.5 · Sync the Tauri window's native chrome (title bar +
        // traffic lights) to the app theme so macOS doesn't show a
        // dark title bar when the app is in light mode (or vice versa).
        // Dynamic import keeps web/dev builds lean.
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(t))
            .catch(() => undefined)
        }
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(next)
      },
      setActiveFramework: (id) => set({ activeFrameworkId: id, activeRole: null, activeSkeletonId: null }),
      setActiveRole: (role) => set({ activeRole: role, activeFrameworkId: null, activeSkeletonId: null }),
      setActiveSkeleton: (id) => set({ activeSkeletonId: id, activeFrameworkId: null, activeRole: null }),
      clearSelection: () => set({ activeFrameworkId: null, activeRole: null, activeSkeletonId: null }),
      addCustomSkeleton: (name) => {
        const id = `skel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
        set((s) => ({
          customSkeletons: [...s.customSkeletons, { id, name, atomIds: [], createdAt: new Date().toISOString() }],
          activeSkeletonId: id,
          activeFrameworkId: null,
          activeRole: null,
        }))
        return id
      },
      renameCustomSkeleton: (id, newName) => {
        set((s) => ({
          customSkeletons: s.customSkeletons.map((sk) => (sk.id === id ? { ...sk, name: newName } : sk)),
        }))
      },
      removeCustomSkeleton: (id) => {
        set((s) => ({
          customSkeletons: s.customSkeletons.filter((sk) => sk.id !== id),
          activeSkeletonId: s.activeSkeletonId === id ? null : s.activeSkeletonId,
        }))
      },
      addAtomToSkeleton: (skeletonId, atomId) => {
        set((s) => ({
          customSkeletons: s.customSkeletons.map((sk) =>
            sk.id === skeletonId && !sk.atomIds.includes(atomId)
              ? { ...sk, atomIds: [...sk.atomIds, atomId] }
              : sk,
          ),
        }))
      },
      removeAtomFromSkeleton: (skeletonId, atomId) => {
        set((s) => ({
          customSkeletons: s.customSkeletons.map((sk) =>
            sk.id === skeletonId ? { ...sk, atomIds: sk.atomIds.filter((a) => a !== atomId) } : sk,
          ),
        }))
      },
      openCopilot: () => set({ copilotOpen: true }),
      closeCopilot: () => set({ copilotOpen: false }),
      toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
      showToast: (message, ms = 2200) => {
        if (toastTimer) clearTimeout(toastTimer)
        set({ toast: { message, visible: true } })
        toastTimer = setTimeout(() => {
          set((s) => ({ toast: { ...s.toast, visible: false } }))
        }, ms)
      },
    }),
    {
      name: 'ccl-app',
      partialize: (s) => ({
        theme: s.theme,
        activeFrameworkId: s.activeFrameworkId,
        customSkeletons: s.customSkeletons,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
          // Also sync Tauri window chrome on first hydration so the
          // title bar matches the persisted theme from the previous
          // session (otherwise it stays at the tauri.conf.json default
          // until the user toggles manually).
          if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
            import('@tauri-apps/api/window')
              .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(state.theme))
              .catch(() => undefined)
          }
        }
      },
    }
  )
)
