/**
 * The resource half of the panel's Save: what it writes, in what order, and
 * what a failure part-way leaves behind.
 *
 * The four writes are stubbed onto one log so the order is the assertion;
 * the read-back of new ids answers from `stored`, which plays the database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createResourceDraftStore } from '@/lib/resourceDraftStore'
import {
  addResource,
  draftsFromResources,
  featureResource,
  renameResource,
  planResourceSave,
  retagResource,
  setFeaturedImage,
} from '@/lib/resourceDrafts'
import type { CellResource } from '@/types/blueprint'

const { log, fail, updateCellResources, updatePlacementResources, setFeaturedResource, setCellFeaturedImage } =
  vi.hoisted(() => {
    const log: string[] = []
    const fail = { on: null as string | null }
    const step = (name: string) => {
      if (fail.on === name) {
        fail.on = null
        throw new Error(`${name} refused`)
      }
      log.push(name)
    }
    return {
      log,
      fail,
      updateCellResources: vi.fn(async (_c: unknown, _id: string, _e: unknown, rows: { id: string | null }[]) => {
        step('cell list')
        stored.set('cell', rows.map((row, index) => row.id ?? `new-cell-${index}`))
      }),
      updatePlacementResources: vi.fn(
        async (_c: unknown, placement: { id: string }, _e: unknown, rows: { id: string | null }[]) => {
          step(`list ${placement.id}`)
          stored.set(placement.id, rows.map((row, index) => row.id ?? `new-${placement.id}-${index}`))
        },
      ),
      setFeaturedResource: vi.fn(async (_c: unknown, row: { id: string }, featured: boolean) => {
        step(`featured ${row.id} ${featured}`)
        return []
      }),
      setCellFeaturedImage: vi.fn(async (_c: unknown, input: { imageUrl: string | null }) => {
        step(`frame ${input.imageUrl}`)
        return {}
      }),
    }
  })
const stored = new Map<string, string[]>()
/** How many read-backs to refuse before answering. */
const readBack = { refuse: 0 }

vi.mock('@/lib/cellContentMutations', () => ({ updateCellResources }))
vi.mock('@/lib/placementResourceMutations', () => ({ updatePlacementResources, setFeaturedResource }))
vi.mock('@/lib/authoringRpc', () => ({ setCellFeaturedImage }))

/** The read-back: an owner's ids in position order, from what the stubs stored. */
const client = {
  from: () => {
    const filters: Record<string, unknown> = {}
    const query = {
      select: () => query,
      order: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value
        return query
      },
      is: () => query,
      then: (resolve: (value: unknown) => void) => {
        if (readBack.refuse > 0) {
          readBack.refuse -= 1
          resolve({ data: null, error: { message: 'gateway' } })
          return
        }
        const owner = (filters.cell_touchpoint_id as string | undefined) ?? 'cell'
        resolve({ data: (stored.get(owner) ?? []).map((id) => ({ id })), error: null })
      },
    }
    return query
  },
} as never

const resource = (over: Partial<CellResource> & { id: string; url: string }): CellResource => ({
  name: 'Tracker',
  kind: 'link',
  placementId: null,
  featured: false,
  ...over,
})
const STORED = [
  resource({ id: 'a', url: 'https://a.dev/', name: 'A' }),
  resource({ id: 'p', url: 'https://p.dev/', name: 'P', placementId: 'p-1' }),
  resource({ id: 'q', url: 'https://q.dev/', name: 'Q', placementId: 'p-2' }),
]
const PICTURE = 'https://x.supabase.co/storage/v1/object/public/cell-attachments/cells/c/pic.png'

beforeEach(() => {
  log.length = 0
  fail.on = null
  stored.clear()
  readBack.refuse = 0
  vi.clearAllMocks()
})

describe('the save writes what changed, in order', () => {
  it('the cell’s list, each placement’s, the featured flags, then the featured image', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => {
      let next = addResource(drafts, { key: 'n', owner: 'p-2', kind: 'link', name: 'N', url: 'https://n.dev/' })
      next = renameResource(next, 'p', 'P2')
      next = renameResource(next, 'a', 'A2')
      next = featureResource(next, 'n', true)
      next = setFeaturedImage(next, PICTURE)
      return next
    })
    await store.save(client, { cellId: 'c' })

    expect(log).toEqual([
      'cell list',
      'list p-1',
      'list p-2',
      // The new link's flag names the id its list write just minted.
      'featured new-p-2-1 true',
      `frame ${PICTURE}`,
    ])
  })

  it('an untouched draft writes nothing', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    await store.save(client, { cellId: 'c' })
    expect(log).toEqual([])
  })

  it('a re-tag writes both lists and owes no flag', async () => {
    const store = createResourceDraftStore(
      draftsFromResources([{ ...STORED[0]!, featured: true }, STORED[1]!], null),
    )
    store.edit((drafts) => retagResource(drafts, 'a', 'p-1', 'moved'))
    await store.save(client, { cellId: 'c' })
    expect(log).toEqual(['cell list', 'list p-1'])
    expect(updateCellResources.mock.calls[0]![3]).toEqual([])
    expect(
      updatePlacementResources.mock.calls[0]![3].map((row: { id: string | null }) => row.id),
    ).toEqual(['p', null])
  })

  it('skips a placement the cell’s text no longer names', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => renameResource(renameResource(drafts, 'p', 'P2'), 'q', 'Q2'))
    await store.save(client, { cellId: 'c', survives: (owner) => owner !== 'p-1' })
    expect(log).toEqual(['list p-2'])
  })
})

describe('a failure part-way keeps only what is unwritten', () => {
  it('a retry resumes after the last write that landed, and inserts no row twice', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => {
      let next = addResource(drafts, { key: 'n', owner: null, kind: 'link', name: 'N', url: 'https://n.dev/' })
      next = renameResource(next, 'p', 'P2')
      next = featureResource(next, 'n', true)
      return next
    })

    fail.on = 'list p-1'
    await expect(store.save(client, { cellId: 'c' })).rejects.toThrow('list p-1 refused')
    expect(log).toEqual(['cell list'])

    // The cell's list landed, so the new row now carries the id it was given.
    const pending = store.getSnapshot().drafts.rows.find((row) => row.key === 'n')!
    expect(pending.id).toBe('new-cell-1')

    await store.save(client, { cellId: 'c' })
    expect(log).toEqual(['cell list', 'list p-1', 'featured new-cell-1 true'])
    // The cell's list was written once: its new row was inserted once.
    expect(updateCellResources).toHaveBeenCalledTimes(1)
  })

  it('an edit after the failure rewrites a landed list by id, never re-inserting its new row', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) =>
      renameResource(
        addResource(drafts, { key: 'n', owner: null, kind: 'link', name: 'N', url: 'https://n.dev/' }),
        'p',
        'P2',
      ),
    )
    fail.on = 'list p-1'
    await expect(store.save(client, { cellId: 'c' })).rejects.toThrow()

    store.edit((drafts) => renameResource(drafts, 'n', 'N2'))
    await store.save(client, { cellId: 'c' })
    expect(updateCellResources).toHaveBeenCalledTimes(2)
    expect(
      updateCellResources.mock.calls[1]![3].map((row: { id: string | null }) => row.id),
    ).toEqual(['a', 'new-cell-1'])
  })

  it('a failed featured image leaves only the image to write', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => setFeaturedImage(renameResource(drafts, 'a', 'A2'), PICTURE))
    fail.on = `frame ${PICTURE}`
    await expect(store.save(client, { cellId: 'c' })).rejects.toThrow()
    await store.save(client, { cellId: 'c' })
    expect(log).toEqual(['cell list', `frame ${PICTURE}`])
  })
})

describe('a re-tag writes the removal before the add', () => {
  it('from a placement to the cell: the placement’s list, then the cell’s', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => retagResource(drafts, 'p', null, 'moved'))
    await store.save(client, { cellId: 'c' })
    expect(log).toEqual(['list p-1', 'cell list'])
  })

  it('a failure between the two leaves the row missing, and the retry adds it once', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) => retagResource(drafts, 'p', null, 'moved'))
    fail.on = 'cell list'
    await expect(store.save(client, { cellId: 'c' })).rejects.toThrow()
    expect(log).toEqual(['list p-1'])
    await store.save(client, { cellId: 'c' })
    expect(log).toEqual(['list p-1', 'cell list'])
  })
})

describe('a featured link whose id did not come back', () => {
  it('is not dropped: Save says so, the flag stays pending, and the retry reads the id again', async () => {
    const store = createResourceDraftStore(draftsFromResources(STORED, null))
    store.edit((drafts) =>
      featureResource(
        addResource(drafts, { key: 'n', owner: null, kind: 'link', name: 'N', url: 'https://n.dev/' }),
        'n',
        true,
      ),
    )
    // The list's read-back, and the second ask before the flag, both refused.
    readBack.refuse = 2
    await expect(store.save(client, { cellId: 'c' })).rejects.toThrow(
      'The link was saved but could not be featured — try Save again.',
    )
    expect(log).toEqual(['cell list'])
    const { baseline, drafts } = store.getSnapshot()
    expect(planResourceSave(baseline, drafts).featured).toEqual([{ key: 'n', featured: true }])

    await store.save(client, { cellId: 'c' })
    // The list is not written again; the flag names the id read this time.
    expect(log).toEqual(['cell list', 'featured new-cell-1 true'])
    expect(updateCellResources).toHaveBeenCalledTimes(1)
  })
})
