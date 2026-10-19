import { agentSessionsSnapshot } from '@/lib/agent/sessions'
import { loadPersistedEvents } from '@/lib/agent/persistence'
import { renderTranscriptLine } from '@/lib/agent/tools/transcriptText'

/**
 * Past conversations on this blueprint. Sourced from the session store the
 * switcher reads, never from `agent_sessions` — see `agentSessionsSnapshot`
 * for why that distinction is load-bearing. It needs no database, which is
 * also why the no-database trial can serve it unchanged.
 *
 * No `search_sessions` companion: the complete list is small enough to
 * return whole, and search exists for when complete is too big.
 */
export function listSessions(currentSessionId: string): string {
  const sessions = agentSessionsSnapshot()
  if (sessions.length === 0) return 'No past sessions.'
  return [...sessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((session) => {
      const mine = session.id === currentSessionId ? ' (this session)' : ''
      const edits =
        session.changeCount > 0 ? `, ${session.changeCount} edit(s)` : ''
      return `"${session.title}"${mine} — updated ${session.updatedAt.slice(0, 10)}${edits} (${session.id})`
    })
    .join('\n')
}

/** One past conversation's transcript, oldest turn first. */
export async function getSession(sessionId: string): Promise<string> {
  const known = agentSessionsSnapshot().find(
    (session) => session.id === sessionId,
  )
  const events = await loadPersistedEvents(sessionId)
  if (events === null) {
    return known
      ? `Session "${known.title}" is in the local list but its transcript is not persisted (persistence attaches only when signed in).`
      : `No session with id ${sessionId}.`
  }
  if (events.length === 0) return 'That session has no recorded turns.'
  const lines = events.map(renderTranscriptLine)
  const header = known
    ? `Session "${known.title}" (${sessionId}):`
    : `Session ${sessionId}:`
  return [header, ...lines].join('\n')
}
