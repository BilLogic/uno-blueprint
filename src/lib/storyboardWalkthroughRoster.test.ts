import { describe, expect, it } from 'vitest'
import {
  BACKSTAGE_TOUCHPOINTS_ROLE,
  CUSTOMER_ACTIONS_ROLE,
  FRONTSTAGE_ACTIONS_ROLE,
  FRONTSTAGE_TOUCHPOINTS_ROLE,
  STORYBOARD_ROLE,
} from '@/lib/laneRoles'
import {
  resolveStoryboardStripEntries,
  resolveStoryboardCellRows,
  stepHasStoryboardWalkthroughLaneCells,
} from '@/lib/storyboardWalkthrough'
import type { BlueprintCell, BlueprintLane } from '@/types/blueprint'

/*
  The roster is decided in one place and the stack, the strip, the deck and
  the "has this step anything to walk through" test all read it, so what a
  touchpoint lane is worth to a walkthrough is asserted here rather than four
  times over in the components.

  A touchpoint cell carries a frame the way every cell does now, but that
  frame is the touchpoint's logo — filled in when the touchpoint was placed —
  and a logo is not a moment. So the fixture gives a frame to a touchpoint
  lane and to an action lane in the same step, and the strip keeps one.
*/

const lane = (
  id: string,
  name: string,
  role: string,
  position: number,
): BlueprintLane => ({ id, name, role, position })

const LANES: BlueprintLane[] = [
  lane('lane-storyboard', 'Storyboard', STORYBOARD_ROLE, 0),
  lane('lane-customer', 'Applicant', CUSTOMER_ACTIONS_ROLE, 1),
  lane(
    'lane-front-tp',
    'Tools the applicant meets',
    FRONTSTAGE_TOUCHPOINTS_ROLE,
    2,
  ),
  lane('lane-front', 'Front desk', FRONTSTAGE_ACTIONS_ROLE, 3),
  lane('lane-back-tp', 'Systems', BACKSTAGE_TOUCHPOINTS_ROLE, 4),
]

const cell = (
  laneId: string,
  content: string,
  frame: string | null,
): BlueprintCell => ({
  id: `${laneId}-cell`,
  lane_id: laneId,
  step_id: 'step-1',
  content,
  frame,
  summary: null,
})

describe('the walkthrough roster leaves out the touchpoint lanes', () => {
  it('keeps an action lane’s frame and drops a touchpoint lane’s logo', () => {
    const blueprint = {
      lanes: LANES,
      cells: [
        cell('lane-storyboard', '', 'storyboard/step-1.png'),
        cell('lane-front', 'Checks the papers', 'frames/front-desk.png'),
        cell('lane-front-tp', 'Booking app', 'logos/booking-app.svg'),
        cell('lane-back-tp', 'Case system', 'logos/case-system.svg'),
      ],
    }

    const entries = resolveStoryboardStripEntries(blueprint, 'step-1')

    expect(entries.map((entry) => entry.frame)).toEqual([
      'frames/front-desk.png',
    ])
    expect(entries.map((entry) => entry.laneName)).toEqual(['Front desk'])
  })

  it('reports no walkthrough cells when only touchpoint cells are framed', () => {
    const blueprint = {
      lanes: LANES,
      cells: [
        cell('lane-front-tp', 'Booking app', 'logos/booking-app.svg'),
        cell('lane-back-tp', 'Case system', 'logos/case-system.svg'),
      ],
    }

    expect(stepHasStoryboardWalkthroughLaneCells(blueprint, 'step-1')).toBe(
      false,
    )
  })

  it('still reports walkthrough cells when an action lane has one', () => {
    const blueprint = {
      lanes: LANES,
      cells: [
        cell('lane-customer', 'Arrives', null),
        cell('lane-front-tp', 'Booking app', 'logos/booking-app.svg'),
      ],
    }

    expect(stepHasStoryboardWalkthroughLaneCells(blueprint, 'step-1')).toBe(
      true,
    )
  })
})

it('the edit roster includes existing unpictured cells but never invents a missing cell', () => {
  const blueprint = { lanes: LANES, cells: [cell('lane-customer', '', null)] }
  expect(
    resolveStoryboardCellRows(blueprint, 'step-1').map((row) => row.cell.id),
  ).toEqual(['lane-customer-cell'])
  expect(resolveStoryboardStripEntries(blueprint, 'step-1')).toEqual([])
})
