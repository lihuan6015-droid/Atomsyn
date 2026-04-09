/**
 * V2.0 M6 Sprint 4 · Global Sidebar (with notes-mode collapse)
 *
 * Thin shell: header (logo + ModeSwitcher) + mode-specific sidebar + bottom actions.
 * In notes mode, collapses to 48px icon-only strip for immersive writing.
 * Toggle: collapse button in sidebar header, or Cmd+\ keyboard shortcut.
 */

import type { CSSProperties } from 'react'
import { useEffect } from 'react'
import { Moon, Settings, Sun, PanelLeftOpen, MessageCircle, Brain, StickyNote } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import atomsynLogo from '@/assets/atomsyn-logo.png'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/useAppStore'
import { useNotesStore } from '@/stores/useNotesStore'
import { handleWindowDrag } from '@/lib/windowDrag'
import { ModeSwitcher } from './ModeSwitcher'
import { ChatSidebar } from './ChatSidebar'
import { AtomSidebar } from './AtomSidebar'
import { NotesSidebar } from './NotesSidebar'

const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function GlobalSidebar() {
  const nav = useNavigate()
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const openSettings = useAppStore((s) => s.openSettings)
  const activeMode = useAppStore((s) => s.activeMode)
  const seedUpdateAvailable = useAppStore((s) => s.seedUpdateAvailable)
  const appUpdateAvailable = useAppStore((s) => s.appUpdateAvailable)
  const hasUpdate = seedUpdateAvailable || appUpdateAvailable

  const isNotes = activeMode === 'notes'
  const collapsed = useNotesStore((s) => s.sidebarCollapsed)
  const setCollapsed = useNotesStore((s) => s.setSidebarCollapsed)
  const isCollapsed = isNotes && collapsed

  // ⌘\ keyboard shortcut to toggle sidebar in notes mode
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        const mode = useAppStore.getState().activeMode
        if (mode === 'notes') {
          const { sidebarCollapsed, setSidebarCollapsed } = useNotesStore.getState()
          setSidebarCollapsed(!sidebarCollapsed)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <aside
      className={cn(
        'shrink-0 flex flex-col h-full border-r border-neutral-200/60 dark:border-neutral-800/60 bg-white/60 dark:bg-neutral-950/60 glass overflow-hidden select-none',
        'transition-[width] duration-200',
      )}
      style={{
        width: isCollapsed ? 48 : 240,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* ─── Header: Logo + collapse toggle ─── */}
      <div
        data-tauri-drag-region
        style={dragStyle}
        onMouseDown={handleWindowDrag}
        className={cn(
          'shrink-0 flex items-center pt-[env(titlebar-area-y,10px)] pb-2 h-[52px]',
          isCollapsed ? 'justify-center px-1' : 'px-4 gap-2.5',
        )}
      >
        <button
          onClick={() => nav('/chat')}
          style={noDragStyle}
          className="w-8 h-8 rounded-[10px] overflow-hidden flex-shrink-0 hover:scale-105 active:scale-95 transition-transform shadow-md shadow-violet-500/15 ring-1 ring-white/30 dark:ring-white/10"
          aria-label="主页"
        >
          <div className="w-full h-full bg-gradient-to-br from-[#f0f0f8] via-white to-[#e8e8f4] dark:from-[#2a2a3a] dark:via-[#1e1e2e] dark:to-[#252535] flex items-center justify-center p-0.5">
            <img src={atomsynLogo} alt="Atomsyn" className="w-full h-full object-contain drop-shadow-sm scale-125" />
          </div>
        </button>
        {!isCollapsed && (
          <>
            <span className="text-sm font-semibold tracking-tight">Atomsyn</span>
            <span className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 font-mono">
              v0.1
            </span>
          </>
        )}
      </div>

      {/* ─── Mode Switcher (pill) — hidden when collapsed ─── */}
      {!isCollapsed && (
        <div className="px-3 pb-2" style={noDragStyle}>
          <ModeSwitcher />
        </div>
      )}

      {/* ─── Mode-specific sidebar content ─── */}
      <nav
        className="flex-1 overflow-y-auto scrollbar-hide"
        style={noDragStyle}
        onDragOver={(e) => { if (isNotes) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      >
        {isCollapsed ? (
          <CollapsedContent
            onExpand={() => setCollapsed(false)}
          />
        ) : (
          <>
            {activeMode === 'chat' && <ChatSidebar />}
            {activeMode === 'atom' && <AtomSidebar />}
            {activeMode === 'notes' && <NotesSidebar />}
          </>
        )}
      </nav>

      {/* ─── Bottom actions ─── */}
      <div
        className={cn(
          'shrink-0 border-t border-neutral-200/50 dark:border-neutral-800/50 px-3 py-3 flex items-center',
          isCollapsed ? 'flex-col gap-2' : 'justify-between',
        )}
        style={noDragStyle}
      >
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
          title={theme === 'dark' ? '切换到明亮模式' : '切换到暗黑模式'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-neutral-500" />
          )}
        </button>

        <button
          onClick={openSettings}
          className="relative w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
          title={hasUpdate ? '设置 · 有可用更新' : '设置'}
        >
          <Settings className="w-4 h-4 text-neutral-500" />
          {hasUpdate && (
            <span
              aria-label="有可用更新"
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-neutral-950"
            />
          )}
        </button>
      </div>
    </aside>
  )
}

// ─── Collapsed sidebar content (icon-only mode) ──────────────────

function CollapsedContent({ onExpand }: { onExpand: () => void }) {
  const nav = useNavigate()
  const activeMode = useAppStore((s) => s.activeMode)
  const setActiveMode = useAppStore((s) => s.setActiveMode)

  const modes: { key: 'chat' | 'atom' | 'notes'; label: string; icon: React.ComponentType<{ className?: string }>; route: string }[] = [
    { key: 'chat', label: '聊天', icon: MessageCircle, route: '/chat' },
    { key: 'atom', label: '元认知', icon: Brain, route: '/atom/garden' },
    { key: 'notes', label: '笔记', icon: StickyNote, route: '/notes' },
  ]

  return (
    <div className="flex flex-col items-center gap-1 py-2">
      {/* Expand button */}
      <button
        onClick={onExpand}
        className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors mb-1"
        title="展开侧边栏 (⌘\)"
      >
        <PanelLeftOpen className="w-4 h-4 text-neutral-400" />
      </button>

      <div className="w-5 border-t border-neutral-200/50 dark:border-neutral-800/50 mb-1" />

      {/* Mode icons */}
      {modes.map((m) => {
        const Icon = m.icon
        return (
          <button
            key={m.key}
            onClick={() => { setActiveMode(m.key); nav(m.route) }}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              activeMode === m.key
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-600 dark:hover:text-neutral-300',
            )}
            title={m.label}
          >
            <Icon className="w-4 h-4" />
          </button>
        )
      })}
    </div>
  )
}
