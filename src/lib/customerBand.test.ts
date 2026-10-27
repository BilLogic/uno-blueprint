/**
 * The customer side of a board is a BAND, and a band has one floor.
 *
 * The line of interaction is the boundary between the people the service is
 * for and the machinery that serves them, so a board draws it once however
 * many rows sit on the customer's own side. Four things decide where it goes
 * or read where it went — the renderer, the divider-row count, the corridor
 * reserved under a row, and the tone a lane label is written in — and each
 * has to ask the question about the BOARD. Ask it about a lane alone and the
 * answer is the old one, which is right only while the band is one row deep.
 *
 * Every assertion below states a position relative to the line, or an
 * equality between what is counted and what is drawn. None of them counts the
 * boards that happen to have a deep customer side: such a count would pass on
 * the day it was written and say nothing about the rule.
 */
import { describe, expect, it } from 'vitest'
import {
  countBlueprintDividerRows,
  countBlueprintWrapCorridorMargins,
  laneHasWrapCorridorBelow,
  lanePrecedesBlueprintDivider,
  shouldShowInteractionLineAfter,
} from '@/lib/blueprintLayout'
import { getBlueprintLabelSection } from '@/lib/blueprintTheme'
import { buildSideBySideLabelRowSpecs } from '@/lib/sideBySideCompareLayout'
import {
  BACKSTAGE_ACTIONS_ROLE,
  BACKSTAGE_TOUCHPOINTS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  STORYBOARD_ROLE,
  SUPPORT_ACTIONS_ROLE,
} from '@/lib/laneRoles'
import type { BlueprintData, BlueprintLane } from '@/types/blueprint'

/** Lanes in board order. The names say nothing — every rule here reads roles. */
function rows(...roles: (string | null)[]): BlueprintLane[] {
  return roles.map((role, index) => ({
    id: `lane-${index}`,
    name: `however row ${index} happens to be labelled`,
    role,
    position: index,
  }))
}

/** A whole stack whose customer side is two rows deep. */
const TWO_DEEP = rows(
  STORYBOARD_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_TOUCHPOINTS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
  SUPPORT_ACTIONS_ROLE,
)

/** The same stack with one customer-side row, which is what boards have today. */
const ONE_DEEP = rows(
  STORYBOARD_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  BACKSTAGE_TOUCHPOINTS_ROLE,
  BACKSTAGE_ACTIONS_ROLE,
  SUPPORT_ACTIONS_ROLE,
)

/** Which rows the line of interaction is drawn after, by index. */
function interactionLinesAfter(lanes: BlueprintLane[]): number[] {
  return lanes.flatMap((lane, index) =>
    shouldShowInteractionLineAfter(lane, lanes) ? [index] : [],
  )
}

describe('the line of interaction closes the band, once', () => {
  it('draws one line after the second of two customer-side lanes', () => {
    expect(interactionLinesAfter(TWO_DEEP)).toEqual([2])
  })

  it('leaves a single customer-side lane exactly where it was', () => {
    expect(interactionLinesAfter(ONE_DEEP)).toEqual([1])
  })

  it('keeps an unrole’d row under the spine above the line', () => {
    // Sample board: Stakeholders (null) dragged below Blueprint owner.
    const lanes = rows(CUSTOMER_ACTIONS_ROLE, null, FRONTSTAGE_ACTIONS_ROLE)
    expect(interactionLinesAfter(lanes)).toEqual([1])
  })

  it('draws no line on a board with no customer side at all', () => {
    const lanes = rows(FRONTSTAGE_ACTIONS_ROLE, BACKSTAGE_ACTIONS_ROLE)
    expect(interactionLinesAfter(lanes)).toEqual([])
  })

  it('answers as it always did for a lane asked without a board', () => {
    // No board means no band to be last in, so the lane is its own band.
    // That is what keeps every caller that cannot supply lanes correct.
    expect(shouldShowInteractionLineAfter(TWO_DEEP[1]!)).toBe(true)
    expect(shouldShowInteractionLineAfter(TWO_DEEP[0]!)).toBe(false)
  })
})

describe('what the grid counts is what the board draws', () => {
  it('reserves a corridor only under the row the line follows', () => {
    // The corridor exists because the standard blueprint already leaves a gap
    // between that row and the line beneath it. A row inside the band has no
    // line beneath it, so it has no gap to route a backward loop through.
    expect(laneHasWrapCorridorBelow(TWO_DEEP[1]!, TWO_DEEP)).toBe(false)
    expect(laneHasWrapCorridorBelow(TWO_DEEP[2]!, TWO_DEEP)).toBe(true)
  })

  it('adds a lane row, not a divider row, when the band deepens', () => {
    // Both counts are read as HEIGHT — each is multiplied by a row constant
    // and added to the artboard — so a count that disagrees with the renderer
    // is a grid taller than its own contents by exactly what it over-counted.
    expect(countBlueprintDividerRows(TWO_DEEP)).toBe(
      countBlueprintDividerRows(ONE_DEEP),
    )
    expect(countBlueprintWrapCorridorMargins(TWO_DEEP)).toBe(
      countBlueprintWrapCorridorMargins(ONE_DEEP),
    )
  })

  it('counts the divider rows the board itself says precede a divider', () => {
    for (const lanes of [ONE_DEEP, TWO_DEEP]) {
      expect(countBlueprintDividerRows(lanes)).toBe(
        lanes.filter((lane) => lanePrecedesBlueprintDivider(lane, lanes))
          .length,
      )
    }
  })
})

/** A board with no cells: these rows are decided by the lane stack alone. */
function emptyBoard(lanes: BlueprintLane[]): BlueprintData {
  return {
    path: { id: 'path-1', name: 'a path' },
    lanes,
    steps: [{ id: 'step-1', name: 'a step', position: 0 }],
    cells: [],
    dependencies: [],
  } as unknown as BlueprintData
}

/** Lane rows the rail opens a corridor under, by lane id. */
function corridorsBelow(lanes: BlueprintLane[]): string[] {
  return buildSideBySideLabelRowSpecs([emptyBoard(lanes)])
    .filter((row) => row.kind === 'lane' && row.wrapCorridorBelow)
    .map((row) => row.key)
}

/** Lane rows the rail draws a line of interaction after, by lane id. */
function railInteractionRowsAfter(lanes: BlueprintLane[]): string[] {
  const specs = buildSideBySideLabelRowSpecs([emptyBoard(lanes)])
  return specs.flatMap((row, index) =>
    row.kind === 'interaction' ? [specs[index - 1]!.key] : [],
  )
}

describe('the rail beside a deep customer side', () => {
  it('opens a corridor under the row it draws the line after, and no other', () => {
    // Asserted against the rail's own interaction row rather than a lane
    // index: these are the same fact, and the defect was that they disagreed.
    expect(corridorsBelow(TWO_DEEP)).toEqual(railInteractionRowsAfter(TWO_DEEP))
    expect(corridorsBelow(ONE_DEEP)).toEqual(railInteractionRowsAfter(ONE_DEEP))
    expect(corridorsBelow(TWO_DEEP)).toEqual(['lane-2'])
  })

  it('letters a lane inside the band as sitting above the line', () => {
    // `customerFacing` is the tone of the zone BETWEEN the two lines. A row
    // still inside the customer band is above the upper one, and giving it
    // that tone puts it, to a reader, on the far side of a boundary they can
    // plainly see it is above.
    expect(TWO_DEEP.map((lane) => getBlueprintLabelSection(lane, TWO_DEEP)))
      .toEqual([
        'frontstage',
        'frontstage',
        'frontstage',
        'customerFacing',
        'customerFacing',
        'backstage',
        'backstage',
        'backstage',
      ])
  })

  it('repaints nothing below the band when the band deepens', () => {
    const two = TWO_DEEP.map((lane) => getBlueprintLabelSection(lane, TWO_DEEP))
    const one = ONE_DEEP.map((lane) => getBlueprintLabelSection(lane, ONE_DEEP))
    expect(two.slice(3)).toEqual(one.slice(2))
  })
})
