/**
 * V2.0 M6 · Note Info Popover — shows note statistics and metadata
 *
 * Inspired by Bear's info panel: word count, character count,
 * paragraph count, estimated reading time, dates.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import type { Note } from '@/types'

interface NoteInfoPopoverProps {
  note: Note
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

function countStats(content: string) {
  // Strip markdown syntax for counting
  const text = content.replace(/[#*`>\-\[\]()!|]/g, '').trim()
  const chars = text.replace(/\s/g, '').length

  // Word count: CJK characters each count as 1 word, English words by whitespace
  // This matches Bear's behavior for mixed CJK/English text
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length
  const nonCjkText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ')
  const englishWords = nonCjkText.split(/[\s\n]+/).filter((w) => w.length > 0).length
  const words = cjkChars + englishWords

  const paragraphs = content
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0).length

  // Reading speed: ~400 CJK chars/min, ~200 English words/min
  const readingMinutes = Math.max(1, Math.ceil((cjkChars / 400) + (englishWords / 200)))
  return { words, chars, paragraphs, readingMinutes }
}

export function NoteInfoPopover({ note, anchorRef, onClose }: NoteInfoPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handle, true)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handle, true)
    }
  }, [onClose, anchorRef])

  const stats = countStats(note.content || '')

  // Position below the anchor button
  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + 6
  const right = window.innerWidth - (rect?.right ?? 0)

  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[9999] w-[220px] rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50 p-4"
      style={{ top, right }}
    >
      <div className="text-[0.6875rem] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-3">
        统计
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatItem label="字数" value={stats.words.toLocaleString()} />
        <StatItem label="字符" value={stats.chars.toLocaleString()} />
        <StatItem label="段落" value={stats.paragraphs.toString()} />
        <StatItem label="阅读时间" value={`${stats.readingMinutes}分钟`} />
      </div>

      <div className="mt-3 pt-3 border-t border-neutral-200/50 dark:border-neutral-800/50 space-y-2">
        <DateRow label="编辑日期" value={note.updatedAt} />
        <DateRow label="创建日期" value={note.createdAt} />
      </div>
    </motion.div>,
    document.body,
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-2 text-center">
      <div className="text-base font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums">
        {value}
      </div>
      <div className="text-[0.625rem] text-neutral-400 dark:text-neutral-500 mt-0.5">
        {label}
      </div>
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string }) {
  const d = new Date(value)
  const formatted = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  return (
    <div className="flex items-center justify-between text-[0.6875rem]">
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="text-neutral-700 dark:text-neutral-300 tabular-nums">{formatted}</span>
    </div>
  )
}
