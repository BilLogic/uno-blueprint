import { z } from 'zod'
import { arg, defineTool, defineWriteTool, requireClient } from '@/lib/agent/tools/definition'
import { listStakeholders } from '@/lib/agent/tools/read'
import { createStakeholder, patchStakeholder } from '@/lib/stakeholderMutations'
import { SERVICE_ARG, readScope } from '@/lib/agent/tools/definitions/scope'

/**
 * The cast. A deployment-level catalog under the decision that a service
 * owns its journey and shares the catalog, so the read is unscoped by
 * default and narrows to the actors one service's lanes pick when asked.
 * The bundled sample is a board, not a deployment, and carries no cast — so
 * the no-database trial is not offered this tool, rather than answering
 * with an invented empty roster.
 */

export const listStakeholdersTool = defineTool({
  name: 'list_stakeholders',
  description:
    'The cast: who the blueprint is for, who staffs it, who partners on it, and the provider itself — with the other spellings each name has been written as. ALWAYS read before writing a value_props audience or linking a lane: `owner` and `Blueprint owner` are one person, and the aliases are where that is recorded. The cast is a shared deployment-level catalog; by default this shows the actors the active service\'s lanes pick (the whole roster on a single-service deployment), and service:"all" shows every actor in the deployment.',
  surface: 'read',
  args: z.object({
    service: SERVICE_ARG,
  }),
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ service }, ctx) => {
    const client = requireClient(ctx)
    return listStakeholders(client, await readScope(ctx, service))
  },
})

/**
 * The kinds the agent may WRITE — the four ACTOR kinds, not the whole CHECK.
 * `team` is legal in the column and deliberately absent here: a team is an
 * accountable group, never a party who appears in a lane, and the agent's
 * stakeholder tools exist to name the cast. An existing team row is still
 * editable — `update_stakeholder` carries a kind it was not asked to change
 * straight through rather than validating it.
 */
const AGENT_STAKEHOLDER_KIND = z.enum(['recipient', 'staff', 'partner', 'provider'])

export const createStakeholderTool = defineWriteTool({
  name: 'create_stakeholder',
  description:
    'Add someone to the cast. Rare and deliberate — a new row means a new ACTOR in the service, not a new spelling of one who exists. A different spelling belongs in the existing row\'s aliases via update_stakeholder.',
  args: z.object({
    name: arg.text('How this actor is written on the canvas, e.g. "Blueprint owner"'),
    kind: AGENT_STAKEHOLDER_KIND.describe('recipient | staff | partner | provider'),
    summary: arg.optionalText('Who they are, in one line; omit for none'),
    aliases: arg.strings('Other spellings already present in this blueprint').optional(),
  }),
  run: async ({ name, kind, summary, aliases }, { client }) => {
    const id = await createStakeholder(client, {
      name,
      kind,
      summary: summary ?? null,
      aliases: aliases ?? [],
    })
    return `Added stakeholder (${id}).`
  },
})

export const updateStakeholderTool = defineWriteTool({
  name: 'update_stakeholder',
  description:
    "Edit one member of the cast. Renaming also rewrites `slices.actor` on every slice linked to them — the registry owns that text. Read list_stakeholders first; the id is in its output.",
  args: z.object({
    stakeholder_id: arg.text('Stakeholder id'),
    name: arg.optionalText('New name; omit to keep'),
    kind: AGENT_STAKEHOLDER_KIND.describe('recipient | staff | partner | provider; omit to keep').optional(),
    summary: arg.optionalText('One line; omit to keep'),
    aliases: arg.strings('Replaces the alias list; omit to keep').optional(),
  }),
  run: async ({ stakeholder_id, name, kind, summary, aliases }, { client }) => {
    await patchStakeholder(client, stakeholder_id, { name, kind, summary, aliases })
    return 'Stakeholder updated.'
  },
})
