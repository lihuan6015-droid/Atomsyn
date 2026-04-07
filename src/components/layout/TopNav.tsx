import type { CSSProperties } from 'react'
import { Flower2, Plus, Settings, Sparkles, Sprout, Wrench } from 'lucide-react'
import atomsynLogo from '@/assets/atomsyn-logo.png'
import { NavLink, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/cn'
import { useAppStore } from '@/stores/useAppStore'
import { handleWindowDrag } from '@/lib/windowDrag'

const tabs = [
  { to: '/garden', label: '记忆花园', icon: Flower2 },
  { to: '/playground', label: '项目演练场', icon: Wrench },
  { to: '/growth', label: '成长档案', icon: Sprout },
  { to: '/skills', label: 'Skill 地图', icon: Sparkles },
]

// Tauri v2 drag-region styles. `drag` tells Tauri the region is a window
// drag handle; `no-drag` opts individual interactive children back out so
// buttons and links still receive their click events. We use these CSS
// styles (which Electron + Tauri both honor) for maximum reliability —
// they work even when React hydration replaces the DOM subtree.
const dragStyle: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const noDragStyle: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function TopNav() {
  const nav = useNavigate()
  const seedUpdateAvailable = useAppStore((s) => s.seedUpdateAvailable)
  const appUpdateAvailable = useAppStore((s) => s.appUpdateAvailable)
  const hasUpdate = seedUpdateAvailable || appUpdateAvailable
  return (
    <header
      data-tauri-drag-region
      style={dragStyle}
      onMouseDown={handleWindowDrag}
      className="sticky top-0 z-50 shrink-0 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white dark:bg-[#0a0a0b]"
    >
      <div
        data-tauri-drag-region
        style={dragStyle}
        className="flex items-center justify-between px-5 h-14"
      >
        <div
          className="flex items-center gap-3"
          data-tauri-drag-region
          style={dragStyle}
        >
          <button
            onClick={() => nav('/garden')}
            style={noDragStyle}
            className="w-7 h-7 rounded-lg overflow-hidden shadow-lg shadow-violet-500/20"
            aria-label="主页"
          >
            <img src={atomsynLogo} alt="Atomsyn" className="w-full h-full object-cover" />
          </button>
          <span className="text-sm font-semibold tracking-tight select-none">Atomsyn</span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono ml-1 select-none">
            v0.1
          </span>
        </div>

        <nav
          style={noDragStyle}
          className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl"
        >
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <NavLink
                key={t.to}
                to={t.to}
                style={noDragStyle}
                className={({ isActive }) =>
                  cn(
                    'px-3.5 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors',
                    isActive
                      ? 'bg-white dark:bg-neutral-800 shadow-sm text-neutral-900 dark:text-white'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  )
                }
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </NavLink>
            )
          })}
        </nav>

        <div
          className="flex items-center gap-1.5"
          data-tauri-drag-region
          style={dragStyle}
        >
          <span style={noDragStyle}>
            <ThemeToggle />
          </span>
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent('ccl:open-new-atom'))
            }
            style={noDragStyle}
            className="h-8 px-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 transition-colors"
            title="新建原子 (N)"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新建</span>
          </button>
          <NavLink
            to="/settings"
            style={noDragStyle}
            className="relative w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-center transition-colors"
            title={hasUpdate ? '设置 · 有可用更新' : '设置'}
          >
            <Settings className="w-4 h-4" />
            {hasUpdate && (
              <span
                aria-label="有可用更新"
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white dark:ring-[#0a0a0b]"
              />
            )}
          </NavLink>
        </div>
      </div>
    </header>
  )
}
