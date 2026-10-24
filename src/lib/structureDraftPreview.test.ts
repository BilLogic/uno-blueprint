import { expect, it } from 'vitest'
import {
  previewStructureSeam,
  previewStructureDraft,
  previewPendingStructureDraft,
  STRUCTURE_SEAM_ID,
} from './structureDraftPreview'
import { buildCompareGridTracks } from './compareGridTracks'
import { buildSideBySideLabelRowSpecs } from './sideBySideCompareLayout'
import type { BlueprintData } from '@/types/blueprint'

const board: BlueprintData = {
  path: {
    id: 'path',
    name: 'Default',
    summary: null,
    note: null,
    kind: 'happy',
    status: 'live',
  },
  steps: [
    { id: 'start', name: 'Start', position: 4 },
    { id: 'finish', name: 'Finish', position: 9 },
  ],
  lanes: [
    { id: 'actor', name: 'Actor', position: 3 },
    { id: 'support', name: 'Support', position: 8 },
  ],
  cells: [],
  dependencies: [],
}

it('parts the rendered column axis without changing any saved position', () => {
  const [projected] = previewStructureSeam([board], {
    key: 'step:path:9',
    kind: 'step',
    pathId: 'path',
    atPosition: 9,
    size: 34,
  })
  expect(projected.steps.map((step) => step.id)).toEqual([
    'start',
    STRUCTURE_SEAM_ID,
    'finish',
  ])
  expect(
    buildCompareGridTracks(null, [projected]).map((track) => track.seamSize),
  ).toEqual([undefined, 34, undefined])
  expect(
    projected.steps.filter((step) => step.id !== STRUCTURE_SEAM_ID),
  ).toEqual(board.steps)
  expect(board.steps).toHaveLength(2)
})
it('parts the rendered lane axis at a stored position with no cell or divider in the seam', () => {
  const [projected] = previewStructureSeam([board], {
    key: 'lane:path:8',
    kind: 'lane',
    pathId: 'path',
    atPosition: 8,
    size: 68,
  })
  const rows = buildSideBySideLabelRowSpecs([projected])
  const seam = rows.find((row) => row.lane?.id === STRUCTURE_SEAM_ID)!
  expect(seam.height).toBe(68)
  expect(seam.wrapCorridorAbove).toBeUndefined()
  expect(seam.showDividerBelow).toBeUndefined()
  expect(
    projected.lanes.filter((lane) => lane.id !== STRUCTURE_SEAM_ID),
  ).toEqual(board.lanes)
})

it('keeps the comparison axis stable while inserting a hover track into it', async () => {
  const { buildCompareModel } = await import('./compareSlots')
  const other = {
    ...board,
    path: { ...board.path, id: 'other', name: 'Other' },
  }
  const model = buildCompareModel([board, other])
  const projected = previewStructureSeam([board, other], {
    key: 'step:path:9',
    kind: 'step',
    pathId: 'path',
    atPosition: 9,
    size: 34,
  })
  const before = buildCompareGridTracks(model, [board, other])
  const during = buildCompareGridTracks(model, projected)
  expect(during.filter((track) => track.seamSize === undefined)).toEqual(before)
  expect(during[1].seamSize).toBe(34)
})

it('keeps semantic divider anchors on saved lanes while a draft is being placed', () => {
  const source = {
    ...board,
    lanes: [
      { id: 'person', name: 'Person', role: 'customer_actions', position: 0 },
      { id: 'desk', name: 'Desk', role: 'frontstage_touchpoints', position: 1 },
      { id: 'staff', name: 'Staff', role: 'frontstage_actions', position: 2 },
      { id: 'back', name: 'Support', role: 'backstage_actions', position: 3 },
    ],
  }
  const anchors = (data: BlueprintData) =>
    buildSideBySideLabelRowSpecs([data])
      .filter((row) => row.kind !== 'lane')
      .map((row) => row.key)
  const [hover] = previewStructureSeam([source], {
    kind: 'lane',
    pathId: 'path',
    atPosition: 2,
    size: 34,
    key: 'between',
  })
  expect(anchors(hover)).toEqual(anchors(source))
  const [draft] = previewStructureDraft([source], {
    kind: 'lane',
    name: 'Reviewer',
    role: 'customer_actions',
    clickedPathId: 'path',
    paths: [],
    orders: [
      { pathId: 'path', order: ['person', 'desk', 'new', 'staff', 'back'] },
    ],
  })
  expect(anchors(draft)).toEqual(anchors(source))
})

it.each(['lane', 'step'] as const)(
  'shows the %s destination before path metadata is available',
  (kind) => {
    const draft =
      kind === 'lane'
        ? { kind, scenarioId: 'scenario', pathId: 'path', atPosition: 8 }
        : { kind, pathId: 'path', atPosition: 9 }
    const [pending] = previewPendingStructureDraft([board], draft)
    const items = kind === 'lane' ? pending.lanes : pending.steps
    expect(items.map((item) => item.name)).toEqual(
      kind === 'lane'
        ? ['Actor', 'New lane', 'Support']
        : ['Start', 'New step', 'Finish'],
    )
    expect(items[1].id).toBe('structure-placeholder')
    expect(items[1].seamSize).toBeUndefined()
  },
)

it('opens a seam above a semantic divider without moving the divider into the slot', () => {
  const source = {...board, lanes:[{...board.lanes[0],role:'customer_actions'},{...board.lanes[1],role:'frontstage_actions'}]}
  const [projected] = previewStructureSeam([source], {
    key:'lane:path:8:above', kind:'lane', pathId:'path', atPosition:8, size:28,
    beforeDivider:true,
  })
  const rows = buildSideBySideLabelRowSpecs([projected])
  expect(rows.findIndex(row=>row.lane?.id===STRUCTURE_SEAM_ID)).toBeLessThan(rows.findIndex(row=>row.kind==='interaction'))
})

it.each(['loading', 'ready'])('keeps the upper destination in the %s roleless draft', (state) => {
  const source = {...board, lanes:[{...board.lanes[0],role:'customer_actions'},{...board.lanes[1],role:'frontstage_actions'}]}
  const projected = state === 'loading'
    ? previewPendingStructureDraft([source], {kind:'lane',pathId:'path',scenarioId:'scenario',atPosition:8,beforeDivider:true})
    : previewStructureDraft([source], {kind:'lane',name:'',orders:[{pathId:'path',order:['actor','new','support']}],paths:[]}, true)
  const rows = buildSideBySideLabelRowSpecs(projected)
  expect(rows.findIndex(row=>row.lane?.id==='structure-placeholder')).toBeLessThan(rows.findIndex(row=>row.kind==='interaction'))
})
