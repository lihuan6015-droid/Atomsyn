/**
 * V2.0 M6 · Note More Menu — copy/export actions
 *
 * Bear-inspired "..." menu on editor toolbar right side.
 * Copy: plain text / Markdown (with toast feedback).
 * Export: TXT / MD via Tauri save dialog (macOS) or web download.
 * Future (grayed): PDF, Word.
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Copy, FileText, FileCode, FileType, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/cn'
import { isTauri } from '@/lib/dataPath'
import { useAppStore } from '@/stores/useAppStore'

interface NoteMoreMenuProps {
  markdownContent: string
  noteTitle: string
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}

export function NoteMoreMenu({ markdownContent, noteTitle, anchorRef, onClose }: NoteMoreMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    const raf = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handle, true)
      document.addEventListener('keydown', handleEsc)
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousedown', handle, true)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [onClose, anchorRef])

  // ─── Sanitize filename ──────────────────────────────────────────
  const safeTitle = (noteTitle || '笔记').replace(/[/\\:*?"<>|]/g, '_').slice(0, 80)

  // ─── Strip markdown for plain text ──────────────────────────────
  function toPlainText(md: string): string {
    return md
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.+?)\]\(.*?\)/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/^---+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // ─── Copy actions (with toast) ──────────────────────────────────
  async function copyPlainText() {
    await navigator.clipboard.writeText(toPlainText(markdownContent))
    showToast('已复制为纯文本')
    onClose()
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdownContent)
    showToast('已复制为 Markdown')
    onClose()
  }

  // ─── Export: Tauri save dialog or web download ──────────────────
  async function exportAs(ext: string) {
    const content = ext === 'txt' ? toPlainText(markdownContent) : markdownContent
    const defaultName = `${safeTitle}.${ext}`

    if (isTauri()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')

        const filePath = await save({
          defaultPath: defaultName,
          filters: ext === 'txt'
            ? [{ name: '文本文件', extensions: ['txt'] }]
            : [{ name: 'Markdown', extensions: ['md'] }],
        })

        if (filePath) {
          await writeTextFile(filePath, content)
          showToast(`已导出到 ${filePath.split('/').pop()}`)
        }
      } catch (err) {
        console.error('Export failed:', err)
        showToast('导出失败')
      }
    } else {
      // Web fallback: trigger download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName
      a.click()
      URL.revokeObjectURL(url)
      showToast(`已下载 ${defaultName}`)
    }
    onClose()
  }

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + 6
  const right = window.innerWidth - (rect?.right ?? 0)

  return createPortal(
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[9999] min-w-[180px] py-1 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/50"
      style={{ top, right }}
    >
      {/* Copy section */}
      <div className="px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        复制
      </div>
      <MenuItem icon={Copy} label="复制为纯文本" onClick={copyPlainText} />
      <MenuItem icon={FileCode} label="复制为 Markdown" onClick={copyMarkdown} />

      <div className="mx-3 my-1 border-t border-neutral-200/40 dark:border-neutral-800/40" />

      {/* Export section */}
      <div className="px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        导出
      </div>
      <MenuItem icon={FileText} label="导出为 TXT" onClick={() => exportAs('txt')} />
      <MenuItem icon={FileCode} label="导出为 Markdown" onClick={() => exportAs('md')} />
      <MenuItem icon={FileType} label="导出为 PDF" disabled />
      <MenuItem icon={FileSpreadsheet} label="导出为 Word" disabled />
    </motion.div>,
    document.body,
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-1.5 text-[0.75rem] transition-colors text-left',
        disabled
          ? 'text-neutral-300 dark:text-neutral-700 cursor-not-allowed'
          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
      {disabled && (
        <span className="ml-auto text-[0.5625rem] text-neutral-300 dark:text-neutral-700">即将推出</span>
      )}
    </button>
  )
}
