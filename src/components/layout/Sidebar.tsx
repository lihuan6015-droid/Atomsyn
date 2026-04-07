import { Bot, Palette, Plus, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { frameworksApi } from '@/lib/dataApi'
import { useAppStore } from '@/stores/useAppStore'
import { cn } from '@/lib/cn'
import type { Framework } from '@/types'

const FUTURE_SKELETONS = [
  { id: 'ui-ux-patterns',    name: 'UI/UX 模式',  icon: Palette, count: 0 },
  { id: 'agent-development', name: 'Agent 开发',  icon: Bot,     count: 0 },
] as const

export function Sidebar() {
  const [frameworks, setFrameworks] = useState<Framework[]>([])
  const activeId = useAppStore((s) => s.activeFrameworkId)
  const setActive = useAppStore((s) => s.setActiveFramework)

  useEffect(() => {
    frameworksApi.list().then(setFrameworks).catch(() => setFrameworks([]))
  }, [])

  return (
    <aside className="w-56 shrink-0 hidden md:block border-r border-neutral-200/60 dark:border-neutral-800/60 bg-white/40 dark:bg-neutral-950/40 p-4 overflow-y-auto scrollbar-hide">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2 px-2">
        骨架
      </div>
      <div className="space-y-0.5">
        {frameworks.map((f) => {
          const isActive = f.id === activeId
          return (
            <button
              key={f.id}
              onClick={() => setActive(f.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors',
                isActive
                  ? 'bg-gradient-to-r from-violet-500/10 to-transparent'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
              )}
            >
              <Star
                className={cn(
                  'w-3.5 h-3.5',
                  isActive ? 'text-violet-500 fill-violet-500' : 'text-neutral-400'
                )}
              />
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    'text-sm truncate',
                    isActive ? 'font-medium' : 'text-neutral-600 dark:text-neutral-300'
                  )}
                >
                  {f.name}
                </div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  {f.matrix?.cells?.length ?? 0} 格
                </div>
              </div>
            </button>
          )
        })}

        {FUTURE_SKELETONS.map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.id}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-left transition-colors opacity-60"
              title="即将推出"
            >
              <Icon className="w-3.5 h-3.5 text-neutral-400" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-neutral-600 dark:text-neutral-300 truncate">
                  {s.name}
                </div>
                <div className="text-[10px] text-neutral-400 dark:text-neutral-500">即将推出</div>
              </div>
            </button>
          )
        })}
      </div>

      <button className="mt-3 w-full flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-violet-400 hover:text-violet-500 dark:hover:border-violet-500 transition-colors text-xs">
        <Plus className="w-3 h-3" />
        新骨架
      </button>
    </aside>
  )
}
