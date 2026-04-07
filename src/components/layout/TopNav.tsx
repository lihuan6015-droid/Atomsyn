import { Compass, Library, Plus, Settings, Sprout, Wrench } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/cn'

const tabs = [
  { to: '/atlas', label: '知识图书馆', icon: Library },
  { to: '/playground', label: '项目演练场', icon: Wrench },
  { to: '/growth', label: '成长档案', icon: Sprout },
]

export function TopNav() {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-[#0a0a0b]/70 glass">
      <div className="flex items-center justify-between px-5 h-14">
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/atlas')}
            className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-sky-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-violet-500/20"
            aria-label="主页"
          >
            <Compass className="w-4 h-4 text-white" />
          </button>
          <span className="text-sm font-semibold tracking-tight">CCL PM Tool</span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-mono ml-1">
            v0.1
          </span>
        </div>

        <nav className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-neutral-900 rounded-xl">
          {tabs.map((t) => {
            const Icon = t.icon
            return (
              <NavLink
                key={t.to}
                to={t.to}
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

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            onClick={() =>
              window.dispatchEvent(new CustomEvent('ccl:open-new-atom'))
            }
            className="h-8 px-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 transition-colors"
            title="新建原子 (N)"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">新建</span>
          </button>
          <NavLink
            to="/settings"
            className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-center transition-colors"
            title="设置"
          >
            <Settings className="w-4 h-4" />
          </NavLink>
        </div>
      </div>
    </header>
  )
}
