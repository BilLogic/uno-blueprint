import { z } from 'zod'
import {
  arg,
  defineTool,
  defineWriteTool,
  requireActiveService,
  requireClient,
  requireScope,
} from '@/lib/agent/tools/definition'
import { listFindings } from '@/lib/agent/tools/read'
import { RATINGS } from '@/lib/findingPriority'
import { findingFingerprint } from '@/lib/findingFingerprint'
import { recordFinding, updateFinding } from '@/lib/findingMutations'

/** The findings ledger: what an audit or a what-if run recorded, and its status. */

export const listFindingsTool = defineTool({
  name: 'list_findings',
  description:
    'The findings ledger: audit/whatif findings with status, severity and impact/effort ratings, grouped in priority order (Do first, Plan, Quick wins, Later). Read before recording (see what is already open), when reporting an audit, and when the human asks to triage.',
  surface: 'read',
  args: z.object({
    status: z
      .enum(['open', 'resolved', 'dismissed', 'all'])
      .describe('Filter; default open')
      .optional(),
    cell_id: arg.optionalText(
      'Only findings that cite this cell. Use when the human asks whether anything is flagged on one moment.',
    ),
  }),
  availability: { sample: false, mobile: true },
  run: async ({ status, cell_id }, ctx) =>
    listFindings(requireClient(ctx), { status, cellId: cell_id, scope: requireScope(ctx) }),
})

export const createFindingTool = defineWriteTool({
  name: 'create_finding',
  description:
    'Record one ub:audit / ub:whatif finding as a triageable row, with its severity and its impact and effort ratings. Dedupe is built in: an open finding with the same fingerprint (check_key + cited cells) is updated in place, ratings included, a dismissed one stays dismissed (the call reports it and writes nothing), a resolved one reopens as a new row. Omit run_id on the first finding of a run and reuse the returned run_id for the rest of that run. Cite cells by id; for a zero-cell finding pass scope instead (e.g. "scenario:Intake Call").',
  args: z.object({
    source: z.enum(['audit', 'whatif']).describe('Which skill produced it'),
    check_key: arg.text('Roster check key, e.g. "gap-sweep"'),
    severity: z
      .enum(['info', 'warn', 'critical'])
      .describe('Per the check doc default unless evidence says otherwise'),
    impact: z
      .enum(RATINGS)
      .describe(
        "How much fixing it matters to the service, rated from the check doc's rubric. Required on every finding.",
      ),
    effort: z
      .enum(RATINGS)
      .describe(
        "How much work the fix takes, rated from the check doc's rubric. Required on every finding.",
      ),
    summary: arg.text(
      'The finding itself — what is wrong, where, and why it matters. No raw ids in this text.',
    ),
    cell_ids: arg.strings('Cells the finding is about; omit only for zero-cell findings').optional(),
    scope: arg.optionalText(
      'Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. "scenario:Intake Call:orphan-step-cooldown"',
    ),
    run_id: arg.optionalText('The run identity returned by the first create_finding of this run'),
  }),
  run: async (
    { source, check_key, severity, impact, effort, summary, cell_ids, scope, run_id },
    ctx,
  ) => {
    const cellIds = cell_ids ?? []
    if (cellIds.length === 0 && !scope)
      throw new Error('A zero-cell finding needs a scope (e.g. "scenario:Intake Call").')
    const runId = run_id ?? crypto.randomUUID()
    const fingerprint = await findingFingerprint(check_key, cellIds, scope)
    // The dedupe branch and both its writes live in findingMutations, so
    // every one of them reaches the session ledger. The tool's job here is
    // the sentence the model reads back, which differs per outcome.
    const outcome = await recordFinding(ctx.client, {
      serviceId: requireActiveService(ctx),
      runId,
      source,
      checkKey: check_key,
      severity,
      impact,
      effort,
      cellIds,
      summary,
      fingerprint,
    })
    const reuse = `run_id ${runId}; reuse it for the rest of this run.`
    if (outcome.kind === 'deduped')
      return `An open finding already had this fingerprint — updated it in place (dedupe). ${reuse}`
    if (outcome.kind === 'suppressed')
      return `A finding with this fingerprint was dismissed by a human — dismissed stays dismissed. Nothing recorded. ${reuse}`
    return `Recorded ${severity} finding (impact ${impact}, effort ${effort}) for ${check_key}${outcome.reopened ? ' (a resolved twin existed — this reopens the issue)' : ''}. ${reuse}`
  },
})

export const updateFindingTool = defineWriteTool({
  name: 'update_finding',
  description:
    'Triage a finding: resolved (fixed / no longer true) or dismissed (accepted as-is; dismissed findings never reopen), or open to reopen. This is the only edit humans or agents make to an existing finding.',
  args: z.object({
    finding_id: arg.text('Finding id from list_findings'),
    status: z.enum(['open', 'resolved', 'dismissed']).describe('New status'),
  }),
  run: async ({ finding_id, status }, { client }) => {
    await updateFinding(client, finding_id, { status })
    return `Finding is now ${status}.`
  },
})
