import { afterEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { renameLane, renameStep } from './authoringRpc'
import {
  clearSession,
  describeChange,
  sessionSnapshot,
} from './authoringSession'
import { executeRevert } from './revertChange'

afterEach(clearSession)

for (const kind of ['lane', 'step'] as const) {
  it(`records a ${kind} rename in the change sheet and restores its captured name`, async () => {
    clearSession()
    let saved = 'Review'
    const client = {
      rpc: vi.fn(async (_fn: string, args: { new_name: string }) => {
        saved = args.new_name
        return { data: null, error: null }
      }),
    } as unknown as SupabaseClient<Database>
    if (kind === 'step')
      await renameStep(client, {
        stepId: 'step',
        name: 'Decision',
        previousName: saved,
      })
    else
      await renameLane(client, {
        laneId: 'lane',
        name: 'Decision',
        previousName: saved,
      })
    expect(saved).toBe('Decision')
    const [entry] = sessionSnapshot()
    expect(describeChange(entry)).toContain(`Renamed a ${kind}`)
    expect(entry.revert).toEqual({
      fn: `rename_${kind}`,
      args: { [`${kind}_id`]: kind, new_name: 'Review' },
    })
    await executeRevert(client, entry)
    expect(saved).toBe('Review')
  })
}

it('creates a step with complete path orders and reverts the captured database snapshot once', async () => {
  const { createStepWithDetails } = await import('./authoringRpc')
  const snapshot = {kind:'step',ids:['created'],before:{one:[{id:'start',position:4}],two:[]},after:{one:[{id:'created',position:0},{id:'start',position:1}],two:[{id:'created',position:0}]}}
  const rpc = vi.fn(async () => ({data:snapshot,error:null}))
  const client = {rpc} as unknown as SupabaseClient<Database>
  expect(await createStepWithDetails(client,{pathId:'one',name:'Review',summary:'Check the request.',frames:[],pathOrders:{one:['new','start'],two:['new']}})).toBe('created')
  expect(rpc).toHaveBeenCalledExactlyOnceWith('add_step_with_details',{path_id:'one',name:'Review',summary:'Check the request.',frames:[],path_orders:{one:['new','start'],two:['new']}})
  const [entry] = sessionSnapshot()
  expect(entry.revert).toEqual({fn:'undo_structure_add',args:{snapshot}})
  await executeRevert(client,entry)
  expect(rpc).toHaveBeenLastCalledWith('undo_structure_add',{snapshot})
})
