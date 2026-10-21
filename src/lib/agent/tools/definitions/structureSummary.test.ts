import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { runTool, toolSpec } from '@/lib/agent/tools/definition'
import { createStepTool } from './journey'
import { fakeToolContext } from './testContext'

it('a canvas step with a summary is proposed until its caller confirms', async () => {
  const rows: unknown[] = []
  const client = { rpc: async (_fn: string, args: Record<string, unknown>) => {
    if (args.p_confirmed === true) rows.push(args.p_args)
    return { data: { outcome: args.p_confirmed === true ? 'applied' : 'proposed' }, error: null }
  } } as unknown as SupabaseClient<Database>
  const ctx = fakeToolContext({ client })
  const args = { path_id: 'path', name: 'Arrival', summary: 'The person chooses how to receive support.' }
  expect(JSON.parse(await runTool(createStepTool, args, ctx)).outcome).toBe('proposed')
  expect(rows).toEqual([])
  expect(JSON.parse(await runTool(createStepTool, { ...args, confirmed: true }, ctx)).outcome).toBe('applied')
  expect(rows).toEqual([args])
  expect(toolSpec(createStepTool).parameters.properties).toHaveProperty('confirmed')
})
