/**
 * V2.x Chat Module · Context harness.
 *
 * Assembles the multi-layer system prompt and manages history trimming
 * for the chat module's context window.
 *
 * Strategy: Keep full history as long as possible. Only start trimming
 * when estimated token usage exceeds 40-50% of the model's max context.
 * This preserves important context for coaching/review conversations.
 *
 * Token estimation: ~1.5 chars per Chinese token, ~4 chars per English token.
 * We use a blended ratio of ~2.5 chars/token for mixed CJK+English content.
 */

import type {
  ChatMessageRecord,
  KnowledgeIndex,
  MemoryEntry,
} from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextOptions {
  /** Layer 1: SOUL.md content (persona / identity) */
  soul?: string
  /** Layer 2: AGENTS.md content (agent behavior rules) */
  agents?: string
  /** Layer 4: Knowledge index for atom snapshot injection */
  knowledgeIndex?: KnowledgeIndex | null
  /** Layer 5: User preferences & decisions from memory */
  memories?: MemoryEntry[]
  /** Compressed summary of earlier turns (after threshold) */
  sessionSummary?: string
  /** Current user message — reserved for future relevance matching */
  userMessage?: string
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/** Rough char-to-token ratio for mixed CJK+English content */
const CHARS_PER_TOKEN = 2.5

/** Estimate token count from a string */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Estimate total tokens for a message list */
export function estimateMessagesTokens(messages: ChatMessageRecord[]): number {
  let total = 0
  for (const m of messages) {
    total += estimateTokens(m.content)
    // Per-message overhead (role, formatting, etc.)
    total += 4
  }
  return total
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the full system prompt by layering context from multiple sources.
 *
 * Layer 1 — SOUL.md (identity / persona)
 * Layer 2 — AGENTS.md (behavioral rules)
 * Layer 3 — Skill index stub
 * Layer 4 — Knowledge snapshot (methodology + experience atoms)
 * Layer 5 — User memories
 * Layer 6 — Session summary (if any)
 */
export async function buildSystemPrompt(options: ContextOptions): Promise<string> {
  const sections: string[] = []

  // Layer 1: SOUL
  if (options.soul?.trim()) {
    sections.push(options.soul.trim())
  }

  // Layer 2: AGENTS
  if (options.agents?.trim()) {
    sections.push(options.agents.trim())
  }

  // Layer 3: Skill index (static for now)
  sections.push('## Available Skills\natomsyn-read, atomsyn-write, atomsyn-mentor')

  // Layer 4: Knowledge snapshot
  if (options.knowledgeIndex) {
    const ki = options.knowledgeIndex
    const knowledgeLines: string[] = ['## Knowledge Snapshot']

    // Top 15 methodology atoms
    if (ki.atoms?.length) {
      const top = ki.atoms.slice(0, 15)
      knowledgeLines.push('### Methodology Atoms')
      for (const a of top) {
        const tags = a.tags?.length ? ` [${a.tags.join(', ')}]` : ''
        knowledgeLines.push(`- ${a.id}: ${a.name}${tags}`)
      }
    }

    // Top 10 experience atoms
    if (ki.experiences?.length) {
      const top = ki.experiences.slice(0, 10)
      knowledgeLines.push('### Experience Atoms')
      for (const e of top) {
        const excerpt = e.insightExcerpt
          ? ` — ${e.insightExcerpt.slice(0, 80)}${e.insightExcerpt.length > 80 ? '...' : ''}`
          : ''
        knowledgeLines.push(`- ${e.id}: ${e.name}${excerpt}`)
      }
    }

    if (knowledgeLines.length > 1) {
      sections.push(knowledgeLines.join('\n'))
    }
  }

  // Layer 5: User memories
  if (options.memories?.length) {
    const memLines = ['## User Preferences & Decisions']
    for (const m of options.memories) {
      memLines.push(`- ${m.content}`)
    }
    sections.push(memLines.join('\n'))
  }

  // Layer 6: Session summary
  if (options.sessionSummary?.trim()) {
    sections.push(`## Earlier in this conversation\n${options.sessionSummary.trim()}`)
  }

  return sections.join('\n\n')
}

// ---------------------------------------------------------------------------
// Smart history trimming
// ---------------------------------------------------------------------------

/**
 * Trim conversation history based on model context window budget.
 *
 * Strategy:
 * 1. If total (system + history) < 45% of maxTokens → keep ALL messages full
 * 2. If 45-70% → keep last 6 messages full, truncate older ones to 300 chars
 * 3. If >70% → aggressive: keep last 3 full, truncate 4-8 to 200 chars, discard rest
 *
 * @param messages         Full message history (oldest first)
 * @param systemTokens     Estimated tokens used by system prompt
 * @param maxContextTokensK  Model's max context in K tokens (e.g. 128 = 128K)
 */
export function trimHistory(
  messages: ChatMessageRecord[],
  systemTokens: number = 0,
  maxContextTokensK: number = 128,
): ChatMessageRecord[] {
  if (messages.length === 0) return messages

  const maxTokens = maxContextTokensK * 1024
  const historyTokens = estimateMessagesTokens(messages)
  const totalTokens = systemTokens + historyTokens
  // Reserve ~30% for model's response
  const usableTokens = maxTokens * 0.7
  const usageRatio = totalTokens / usableTokens

  // Phase 1: Under 45% of usable budget → keep everything
  if (usageRatio < 0.45) {
    return messages
  }

  // Phase 2: 45-70% → light trim: keep last 6 full, truncate older to 300 chars
  if (usageRatio < 0.70) {
    return messages.map((msg, idx) => {
      const distFromEnd = messages.length - 1 - idx
      if (distFromEnd < 6) return msg
      if (msg.content.length > 300) {
        return { ...msg, content: msg.content.slice(0, 300) + '\n[... 内容已截断 ...]' }
      }
      return msg
    })
  }

  // Phase 3: 70-90% → moderate trim: keep last 4 full, truncate 5-10, discard rest
  if (usageRatio < 0.90) {
    const keepFull = 4
    const keepTruncated = 6
    const maxKeep = keepFull + keepTruncated

    if (messages.length <= keepFull) return messages

    const start = Math.max(0, messages.length - maxKeep)
    const kept = messages.slice(start)

    return kept.map((msg, idx) => {
      const distFromEnd = kept.length - 1 - idx
      if (distFromEnd < keepFull) return msg
      if (msg.content.length > 200) {
        return { ...msg, content: msg.content.slice(0, 200) + '\n[... 内容已截断 ...]' }
      }
      return msg
    })
  }

  // Phase 4: >90% → aggressive: keep last 3, truncate 4-6, discard rest
  const keepFull = 3
  const keepTruncated = 3
  const maxKeep = keepFull + keepTruncated

  const start = Math.max(0, messages.length - maxKeep)
  const kept = messages.slice(start)

  return kept.map((msg, idx) => {
    const distFromEnd = kept.length - 1 - idx
    if (distFromEnd < keepFull) return msg
    if (msg.content.length > 150) {
      return { ...msg, content: msg.content.slice(0, 150) + '\n[... 内容已截断 ...]' }
    }
    return msg
  })
}
