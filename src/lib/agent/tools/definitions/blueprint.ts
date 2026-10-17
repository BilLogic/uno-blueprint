import { z } from 'zod'
import { arg, defineTool, requireClient } from '@/lib/agent/tools/definition'
import { CANONICAL_LANE_ROLES } from '@/lib/laneRoles'
import { PATH_KINDS } from '@/lib/versionValidation'
import type { DeletableKind } from '@/lib/deletionSafety'
import {
  getBlueprint,
  getCompareDiff,
  getDeletionImpact,
  listBlueprint,
  listLanes,
  listOwnerTags,
} from '@/lib/agent/tools/read'
import {
  sampleGetBlueprint,
  sampleGetCompareDiff,
  sampleListBlueprint,
  sampleListLanes,
  sampleListOwnerTags,
} from '@/lib/agent/tools/sampleRead'
import { searchBlueprint } from '@/lib/agent/tools/search'
import { SERVICE_ARG, readScope } from '@/lib/agent/tools/definitions/scope'

/**
 * The tools that read the journey as a whole — its levels, one scenario's
 * grid, the difference between a scenario's paths, the vocabularies in use,
 * and what a delete would take.
 */

/**
 * The lane-role filter, one constant for every read that takes one.
 *
 * A spec is the only description of a value set the model ever sees, so this
 * list is built from `CANONICAL_LANE_ROLES` — the app's copy of the closed
 * `lanes.lane_role` constraint — rather than written out a second time. A
 * hand-kept copy is how a filter goes on offering a role the constraint has
 * retired: it matches no lane, and the read comes back empty while reporting
 * success. The lane-role roster test holds this to the constraint as well.
 */
export const LANE_ROLE_FILTER_DESCRIPTION = `Optional. Restrict to lanes with this role, one of: ${CANONICAL_LANE_ROLES.join(' | ')}`
const LANE_ROLE_FILTER_ARG = arg.optionalText(LANE_ROLE_FILTER_DESCRIPTION)

const PHASE_ARG = arg.optionalText('Optional. Restrict to the phase with this name (any case)')
const SCENARIO_ARG = arg.optionalText(
  'Optional. Restrict to the scenario with this name (any case)',
)
const KIND_ARG = arg.optionalText(
  `Optional. Restrict to paths of this kind: ${PATH_KINDS.join(' | ')}`,
)

export const listBlueprintTool = defineTool({
  name: 'list_blueprint',
  description:
    'The COMPLETE set of things at one or more levels of the journey, with ids — granularity picks the levels: phase, scenario, path, step, lane, cell. This is your table of contents and your "what exists" answer: every row comes back, up to limit, under a header with the true total, so it is the honest way to say "all N scenarios" or "every exception path". Start here — granularity ["phase","scenario"] is the orientation read. Filters narrow the set, and a filter set below a level drops that level: scenario drops phases, kind drops phases and scenarios, lane_role keeps only lanes and cells. Covers the active service by default; pass service to read another, or "all" for every service. When you already know the scenario and want its grid laid out, use get_blueprint.',
  surface: 'read',
  args: z.object({
    granularity: arg.strings(
      'One or more of: phase, scenario, path, step, lane, cell. Ask for the level you need — "cell" across a whole deployment can run to many hundreds of rows.',
    ),
    phase: PHASE_ARG,
    scenario: SCENARIO_ARG,
    kind: KIND_ARG,
    lane_role: LANE_ROLE_FILTER_ARG,
    service: SERVICE_ARG,
    limit: arg
      .number('Max rows (default 200, max 500). The true total is reported either way.')
      .optional(),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ granularity, phase, scenario, kind, lane_role, service, limit }, ctx) => {
    const options = { granularity, phase, scenario, pathKind: kind, laneRole: lane_role, limit }
    if (!ctx.client) return sampleListBlueprint(ctx.offlineBoard, options)
    return listBlueprint(ctx.client, {
      ...options,
      scope: await readScope(ctx, service),
    })
  },
})

export const searchBlueprintTool = defineTool({
  name: 'search_blueprint',
  description:
    'Find things by WHAT THEY SAY, when you do not know which scenario holds them — "where do we chase a missing document", "which cells mention the billing system". Results are RANKED and cut off at limit; the header reports how many matched in total, so quote that number when you show a subset, and every row reports matched_by. READ THE HEADER BEFORE YOU CONCLUDE ANYTHING FROM A SMALL OR EMPTY RESULT. It names the arms that actually ran for this session — "words only", or "words and meaning". On a words-only run, a question phrased differently from the board\'s own wording can return nothing even though the moment IS mapped: zero rows there means "no row uses these words", NEVER "the blueprint does not cover this". Re-search with the board\'s vocabulary, or call list_blueprint to see what exists, before reporting an absence either way. Use list_blueprint for the COMPLETE set at a level, and get_blueprint when you already know the scenario. AFTER you find cells, POINT AT THEM: open_scenario, then focus_cell on the one you are talking about. Finding a cell is not showing it — the user is looking at a canvas, and an answer they cannot see on screen is half an answer.',
  surface: 'read',
  args: z.object({
    query: arg.text('The words to match, in the blueprint\'s own vocabulary where you know it'),
    granularity: arg
      .strings(
        'Levels to search: phase, scenario, path, step, lane, cell. Defaults to ["cell"]. Add "path" or "scenario" when hunting for a named branch.',
      )
      .optional(),
    phase: PHASE_ARG,
    scenario: SCENARIO_ARG,
    kind: KIND_ARG,
    lane_role: LANE_ROLE_FILTER_ARG,
    service: SERVICE_ARG,
    limit: arg
      .number('Max rows (default 15, max 100). The true total is reported either way.')
      .optional(),
  }),
  // Ranked search needs a database function and this person's own key;
  // `searchPlan.ts` decides whether a session is offered it at all.
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ query, granularity, phase, scenario, kind, lane_role, service, limit }, ctx) => {
    const client = requireClient(ctx)
    return searchBlueprint(client, {
      query,
      granularity,
      phase,
      scenario,
      pathKind: kind,
      laneRole: lane_role,
      limit,
      scope: await readScope(ctx, service),
      meaning: ctx.meaning ?? null,
      signal: ctx.signal,
    })
  },
})

export const getBlueprintTool = defineTool({
  name: 'get_blueprint',
  description:
    'Full grid of one scenario: every path with its steps, lanes, cells (ids included) and the dependency arrows between its cells, source-first with each one\'s kind. Read before writing into a scenario. ("Blueprint" unqualified means the whole workspace; this tool returns one scenario\'s grid.)',
  surface: 'read',
  args: z.object({
    scenario_id: arg.text('Scenario id from list_blueprint'),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ scenario_id }, ctx) =>
    ctx.client
      ? getBlueprint(ctx.client, scenario_id)
      : sampleGetBlueprint(ctx.offlineBoard, scenario_id),
})

export const compareBlueprintTool = defineTool({
  name: 'compare_blueprint',
  description:
    'Structured comparison of a scenario\'s paths: canonical columns with verdicts, one group per divergent STEP (the same "Step N" the ledger groups by and jump_divergence takes) tagged with its divergence zone ①②③ (drawn as the strip in Stacked), every differing slot with per-path quotes and cell ids, and the detail-only (summary, resources, touchpoints) group. Read before driving the compare UI or answering "what differs". Dependency edges (leads_to, enables) are not compared.',
  surface: 'read',
  args: z.object({
    scenario_id: arg.text('Scenario id from list_blueprint'),
    path_ids: arg
      .strings(
        'Optional subset (2+) of the scenario\'s path ids, in comparison order; omit to compare every path',
      )
      .optional(),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ scenario_id, path_ids }, ctx) =>
    ctx.client
      ? getCompareDiff(ctx.client, scenario_id, path_ids)
      : sampleGetCompareDiff(ctx.offlineBoard, scenario_id, path_ids),
})

export const listLanesTool = defineTool({
  name: 'list_lanes',
  description:
    'The lane vocabulary actually in use, with how many lanes carry each label and role. Read before create_lane — reuse a label unless the new lane is genuinely a different kind of thing. Distinct from get_reference("lane-roles"), which says what the roles MEAN rather than which ones this blueprint uses.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async (_args, ctx) =>
    ctx.client ? listLanes(ctx.client) : sampleListLanes(ctx.offlineBoard),
})

export const listOwnerTagsTool = defineTool({
  name: 'list_owner_tags',
  description:
    'The owner tag vocabulary in use. ALWAYS read before writing owner or perceived_owner — reuse an existing tag unless creating one deliberately.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async (_args, ctx) =>
    ctx.client
      ? listOwnerTags(ctx.client)
      : sampleListOwnerTags(ctx.offlineBoard),
})

/**
 * `lane` and `step` were withheld here once because their counts did not
 * match their deletes. The predicates now address what each delete takes, so
 * all five are offered — `step` still needs its path, because the delete is
 * path-scoped and there is no true count without it.
 */
const DELETABLE_KINDS = ['scenario', 'path', 'step', 'lane', 'slice'] as const satisfies readonly DeletableKind[]

export const measureDeletionImpactTool = defineTool({
  name: 'measure_deletion_impact',
  description:
    'What deleting something would destroy — cell and arrow counts, which slices lose slides, which of those undo cannot put back, and what survives. A pure read: it deletes nothing, and no delete tool exists for you. Use it to answer "what happens if I remove this?" BEFORE the human opens the confirm dialog. Relay the warning and reassurance sentences VERBATIM; they are worded to not overstate what comes back.',
  surface: 'read',
  args: z.object({
    kind: z.enum(DELETABLE_KINDS).describe('What is being deleted.'),
    target_id: arg.text('Id of the scenario, path, step, lane or slice'),
    scope_id: arg.optionalText(
      'REQUIRED when kind is "step": the path id. Deleting a step removes only the cells on ONE path, so without the path there is no true number to quote. Ignored for other kinds.',
    ),
  }),
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ kind, target_id, scope_id }, ctx) => {
    if (kind === 'step' && !scope_id) {
      throw new Error(
        'A step impact needs scope_id = the path id — deleting a step removes only the cells on ONE path, so without it there is no true number to quote.',
      )
    }
    return getDeletionImpact(requireClient(ctx), kind, target_id, scope_id)
  },
})
