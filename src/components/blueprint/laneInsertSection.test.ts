import { expect, it } from 'vitest'
import {
  laneInsertSectionForOrder,
  preferredCreateRole,
} from './laneInsertSection'
import {
  BACKSTAGE_ACTIONS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  PARTNER_ACTIONS_ROLE,
  STORYBOARD_ROLE,
  SUPPORT_ACTIONS_ROLE,
} from '@/lib/laneRoles'

import {
  INTERACTION_LINE_LABEL,
  INTERNAL_INTERACTION_LINE_LABEL,
  VISIBILITY_LINE_LABEL,
} from '@/lib/blueprintLayout'

it('offers support below visibility when no internal line exists yet', () => {
  const roles = new Map([
    ['customer', CUSTOMER_ACTIONS_ROLE],
    ['front', FRONTSTAGE_ACTIONS_ROLE],
    ['back', BACKSTAGE_ACTIONS_ROLE],
  ])
  const section = laneInsertSectionForOrder(['customer', 'front', 'back', 'new'], roles, 'new')
  expect(section.lineAbove).toBe(VISIBILITY_LINE_LABEL)
  expect(section.lineBelow).toBeNull()
  expect(section.allowedRoles).toContain(SUPPORT_ACTIONS_ROLE)
})

const BOARD = () => {
  const order = [
    'story',
    'customer',
    'touch',
    'front',
    'backTouch',
    'back',
    'support',
  ]
  const roles = new Map<string, string | null>([
    ['story', STORYBOARD_ROLE],
    ['customer', CUSTOMER_ACTIONS_ROLE],
    ['touch', FRONTSTAGE_TOUCHPOINTS_ROLE],
    ['front', FRONTSTAGE_ACTIONS_ROLE],
    ['backTouch', 'backstage_touchpoints'],
    ['back', BACKSTAGE_ACTIONS_ROLE],
    ['support', SUPPORT_ACTIONS_ROLE],
  ])
  return { order, roles }
}

it('scopes a frontstage insert to LoI–LoV with the full frontstage role band', () => {
  const { roles } = BOARD()
  const order = ['story', 'customer', 'new', 'touch', 'front', 'backTouch', 'back', 'support']
  const section = laneInsertSectionForOrder(order, roles, 'new')
  expect(order.slice(section.start, section.end + 1)).toEqual([
    'new',
    'touch',
    'front',
  ])
  expect(section.lineAbove).toBe(INTERACTION_LINE_LABEL)
  expect(section.lineBelow).toBe(VISIBILITY_LINE_LABEL)
  expect(section.allowedRoles).toEqual([
    FRONTSTAGE_TOUCHPOINTS_ROLE,
    FRONTSTAGE_ACTIONS_ROLE,
  ])
})

it('keeps a draft parked last in frontstage from jumping into backstage', () => {
  const { roles } = BOARD()
  const order = [
    'story',
    'customer',
    'touch',
    'front',
    'new',
    'backTouch',
    'back',
    'support',
  ]
  const section = laneInsertSectionForOrder(order, roles, 'new', {
    lock: {
      lineAbove: INTERACTION_LINE_LABEL,
      lineBelow: VISIBILITY_LINE_LABEL,
    },
  })
  expect(order.slice(section.start, section.end + 1)).toEqual([
    'touch',
    'front',
    'new',
  ])
  expect(section.lineAbove).toBe(INTERACTION_LINE_LABEL)
  expect(section.lineBelow).toBe(VISIBILITY_LINE_LABEL)
})

it('seats the handle above a divider in the preceding band', () => {
  const { roles } = BOARD()
  // Same splice as “above first frontstage lane”, opposite band.
  const order = [
    'story',
    'customer',
    'new',
    'touch',
    'front',
    'backTouch',
    'back',
    'support',
  ]
  const section = laneInsertSectionForOrder(order, roles, 'new', {
    beforeDivider: true,
  })
  expect(order.slice(section.start, section.end + 1)).toEqual([
    'story',
    'customer',
    'new',
  ])
  expect(section.lineAbove).toBeNull()
  expect(section.lineBelow).toBe(INTERACTION_LINE_LABEL)
})

it('offers every band role even when only one is already present', () => {
  const order = ['customer', 'new', 'touch', 'back']
  const roles = new Map<string, string | null>([
    ['customer', CUSTOMER_ACTIONS_ROLE],
    ['touch', FRONTSTAGE_TOUCHPOINTS_ROLE],
    ['back', BACKSTAGE_ACTIONS_ROLE],
  ])
  const section = laneInsertSectionForOrder(order, roles, 'new')
  expect(section.allowedRoles).toEqual([
    FRONTSTAGE_TOUCHPOINTS_ROLE,
    FRONTSTAGE_ACTIONS_ROLE,
  ])
})

it('scopes a support insert below the internal line', () => {
  const order = ['customer', 'front', 'back', 'new', 'support']
  const roles = new Map<string, string | null>([
    ['customer', CUSTOMER_ACTIONS_ROLE],
    ['front', FRONTSTAGE_ACTIONS_ROLE],
    ['back', BACKSTAGE_ACTIONS_ROLE],
    ['support', SUPPORT_ACTIONS_ROLE],
  ])
  const section = laneInsertSectionForOrder(order, roles, 'new')
  expect(order.slice(section.start, section.end + 1)).toEqual(['new', 'support'])
  expect(section.lineAbove).toBe(INTERNAL_INTERACTION_LINE_LABEL)
  expect(section.lineBelow).toBeNull()
  expect(section.allowedRoles).toEqual([SUPPORT_ACTIONS_ROLE])
})

it('prefers an unused band role so storyboard is not auto-cloned', () => {
  const { roles } = BOARD()
  const order = ['story', 'customer', 'new', 'touch', 'front', 'backTouch', 'back', 'support']
  const above = laneInsertSectionForOrder(order, roles, 'new', {
    beforeDivider: true,
  })
  expect(above.occupiedRoles).toEqual([STORYBOARD_ROLE, CUSTOMER_ACTIONS_ROLE])
  expect(preferredCreateRole(above.allowedRoles, above.occupiedRoles)).toBe(
    PARTNER_ACTIONS_ROLE,
  )

  // Only touchpoints occupies the frontstage band — actions stays free.
  const front = laneInsertSectionForOrder(
    ['story', 'customer', 'new', 'touch', 'backTouch', 'back', 'support'],
    roles,
    'new',
  )
  expect(front.occupiedRoles).toEqual([FRONTSTAGE_TOUCHPOINTS_ROLE])
  expect(preferredCreateRole(front.allowedRoles, front.occupiedRoles)).toBe(
    FRONTSTAGE_ACTIONS_ROLE,
  )
})

it('does not fall back to storyboard when every band role is already taken', () => {
  expect(
    preferredCreateRole(
      [STORYBOARD_ROLE, CUSTOMER_ACTIONS_ROLE, PARTNER_ACTIONS_ROLE],
      [STORYBOARD_ROLE, CUSTOMER_ACTIONS_ROLE, PARTNER_ACTIONS_ROLE],
    ),
  ).toBe(CUSTOMER_ACTIONS_ROLE)
})
