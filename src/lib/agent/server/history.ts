import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { TranscriptEvent } from '@/lib/agent/loop'
import { renderTranscriptLine } from '@/lib/agent/tools/transcriptText'

export async function listServerSessions(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.from('agent_sessions').select('id, title, updated_at').order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data?.length ? data.map(row => `"${row.title}" — updated ${row.updated_at} (${row.id})`).join('\n') : 'No past sessions.'
}

export async function readServerChanges(client: SupabaseClient<Database>, limit = 30): Promise<string> {
  const cap = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 30
  const { data, error } = await client.from('authoring_changes')
    .select('id, fn, args, author, author_id, agent_session_id, at').order('at', { ascending: false }).limit(cap)
  if (error) throw new Error(error.message)
  return data?.length ? `Durable audit history (these rows are not replayable undo):\n${JSON.stringify(data)}` : 'No changes recorded yet.'
}

/** The caller's RLS applies to both the session and its messages. */
export async function readServerSession(client: SupabaseClient<Database>, id: string): Promise<string> {
  const session = await client.from('agent_sessions').select('id, title').eq('id', id).maybeSingle()
  if (session.error) throw new Error(session.error.message)
  if (!session.data) return `No session with id ${id}.`
  const messages = await client.from('agent_messages').select('payload').eq('session_id', id).order('seq')
  if (messages.error) throw new Error(messages.error.message)
  const lines = (messages.data ?? []).map(row => renderTranscriptLine(row.payload as unknown as TranscriptEvent))
  return [`Session "${session.data.title}" (${id}):`, ...lines].join('\n')
}
