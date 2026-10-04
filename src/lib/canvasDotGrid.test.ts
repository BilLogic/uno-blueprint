import { describe, expect, it } from 'vitest'
import {
  CANVAS_DOT_GRID_PITCH,
  CANVAS_DOT_GRID_MIN_SCREEN_PITCH,
  canvasDotGrid,
} from '@/lib/canvasDotGrid'

const ORIGIN = { x: 0, y: 0 }

/** Ink per square screen pixel: one dot's alpha over the tile it owns. */
const tone = (g: { pitch: number; alpha: number }) => g.alpha / g.pitch ** 2

describe('canvasDotGrid', () => {
  it('draws the site motif at zoom 1: a 20px pitch at full strength', () => {
    const grid = canvasDotGrid(ORIGIN, 1)
    expect(grid.pitch).toBe(CANVAS_DOT_GRID_PITCH)
    expect(grid.pitch).toBe(20)
    expect(grid.alpha).toBe(1)
  })

  it('scales the pitch with the board when zoomed in, at full strength', () => {
    expect(canvasDotGrid(ORIGIN, 2)).toMatchObject({ pitch: 40, alpha: 1 })
    expect(canvasDotGrid(ORIGIN, 4)).toMatchObject({ pitch: 80, alpha: 1 })
  })

  it('never lets the on-screen pitch fall under the floor, down to the minimum zoom', () => {
    for (let zoom = 0.05; zoom <= 1; zoom += 0.0137) {
      const { pitch } = canvasDotGrid(ORIGIN, zoom)
      expect(pitch).toBeGreaterThanOrEqual(CANVAS_DOT_GRID_MIN_SCREEN_PITCH)
      expect(pitch).toBeLessThan(CANVAS_DOT_GRID_MIN_SCREEN_PITCH * 2 + 1e-9)
    }
  })

  it('steps the pitch by doubling in world space, so the coarser grid keeps every other dot', () => {
    // Just above and below the first step: 20 world px, then 40.
    const above = canvasDotGrid(ORIGIN, 0.51)
    const below = canvasDotGrid(ORIGIN, 0.49)
    expect(above.pitch / 0.51).toBeCloseTo(20)
    expect(below.pitch / 0.49).toBeCloseTo(40)
    // At the minimum zoom the world pitch is a power-of-two multiple of 20.
    const far = canvasDotGrid(ORIGIN, 0.05)
    expect(Math.log2(far.pitch / 0.05 / 20) % 1).toBeCloseTo(0)
  })

  it('holds the average tone constant below zoom 1, so a step changes texture, not shade', () => {
    const reference = tone(canvasDotGrid(ORIGIN, 1))
    for (const zoom of [0.9, 0.7, 0.51, 0.49, 0.3, 0.26, 0.24, 0.1, 0.05]) {
      expect(tone(canvasDotGrid(ORIGIN, zoom))).toBeCloseTo(reference, 10)
    }
    // Continuous across the step itself.
    const justAbove = canvasDotGrid(ORIGIN, 0.5 + 1e-6)
    const justBelow = canvasDotGrid(ORIGIN, 0.5 - 1e-6)
    expect(justAbove.alpha).toBeCloseTo(0.25, 4)
    expect(justBelow.alpha).toBeCloseTo(1, 4)
  })

  it('pins a dot to the board origin wherever the board is panned', () => {
    for (const [pan, zoom] of [
      [{ x: 0, y: 0 }, 1],
      [{ x: 137.5, y: -42.25 }, 1],
      [{ x: -913, y: 77 }, 0.37],
      [{ x: 12, y: 3000 }, 2.6],
    ] as const) {
      const { pitch, overhang, offsetX, offsetY } = canvasDotGrid(pan, zoom)
      // The layer starts `overhang` out from the viewport's corner and is
      // translated by the offset; each tile's dot sits at the tile's centre.
      const dotX = -overhang + offsetX + pitch / 2
      const dotY = -overhang + offsetY + pitch / 2
      const residueX = (((dotX - pan.x) % pitch) + pitch) % pitch
      const residueY = (((dotY - pan.y) % pitch) + pitch) % pitch
      expect(Math.min(residueX, pitch - residueX)).toBeCloseTo(0, 6)
      expect(Math.min(residueY, pitch - residueY)).toBeCloseTo(0, 6)
    }
  })

  it('keeps the offset inside one tile, however far the board has travelled', () => {
    const { pitch, offsetX, offsetY } = canvasDotGrid({ x: -123456, y: 98765 }, 0.8)
    expect(offsetX).toBeGreaterThanOrEqual(0)
    expect(offsetX).toBeLessThan(pitch)
    expect(offsetY).toBeGreaterThanOrEqual(0)
    expect(offsetY).toBeLessThan(pitch)
  })

  it('draws the tile on a layout unit and scales it back to the exact pitch', () => {
    for (const zoom of [0.05, 0.37, 0.6372, 0.73, 1, 1.37, 1.5003, 2.6, 4]) {
      const { pitch, tile, tileScale } = canvasDotGrid(ORIGIN, zoom)
      // The engine floors a background size to 1/64px; this one is already there.
      expect((tile * 64) % 1).toBe(0)
      expect(tile).toBeLessThanOrEqual(pitch)
      expect(pitch - tile).toBeLessThan(1 / 64)
      // 70 tiles out — the width of a wide viewport — still lands on the board.
      expect(Math.abs(70 * tile * tileScale - 70 * pitch)).toBeLessThan(1e-9)
      expect(tileScale).toBeGreaterThanOrEqual(1)
      expect(tileScale).toBeLessThan(1.002)
    }
  })

  it('hangs the layer a whole number of pixels out, at least a pitch, so a translate never uncovers an edge', () => {
    for (const zoom of [0.05, 0.6372, 0.73, 1, 1.37, 4]) {
      const { pitch, overhang, offsetX } = canvasDotGrid({ x: 33.3, y: 0 }, zoom)
      expect(Number.isInteger(overhang)).toBe(true)
      expect(overhang).toBeGreaterThanOrEqual(pitch)
      // Left edge at or left of the viewport's; the right edge, symmetric.
      expect(-overhang + offsetX).toBeLessThanOrEqual(0)
    }
  })

  it('survives a degenerate zoom without looping forever', () => {
    expect(canvasDotGrid(ORIGIN, 0).pitch).toBeGreaterThan(0)
    expect(canvasDotGrid(ORIGIN, Number.NaN).pitch).toBe(20)
  })
})
