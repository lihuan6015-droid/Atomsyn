/**
 * V2.x · ChatInput — multi-line input area with attachments, / commands, model selector.
 *
 * Features:
 * - Auto-resizing textarea (up to 6 rows)
 * - Enter sends, Shift+Enter newline
 * - Left: paperclip for attachments, / command trigger
 * - Right: model selector badge, send button (violet->sky gradient)
 * - Attachment bar above textarea when files are selected
 * - SkillCommandPalette on `/` at start of input
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Paperclip, Send } from 'lucide-react'
import type { ChatAttachment } from '@/types'
import { cn } from '@/lib/cn'
import { AttachmentBar } from './AttachmentBar'
import { SkillCommandPalette } from './SkillCommandPalette'
import { ModelSelector } from './ModelSelector'
import {
  PathDetectionBanner,
  detectAbsolutePath,
  isPasteDismissed,
  setPasteDismissed,
} from './PathDetectionBanner'
import { useChatStore } from '@/stores/useChatStore'

/**
 * V2.x bootstrap-tools (B2/B3): the `/bootstrap` palette pick + the
 * `/bootstrap <path>` typed command both flow through this CustomEvent so
 * ChatPage owns the wizard open/close state in one place.
 */
function dispatchOpenBootstrap(paths: string[] = []) {
  window.dispatchEvent(new CustomEvent('atomsyn:open-bootstrap', { detail: { paths } }))
}

interface ChatInputProps {
  onSend: (text: string, attachments?: ChatAttachment[]) => void
  disabled?: boolean
  placeholder?: string
}

let attachmentCounter = 0
function nextAttachmentId() {
  return `att_${Date.now()}_${++attachmentCounter}`
}

export function ChatInput({
  onSend,
  disabled,
  placeholder = '描述你遇到的问题，Enter 发送 · Shift+Enter 换行',
}: ChatInputProps) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [showPalette, setShowPalette] = useState(false)
  const [pastedPath, setPastedPath] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sessionModelId = useChatStore((s) => s.sessionModelId)
  const setSessionModel = useChatStore((s) => s.setSessionModel)

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = 6 * 28 // ~6 rows
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    // Show palette when user types / at start
    if (val === '/') {
      setShowPalette(true)
    } else if (!val.startsWith('/') || val.includes(' ')) {
      setShowPalette(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !showPalette) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return

    // bootstrap-tools B3 — `/bootstrap [path]` short-circuits to the wizard
    // instead of being sent to the LLM as an actual chat turn.
    if (trimmed.startsWith('/bootstrap')) {
      const pathArg = trimmed.slice('/bootstrap'.length).trim()
      const paths = pathArg ? [pathArg] : []
      dispatchOpenBootstrap(paths)
      setText('')
      setShowPalette(false)
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setText('')
    setAttachments([])
    setShowPalette(false)
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function handlePaletteSelect(command: string) {
    // bootstrap-tools B2 — /bootstrap opens the wizard directly instead of
    // pre-filling text the user has to manually send.
    if (command === '/bootstrap') {
      dispatchOpenBootstrap([])
      setShowPalette(false)
      return
    }
    setText(command + ' ')
    setShowPalette(false)
    textareaRef.current?.focus()
  }

  // bootstrap-tools B5 — paste an absolute path → offer one-click bootstrap.
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (isPasteDismissed()) return
    const clip = e.clipboardData?.getData('text') || ''
    const path = detectAbsolutePath(clip)
    if (path) setPastedPath(path)
  }

  function acceptPastedPath() {
    if (!pastedPath) return
    dispatchOpenBootstrap([pastedPath])
    setPastedPath(null)
    // Clear the textarea content the path got pasted into so it doesn't get
    // sent as a chat message after the user accepts the bootstrap shortcut.
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function dismissPastedPath(rememberChoice: boolean) {
    if (rememberChoice) setPasteDismissed(true)
    setPastedPath(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/')
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result as string
        // For data URLs, extract the base64 portion after the comma
        const base64 = isImage ? result.split(',')[1] ?? '' : result
        const att: ChatAttachment = {
          id: nextAttachmentId(),
          type: isImage ? 'image' : 'file',
          name: file.name,
          data: base64,
          mediaType: file.type,
          size: file.size,
        }
        setAttachments((prev) => [...prev, att])
      }

      if (isImage) {
        reader.readAsDataURL(file)
      } else {
        reader.readAsText(file)
      }
    })

    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }

  const canSend = !disabled && (text.trim().length > 0 || attachments.length > 0)

  return (
    <div className="relative">
      {/* Skill command palette */}
      <SkillCommandPalette
        visible={showPalette}
        onSelect={handlePaletteSelect}
        onClose={() => setShowPalette(false)}
      />

      {/* bootstrap-tools B4 — pasted-path detection banner */}
      <AnimatePresence>
        {pastedPath && (
          <PathDetectionBanner
            path={pastedPath}
            onAccept={acceptPastedPath}
            onDismiss={dismissPastedPath}
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          'rounded-2xl border border-neutral-200/70 dark:border-white/10',
          'bg-white dark:bg-neutral-900',
          'shadow-lg shadow-neutral-500/5 dark:shadow-black/20',
          'transition-all duration-200',
          'focus-within:border-violet-300/60 dark:focus-within:border-violet-500/30',
          'focus-within:shadow-violet-500/8',
        )}
      >
        {/* Attachment bar */}
        <AttachmentBar attachments={attachments} onRemove={removeAttachment} />

        {/* Textarea area */}
        <div className="px-4 pt-3 pb-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className={cn(
              'w-full resize-none',
              'bg-transparent border-none outline-none',
              'text-sm leading-6 text-neutral-800 dark:text-neutral-200',
              'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'scrollbar-thin',
            )}
          />
        </div>

        {/* Toolbar — always pinned at bottom */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
          {/* Left controls */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className={cn(
                'p-1.5 rounded-lg',
                'text-neutral-400 dark:text-neutral-500',
                'hover:bg-neutral-100 dark:hover:bg-white/5',
                'hover:text-neutral-600 dark:hover:text-neutral-300',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                'transition-colors duration-150',
              )}
              title="添加附件"
            >
              <Paperclip size={16} />
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            <ModelSelector
              currentModelId={sessionModelId}
              onSelect={setSessionModel}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                'p-1.5 rounded-lg',
                'transition-all duration-200',
                canSend
                  ? 'bg-gradient-to-r from-violet-500 to-sky-500 text-white shadow-sm hover:shadow-md hover:from-violet-600 hover:to-sky-600'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-300 dark:text-neutral-600 cursor-not-allowed',
              )}
              title="发送 (Enter)"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.json,.csv,.log"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}
