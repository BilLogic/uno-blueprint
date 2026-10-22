import type { z } from 'zod'
import { executeServerWrite } from '@/lib/agent/server/writes'
import { defineWriteTool } from '@/lib/agent/tools/definition'
import { invalidateStructure } from '@/lib/queryClient'

type StructureWriteToolName = 'create_service' | 'create_scenario' | 'create_step' | 'update_phase' | 'update_scenario' | 'update_step' | 'update_lane'

/** Canvas structure writes use the definition's identity and the MCP confirmation gateway. */
export function structureWrite<Args extends z.ZodObject>(definition: Omit<Parameters<typeof defineWriteTool<Args>>[0], 'name' | 'run'> & { name: StructureWriteToolName }) {
  return defineWriteTool({ ...definition, run: async (args, ctx) => {
    const result = await executeServerWrite(ctx.client, definition.name, args, {
      sessionId: ctx.session.id, serviceId: ctx.scope?.kind === 'service' ? ctx.scope.serviceId : undefined,
      confirmed: ctx.confirmed === true,
    })
    invalidateStructure()
    return result
  } })
}
