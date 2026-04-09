/**
 * V2.x · MarkdownRenderer — handles [[atom:id|label]] and [[ingest:confirm|json]]
 * protocol parsing + Streamdown rendering.
 *
 * Strategy:
 * 1. Pre-process content to find completed [[atom:id|label]] patterns.
 *    Replace them with `@@atom:id:label@@` (inline code markers).
 * 2. Extract [[ingest:confirm|{json}]] blocks — render them as a separate
 *    IngestConfirmCard below the Streamdown output.
 * 3. Use Streamdown's `components` prop to override `code` renderer,
 *    detecting @@atom: prefix to render AtomChip instead.
 * 4. During streaming, incomplete [[ markers are hidden (not rendered as raw text).
 */

import { useMemo, useCallback } from 'react'
import { Streamdown } from 'streamdown'
import type { Components } from 'streamdown'
import { AtomChip } from './AtomChip'
import { IngestConfirmCard } from './IngestConfirmCard'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
  onIngestConfirm?: (data: Record<string, unknown>) => void
  onIngestCancel?: () => void
}

// ─── Parsing helpers ─────────────────────────────────────────────────

// Matches both [[atom:id|label]] and [[atom:id]] (label-less, used by mentor mode)
const ATOM_PATTERN = /\[\[atom:([^\]|]+?)(?:\|([^\]]+))?\]\]/g
const INGEST_PATTERN = /\[\[ingest:confirm\|(\{[\s\S]*?\})\]\]/g
// Incomplete marker at the end of streaming content
const INCOMPLETE_MARKER = /\[\[[^\]]*$/

interface ParsedContent {
  /** Markdown with atom markers replaced for Streamdown */
  markdown: string
  /** Extracted ingest confirm data blocks */
  ingestBlocks: Array<Record<string, unknown>>
}

function parseContent(raw: string, isStreaming: boolean): ParsedContent {
  let markdown = raw
  const ingestBlocks: Array<Record<string, unknown>> = []

  // Extract ingest blocks (always at end of message)
  markdown = markdown.replace(INGEST_PATTERN, (_match, jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr)
      ingestBlocks.push(parsed)
    } catch {
      // If JSON is invalid, leave it as-is during streaming
      if (!isStreaming) return _match
    }
    return ''
  })

  // Replace atom references with inline code markers
  // Using backtick-wrapped markers so Streamdown treats them as inline code
  // Handles both [[atom:id|label]] and [[atom:id]] (label defaults to id with readable formatting)
  markdown = markdown.replace(ATOM_PATTERN, (_match, id, label) => {
    const displayLabel = label || id.replace(/^atom_/, '').replace(/[-_]/g, ' ')
    return `\`@@atom:${id}:${displayLabel}@@\``
  })

  // During streaming, hide any incomplete [[ marker at the end
  if (isStreaming) {
    markdown = markdown.replace(INCOMPLETE_MARKER, '')
  }

  return { markdown, ingestBlocks }
}

// ─── Custom code component for Streamdown ────────────────────────────

function CustomCode(props: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
  const { children, className, node: _node, ...rest } = props
  const text = typeof children === 'string' ? children : ''

  // Check for our atom chip marker
  if (text.startsWith('@@atom:') && text.endsWith('@@')) {
    const inner = text.slice(7, -2) // strip @@atom: and @@
    const colonIdx = inner.indexOf(':')
    if (colonIdx > 0) {
      const atomId = inner.slice(0, colonIdx)
      const label = inner.slice(colonIdx + 1)
      return <AtomChip atomId={atomId} label={label} />
    }
  }

  // Check if this is a code block (has language class) vs inline code
  const isBlock = className?.includes('language-')

  if (isBlock) {
    // Let Streamdown handle code blocks normally
    return <code className={className} {...rest}>{children}</code>
  }

  // Regular inline code
  return (
    <code
      className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-white/8 text-[0.85em] font-mono text-violet-600 dark:text-violet-400"
      {...rest}
    >
      {children}
    </code>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export function MarkdownRenderer({
  content,
  isStreaming,
  onIngestConfirm,
  onIngestCancel,
}: MarkdownRendererProps) {
  const { markdown, ingestBlocks } = useMemo(
    () => parseContent(content, !!isStreaming),
    [content, isStreaming],
  )

  const components: Components = useMemo(
    () => ({
      code: CustomCode as Components['code'],
    }),
    [],
  )

  const handleConfirm = useCallback(
    (data: Record<string, unknown>) => {
      onIngestConfirm?.(data)
    },
    [onIngestConfirm],
  )

  return (
    <div className="markdown-renderer">
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        components={components}
      >
        {markdown}
      </Streamdown>

      {/* Ingest confirmation cards (rendered outside Streamdown) */}
      {ingestBlocks.map((data, i) => (
        <div key={i} className="mt-3">
          <IngestConfirmCard
            data={data as IngestConfirmCard_Data}
            onConfirm={() => handleConfirm(data)}
            onCancel={() => onIngestCancel?.()}
          />
        </div>
      ))}
    </div>
  )
}

// Helper type alias to match IngestConfirmCard's expected props
type IngestConfirmCard_Data = {
  name: string
  insight: string
  sourceContext?: string
  role?: string
  situation?: string
  activity?: string
  insight_type?: string
  tags?: string[]
  confidence?: number
}
