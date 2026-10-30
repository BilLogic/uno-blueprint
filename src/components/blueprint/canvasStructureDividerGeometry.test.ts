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
  sectionRangeForIndex,
} from './canvasStructureDividerGeometry'

function preview(options: {
  ids: readonly string[]
  from: number
  to: number
  rolesById: ReadonlyMap<string, string | null>
}) {
  const roles = options.ids.map((id) => options.rolesById.get(id) ?? null)
  const section = sectionRangeForIndex(roles, options.from)
  const previewIds = orderWithinSection(
    options.ids,
    options.from,
    options.to,
    section,
  )
  return { previewIds, section }
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

it('lets an unrole’d band row swap below the spine actor', () => {
  const ids = ['stakeholders', 'owner', 'frontstage']
  const rolesById = new Map<string, string | null>([
    ['stakeholders', null],
    ['owner', CUSTOMER_ACTIONS_ROLE],
    ['frontstage', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const { previewIds } = preview({
    ids,
    from: 0,
    to: 1,
    rolesById,
  })
  expect(previewIds).toEqual(['owner', 'stakeholders', 'frontstage'])
})

it('swaps two recipient lanes inside their section', () => {
  const ids = ['r1', 'r2', 'r3', 'f1', 'b1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
    ['b1', BACKSTAGE_ACTIONS_ROLE],
  ])
  const { previewIds } = preview({
    ids,
    from: 1,
    to: 2,
    rolesById,
  })
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1', 'b1'])
})

it('refuses a cross-line splice — order stays put', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const { previewIds, section } = preview({
    ids,
    from: 2,
    to: 3,
    rolesById,
  })
  expect(section).toEqual({ start: 0, end: 2 })
  // Clamped to the last seat in the recipient section.
  expect(previewIds).toEqual(['r1', 'r2', 'r3', 'f1'])
})

it('moves the last recipient lane up within its section', () => {
  const ids = ['r1', 'r2', 'r3', 'f1']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['r3', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const { previewIds } = preview({
    ids,
    from: 2,
    to: 1,
    rolesById,
  })
  expect(previewIds).toEqual(['r1', 'r3', 'r2', 'f1'])
})

it('moves a frontstage touchpoints lane within the frontstage section', () => {
  const ids = ['r1', 'app', 'claude', 'stakeholders']
  const rolesById = new Map<string, string | null>([
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['app', FRONTSTAGE_TOUCHPOINTS_ROLE],
    ['claude', FRONTSTAGE_ACTIONS_ROLE],
    ['stakeholders', null],
  ])
  const { previewIds } = preview({
    ids,
    from: 1,
    to: 2,
    rolesById,
  })
  expect(previewIds).toEqual(['r1', 'claude', 'app', 'stakeholders'])
})

it('lets the storyboard reorder inside the recipient section', () => {
  const ids = ['sb', 'r1', 'r2', 'f1']
  const rolesById = new Map<string, string | null>([
    ['sb', STORYBOARD_ROLE],
    ['r1', CUSTOMER_ACTIONS_ROLE],
    ['r2', CUSTOMER_ACTIONS_ROLE],
    ['f1', FRONTSTAGE_ACTIONS_ROLE],
  ])
  const { previewIds } = preview({
    ids,
    from: 0,
    to: 2,
    rolesById,
  })
  expect(previewIds).toEqual(['r1', 'r2', 'sb', 'f1'])
})

it('steps have no divider anchors', () => {
  expect(dividerAnchorIndex('interaction', [null, null, null])).toBe(-1)
  expect(dividerAnchorIndex('visibility', [null, null])).toBe(-1)
})
