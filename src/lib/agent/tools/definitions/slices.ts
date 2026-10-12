import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  arg,
  defineTool,
  defineWriteTool,
  requireActiveService,
  requireScope,
} from '@/lib/agent/tools/definition'
import { getSlice, listSlices, UUID } from '@/lib/agent/tools/read'
import { sampleGetSlice, sampleListSlices } from '@/lib/agent/tools/sampleRead'
import { createSlice, patchSliceMeta, replaceSlides } from '@/lib/sliceMutations'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/** The tools that read and author a slice — a stakeholder's view of the journey. */

export const listSlicesTool = defineTool({
  name: 'list_slices',
  description: 'List existing slices (stakeholder views) with ids and types.',
  surface: 'read',
  args: z.object({}),
  availability: { sample: true, mobile: true },
  run: async (_args, ctx) =>
    ctx.client ? listSlices(ctx.client, requireScope(ctx)) : sampleListSlices(),
})

export const getSliceTool = defineTool({
  name: 'get_slice',
  description:
    'One slice in full: fields plus every slide with its cells, title, caption. Read before update_slice or replace_slides.',
  surface: 'read',
  args: z.object({
    slice_id: arg.text('Slice id from list_slices'),
  }),
  availability: { sample: true, mobile: true },
  run: async ({ slice_id }, ctx) =>
    ctx.client ? getSlice(ctx.client, slice_id) : sampleGetSlice(slice_id),
})

/** The cuts the agent may author — `cell` is the seed's and not offered. */
const AGENT_SLICE_KIND = z.enum(['journey', 'lane', 'step', 'custom'])

/**
 * `description` is what the schema advertised while the handler read
 * `summary`, so a model taught the old wire is still holding the word that
 * used to be dropped. Accepted, not advertised.
 */
const SUMMARY_ALIAS = { description: 'summary' }

/**
 * Refuse every cell id that is not a cell of the active service, before the
 * slice write is asked for.
 *
 * The authority is the database: `replace_slides`, which `create_slice` runs
 * too, refuses a cell that is not an id in its own transaction, so nothing
 * lands either way. This check is the agent's fail-fast. A model copying a
 * seeded id drops a run of zeros, and the function's refusal names the slide
 * but not where real ids come from; and an id that is well formed but names
 * another service's cell, or no cell, the function has no foreign key to
 * catch. So a malformed id is refused here without asking the database, and
 * a well-formed one must name a cell under the active service. The refusal
 * names each bad id and says where the real ones are to be copied from.
 */
async function refuseUnknownCells(
  client: Client,
  serviceId: string,
  cellIds: readonly string[],
): Promise<void> {
  const distinct = [...new Set(cellIds)]
  const wellFormed = distinct.filter((id) => UUID.test(id))
  const held = new Set<string>()
  if (wellFormed.length > 0) {
    const { data, error } = await client
      .from('cells')
      .select('id, paths!inner(scenarios!inner(phases!inner(service_id)))')
      .in('id', wellFormed)
      .eq('paths.scenarios.phases.service_id', serviceId)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) held.add(row.id)
  }
  const bad = distinct.filter((id) => !held.has(id))
  if (bad.length === 0) return
  throw new Error(
    `${bad.map((id) => `"${id}" is not a cell in this service`).join('; ')} — copy ids verbatim from get_slice or list_blueprint.`,
  )
}

export const createSliceTool = defineWriteTool({
  name: 'create_slice',
  description:
    'Create a slice (stakeholder view) that REFERENCES existing cells — never copies. cell_ids in journey order, one slide per cell by default. Propose members by name and get a nod first.',
  args: z.object({
    title: arg.text('Slice title'),
    summary: arg.optionalText('One-line summary; omit for none'),
    kind: AGENT_SLICE_KIND.describe('Kind of cut'),
    actor: arg.optionalText('Whose view this is; omit for none'),
    cell_ids: arg.strings('Existing cell ids, in journey order'),
  }),
  aliases: SUMMARY_ALIAS,
  run: async ({ title, summary, kind, actor, cell_ids }, ctx) => {
    if (cell_ids.length === 0)
      throw new Error('cell_ids must be a non-empty array of existing cell ids.')
    const serviceId = requireActiveService(ctx)
    await refuseUnknownCells(ctx.client, serviceId, cell_ids)
    const slice = await createSlice(ctx.client, {
      serviceId,
      title,
      summary: summary ?? '',
      sliceKind: kind,
      actor: actor ?? '',
      cellIds: cell_ids,
    })
    return `Created slice "${slice.title}" (${slice.id}) with one slide per cell — replace_slides regroups them.`
  },
})

export const updateSliceTool = defineWriteTool({
  name: 'update_slice',
  description: "Edit a slice's own fields: title, summary, actor, kind.",
  args: z.object({
    slice_id: arg.text('Slice id from list_slices'),
    title: arg.optionalText('omit to keep'),
    summary: arg.optionalText('omit to keep'),
    actor: arg.optionalText('omit to keep'),
    kind: AGENT_SLICE_KIND.describe('omit to keep').optional(),
  }),
  aliases: SUMMARY_ALIAS,
  run: async ({ slice_id, title, summary, actor, kind }, { client }) => {
    const outcome = await patchSliceMeta(client, slice_id, {
      title,
      summary,
      actor,
      sliceKind: kind,
    })
    if (outcome.status === 'conflict')
      throw new Error('The slice changed since you read it — re-read and retry.')
    return 'Slice updated.'
  },
})

export const replaceSlidesTool = defineWriteTool({
  name: 'replace_slides',
  description:
    "Replace a slice's slides wholesale — THE tool for reordering, resequencing, merging cells into one slide, or splitting them apart. Read the slice first; pass the complete new slide list (each slide: cells in order + optional title/caption). When a reorder instruction is positionally ambiguous (e.g. \"move the last one up, then merge 2 and 3\" — original numbering or after the move?), confirm which you mean before writing. Re-read the slice afterwards to confirm the slide count matches what you intended.",
  args: z.object({
    slice_id: arg.text('Slice id'),
    slides: z
      .array(
        z.object({
          cells: arg.strings('Cell ids on this slide'),
          title: z.string().describe('Slide title; omit for none').optional(),
          caption: z.string().describe('Slide caption; omit for none').optional(),
        }),
      )
      .describe('Full replacement, in order'),
  }),
  run: async ({ slice_id, slides }, ctx) => {
    if (slides.length === 0) throw new Error('slides must be a non-empty array.')
    await refuseUnknownCells(
      ctx.client,
      requireActiveService(ctx),
      slides.flatMap((slide) => slide.cells),
    )
    await replaceSlides(
      ctx.client,
      slice_id,
      slides.map((slide) => ({
        cells: slide.cells,
        title: slide.title ?? '',
        caption: slide.caption ?? '',
      })),
    )
    return `Replaced the slice's slides (${slides.length}).`
  },
})
