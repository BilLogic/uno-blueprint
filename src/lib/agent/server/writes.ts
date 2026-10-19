import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

/** Refuse JWTs whose decoded top-level role is service_role, anywhere in the arguments. */
export function refuseSecrets(args: Record<string, unknown>): void {
  const text = JSON.stringify(args)
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{5,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{5,}/g)) {
    try {
      const payload = JSON.parse(atob(match[1].replaceAll('-', '+').replaceAll('_', '/')))
      if (payload?.role === 'service_role')
        throw new Error('Remove the secret from this call; keep service-role keys in the ignored environment file.')
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Remove the secret')) throw error
    }
  }
}

/** Explicitly named cell references, including a slide's nested cells. */
export function namedCells(args: unknown): Set<string> {
  const ids = new Set<string>()
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return
    for (const [key, held] of Object.entries(value)) {
      if (key === 'cell_id' || key.endsWith('_cell_id')) { if (typeof held === 'string') ids.add(held) }
      else if (key === 'cell_ids' || key === 'cells') {
        if (Array.isArray(held)) for (const id of held) if (typeof id === 'string') ids.add(id)
      } else if (typeof held === 'object') visit(held)
    }
  }
  visit(args)
  return ids
}

export async function executeServerWrite(client: SupabaseClient<Database>, name: string,
  args: Record<string, unknown>, options: { sessionId: string; serviceId?: string; confirmed: boolean }) {
  const { data, error } = await client.rpc('run_agent_tool', {
    p_tool: name, p_args: args as Json, p_session_id: options.sessionId,
    p_service_id: options.serviceId, p_confirmed: options.confirmed,
  })
  if (error) throw new Error(error.message)
  return JSON.stringify(data)
}
