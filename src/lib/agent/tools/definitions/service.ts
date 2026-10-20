import { z } from 'zod'
import { arg, defineTool, defineWriteTool, requireClient, requireScope } from '@/lib/agent/tools/definition'
import { executeServerWrite } from '@/lib/agent/server/writes'
import { invalidateStructure } from '@/lib/queryClient'
import { getBusinessModel } from '@/lib/agent/tools/read'

/** The service itself: what it is, and how it sustains itself. */

export const getBusinessModelTool = defineTool({
  name: 'get_business_model',
  description:
    'The service\'s business model: pricing, revenue model, funding, partners, delivery cost. One row per service — no id to pass. Read before answering anything about how the service sustains itself.',
  surface: 'read',
  args: z.object({}),
  // The bundled sample is a board, not a deployment: it carries no business
  // model to answer from, so the trial is not offered this read.
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async (_args, ctx) => getBusinessModel(requireClient(ctx), requireScope(ctx)),
})

/** Includes empty services: cells are not the catalogue of a business's services. */
export const listServicesTool = defineTool({
  name: 'list_services',
  description: 'List this business’s services with their ids, names and summaries, including services with no cells. Use an id as service_id when creating a phase or recording a finding.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async (_args, ctx) => {
    const { data, error } = await requireClient(ctx).from('services').select('id,name,summary,slug').order('name')
    if (error) throw new Error(error.message)
    return data?.length ? JSON.stringify(data) : 'No services yet. Propose create_service and ask someone who may confirm for a yes.'
  },
})

export const createServiceTool = defineWriteTool({
  name: 'create_service',
  description: 'Start a new service when a topic fits none of this business’s services. Propose its name and get a yes from someone who may confirm first. Other callers record a proposal. Returns the service id for creating its first phase.',
  args: z.object({ name: arg.text('Service name'), summary: arg.optionalText('What this service offers; omit for none') }),
  run: async (args, ctx) => {
    // The same transaction owns proposals and attribution on every host.
    const result = await executeServerWrite(ctx.client, 'create_service', args, { sessionId: ctx.session.id, confirmed: true })
    invalidateStructure()
    return result
  },
})
