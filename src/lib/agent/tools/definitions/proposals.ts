import { z } from 'zod'
import { recordSuggestionApproval } from '@/lib/authoringSession'
import { invalidateAfterRpc } from '@/lib/authoringRpc'
import { defineTool, defineWriteTool, requireClient } from '@/lib/agent/tools/definition'

export const listSuggestedChangesTool = defineTool({
  name: 'list_suggested_changes', surface: 'read', browserBacked: false,
  description: 'Pending proposals: who suggested each cell-content, cell-spec or structural change, and its tool arguments. Read the target before approving.',
  args: z.object({}), availability: { sample: false, mobile: true },
  run: async (_args, ctx) => {
    const { data, error } = await requireClient(ctx).from('suggested_changes').select('*').eq('status', 'pending').order('created_at')
    if (error) throw new Error(error.message)
    return JSON.stringify(data)
  },
})

export const approveSuggestedChangeTool = defineWriteTool({
  name: 'approve_suggested_change',
  description: 'Approve a reviewed proposal as the signed-in confirmer. Revalidates the proposal; a changed target is refused without writing. Call only after the person explicitly approves.',
  args: z.object({ suggested_change_id: z.string().uuid() }),
  run: async ({ suggested_change_id }, ctx) => {
    const { data, error } = await ctx.client.rpc('approve_suggested_change', { p_id: suggested_change_id })
    if (error) throw new Error(error.message)
    // The database has already appended the audit row. This local entry
    // records the action, without importing any durable inverse into undo.
    recordSuggestionApproval(suggested_change_id)
    invalidateAfterRpc('approve_suggested_change', { suggested_change_id })
    return JSON.stringify(data)
  },
})

export const declineSuggestedChangeTool = defineWriteTool({
  name: 'decline_suggested_change',
  description: 'Decline a pending proposal as the signed-in confirmer; leaves the blueprint unchanged.',
  args: z.object({ suggested_change_id: z.string().uuid() }),
  run: async ({ suggested_change_id }, ctx) => {
    const { error } = await ctx.client.rpc('decline_suggested_change', { p_id: suggested_change_id })
    if (error) throw new Error(error.message)
    return 'Proposal declined.'
  },
})
