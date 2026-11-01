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
import { toAuthoringError } from '@/lib/authoringErrors'
import { createSlice, patchSliceMeta, replaceSlides } from '@/lib/sliceMutations'
import { executeServerWrite } from '@/lib/agent/server/writes'
import { browserToolServerUrl, withSharedSliceLink } from '@/lib/agent/server/sharedSlice'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/** The tools that read and author a slice — a stakeholder's view of the journey. */

export const listSlicesTool = defineTool({
  name: 'list_slices',
  description: 'List existing slices (stakeholder views) with ids and types.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
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
  browserBacked: false,
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
 * Refuse every cell id that names no cell, before the slice write is asked for.
 *
 * A slice may cite cells from any service of the business, so a well-formed
 * id is checked for existence only. The authority is the database:
 * `replace_slides`, which `create_slice` runs too, refuses a cell that is not
 * an id in its own transaction, so nothing lands either way. This check is the
 * agent's fail-fast. A model copying a seeded id drops a run of zeros, and the
 * function's refusal names the slide but not where real ids come from; and an
 * id that is well formed but names no cell the function has no foreign key to
 * catch. So a malformed id is refused here without asking the database, and a
 * well-formed one must name a cell. The refusal names each bad id and says
 * where the real ones are to be copied from.
 */
async function refuseUnknownCells(
  client: Client,
  cellIds: readonly string[],
): Promise<void> {
  const distinct = [...new Set(cellIds)]
  const wellFormed = distinct.filter((id) => UUID.test(id))
  const held = new Set<string>()
  if (wellFormed.length > 0) {
    const { data, error } = await client.from('cells').select('id').in('id', wellFormed)
    if (error) throw toAuthoringError(error)
    for (const row of data ?? []) held.add(row.id)
  }
  const bad = distinct.filter((id) => !held.has(id))
  if (bad.length === 0) return
  throw new Error(
    `${bad.map((id) => `"${id}" is not a cell in this blueprint`).join('; ')} — copy ids verbatim from get_slice or list_blueprint.`,
  )
}

/**
 * Refuse a slice that is not the active service's, before it is written.
 *
 * A slice id is a bare uuid, and neither `replace_slides` nor the meta update
 * asks which service the slice belongs to: an id carried over from another
 * blueprint would be written to, out of the reader's sight. One read of the
 * slice's own service settles it, and the refusal says where its ids come from.
 */
async function refuseForeignSlice(client: Client, serviceId: string, sliceId: string): Promise<void> {
  const { data, error } = await client
    .from('slices')
    .select('id, service_id')
    .eq('id', sliceId)
    .maybeSingle()
  if (error) throw toAuthoringError(error)
  if (data?.service_id === serviceId) return
  throw new Error(`"${sliceId}" is not a slice in this service — copy its id from list_slices.`)
}

export const createSliceTool = defineWriteTool({
  name: 'create_slice',
  description:
    'Create a slice (stakeholder view) that REFERENCES existing cells — never copies. cell_ids in journey order, one slide per cell by default; they may come from more than one service when the audience needs it, and service_id is the service the slice is filed under. Propose members by name and get a nod first.',
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
    await refuseUnknownCells(ctx.client, cell_ids)
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
  run: async ({ slice_id, title, summary, actor, kind }, ctx) => {
    await refuseForeignSlice(ctx.client, requireActiveService(ctx), slice_id)
    const outcome = await patchSliceMeta(ctx.client, slice_id, {
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
    const serviceId = requireActiveService(ctx)
    await refuseForeignSlice(ctx.client, serviceId, slice_id)
    await refuseUnknownCells(
      ctx.client,
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

export const shareSliceTool = defineWriteTool({
  name: 'share_slice',
  description:
    'Make a link that opens this slice, and only the cells it cites, for someone without an account. Changes to those cells show through the link. Name who it is for and get a yes from someone who may approve first; other callers record a proposal. Returns the link once: hand it over as given.',
  args: z.object({
    slice_id: arg.text('Slice id from list_slices'),
  }),
  run: async ({ slice_id }, ctx) => {
    await refuseForeignSlice(ctx.client, requireActiveService(ctx), slice_id)
    return withSharedSliceLink(await executeServerWrite(ctx.client, 'share_slice', { slice_id }, {
      sessionId: ctx.session.id, serviceId: requireActiveService(ctx), confirmed: ctx.confirmed === true,
    }), browserToolServerUrl())
  },
})

export const unshareSliceTool = defineWriteTool({
  name: 'unshare_slice',
  description:
    'Stop every link to this slice from working. The slice itself stays. Get a yes from someone who may approve first; other callers record a proposal.',
  args: z.object({
    slice_id: arg.text('Slice id from list_slices'),
  }),
  run: async ({ slice_id }, ctx) => {
    await refuseForeignSlice(ctx.client, requireActiveService(ctx), slice_id)
    return executeServerWrite(ctx.client, 'unshare_slice', { slice_id }, {
      sessionId: ctx.session.id, serviceId: requireActiveService(ctx), confirmed: ctx.confirmed === true,
    })
  },
})
