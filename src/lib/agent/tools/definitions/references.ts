import { z } from 'zod'
import { arg, defineTool } from '@/lib/agent/tools/definition'
import {
  fetchableReferenceNames,
  listReferences,
  readReference,
  referenceNames,
} from '@/lib/agent/tools/references'

/**
 * The rulebook. Neither tool has a database behind it — the references are
 * bundled, and a deployment's own arrive through its config — so the
 * no-database trial serves the same implementation the live app does.
 */

/**
 * The first-read pointer at a deployment's own account of its blueprint.
 *
 * The template ships no `blueprint` reference; a deployment supplies one as
 * `agent.references`. So the pointer is written only when that name is
 * served — standalone, it would aim the model's first call at a reference
 * that does not exist. The description is a function for the same reason:
 * the names are the deployment's, read when the roster is assembled.
 */
export const getReferenceTool = defineTool({
  resourceOnly: true,
  resource: { uriPrefix: 'uno://references/', argument: 'name', names: referenceNames },
  name: 'get_reference',
  description: () => {
    const names = fetchableReferenceNames()
    const readFirst = names.includes('blueprint')
      ? 'Read blueprint first for what this blueprint is, what a status licenses you to say and what absence means; lane-roles'
      : 'Read lane-roles'
    return `Read a rulebook reference before acting on its topic. Available: ${names.join(', ')}. ${readFirst} and lane-vocabulary before any lane/role work; cocreate-playbook and elicitation-protocol before co-creating a scenario from conversation or notes.`
  },
  surface: 'read',
  args: z.object({
    name: arg.text('Reference name, e.g. "lane-roles"'),
  }),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async ({ name }, ctx) => readReference(name, ctx.roster),
})

export const listReferencesTool = defineTool({
  resourceOnly: true,
  name: 'list_references',
  description:
    'The rulebook references available to get_reference, live. Use when unsure what guidance exists.',
  surface: 'read',
  args: z.object({}),
  browserBacked: false,
  availability: { sample: true, mobile: true },
  run: async () => listReferences(),
})
