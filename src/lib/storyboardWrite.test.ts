import { beforeEach, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { readCellStoryboard, updateCellStoryboard } from './authoringRpc'
import { clearSession, sessionSnapshot } from './authoringSession'
import { executeRevert } from './revertChange'
import type { Database } from '@/types/database'
const id = '11111111-1111-4111-8111-111111111111'
const receipt = '22222222-2222-4222-8222-222222222222'
const state = {
  cell_id: id,
  path_id: id,
  lane_id: id,
  step_id: id,
  content: 'Before',
  summary: null,
  frame: null,
  resources: [],
  placements: [],
}
beforeEach(clearSession)
it('one cell save returns its own change and Undo without borrowing a later change', async () => {
  const calls: string[] = []
  const client = createClient<Database>('https://example.supabase.co', 'key', {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const fn = String(input).split('/').pop()!
        calls.push(fn)
        return new Response(
          JSON.stringify(
            fn === 'record_authoring_change'
              ? receipt
              : fn === 'read_cell_storyboard'
              ? state
              : fn === 'update_cell_storyboard'
              ? {
                  cell_id: id,
                  receipt_id: receipt,
                  before: state,
                  after: {
                    ...state,
                    content: 'After',
                    summary: 'Summary',
                    frame: '/image.png',
                  },
                }
              : null,
          ),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  })
  const expected = await readCellStoryboard(client, id)
  const entry = await updateCellStoryboard(client, {
    cellId: id,
    content: 'After',
    summary: 'Summary',
    frame: '/image.png',
    expected,
    attachments: [],
  })
  expect(sessionSnapshot()).toEqual([entry])
  await executeRevert(client, entry)
  expect(calls).toEqual([
    'read_cell_storyboard',
    'update_cell_storyboard',
    'record_authoring_change',
    'restore_cell_storyboard',
  ])
})
it('a landed edit whose durable record fails retains its exact inverse and reports a partial write', async () => {
  const client = createClient<Database>('https://example.supabase.co', 'key', {
    auth: { persistSession: false },
    global: {
      fetch: async (input) =>
        new Response(
          JSON.stringify(
            String(input).endsWith('/record_authoring_change')
              ? { message: 'log unavailable' }
              : {
                  cell_id: id,
                  receipt_id: receipt,
                  before: state,
                  after: {
                    ...state,
                    content: 'After',
                    summary: null,
                    frame: null,
                  },
                },
          ),
          {
            status: String(input).endsWith('/record_authoring_change')
              ? 500
              : 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
    },
  })
  await expect(
    updateCellStoryboard(client, {
      cellId: id,
      content: 'After',
      summary: '',
      frame: null,
      expected: state,
      attachments: [],
    }),
  ).rejects.toMatchObject({
    name: 'PartialAuthoringWriteError',
    entry: {
      fn: 'update_cell_storyboard',
      revert: {
        fn: 'restore_cell_storyboard',
        args: { p_receipt_id: receipt },
      },
    },
  })
  expect(sessionSnapshot()).toHaveLength(1)
})
