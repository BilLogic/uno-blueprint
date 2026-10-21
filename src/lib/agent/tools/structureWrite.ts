import { executeServerWrite } from '@/lib/agent/server/writes'
import type { WriteContext } from '@/lib/agent/tools/definition'
import { invalidateStructure } from '@/lib/queryClient'

/** Canvas structure writes use the same proposal and confirmation gateway as MCP. */
export const structureWrite = (name: string) => async (args: Record<string, unknown>, ctx: WriteContext) => {
  const result = await executeServerWrite(ctx.client, name, args, {
    sessionId: ctx.session.id, serviceId: ctx.scope?.kind === 'service' ? ctx.scope.serviceId : undefined,
    confirmed: ctx.confirmed === true,
  })
  invalidateStructure()
  return result
}
