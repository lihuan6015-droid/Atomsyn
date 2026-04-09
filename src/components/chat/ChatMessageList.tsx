/**
 * V2.x · ChatMessageList — main conversation display area.
 *
 * User messages: right-aligned violet bubble.
 * AI messages: left-aligned, rendered with MarkdownRenderer (Streamdown).
 * Auto-scrolls to bottom on new messages.
 * Typing indicator when streaming with no content yet.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Sparkles, Copy, Check } from 'lucide-react'
import type { ChatMessageRecord, KnowledgeIndex } from '@/types'
import { cn } from '@/lib/cn'
import { MarkdownRenderer } from './MarkdownRenderer'

interface ChatMessageListProps {
  messages: ChatMessageRecord[]
  streamingContent?: string
  isStreaming?: boolean
  knowledgeIndex?: KnowledgeIndex | null
  onIngestConfirm?: (data: Record<string, unknown>) => void
  onIngestCancel?: () => void
}

// ─── Typing indicator ────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export function ChatMessageList({
  messages,
  streamingContent,
  isStreaming,
  knowledgeIndex: _knowledgeIndex,
  onIngestConfirm,
  onIngestCancel,
}: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingContent])

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain px-4 py-6 space-y-4 scrollbar-thin"
    >
      <AnimatePresence mode="popLayout">
        {messages.map((msg) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={cn(
              'flex gap-3',
              msg.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            {/* AI avatar */}
            {msg.role === 'assistant' && (
              <div
                className={cn(
                  'shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mt-0.5',
                  'bg-gradient-to-br from-violet-500/15 to-sky-500/15',
                  'dark:from-violet-500/20 dark:to-sky-500/20',
                )}
              >
                <Sparkles size={14} className="text-violet-600 dark:text-violet-400" />
              </div>
            )}

            {/* Message bubble */}
            <div
              className={cn(
                'max-w-[75%] min-w-0 relative group/msg',
                msg.role === 'user'
                  ? cn(
                      'px-4 py-2.5 rounded-2xl rounded-br-md',
                      'bg-gradient-to-r from-violet-500 to-violet-600',
                      'text-white text-sm leading-relaxed',
                      'shadow-sm',
                    )
                  : cn(
                      'px-4 py-3 rounded-2xl rounded-bl-md',
                      'bg-neutral-50/80 dark:bg-white/[0.03]',
                      'border border-neutral-200/40 dark:border-white/5',
                      'text-sm leading-relaxed',
                      'text-neutral-800 dark:text-neutral-200',
                      // Streamdown prose styles
                      '[&_.streamdown]:prose [&_.streamdown]:prose-sm [&_.streamdown]:dark:prose-invert',
                      '[&_.streamdown]:max-w-none',
                    ),
              )}
            >
              {msg.role === 'user' ? (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              ) : (
                <MarkdownRenderer
                  content={msg.content}
                  isStreaming={false}
                  onIngestConfirm={onIngestConfirm}
                  onIngestCancel={onIngestCancel}
                />
              )}

              {/* Copy button for AI messages */}
              {msg.role === 'assistant' && (
                <CopyButton content={msg.content} />
              )}

              {/* Attachments */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.attachments.map((att) => (
                    <div
                      key={att.id}
                      className={cn(
                        'rounded-lg overflow-hidden',
                        att.type === 'image' ? 'w-32 h-32' : 'px-2 py-1',
                        'border border-white/20',
                      )}
                    >
                      {att.type === 'image' && att.data ? (
                        <img
                          src={att.mediaType.startsWith('image/') ? `data:${att.mediaType};base64,${att.data}` : att.data}
                          alt={att.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[0.625rem] opacity-70">{att.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User avatar */}
            {msg.role === 'user' && (
              <div
                className={cn(
                  'shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mt-0.5',
                  'bg-neutral-100 dark:bg-white/8',
                )}
              >
                <User size={14} className="text-neutral-500 dark:text-neutral-400" />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Streaming message */}
      {isStreaming && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3 justify-start"
        >
          <div
            className={cn(
              'shrink-0 flex items-center justify-center w-7 h-7 rounded-lg mt-0.5',
              'bg-gradient-to-br from-violet-500/15 to-sky-500/15',
              'dark:from-violet-500/20 dark:to-sky-500/20',
            )}
          >
            <Sparkles size={14} className="text-violet-600 dark:text-violet-400" />
          </div>

          <div
            className={cn(
              'max-w-[75%] min-w-0',
              'px-4 py-3 rounded-2xl rounded-bl-md',
              'bg-neutral-50/80 dark:bg-white/[0.03]',
              'border border-neutral-200/40 dark:border-white/5',
              'text-sm leading-relaxed',
              'text-neutral-800 dark:text-neutral-200',
            )}
          >
            {streamingContent ? (
              <MarkdownRenderer
                content={streamingContent}
                isStreaming={true}
                onIngestConfirm={onIngestConfirm}
                onIngestCancel={onIngestCancel}
              />
            ) : (
              <TypingIndicator />
            )}
          </div>
        </motion.div>
      )}

      {/* Scroll anchor */}
      <div ref={endRef} />
    </div>
  )
}

// ─── Copy button (hover to show) ────────────────────────────────────

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    // Strip [[atom:...]] markers for clean copy
    const clean = content
      .replace(/\[\[atom:[^\]]*\]\]/g, '')
      .replace(/\[\[ingest:confirm\|[^\]]*\]\]/g, '')
      .trim()
    await navigator.clipboard.writeText(clean)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'absolute -bottom-3 right-2',
        'opacity-0 group-hover/msg:opacity-100',
        'p-1 rounded-md',
        'bg-white dark:bg-neutral-800',
        'border border-neutral-200/60 dark:border-white/10',
        'shadow-sm',
        'text-neutral-400 dark:text-neutral-500',
        'hover:text-neutral-600 dark:hover:text-neutral-300',
        'transition-all duration-150',
        'z-10',
      )}
      title={copied ? '已复制' : '复制'}
    >
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  )
}
