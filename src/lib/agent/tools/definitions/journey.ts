import { z } from 'zod'
import { arg, defineWriteTool, requireActiveService } from '@/lib/agent/tools/definition'
import {
  addLane,
  createPath,
  createPhase,
  duplicatePath,
  duplicateScenario,
  renamePath,
} from '@/lib/authoringRpc'
import { structureWrite } from '@/lib/agent/tools/structureWrite'
import { PATH_KINDS } from '@/lib/versionValidation'

/**
 * The tools that shape the journey's structure — phases, scenarios, paths,
 * steps and lanes. Each is one RPC wrapper away from the database; the
 * wrapper records the change, and the tool's job is the argument shape the
 * model sees and the sentence it reads back.
 *
 * A write that creates under the service lands on the active service the
 * session was handed (`ctx.scope`) — never on a service the model picks.
 */

const PATH_KIND = z.enum(PATH_KINDS)

export const createPhaseTool = defineWriteTool({
  name: 'create_phase',
  description:
    'Create a new phase in the service. Propose the structure as text and get a nod first.',
  args: z.object({
    name: arg.text('Phase name'),
    summary: arg.optionalText('One-line summary; omit for none'),
  }),
  run: async ({ name, summary }, ctx) => {
    const id = await createPhase(ctx.client, {
      serviceId: requireActiveService(ctx),
      name,
      summary: summary ?? null,
    })
    return `Created phase (${id}).`
  },
})

export const createScenarioTool = structureWrite({
  name: 'create_scenario',
  description:
    'Create a new scenario in a phase, with its first path and empty steps. lane_source_path_id copies an existing path\'s lane stack (STRONGLY preferred — lane labels must match across scenarios). Propose as text and get a nod first.',
  args: z.object({
    phase_id: arg.text('Phase id from list_blueprint'),
    name: arg.text('Short stage label; put the explanation in summary'),
    summary: z.string().describe('Explanation of this scenario; an empty string leaves it blank; omit for none').optional(),
    path_name: arg.optionalText('First path name; defaults to "Happy Path"'),
    step_count: arg.number('Initial step columns (default 5, or the number of step_names)').optional(),
    step_names: z.array(arg.name('Step name')).min(1).describe('Initial step names in order; step_count must match when supplied').optional(),
    lane_source_path_id: arg.optionalText('Path id whose lanes to copy; omit for none'),
  }),
  confirmation: true,
})

export const createPathTool = defineWriteTool({
  name: 'create_path',
  description:
    'Add a path to a scenario — a variant or an exception. lane_source_path_id copies the sibling\'s lane stack (preferred).',
  args: z.object({
    scenario_id: arg.text('Scenario id'),
    name: arg.text('Path name'),
    kind: PATH_KIND.describe('Default variant').optional(),
    lane_source_path_id: arg.optionalText('Sibling path id whose lanes to copy; omit for none'),
  }),
  run: async ({ scenario_id, name, kind, lane_source_path_id }, { client }) => {
    const id = await createPath(client, {
      scenarioId: scenario_id,
      name,
      pathKind: kind,
      laneSourcePathId: lane_source_path_id ?? null,
    })
    return `Created path (${id}).`
  },
})

export const duplicatePathTool = defineWriteTool({
  name: 'duplicate_path',
  description:
    'Copy a path — lanes, steps, optionally cells and arrows — as a new variant of the same scenario.',
  args: z.object({
    source_path_id: arg.text('Path to copy'),
    name: arg.text('New path name'),
    kind: PATH_KIND.describe('Default variant').optional(),
    copy_cells: z.boolean().describe('Default true').optional(),
  }),
  run: async ({ source_path_id, name, kind, copy_cells }, { client }) => {
    const id = await duplicatePath(client, {
      sourcePathId: source_path_id,
      name,
      pathKind: kind,
      copyCells: copy_cells !== false,
    })
    return `Duplicated path (${id}).`
  },
})

export const duplicateScenarioTool = defineWriteTool({
  name: 'duplicate_scenario',
  description:
    'Copy a WHOLE scenario into the same phase — its columns, every path, every lane, every cell, and every arrow with both ends inside it. One call, two arguments, but it writes far more rows than that suggests: duplicating a 5-path scenario is hundreds of inserts. Say roughly how big the source is and get a nod first. Fully revertible (its inverse deletes the copy). The UI names copies "X (copy)" — use the same form unless the human asks for a different name, so the sidebar reads consistently however the copy was made. Copied cells get no cell_key, so they cannot be bound into a slice until one is authored.',
  args: z.object({
    source_scenario_id: arg.text('Scenario id from list_blueprint'),
    name: arg.text('Name for the copy; the UI convention is "<source name> (copy)"'),
  }),
  run: async ({ source_scenario_id, name }, { client }) => {
    const id = await duplicateScenario(client, { sourceScenarioId: source_scenario_id, name })
    return `Duplicated the blueprint (${id}). Re-read it for the copy's own path, lane, step and cell ids — none of them are the source's, and the copied cells have no cell_key.`
  },
})

export const createStepTool = structureWrite({
  name: 'create_step',
  description:
    'Add a step (column) to a path. Read sibling paths first — step names align across paths BY NAME, so reuse the exact name when the step exists elsewhere.',
  args: z.object({
    path_id: arg.text('Path id'),
    name: arg.text('Short label for what happens; put the explanation in summary'),
    summary: z.string().describe('Explanation of this step; an empty string leaves it blank; omit for none').optional(),
    at_position: arg.number('Insert position (1-based); omit to append').optional(),
  }),
  confirmation: true,
})

export const createLaneTool = defineWriteTool({
  name: 'create_lane',
  description:
    'Add a lane to EVERY path of a scenario. Read lane-roles and lane-vocabulary first; lane labels are byte-identical for the same actor group across scenarios.',
  args: z.object({
    scenario_id: arg.text('Scenario id'),
    name: arg.text('Lane label'),
    lane_role: arg.optionalText(
      'Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits',
    ),
    at_position: arg.number('Insert row (1-based); omit to append').optional(),
  }),
  run: async ({ scenario_id, name, lane_role, at_position }, { client }) => {
    await addLane(client, {
      scenarioId: scenario_id,
      name,
      laneRole: lane_role ?? null,
      atPosition: at_position,
    })
    return 'Added lane to every path of the scenario. Re-read the blueprint for the new lane ids.'
  },
})

export const updatePathTool = defineWriteTool({
  name: 'update_path',
  description: 'Rename a path.',
  args: z.object({
    path_id: arg.text('Path id'),
    name: arg.text('New name'),
  }),
  run: async ({ path_id, name }, { client }) => {
    await renamePath(client, { pathId: path_id, name })
    return 'Path renamed.'
  },
})

export const updatePhaseTool = structureWrite({
  name: 'update_phase',
  description: 'Rename a phase. Ask someone who may confirm for a yes; other callers record a proposal.',
  args: z.object({ phase_id: arg.text('Phase id'), name: arg.name('Short label; put the explanation in summary'), summary: z.string().describe('Explanation; an empty string clears it; omit to keep').optional() }),
  confirmation: true,
})

export const updateScenarioTool = structureWrite({
  name: 'update_scenario',
  description: 'Rename a scenario. Ask someone who may confirm for a yes; other callers record a proposal.',
  args: z.object({ scenario_id: arg.text('Scenario id'), name: arg.name('Short label; put the explanation in summary'), summary: z.string().describe('Explanation; an empty string clears it; omit to keep').optional() }),
  confirmation: true,
})

export const updateStepTool = structureWrite({
  name: 'update_step',
  description: 'Rename a step. Ask someone who may confirm for a yes; other callers record a proposal.',
  args: z.object({ step_id: arg.text('Step id'), name: arg.name('Short label; put the explanation in summary'), summary: z.string().describe('Explanation; an empty string clears it; omit to keep').optional() }),
  confirmation: true,
})

export const updateLaneTool = structureWrite({
  name: 'update_lane',
  description: 'Rename a lane. Ask someone who may confirm for a yes; other callers record a proposal.',
  args: z.object({ lane_id: arg.text('Lane id'), name: arg.name('New name') }),
  confirmation: true,
})
