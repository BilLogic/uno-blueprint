/**
 * The arrow-routing situation catalog — the parity net's spine.
 *
 * The trigger-line plan enumerates an S1–S10 catalog of every routing case the
 * arrow engine must handle. This module turns that table into runnable
 * fixtures: for each situation, a synthetic blueprint board (pure data, no DB,
 * no React) whose geometry drives the CURRENT engine (`buildArrowPath` and its
 * siblings in `blueprintArrowGeometry.ts`).
 *
 * ONE source of truth, two consumers:
 *   - the dev-only catalog page (`ArrowSituationCatalogPage`) renders each
 *     board and draws the arrows the engine produces, for eyeball sign-off;
 *   - the golden-geometry snapshot test (`arrowSituationCatalog.test.tsx`)
 *     freezes the `d` strings the engine produces today, so every later
 *     Direction-B slice diffs against this baseline.
 *
 * The engine measures live DOM (`getBoundingClientRect`), so a board is
 * materialised into a real element tree whose rects are pinned to the
 * fixture's boxes — stubbed in jsdom, and equally exact in the browser because
 * the same boxes drive absolute positioning there. The catalog uses generic
 * synthetic cell ids (never the real dependency UUIDs or the numeric cell-id
 * suffixes the hand-tuned routes key on), so it exercises the GENERIC router —
 * the part every view shares and every Direction-B slice touches.
 *
 * Three view modes, one per way the board is drawn:
 *   - `single`        one path, one cell per slot;
 *   - `side-by-side`  the same band with a second, unrelated band present —
 *                     locks the invariant that a neighbour band never perturbs
 *                     a route;
 *   - `integrated`    the merged grid's distinguishing feature: a slot stacks a
 *                     sub-cell per path, so a route that used to run straight
 *                     down a column now meets a stacked neighbour and detours
 *                     (`IntegratedDependencyArrows`, which draws every
 *                     mode on the canvas).
 */

import {
  buildArrowPath,
  buildBidirectionalArrowPath,
  clearAnchorSlotPlan,
  clearArrowCorridorPlan,
  clearRememberedSameColumnSideRoutes,
  findBidirectionalDependencyPairs,
  planAnchorSlots,
  planArrowConfluences,
  planArrowCorridors,
  runArrowMeasurementPass,
  type BidirectionalDependencyLink,
} from '@/lib/blueprintArrowGeometry'

export type ArrowViewMode = 'single' | 'side-by-side' | 'integrated'

export const ARROW_VIEW_MODES: readonly ArrowViewMode[] = [
  'single',
  'side-by-side',
  'integrated',
]

export type Box = { left: number; top: number; width: number; height: number }

export type FixtureDependency = BidirectionalDependencyLink

type FixtureCell = {
  id: string
  stepIndex: number
  box: Box
}

type FixtureRow = {
  key: string
  cells: FixtureCell[]
  /** A wrap corridor band under the lane (loop-back arrows ride it). */
  corridorBelow?: boolean
}

type FixtureGap = {
  gapIndex: number
  box: Box
}

export type BoardSpec = {
  rootBox: Box
  rows: FixtureRow[]
  gaps: FixtureGap[]
  dependencies: FixtureDependency[]
}

export type SituationSpec = {
  id: string
  /** One-line human name, straight from the plan's catalog table. */
  title: string
  /** The plan's "Today" column — what the current engine does. */
  today: string
  /** The plan's "Contract" column — where Direction B is taking it. */
  contract: string
  /** What this fixture concretely exercises in the engine. */
  note: string
  /** Modes that cannot be fixtured, with the reason. */
  unsupported?: Partial<Record<ArrowViewMode, string>>
  /** The single-mode board; other modes are derived from it. */
  base: () => BoardSpec
}

export type ArrowSegment = {
  id: string
  d: string
  /** Absent for an ordinary arrow (it carries a head); a merge trunk/tap sets
   *  it false so the page draws no head where a run only gathers. */
  showMarker?: boolean
}

/** Toggle for the confluence/fan-out merge — the per-scenario off-switch. */
export type ArrowComputeOptions = { mergeConfluences?: boolean }

/* ------------------------------------------------------------------ layout */

const PAD = 40
const COL_W = 160
/**
 * The column gap the synthetic gap elements report. Wider than the app's
 * `STEP_COLUMN_GAP` (24) on purpose: a gutter detour only qualifies when the
 * gap centre clears the card by more than the chevron, so a too-narrow gap
 * would make the merged view decline to route at all. The engine reads the gap
 * element's own box, so this value — not the constant — is what these fixtures
 * exercise.
 */
const COL_GAP = 48
const ROW_H = 100
const ROW_GAP = 48
const WRAP_CORRIDOR_H = 36
/** How far a second band sits below the first in `side-by-side`. */
const NEIGHBOUR_BAND_DY = 900
/** Height of a stacked merged sub-cell, and its gap below the primary cell. */
const MERGE_SUBCELL_H = 60
const MERGE_SUBCELL_GAP = 10

const colLeft = (col: number) => PAD + col * (COL_W + COL_GAP)
const colRight = (col: number) => colLeft(col) + COL_W
const rowTop = (rowIndex: number) => PAD + rowIndex * (ROW_H + ROW_GAP)

function cell(id: string, col: number, rowIndex: number): FixtureCell {
  return {
    id,
    stepIndex: col,
    box: { left: colLeft(col), top: rowTop(rowIndex), width: COL_W, height: ROW_H },
  }
}

/** Column gaps 0..count-1, spanning the whole board height. */
function gapsUpTo(count: number, height = 2000): FixtureGap[] {
  const gaps: FixtureGap[] = []
  for (let g = 0; g < count; g++) {
    gaps.push({
      gapIndex: g,
      box: { left: colRight(g), top: PAD, width: COL_GAP, height },
    })
  }
  return gaps
}

const dep = (
  id: string,
  source: string,
  target: string,
): FixtureDependency => ({
  id,
  source_cell_id: source,
  target_cell_id: target,
})

/* -------------------------------------------------- mode transforms */

/** Deep-ish clone so a transform never mutates a situation's base board. */
function cloneBoard(board: BoardSpec): BoardSpec {
  return {
    rootBox: { ...board.rootBox },
    rows: board.rows.map((row) => ({
      key: row.key,
      corridorBelow: row.corridorBelow,
      cells: row.cells.map((c) => ({ ...c, box: { ...c.box } })),
    })),
    gaps: board.gaps.map((g) => ({ ...g, box: { ...g.box } })),
    dependencies: board.dependencies.map((d) => ({ ...d })),
  }
}

/**
 * `side-by-side`: the same board with a second, unrelated band cloned below
 * it. The arrows still reference the first band, so the geometry must not
 * move — a neighbour band is exactly what should NOT change a route.
 */
function addNeighbourBand(board: BoardSpec): BoardSpec {
  const next = cloneBoard(board)
  const neighbourRows: FixtureRow[] = board.rows.map((row) => ({
    key: `${row.key}--band2`,
    corridorBelow: row.corridorBelow,
    cells: row.cells.map((c) => ({
      id: `${c.id}--band2`,
      stepIndex: c.stepIndex,
      box: { ...c.box, top: c.box.top + NEIGHBOUR_BAND_DY },
    })),
  }))
  next.rows = [...next.rows, ...neighbourRows]
  next.rootBox = {
    ...next.rootBox,
    height: next.rootBox.height + NEIGHBOUR_BAND_DY,
  }
  return next
}

/**
 * `integrated`: the merged grid stacks one sub-cell per path in a slot, so
 * every cell an arrow touches gains a stacked neighbour directly beneath it.
 * Where a route ran straight down that column it now meets the neighbour and
 * detours through a gutter — the merged behaviour the plan calls out.
 *
 * A stack is taller than the lane row that held one card, and the merged
 * grid's row tracks are `minmax(_, auto)`: a slot that grows makes its row
 * taller and pushes every later lane down. So the lanes are re-spaced here
 * too, each keeping the gap it had below its predecessor. Stacking without
 * re-spacing overlapped one lane's sub-cell with the next lane's card — two
 * cards sharing the same pixels, which no grid can produce — and the packed
 * column that came out of it left an arriving head nowhere at all to land.
 */
function addMergedStacks(board: BoardSpec): BoardSpec {
  const next = cloneBoard(board)
  const touched = new Set<string>()
  for (const d of next.dependencies) {
    touched.add(d.source_cell_id)
    touched.add(d.target_cell_id)
  }

  const extentOf = (row: FixtureRow) => ({
    top: Math.min(...row.cells.map((c) => c.box.top)),
    bottom: Math.max(...row.cells.map((c) => c.box.top + c.box.height)),
  })
  const before = next.rows.map(extentOf)

  for (const row of next.rows) {
    const additions: FixtureCell[] = []
    for (const c of row.cells) {
      if (!touched.has(c.id)) continue
      additions.push({
        id: `${c.id}--merge-alt`,
        stepIndex: c.stepIndex,
        box: {
          left: c.box.left,
          top: c.box.top + c.box.height + MERGE_SUBCELL_GAP,
          width: c.box.width,
          height: MERGE_SUBCELL_H,
        },
      })
    }
    row.cells = [...row.cells, ...additions]
  }

  // Top-down, so a lane is re-seated only after everything above it is.
  const order = next.rows
    .map((_row, index) => index)
    .sort((a, b) => before[a]!.top - before[b]!.top)

  let previousIndex: number | null = null
  let previousBottom = 0
  let shift = 0
  for (const index of order) {
    const row = next.rows[index]!
    if (previousIndex !== null) {
      const gap = before[index]!.top - before[previousIndex]!.bottom
      shift = Math.max(0, previousBottom + gap - before[index]!.top)
      for (const c of row.cells) c.box.top += shift
    }
    previousIndex = index
    previousBottom = extentOf(row).bottom
  }

  next.rootBox = { ...next.rootBox, height: next.rootBox.height + shift }
  return next
}

export function boardForMode(base: BoardSpec, mode: ArrowViewMode): BoardSpec {
  switch (mode) {
    case 'single':
      return cloneBoard(base)
    case 'side-by-side':
      return addNeighbourBand(base)
    case 'integrated':
      return addMergedStacks(base)
  }
}

/* ------------------------------------------------ DOM materialisation */

export type MaterialElement = {
  key: string
  parentKey: string | null
  attrs: Record<string, string>
  box: Box
}

export type MaterialBoard = {
  rootBox: Box
  elements: MaterialElement[]
  dependencies: FixtureDependency[]
}

/** Flatten a board into an ordered element list (parents precede children). */
export function materialize(board: BoardSpec): MaterialBoard {
  const elements: MaterialElement[] = []

  for (const row of board.rows) {
    let minLeft = Infinity
    let minTop = Infinity
    let maxRight = -Infinity
    let maxBottom = -Infinity
    for (const c of row.cells) {
      minLeft = Math.min(minLeft, c.box.left)
      minTop = Math.min(minTop, c.box.top)
      maxRight = Math.max(maxRight, c.box.left + c.box.width)
      maxBottom = Math.max(maxBottom, c.box.top + c.box.height)
    }

    const rowBox: Box = {
      left: minLeft,
      top: minTop,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    }
    elements.push({
      key: row.key,
      parentKey: null,
      attrs: { 'data-blueprint-row': '' },
      box: rowBox,
    })

    for (const c of row.cells) {
      elements.push({
        key: c.id,
        parentKey: row.key,
        attrs: {
          'data-blueprint-cell': c.id,
          'data-step-index': String(c.stepIndex),
        },
        box: { ...c.box },
      })
    }

    if (row.corridorBelow) {
      elements.push({
        key: `${row.key}--corridor-below`,
        parentKey: row.key,
        attrs: { 'data-blueprint-wrap-corridor': 'below' },
        box: {
          left: minLeft,
          top: maxBottom,
          width: maxRight - minLeft,
          height: WRAP_CORRIDOR_H,
        },
      })
    }
  }

  for (const g of board.gaps) {
    elements.push({
      key: `gap-${g.gapIndex}`,
      parentKey: null,
      attrs: { 'data-step-gap': String(g.gapIndex) },
      box: { ...g.box },
    })
  }

  return {
    rootBox: { ...board.rootBox },
    elements,
    dependencies: board.dependencies,
  }
}

function pinRect(el: HTMLElement, box: Box): void {
  const rect = {
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    x: box.left,
    y: box.top,
    toJSON() {
      return this
    },
  }
  el.getBoundingClientRect = () => rect as DOMRect
}

/**
 * Build a real (but off-screen) element tree whose rects are pinned to the
 * fixture boxes. Works identically in jsdom and the browser — the engine only
 * ever reads `getBoundingClientRect`, which we own here.
 */
export function buildMeasurementDom(mat: MaterialBoard): {
  root: HTMLElement
  cleanup: () => void
} {
  const doc = document
  const root = doc.createElement('div')
  root.setAttribute('data-arrow-catalog-root', '')
  root.style.position = 'absolute'
  root.style.left = '-100000px'
  root.style.top = '0'
  pinRect(root, { left: 0, top: 0, ...sizeOf(mat.rootBox) })

  const byKey = new Map<string, HTMLElement>()
  for (const spec of mat.elements) {
    const el = doc.createElement('div')
    for (const [name, value] of Object.entries(spec.attrs)) {
      el.setAttribute(name, value)
    }
    pinRect(el, spec.box)
    byKey.set(spec.key, el)
    const parent = spec.parentKey ? byKey.get(spec.parentKey) ?? root : root
    parent.appendChild(el)
  }

  doc.body.appendChild(root)
  return {
    root,
    cleanup: () => {
      root.remove()
    },
  }
}

function sizeOf(box: Box): { width: number; height: number } {
  return { width: box.width, height: box.height }
}

/* -------------------------------------------------- engine invocation */

/**
 * Run the same arrow-building the two overlay consumers run, headless: pair
 * off any bidirectional edges, then route the rest through `buildArrowPath`.
 * Empty `d` strings (the engine's "draw nothing") are dropped, exactly as the
 * consumers drop them.
 */
export function computeArrowSegments(
  root: HTMLElement,
  dependencies: readonly FixtureDependency[],
  options: ArrowComputeOptions = {},
): ArrowSegment[] {
  const mergeConfluences = options.mergeConfluences ?? true
  return runArrowMeasurementPass(() => {
    clearRememberedSameColumnSideRoutes()

    const cellById = new Map<string, HTMLElement>()
    for (const el of root.querySelectorAll<HTMLElement>('[data-blueprint-cell]')) {
      const id = el.getAttribute('data-blueprint-cell')
      if (id !== null && !cellById.has(id)) cellById.set(id, el)
    }

    const segments: ArrowSegment[] = []
    const { pairs, remaining } = findBidirectionalDependencyPairs(
      dependencies.slice(),
    )

    // Slots are allocated over exactly the endpoints `buildArrowPath` draws,
    // in the caller's order — the two overlay consumers do the same.
    planAnchorSlots(root, remaining)

    // Confluence + fan-out: same-side arrivals/departures merge into a trunk
    // before the rest route individually. `disabled` is the off-switch — with
    // it, every member routes on its own and the board draws as it did before.
    const merge = planArrowConfluences(root, remaining, {
      disabled: !mergeConfluences,
    })

    // Co-traveller offsets over the runs the band actually routes (a merged
    // trunk is not a corridor run): two arrows sharing one detour corridor fan
    // onto adjacent lanes instead of drawing one doubled line.
    planArrowCorridors(
      root,
      remaining.filter((dependency) => !merge.consumed.has(dependency.id)),
    )

    for (const pair of pairs) {
      const cellAEl = cellById.get(pair.cellAId)
      const cellBEl = cellById.get(pair.cellBId)
      if (!cellAEl || !cellBEl) continue
      const d = buildBidirectionalArrowPath(cellAEl, cellBEl, root)
      if (!d) continue
      segments.push({ id: `${pair.first.id}-${pair.second.id}`, d })
    }

    for (const segment of merge.segments) {
      segments.push({
        id: segment.id,
        d: segment.d,
        showMarker: segment.showMarker,
      })
    }

    for (const dependency of remaining) {
      if (merge.consumed.has(dependency.id)) continue
      const sourceEl = cellById.get(dependency.source_cell_id)
      const targetEl = cellById.get(dependency.target_cell_id)
      if (!sourceEl || !targetEl) continue
      const d = buildArrowPath(
        sourceEl,
        targetEl,
        root,
        dependency.source_cell_id,
        dependency.target_cell_id,
        dependency.id,
      )
      if (!d) continue
      segments.push({ id: dependency.id, d })
    }

    clearAnchorSlotPlan()
    clearArrowCorridorPlan()
    return segments
  })
}

/** The full path from a board to its arrow segments, DOM built and torn down. */
export function computeSituationSegments(
  board: BoardSpec,
  options: ArrowComputeOptions = {},
): ArrowSegment[] {
  const mat = materialize(board)
  const { root, cleanup } = buildMeasurementDom(mat)
  try {
    return computeArrowSegments(root, board.dependencies, options)
  } finally {
    cleanup()
  }
}

/* ---------------------------------------------------- the catalog */

export const ARROW_SITUATIONS: readonly SituationSpec[] = [
  {
    id: 'S1',
    title: 'Forward, adjacent column',
    today: 'ok',
    contract: 'unchanged',
    note: 'Same lane, source → next column. Routes through the column gap centre (buildAdjacentColumnGapArrowPath).',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 700, height: 260 },
      rows: [{ key: 'lane', cells: [cell('s1-a', 0, 0), cell('s1-b', 1, 0)] }],
      gaps: gapsUpTo(1),
      dependencies: [dep('s1-dep', 's1-a', 's1-b')],
    }),
  },
  {
    id: 'S2',
    title: 'Forward, skip ≥1 column',
    today: 'strikes through cells',
    contract: 'route via column gaps',
    note: 'Same lane, source → two columns on, with an occupied middle column. The obstruction forces the horizontal gutter detour (buildHorizontalGutterDetourPath); the gap-first scorer sends it through the roomier underneath lane rather than the cramped strip overhead.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 900, height: 260 },
      rows: [
        {
          key: 'lane',
          cells: [cell('s2-a', 0, 0), cell('s2-mid', 1, 0), cell('s2-c', 2, 0)],
        },
      ],
      gaps: gapsUpTo(2),
      dependencies: [dep('s2-dep', 's2-a', 's2-c')],
    }),
  },
  {
    id: 'S3',
    title: 'Backward (loop) within a lane',
    today: 'in-lane corridor',
    contract: 'unchanged, but OUT/IN separated by anchor slots',
    note: 'Same lane, later column → earlier column. Drops into the wrap corridor under the lane and loops back (buildWrapArrowPath).',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 900, height: 300 },
      rows: [
        {
          key: 'lane',
          corridorBelow: true,
          cells: [cell('s3-target', 0, 0), cell('s3-source', 2, 0)],
        },
      ],
      gaps: gapsUpTo(2),
      dependencies: [dep('s3-dep', 's3-source', 's3-target')],
    }),
  },
  {
    id: 'S4',
    title: 'Cross-lane, downward',
    today: 'ok',
    contract: 'unchanged',
    note: 'Upper lane → lower lane, forward one column. Exits horizontally, travels the column gap, drops into the target (buildCrossLayerForwardArrowPath).',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 700, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s4-a', 0, 0)] },
        { key: 'lane-lower', cells: [cell('s4-b', 1, 1)] },
      ],
      gaps: gapsUpTo(1),
      dependencies: [dep('s4-dep', 's4-a', 's4-b')],
    }),
  },
  {
    id: 'S5',
    title: 'Cross-lane, upward',
    today: 'wrap corridor',
    contract: 'unchanged',
    note: 'Lower lane, later column → upper lane, earlier column (backward). Rides the wrap corridor below and rises into the target (buildWrapArrowPath).',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 900, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s5-target', 0, 0)] },
        {
          key: 'lane-lower',
          corridorBelow: true,
          cells: [cell('s5-source', 2, 1)],
        },
      ],
      gaps: gapsUpTo(2),
      dependencies: [dep('s5-dep', 's5-source', 's5-target')],
    }),
  },
  {
    id: 'S6',
    title: 'In + out on ONE cell, same side',
    today: 'overlapping at one point',
    contract: 'slot separation (anchor slots)',
    note: 'Cell B is a wrap target of one edge and a wrap source of another; both anchor B’s bottom-centre, so the inbound head and outbound tail land on one point today.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 900, height: 300 },
      rows: [
        {
          key: 'lane',
          corridorBelow: true,
          cells: [cell('s6-y', 0, 0), cell('s6-b', 1, 0), cell('s6-x', 2, 0)],
        },
      ],
      gaps: gapsUpTo(2),
      dependencies: [
        dep('s6-in', 's6-x', 's6-b'),
        dep('s6-out', 's6-b', 's6-y'),
      ],
    }),
  },
  {
    id: 'S7',
    title: 'N sources → one target, same side',
    today: 'N stacked heads',
    contract: 'confluence (one merged trunk)',
    note: 'Two sources arrive on the target’s left edge (one same-lane forward, one cross-lane forward). Auto-detected confluence: they merge into one path-coloured trunk with a single head, each source tapping in.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 700, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s7-a', 0, 0)] },
        {
          key: 'lane-lower',
          cells: [cell('s7-b', 0, 1), cell('s7-target', 1, 1)],
        },
      ],
      gaps: gapsUpTo(1),
      dependencies: [
        dep('s7-a-dep', 's7-a', 's7-target'),
        dep('s7-b-dep', 's7-b', 's7-target'),
      ],
    }),
  },
  {
    id: 'S8',
    title: 'One source → N targets',
    today: 'N separate lines',
    contract: 'shared trunk that fans (confluence mirrored)',
    note: 'One source fans out to two targets (one same-lane forward, one cross-lane forward). Auto-detected fan-out: a single headless trunk leaves the source and fans into a headed drop per target.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 700, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s8-source', 0, 0), cell('s8-t1', 1, 0)] },
        { key: 'lane-lower', cells: [cell('s8-t2', 1, 1)] },
      ],
      gaps: gapsUpTo(1),
      dependencies: [
        dep('s8-t1-dep', 's8-source', 's8-t1'),
        dep('s8-t2-dep', 's8-source', 's8-t2'),
      ],
    }),
  },
  {
    id: 'S9',
    title: 'Merged view: aliased endpoints',
    today: 'dedupe of identical edges',
    contract: 'unchanged + confluence for non-identical',
    note: 'Aliasing only exists once paths share a slot, so this is fixtured in the merged geometry only: two distinct sources reach one shared target sub-cell. Non-identical edges, so the confluence merge applies — one trunk, one head.',
    unsupported: {
      single:
        'aliased endpoints exist only in the merged view — a single band has one cell per slot, so there is nothing to alias.',
      'side-by-side':
        'side-by-side keeps each path in its own band, so no slot is shared and no endpoint aliases.',
    },
    base: () => ({
      rootBox: { left: 0, top: 0, width: 700, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s9-a', 0, 0)] },
        {
          key: 'lane-lower',
          cells: [cell('s9-b', 0, 1), cell('s9-target', 1, 1)],
        },
      ],
      gaps: gapsUpTo(1),
      dependencies: [
        dep('s9-a-dep', 's9-a', 's9-target'),
        dep('s9-b-dep', 's9-b', 's9-target'),
      ],
    }),
  },
  {
    id: 'S10',
    title: 'Chain A→B→C where B is both target and source',
    today: 'B’s in/out can collide',
    contract: 'anchor slots on B',
    note: 'A vertical chain in one column: A → B → C. B carries an inbound anchor (its top) and an outbound anchor (its bottom); the merged stack forces both onto gutter detours.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 520, height: 620 },
      rows: [
        { key: 'lane-a', cells: [cell('s10-a', 0, 0)] },
        { key: 'lane-b', cells: [cell('s10-b', 0, 1)] },
        { key: 'lane-c', cells: [cell('s10-c', 0, 2)] },
      ],
      // A trailing gap gives the merged stack a right-hand gutter to detour
      // through; without it a single-column chain has nowhere to escape.
      gaps: gapsUpTo(1),
      dependencies: [
        dep('s10-ab', 's10-a', 's10-b'),
        dep('s10-bc', 's10-b', 's10-c'),
      ],
    }),
  },
  {
    id: 'S11',
    title: 'Co-travellers share one detour corridor',
    today: 'two runs draw as one doubled line',
    contract: 'offset onto adjacent lanes (gap-first corridors)',
    note: 'Two forward skips in one lane detour through the same gap-first corridor over an overlapping stretch. The scorer routes both through the roomier (underneath) lane, and the offset pass nudges the second onto an adjacent lane so neither is a doubled line. In the merged view the stacked sub-cells crowd the underneath lane, so the scorer sends both overhead instead — the same offset, one gap up.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 1120, height: 320 },
      rows: [
        {
          key: 'lane',
          cells: [
            cell('s11-a', 0, 0),
            cell('s11-b', 1, 0),
            cell('s11-c', 2, 0),
            cell('s11-d', 3, 0),
            cell('s11-e', 4, 0),
          ],
        },
      ],
      gaps: gapsUpTo(4),
      dependencies: [
        dep('s11-dep1', 's11-a', 's11-d'),
        dep('s11-dep2', 's11-b', 's11-e'),
      ],
    }),
  },
  {
    id: 'S12',
    title: 'N sources → one target, from DIFFERENT columns',
    today: 'the merge declines and every source keeps its own head',
    contract: 'confluence, whatever column a member leaves from',
    note: 'Two sources arrive on the target’s left edge from different step columns: one from the column immediately before it, one two columns back in another lane — and the far lane holds no card in the column before the target. The gather is a property of the target’s column, so both still merge into one trunk with a single head; a junction read off whichever member the group lists first would sit inside the arrowhead here and decline.',
    base: () => ({
      rootBox: { left: 0, top: 0, width: 900, height: 420 },
      rows: [
        { key: 'lane-upper', cells: [cell('s12-far', 0, 0)] },
        {
          key: 'lane-lower',
          cells: [cell('s12-near', 1, 1), cell('s12-target', 2, 1)],
        },
      ],
      gaps: gapsUpTo(2),
      dependencies: [
        dep('s12-far-dep', 's12-far', 's12-target'),
        dep('s12-near-dep', 's12-near', 's12-target'),
      ],
    }),
  },
]
