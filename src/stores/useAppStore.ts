import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

interface AppState {
  theme: Theme
  activeFrameworkId: string | null
  copilotOpen: boolean
  toast: { message: string; visible: boolean }

  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setActiveFramework: (id: string) => void
  openCopilot: () => void
  closeCopilot: () => void
  toggleCopilot: () => void
  showToast: (message: string, ms?: number) => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      activeFrameworkId: 'product-innovation-24',
      copilotOpen: false,
      toast: { message: '', visible: false },

      setTheme: (t) => {
        document.documentElement.classList.toggle('dark', t === 'dark')
        set({ theme: t })
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        get().setTheme(next)
      },
      setActiveFramework: (id) => set({ activeFrameworkId: id }),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.classList.toggle('dark', state.theme === 'dark')
        }
      },
    }
  )
)
