import { z } from 'zod'
import { arg, defineTool } from '@/lib/agent/tools/definition'

/**
 * The conversation's own history: past sessions, one transcript, and this
 * browser session's ledger. The host supplies the reads: browser stores for
 * the canvas, persisted rows under the caller's RLS for the server.
 */

export const listSessionsTool = defineTool({
  name: 'list_sessions',
  description:
    'Past chat sessions visible to this person — titles, dates and ids; the canvas also shows edit counts. Use when the user refers to something discussed earlier ("like we said last time"). Server reads are private to the signed-in caller; the canvas reads its session switcher.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
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
    'Recent human and agent changes, newest first. The server reads the durable business ledger across sessions; audit rows are not replayable undo. The canvas reads its current browser ledger; distinguish user edits from agent edits and remind the user rows are revertible from the change sheet.',
  surface: 'read',
  args: z.object({
    limit: arg.number('Max entries (default 30)').optional(),
  }),
  // The trial cannot write and has no history to show.
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ limit }, ctx) => ctx.history.getChanges(limit, ctx.session.id),
})
