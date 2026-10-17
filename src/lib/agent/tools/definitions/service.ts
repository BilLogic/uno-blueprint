import { z } from 'zod'
import { defineTool, requireClient, requireScope } from '@/lib/agent/tools/definition'
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
