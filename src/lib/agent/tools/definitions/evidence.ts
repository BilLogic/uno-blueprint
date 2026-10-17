import { z } from 'zod'
import {
  arg,
  defineTool,
  defineWriteTool,
  requireActiveService,
  requireClient,
  requireScope,
} from '@/lib/agent/tools/definition'
import { getEvidence, listEvidence } from '@/lib/agent/tools/read'
import { EVIDENCE_KINDS, addEvidence, updateEvidence } from '@/lib/evidenceMutations'

/**
 * The provenance: the sources a blueprint's claims rest on. The bundled
 * sample carries none, so neither read is offered to the no-database trial.
 */

export const listEvidenceTool = defineTool({
  name: 'list_evidence',
  description:
    'Sources the blueprint\'s claims rest on — interviews, analytics, docs, decisions. Pass cell_id for one cell\'s evidence. Read before asserting that a mapped moment is GROUNDED: a cell with no evidence is a claim, not a finding.',
  surface: 'read',
  args: z.object({
    cell_id: arg.optionalText(
      'Restrict to evidence attached to this cell; omit for the newest 100 across the active service',
    ),
  }),
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ cell_id }, ctx) => listEvidence(requireClient(ctx), cell_id, requireScope(ctx)),
})

export const getEvidenceTool = defineTool({
  name: 'get_evidence',
  description:
    'Named evidence rows in full, the note included. Use after list_evidence to read the sources you intend to cite.',
  surface: 'read',
  args: z.object({
    evidence_ids: arg.strings('Evidence ids from list_evidence'),
  }),
  browserBacked: false,
  availability: { sample: false, mobile: true },
  run: async ({ evidence_ids }, ctx) => getEvidence(requireClient(ctx), evidence_ids),
})

const EVIDENCE_KIND = z.enum(EVIDENCE_KINDS)
const KIND_WORDS = EVIDENCE_KINDS.join(' | ')

export const createEvidenceTool = defineWriteTool({
  name: 'create_evidence',
  description: `Attach a source to a cell — the record of WHY a mapped moment is believed. kind is one of ${EVIDENCE_KINDS.join(', ')}. Write evidence when the user tells you where something came from; never invent a source, and never attach one to a cell you have not read.`,
  args: z.object({
    cell_id: arg.text('Cell the source supports'),
    kind: EVIDENCE_KIND.describe(KIND_WORDS),
    title: arg.text('What the source IS, e.g. "Onboarding interview #4" — required'),
    note: arg.optionalText(
      'Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none',
    ),
  }),
  run: async ({ cell_id, kind, title, note }, ctx) => {
    // Same wrapper, same service and the same documented cell_key
    // placeholder the cell panel uses — so an agent-added source lands in
    // the session ledger and can be reverted exactly like a human-added one.
    const id = await addEvidence(ctx.client, {
      serviceId: requireActiveService(ctx),
      cellId: cell_id,
      cellKey: cell_id,
      kind,
      title,
      note: note ?? null,
    })
    return `Evidence added (${id}).`
  },
})

export const updateEvidenceTool = defineWriteTool({
  name: 'update_evidence',
  description:
    'Edit an evidence row: kind, title, note. Pass only the fields you mean to change — the rest are kept. To move a source to a DIFFERENT cell, add it there and remove it here; this tool does not re-point it.',
  args: z.object({
    evidence_id: arg.text('Evidence id from list_evidence'),
    kind: EVIDENCE_KIND.describe(`${KIND_WORDS}; omit to keep`).optional(),
    title: arg.optionalText('New title; omit to keep'),
    note: arg.optionalText('New note; omit to keep'),
  }),
  run: async ({ evidence_id, kind, title, note }, { client }) => {
    await updateEvidence(client, evidence_id, { kind, title, note })
    return 'Evidence updated.'
  },
})
