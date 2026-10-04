import type { BlueprintLane } from '@/types/blueprint'
import {
  BLUEPRINT_CELL_BORDER_COLOR,
  type BlueprintLaneRole,
} from '@/lib/blueprintCellStyle'
import {
  shouldShowInteractionLineAfter,
  shouldShowVisibilityLineAfter,
} from '@/lib/blueprintLayout'

/**
 * Board chrome — the frame the blueprint is drawn in.
 *
 * Every value names a JOB, not a step. `blueprint.css` declares the whole
 * overview vocabulary once at its root — one name per piece, rest and hover
 * adjacent — and pins each name to the primitive the owner's chosen look was
 * built from. Nothing here reaches past a name into the ramp any more, so a
 * deployment retunes a piece by setting its name rather than by editing this
 * file.
 *
 * These are inlined through `style` rather than applied as classes because the
 * board composes them into gradients and SVG attributes, but they are `var()`
 * either way — the board is on the same tokens as the rest of the app, and
 * follows the theme with it.
 *
 * THIRTEEN, NOT THIRTY. Seventeen keys used to sit here that nothing read.
 *
 * Fourteen were the phase-frame, scenario-badge and panel-hover chrome, stale
 * since that chrome moved into `blueprint.css` as real CSS rules —
 * `[data-phase-scenario-panel]`, `[data-phase-title-badge]` and friends own
 * those colours now, and a hover in CSS cannot consult a TypeScript constant.
 * Two more, `canvasDark` and `labelRailDark`, were a JavaScript answer to a
 * question CSS had already taken over: the theme flips in the stylesheet, so
 * nothing here has to pick its own dark variant. The last three were the panel
 * hover values, whose only reader was a helper the CSS rule replaced.
 *
 * The rule that keeps it at thirteen: if a colour can be expressed as a CSS
 * rule, it belongs in `blueprint.css`. What stays is only what the board
 * composes at runtime into a gradient stop or an SVG attribute, where there is
 * no selector to write.
 *
 * All thirteen name one of the overview's component tokens. Three are LAYERS —
 * the workspace the board is dropped on, and the board's own content surface,
 * the innermost of the four nested ones. The other ten are the chrome that
 * reads against those layers: the rail, the rules, the divider band and its
 * caption, the cell and header ink, and the flow arrow's stroke. They used to
 * be primitives here, on the argument that a slate-tinted grey ladder has no
 * equivalent in the neutral semantic set (the nearest match to `divider` is
 * off by Δ97). That argument was for a SEMANTIC name; the names they read now
 * are component names in the blueprint's own namespace, which is exactly the
 * tier a board's chrome belongs in — so the ladder keeps its measured colours
 * and gains a seam a deployment can reach.
 */
export const BLUEPRINT_THEME = {
  /** Blueprint content surface — path sections, cells, swim lanes. */
  canvas: 'var(--background-blueprint-panel-interior)',
  /** Blueprint shell — label column, panel padding, compare chrome. */
  labelRail: 'var(--background-blueprint-label-rail)',
  canvasBorder: 'var(--border-blueprint-panel-interior)',
  divider: 'var(--border-blueprint-phase-divider)',
  /*
   * The divider caption's ink, and it is a TEXT step for that reason —
   * `blueprint.css` declares the name and carries the measurement that forced
   * it there. Step 900 and step 1100 both miss AA on a 12px caption at
   * the bottom of the type scale, and `palette.test.ts` measures the pair
   * rather than trusting the step number.
   *
   * It survived because every contrast assertion in this system used to
   * compare two halves of the SAME primitive family, and this pair is a gray
   * ink on a slate ground. A guard samples the region where its property
   * already holds unless something makes it look elsewhere.
   */
  dividerLabel: 'var(--text-blueprint-divider-caption)',
  /** Figma-style interaction / visibility line badge. */
  dividerBadgeBg: 'var(--background-blueprint-divider-badge)',
  dividerBg: 'var(--background-blueprint-divider-band)',
  cellText: 'var(--text-blueprint-cell)',
  headerText: 'var(--text-blueprint-header)',
  /** Thin rules between swim lanes — light grey, visible on canvas and label rail. */
  laneDivider: 'var(--border-blueprint-lane-divider)',
  arrow: 'var(--stroke-blueprint-arrow)',
  /** Side-by-side compare path sections (Figma-style grouping). */
  sectionFill: 'var(--background-blueprint-panel-interior)',
  /** Outermost slide/canvas workspace — sits behind blueprint panels. */
  viewportPad: 'var(--background-blueprint-canvas-ground)',
} as const

/** Set on interactive compare panels; children inherit label-rail hover. */
export const BLUEPRINT_PANEL_LABEL_RAIL_VAR = '--background-blueprint-panel-label-rail'
/** White swimlane / path section surfaces inside interactive panels. */
export const BLUEPRINT_PANEL_CANVAS_VAR = '--background-blueprint-panel-canvas'
export const BLUEPRINT_PANEL_SECTION_FILL_VAR = '--background-blueprint-panel-section'
/** Divider row backgrounds (interaction / visibility bands). */
export const BLUEPRINT_PANEL_DIVIDER_BG_VAR = '--background-blueprint-panel-divider'

export function blueprintPanelLabelRailColor(
  fallback: string = BLUEPRINT_THEME.labelRail,
): string {
  return `var(${BLUEPRINT_PANEL_LABEL_RAIL_VAR}, ${fallback})`
}

export function blueprintPanelCanvasColor(
  fallback: string = BLUEPRINT_THEME.canvas,
): string {
  return `var(${BLUEPRINT_PANEL_CANVAS_VAR}, ${fallback})`
}

export function blueprintPanelSectionFillColor(
  fallback: string = BLUEPRINT_THEME.sectionFill,
): string {
  return `var(${BLUEPRINT_PANEL_SECTION_FILL_VAR}, ${fallback})`
}

export function blueprintPanelDividerBgColor(
  fallback: string = BLUEPRINT_THEME.dividerBg,
): string {
  return `var(${BLUEPRINT_PANEL_DIVIDER_BG_VAR}, ${fallback})`
}

/*
 * There is no `getBlueprintPanelHoverCssVars()` any more. It set the four vars
 * above from React state on hover; `blueprint.css` now sets them in the
 * `[data-phase-scenario-panel]:hover` rule, which is both fewer moving parts
 * and the reason the old React version was removed — a pure-CSS hover cannot
 * go stale the way a hover held in state can.
 */

/**
 * Lane identity — the Radix family each swim lane is drawn from. The steps of
 * that family then supply the surface, hover, pressed, ring and text (see
 * `CELL_STEP`), so a lane is one name rather than five values.
 *
 * The keys are the vocabulary the lane map and Figma share, which is why they
 * survive the move from hex to family. `lime` exists in colors.css only for
 * `chartreuse`: the families Supabase ships leave a gap between amber (40°) and
 * green (140°), and folding that lane into yellow would seat it next to `cream`.
 */
/**
 * The lane set — eight hues plus a neutral, and the board draws from these only.
 *
 * Every other coloured thing on the canvas (annotations, path frames) picks from
 * this list rather than reaching into all eighteen families. A smaller set is
 * what makes the board read as one system instead of a swatch dump.
 *
 * Lanes used to carry their own names — `chartreuse`, `cream`, `powderBlue` —
 * that stopped matching the family behind them once the fills became scale
 * steps. `chartreuse` was `lime`; reading one next to the other invited the
 * reasonable conclusion that the board was off-palette. The names are gone.
 */

export type BlueprintLaneStyle = {
  /** What this lane is. blueprint.css turns the role into its steps. */
  lane: BlueprintLaneRole
  laneLabel: BlueprintLaneRole
  label: string
  accent: string
  accentMuted: BlueprintLaneRole
}

/**
 * Label column text tones — step 1200, the high-contrast text step, in a family
 * that echoes the section's lanes. Previously three invented dark hexes.
 */
export const BLUEPRINT_LABEL_TEXT = {
  frontstage: 'var(--color-green-1200)',
  customerFacing: 'var(--color-purple-1200)',
  backstage: 'var(--color-gold-1200)',
} as const

export type BlueprintLabelSection =
  | 'frontstage'
  | 'customerFacing'
  | 'backstage'

/**
 * Which of the three label tones a lane's name is written in.
 *
 * A section is a position RELATIVE TO THE LINES, so this has to find the
 * lines where they are actually drawn. Asked without the board,
 * `shouldShowInteractionLineAfter` answers for a lane alone and says yes to
 * every customer-side lane, so the search below would stop at the FIRST of
 * them. On a board whose customer side is more than one row deep, that puts
 * the line above rows it is drawn below, and every lane inside the band gets
 * the tone of the zone under the line — painted as though it were on the far
 * side of a boundary the reader can see it is above.
 *
 * Passing `lanes` is the whole fix: exactly one lane then answers yes, the
 * lane the line really follows, and a board with a single customer-side lane
 * gets the answer it always got.
 */
export function getBlueprintLabelSection(
  lane: BlueprintLane,
  lanes: BlueprintLane[],
): BlueprintLabelSection {
  if (isBackstageBlueprintLane(lane, lanes)) {
    return 'backstage'
  }

  const laneIndex = lanes.findIndex((entry) => entry.id === lane.id)
  const interactionAfterIndex = lanes.findIndex((entry) =>
    shouldShowInteractionLineAfter(entry, lanes),
  )
  const visibilityAfterIndex = lanes.findIndex((entry) =>
    shouldShowVisibilityLineAfter(entry, lanes),
  )

  if (
    interactionAfterIndex !== -1 &&
    laneIndex > interactionAfterIndex &&
    (visibilityAfterIndex === -1 || laneIndex <= visibilityAfterIndex)
  ) {
    return 'customerFacing'
  }

  return 'frontstage'
}

export function getBlueprintLabelTextColor(
  section: BlueprintLabelSection,
): string {
  switch (section) {
    case 'frontstage':
      return BLUEPRINT_LABEL_TEXT.frontstage
    case 'customerFacing':
      return BLUEPRINT_LABEL_TEXT.customerFacing
    case 'backstage':
      return BLUEPRINT_LABEL_TEXT.backstage
  }
}

function cellStyleFromFill(
  fill: BlueprintLaneRole,
  label: string = BLUEPRINT_LABEL_TEXT.frontstage,
): BlueprintLaneStyle {
  return {
    lane: fill,
    laneLabel: fill,
    label,
    accent: BLUEPRINT_CELL_BORDER_COLOR,
    accentMuted: fill,
  }
}

const LANE_STYLES: Record<string, BlueprintLaneStyle> = {
  Visual: cellStyleFromFill('storyboard'),
  Storyboard: cellStyleFromFill('storyboard'),
  'Front Stage Tech': cellStyleFromFill('frontstage-touchpoint',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
  'Front Stage Actions': cellStyleFromFill('frontstage-action',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
  'Back Stage Actions': cellStyleFromFill('frontstage-action',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Back Stage Tech': cellStyleFromFill('frontstage-touchpoint',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Support Actions': cellStyleFromFill('support',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Physical Evidence': cellStyleFromFill('evidence',
    BLUEPRINT_LABEL_TEXT.frontstage,
  ),
  'Customer Actions': cellStyleFromFill('actor',
    BLUEPRINT_LABEL_TEXT.frontstage,
  ),
  'Frontstage Actions': cellStyleFromFill('frontstage-touchpoint',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
  'Backstage Actions': cellStyleFromFill('backstage-action',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Tech Support Actions': cellStyleFromFill('backstage-action',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Management Actions': cellStyleFromFill('backstage-action',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  'Computer Systems': cellStyleFromFill('actor',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
}

const FRONTSTAGE_FALLBACK: BlueprintLaneStyle = cellStyleFromFill('support',
  BLUEPRINT_LABEL_TEXT.frontstage,
)

const BACKSTAGE_FALLBACK: BlueprintLaneStyle = cellStyleFromFill('support',
  BLUEPRINT_LABEL_TEXT.backstage,
)

/**
 * Canonical cell fills keyed by `lane_role` — the intentional coloring system.
 * Roles are locale-independent, so non-English lane labels still color correctly
 * (name-keyed `LANE_STYLES` above is the legacy fallback for pre-role content).
 *
 * The keys are the closed eight and nothing else. This map used to disagree
 * with `lanes_lane_role_check` in both directions at once: it carried
 * `journey_stage` and `physical_evidence`, two roles no row can hold, and it
 * had no entry for `partner_actions`, one that rows do hold — so a partner
 * lane fell through to the zone fallback and was drawn in the support fill,
 * which is a lane it is not. Both halves are the same defect: a fourth copy
 * of the roster with nothing holding it. `scripts/tests/lane-role-roster.test.mjs`
 * holds it now.
 */
const ROLE_STYLES: Record<string, BlueprintLaneStyle> = {
  storyboard: cellStyleFromFill('storyboard'),
  customer_actions: cellStyleFromFill('actor',
    BLUEPRINT_LABEL_TEXT.frontstage,
  ),
  frontstage_touchpoints: cellStyleFromFill('frontstage-touchpoint',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
  frontstage_actions: cellStyleFromFill('frontstage-action',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
  backstage_actions: cellStyleFromFill('backstage-action',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  backstage_touchpoints: cellStyleFromFill('evidence',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  support_actions: cellStyleFromFill('support',
    BLUEPRINT_LABEL_TEXT.backstage,
  ),
  /*
   * A partner acts where the customer can see them, so the label reads as
   * customer-facing rather than backstage — and the fill is the one family
   * nothing else on the board uses, because the lane is not the service's own
   * work.
   */
  partner_actions: cellStyleFromFill('partner-action',
    BLUEPRINT_LABEL_TEXT.customerFacing,
  ),
}

export type BlueprintZone = 'frontstage' | 'backstage'

export function getBlueprintLaneStyle(
  laneName: string,
  zone: BlueprintZone,
  role?: string | null,
): BlueprintLaneStyle {
  return (
    (role ? ROLE_STYLES[role] : undefined) ??
    LANE_STYLES[laneName] ??
    (zone === 'backstage' ? BACKSTAGE_FALLBACK : FRONTSTAGE_FALLBACK)
  )
}

export function getBlueprintZoneColor(zone: BlueprintZone): string {
  return zone === 'backstage'
    ? BACKSTAGE_FALLBACK.accent
    : FRONTSTAGE_FALLBACK.accent
}

export function isBackstageBlueprintLane(
  lane: BlueprintLane,
  lanes: BlueprintLane[],
): boolean {
  const visibilityAfterIndex = lanes.findIndex((entry) =>
    shouldShowVisibilityLineAfter(entry, lanes),
  )
  if (visibilityAfterIndex === -1) return false
  const laneIndex = lanes.findIndex((entry) => entry.id === lane.id)
  return laneIndex > visibilityAfterIndex
}

export function getBlueprintLaneZone(
  lane: BlueprintLane,
  lanes: BlueprintLane[],
): BlueprintZone {
  return isBackstageBlueprintLane(lane, lanes) ? 'backstage' : 'frontstage'
}
