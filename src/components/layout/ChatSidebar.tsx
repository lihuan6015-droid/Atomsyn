/**
 * V2.x · Chat sidebar with session management.
 *
 * Uses ChatSessionList component with useChatStore for data.
 */

import { useEffect } from 'react'
import { useChatStore } from '@/stores/useChatStore'
import { ChatSessionList } from '@/components/chat/ChatSessionList'

export function ChatSidebar() {
  const {
    sessions,
    currentSessionId,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    renameSession,
  } = useChatStore()

  // Load sessions on mount
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  return (
    <div className="h-full overflow-hidden">
      <ChatSessionList
        sessions={sessions}
        currentId={currentSessionId}
        onSelect={switchSession}
        onCreate={createSession}
        onDelete={deleteSession}
        onRename={renameSession}
      />
    </div>
  )
}
