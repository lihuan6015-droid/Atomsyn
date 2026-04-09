/**
 * V2.x Chat Module · Memory manager.
 *
 * Handles automatic memory extraction from conversation turns and
 * deduplication of stored memories.
 */

import { chatApi } from '@/lib/dataApi'
import { callChat, type ModelConfigLike, type ChatMessage } from '@/lib/chatLlmClient'
import type { MemoryEntry } from '@/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT =
  'Given this conversation turn, extract any user preferences or key decisions worth remembering long-term. ' +
  'Return JSON array: [{type: "preference"|"decision", content: "one-liner"}]. ' +
  'Return [] if nothing worth remembering.'

// ---------------------------------------------------------------------------
// Memory extraction
// ---------------------------------------------------------------------------

/**
 * Analyze a single conversation turn and persist any extracted user
 * preferences or decisions to the memory store.
 *
 * This runs in the background after each assistant reply.
 * All errors are silently caught — memory extraction must never break chat.
 */
export async function extractMemories(
  userMessage: string,
  aiResponse: string,
  sessionId: string,
  modelConfig: ModelConfigLike,
  apiKey: string,
): Promise<void> {
  try {
    const messages: ChatMessage[] = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse },
    ]

    const raw = await callChat({
      messages,
      systemPrompt: EXTRACTION_PROMPT,
      modelConfig,
      apiKey,
      maxTokens: 256,
      temperature: 0,
    })

    // Parse the JSON array from the response
    const trimmed = raw.trim()
    // Handle cases where the model wraps in markdown code fences
    const jsonStr = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      : trimmed

    let entries: Array<{ type: string; content: string }>
    try {
      entries = JSON.parse(jsonStr)
    } catch {
      // Model didn't return valid JSON — nothing to save
      return
    }

    if (!Array.isArray(entries) || entries.length === 0) return

    // Persist each extracted memory
    for (const entry of entries) {
      const type = entry.type === 'decision' ? 'decision' : 'preference'
      if (!entry.content?.trim()) continue

      await chatApi.addMemory({
        type,
        content: entry.content.trim(),
        source: 'auto',
        sessionId,
      })
    }
  } catch {
    // Silently swallow — memory extraction must never break the chat flow
  }
}

// ---------------------------------------------------------------------------
// Memory loading + dedup
// ---------------------------------------------------------------------------

/**
 * Load all memories from the store and deduplicate by content.
 * When duplicates exist, the newer entry (later createdAt) is kept.
 */
export async function loadMemories(): Promise<MemoryEntry[]> {
  const all = await chatApi.getMemories()

  // Dedup: group by content, keep the one with the latest createdAt
  const seen = new Map<string, MemoryEntry>()
  for (const mem of all) {
    const existing = seen.get(mem.content)
    if (!existing || mem.createdAt > existing.createdAt) {
      seen.set(mem.content, mem)
    }
  }

  return Array.from(seen.values())
}
