// @vitest-environment jsdom
/**
 * The cell panel's facts, read through the three interfaces that exist to be
 * read — one per reader — and through the one resolution they all hang off.
 *
 * The point of the split is that a reader can only reach what its own reading
 * names, so the tests below assert the KEYS of each reading as well as their
 * values: an overview that could reach the arrows, or a tab row that could
 * reach the clicked placement, would be the wide interface growing back.
 *
 * The board here is invented, and small on purpose: two rows, two columns,
 * one placement and two dependencies — one of each kind — is enough for every
 * question these hooks answer.
 */
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  useCellOverviewFacts,
  useCellPanelFacts,
  useCellTabsFacts,
  useSelectedCell,
} from '@/components/blueprint/cellDetailFacts'
import { LANE_ROLES } from '@/lib/laneRoles'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import type { BlueprintData } from '@/types/blueprint'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'

const KIOSK_ICON = 'https://example.invalid/kiosk.png'
const DOORWAY_FRAME = 'https://example.invalid/doorway.png'

const BOARD: BlueprintData = {
  path: {
    id: 'path-main',
    name: 'Main route',
    summary: null,
    note: null,
    kind: 'happy',
    status: 'live',
  },
  lanes: [
    { id: 'lane-guest', name: 'Guest', role: 'customer_actions', position: 0 },
    {
      id: 'lane-tools',
      name: 'Tools',
      role: 'frontstage_touchpoints',
      position: 1,
    },
  ],
  steps: [
    { id: 'step-arrives', name: 'Arrives', position: 0 },
    { id: 'step-chooses', name: 'Chooses', position: 1 },
  ],
  cells: [
    {
      id: 'cell-guest-arrives',
      lane_id: 'lane-guest',
      step_id: 'step-arrives',
      content: 'Walks up to the desk',
      frame: DOORWAY_FRAME,
      summary: 'The first minute of the visit.',
      touchpoints: [],
      resources: [],
    },
    {
      id: 'cell-tools-arrives',
      lane_id: 'lane-tools',
      step_id: 'step-arrives',
      content: 'Kiosk',
      frame: KIOSK_ICON,
      summary: 'The screen beside the door.',
      touchpoints: [
        {
          id: 'placement-kiosk',
          touchpointId: 'touchpoint-kiosk',
          name: 'Kiosk',
          kind: 'device',
          iconUrl: KIOSK_ICON,
          summary: 'Wakes on approach.',
          role: 'core',
        },
      ],
      resources: [
        {
          id: 'resource-guide',
          name: 'Setup guide',
          kind: 'link',
          url: 'https://example.invalid/guide',
          placementId: 'placement-kiosk',
          featured: true,
        },
      ],
    },
    {
      id: 'cell-guest-chooses',
      lane_id: 'lane-guest',
      step_id: 'step-chooses',
      content: 'Picks a slot',
      frame: null,
      summary: null,
      touchpoints: [],
      resources: [],
    },
  ],
  dependencies: [
    {
      id: 'dependency-onward',
      source_cell_id: 'cell-guest-arrives',
      target_cell_id: 'cell-guest-chooses',
      kind: 'leads_to',
      note: 'The desk hands them the slot list.',
    },
    {
      id: 'dependency-kiosk',
      source_cell_id: 'cell-tools-arrives',
      target_cell_id: 'cell-guest-arrives',
      kind: 'enables',
      note: null,
    },
  ],
}

function selectionFor(
  cellId: string,
  overrides: Partial<BlueprintCellSelection> = {},
): BlueprintCellSelection {
  const cell = BOARD.cells.find((entry) => entry.id === cellId)!
  const step = BOARD.steps.find((entry) => entry.id === cell.step_id)!
  const lane = BOARD.lanes.find((entry) => entry.id === cell.lane_id)!
  return {
    scenarioName: 'Booking',
    phaseName: 'Before',
    laneName: lane.name,
    stepId: step.id,
    stepName: step.name,
    stepIndex: step.position,
    paths: [
      {
        cellId: cell.id,
        pathId: BOARD.path.id,
        pathName: BOARD.path.name,
        pathKind: BOARD.path.kind,
        content: cell.content,
        frame: cell.frame,
        summary: cell.summary,
      },
    ],
    ...overrides,
  }
}

/**
 * The resolution and all three readings, from one render.
 *
 * Together on purpose: a reading is a function of the resolution and of
 * nothing else, so reading them apart would be testing something the panel
 * never does.
 */
function read(
  selection: BlueprintCellSelection | null,
  draft: DraftCellTarget | null = null,
) {
  return renderHook(() => {
    const resolved = useSelectedCell({ blueprints: [BOARD], selection, draft })
    return {
      resolved,
      panel: useCellPanelFacts(resolved),
      overview: useCellOverviewFacts(resolved),
      tabs: useCellTabsFacts(resolved),
    }
  }).result.current
}

describe('the selected cell, resolved once', () => {
  it('reads the cell out of the path’s board, not the selection’s copy of it', () => {
    const selection = selectionFor('cell-tools-arrives')
    // The selection carries a stale sentence; the board is what is shown.
    selection.paths[0]!.summary = 'Stale, from an older click.'

    const { resolved } = read(selection)

    expect(resolved.blueprint).toBe(BOARD)
    expect(resolved.cellId).toBe('cell-tools-arrives')
    expect(resolved.cell?.summary).toBe('The screen beside the door.')
    expect(resolved.cell?.touchpoints).toHaveLength(1)
  })

  it('identifies the lane once, with its tint and what the row means', () => {
    const { resolved } = read(selectionFor('cell-tools-arrives'))

    expect(resolved.lane?.laneName).toBe('Tools')
    expect(resolved.lane?.lane).toEqual({
      name: 'Tools',
      role: 'frontstage_touchpoints',
    })
    // The description is the DEFINITION, not the role's name: the badge above
    // it already prints "Frontstage touchpoints".
    expect(resolved.lane?.description).toBe(
      LANE_ROLES.frontstage_touchpoints.body,
    )
  })

  it('stands in for a lane the board has no row for, and says the role is none', () => {
    const { resolved } = read(
      selectionFor('cell-guest-arrives', { laneName: 'A row nobody drew' }),
    )

    expect(resolved.lane?.lane).toEqual({
      name: 'A row nobody drew',
      role: null,
    })
  })

  it('reads the draft’s lane when nothing is selected, so the new-cell badge is the saved one', () => {
    const { resolved } = read(null, {
      pathId: BOARD.path.id,
      laneId: 'lane-tools',
      stepId: 'step-arrives',
      laneName: 'Tools',
      // Never consulted: the role is re-resolved from the board by lane NAME,
      // so a draft claiming a role the board disagrees with loses.
      laneRole: 'support_actions',
      stepName: 'Arrives',
      stepIndex: 0,
    })

    expect(resolved.cellId).toBeNull()
    expect(resolved.cell).toBeNull()
    expect(resolved.positionLabel).toBeNull()
    expect(resolved.lane?.lane.role).toBe('frontstage_touchpoints')
  })

  it('falls back to the selection’s own copy when the board holds no such cell', () => {
    const selection = selectionFor('cell-guest-arrives')
    selection.paths[0]!.cellId = 'cell-nobody-drew'
    selection.paths[0]!.content = 'What the click carried'

    const { resolved } = read(selection)

    expect(resolved.cellId).toBe('cell-nobody-drew')
    expect(resolved.cell?.content).toBe('What the click carried')
    expect(resolved.cell?.touchpoints).toEqual([])
  })

  it('walks the dependencies once, into the two directions the panel tells apart', () => {
    const { resolved } = read(selectionFor('cell-guest-arrives'))

    expect(resolved.connections.outgoing.map((entry) => entry.cellId)).toEqual([
      'cell-guest-chooses',
    ])
    expect(resolved.connections.incoming.map((entry) => entry.cellId)).toEqual([
      'cell-tools-arrives',
    ])
  })
})

describe('the drawer’s reading', () => {
  const panelFacts = (selection: BlueprintCellSelection) =>
    read(selection).panel

  it('names the cell’s position and its dependencies, and nothing the tabs or the overview read', () => {
    expect(Object.keys(panelFacts(selectionFor('cell-guest-arrives'))).sort())
      .toEqual([
        'blueprint',
        'cellId',
        'dependencyCandidates',
        'dependencySource',
        'existingDependencies',
        'lane',
        'pathEntry',
        'storyboardStepEntries',
      ])
  })

  it('offers every other cell of this version as a target, column number first', () => {
    const facts = panelFacts(selectionFor('cell-guest-arrives'))

    expect(facts.dependencyCandidates.map((entry) => entry.label)).toEqual([
      '1. Arrives · Tools',
      '2. Chooses · Guest',
    ])
    expect(
      facts.dependencyCandidates.some(
        (entry) => entry.cellId === 'cell-guest-arrives',
      ),
    ).toBe(false)
  })

  it('carries only the dependencies this cell is the source of', () => {
    const facts = panelFacts(selectionFor('cell-guest-arrives'))

    expect(facts.existingDependencies).toEqual([
      {
        id: 'dependency-onward',
        targetCellId: 'cell-guest-chooses',
        targetLabel: '2. Chooses · Guest',
        kind: 'leads_to',
        note: 'The desk hands them the slot list.',
      },
    ])
    expect(facts.dependencySource).toEqual({
      cellId: 'cell-guest-arrives',
      pathId: 'path-main',
      label: '1. Arrives · Guest',
    })
  })

  it('carries the column’s strip, and a touchpoint row’s logo is not in it', () => {
    // Two things at once, which is what this column is shaped to show. The
    // strip is the COLUMN's, not the selected row's: the guest row's own frame
    // is in it whichever cell of the column is selected. And the kiosk's frame
    // is not, because it sits on a touchpoint row, where a frame is the
    // touchpoint's logo rather than a drawn moment — the cell keeps it, and
    // the overview below still reads it.
    const arrivesStrip = {
      frame: DOORWAY_FRAME,
      label: 'Guest',
      laneName: 'Guest',
      summary: 'The first minute of the visit.',
    }

    expect(
      panelFacts(selectionFor('cell-guest-arrives')).storyboardStepEntries,
    ).toEqual([arrivesStrip])
    expect(
      panelFacts(selectionFor('cell-tools-arrives')).storyboardStepEntries,
    ).toEqual([arrivesStrip])
    expect(
      panelFacts(selectionFor('cell-guest-chooses')).storyboardStepEntries,
    ).toEqual([])
  })
})

describe('the overview’s reading', () => {
  const overviewFacts = (selection: BlueprintCellSelection) =>
    read(selection).overview

  it('names the cell’s own fields and its placement, and no dependency at all', () => {
    expect(
      Object.keys(overviewFacts(selectionFor('cell-tools-arrives'))).sort(),
    ).toEqual([
      'cellId',
      'featured',
      'frame',
      'lane',
      'placement',
      'resources',
      'touchpointDetail',
      'touchpoints',
    ])
  })

  it('resolves the clicked placement once, and reads it separately from the row', () => {
    const facts = overviewFacts(
      selectionFor('cell-tools-arrives', { techItem: 'Kiosk' }),
    )

    expect(facts.placement?.id).toBe('placement-kiosk')
    // The row says `summary`; the READING says `text`, and falls back to the
    // cell's sentence where the row has none. The editor is seeded from the
    // row, which is why the two are separate keys.
    expect(facts.placement?.summary).toBe('Wakes on approach.')
    expect(facts.touchpointDetail).toEqual({
      id: 'placement-kiosk',
      name: 'Kiosk',
      text: 'Wakes on approach.',
      kind: 'device',
      role: 'core',
    })
  })

  it('keeps the clicked placement by its row when a rename changes its name under the panel', () => {
    // The selection still says the name it was clicked under; the board has
    // been refetched with the registry's new one, on the same row.
    const renamedBoard = (name: string | null): BlueprintData => ({
      ...BOARD,
      cells: BOARD.cells.map((cell) =>
        cell.id !== 'cell-tools-arrives'
          ? cell
          : {
              ...cell,
              content: name ?? '',
              touchpoints:
                name === null ? [] : cell.touchpoints!.map((entry) => ({ ...entry, name })),
            },
      ),
    })
    const selection = selectionFor('cell-tools-arrives', { techItem: 'Kiosk' })
    const { result, rerender } = renderHook(
      ({ blueprints }: { blueprints: BlueprintData[] }) =>
        useCellOverviewFacts(useSelectedCell({ blueprints, selection, draft: null })),
      { initialProps: { blueprints: [BOARD] } },
    )
    expect(result.current.placement?.id).toBe('placement-kiosk')

    rerender({ blueprints: [renamedBoard('Welcome kiosk')] })
    expect(result.current.placement?.id).toBe('placement-kiosk')
    expect(result.current.placement?.name).toBe('Welcome kiosk')
    expect(result.current.touchpointDetail?.name).toBe('Welcome kiosk')

    // A placement taken out of the text has no row left to find.
    rerender({ blueprints: [renamedBoard(null)] })
    expect(result.current.placement).toBeNull()
  })

  it('leads with the placement’s featured link, and with the frame as stored', () => {
    const facts = overviewFacts(
      selectionFor('cell-tools-arrives', { techItem: 'Kiosk' }),
    )

    expect(facts.frame).toBe(KIOSK_ICON)
    expect(facts.resources.map((entry) => entry.name)).toEqual(['Setup guide'])
    expect(facts.featured.buttons.map((button) => button.name)).toEqual([
      'Setup guide',
    ])
    expect(facts.lane?.role).toBe('frontstage_touchpoints')
  })
})

describe('the tab row’s reading', () => {
  const tabsFacts = (selection: BlueprintCellSelection) =>
    read(selection).tabs

  it('names the dependencies and the two lists its Resources tab renders, and no placement', () => {
    expect(Object.keys(tabsFacts(selectionFor('cell-guest-arrives'))).sort())
      .toEqual([
        'cellId',
        'connections',
        'frame',
        'otherTech',
        'resources',
        'selectedLaneRowPosition',
        'touchpoints',
      ])
  })

  it('reads the tech reached through a dependency, named by the row it sits in', () => {
    const facts = tabsFacts(selectionFor('cell-guest-arrives'))

    expect(facts.otherTech).toEqual([
      {
        id: 'cell-tools-arrives:Kiosk',
        cellId: 'cell-tools-arrives',
        item: 'Kiosk',
        laneName: 'Tools',
        stepIndex: 0,
      },
    ])
  })

  it('says which row the cell sits in, so a same-column dependency knows up from down', () => {
    expect(tabsFacts(selectionFor('cell-guest-arrives')).selectedLaneRowPosition)
      .toBe(0)
    expect(tabsFacts(selectionFor('cell-tools-arrives')).selectedLaneRowPosition)
      .toBe(1)
  })
})
