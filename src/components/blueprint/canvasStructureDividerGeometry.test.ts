import { expect, it } from 'vitest'
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
} from '@/lib/laneRoles'
import {
  dividerAnchorIndex,
  projectLaneDragPreview,
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
  const previewIds = [...options.ids]
  previewIds.splice(options.to, 0, ...previewIds.splice(options.from, 1))
  const kinds = options.kinds ?? (['interaction'] as const)
  return {
    previewIds,
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
    }),
  }
}

it('keeps the line fixed when an unrole’d band row swaps below the spine actor', () => {
  // Sample board: Stakeholders (null) above Blueprint owner (customer_actions).
  // Dragging Stakeholders below the owner must not glue the line to the owner.
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
  expect(
    dividerAnchorIndex(
      'interaction',
      previewIds.map((id) => rolesById.get(id)),
    ),
  ).toBe(1)
  expect(dividerTranslates.get('interaction')).toBe(0)
  // Owner slides into the vacated slot; the line stays under the band.
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

it('dragging a lane across the line of interaction moves lanes and the line as one stack', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const { previewIds, dividerTranslates, laneOffsets } = preview({
    ids,
    from: 2,
    to: 3,
    rolesById,
    starts,
    extents,
  })
  expect(previewIds).toEqual(['r1', 'r2', 'f1', 'r3'])
  // Divider-sized gap travels with the line (after the last recipient), so
  // frontstage packs against the band above it instead of leaving a hole.
  expect(laneOffsets.get('f1')).toBe(200 - 328)
  expect(laneOffsets.get('r3')).toBe(300 - 200)
  expect(dividerTranslates.get('interaction')).toBe(100)
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
  expect(
    dividerAnchorIndex(
      'interaction',
      previewIds.map((id) => rolesById.get(id)),
    ),
  ).toBe(2)
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
  // LoI after r1, LoV after claude (touchpoints above actions).
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
  // App/Claude swap above LoV — visibility boundary stays after Claude.
  expect(dividerTranslates.get('visibility')).toBe(0)
  expect(dividerTranslates.get('interaction')).toBe(0)
  expect(laneOffsets.get('stakeholders')).toBe(0)
})

it('steps have no divider anchors', () => {
  expect(dividerAnchorIndex('interaction', [null, null, null])).toBe(-1)
  expect(dividerAnchorIndex('visibility', [null, null])).toBe(-1)
})
