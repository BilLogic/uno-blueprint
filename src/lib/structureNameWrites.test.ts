import { afterEach, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { renameLane, renameStepName } from './authoringRpc'
import {
  clearSession,
  recordChange,
  subscribeToSession,
  describeChange,
  sessionSnapshot,
} from './authoringSession'
import { executeRevert } from './revertChange'

afterEach(clearSession)

for (const kind of ['lane', 'step'] as const) {
  it(`records a ${kind} rename in the change sheet and restores its captured name`, async () => {
    clearSession()
    let saved = 'Review'
    const receipt={name:'Review',[`${kind}_id`]:kind,summary:null,rows:[],after:{name:'Decision'}}
    const client = {
      rpc: vi.fn(async (fn: string, args: { new_name: string; snapshot?:{name:string} }) => {
        saved = fn.startsWith('restore_') ? args.snapshot!.name : args.new_name
        return { data: receipt, error: null }
      }),
    } as unknown as SupabaseClient<Database>
    if (kind === 'step')
      await renameStepName(client, {
        stepId: 'step',
        name: 'Decision',
      })
    else
      await renameLane(client, {
        laneId: 'lane',
        name: 'Decision',
      })
    expect(saved).toBe('Decision')
    const [entry] = sessionSnapshot()
    expect(describeChange(entry)).toContain(`Renamed a ${kind}`)
    expect(entry.revert).toEqual({
      fn: `restore_${kind}_details`,
      args: {snapshot:receipt},
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
  expect(await createStepWithDetails(client,{pathId:'one',name:'Review',summary:'Check the request.',pathOrders:{one:['new','start'],two:['new']}})).toMatchObject({id:'created'})
  expect(rpc).toHaveBeenCalledExactlyOnceWith('add_step_with_details',{path_id:'one',name:'Review',summary:'Check the request.',path_orders:{one:['new','start'],two:['new']}})
  const [entry] = sessionSnapshot()
  expect(entry.revert).toEqual({fn:'undo_structure_add',args:{snapshot}})
  await executeRevert(client,entry)
  expect(rpc).toHaveBeenLastCalledWith('undo_structure_add',{snapshot})
})

for (const kind of ['step','lane'] as const) {
  it(`saves a ${kind} name and properties as one session change with one complete inverse`, async () => {
    const api=await import('./authoringRpc')
    const previous=kind==='step' ? {step_id:'step',name:'Start',summary:'Old summary'} : {lane_id:'lane',name:'Actor',rows:[{id:'lane',owner_team:'Old team',stakeholder_id:null,kpis:[],tools:[]}]}
    const rpc=vi.fn(async()=>({data:previous,error:null}))
    const client={rpc} as unknown as SupabaseClient<Database>
    if(kind==='step')await api.updateStepWithDetails(client,{stepId:'step',name:'Review',summary:'New summary'})
    else await api.updateLaneWithDetails(client,{laneId:'lane',laneIds:['lane'],name:'Reviewer',ownerTeam:'New team',stakeholderId:null,kpis:[],tools:[]})
    expect(rpc).toHaveBeenCalledTimes(1)
    const entries=sessionSnapshot()
    expect(entries).toHaveLength(1)
    expect(entries[0].revert).toEqual({fn:`restore_${kind}_details`,args:{snapshot:previous}})
    await executeRevert(client,entries[0])
    expect(rpc).toHaveBeenLastCalledWith(`restore_${kind}_details`,{snapshot:previous})
  })
}

for (const kind of ['step', 'lane'] as const) {
  it(`captures the ${kind} order returned by one write and undoes that exact snapshot`, async () => {
    const api = await import('./authoringRpc')
    const snapshot = {kind,path_id:'path',before:[{id:'first',position:4},{id:'last',position:9}],after:[{id:'last',position:0},{id:'first',position:1}]}
    const rpc = vi.fn(async () => ({data:snapshot,error:null}))
    const client = {rpc} as unknown as SupabaseClient<Database>
    await (kind === 'step' ? api.reorderSteps : api.reorderLanes)(client,'path',['last','first'],['first','last'])
    expect(rpc).toHaveBeenCalledExactlyOnceWith(`reorder_${kind}s`,{path_id:'path',[`${kind}_ids`]:['last','first'],expected_ids:['first','last']})
    const [entry] = sessionSnapshot()
    expect(entry.revert).toEqual({fn:'undo_structure_order',args:{snapshot}})
    await executeRevert(client,entry)
    expect(rpc).toHaveBeenLastCalledWith('undo_structure_order',{snapshot})
  })
}

it('returns its own recorded entry even when a subscriber appends another write before the caller resumes',async()=>{
 const {createStepWithDetails}=await import('./authoringRpc')
 const snapshot={kind:'step',ids:['created'],before:{one:[]},after:{one:[{id:'created',position:0}]}}
 const client={rpc:vi.fn(async()=>({data:snapshot,error:null}))} as unknown as SupabaseClient<Database>
 let interleaved=false
 const dispose=subscribeToSession(()=>{if(!interleaved){interleaved=true;recordChange('rename_step_name',{step_id:'other',new_name:'Other write'})}})
 try {
  const result=await createStepWithDetails(client,{pathId:'one',name:'Review',summary:'',pathOrders:{one:['new']}})
  expect(sessionSnapshot()).toHaveLength(2)
  expect(result.entry).toBe(sessionSnapshot()[0])
  expect(result.entry).not.toBe(sessionSnapshot().at(-1))
 }finally{dispose()}
})

it('records one membership change and sends only its server receipt to Undo', async () => {
  const {changeStepPath} = await import('./authoringRpc')
  const rpc=vi.fn(async()=>({data:{receipt_id:'server-receipt',step_id:'review',path_id:'phone',present:true},error:null}))
  const client={rpc} as unknown as SupabaseClient<Database>
  const own=await changeStepPath(client,{stepId:'review',pathId:'phone',present:true,atPosition:1,expectedIds:['start','finish'],expectedPathIds:['online']})
  expect(rpc).toHaveBeenCalledExactlyOnceWith('change_step_path',{step_id:'review',path_id:'phone',present:true,at_position:1,expected_ids:['start','finish'],expected_path_ids:['online'],confirmed_cells:null})
  expect(sessionSnapshot()).toEqual([own])
  recordChange('rename_path',{})
  await executeRevert(client,own)
  expect(rpc).toHaveBeenLastCalledWith('undo_step_path_change',{receipt_id:'server-receipt'})
})
