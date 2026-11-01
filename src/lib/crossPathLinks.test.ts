/**
 * A link that leaves its path, from the read to the board.
 *
 * One path's board is read at a time, and its edges arrive as ids. A
 * dependency may join cells on any two paths of one service, so the far end
 * has to be named — from a board the canvas already holds, or by the one
 * follow-up read — the board has to keep the link out of its arrows, and the
 * cell at this end has to know it carries one.
 *
 * The service here is invented: one scenario with two paths, and a second
 * scenario in another phase.
 */
import { describe, expect, it, vi } from 'vitest'
import { normalizeBlueprint, type RawPath } from '@/lib/normalizeBlueprint'
import {
  crossPathLinksByCell,
  crossPathLinksFor,
  inPathDependencies,
} from '@/lib/crossPathLinks'
import {
  fetchRemoteCells,
  remoteCellFromRow,
  remoteCellsFromBoards,
  unnamedFarEnds,
  withRemoteCells,
} from '@/lib/remoteCells'
import { getComparePathArrowData } from '@/lib/sideBySideCompareLayout'
import type { BlueprintData } from '@/types/blueprint'

const GOALS = { id: 'scenario-goals', name: 'Goal setting', phases: { name: 'Term' } }
const REPORT = { id: 'scenario-report', name: 'Weekly class report', phases: { name: 'Week' } }

function cell(id: string, step: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    lane_id: 'lane-tutor',
    step_id: step,
    content: `Cell ${id}`,
    frame: null,
    summary: null,
    resources: [],
    cell_touchpoints: [],
    outgoing: [],
    incoming: [],
    ...extra,
  }
}

function path(
  id: string,
  name: string,
  scenario: typeof GOALS,
  cells: unknown[],
): RawPath {
  return {
    id,
    name,
    kind: 'happy',
    scenario_id: scenario.id,
    scenarios: { name: scenario.name, phases: scenario.phases },
    lanes: [{ id: 'lane-tutor', name: 'Tutor', lane_role: null, position: 0 }],
    path_steps: [
      { position: 0, steps: { id: 'step-1', name: 'Sets a goal' } },
      { position: 1, steps: { id: 'step-2', name: 'Reviews it' } },
    ],
    cells: cells as RawPath['cells'],
  }
}

const MAIN = normalizeBlueprint(
  path('path-main', 'Main route', GOALS, [
    cell('cell-a', 'step-1', {
      // In-path: arrives again under cell-b's `incoming`, and is one edge.
      outgoing: [{ id: 'edge-in-path', target_cell_id: 'cell-b', kind: 'leads_to' }],
    }),
    cell('cell-b', 'step-2', {
      outgoing: [
        { id: 'edge-to-report', target_cell_id: 'cell-report', kind: 'leads_to' },
        { id: 'edge-enables-detour', target_cell_id: 'cell-detour', kind: 'enables' },
      ],
      incoming: [
        { id: 'edge-in-path', source_cell_id: 'cell-a', kind: 'leads_to' },
        { id: 'edge-from-detour', source_cell_id: 'cell-detour', kind: 'leads_to' },
      ],
    }),
  ]),
)
const DETOUR = normalizeBlueprint(
  path('path-detour', 'Missed session', GOALS, [
    cell('cell-detour', 'step-2', { content: 'Books a catch-up' }),
  ]),
)

/** The report scenario is not on the canvas: its cell comes from the follow-up read. */
const REPORT_ROW = {
  id: 'cell-report',
  content: 'Writes the weekly report',
  lanes: { name: 'Tutor' },
  steps: { name: 'Writes it up' },
  paths: { id: 'path-report', name: 'Main route', scenarios: REPORT },
}

function named(): BlueprintData {
  const loaded = remoteCellsFromBoards([MAIN, DETOUR])
  loaded.set('cell-report', remoteCellFromRow(REPORT_ROW)!)
  return withRemoteCells(MAIN, loaded)
}

describe('the read', () => {
  it('holds every edge touching the path once, arrivals from other paths included', () => {
    expect(MAIN.dependencies.map((edge) => edge.id).sort()).toEqual([
      'edge-enables-detour',
      'edge-from-detour',
      'edge-in-path',
      'edge-to-report',
    ])
    expect(MAIN.dependencies.find((edge) => edge.id === 'edge-from-detour'))
      .toMatchObject({ source_cell_id: 'cell-detour', target_cell_id: 'cell-b' })
  })

  it('says which scenario the path is in', () => {
    expect(MAIN.path).toMatchObject({
      scenarioId: GOALS.id,
      scenarioName: GOALS.name,
      phaseName: 'Term',
    })
  })
})

describe('naming the far ends', () => {
  it('names an end on a loaded board from that board, and asks only for the rest', () => {
    const loaded = remoteCellsFromBoards([MAIN, DETOUR])
    expect(loaded.get('cell-detour')).toMatchObject({
      pathName: 'Missed session',
      scenarioName: 'Goal setting',
      laneName: 'Tutor',
      stepName: 'Reviews it',
    })
    expect(unnamedFarEnds([MAIN, DETOUR], loaded)).toEqual(['cell-report'])
  })

  it('asks for nothing when every link stays on its path', () => {
    const inPathOnly = { ...MAIN, dependencies: inPathDependencies(MAIN) }
    expect(unnamedFarEnds([inPathOnly], remoteCellsFromBoards([inPathOnly]))).toEqual([])
  })

  it('makes no request for no ids, and one request for many', async () => {
    const calls: string[] = []
    const builder = {
      select: vi.fn(() => builder),
      in: vi.fn((_column: string, ids: string[]) => {
        calls.push(ids.join(','))
        return builder
      }),
      abortSignal: vi.fn(() => builder),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [REPORT_ROW], error: null }),
    }
    const client = { from: vi.fn(() => builder) }

    expect(await fetchRemoteCells(client as never, [])).toEqual([])
    expect(client.from).not.toHaveBeenCalled()

    const fetched = await fetchRemoteCells(client as never, ['cell-report', 'cell-x'])
    expect(client.from).toHaveBeenCalledTimes(1)
    expect(client.from).toHaveBeenCalledWith('cells')
    expect(calls).toEqual(['cell-report,cell-x'])
    expect(fetched).toEqual([
      {
        id: 'cell-report',
        content: 'Writes the weekly report',
        laneName: 'Tutor',
        stepName: 'Writes it up',
        pathId: 'path-report',
        pathName: 'Main route',
        scenarioId: REPORT.id,
        scenarioName: REPORT.name,
        phaseName: 'Week',
      },
    ])
  })

  it('reads a to-one embed handed as a one-row array the same way', () => {
    const arrayed = { ...REPORT_ROW, paths: [REPORT_ROW.paths] }
    expect(remoteCellFromRow(arrayed)?.scenarioName).toBe(REPORT.name)
  })

  it('attaches to a board only the far ends of its own edges, and leaves a board with none as it was', () => {
    expect(named().remoteCells?.map((remote) => remote.id).sort()).toEqual([
      'cell-detour',
      'cell-report',
    ])
    expect(withRemoteCells(DETOUR, remoteCellsFromBoards([MAIN]))).toBe(DETOUR)
  })
})

describe('the arrows', () => {
  it('are drawn only for edges with both ends on the path', () => {
    const board = named()
    expect(inPathDependencies(board).map((edge) => edge.id)).toEqual([
      'edge-in-path',
    ])
    expect(
      getComparePathArrowData(board).dependencies.map((edge) => edge.id),
    ).toEqual(['edge-in-path'])
  })
})

describe('the markers', () => {
  it('mark a leaving link with the scenario it continues in, and an arriving one from this scenario with its path', () => {
    const links = crossPathLinksByCell(named()).get('cell-b') ?? []
    expect(links.map((link) => [link.direction, link.label])).toEqual([
      ['in', 'Comes from Missed session'],
      ['out', 'Continues in Weekly class report'],
    ])
  })

  it('leave `enables` to the panel, as an in-path one is', () => {
    const links = crossPathLinksFor(named(), ['cell-a', 'cell-b'])
    expect(links.map((link) => link.dependencyId)).not.toContain(
      'edge-enables-detour',
    )
  })

  it('put nothing on a cell whose links all stay on the path', () => {
    expect(crossPathLinksFor(named(), ['cell-a'])).toEqual([])
  })

  it('name the scenario when the board does not know its own', () => {
    const board = named()
    const { scenarioId: _drop, ...rest } = board.path
    const links = crossPathLinksFor({ ...board, path: rest }, ['cell-b'])
    expect(links[0]?.label).toBe('Comes from Goal setting')
  })

  it('tell a path from a scenario of the same name by id, not by name', () => {
    const board = named()
    // A scenario named like this board's own path: still another scenario.
    const lookalike = {
      ...board,
      remoteCells: board.remoteCells!.map((remote) =>
        remote.id === 'cell-report'
          ? { ...remote, scenarioName: 'Main route', pathName: 'Main route' }
          : remote,
      ),
    }
    const out = crossPathLinksFor(lookalike, ['cell-b']).find(
      (link) => link.direction === 'out',
    )
    expect(out?.label).toBe('Continues in Main route')
    expect(out?.placeDetail).toBe('Main route · Main route · Week')
  })
})
