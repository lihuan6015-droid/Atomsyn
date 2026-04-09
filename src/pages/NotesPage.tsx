/**
 * V2.0 M6 · Notes page — three-panel layout
 *
 * [NotesList (resizable)] | [ResizeHandle] | [NoteEditor (flex)]
 *
 * Loads notes on mount. The GlobalSidebar provides the folder tree
 * (NotesSidebar) when activeMode === 'notes'.
 */

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { FileText, Sparkles, Type } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNotesStore } from '@/stores/useNotesStore'
import { ResizeHandle } from '@/components/shared/ResizeHandle'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { NotesList } from '@/components/notes/NotesList'

const MIN_LIST_WIDTH = 200
const MAX_LIST_WIDTH = 400

export function NotesPage() {
  const loaded = useNotesStore((s) => s.loaded)
  const loadAll = useNotesStore((s) => s.loadAll)
  const panelWidths = useNotesStore((s) => s.panelWidths)
  const setPanelWidths = useNotesStore((s) => s.setPanelWidths)
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  // Subscribe to all data filteredNotes depends on so React re-renders
  const allNotes = useNotesStore((s) => s.notes)
  const trashNotes = useNotesStore((s) => s.trashNotes)
  const showTrash = useNotesStore((s) => s.showTrash)
  const activeGroupId = useNotesStore((s) => s.activeGroupId)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const sortOrder = useNotesStore((s) => s.sortOrder)

  const listWidthRef = useRef(panelWidths.list)

  useEffect(() => {
    if (!loaded) loadAll()
  }, [loaded, loadAll])

  const handleResize = useCallback(
    (delta: number) => {
      const next = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, listWidthRef.current + delta))
      listWidthRef.current = next
      setPanelWidths({ list: next })
    },
    [setPanelWidths],
  )

  // Compute filtered notes reactively (useMemo re-runs when subscribed state changes)
  const notes = useMemo(
    () => useNotesStore.getState().filteredNotes(),
    [allNotes, trashNotes, showTrash, activeGroupId, searchQuery, sortOrder],
  )

  return (
    <div className="h-full flex relative">
      {/* macOS drag region */}
      <div
        data-tauri-drag-region
        className="absolute top-0 left-0 right-0 h-[28px] z-[5]"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />

      {/* ─── Notes List Panel ─── */}
      <div
        className="shrink-0 h-full border-r border-neutral-200/50 dark:border-neutral-800/50 overflow-hidden flex flex-col bg-neutral-50/50 dark:bg-neutral-950/50"
        style={{ width: panelWidths.list }}
      >
        <NotesList notes={notes} activeNoteId={activeNoteId} />
      </div>

      {/* ─── Resize Handle ─── */}
      <ResizeHandle onResize={handleResize} />

      {/* ─── Editor Panel ─── */}
      <div className="flex-1 min-w-[400px] h-full overflow-hidden">
        {activeNoteId ? (
          <NoteEditor />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6 max-w-md mx-auto">
            {/* Hero icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 dark:from-amber-500/25 dark:to-orange-500/15 flex items-center justify-center mb-4 ring-1 ring-amber-500/10"
            >
              <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg font-bold tracking-tight bg-gradient-to-r from-amber-700 to-amber-500 dark:from-amber-300 dark:to-amber-400 bg-clip-text text-transparent mb-2"
            >
              思考的起点
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-[0.8125rem] text-neutral-500 dark:text-neutral-400 leading-relaxed mb-6"
            >
              灵感、阅读笔记、会议记录——认知的原材料。写下来，用"提炼"将它们转化为方法库和记忆花园中的活知识。
            </motion.p>

            {/* Feature hints */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-2 gap-2.5 w-full max-w-xs mb-6"
            >
              <div className="flex items-start gap-2 p-3 rounded-xl border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02]">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[0.75rem] font-medium text-neutral-700 dark:text-neutral-300">AI 提炼</div>
                  <p className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 mt-0.5 leading-relaxed">选中文字一键提炼为经验碎片</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.02]">
                <Type className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[0.75rem] font-medium text-neutral-700 dark:text-neutral-300">Markdown</div>
                  <p className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 mt-0.5 leading-relaxed">代码块、公式、表格全支持</p>
                </div>
              </div>
            </motion.div>

            {/* Action hint */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xs text-neutral-400/60 dark:text-neutral-500/60"
            >
              选择一条笔记开始编辑，或按 <kbd className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-white/5 text-[0.625rem] font-mono">⌘N</kbd> 新建
            </motion.p>

            {/* Bottom tagline */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="text-[0.6875rem] text-neutral-400/60 dark:text-neutral-500/60 italic mt-8"
            >
              Atomsyn — it remembers, so you can grow.
            </motion.p>
          </div>
        )}
      </div>
    </div>
  )
}

export default NotesPage
