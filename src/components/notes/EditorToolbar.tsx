/**
 * V2.0 M6 · Editor Toolbar
 *
 * Horizontal toolbar above the TipTap editor.
 * Left: Format / List / Block / Insert buttons.
 * Right: unsaved indicator, info popover, more menu, "沉淀" CTA.
 */

import { useRef, useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Link2,
  Table as TableIcon,
  ImageIcon,
  Sparkles,
  Info,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { NoteInfoPopover } from './NoteInfoPopover'
import { NoteMoreMenu } from './NoteMoreMenu'
import { CrystallizePopover } from './CrystallizePopover'
import type { Note } from '@/types'

interface Props {
  editor: Editor
  unsaved: boolean
  note: Note
  getMarkdown: () => string
  /** Set by NoteEditor when right-click "提炼选中内容" is triggered */
  pendingCrystallize?: { mode: 'selection'; text: string } | null
  /** Called after pendingCrystallize is consumed */
  onCrystallizeDone?: () => void
}

interface ToolbarButton {
  icon: React.ComponentType<{ className?: string }>
  title: string
  action: () => void
  isActive?: () => boolean
  separator?: never
}

interface ToolbarSeparator {
  separator: true
}

type ToolbarItem = ToolbarButton | ToolbarSeparator

export function EditorToolbar({ editor, unsaved, note, getMarkdown, pendingCrystallize, onCrystallizeDone }: Props) {
  const [showInfo, setShowInfo] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showCrystallize, setShowCrystallize] = useState(false)
  const [autoStart, setAutoStart] = useState<'full' | 'selection' | undefined>(undefined)
  const [selectionText, setSelectionText] = useState<string | undefined>(undefined)
  const infoRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const crystallizeRef = useRef<HTMLButtonElement>(null)

  // Close popover when switching to a different note
  const noteIdRef = useRef(note.id)
  useEffect(() => {
    if (noteIdRef.current !== note.id) {
      noteIdRef.current = note.id
      setShowCrystallize(false)
      setAutoStart(undefined)
      setSelectionText(undefined)
    }
  }, [note.id])

  // React to right-click "提炼选中内容" from NoteEditor
  useEffect(() => {
    if (pendingCrystallize) {
      // Close existing popover first to force remount with new props
      setShowCrystallize(false)
      // Defer open to next frame to ensure clean unmount → remount
      requestAnimationFrame(() => {
        setSelectionText(pendingCrystallize.text)
        setAutoStart('selection')
        setShowCrystallize(true)
        setShowInfo(false)
        setShowMore(false)
      })
      onCrystallizeDone?.()
    }
  }, [pendingCrystallize]) // eslint-disable-line react-hooks/exhaustive-deps

  const items: ToolbarItem[] = [
    // Format
    {
      icon: Heading1,
      title: '标题 1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive('heading', { level: 1 }),
    },
    {
      icon: Heading2,
      title: '标题 2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive('heading', { level: 2 }),
    },
    {
      icon: Heading3,
      title: '标题 3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive('heading', { level: 3 }),
    },
    { separator: true },
    {
      icon: Bold,
      title: '粗体',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold'),
    },
    {
      icon: Italic,
      title: '斜体',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic'),
    },
    {
      icon: Strikethrough,
      title: '删除线',
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive('strike'),
    },
    { separator: true },
    // Lists
    {
      icon: List,
      title: '无序列表',
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList'),
    },
    {
      icon: ListOrdered,
      title: '有序列表',
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList'),
    },
    {
      icon: CheckSquare,
      title: '待办列表',
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: () => editor.isActive('taskList'),
    },
    { separator: true },
    // Blocks
    {
      icon: Quote,
      title: '引用',
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive('blockquote'),
    },
    {
      icon: Code2,
      title: '代码块',
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive('codeBlock'),
    },
    {
      icon: Minus,
      title: '分割线',
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
    { separator: true },
    // Insert
    {
      icon: Link2,
      title: '链接',
      action: () => {
        const url = window.prompt('输入链接地址')
        if (url) editor.chain().focus().setLink({ href: url }).run()
      },
      isActive: () => editor.isActive('link'),
    },
    {
      icon: TableIcon,
      title: '表格',
      action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run(),
    },
    {
      icon: ImageIcon,
      title: '图片',
      action: () => {
        const url = window.prompt('输入图片地址')
        if (url) editor.chain().focus().setImage({ src: url }).run()
      },
    },
  ]

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-4 py-1.5 border-b border-neutral-200/50 dark:border-neutral-800/50 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm overflow-x-auto scrollbar-hide">
      {items.map((item, i) => {
        if ('separator' in item && item.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="w-px h-5 bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0"
            />
          )
        }
        const btn = item as ToolbarButton
        const active = btn.isActive?.() ?? false
        return (
          <button
            key={btn.title}
            onClick={btn.action}
            title={btn.title}
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
              active
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900',
            )}
          >
            <btn.icon className="w-3.5 h-3.5" />
          </button>
        )
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Unsaved indicator */}
      {unsaved && (
        <span className="text-[0.625rem] text-amber-500 mr-2 shrink-0">
          未保存
        </span>
      )}

      {/* Note info */}
      <button
        ref={infoRef}
        onClick={() => { setShowInfo(!showInfo); setShowMore(false) }}
        title="笔记信息"
        className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
          showInfo
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-600 dark:hover:text-neutral-300',
        )}
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {/* More menu */}
      <button
        ref={moreRef}
        onClick={() => { setShowMore(!showMore); setShowInfo(false) }}
        title="更多操作"
        className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
          showMore
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'text-neutral-400 dark:text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-600 dark:hover:text-neutral-300',
        )}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {/* Separator before CTA */}
      <div className="w-px h-5 bg-neutral-200 dark:bg-neutral-800 mx-1 shrink-0" />

      {/* 提炼到 Atomsyn — 入口按钮 */}
      <button
        ref={crystallizeRef}
        onClick={() => {
          if (showCrystallize) {
            // Toggle close
            setShowCrystallize(false)
            setAutoStart(undefined)
            return
          }
          // Capture current selection for popover idle state
          const selection = editor.state.selection
          const selected = selection.empty
            ? undefined
            : editor.state.doc.textBetween(selection.from, selection.to, '\n')
          setSelectionText(selected)
          setAutoStart(undefined) // entry = idle, not auto-start
          setShowCrystallize(true)
          setShowInfo(false)
          setShowMore(false)
        }}
        title="提炼笔记为经验碎片"
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.6875rem] font-medium bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600 dark:text-amber-400 shrink-0 transition-all",
          showCrystallize ? 'from-amber-500/20 to-orange-500/20 ring-1 ring-amber-500/30' : 'hover:from-amber-500/20 hover:to-orange-500/20',
        )}
      >
        <Sparkles className="w-3.5 h-3.5" />
        提炼
      </button>

      {/* Popovers */}
      {showInfo && (
        <NoteInfoPopover
          note={note}
          anchorRef={infoRef}
          onClose={() => setShowInfo(false)}
        />
      )}
      {showMore && (
        <NoteMoreMenu
          markdownContent={getMarkdown()}
          noteTitle={note.title || '笔记'}
          anchorRef={moreRef}
          onClose={() => setShowMore(false)}
        />
      )}
      {showCrystallize && (
        <CrystallizePopover
          key={`${note.id}-${autoStart ?? 'idle'}`}
          noteId={note.id}
          fullMarkdown={getMarkdown()}
          selectedText={selectionText}
          autoStart={autoStart}
          anchorRef={crystallizeRef}
          onClose={() => {
            setShowCrystallize(false)
            setAutoStart(undefined)
          }}
        />
      )}
    </div>
  )
}
