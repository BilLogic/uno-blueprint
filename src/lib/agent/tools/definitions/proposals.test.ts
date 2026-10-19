import { beforeEach, expect, it, vi } from 'vitest'
import { runTool } from '@/lib/agent/tools/definition'
import { approveSuggestedChangeTool } from '@/lib/agent/tools/definitions/proposals'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { clearSession, describeChange, sessionSnapshot } from '@/lib/authoringSession'
import { appendToAuthoringLog } from '@/lib/authoringLog'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('@/lib/authoringLog', () => ({ appendToAuthoringLog: vi.fn() }))
beforeEach(() => { clearSession(); vi.clearAllMocks() })

it('a canvas approval gets a distinct session entry without duplicating its server audit row', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { cell_id: 'cell' }, error: null })
  const client = { rpc } as unknown as SupabaseClient<Database>
  await runTool(approveSuggestedChangeTool, { suggested_change_id: 'a0000000-0000-4000-8000-000000000001' }, fakeToolContext({ client }))
  expect(rpc).toHaveBeenCalledOnce()
  expect(sessionSnapshot()).toHaveLength(1)
  expect(describeChange(sessionSnapshot()[0])).toBe('Approved a suggested change')
  expect(sessionSnapshot()[0].revert).toBeUndefined()
  expect(appendToAuthoringLog).not.toHaveBeenCalled()
})
