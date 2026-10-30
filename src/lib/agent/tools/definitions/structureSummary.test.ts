import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { runTool, toolSpec } from '@/lib/agent/tools/definition'
import { createStepTool, createScenarioTool } from './journey'
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

it.each([true, false])('an established confirmation value %s survives dispatch', async confirmed => {
  const claims: unknown[] = []
  const client = { rpc: async (_fn: string, args: Record<string, unknown>) => {
    claims.push(args.p_confirmed)
    return { data: { outcome: args.p_confirmed ? 'applied' : 'proposed' }, error: null }
  } } as unknown as SupabaseClient<Database>
  await runTool(createStepTool, { path_id: 'path', name: 'Arrival', confirmed: !confirmed }, fakeToolContext({ client, confirmed }))
  expect(claims).toEqual([confirmed])
})

it.each([undefined, ['Arrive', 'Choose']])('a canvas scenario uses the structure gateway with initial names %j', async step_names => {
  const calls: unknown[] = []
  const client = { rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, ...args })
    return { data: { outcome: 'applied' }, error: null }
  } } as unknown as SupabaseClient<Database>
  const args = { phase_id: 'phase', name: 'Arrival', ...(step_names ? { step_names } : {}) }
  await runTool(createScenarioTool, { ...args, confirmed: true }, fakeToolContext({ client }))
  expect(calls).toEqual([expect.objectContaining({ fn: 'run_agent_tool', p_tool: 'create_scenario', p_args: args, p_confirmed: true })])
})
