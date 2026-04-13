/**
 * V2.0 M6 · TipTap WYSIWYG Note Editor
 *
 * Pure WYSIWYG (Bear-style) with tiptap-markdown for clean serialization.
 * Saves: 1.5s debounce during typing + immediate on blur/mode-switch.
 *
 * CJK note: Markdown input rules (e.g. `**bold**`) may not trigger during
 * IME composition. Use toolbar buttons or Cmd+B/I instead.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TiptapImage from '@tiptap/extension-image'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Markdown } from 'tiptap-markdown'
import { common, createLowlight } from 'lowlight'
import { Sparkles } from 'lucide-react'
import { useNotesStore } from '@/stores/useNotesStore'
import { useAppStore } from '@/stores/useAppStore'
import { notesApi } from '@/lib/dataApi'
import { EditorToolbar } from './EditorToolbar'
import { NoteTagsHeader } from './NoteTagsHeader'
import { ContextMenu } from '@/components/shared/ContextMenu'

const lowlight = createLowlight(common)

const AUTOSAVE_DELAY = 1500

/** Extract markdown from editor (typed helper to avoid repeated casts) */
function getMarkdown(editor: { storage: unknown }): string {
  return ((editor.storage as any).markdown?.getMarkdown?.() as string) ?? ''
}

export function NoteEditor() {
  const activeNoteId = useNotesStore((s) => s.activeNoteId)
  const notes = useNotesStore((s) => s.notes)
  const updateNote = useNotesStore((s) => s.updateNote)
  const markUnsaved = useNotesStore((s) => s.markUnsaved)

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentNoteIdRef = useRef<string | null>(null)
  const [unsaved, setUnsaved] = useState(false)
  const savingRef = useRef(false) // prevent double-save
  const suppressUpdateRef = useRef(false) // suppress onUpdate during setContent

  // Right-click crystallize state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [pendingCrystallize, setPendingCrystallize] = useState<{ mode: 'selection'; text: string } | null>(null)
  const showToast = useAppStore((s) => s.showToast)

  // ─── Core save function ─────────────────────────────────────────
  const saveNow = useCallback(
    (editorInstance: { storage: unknown }) => {
      const noteId = currentNoteIdRef.current
      if (!noteId || savingRef.current) return

      // Cancel any pending debounce
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      const md = getMarkdown(editorInstance)
      savingRef.current = true
      updateNote(noteId, { content: md }).finally(() => {
        savingRef.current = false
        setUnsaved(false)
        markUnsaved(noteId, false)
      })
    },
    [updateNote, markUnsaved],
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: '开始写作...',
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      TiptapImage.configure({ inline: false, allowBase64: true }),
      HorizontalRule,
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[300px] px-8 pt-4 pb-20',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file && activeNoteId) handleImageUpload(file, activeNoteId)
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (!currentNoteIdRef.current || suppressUpdateRef.current) return
      setUnsaved(true)
      markUnsaved(currentNoteIdRef.current, true)

      // Debounced auto-save (1.5s)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveNow(ed)
        saveTimerRef.current = null
      }, AUTOSAVE_DELAY)
    },
    // ─── Immediate save on blur (click outside editor) ────────────
    onBlur: ({ editor: ed }) => {
      if (unsaved) {
        saveNow(ed)
      }
    },
  })

  // Handle image upload
  async function handleImageUpload(file: File, noteId: string) {
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      const filename = `img-${Date.now()}.${file.type.split('/')[1] || 'png'}`
      try {
        const result = await notesApi.uploadAttachment(noteId, filename, base64)
        let imgSrc = `/api/fs/${result.path}`
        // In Tauri packaged mode, convert to asset protocol URL
        if ('__TAURI_INTERNALS__' in window) {
          const { getDataDirInfo } = await import('@/lib/dataPath')
          const { convertFileSrc } = await import('@tauri-apps/api/core')
          const info = await getDataDirInfo()
          imgSrc = convertFileSrc(`${info.path}/${result.path}`)
        }
        editor?.chain().focus().setImage({ src: imgSrc }).run()
      } catch (err) {
        console.error('Image upload failed:', err)
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── Sync editor content when active note changes ───────────────
  useEffect(() => {
    if (!editor) return

    // Flush pending save for previous note
    if (currentNoteIdRef.current && unsaved) {
      saveNow(editor)
    }

    currentNoteIdRef.current = activeNoteId

    // Clear any pending crystallize when switching notes
    setPendingCrystallize(null)
    setCtxMenu(null)

    if (activeNote) {
      // Suppress onUpdate during programmatic setContent to avoid fake saves
      suppressUpdateRef.current = true
      editor.commands.setContent(activeNote.content || '')
      suppressUpdateRef.current = false
      setUnsaved(false)
    } else {
      suppressUpdateRef.current = true
      editor.commands.clearContent()
      suppressUpdateRef.current = false
    }
  }, [activeNoteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Save on window/tab blur (e.g. switching to another app) ────
  useEffect(() => {
    if (!editor) return
    const handleVisibility = () => {
      if (document.hidden && unsaved) saveNow(editor)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    // Also save before unload
    const handleBeforeUnload = () => {
      if (unsaved) saveNow(editor)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [editor, unsaved, saveNow])

  if (!activeNote || !editor) {
    return null
  }

  // ─── Right-click handler for crystallize ────────────────────────
  function handleEditorContextMenu(e: React.MouseEvent) {
    if (!editor || editor.state.selection.empty) return // no selection → native menu
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="h-full flex flex-col">
      <NoteTagsHeader noteId={activeNote.id} tags={activeNote.tags} />
      <EditorToolbar
        editor={editor}
        unsaved={unsaved}
        note={activeNote}
        getMarkdown={() => getMarkdown(editor)}
        pendingCrystallize={pendingCrystallize}
        onCrystallizeDone={() => setPendingCrystallize(null)}
      />
      <div className="flex-1 overflow-y-auto" onContextMenu={handleEditorContextMenu}>
        <EditorContent editor={editor} />
      </div>

      {/* Right-click context menu */}
      {ctxMenu && editor && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: '提炼选中内容',
              icon: Sparkles,
              action: () => {
                const { from, to } = editor.state.selection
                const text = editor.state.doc.textBetween(from, to, '\n')
                if (text.trim()) {
                  setPendingCrystallize({ mode: 'selection', text })
                  showToast('正在提炼选中内容...')
                }
                setCtxMenu(null)
              },
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}
