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
  description: 'Approve a reviewed proposal as the signed-in approver. Re-checks every row the proposal names, cells inside slides included; one that changed or moved is refused without writing. Call only after the person explicitly approves.',
  args: z.object({ suggested_change_id: z.string().uuid() }),
  run: async ({ suggested_change_id }, ctx) => {
    // Through the tool gateway, so the log row names this agent session as the
    // approver's; a direct approval is recorded as a person's.
    const { data, error } = await ctx.client.rpc('run_agent_tool', {
      p_tool: 'approve_suggested_change', p_args: { suggested_change_id }, p_session_id: ctx.session.id,
    })
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
  description: 'Decline a pending proposal as the signed-in approver; leaves the blueprint unchanged.',
  args: z.object({ suggested_change_id: z.string().uuid() }),
  run: async ({ suggested_change_id }, ctx) => {
    const { error } = await ctx.client.rpc('decline_suggested_change', { p_id: suggested_change_id })
    if (error) throw new Error(error.message)
    return 'Proposal declined.'
  },
})
