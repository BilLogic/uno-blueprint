import { z } from 'zod'
import {
  agentCellFields,
  cellFieldArgs,
  describeCellFields,
  type AgentCellField,
} from '@/lib/agent/tools/definitions/cellArgs'
import { arg, defineTool, defineWriteTool } from '@/lib/agent/tools/definition'
import { getCell, listCellDependencies } from '@/lib/agent/tools/read'
import { sampleGetCell, sampleListCellDependencies } from '@/lib/agent/tools/sampleRead'
import { setCellDependency } from '@/lib/authoringRpc'
import { getCellContentLengthGuidance } from '@/lib/cellContentLimits'
import { createCell, laneBudgetKind, readCellBeforeEdit } from '@/lib/cellContentMutations'
import {
  EDITABLE_CELL_FIELDS,
  type CellEditValue,
  type CellEdits,
  type EditableCellField,
} from '@/lib/cellFields'
import { saveCell } from '@/lib/cellSave'

/**
 * The tools that act on a cell, grouped by the noun they act on the same
 * way the mutation modules are, so a tool and the write it performs sit one
 * import apart.
 */

export const getCellTool = defineTool({
  name: 'get_cell',
  description:
    'One cell in full: content, summary, owners, function/form/value, position.',
  surface: 'read',
  args: z.object({
    cell_id: arg.text('Cell id'),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ cell_id }, ctx) =>
    ctx.client
      ? getCell(ctx.client, cell_id)
      : sampleGetCell(ctx.offlineBoard, cell_id),
})

export const listCellDependenciesTool = defineTool({
  name: 'list_cell_dependencies',
  description:
    'The dependencies: which cell leads to, or enables, which other cell. BOTH kinds read source-first. `leads_to` means the source makes the target happen (drawn as an arrow); `enables` means the source makes the target possible without causing it (recorded, never drawn) — the PRECONDITION is the source. Pass cell_id to get just the edges touching one cell — the whole graph is large. These are the same arrows the user sees on the canvas, and the read half of create_cell_dependency.',
  surface: 'read',
  args: z.object({
    cell_id: arg.optionalText(
      'Restrict to edges into or out of this cell; omit for the whole graph (capped at 200)',
    ),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ cell_id }, ctx) =>
    ctx.client
      ? listCellDependencies(ctx.client, cell_id)
      : sampleListCellDependencies(ctx.offlineBoard, cell_id),
})

/**
 * The fields `upsert_cell` takes, in the list's vocabulary: the structure
 * the agent may name (the slot), and what a create must be handed — the one
 * editable field the row cannot exist without.
 */
const CREATE_FIELDS = agentCellFields().filter(
  (descriptor) => descriptor.group === 'structure' || descriptor.required,
)

export const upsertCellTool = defineWriteTool({
  name: 'upsert_cell',
  description:
    'Create the cell at (path, lane, step). Creation ONLY — the call refuses if a cell already exists there (edit with update_cell instead). content is REQUIRED and must be real journey text — an empty or placeholder cell is invisible in the grid.',
  // The slot and the text come from the cell field list — the same
  // descriptors the panel's draft form renders — with the path, which is
  // not a column the board reads for a cell, named here.
  //
  // The shape is built from the list, so its keys are the list's at runtime;
  // the assertion spells the arguments the list yields today, which is what
  // `run` destructures. `cellArgs.test.ts` holds the two to each other.
  args: z.object({
    path_id: arg.text('Path id'),
    ...cellFieldArgs(CREATE_FIELDS, { required: true }),
  }) as unknown as z.ZodObject<{
    path_id: z.ZodString
    lane_id: z.ZodString
    step_id: z.ZodString
    content: z.ZodString
  }>,
  run: async ({ path_id, lane_id, step_id, content }, { client }) => {
    const written = await createCell(client, {
      pathId: path_id,
      laneId: lane_id,
      stepId: step_id,
      content,
    })
    // Advice, not a gate. The budget is a judgement about how much copy
    // looks right in a card, and the canvas clamps its preview to a fixed
    // face either way, so long text is written and reported rather than
    // thrown away — see `cellContentLimits`. Same function, same thresholds
    // as the note under the person's field.
    const lengthGuidance = getCellContentLengthGuidance(
      content,
      await laneBudgetKind(client, lane_id),
    )
    // Which half the upsert took is said out loud. The occupancy guard means
    // an update should be unreachable; if the race that guard cannot close
    // happens anyway, a model told "created" goes on believing it made a
    // cell it in fact wrote over.
    const outcome = written.inserted
      ? `Created cell (${written.id}).`
      : `That slot was already filled; the existing cell (${written.id}) was updated in place.`
    return `${outcome}${lengthGuidance.message ? ` ${lengthGuidance.message}` : ''}`
  },
})

/**
 * The editable fields the agent may set, in the panel's order — what the
 * cell says and who owns it, then what it is like — which is the order the
 * description reads in and the model sees the arguments in.
 */
const EDIT_FIELDS = agentCellFields(EDITABLE_CELL_FIELDS) as (AgentCellField & { agentArg: AgentEditKey })[]
const EDIT_ARG_NAMES = EDIT_FIELDS.map((descriptor) => descriptor.agentArg)

/** The editable fields the list hands the agent — `status` is not among them. */
type AgentEditKey = Extract<EditableCellField, { agentArg: string }>['key']

/** A partial edit as the model sends it: the id, and any of the agent's editable arguments. */
type CellEditArgShape = { cell_id: z.ZodString } & {
  [K in AgentEditKey]: z.ZodType<CellEditValue<K> | undefined>
}

export const updateCellTool = defineWriteTool({
  name: 'update_cell',
  // The field sentences are the descriptors' hints — the words a person
  // reads above the panel's controls — so the model and the panel describe
  // one field the same way.
  description: `Edit a cell. Text side: ${describeCellFields('content')}. Spec side: ${describeCellFields('spec')}. Reads the current values first, so pass only the fields you mean to change. Fields cannot be CLEARED here — an empty string means keep; ask the human to clear one in the panel.`,
  // Built from the list; the assertion spells the arguments the list yields
  // today, every one optional, which is what `run` reads by key.
  args: z.object({
    cell_id: arg.text('Cell id'),
    ...cellFieldArgs(EDIT_FIELDS, { required: false }),
  }) as unknown as z.ZodObject<CellEditArgShape>,
  // ONE tool over the one save, because a cell is one thing to the person
  // editing it. The save routes each field to its own write — the content
  // mutation and the spec mutation capture separate inverses, and the
  // ledger wants them separate — so an agent asked to "say what this step
  // does and who it is for" need not know that `function` lands behind a
  // different write from `content`.
  run: async (args, { client }) => {
    const named = EDIT_FIELDS.filter((descriptor) => args[descriptor.agentArg] !== undefined)
    // Refused rather than treated as a no-op: a call naming no field is a
    // call whose author believed they were changing something.
    if (named.length === 0)
      throw new Error(`Name at least one field to change: ${EDIT_ARG_NAMES.join(', ')}.`)

    const before = await readCellBeforeEdit(client, args.cell_id)
    // The tool takes no `status` argument, so the save must not move one:
    // an edit to a cell's wording that quietly marked a proposed surface
    // live would be the sentence the agent never said out loud. The
    // baseline carries the status and the values leave it alone.
    const baseline: CellEdits = {
      content: before.content.content,
      summary: before.content.summary,
      owner: before.content.owner,
      perceived_owner: before.content.perceivedOwner,
      status: before.content.status,
      function: before.spec.function,
      form: before.spec.form,
      value_props: before.spec.valueProps,
    }
    const values: CellEdits = { ...baseline }
    for (const descriptor of named) {
      ;(values as Record<string, unknown>)[descriptor.key] = args[descriptor.agentArg]
    }
    const lengthGuidance =
      args.content === undefined
        ? null
        : getCellContentLengthGuidance(args.content, await laneBudgetKind(client, before.laneId))

    const { routes } = await saveCell(client, { cellId: args.cell_id, values, baseline })

    // Two ledger entries when both halves moved, and the reply says so —
    // the change sheet will show two rows, and a reply claiming one write
    // would leave the reader counting.
    const halves = routes.map((route) => (route === 'content' ? 'text' : route))
    const reply =
      halves.length === 0
        ? 'Nothing changed: the fields named already hold those values.'
        : halves.length === 2
          ? 'Cell updated (text and spec — two entries in the change list).'
          : `Cell ${halves[0]} updated.`
    // The length note rides a write of the text, not a call that changed
    // nothing: advice about copy that was not written would be advice
    // about nothing.
    const note = routes.includes('content') && lengthGuidance?.message ? ` ${lengthGuidance.message}` : ''
    return `${reply}${note}`
  },
})

export const createCellDependencyTool = defineWriteTool({
  name: 'create_cell_dependency',
  description:
    'Connect two cells of the SAME service — any path or scenario of it; a cell of another service is refused. BOTH kinds read source-first. kind "leads_to" = the source makes the target happen (drawn as an arrow); "enables" = the source makes the target possible without causing it (panel-only, never drawn) — "B only makes sense once A is true" is A enables B, so the PRECONDITION is the source. They are NOT inverses: a precondition causes nothing, so do not record one as leads_to. State which kind you chose and why in your reply. Arrows only where they add information.',
  args: z.object({
    source_cell_id: arg.text('Source cell id'),
    target_cell_id: arg.text('Target cell id'),
    kind: z.enum(['leads_to', 'enables']).describe('Default leads_to').optional(),
    label: arg.optionalText(
      'Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none',
    ),
  }),
  run: async ({ source_cell_id, target_cell_id, kind, label }, { client }) => {
    const written = await setCellDependency(client, {
      sourceCellId: source_cell_id,
      targetCellId: target_cell_id,
      kind: kind ?? 'leads_to',
      // The tool says `label` and the column says `note`. The word a model
      // is asked for is not the schema's — renaming it would move a
      // published surface for a spelling — so the mapping happens here.
      note: label ?? null,
    })
    // Which half the upsert took is said out loud. The tool is named for
    // creating, and a model told "set" after landing on an edge that
    // already existed goes on believing it made one — which is how the
    // same pair gets connected again on the next pass.
    return written.inserted
      ? `Dependency created (${written.id}).`
      : `That pair was already connected; the existing dependency (${written.id}) was updated in place.`
  },
})
