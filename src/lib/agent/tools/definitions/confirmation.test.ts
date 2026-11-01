import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { runTool, toolSpec } from '@/lib/agent/tools/definition'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { fakeToolContext } from './testContext'

it.each(['create_service', 'create_scenario', 'update_phase', 'update_scenario', 'update_step', 'update_lane'])(
  'the canvas records a proposal until its caller confirms %s', async name => {
    const rows: unknown[] = []
    const client = { rpc: async (_fn: string, args: Record<string, unknown>) => {
      if (args.p_confirmed === true) rows.push(args.p_args)
      return { data: { outcome: args.p_confirmed === true ? 'applied' : 'proposed', message: 'A person who may approve must review and approve it.' }, error: null }
    } } as unknown as SupabaseClient<Database>
    const tool = findToolDefinition(name)!
    const args = { name: 'Arrival', phase_id: 'phase', scenario_id: 'scenario', step_id: 'step', lane_id: 'lane' }
    const ctx = fakeToolContext({ client })
    expect(JSON.parse(await runTool(tool, args, ctx))).toMatchObject({ outcome: 'proposed', message: expect.stringContaining('approve') })
    expect(rows).toEqual([])
    expect(JSON.parse(await runTool(tool, { ...args, confirmed: true }, ctx))).toMatchObject({ outcome: 'applied' })
    expect(rows).toHaveLength(1)
    expect(toolSpec(tool).parameters.properties).toHaveProperty('confirmed')
  },
)
