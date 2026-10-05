import { describe, expect, it } from 'vitest'
import {
  addResource,
  assertPlanWritable,
  draftsFromResources,
  featureResource,
  moveResource,
  planResourceSave,
  removeResource,
  renameResource,
  resourceChangeCount,
  resourceOwners,
  retagResource,
  rowsForSync,
  setFeaturedImage,
  settleList,
  unsavedResourceKeys,
  type ResourceDrafts,
} from '@/lib/resourceDrafts'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

const resource = (over: Partial<CellResource> & { id: string; url: string }): CellResource => ({
  name: 'Tracker',
  kind: 'link',
  placementId: null,
  featured: false,
  ...over,
})

const STORED: CellResource[] = [
  resource({ id: 'a', url: 'https://a.dev/' , name: 'A' }),
  resource({ id: 'b', url: 'https://b.dev/', name: 'B', featured: true }),
  resource({ id: 'p', url: 'https://p.dev/', name: 'P', placementId: 'p-1' }),
]
const base = (): ResourceDrafts => draftsFromResources(STORED, null)

describe('the normalisation the writes and the comparison share', () => {
  it('names a nameless link by its host and checks its url', () => {
    expect(rowsForSync([{ kind: 'link', name: ' ', url: 'youtu.be/x' }])).toEqual([
      { id: null, kind: 'link', name: 'youtu.be', url: 'https://youtu.be/x' },
    ])
  })

  it('refuses a link that is not one', () => {
    expect(() => rowsForSync([{ kind: 'link', name: 'x', url: 'not a url' }])).toThrow()
  })

  it('treats a name that differs only in spaces as the same list, so it is not a change', () => {
    const drafts = renameResource(base(), 'a', '  A  ')
    expect(planResourceSave(base(), drafts).lists).toEqual([])
  })
})

describe('the groups', () => {
  it('reads This cell first, then each placement with a row, by name', () => {
    const touchpoints = [
      { id: 'p-1', name: 'Portal' },
      { id: null, name: 'Sample' },
    ] as CellTouchpoint[]
    expect(resourceOwners(touchpoints)).toEqual([
      { id: null, name: 'This cell' },
      { id: 'p-1', name: 'Portal' },
    ])
  })
})

describe('the plan Save sends', () => {
  it('is empty for an untouched draft', () => {
    const plan = planResourceSave(base(), base())
    expect(plan).toEqual({ lists: [], featured: [], frame: null })
    expect(resourceChangeCount(plan)).toBe(0)
  })

  it('writes only the lists that changed, the cell’s before any placement’s', () => {
    let drafts = addResource(base(), {
      key: 'n1',
      owner: 'p-1',
      kind: 'link',
      name: 'n',
      url: 'https://n.dev/',
    })
    drafts = removeResource(drafts, 'a')
    const plan = planResourceSave(base(), drafts)
    expect(plan.lists.map((list) => list.owner)).toEqual([null, 'p-1'])
    expect(resourceChangeCount(plan)).toBe(2)
  })

  it('a re-tag is two list writes, and the moved row starts unfeatured with no id', () => {
    const drafts = retagResource(base(), 'b', 'p-1', 'moved')
    const plan = planResourceSave(base(), drafts)
    expect(plan.lists.map((list) => list.owner)).toEqual([null, 'p-1'])
    const moved = plan.lists[1]!.rows.find((row) => row.key === 'moved')!
    expect(moved).toMatchObject({ id: null, featured: false, owner: 'p-1' })
    // Its old flag went with the old row; no flag write is owed.
    expect(plan.featured).toEqual([])
  })

  it('counts a featured flag and the featured image once each', () => {
    let drafts = featureResource(base(), 'a', true)
    drafts = featureResource(drafts, 'b', false)
    drafts = setFeaturedImage(drafts, 'https://x/pic.png')
    const plan = planResourceSave(base(), drafts)
    expect(plan.lists).toEqual([])
    expect(plan.featured).toEqual([
      { key: 'a', featured: true },
      { key: 'b', featured: false },
    ])
    expect(plan.frame).toEqual({ url: 'https://x/pic.png' })
    expect(resourceChangeCount(plan)).toBe(3)
  })

  it('a reorder within a group is that group’s list, and moves nothing else', () => {
    const drafts = moveResource(base(), 'b', -1)
    const plan = planResourceSave(base(), drafts)
    expect(plan.lists).toHaveLength(1)
    expect(plan.lists[0]!.rows.map((row) => row.key)).toEqual(['b', 'a'])
    // The edge is a no-op: the placement's only row has nowhere to go.
    expect(moveResource(base(), 'p', -1)).toEqual(base())
  })

  it('leaves out a placement the cell’s text no longer names', () => {
    const drafts = renameResource(base(), 'p', 'Renamed')
    expect(planResourceSave(base(), drafts, () => false).lists).toEqual([])
    expect(planResourceSave(base(), drafts, () => true).lists).toHaveLength(1)
  })
})

describe('what the list marks unsaved', () => {
  it('a renamed row, a featured row and a new row, and nothing else', () => {
    let drafts = renameResource(base(), 'a', 'A2')
    drafts = featureResource(drafts, 'p', true)
    drafts = addResource(drafts, { key: 'n', owner: null, kind: 'link', name: 'n', url: 'https://n/' })
    expect([...unsavedResourceKeys(base(), drafts)].sort()).toEqual(['a', 'n', 'p'])
  })
})

describe('settling a list that landed', () => {
  it('gives each new row the id read back in list order, and the baseline becomes the write', () => {
    const drafts = addResource(base(), {
      key: 'n',
      owner: null,
      kind: 'link',
      name: 'n',
      url: 'https://n.dev/',
    })
    const settled = settleList({ baseline: base(), drafts }, null, ['a', 'b', 'minted'])
    expect(settled.drafts.rows.find((row) => row.key === 'n')!.id).toBe('minted')
    // Nothing is left to write for that list; a kept row keeps its flag.
    const plan = planResourceSave(settled.baseline, settled.drafts)
    expect(plan.lists).toEqual([])
    expect(plan.featured).toEqual([])
  })

  it('a read-back that did not answer still settles the list, so it is never sent twice', () => {
    const drafts = addResource(base(), {
      key: 'n',
      owner: null,
      kind: 'link',
      name: 'n',
      url: 'https://n.dev/',
    })
    const settled = settleList({ baseline: base(), drafts }, null, null)
    expect(planResourceSave(settled.baseline, settled.drafts).lists).toEqual([])
  })
})

describe('a stored row the validator refuses', () => {
  const LEGACY = [...STORED, resource({ id: 'old', url: 'http://legacy.example/old', name: 'Old' })]
  const legacy = () => draftsFromResources(LEGACY, null)

  it('is not a change while nobody touches it', () => {
    const plan = planResourceSave(legacy(), legacy())
    expect(plan.lists).toEqual([])
    expect(resourceChangeCount(plan)).toBe(0)
  })

  it('touching its list is a change, and the plan refuses to be written', () => {
    const touched = planResourceSave(legacy(), renameResource(legacy(), 'old', 'Older'))
    expect(touched.lists).toHaveLength(1)
    expect(() => assertPlanWritable(touched)).toThrow('https')
    // An edit to another row of the same list is that list's write too.
    const beside = planResourceSave(legacy(), renameResource(legacy(), 'b', 'B2'))
    expect(() => assertPlanWritable(beside)).toThrow('https')
  })

  it('removing it is a change the plan can write', () => {
    const plan = planResourceSave(legacy(), removeResource(legacy(), 'old'))
    expect(plan.lists).toHaveLength(1)
    expect(() => assertPlanWritable(plan)).not.toThrow()
  })
})

describe('a re-tag writes the list it left before the list it joined', () => {
  it('from a placement to the cell: the placement’s list first', () => {
    const plan = planResourceSave(base(), retagResource(base(), 'p', null, 'moved'))
    expect(plan.lists.map((list) => list.owner)).toEqual(['p-1', null])
  })

  it('from the cell to a placement: the cell’s list first', () => {
    const plan = planResourceSave(base(), retagResource(base(), 'a', 'p-1', 'moved'))
    expect(plan.lists.map((list) => list.owner)).toEqual([null, 'p-1'])
  })

  it('rows traded both ways keep the default order', () => {
    const drafts = retagResource(retagResource(base(), 'p', null, 'm1'), 'a', 'p-1', 'm2')
    expect(planResourceSave(base(), drafts).lists.map((list) => list.owner)).toEqual([null, 'p-1'])
  })
})
