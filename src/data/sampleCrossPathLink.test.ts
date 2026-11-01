/**
 * The bundled sample carries a link that leaves its path, and with no
 * database the canvas reads it the way a database read gives it: on the
 * board at each end, with the far end named.
 *
 * The bundle lists a link once, on its source's path, as the seed places it.
 * `withBundledCrossPathLinks` is what tells the board at the other end that
 * the link arrived.
 */
import { describe, expect, it } from 'vitest'
import {
  SAMPLE_AUDIT_TRIAGED_PATH_FALLBACK as AUDIT,
  SAMPLE_MAP_SERVICE_DOCS_PATH_FALLBACK as MAP,
} from '@/data/sampleBlueprint'
import { SAMPLE_NAV } from '@/data/sampleNav'
import { PACKAGE_SAMPLE_BLUEPRINTS } from '@/data/blueprintFallbacks'
import { crossPathLinksFor } from '@/lib/crossPathLinks'
import {
  scenarioNamesFromNav,
  withBundledCrossPathLinks,
} from '@/lib/remoteCells'

function bundled() {
  const boards = new Map<string, (typeof MAP)>()
  const scenarioIdByPathId = new Map<string, string>()
  for (const [scenarioId, blueprints] of Object.entries(
    PACKAGE_SAMPLE_BLUEPRINTS.blueprintsByScenario,
  )) {
    for (const blueprint of blueprints) {
      boards.set(blueprint.path.id, blueprint)
      scenarioIdByPathId.set(blueprint.path.id, scenarioId)
    }
  }
  return withBundledCrossPathLinks(
    boards,
    scenarioIdByPathId,
    scenarioNamesFromNav(SAMPLE_NAV),
  )
}

const cross = MAP.dependencies.find(
  (edge) => !MAP.cells.some((cell) => cell.id === edge.target_cell_id),
)!

describe('the sample’s cross-path link', () => {
  it('leaves Map your service for the audit roster', () => {
    expect(cross).toBeDefined()
    expect(AUDIT.cells.some((cell) => cell.id === cross.target_cell_id)).toBe(true)
  })

  it('marks the cell it leaves with the scenario it continues in', () => {
    const map = bundled().get(MAP.path.id)!
    expect(
      crossPathLinksFor(map, [cross.source_cell_id]).map((link) => link.label),
    ).toEqual(['Continues in Audit the check roster'])
  })

  it('arrives on the audit board, marked with where it comes from', () => {
    const audit = bundled().get(AUDIT.path.id)!
    expect(audit.dependencies.map((edge) => edge.id)).toContain(cross.id)
    expect(
      crossPathLinksFor(audit, [cross.target_cell_id]).map((link) => link.label),
    ).toEqual(['Comes from Map your service'])
  })

  it('leaves a board no link leaves untouched', () => {
    const boards = bundled()
    const untouched = [...boards.values()].filter(
      (board) => !board.remoteCells,
    )
    expect(untouched.length).toBe(boards.size - 2)
  })
})
