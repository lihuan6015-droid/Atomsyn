/**
 * @deprecated V2.0-layout: Superseded by the "AI 对话" entry in GlobalSidebar.
 * The floating button is no longer rendered in AppShell.
 * TODO(v2.x): Delete this file once ChatPage is confirmed stable.
 */
import { Sparkles } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'

export function FloatingCopilot() {
  const open = useAppStore((s) => s.openCopilot)
  return (
    <button
      onClick={open}
      className="fixed bottom-6 right-6 z-30 group"
      title="AI 副驾驶 (⌘J)"
      aria-label="打开 AI 副驾驶"
    >
      <div className="absolute -inset-2 bg-gradient-to-r from-violet-500 to-sky-400 rounded-2xl opacity-40 blur-xl group-hover:opacity-70 transition-opacity" />
      <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-sky-500 flex items-center justify-center shadow-2xl shadow-violet-500/30 hover:scale-105 active:scale-95 transition-transform">
        <Sparkles className="w-6 h-6 text-white" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white dark:border-[#0a0a0b]" />
      </div>
    </button>
  )
}
