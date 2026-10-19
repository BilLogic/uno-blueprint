import { z } from 'zod'
import { arg, defineTool } from '@/lib/agent/tools/definition'
import { describeChange, sessionSnapshot } from '@/lib/authoringSession'

/**
 * The conversation's own history: past sessions, one transcript, and this
 * browser session's ledger. None of it lives in the database — the session
 * store is the browser's — so the no-database trial serves the same
 * implementation the live app does.
 */

export const listSessionsTool = defineTool({
  name: 'list_sessions',
  description:
    'Past chat sessions on this blueprint — titles, dates, edit counts, ids. Use when the user refers to something discussed earlier ("like we said last time"). Shows exactly the sessions the session switcher shows.',
  surface: 'read',
  args: z.object({}),
  browserBacked: true,
  availability: { sample: true, mobile: true },
  run: async (_args, ctx) => ctx.history.listSessions(ctx.session.id),
})

export const getSessionTool = defineTool({
  name: 'get_session',
  description:
    'One past session\'s transcript, oldest turn first. Read after list_sessions when you need what was actually said, not just that a session exists.',
  surface: 'read',
  args: z.object({
    session_id: arg.text('Session id from list_sessions'),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ session_id }, ctx) => ctx.history.getSession(session_id),
})

export const getChangeHistoryTool = defineTool({
  name: 'get_change_history',
  description:
    'This session\'s edit history — every change made in this browser session (human and agent), newest first. When reporting it, distinguish user edits from agent edits and remind the user rows are revertible from the change sheet.',
  surface: 'read',
  args: z.object({
    limit: arg.number('Max entries (default 30)').optional(),
  }),
  // The ledger is browser state, but the trial cannot write and so has no
  // history to show; it has never been offered this read.
  browserBacked: true,
  availability: { sample: false, mobile: true },
  run: async ({ limit }, ctx) => {
    const cap = typeof limit === 'number' && limit > 0 ? limit : 30
    const entries = [...sessionSnapshot()].reverse().slice(0, cap)
    if (entries.length === 0) return 'No changes recorded in this browser session yet.'
    return entries
      .map((entry) => {
        const who =
          entry.author === 'agent'
            ? `agent${entry.agentSessionId === ctx.session.id ? ' (this session)' : ''}`
            : 'user'
        const when = new Date(entry.at).toISOString().slice(11, 19)
        return `[${when} UTC] ${who}: ${describeChange(entry)}${entry.revert ? '' : ' (not revertible)'}`
      })
      .join('\n')
  },
})
