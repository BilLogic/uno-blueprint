import canvasAdapter from '@/lib/agent/skill/references/canvas-adapter.md?raw'
import dataModel from '@/lib/agent/skill/references/data-model.md?raw'
import elicitationProtocol from '@/lib/agent/skill/references/elicitation-protocol.md?raw'
import cocreatePlaybook from '@/lib/agent/skill/references/cocreate-playbook.md?raw'
import laneVocabulary from '@/lib/agent/skill/references/lane-vocabulary.md?raw'
import laneRoles from '@/lib/agent/skill/references/lane-roles.md?raw'
import auditPlaybook from '@/lib/agent/skill/references/audit-playbook.md?raw'
import whatifPlaybook from '@/lib/agent/skill/references/whatif-playbook.md?raw'
import checkGapSweep from '@/lib/agent/skill/references/check-gap-sweep.md?raw'
import checkJargonLint from '@/lib/agent/skill/references/check-jargon-lint.md?raw'
import checkChannelConflict from '@/lib/agent/skill/references/check-channel-conflict.md?raw'
import checkKpiAlignment from '@/lib/agent/skill/references/check-kpi-alignment.md?raw'
import checkPerceivedOwner from '@/lib/agent/skill/references/check-perceived-owner.md?raw'
import checkValueLedger from '@/lib/agent/skill/references/check-value-ledger.md?raw'
import checkFeeVisibility from '@/lib/agent/skill/references/check-fee-visibility.md?raw'
import checkObsoleteSource from '@/lib/agent/skill/references/check-obsolete-source.md?raw'
import slicePlaybook from '@/lib/agent/skill/references/slice-playbook.md?raw'
import sliceTemplates from '@/lib/agent/skill/references/slice-templates.md?raw'

/**
 * WHERE the rulebook's documents come from — the one module that names their
 * paths. This repo is the rulebook's home and VENDORS its own copies
 * (`scripts/sync-canvas-skills.mjs` mirrors the shared `references` tree and
 * each skill's own into `src/lib/agent/skill/references`, flat, because
 * `get_reference` serves files by bare name). A deployment's own documents
 * do not come through here: it supplies them as `agent.references` on its
 * config, and `references.ts` lays them over this record when a document is
 * served.
 *
 * Adding a reference means four edits: the source file plus its row in
 * `scripts/sync-canvas-skills.mjs`, the import and the row here, the name in
 * `referenceNames.ts`, and the published path in
 * `scripts/check-reference-paths.mjs` (by the decision that reference paths
 * are a published interface — consumers import them by name). `references.ts`
 * throws at module init if the record and the name list disagree.
 *
 * The canvas adapter is the one document rendered before it is served: its
 * two surface rows carry `{{write_tools}}` and `{{read_tools}}`, which
 * `renderCanvasAdapter` in `references.ts` fills from the session's roster, so
 * the lists are always the tools that session can call. A reader holding the
 * file rather than a session sees the placeholders.
 */
export const TEMPLATE_REFERENCE_DOCS: Record<string, string> = {
  'canvas-adapter': canvasAdapter,
  'lane-roles': laneRoles,
  'lane-vocabulary': laneVocabulary,
  'elicitation-protocol': elicitationProtocol,
  'cocreate-playbook': cocreatePlaybook,
  'data-model': dataModel,
  'audit-playbook': auditPlaybook,
  'whatif-playbook': whatifPlaybook,
  'check-gap-sweep': checkGapSweep,
  'check-jargon-lint': checkJargonLint,
  'check-channel-conflict': checkChannelConflict,
  'check-kpi-alignment': checkKpiAlignment,
  'check-perceived-owner': checkPerceivedOwner,
  'check-value-ledger': checkValueLedger,
  'check-fee-visibility': checkFeeVisibility,
  'check-obsolete-source': checkObsoleteSource,
  'slice-playbook': slicePlaybook,
  'slice-templates': sliceTemplates,
}
