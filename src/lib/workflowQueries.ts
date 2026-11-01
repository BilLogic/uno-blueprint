/** Supabase nested selects for the Service Blueprint schema */
import { CELL_SELECT_COLUMNS } from '@/lib/cellFields'

export const PATH_LIST_SELECT =
  'id, name, summary, note, kind, scenario_id, created_at, updated_at'

/**
 * The far end of a dependency, as much of it as a cell on ANOTHER path needs
 * to be named and reached: its own text, its lane and step, and the path,
 * scenario and phase it sits in. Embedded under both ends of every edge, so a
 * per-path read still knows where a link that leaves the path lands — the
 * normalizer keeps only the ends that are not on the path it read.
 */
const DEPENDENCY_END_SELECT = `
      id,
      content,
      path_id,
      lanes!cells_lane_id_fkey ( name ),
      steps!cells_step_id_fkey ( name ),
      paths!cells_path_id_fkey (
        id,
        name,
        scenario_id,
        scenarios!paths_scenario_id_fkey (
          id,
          name,
          phases!scenarios_phase_id_fkey ( id, name )
        )
      )`

/**
 * Blueprint grid: path with lanes, path_steps, and cells. The cells block's
 * columns come from the cell field list, which the normalizer maps from too.
 */
export const PATH_BLUEPRINT_SELECT = `
  id,
  name,
  summary,
  note,
  kind,
  status,
  scenario_id,
  scenarios!paths_scenario_id_fkey (
    name,
    phases!scenarios_phase_id_fkey ( name )
  ),
  lanes (
    id,
    name,
    lane_role,
    position
  ),
  path_steps (
    position,
    steps (
      id,
      name,
      summary
    )
  ),
  cells (
    ${CELL_SELECT_COLUMNS},
    resources!resources_cell_id_fkey (
      id,
      position,
      kind,
      name,
      url,
      cell_touchpoint_id,
      featured
    ),
    cell_touchpoints (
      id,
      touchpoint_id,
      name,
      position,
      summary,
      role,
      touchpoints (
        name,
        kind,
        icon_url
      )
    ),
    outgoing:cell_dependencies!cell_dependencies_source_cell_id_fkey (
      id,
      target_cell_id,
      kind,
      name,
      note,
      target:cells!cell_dependencies_target_cell_id_fkey (${DEPENDENCY_END_SELECT}
      )
    ),
    incoming:cell_dependencies!cell_dependencies_target_cell_id_fkey (
      id,
      source_cell_id,
      kind,
      name,
      note,
      source:cells!cell_dependencies_source_cell_id_fkey (${DEPENDENCY_END_SELECT}
      )
    )
  )
`
