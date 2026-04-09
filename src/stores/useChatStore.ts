/**
 * V2.x · Chat session management store (Zustand, no persist).
 *
 * All session data lives on disk via chatApi — this store is a
 * runtime cache that loads from / writes through to the data API.
 */

import { create } from 'zustand'
import { chatApi } from '@/lib/dataApi'
import type {
  ChatSession,
  ChatSessionIndexEntry,
  ChatMessageRecord,
  ChatAttachment,
} from '@/types'

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface ChatState {
  // Session management
  sessions: ChatSessionIndexEntry[]
  currentSessionId: string | null
  currentSession: ChatSession | null

  // UI state
  isStreaming: boolean
  streamingContent: string // accumulated tokens during streaming

  // Model override per session
  sessionModelId: string | null // null = use default from settings

  // Actions
  loadSessions: () => Promise<void>
  createSession: () => Promise<string>
  switchSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>

  // Message management
  addUserMessage: (content: string, attachments?: ChatAttachment[]) => Promise<void>
  startStreaming: () => void
  appendStreamToken: (token: string) => void
  completeStreaming: (fullContent: string, metadata?: ChatMessageRecord['metadata']) => Promise<void>
  cancelStreaming: () => void

  // Session summary
  updateSummary: (summary: string) => Promise<void>

  // Model selection
  setSessionModel: (modelId: string | null) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an index entry from a full session object. */
function toIndexEntry(session: ChatSession): ChatSessionIndexEntry {
  const lastMsg = session.messages[session.messages.length - 1]
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    preview: lastMsg ? lastMsg.content.slice(0, 80) : '',
  }
}

/** Auto-generate title from the first user message (first 30 chars). */
function autoTitle(content: string): string {
  const trimmed = content.trim().replace(/\n+/g, ' ')
  return trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentSession: null,

  isStreaming: false,
  streamingContent: '',

  sessionModelId: null,

  // ─── Session management ───────────────────────────────────────────

  loadSessions: async () => {
    const index = await chatApi.listSessions()
    set({ sessions: index.sessions })
  },

  createSession: async () => {
    const session = await chatApi.createSession({ title: '新对话' })
    set((s) => ({
      sessions: [toIndexEntry(session), ...s.sessions],
      currentSessionId: session.id,
      currentSession: session,
    }))
    return session.id
  },

  switchSession: async (id) => {
    const session = await chatApi.getSession(id)
    set({
      currentSessionId: session.id,
      currentSession: session,
    })
  },

  deleteSession: async (id) => {
    await chatApi.deleteSession(id)
    const { sessions, currentSessionId } = get()
    const remaining = sessions.filter((s) => s.id !== id)
    const wasCurrent = currentSessionId === id
    if (wasCurrent && remaining.length > 0) {
      // Switch to the first remaining session
      const next = await chatApi.getSession(remaining[0].id)
      set({
        sessions: remaining,
        currentSessionId: next.id,
        currentSession: next,
      })
    } else if (wasCurrent) {
      set({
        sessions: remaining,
        currentSessionId: null,
        currentSession: null,
      })
    } else {
      set({ sessions: remaining })
    }
  },

  renameSession: async (id, title) => {
    await chatApi.updateSession(id, { title })
    set((s) => ({
      sessions: s.sessions.map((e) => (e.id === id ? { ...e, title } : e)),
      currentSession:
        s.currentSession && s.currentSession.id === id
          ? { ...s.currentSession, title }
          : s.currentSession,
    }))
  },

  // ─── Message management ───────────────────────────────────────────

  addUserMessage: async (content, attachments) => {
    const { currentSession, currentSessionId } = get()
    if (!currentSession || !currentSessionId) return

    const msg: ChatMessageRecord = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      ...(attachments?.length ? { attachments } : {}),
    }

    const now = new Date().toISOString()
    const isFirstMessage = currentSession.messages.length === 0
    const updatedTitle = isFirstMessage ? autoTitle(content) : currentSession.title

    const updatedSession: ChatSession = {
      ...currentSession,
      title: updatedTitle,
      updatedAt: now,
      messages: [...currentSession.messages, msg],
    }

    // Persist
    await chatApi.updateSession(currentSessionId, updatedSession)

    // Update store
    const entry = toIndexEntry(updatedSession)
    set((s) => ({
      currentSession: updatedSession,
      sessions: s.sessions.map((e) => (e.id === currentSessionId ? entry : e)),
    }))
  },

  startStreaming: () => {
    set({ isStreaming: true, streamingContent: '' })
  },

  appendStreamToken: (token) => {
    set((s) => ({ streamingContent: s.streamingContent + token }))
  },

  completeStreaming: async (fullContent, metadata) => {
    const { currentSession, currentSessionId } = get()
    if (!currentSession || !currentSessionId) return

    const msg: ChatMessageRecord = {
      id: `msg_${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      timestamp: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
    }

    const now = new Date().toISOString()
    const updatedSession: ChatSession = {
      ...currentSession,
      updatedAt: now,
      messages: [...currentSession.messages, msg],
    }

    // Persist
    await chatApi.updateSession(currentSessionId, updatedSession)

    // Update store
    const entry = toIndexEntry(updatedSession)
    set((s) => ({
      currentSession: updatedSession,
      isStreaming: false,
      streamingContent: '',
      sessions: s.sessions.map((e) => (e.id === currentSessionId ? entry : e)),
    }))
  },

  cancelStreaming: () => {
    set({ isStreaming: false, streamingContent: '' })
  },

  // ─── Session summary ──────────────────────────────────────────────

  updateSummary: async (summary) => {
    const { currentSession, currentSessionId } = get()
    if (!currentSession || !currentSessionId) return

    const updatedSession: ChatSession = { ...currentSession, summary }
    await chatApi.updateSession(currentSessionId, { summary })

    set({ currentSession: updatedSession })
  },

  // ─── Model selection ──────────────────────────────────────────────

  setSessionModel: (modelId) => {
    set({ sessionModelId: modelId })
  },
}))
