import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { TranscriptEvent } from '@/lib/agent/loop'
import { renderTranscriptLine } from '@/lib/agent/tools/transcriptText'

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
