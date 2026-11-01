/** Supabase nested selects for the Service Blueprint schema */
import { CELL_SELECT_COLUMNS } from '@/lib/cellFields'

export const PATH_LIST_SELECT =
  'id, name, summary, note, kind, scenario_id, created_at, updated_at'

/**
 * A cell on another path, as much of it as a link's far end needs to be named
 * and reached: its own text, its lane and step, and the path, scenario and
 * phase it sits in. Read from `cells` in ONE follow-up query, and only for the
 * far ends no loaded board holds — the board query itself carries edge ids
 * alone, so an in-path edge costs nothing extra and a board with no link off
 * its path makes no second request (`remoteCells.ts`).
 */
export const REMOTE_CELL_SELECT = `
  id,
  content,
  lanes!cells_lane_id_fkey ( name ),
  steps!cells_step_id_fkey ( name ),
  paths!cells_path_id_fkey (
    id,
    name,
    scenarios!paths_scenario_id_fkey (
      id,
      name,
      phases!scenarios_phase_id_fkey ( name )
    )
  )
`

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
      note
    ),
    incoming:cell_dependencies!cell_dependencies_target_cell_id_fkey (
      id,
      source_cell_id,
      kind,
      name,
      note
    )
  )
`
