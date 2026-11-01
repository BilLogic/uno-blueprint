import { z } from 'zod'
import { defineTool, requireClient } from '@/lib/agent/tools/definition'

/** Sign-in identifies the person to Uno; never accept another profile id. */
export const getProfileTool = defineTool({
  name: 'get_profile', surface: 'read', browserBacked: false,
  description: 'The signed-in person’s own profile: stakeholder link, name, preferred register and whether they may approve. Read first when starting Uno; a missing profile needs an operator to link the login.',
  args: z.object({}), availability: { sample: false, mobile: true },
  run: async (_args, ctx) => {
    const { data, error } = await requireClient(ctx).from('profiles')
      .select('id, stakeholder_id, display_name, may_approve, register, last_run_at').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? JSON.stringify(data) : 'No profile is linked to this login. Ask the operator to link it before starting Uno.'
  },
})
