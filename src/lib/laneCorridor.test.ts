/**
 * The corridors, and the one thing THEY must never read.
 *
 * A lane used to get arrow headroom because of what it was called: three
 * names — a tutor, a teacher, a discovery rail — were written into the layout
 * module, and any other lane's spanning or backward arrow drew straight over
 * its own cells. The rule is the whole rule, stated on the data: which lane a
 * cell sits in, and which column its step occupies. Every case is therefore
 * posed on lanes named nothing in particular, because a name is not an input.
 *
 * One table, because there is one rule. The single board and the compare
 * each had a copy of it once, and the compare's resolved a canonical lane
 * into each variant while the board's matched by id — the compared-variant
 * case is the one the board's copy would have failed, and the pricing case
 * is what holds the two layouts to one row track now that there is one.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  laneHasInLaneLoopCorridor,
  laneHasOverheadArrowCorridor,
  resolveBlueprintLane,
  rowTrackHeight,
} from '@/lib/laneCorridor'
import { getBlueprintGridMinHeight, getLaneRowMinHeight } from '@/lib/blueprintLayout'
import { buildCompareRowSpecs, buildSideBySideLabelRowSpecs, getCompareRowTrackHeight } from '@/lib/sideBySideCompareLayout'
import type { BlueprintData, BlueprintLane } from '@/types/blueprint'

const lane = (name: string, position: number, id = `lane-${position}`): BlueprintLane => ({
  id,
  name,
  role: null,
  position,
})

/** A four-column board of `laneCount` lanes, one cell per lane per column. */
function board(laneCount: number, idPrefix = 'lane'): { lanes: BlueprintLane[]; data: BlueprintData } {
  const lanes = Array.from({ length: laneCount }, (_, index) =>
    lane(`lane ${index}`, index, `${idPrefix}-${index}`),
  )
  const steps = [0, 1, 2, 3].map((position) => ({ id: `s${position}`, name: `step ${position}`, position }))
  const cells = lanes.flatMap((entry) =>
    steps.map((step) => ({ id: `${entry.id}:${step.id}`, lane_id: entry.id, step_id: step.id })),
  )
  return {
    lanes,
    data: { lanes, steps, cells, dependencies: [] } as unknown as BlueprintData,
  }
}

function withDependencies(data: BlueprintData, ...pairs: Array<[string, string]>): BlueprintData {
  return {
    ...data,
    dependencies: pairs.map(([source_cell_id, target_cell_id]) => ({ source_cell_id, target_cell_id })),
  } as unknown as BlueprintData
}

/** One row of the table: a dependency shape, and what each lane reserves. */
type Case = {
  name: string
  lanes: number
  edges: Array<[string, string]>
  overhead: boolean[]
  loop: boolean[]
}

const CASES: Case[] = [
  {
    name: 'a forward in-lane dependency clearing a column reserves the overhead rail, on that lane only',
    lanes: 3,
    edges: [['lane-1:s0', 'lane-1:s2']],
    overhead: [false, true, false],
    loop: [false, false, false],
  },
  {
    name: 'a neighbouring-column dependency needs no corridor',
    lanes: 2,
    edges: [['lane-0:s0', 'lane-0:s1']],
    overhead: [false, false],
    loop: [false, false],
  },
  {
    name: "a dependency that leaves the lane is not the lane's corridor to reserve",
    lanes: 2,
    edges: [['lane-0:s0', 'lane-1:s3']],
    overhead: [false, false],
    loop: [false, false],
  },
  {
    name: 'a backward in-lane dependency reserves the loop corridor above its row',
    lanes: 3,
    edges: [['lane-2:s3', 'lane-2:s1']],
    overhead: [false, false, false],
    loop: [false, false, true],
  },
  {
    name: 'a backward loop one column wide still reserves the loop corridor',
    lanes: 1,
    edges: [['lane-0:s2', 'lane-0:s1']],
    overhead: [false],
    loop: [true],
  },
  {
    name: 'a lane with neither shape reserves nothing',
    lanes: 2,
    edges: [],
    overhead: [false, false],
    loop: [false, false],
  },
]

for (const entry of CASES) {
  test(entry.name, () => {
    const { lanes, data } = board(entry.lanes)
    const source = withDependencies(data, ...entry.edges)
    lanes.forEach((one, index) => {
      assert.equal(laneHasOverheadArrowCorridor(one, source), entry.overhead[index], `overhead, lane ${index}`)
      assert.equal(laneHasInLaneLoopCorridor(one, source), entry.loop[index], `loop, lane ${index}`)
    })
  })
}

test('the overhead rail is reserved on ANY lane, not on three named ones', () => {
  // The regression. The same shape, moved from lane to lane, must reserve the
  // same corridor every time — the previous rule answered `true` only for
  // lanes called 'Regular Tutor' or 'Teacher'.
  for (const index of [0, 1, 2]) {
    const { lanes, data } = board(3)
    const source = withDependencies(data, [`lane-${index}:s1`, `lane-${index}:s3`])
    assert.equal(laneHasOverheadArrowCorridor(lanes[index]!, source), true, `lane ${index} lost its overhead corridor`)
  }
})

test('a canonical row is answered by every compared variant, under the lane id each variant uses', () => {
  // Compared paths carry their own lane uuids. The canonical row is the
  // first blueprint's lane; the loop is in the SECOND blueprint, whose lane
  // of that name has a different id. Matched by id alone, the row would
  // reserve nothing and the loop would draw over the cells.
  const first = board(2, 'a')
  const second = board(2, 'b')
  const variant = withDependencies(second.data, ['b-1:s3', 'b-1:s0'])
  const canonical = first.lanes[1]!
  assert.equal(resolveBlueprintLane(canonical, variant).id, 'b-1')
  assert.equal(laneHasInLaneLoopCorridor(canonical, [first.data, variant]), true)
  assert.equal(laneHasInLaneLoopCorridor(canonical, first.data), false)
  assert.equal(laneHasOverheadArrowCorridor(canonical, [first.data, variant]), false)
})

test('both layouts price a corridor the same', () => {
  // The single board sums row tracks over its lanes; the compare sums them
  // over its row specs. Same rule, same margins — so one loop on one lane
  // raises each by exactly the loop corridor, and the compare's row track
  // for that lane is the board's row plus the same margin.
  const { lanes, data } = board(2)
  const looped = withDependencies(data, ['lane-1:s3', 'lane-1:s1'])
  assert.equal(
    getBlueprintGridMinHeight(looped) - getBlueprintGridMinHeight(data),
    BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  )
  const specs = buildCompareRowSpecs([looped])
  const row = specs.find((spec) => spec.kind === 'lane' && spec.inLaneLoopCorridorAbove)!
  assert.ok(row, 'the compare row spec reserves the loop corridor')
  assert.equal(
    getCompareRowTrackHeight(row) - row.height,
    BLUEPRINT_IN_LANE_LOOP_CORRIDOR_MARGIN,
  )
  // The compare's track is the one row track over its own row height (which
  // adds the cell shell to the board's lane row) — one rule for one corridor.
  assert.equal(getCompareRowTrackHeight(row), rowTrackHeight(row.height, { inLaneLoopAbove: true }))
  assert.ok(row.height >= getLaneRowMinHeight(lanes[1]!, looped))
})

test('a lane created only on another path stays on the board without borrowing a same-position lane', () => {
  const first = board(1,'first')
  const second = board(1,'second')
  const added = lane('Additional actor',1,'added')
  second.data = {...second.data,lanes:[...second.lanes,added]}
  const rows = buildSideBySideLabelRowSpecs([first.data,second.data])
  assert.ok(rows.some(row=>row.lane?.id === 'added'))
  const unrelated = lane('Only here',0,'only-here')
  assert.equal(resolveBlueprintLane(unrelated,first.data).id,'only-here')
})
