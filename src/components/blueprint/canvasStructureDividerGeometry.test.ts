import { expect, it } from 'vitest'
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  STORYBOARD_ROLE,
} from '@/lib/laneRoles'
import {
  dividerAnchorIndex,
  laneSectionBounds,
  orderWithinSection,
  projectLaneDragPreview,
  sectionRangeForIndex,
} from './canvasStructureDividerGeometry'

/**
 * Measured divider top equals the end of its original anchor lane when the
 * gap after that lane is the divider band alone.
 */
function dividerStartsFromAnchors(
  ids: readonly string[],
  rolesById: ReadonlyMap<string, string | null>,
  starts: readonly number[],
  extents: readonly number[],
  kinds: readonly ('interaction' | 'visibility' | 'internal-interaction')[],
) {
  const roles = ids.map((id) => rolesById.get(id) ?? null)
  const dividerStarts = new Map<
    'interaction' | 'visibility' | 'internal-interaction',
    number
  >()
  for (const kind of kinds) {
    const anchor = dividerAnchorIndex(kind, roles)
    if (anchor >= 0) {
      dividerStarts.set(kind, starts[anchor]! + extents[anchor]!)
    }
  }
  return dividerStarts
}

function preview(options: {
  ids: readonly string[]
  from: number
  to: number
  rolesById: ReadonlyMap<string, string | null>
  starts: readonly number[]
  extents: readonly number[]
  kinds?: readonly ('interaction' | 'visibility' | 'internal-interaction')[]
}) {
  const roles = options.ids.map((id) => options.rolesById.get(id) ?? null)
  const section = sectionRangeForIndex(roles, options.from)
  const previewIds = orderWithinSection(
    options.ids,
    options.from,
    options.to,
    section,
  )
  const kinds = options.kinds ?? (['interaction'] as const)
  return {
    previewIds,
    section,
    ...projectLaneDragPreview({
      ids: options.ids,
      previewIds,
      rolesById: options.rolesById,
      starts: options.starts,
      extents: options.extents,
      dividerStarts: dividerStartsFromAnchors(
        options.ids,
        options.rolesById,
        options.starts,
        options.extents,
        kinds,
      ),
      section,
    }),
  }
}

it('splits the board into sections at each divider anchor', () => {
  const roles = [
    STORYBOARD_ROLE,
    CUSTOMER_ACTIONS_ROLE,
    FRONTSTAGE_ACTIONS_ROLE,
    BACKSTAGE_ACTIONS_ROLE,
  ]
  expect(laneSectionBounds(roles)).toEqual([
    { start: 0, end: 1 },
    { start: 2, end: 2 },
    { start: 3, end: 3 },
  ])
})

it('keeps the line fixed when an unrole’d band row swaps below the spine actor', () => {
  const ids = ['stakeholders', 'owner', 'frontstage']
  const rolesById = new Map<string, string | null>([
    ['stakeholders', null],
    ['owner', CUSTOMER_ACTIONS_ROLE],
    ['frontstage', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 228]
  const extents = [100, 100, 100]
  const { previewIds, dividerTranslates, laneOffsets } = preview({
    ids,
    from: 0,
    to: 1,
    rolesById,
    starts,
    extents,
  })
  expect(previewIds).toEqual(['owner', 'stakeholders', 'frontstage'])
  expect(dividerTranslates.get('interaction')).toBe(0)
  expect(laneOffsets.get('owner')).toBe(-100)
  expect(laneOffsets.get('stakeholders')).toBe(100)
  expect(laneOffsets.get('frontstage')).toBe(0)
})

it('swapping two recipient lanes leaves both divider positions unchanged', () => {
  const ids = ['r1', 'r2', 'r3', 'f1', 'b1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
    ['b1', BACKSTAGE_ACTIONS_ROLE],
  ])
  const startsWithBoth: number[] = []
  const extentsWithBoth: number[] = []
  let cursor = 0
  for (let index = 0; index < 5; index++) {
    startsWithBoth[index] = cursor
    extentsWithBoth[index] = 100
    cursor += 100
    if (index === 2 || index === 3) cursor += 28
  }
  const { previewIds, dividerTranslates } = preview({
    ids,
    from: 1,
    to: 2,
    rolesById,
    starts: startsWithBoth,
    extents: extentsWithBoth,
    kinds: ['interaction', 'visibility'],
  })
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1', 'b1'])
  expect(dividerTranslates.get('interaction')).toBe(0)
  expect(dividerTranslates.get('visibility')).toBe(0)
})

it('refuses a cross-line splice — order and divider stay put', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const { previewIds, dividerTranslates, laneOffsets, section } = preview({
    ids,
    from: 2,
    to: 3,
    rolesById,
    starts,
    extents,
  })
  expect(section).toEqual({ start: 0, end: 2 })
  // Clamped to the last seat in the recipient section.
  expect(previewIds).toEqual(['r1', 'r2', 'r3', 'f1'])
  expect(dividerTranslates.get('interaction')).toBe(0)
  expect(laneOffsets.get('f1')).toBe(0)
  expect(laneOffsets.get('r3')).toBe(0)
})

it('dragging the last recipient lane up within its band leaves the line where it was', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const { previewIds, dividerTranslates } = preview({
    ids,
    from: 2,
    to: 1,
    rolesById,
    starts,
    extents,
  })
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1'])
  expect(dividerTranslates.get('interaction')).toBe(0)
})

it('moving a frontstage touchpoints lane within the frontstage band keeps LoV fixed', () => {
  const ids = ['r1', 'app', 'claude', 'stakeholders']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['app', FRONTSTAGE_TOUCHPOINTS_ROLE],
    ['claude', FRONTSTAGE_ACTIONS_ROLE],
    ['stakeholders', null],
  ])
  const starts = [0, 128, 228, 356]
  const extents = [100, 100, 100, 100]
  const { dividerTranslates, laneOffsets } = preview({
    ids,
    from: 1,
    to: 2,
    rolesById,
    starts,
    extents,
    kinds: ['interaction', 'visibility'],
  })
  expect(dividerTranslates.get('visibility')).toBe(0)
  expect(dividerTranslates.get('interaction')).toBe(0)
  expect(laneOffsets.get('stakeholders')).toBe(0)
})

it('lets the storyboard reorder inside the recipient section', () => {
  const ids = ['sb', 'r1', 'r2', 'f1']
  const rolesById = new Map<string, string | null>([
    ['sb', STORYBOARD_ROLE],
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const { previewIds, dividerTranslates } = preview({
    ids,
    from: 0,
    to: 2,
    rolesById,
    starts,
    extents,
  })
  expect(previewIds).toEqual(['r1', 'r2', 'sb', 'f1'])
  expect(dividerTranslates.get('interaction')).toBe(0)
})

it('steps have no divider anchors', () => {
  expect(dividerAnchorIndex('interaction', [null, null, null])).toBe(-1)
  expect(dividerAnchorIndex('visibility', [null, null])).toBe(-1)
})
