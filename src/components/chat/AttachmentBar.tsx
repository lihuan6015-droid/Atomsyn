/**
 * V2.x · AttachmentBar — horizontal preview row for selected chat attachments.
 *
 * Shows image thumbnails or file icons. Each item has an X button to remove.
 * Compact height, horizontally scrollable.
 */

import { X, FileText, Image as ImageIcon } from 'lucide-react'
import type { ChatAttachment } from '@/types'
import { cn } from '@/lib/cn'

interface AttachmentBarProps {
  attachments: ChatAttachment[]
  onRemove: (id: string) => void
}

export function AttachmentBar({ attachments, onRemove }: AttachmentBarProps) {
  if (attachments.length === 0) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'overflow-x-auto scrollbar-thin',
        'border-b border-neutral-100 dark:border-white/5',
      )}
    >
      {attachments.map((att) => (
        <div
          key={att.id}
          className={cn(
            'relative group flex items-center gap-1.5 shrink-0',
            'px-2 py-1.5 rounded-lg',
            'border border-neutral-200/60 dark:border-white/8',
            'bg-neutral-50/80 dark:bg-white/[0.03]',
          )}
        >
          {att.type === 'image' && att.data ? (
            <img
              src={att.mediaType.startsWith('image/') ? `data:${att.mediaType};base64,${att.data}` : att.data}
              alt={att.name}
              className="w-8 h-8 rounded object-cover"
            />
          ) : att.type === 'image' ? (
            <ImageIcon size={16} className="text-sky-500 dark:text-sky-400" />
          ) : (
            <FileText size={16} className="text-neutral-400 dark:text-neutral-500" />
          )}
          <span className="text-[0.625rem] text-neutral-600 dark:text-neutral-400 max-w-[80px] truncate">
            {att.name}
          </span>
          <button
            type="button"
            onClick={() => onRemove(att.id)}
            className={cn(
              'absolute -top-1.5 -right-1.5',
              'flex items-center justify-center w-4 h-4 rounded-full',
              'bg-neutral-200 dark:bg-neutral-700',
              'text-neutral-500 dark:text-neutral-300',
              'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-150',
              'hover:bg-red-400 hover:text-white',
            )}
          >
            <X size={8} />
          </button>
        </div>
      ))}
    </div>
  )
}
