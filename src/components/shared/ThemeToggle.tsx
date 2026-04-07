import { Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 flex items-center justify-center transition-colors"
      title="切换主题"
      aria-label="切换主题"
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
