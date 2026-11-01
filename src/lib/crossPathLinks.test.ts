/**
 * A link that leaves its path, from the read to the board.
 *
 * One path's board is read at a time. A dependency may join cells on any two
 * paths of one service, so the read has to bring back enough of the far end
 * to name it, the board has to keep it out of the arrows, and the cell at
 * this end has to know it carries one. These are the three halves of that.
 *
 * The service here is invented: one scenario with two paths, and a second
 * scenario in another phase.
 */
import { describe, expect, it } from 'vitest'
import { normalizeBlueprint, type RawPath } from '@/lib/normalizeBlueprint'
import {
  crossPathLinksByCell,
  crossPathLinksFor,
  inPathDependencies,
} from '@/lib/crossPathLinks'
import { getComparePathArrowData } from '@/lib/sideBySideCompareLayout'

const SCENARIO = {
  id: 'scenario-goals',
  name: 'Goal setting',
  phases: { id: 'phase-term', name: 'Term' },
}
const OTHER_SCENARIO = {
  id: 'scenario-report',
  name: 'Weekly class report',
  phases: { id: 'phase-week', name: 'Week' },
}

/** A far end as the board query embeds it. */
function end(
  id: string,
  path: { id: string; name: string; scenario: typeof SCENARIO },
  content = 'A cell elsewhere',
) {
  return {
    id,
    content,
    path_id: path.id,
    lanes: { name: 'Tutor' },
    steps: { name: 'Reviews the goal' },
    paths: {
      id: path.id,
      name: path.name,
      scenario_id: path.scenario.id,
      scenarios: path.scenario,
    },
  }
}

const MAIN = { id: 'path-main', name: 'Main route', scenario: SCENARIO }
const DETOUR = { id: 'path-detour', name: 'Missed session', scenario: SCENARIO }
const REPORT = { id: 'path-report', name: 'Main route', scenario: OTHER_SCENARIO }

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

const RAW: RawPath = {
  id: MAIN.id,
  name: MAIN.name,
  kind: 'happy',
  scenario_id: SCENARIO.id,
  scenarios: { name: SCENARIO.name, phases: { name: 'Term' } },
  lanes: [{ id: 'lane-tutor', name: 'Tutor', lane_role: null, position: 0 }],
  path_steps: [
    { position: 0, steps: { id: 'step-1', name: 'Sets a goal' } },
    { position: 1, steps: { id: 'step-2', name: 'Reviews it' } },
  ],
  cells: [
    cell('cell-a', 'step-1', {
      outgoing: [
        // In-path: arrives again under cell-b's `incoming`, and is one edge.
        { id: 'edge-in-path', target_cell_id: 'cell-b', kind: 'leads_to', target: end('cell-b', MAIN) },
      ],
    }),
    cell('cell-b', 'step-2', {
      outgoing: [
        {
          id: 'edge-to-report',
          target_cell_id: 'cell-report',
          kind: 'leads_to',
          note: 'The review feeds the weekly report.',
          target: end('cell-report', REPORT, 'Writes the weekly report'),
        },
        {
          id: 'edge-enables-detour',
          target_cell_id: 'cell-detour',
          kind: 'enables',
          target: end('cell-detour', DETOUR),
        },
      ],
      incoming: [
        { id: 'edge-in-path', source_cell_id: 'cell-a', kind: 'leads_to', source: end('cell-a', MAIN) },
        {
          id: 'edge-from-detour',
          source_cell_id: 'cell-detour',
          kind: 'leads_to',
          source: end('cell-detour', DETOUR, 'Books a catch-up'),
        },
      ],
    }),
  ] as RawPath['cells'],
}

describe('the read', () => {
  const board = normalizeBlueprint(RAW)

  it('holds every edge touching the path once, arrivals from other paths included', () => {
    expect(board.dependencies.map((edge) => edge.id).sort()).toEqual([
      'edge-enables-detour',
      'edge-from-detour',
      'edge-in-path',
      'edge-to-report',
    ])
    expect(board.dependencies.find((edge) => edge.id === 'edge-from-detour'))
      .toMatchObject({ source_cell_id: 'cell-detour', target_cell_id: 'cell-b' })
  })

  it('keeps the far ends that are on other paths, named down to the phase, and none of its own', () => {
    expect(board.remoteCells?.map((remote) => remote.id).sort()).toEqual([
      'cell-detour',
      'cell-report',
    ])
    expect(board.remoteCells?.find((remote) => remote.id === 'cell-report'))
      .toEqual({
        id: 'cell-report',
        content: 'Writes the weekly report',
        laneName: 'Tutor',
        stepName: 'Reviews the goal',
        pathId: REPORT.id,
        pathName: REPORT.name,
        scenarioId: OTHER_SCENARIO.id,
        scenarioName: OTHER_SCENARIO.name,
        phaseName: 'Week',
      })
  })

  it('says which scenario the path is in', () => {
    expect(board.path).toMatchObject({
      scenarioId: SCENARIO.id,
      scenarioName: SCENARIO.name,
      phaseName: 'Term',
    })
  })

  it('reads a to-one embed handed as a one-row array the same way', () => {
    const arrayed = structuredClone(RAW)
    const target = arrayed.cells![1]!.outgoing![0]!
    target.target = [target.target as never]
    const remote = normalizeBlueprint(arrayed).remoteCells?.find(
      (entry) => entry.id === 'cell-report',
    )
    expect(remote?.scenarioName).toBe(OTHER_SCENARIO.name)
  })
})

describe('the arrows', () => {
  const board = normalizeBlueprint(RAW)

  it('are drawn only for edges with both ends on the path', () => {
    expect(inPathDependencies(board).map((edge) => edge.id)).toEqual([
      'edge-in-path',
    ])
    expect(
      getComparePathArrowData(board).dependencies.map((edge) => edge.id),
    ).toEqual(['edge-in-path'])
  })
})

describe('the markers', () => {
  const board = normalizeBlueprint(RAW)

  it('mark a leaving link with the scenario it continues in, and an arriving one from this scenario with its path', () => {
    const links = crossPathLinksByCell(board).get('cell-b') ?? []
    expect(links.map((link) => [link.direction, link.label])).toEqual([
      ['in', 'Comes from Missed session'],
      ['out', 'Continues in Weekly class report'],
    ])
  })

  it('leave `enables` to the panel, as an in-path one is', () => {
    const links = crossPathLinksFor(board, ['cell-a', 'cell-b'])
    expect(links.map((link) => link.dependencyId)).not.toContain(
      'edge-enables-detour',
    )
  })

  it('put nothing on a cell whose links all stay on the path', () => {
    expect(crossPathLinksFor(board, ['cell-a'])).toEqual([])
  })

  it('name the scenario when the board does not know its own', () => {
    const { scenarioId: _drop, ...path } = board.path
    const anonymous = { ...board, path }
    const links = crossPathLinksFor(anonymous, ['cell-b'])
    expect(links[0]?.label).toBe('Comes from Goal setting')
  })
})
