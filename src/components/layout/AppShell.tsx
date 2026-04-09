/**
 * V2.0-layout · AppShell
 *
 * Restructured from TopNav + conditional Sidebar to:
 * GlobalSidebar (always visible) + main content area.
 *
 * TopNav and FloatingCopilot are removed from the render tree.
 * CopilotPanel is retained (disabled) for future migration — see
 * @deprecated notes in useAppStore.ts.
 */

import type { CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { GlobalSidebar } from './GlobalSidebar'
import { Toast } from '@/components/shared/Toast'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { useEffect } from 'react'
import { useAppStore, type AppMode } from '@/stores/useAppStore'
import { useNotesStore } from '@/stores/useNotesStore'
import { handleWindowDrag } from '@/lib/windowDrag'
import { initDragGuard } from '@/lib/dragGuard'
import { SpotlightPalette } from '@/components/atlas/SpotlightPalette'
import { CreateFrameworkDialog } from '@/components/framework/CreateFrameworkDialog'
import { EditFrameworkDialog } from '@/components/framework/EditFrameworkDialog'

/**
 * @deprecated V2.0-layout: CopilotPanel is superseded by ChatPage.
 * The import and component are kept here as comments so the migration
 * path is explicit. Once ChatPage fully covers copilot functionality,
 * delete CopilotPanel.tsx, FloatingCopilot.tsx, and the copilotOpen
 * state in useAppStore.ts.
 *
 * import { FloatingCopilot } from '@/components/shared/FloatingCopilot'
 * import { CopilotPanel } from '@/components/copilot/CopilotPanel'
 */

// Tauri drag region: applied to the top strip of main content area
// so macOS window can be dragged from above the content.
const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties

export function AppShell() {
  const loc = useLocation()
  const openSettings = useAppStore((s) => s.openSettings)
  const setActiveMode = useAppStore((s) => s.setActiveMode)

  // Init drag guard: disables Tauri drag regions during HTML5 DnD
  useEffect(() => { initDragGuard() }, [])

  // Sync activeMode from route changes
  useEffect(() => {
    const p = loc.pathname
    let mode: AppMode = 'chat'
    if (p.startsWith('/atom')) mode = 'atom'
    else if (p.startsWith('/notes')) mode = 'notes'
    setActiveMode(mode)
  }, [loc.pathname, setActiveMode])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ccl:open-spotlight'))
      }
      // ⌘, opens settings (macOS convention)
      if (meta && e.key === ',') {
        e.preventDefault()
        openSettings()
      }
      // ⌘N creates new note in notes mode
      if (meta && e.key.toLowerCase() === 'n') {
        const mode = useAppStore.getState().activeMode
        if (mode === 'notes') {
          e.preventDefault()
          const { createNote, activeGroupId } = useNotesStore.getState()
          createNote(activeGroupId || '')
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openSettings])

  return (
    <div className="h-screen flex bg-white dark:bg-[#0a0a0b] overflow-hidden">
      <GlobalSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto relative">
        {/* Top drag strip for macOS — allows window dragging from any page */}
        <div
          data-tauri-drag-region
          style={dragStyle}
          onMouseDown={handleWindowDrag}
          className="absolute top-0 left-0 right-0 h-[28px] z-[5]"
        />
        <Outlet />
      </main>
      <SpotlightPalette />
      <CreateFrameworkDialog />
      <EditFrameworkDialog />
      <SettingsModal />
      <Toast />
    </div>
  )
}
