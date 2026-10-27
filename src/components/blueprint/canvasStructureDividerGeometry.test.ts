import { expect, it } from 'vitest'
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
} from '@/lib/laneRoles'
import {
  dividerAnchorIndex,
  dividerTranslateForPreview,
} from './canvasStructureDividerGeometry'

/** Build a vertical stack of equal 100px lanes with a 28px gap after `gapAfter`. */
function stack(count: number, gapAfter: number) {
  const starts: number[] = []
  const extents: number[] = []
  let cursor = 0
  for (let index = 0; index < count; index++) {
    starts.push(cursor)
    extents.push(100)
    cursor += 100
    if (index === gapAfter) cursor += 28
  }
  return { starts, extents }
}

/**
 * Project neighbour offsets the same way the reorder controller does: gaps
 * stay on the original slot indices while extents travel with their ids.
 */
function projectOffsets(
  ids: string[],
  from: number,
  to: number,
  starts: number[],
  extents: number[],
) {
  const next = [...ids]
  next.splice(to, 0, ...next.splice(from, 1))
  const indexById = new Map(ids.map((id, index) => [id, index]))
  const offsets = new Map<string, number>()
  let cursor = starts[0]!
  for (const [index, id] of next.entries()) {
    const original = indexById.get(id)!
    offsets.set(id, cursor - starts[original]!)
    const gap =
      index < next.length - 1
        ? starts[index + 1]! - starts[index]! - extents[index]!
        : 0
    cursor += extents[original]! + gap
  }
  return { previewIds: next, offsets }
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
  const { previewIds, offsets } = projectOffsets(ids, 0, 1, starts, extents)
  expect(previewIds).toEqual(['owner', 'stakeholders', 'frontstage'])
  expect(dividerAnchorIndex('interaction', previewIds.map((id) => rolesById.get(id)))).toBe(1)
  expect(
    dividerTranslateForPreview({
      kind: 'interaction',
      ids,
      previewIds,
      rolesById,
      starts,
      extents,
      offsets,
    }),
  ).toBe(0)
})

it('swapping two recipient lanes leaves both divider positions unchanged', () => {
  const ids = ['r1', 'r2', 'r3', 'f1', 'b1']
  const rolesById = new Map<string, string>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
    ['b1', BACKSTAGE_ACTIONS_ROLE],
  ])
  // Gaps after the last recipient (interaction) and last frontstage (visibility).
  const { starts, extents } = stack(5, 2)
  // Insert the visibility gap after frontstage (index 3).
  const startsWithBoth = [...starts]
  const extentsWithBoth = [...extents]
  // Rebuild with two divider gaps: after index 2 and after index 3.
  let cursor = 0
  for (let index = 0; index < 5; index++) {
    startsWithBoth[index] = cursor
    extentsWithBoth[index] = 100
    cursor += 100
    if (index === 2 || index === 3) cursor += 28
  }
  const { previewIds, offsets } = projectOffsets(
    ids,
    1,
    2,
    startsWithBoth,
    extentsWithBoth,
  )
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1', 'b1'])
  expect(
    dividerTranslateForPreview({
      kind: 'interaction',
      ids,
      previewIds,
      rolesById,
      starts: startsWithBoth,
      extents: extentsWithBoth,
      offsets,
    }),
  ).toBe(0)
  expect(
    dividerTranslateForPreview({
      kind: 'visibility',
      ids,
      previewIds,
      rolesById,
      starts: startsWithBoth,
      extents: extentsWithBoth,
      offsets,
    }),
  ).toBe(0)
})

it('dragging a lane across the line of interaction moves it by one lane height', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const gap = starts[3]! - starts[2]! - extents[2]!
  const { previewIds, offsets } = projectOffsets(ids, 2, 3, starts, extents)
  expect(previewIds).toEqual(['r1', 'r2', 'f1', 'r3'])
  // The last recipient is still the dragged lane, now one slot lower, so the
  // derived boundary follows it by exactly one lane extent plus the gap the
  // line itself occupied.
  expect(
    dividerTranslateForPreview({
      kind: 'interaction',
      ids,
      previewIds,
      rolesById,
      starts,
      extents,
      offsets,
    }),
  ).toBe(extents[2]! + gap)
})

it('dragging the last recipient lane up within its band leaves the line where it was', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const starts = [0, 100, 200, 328]
  const extents = [100, 100, 100, 100]
  const { previewIds, offsets } = projectOffsets(ids, 2, 1, starts, extents)
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1'])
  expect(dividerAnchorIndex('interaction', previewIds.map((id) => rolesById.get(id)))).toBe(2)
  expect(
    dividerTranslateForPreview({
      kind: 'interaction',
      ids,
      previewIds,
      rolesById,
      starts,
      extents,
      offsets,
    }),
  ).toBe(0)
})

it('steps have no divider anchors', () => {
  expect(dividerAnchorIndex('interaction', [null, null, null])).toBe(-1)
  expect(dividerAnchorIndex('visibility', [null, null])).toBe(-1)
})
