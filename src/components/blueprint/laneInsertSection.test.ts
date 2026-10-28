import { expect, it } from 'vitest'
import { laneInsertSectionForOrder } from './laneInsertSection'
import {
  BACKSTAGE_ACTIONS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  STORYBOARD_ROLE,
  SUPPORT_ACTIONS_ROLE,
} from '@/lib/laneRoles'
import {
  INTERACTION_LINE_LABEL,
  INTERNAL_INTERACTION_LINE_LABEL,
  VISIBILITY_LINE_LABEL,
} from '@/lib/blueprintLayout'

it('scopes a frontstage insert to LoI–LoV with only frontstage roles', () => {
  const order = ['story', 'customer', 'new', 'touch', 'front', 'back', 'support']
  const roles = new Map<string, string | null>([
    ['story', STORYBOARD_ROLE],
    ['customer', CUSTOMER_ACTIONS_ROLE],
    ['touch', FRONTSTAGE_TOUCHPOINTS_ROLE],
    ['front', FRONTSTAGE_ACTIONS_ROLE],
    ['back', BACKSTAGE_ACTIONS_ROLE],
    ['support', SUPPORT_ACTIONS_ROLE],
  ])
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
