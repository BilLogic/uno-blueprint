import { expect, it } from 'vitest'
import {
  previewStructureSeam,
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
