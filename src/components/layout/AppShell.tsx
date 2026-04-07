import { Outlet, useLocation } from 'react-router-dom'
import { TopNav } from './TopNav'
import { Sidebar } from './Sidebar'
import { FloatingCopilot } from '@/components/shared/FloatingCopilot'
import { Toast } from '@/components/shared/Toast'
import { CopilotPanel } from '@/components/copilot/CopilotPanel'
import { useEffect } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useNavigate } from 'react-router-dom'
// V1.5 · We no longer render a custom drag strip on macOS Tauri: the
// default native title bar (28px) handles drag, traffic lights, and
// minimize/zoom cleanly. Our content starts below it. This avoids the
// "drag works once, then fails because the traffic-light hit-test zone
// intercepts mouse events" race on macOS that Overlay style caused.

export function AppShell() {
  const loc = useLocation()
  const nav = useNavigate()
  const toggleCopilot = useAppStore((s) => s.toggleCopilot)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('ccl:open-spotlight'))
      }
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        toggleCopilot()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleCopilot])

  // Show sidebar only on knowledge / playground tabs
  const showSidebar =
    loc.pathname.startsWith('/garden') ||
    loc.pathname.startsWith('/playground') ||
    loc.pathname === '/'

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-[#0a0a0b] overflow-hidden">
      <TopNav />
      <div className="flex flex-1 min-h-0 h-[calc(100vh-56px)]">
        {showSidebar && <Sidebar />}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <FloatingCopilot />
      <CopilotPanel />
      <Toast />
    </div>
  )
}
