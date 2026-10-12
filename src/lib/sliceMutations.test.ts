import { afterEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { AuthoringError } from '@/lib/authoringErrors'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { createSlice, replaceSlides } from '@/lib/sliceMutations'

/*
 * The two slice writes, through their own interface, against a client that
 * answers the slide read from a script and records every RPC. Each write is
 * one RPC — the function in the database is what makes it all-or-nothing —
 * and what this side still owns is the payload it sends, the ledger entry it
 * records from the reply, and the refusal it translates.
 */

type Rpc = { fn: string; args: Record<string, unknown> }

function fakeClient(options: {
  slides?: unknown[]
  rpc?: (fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }
}) {
  const rpcs: Rpc[] = []
  const tableWrites: string[] = []
  const builder = (table: string) => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then')
            return (onF: (v: unknown) => unknown) =>
              Promise.resolve({ data: table === 'slides' ? (options.slides ?? []) : [], error: null }).then(onF)
          return () => {
            if (prop === 'insert' || prop === 'delete' || prop === 'update') tableWrites.push(`${table}.${String(prop)}`)
            return proxy
          }
        },
      },
    )
    return proxy
  }
  const client = {
    from: builder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      return Promise.resolve(options.rpc ? options.rpc(fn, args) : { data: null, error: null })
    },
  } as unknown as SupabaseClient<Database>
  return { client, rpcs, tableWrites }
}

const refusal = { message: 'Slide 2 names a cell that is not an id (c-3) — nothing was written.', code: 'P0001', details: '', hint: '' }

afterEach(() => {
  clearSession()
})

describe('replacing a slice’s slides', () => {
  const prior = {
    id: 'slide-1',
    slice_id: 'sl-1',
    position: 0,
    cell_ids: ['c-1', 'c-2'],
    cell_keys: ['c-1', 'c-2'],
    title: 'Arrive',
    caption: null,
    shows_all_images: false,
    slide_images: [{ id: 'img-1', slide_id: 'slide-1', position: 0, cell_id: null, image_url: 'https://x/a.png' }],
  }

  it('is one RPC carrying every slide in order, the prior id and its image set, and no table write', async () => {
    const { client, rpcs, tableWrites } = fakeClient({
      slides: [prior],
      rpc: () => ({ data: { slice_id: 'sl-1', slide_count: 2, previous: [prior] }, error: null }),
    })

    await replaceSlides(client, 'sl-1', [
      { id: 'slide-1', cells: ['c-1', 'c-2'], title: ' Arrive ', caption: '' },
      { cells: ['c-3'], title: '', caption: 'Then' },
    ])

    expect(tableWrites).toEqual([])
    expect(rpcs).toEqual([
      {
        fn: 'replace_slides',
        args: {
          p_slice_id: 'sl-1',
          p_slides: [
            {
              id: 'slide-1',
              cell_ids: ['c-1', 'c-2'],
              cell_keys: ['c-1', 'c-2'],
              title: 'Arrive',
              caption: null,
              shows_all_images: false,
              images: [{ position: 0, cell_id: null, image_url: 'https://x/a.png' }],
            },
            { cell_ids: ['c-3'], cell_keys: ['c-3'], title: null, caption: 'Then', shows_all_images: true, images: [] },
          ],
        },
      },
    ])
  })

  it('records the slides the database says it removed as the inverse', async () => {
    const asStored = { ...prior, title: 'Arrive, as stored' }
    const { client } = fakeClient({
      slides: [prior],
      rpc: () => ({ data: { slice_id: 'sl-1', slide_count: 1, previous: [asStored] }, error: null }),
    })

    await replaceSlides(client, 'sl-1', [{ cells: ['c-9'], title: '', caption: '' }])

    expect(sessionSnapshot().map(({ fn, args, revert }) => ({ fn, args, revert }))).toEqual([
      {
        fn: 'replace_slides',
        args: { slice_id: 'sl-1', slide_count: 1 },
        revert: { fn: 'restore_slides', args: { slice_id: 'sl-1', rows: [asStored] } },
      },
    ])
  })

  it.each([
    ['no previous', { slice_id: 'sl-1', slide_count: 1 }],
    ['a previous that is not a list', { slice_id: 'sl-1', slide_count: 1, previous: {} }],
    ['a captured slide without an id', { slice_id: 'sl-1', slide_count: 1, previous: [{ position: 0 }] }],
  ])('refuses a reply with %s rather than record a change it cannot undo', async (_, reply) => {
    const { client } = fakeClient({ slides: [prior], rpc: () => ({ data: reply, error: null }) })

    const write = replaceSlides(client, 'sl-1', [{ cells: ['c-9'], title: '', caption: '' }])

    await expect(write).rejects.toBeInstanceOf(AuthoringError)
    await expect(write).rejects.toThrow(/could not be captured for undo/)
    expect(sessionSnapshot()).toEqual([])
  })

  it('translates a refusal and records nothing', async () => {
    const { client } = fakeClient({ slides: [prior], rpc: () => ({ data: null, error: refusal }) })

    const write = replaceSlides(client, 'sl-1', [{ cells: ['c-3'], title: '', caption: '' }])

    await expect(write).rejects.toBeInstanceOf(AuthoringError)
    await expect(write).rejects.toThrow(/Slide 2 names a cell that is not an id/)
    expect(sessionSnapshot()).toEqual([])
  })
})

describe('creating a slice', () => {
  const created = {
    id: 'sl-new',
    service_id: 'svc-1',
    title: 'Caller view',
    summary: null,
    kind: 'journey',
    actor: null,
    authorship: 'human',
  }

  it('is one RPC carrying the slice and one slide per cell, and no table write', async () => {
    const { client, rpcs, tableWrites } = fakeClient({ rpc: () => ({ data: created, error: null }) })

    const slice = await createSlice(client, {
      serviceId: 'svc-1',
      title: ' Caller view ',
      summary: '',
      sliceKind: 'journey',
      actor: '',
      cellIds: ['c-1', 'c-2'],
    })

    expect(slice).toEqual(created)
    expect(tableWrites).toEqual([])
    expect(rpcs).toEqual([
      {
        fn: 'create_slice',
        args: {
          p_service_id: 'svc-1',
          p_title: 'Caller view',
          p_summary: '',
          p_kind: 'journey',
          p_actor: '',
          p_slides: [
            { cell_ids: ['c-1'], cell_keys: ['c-1'], title: null, caption: null, shows_all_images: true, images: [] },
            { cell_ids: ['c-2'], cell_keys: ['c-2'], title: null, caption: null, shows_all_images: true, images: [] },
          ],
        },
      },
    ])
  })

  it('records one entry, inverted by deleting the slice', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: created, error: null }) })

    await createSlice(client, {
      serviceId: 'svc-1',
      title: 'Caller view',
      summary: '',
      sliceKind: 'journey',
      actor: '',
      cellIds: ['c-1'],
    })

    expect(sessionSnapshot().map(({ fn, args, revert }) => ({ fn, args, revert }))).toEqual([
      {
        fn: 'create_slice',
        args: { slice_id: 'sl-new', title: 'Caller view' },
        revert: { fn: 'delete_slice_row', args: { slice_id: 'sl-new' } },
      },
    ])
  })

  it('translates a refusal and records nothing', async () => {
    const { client } = fakeClient({ rpc: () => ({ data: null, error: refusal }) })

    const write = createSlice(client, {
      serviceId: 'svc-1',
      title: 'Half made',
      summary: '',
      sliceKind: 'journey',
      actor: '',
      cellIds: ['c-1', 'c-3'],
    })

    await expect(write).rejects.toBeInstanceOf(AuthoringError)
    expect(sessionSnapshot()).toEqual([])
  })
})
