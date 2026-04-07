import { CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'

export function Toast() {
  const toast = useAppStore((s) => s.toast)
  if (!toast.visible) return null
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-toast-in pointer-events-none">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-2xl text-sm font-medium">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-500" />
        <span>{toast.message}</span>
      </div>
    </div>
  )
}
