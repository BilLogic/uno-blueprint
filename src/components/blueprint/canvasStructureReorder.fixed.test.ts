import { expect, it } from 'vitest'
import {
  isStructureReorderFixedLane,
  orderKeepingFixed,
} from './canvasStructureReorder'
import { STORYBOARD_ROLE, CUSTOMER_ACTIONS_ROLE } from '@/lib/laneRoles'

it('treats only the storyboard role as a fixed lane seat', () => {
  expect(isStructureReorderFixedLane(STORYBOARD_ROLE)).toBe(true)
  expect(isStructureReorderFixedLane(CUSTOMER_ACTIONS_ROLE)).toBe(false)
  expect(isStructureReorderFixedLane(null)).toBe(false)
})

it('keeps the storyboard index fixed while neighbours permute', () => {
  const ids = ['sb', 'a', 'b', 'c']
  const fixed = new Set([0])
  expect(orderKeepingFixed(ids, 3, 1, fixed)).toEqual(['sb', 'c', 'a', 'b'])
  expect(orderKeepingFixed(ids, 1, 3, fixed)).toEqual(['sb', 'b', 'c', 'a'])
})

it('refuses to lift a fixed seat or drop into one', () => {
  const ids = ['sb', 'a', 'b']
  const fixed = new Set([0])
  expect(orderKeepingFixed(ids, 0, 2, fixed)).toEqual(ids)
  expect(orderKeepingFixed(ids, 2, 0, fixed)).toEqual(['sb', 'b', 'a'])
})
