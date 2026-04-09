/**
 * V2.0 M6 · Note tags header
 *
 * Displays tag chips above the editor. Supports add/remove.
 * Sprint 6: improved discoverability — "添加标签" CTA when empty,
 * "+ 标签" text button instead of bare "+" icon.
 */

import { useState, useRef } from 'react'
import { Tag, X } from 'lucide-react'
import { useNotesStore } from '@/stores/useNotesStore'
import { cn } from '@/lib/cn'

interface Props {
  noteId: string
  tags: string[]
}

export function NoteTagsHeader({ noteId, tags }: Props) {
  const updateNote = useNotesStore((s) => s.updateNote)
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleAdd(value: string) {
    const tag = value.trim()
    if (!tag || tags.includes(tag)) return
    updateNote(noteId, { tags: [...tags, tag] })
    setAdding(false)
  }

  function handleRemove(tag: string) {
    updateNote(noteId, { tags: tags.filter((t) => t !== tag) })
  }

  return (
    <div
      className={cn(
        'shrink-0 flex items-center gap-1.5 px-8 pt-[36px] pb-1.5 flex-wrap min-h-[44px]',
        'border-b border-neutral-100 dark:border-neutral-800/50',
        'hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] transition-colors',
      )}
    >
      {/* Tag icon */}
      <Tag className="w-3 h-3 text-neutral-400 dark:text-neutral-500 shrink-0 mr-0.5" />

      {/* Tag chips */}
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[0.6875rem] font-medium font-mono"
        >
          {tag}
          <button
            onClick={() => handleRemove(tag)}
            className="w-3 h-3 rounded-full hover:bg-amber-500/20 flex items-center justify-center"
          >
            <X className="w-2 h-2" />
          </button>
        </span>
      ))}

      {/* Add tag input or button */}
      {adding ? (
        <input
          ref={inputRef}
          autoFocus
          placeholder="标签名..."
          className="text-[0.6875rem] px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 bg-transparent outline-none w-24 font-mono"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd(e.currentTarget.value)
            if (e.key === 'Escape') setAdding(false)
          }}
          onBlur={(e) => {
            if (e.currentTarget.value.trim()) handleAdd(e.currentTarget.value)
            else setAdding(false)
          }}
        />
      ) : tags.length === 0 ? (
        <button
          onClick={() => setAdding(true)}
          className="text-[0.6875rem] text-amber-500/60 dark:text-amber-400/50 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
        >
          添加标签...
        </button>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[0.6875rem] text-neutral-400 dark:text-neutral-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
        >
          + 标签
        </button>
      )}
    </div>
  )
}
