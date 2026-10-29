import { expect, it } from 'vitest'
import { dampenStructureDrag, orderWithinSection } from './canvasStructureReorder'
import {
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  STORYBOARD_ROLE,
} from '@/lib/laneRoles'
import {
  laneSectionBounds,
  sectionRangeForIndex,
} from './canvasStructureDividerGeometry'

it('treats storyboard as a movable seat inside the recipient section', () => {
  const roles = [
    STORYBOARD_ROLE,
    CUSTOMER_ACTIONS_ROLE,
    CUSTOMER_ACTIONS_ROLE,
    FRONTSTAGE_ACTIONS_ROLE,
  ]
  expect(sectionRangeForIndex(roles, 0)).toEqual({ start: 0, end: 2 })
  expect(laneSectionBounds(roles)).toEqual([
    { start: 0, end: 2 },
    { start: 3, end: 3 },
  ])
})

it('reorders within a section and clamps past the boundary', () => {
  const ids = ['sb', 'a', 'b', 'f']
  const section = { start: 0, end: 2 }
  expect(orderWithinSection(ids, 0, 2, section)).toEqual(['a', 'b', 'sb', 'f'])
  expect(orderWithinSection(ids, 2, 3, section)).toEqual(['sb', 'a', 'b', 'f'])
  expect(orderWithinSection(ids, 1, 0, section)).toEqual(['a', 'sb', 'b', 'f'])
})

it('refuses to lift from outside the named section', () => {
  const ids = ['sb', 'a', 'b']
  expect(orderWithinSection(ids, 0, 2, { start: 1, end: 2 })).toEqual(ids)
})


it('tracks legal movement and progressively resists both edges without escaping the elastic cap', () => {
  expect(dampenStructureDrag(40, -100, 100, 16)).toBe(40)
  for (const sign of [-1, 1]) {
    const near = Math.abs(dampenStructureDrag(sign * 104, -100, 100, 16))
    const far = Math.abs(dampenStructureDrag(sign * 200, -100, 100, 16))
    const extreme = Math.abs(dampenStructureDrag(sign * 100000, -100, 100, 16))
    expect(near).toBeGreaterThan(100)
    expect(far).toBeGreaterThan(near)
    expect(extreme).toBeLessThan(116)
    expect((far - near) / 96).toBeLessThan((near - 100) / 4)
  }
  // Coordinates scale with the board: zoom changes no world-space elasticity.
  expect(dampenStructureDrag(100, -50, 50, 8) * 2).toBe(dampenStructureDrag(200, -100, 100, 16))
})
