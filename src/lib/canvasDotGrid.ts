/**
 * The dot grid on the canvas ground: where its tiles sit and how strong its
 * dots are, for a given camera.
 *
 * The grid is one CSS background on the viewport (`blueprint.css`), and the
 * transform writer stamps this function's answer onto it on every camera
 * frame, so the dots travel with a pan and spread with a zoom: the ground
 * reads as the surface the board sits on, not a pattern printed on the glass.
 *
 * WHAT HAPPENS FAR OUT. A grid that only scaled would put its 20px pitch at
 * 1px by the minimum zoom — a solid grey wash on the way, shimmering and
 * throwing moiré against the screen's own pixel grid as it went. So the pitch
 * STEPS: below the zoom where the on-screen pitch would fall under
 * `CANVAS_DOT_GRID_MIN_SCREEN_PITCH`, the world pitch doubles (20, 40, 80…),
 * which keeps every other dot exactly where it was and drops the rest. The
 * on-screen pitch therefore lives in [10px, 20px) for every zoom under 1.
 *
 * Stepping alone would still pop: the half of the dots that vanish take half
 * the ground's tone with them. The alpha answers that. It falls with the
 * square of the on-screen pitch — the dot count per screen area rises with
 * that square — so the average tone of the ground is the same at every zoom
 * under 1 and continuous across each step. A step changes the grain, never
 * the shade. Fading out instead was the other option, and it was rejected
 * because the overview, which is where the ground is most visible, would then
 * have none.
 *
 * Zoomed in past 1 the pitch just scales and the alpha holds at full
 * strength. The dot itself is drawn at a constant on-screen size by the CSS,
 * so a dot never blurs into a blob or shrinks below a pixel.
 */

/** World pitch at zoom 1, in board pixels: the site motif's 20px. */
export const CANVAS_DOT_GRID_PITCH = 20

/** The tightest on-screen pitch the grid is allowed before it steps. */
export const CANVAS_DOT_GRID_MIN_SCREEN_PITCH = CANVAS_DOT_GRID_PITCH / 2

/** Below any zoom the camera can reach; only guards a degenerate input. */
const ZOOM_FLOOR = 1e-3

/**
 * The engine's layout unit: Blink floors a `background-size` to 1/64px.
 * Repeated seventy-odd times across a viewport, that floor walked the far
 * edge of the grid a pixel and more off the board at fractional zooms
 * (measured at DPR 1). So the tile is drawn ON the unit, deliberately, and
 * the layer's transform scales it back up to the exact pitch — a scale of
 * at most 1.0016, invisible on a pixel-wide dot.
 */
const LAYOUT_UNIT = 1 / 64

export type CanvasDotGrid = {
  /** On-screen pitch in px: the distance between dots as the board has it. */
  pitch: number
  /** `background-size` on both axes: the pitch floored to a layout unit. */
  tile: number
  /** The layer's scale, `pitch / tile`, so the tiles land on the pitch. */
  tileScale: number
  /**
   * How far the layer hangs past the viewport on every side, in px: the
   * pitch, rounded UP to a whole pixel. Whole, because a fractional layer
   * origin is snapped to the pixel grid when the background paints, which
   * put the dots up to half a pixel off the board, by an amount that
   * changed with the zoom. At least a pitch, so a translate inside one pitch
   * never uncovers an edge.
   */
  overhang: number
  /** The layer's translate, reduced into one pitch, in px. */
  offsetX: number
  offsetY: number
  /** Multiplier on the dot colour's own alpha, 0–1. */
  alpha: number
}

const wrap = (value: number, period: number) =>
  ((value % period) + period) % period

/**
 * Dot-grid geometry for a camera at `pan` (screen px) and `zoom`.
 *
 * A dot sits on the board's origin and every world-pitch multiple of it. The
 * CSS draws each tile's dot at the tile's centre, hence the half-pitch shift.
 */
export function canvasDotGrid(
  pan: { x: number; y: number },
  zoom: number,
): CanvasDotGrid {
  const z = Number.isFinite(zoom) ? Math.max(zoom, ZOOM_FLOOR) : 1
  let worldPitch = CANVAS_DOT_GRID_PITCH
  while (worldPitch * z < CANVAS_DOT_GRID_MIN_SCREEN_PITCH) worldPitch *= 2
  const pitch = worldPitch * z
  const alpha = Math.min(1, (pitch / CANVAS_DOT_GRID_PITCH) ** 2)
  const tile = Math.floor(pitch / LAYOUT_UNIT) * LAYOUT_UNIT
  const overhang = Math.ceil(pitch)
  return {
    pitch,
    tile,
    tileScale: pitch / tile,
    overhang,
    offsetX: wrap(pan.x - pitch / 2 + overhang, pitch),
    offsetY: wrap(pan.y - pitch / 2 + overhang, pitch),
    alpha,
  }
}
