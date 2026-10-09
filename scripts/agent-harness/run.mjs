#!/usr/bin/env node
/**
 * Canvas-agent eval harness. See cases.md for the human-readable suite;
 * cases.mjs holds the machine form (prompts, mocks, trace checks, judge
 * lines).
 *
 * Reality contract:
 * - READS are real: PostgREST (anon, RLS read-only) when VITE_SUPABASE_URL
 *   is configured, else the SHIPPED SAMPLE FIXTURE (the same modules the
 *   app renders keyless) — so a fresh clone runs the harness with zero env.
 *   The rows come over REST here; the TEXT is the app's own formatter in
 *   every case, so a database read answers in the words the app answers in.
 * - WRITES are dry-run: the tool's own `run` executes against a recording
 *   client that answers with `dry-N` placeholders, so the model reads the
 *   tool's own sentence — plus the rehearsal note, which is the harness's,
 *   because it is about the rehearsal and not about the write. Nothing is
 *   sent anywhere. A rehearsal cannot refuse what only real rows could
 *   refuse (see the dry-run branch); a rehearsal that throws is a tool
 *   error, not a write that happened.
 * - get_ui_state (and injection cases' get_cell) are per-case mocks — the
 *   CLI has no live shell to observe.
 *
 * One-sourced vs mirrored (be honest about which is which):
 * - ONE-SOURCED: tool specs/rosters and the offline fixture are IMPORTED
 *   from src (surface.mjs has rolldown bundle app-surface.entry.ts at
 *   startup; cases.mjs takes its write roster from the same bundle). role.md,
 *   canvas-adapter.md and the skill files are the SAME FILES the app loads
 *   (`?raw` there, readFileSync here). No copies, so no drift.
 * - MIRRORED BY HAND: the system-prompt ASSEMBLY (buildStableSystem +
 *   buildLiveContext + the tier / mobile injections), the provider glue and
 *   the round cap follow src/lib/agent/loop.ts and providers/ by copy — edit
 *   both sides together. The app splits that
 *   assembly in two where it crosses the provider seam — a stable part it
 *   builds without the context note, and a volatile part the context block
 *   opens — because one provider caches the prefix. The harness calls no
 *   provider that caches, so its `buildSystem` below keeps both in one
 *   function and takes the context note as an argument; the STRING it
 *   produces is the app's two parts joined, which is what parity means here. What remains harness-local in the tool RESULTS is the
 *   per-case mock (get_ui_state, and the injection cases' get_cell), the
 *   rehearsal note, the "no browser session store" answers, and the findings
 *   header that quotes a count=exact total the app's read never asks for.
 *   Everything else — the writes, the refusals, and every database read's
 *   text — answers in the app's words, and `toolParity.test.mjs` fails if a
 *   sentence the app says turns up composed here again.
 * - ROSTER AND ADMISSION: ONE-SOURCED, with ONE widening and one fork
 *   declared. The offer is `sessionRoster` — the app's own — handed the mode
 *   this environment is in, so the harness cannot grade a model in a state no
 *   reader can reach. It used to offer the whole spec table whatever the
 *   environment, which forked twice over: ranked search with no index behind
 *   it (a refusal the app has and this could not say, so it said one of its
 *   own) and every write with no database. The search half is now derived
 *   away — `searchOffered: false` is the truth here, so the tool is absent and
 *   the app's own missing-search refusal is true on both sides and shared. The
 *   write half is the widening, and it is deliberate: see `harnessMode` below
 *   for what it buys and what it costs.
 *
 *   The DISPATCH derives too: `admitToolCall` answers whether a call may run,
 *   so the mobile gate, the write gate and the batch budget are the app's, in
 *   the app's order, rather than three blocks spelled here in an order of
 *   their own. What stays this side of the seam is the live facts, and one of
 *   them is a FORK, stated at `isWriteCall`: write-ness here is the
 *   definition's surface, where the app also asks a `ui_command`'s arguments
 *   against a command registry no environment without a canvas can fill.
 * - DELIBERATELY NOT MIRRORED: the loop's repeat-read guard, which answers a
 *   read already run this turn with a pointer to the earlier result instead
 *   of running it again. The gates derived above shape what a model DOES —
 *   how many writes land, how many rounds it gets — and a harness that let a
 *   model exceed them would grade a run the app could not have. This one
 *   shapes only what a model SEES TWICE, and no case in the suite repeats a
 *   read, so the fact is handed to the admission as `false` and the pointer
 *   the app would answer with is never said here. Turn it on the day a case
 *   needs it — the gate itself is already the app's.
 *
 * Provider selection is NEUTRAL — the first key found wins:
 *   GEMINI_API_KEY, then ANTHROPIC_API_KEY, then OPENAI_API_KEY
 * (env or gitignored .env.local; --provider forces one). Example:
 *   GEMINI_API_KEY=… node scripts/agent-harness/run.mjs
 *
 * Usage:
 *   node scripts/agent-harness/run.mjs             # full suite
 *   node scripts/agent-harness/run.mjs --case C1   # one case
 *   node scripts/agent-harness/run.mjs --list      # print case ids, no key
 *   node scripts/agent-harness/run.mjs --smoke     # no key needed: mock
 *                                                  # provider, machinery only
 *   node scripts/agent-harness/run.mjs --repeat 3  # majority-vote per line
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { sweep } from '../sweep.mjs'
import { CASES } from './cases.mjs'
import { surface } from './surface.mjs'

/** The tree the harness runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const ROOT = process.cwd()

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) out[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return out
}
const env = {
  ...loadEnvFile(resolve(ROOT, '.env')),
  ...loadEnvFile(resolve(ROOT, '.env.local')),
  ...process.env,
}

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name) => {
  const at = args.indexOf(`--${name}`)
  return at !== -1 ? args[at + 1] : undefined
}
const SMOKE = flag('smoke')
const ONLY = opt('case')
if (flag('list')) {
  for (const caseDef of CASES) console.log(`${caseDef.id}  ${caseDef.title}`)
  process.exit(0)
}
// --repeat N: run each case N times, majority-vote every rubric line.
// Separates model variance from regressions — a line at 1/3 is flaky or
// broken, a line at 3/3 is stable; a single run cannot tell you which.
const REPEAT = Math.max(1, Number(opt('repeat') ?? 1) || 1)

// ---------------------------------------------------------------------------
// Provider selection: neutral, first key found wins.
// ---------------------------------------------------------------------------
const PROVIDERS = [
  { id: 'google', envKey: 'GEMINI_API_KEY', defaultModel: 'gemini-3.6-flash' },
  { id: 'anthropic', envKey: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-5' },
  { id: 'openai', envKey: 'OPENAI_API_KEY', defaultModel: 'gpt-5.5' },
]
const forcedProvider = opt('provider')
const PROVIDER = forcedProvider
  ? PROVIDERS.find((p) => p.id === forcedProvider)
  : PROVIDERS.find((p) => env[p.envKey])
const API_KEY = PROVIDER ? env[PROVIDER.envKey] : undefined
const MODEL = opt('model') ?? PROVIDER?.defaultModel
const JUDGE_MODEL = opt('judge-model') ?? MODEL

if (!SMOKE && (!PROVIDER || !API_KEY)) {
  console.error(
    'No provider key found. Set one of GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY (env or .env.local) — or run --smoke, which needs no key.',
  )
  process.exit(2)
}

// ---------------------------------------------------------------------------
// Reads: PostgREST when configured, else the bundled sample fixture.
// ---------------------------------------------------------------------------
const HAS_DB = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY)

async function rest(pathAndQuery) {
  const response = await fetch(
    `${env.VITE_SUPABASE_URL}/rest/v1/${pathAndQuery}`,
    {
      headers: {
        apikey: env.VITE_SUPABASE_ANON_KEY,
        authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      },
    },
  )
  if (!response.ok)
    throw new Error(`postgrest ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

// ---------------------------------------------------------------------------
// One-sourced app surface: surface.mjs bundles specs + fixture from src.
// ---------------------------------------------------------------------------
const {
  TOOL_SPECS,
  TOOL_DEFINITIONS,
  WRITE_TOOL_NAMES,
  BATCH_LIMIT_REFUSAL,
  MOBILE_SHELL_REFUSAL,
  NO_SEARCH_REFUSAL,
  VIEW_ONLY_REFUSAL,
  AGENT_CELL_FIELDS,
  noSuchToolRefusal,
  renderCanvasAdapter,
  rehearsalContext,
  runTool,
  sessionRoster,
  admitToolCall,
} = surface

/**
 * The cell columns the harness's `get_cell` returns: the id and the fields
 * the agent may edit, from the list `update_cell` builds its arguments from.
 * The app's own `get_cell` also returns the slot and the resources; the
 * harness reads what its cases judge, which is the writable half.
 */
const CELL_COLUMNS = ['id', ...AGENT_CELL_FIELDS.map((field) => field.key)]
/** The owner-tag columns, from the same list: the fields the panel edits as tags. */
const OWNER_TAG_COLUMNS = AGENT_CELL_FIELDS.filter((field) => field.editor.control === 'ownerTag').map(
  (field) => field.key,
)

/**
 * Whether a call writes, as this environment can answer it: the definition's
 * surface. The app's own predicate also asks the ARGUMENTS — `ui_command` is
 * a write when its `command` names a mutating control — and that half cannot
 * cross, because the answer comes from the live registry the open surfaces
 * fill and nothing registers a command here (the harness serves no
 * `ui_command` at all; a call to it falls to the unknown-name refusal). So
 * the divergence is one-directional and named: a mutating `ui_command` would
 * be refused to a viewer and budgeted in the app and is neither here.
 */
const isWriteCall = (name) => WRITE_TOOL_NAMES.has(name)

// ---------------------------------------------------------------------------
// System prompt (mirror of src/lib/agent/loop.ts buildStableSystem followed by
// buildLiveContext, joined — the app splits them at the provider seam, this
// has no seam to split at. See header.)
// ---------------------------------------------------------------------------
// The role and the vendored skill surface are APPLICATION source, read
// wherever the application is — `<root>/src` in a tree that keeps its own copy
// and the package's `src` in a deployment that reads it out of `node_modules`.
//
// THE TWO FOLDERS ARE SWEPT RATHER THAN LOCATED, because a DIRECTORY resolves
// through the overlay only when the whole directory is in one layer: a
// deployment that keeps its own copy of one skill document would hand this a
// directory holding that file alone. The sweep lists the documents across the
// layers and reads each where it is, and it refuses a tree that vendors none —
// a harness with no skill surface has no system prompt to build.
const SKILL_REFERENCES = 'src/lib/agent/skill/references/'
const SKILL_SKILLS = 'src/lib/agent/skill/skills/'
const app = sweep({
  subject: 'app',
  root: ROOT,
  where: (path) => path.startsWith(SKILL_REFERENCES) || path.startsWith(SKILL_SKILLS),
  what: 'vendored skill document',
})

/** One application document, or a refusal naming it: the harness needs all of them. */
function appDocument(path) {
  const text = app.read(path)
  if (text === null) throw new Error(`no ${path} under ${app.base}: the harness has no subject`)
  return text
}

const ROLE = appDocument('src/lib/agent/role.md').trimEnd()
const adapterDoc = appDocument(`${SKILL_REFERENCES}canvas-adapter.md`)

/**
 * The adapter's two surface rows are placeholders in the file and are
 * rendered from the roster a session is offered — here, the specs a case
 * offers, mapped back to their definitions.
 */
function adapterFor(offered) {
  const names = new Set(offered.map((spec) => spec.name))
  return renderCanvasAdapter(
    adapterDoc,
    TOOL_DEFINITIONS.filter((tool) => names.has(tool.name)),
  )
}

function buildSystem(skillId, contextNote, offered) {
  const parts = [
    ROLE,
    '\n\n--- canvas-adapter reference (FULL text — get_reference serves the other, deeper references) ---\n',
    adapterFor(offered),
  ]
  if (skillId) {
    const content = appDocument(`${SKILL_SKILLS}${skillId}.md`)
    parts.push(
      `\n\n--- active skill: /ub:${skillId} (invoked by the user; the same SKILL.md IDE agents follow) ---\n${content}\n\nYou are the canvas agent, not an IDE agent: skip the skill's file/script/CLI mechanics and act through your tools, translated by the canvas-adapter above. The skill's judgment — what makes a good blueprint/slice, the order of questions, the quality bars — applies in full.`,
    )
  }
  if (contextNote) parts.push(`\n\n--- current context ---\n${contextNote}`)
  return parts.join('')
}

// ---------------------------------------------------------------------------
// Fixture-backed reads: the app's own sample readers, imported from the
// bundled surface (src/lib/agent/tools/sampleRead.ts) — not a copy of them.
// ---------------------------------------------------------------------------
const {
  sampleGetBlueprint,
  sampleGetCell,
  sampleGetSlice,
  sampleListOwnerTags,
  sampleListBlueprint,
  sampleListSlices,
  sampleListLanes,
  sampleListCellDependencies,
  formatBlueprintList,
  listBlueprintRequest,
  REFERENCE_NAMES,
  // The app's own text for every other read the harness serves from the
  // database, so a REST row reads back in the app's words. See
  // app-surface.entry.ts: the harness composes no tool result sentence of its
  // own, and `toolParity.test.mjs` fails if one comes back.
  formatBlueprints,
  formatBusinessModel,
  formatCellDependencies,
  formatEvidenceDetail,
  formatEvidenceList,
  formatFindingsList,
  formatLaneVocabulary,
  formatOwnerTags,
  formatSliceDetail,
  formatSliceList,
  formatStakeholderList,
  normalizeBlueprint,
  NAME_AN_EVIDENCE_ID,
  NO_PATHS_IN_SCENARIO,
  noCellWithId,
  NO_UI_STATE,
  CELL_CAMERA_SETTLED,
  cameraSettled,
} = surface

// ---------------------------------------------------------------------------
// Real (PostgREST) read implementations.
// ---------------------------------------------------------------------------

/**
 * Every row a PostgREST path matches, a page at a time. The server answers at
 * most its own max_rows per request, and `list_blueprint`'s total has to be
 * the true one, so this asks until a page comes back empty.
 */
async function restAll(pathAndQuery) {
  const rows = []
  for (;;) {
    const page = await rest(`${pathAndQuery}&order=id&limit=1000&offset=${rows.length}`)
    if (!page?.length) return rows
    rows.push(...page)
  }
}

const word = (value) => (typeof value === 'string' && value.trim() ? value : undefined)

/** A `list_blueprint` call's arguments, in the words the app's check takes. */
function listArgs(args) {
  return {
    granularity: Array.isArray(args.granularity)
      ? args.granularity.filter((level) => typeof level === 'string')
      : [],
    phase: word(args.phase),
    scenario: word(args.scenario),
    pathKind: word(args.kind),
    laneRole: word(args.lane_role),
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  }
}

/**
 * Mirrors read.ts: the rows come over REST, and the check, the walk and the
 * text are the app's own, from the bundled surface — so the answer is the
 * app's answer. `service` is not applied: the harness reads one deployment
 * as anon, the way its other scoped reads do.
 */
async function realListBlueprint(options) {
  const request = listBlueprintRequest(options)
  const needs = (...rungs) => rungs.some((rung) => request.levels.has(rung))
  const [phases, scenarios, paths, steps, lanes, cells] = await Promise.all([
    restAll('phases?select=id,name,summary,position,service_id'),
    needs('scenario', 'path', 'step', 'lane', 'cell')
      ? restAll('scenarios?select=id,phase_id,name,summary,position')
      : [],
    needs('path', 'step', 'lane', 'cell')
      ? restAll('paths?select=id,scenario_id,name,summary,kind')
      : [],
    needs('step', 'cell')
      ? restAll('steps?select=id,scenario_id,name,path_steps(path_id,position)')
      : [],
    needs('lane', 'cell')
      ? restAll('lanes?select=id,path_id,name,lane_role,position')
      : [],
    needs('cell')
      ? restAll('cells?select=id,lane_id,step_id,content,summary,position')
      : [],
  ])
  return formatBlueprintList(
    {
      phases: phases.map((r) => ({ ...r, serviceId: r.service_id })),
      scenarios: scenarios.map((r) => ({ ...r, phaseId: r.phase_id })),
      paths: paths.map((r) => ({ ...r, scenarioId: r.scenario_id })),
      steps: steps.map((r) => ({
        ...r,
        scenarioId: r.scenario_id,
        placements: (r.path_steps ?? []).map((p) => ({ pathId: p.path_id, position: p.position })),
      })),
      lanes: lanes.map((r) => ({ ...r, pathId: r.path_id, role: r.lane_role })),
      cells: cells.map((r) => ({ ...r, laneId: r.lane_id, stepId: r.step_id })),
    },
    request,
  )
}

/**
 * The grid, read over REST and rendered by the app's own pair: the rows go
 * through `normalizeBlueprint` — the same normalizer the board read uses —
 * and the text is `formatBlueprints`. The harness walked the lanes and wrote
 * the step, lane and cell lines itself before, which was four templates the
 * app could reword without this file noticing.
 */
async function realGetBlueprint(scenarioId) {
  const paths = await rest(
    `paths?select=id,name,kind,lanes(id,name,lane_role,position),path_steps(position,steps(id,name))&scenario_id=eq.${encodeURIComponent(scenarioId)}`,
  )
  if (!paths?.length) return NO_PATHS_IN_SCENARIO
  const blueprints = []
  for (const path of paths) {
    // The cells ride under the path, which is where the app's select puts
    // them; the harness asks for them separately because its select is the
    // narrow one its cases judge.
    const cells = await rest(`cells?select=id,content,lane_id,step_id&path_id=eq.${path.id}`)
    blueprints.push(normalizeBlueprint({ ...path, cells: cells ?? [] }))
  }
  return formatBlueprints(blueprints)
}

async function realGetCell(cellId) {
  const data = await rest(`cells?select=${CELL_COLUMNS.join(',')}&id=eq.${encodeURIComponent(cellId)}`)
  if (!data?.[0]) throw new Error(noCellWithId(cellId))
  return JSON.stringify(data[0], null, 1)
}

async function realListOwnerTags() {
  const rows = await rest(`cells?select=${OWNER_TAG_COLUMNS.join(',')}`)
  return formatOwnerTags(rows ?? [])
}

async function realListSlices() {
  const rows = await rest('slices?select=id,title,kind')
  return formatSliceList(rows ?? [])
}

async function realGetSlice(sliceId) {
  const rows = await rest(
    `slices?select=id,title,summary,kind,actor,authorship,slides(id,position,title,caption,cell_ids)&id=eq.${encodeURIComponent(String(sliceId))}`,
  )
  if (!rows?.[0]) throw new Error('No slice with that id.')
  return formatSliceDetail(rows[0], rows[0].slides ?? [])
}

// The bundled fixture is a board, not a deployment: it carries no cast, no
// provenance and no business model, so a keyless run says so rather than
// inventing rows — in the app's own words for "none", which is what each of
// these formatters answers an empty list with.
const NO_CAST = () => formatStakeholderList([])
const NO_EVIDENCE = () => formatEvidenceList([])

async function realListLanes() {
  const rows = await rest('lanes?select=name,lane_role&order=position')
  return formatLaneVocabulary(rows ?? [])
}

async function realListCellDependencies(cellId) {
  const scope = cellId
    ? `&or=(source_cell_id.eq.${encodeURIComponent(String(cellId))},target_cell_id.eq.${encodeURIComponent(String(cellId))})`
    : ''
  const rows = await rest(
    `cell_dependencies?select=id,source_cell_id,target_cell_id,kind,name&limit=200${scope}`,
  )
  return formatCellDependencies(rows ?? [], cellId ? String(cellId) : undefined)
}

async function realListStakeholders() {
  const rows = await rest('stakeholders?select=id,name,kind,summary,aliases&order=kind,name')
  return formatStakeholderList(rows ?? [])
}

const EVIDENCE_COLUMNS = 'id,cell_id,kind,title,note,observed_at'

async function realListEvidence(cellId) {
  const scope = cellId ? `&cell_id=eq.${encodeURIComponent(String(cellId))}` : ''
  const rows = await rest(
    `evidence?select=${EVIDENCE_COLUMNS}&order=created_at.desc&limit=100${scope}`,
  )
  return formatEvidenceList(rows ?? [], cellId ? String(cellId) : undefined)
}

async function realGetEvidence(ids) {
  const wanted = Array.isArray(ids) ? ids : []
  if (!wanted.length) return NAME_AN_EVIDENCE_ID
  const rows = await rest(
    `evidence?select=${EVIDENCE_COLUMNS}&id=in.(${wanted.map(encodeURIComponent).join(',')})`,
  )
  return formatEvidenceDetail(rows ?? [], wanted)
}

async function realGetBusinessModel() {
  const rows = await rest(
    'business_models?select=pricing,funding,partners,revenue_model,delivery_cost&limit=1',
  )
  return formatBusinessModel(rows?.[0] ?? null)
}

/**
 * The findings, in the app's words, under a total the app cannot state.
 *
 * The rows and every empty state are `formatFindingsList` — the same function
 * `list_findings` answers with. The header above them is the harness's own
 * and stays: this read asks PostgREST for `count=exact`, so it knows the true
 * total behind the cap, which the app's own read does not and therefore has
 * no sentence for.
 */
async function realListFindings(statusFilter) {
  const query = `audit_findings?select=id,source,check_key,severity,impact,effort,summary,status,cell_ids,created_at&order=created_at.desc&limit=100${statusFilter === 'all' ? '' : `&status=eq.${encodeURIComponent(statusFilter)}`}`
  const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
      prefer: 'count=exact',
    },
  })
  if (!response.ok) throw new Error(`postgrest ${response.status}`)
  const rows = await response.json()
  const range = response.headers.get('content-range')
  const total = range?.includes('/') ? Number(range.split('/')[1]) : undefined
  const listed = formatFindingsList(rows ?? [], { filter: statusFilter })
  if (!rows?.length) return listed
  const label = statusFilter === 'all' ? 'findings' : `${statusFilter} findings`
  const header = Number.isFinite(total)
    ? `${total} ${label} total; listing ${Math.min(rows.length, total)}. Answer count questions from the TOTAL, not by counting the rows below.`
    : `Listing ${rows.length} ${label} (total unavailable — do not state a total).`
  return [header, listed].join('\n')
}

// ---------------------------------------------------------------------------
// Tool dispatch — real/fixture reads, dry-run writes, per-case mocks.
// The gates run in the app loop's order: mobile roster, session tier, then
// batch etiquette.
// ---------------------------------------------------------------------------
let dryCounter = 0
/**
 * The one sentence in this file that is the harness's own, deliberately: it
 * is about the REHEARSAL, not about the write, so no tool could say it. It
 * matters — reads here are real and will not reflect a dry-run write, and
 * without the note the model re-reads, concludes the write failed, and
 * retries (observed live: a doubled create_lane).
 *
 * Worded so that it and the TOOL's own sentence can both be true at once.
 * `create_lane` ends "Re-read the blueprint for the new lane ids", and a note
 * that said "do NOT re-read" flatly contradicted it; the model then obeyed
 * one of them at random. This one refuses only the re-read that CHECKS —
 * verifying this write, or retrying it — and says why the ids above cannot be
 * looked up: they are placeholders, and no read will find them.
 */
const DRY_RUN_NOTE =
  'NOTE: rehearsal — this write was not applied and any ids above are placeholders; a re-read will not show it. Continue as if it landed; do not re-read to verify it and do not retry it.'
async function dispatch(caseDef, name, args, trace, turn = 0) {
  const mock = caseDef.mocks?.[name]
  const record = { name, args, isError: false, turn }
  trace.push(record)
  // WHETHER THIS CALL MAY RUN IS THE APP'S ANSWER, not three gates spelled
  // here in an order of their own. `admitToolCall` applies the allow-list,
  // the search offer, both availability gates, the write gate and the batch
  // budget, in the order a session applies them — so a call tripping two of
  // them reads back the sentence a reader of the app would have read. The
  // harness supplies only the live facts, which is the same split the loop
  // works to: the batch count for this turn (only calls that LANDED eat
  // budget — a failed write changed nothing), and a write-ness its
  // environment can answer (see `isWriteCall`). The two facts this
  // environment does not have — a Stop, and a repeat-read record — are
  // stated false, as the header says they are.
  const writesThisSend = trace.filter(
    (t) =>
      t !== record &&
      t.turn === turn &&
      t.name !== '__text' &&
      isWriteCall(t.name) &&
      !t.isError,
  ).length
  const admission = admitToolCall({
    mode: harnessMode(caseDef),
    name,
    facts: {
      aborted: false,
      isWrite: isWriteCall(name),
      writesThisSend,
      repeatRead: false,
    },
  })
  if (!admission.admitted) {
    record.isError = true
    // The GROUND chooses the trace flag, because the checks in cases.mjs read
    // which gate fired and not what it said; the SENTENCE stays the shared
    // binding, so `toolParity.test.mjs` can still see the harness answering
    // its own gate with the app's export rather than a copy of the words.
    // The equality below is what keeps that mapping from lying.
    switch (admission.ground) {
      case 'mobile-reading':
        record.offRoster = true
        record.result = MOBILE_SHELL_REFUSAL
        break
      case 'view-only':
        record.refusedWrite = true
        record.result = VIEW_ONLY_REFUSAL
        break
      case 'batch-limit':
        record.limited = true
        record.result = BATCH_LIMIT_REFUSAL
        break
      case 'no-search':
        // Nothing here serves ranked search, the mode says so, and the
        // derived roster withholds the tool — so only a model reaching for a
        // remembered name lands here, and the app's sentence is true of this
        // session word for word, steer included, which is the part a case
        // grades the recovery on.
        record.result = NO_SEARCH_REFUSAL
        break
      default:
        // The grounds this environment declares itself out of: a stop it has
        // no way to press, a repeat-read guard it deliberately does not
        // mirror, the no-database trial it widens away from, and an
        // allow-list it never configures. THROW rather than answer: each of
        // those sentences is app-only precisely because no gate here can
        // truthfully say it, and answering with one would publish it to a
        // graded transcript through the back door.
        throw new Error(
          `the harness reached the ${admission.ground} gate, which its session declares itself out of`,
        )
    }
    if (record.result !== admission.refusal)
      throw new Error(
        `the harness answered the ${admission.ground} gate with a sentence the app does not say`,
      )
    return record.result
  }
  try {
    if (mock) {
      const result = typeof mock === 'function' ? await mock(args, trace) : mock
      if (result instanceof Error) throw result
      record.result = result
      return result
    }
    if (WRITE_TOOL_NAMES.has(name)) {
      dryCounter += 1
      const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name)
      // Every id this call mints, distinct: `dry-4` for the first, then
      // `dry-4.2`, `dry-4.3`. One counter per CALL keeps the transcript
      // readable (the fourth write says `dry-4`), and the suffix keeps a
      // write that mints two rows from reporting the same id for both.
      let minted = 0
      const placeholder = () => {
        minted += 1
        return minted === 1 ? `dry-${dryCounter}` : `dry-${dryCounter}.${minted}`
      }
      // The tool's OWN sentence: its `run`, validated at the same seam the
      // live loop validates at, against a client that records rather than
      // writes and answers with placeholders. A call the model malformed, or
      // a mutation the rehearsal cannot satisfy, throws — and lands on this
      // dispatch's own error path, recorded as the tool error the live loop
      // would report rather than as a write that landed.
      //
      // WHAT A REHEARSAL CANNOT REFUSE, so a transcript reader does not read
      // "it worked" as "it would have worked": every gate that needs the real
      // rows is open here. A revision conflict, a missing row, a dedupe
      // against an already-dismissed finding, an upsert landing on a row that
      // already exists — all four rehearse as success, because the recording
      // client answers the before-read with the row the chain addressed and
      // never with somebody else's version of it. What a rehearsal DOES
      // catch is what the tool decides for itself: argument validation, the
      // refusals a `run` raises on its arguments, and a mutation whose shape
      // the rehearsal cannot answer at all.
      const rehearsal = rehearsalContext({ definition, args, placeholder })
      const sentence = await runTool(definition, args, rehearsal.ctx)
      // Marked as a dry-run write only once the rehearsal RESOLVED: a
      // rehearsal that threw is an error, not an executed write, and the
      // trace checks count `t.dryRun` as writes that happened.
      record.dryRun = true
      record.result = `${sentence} ${DRY_RUN_NOTE}`
      return record.result
    }
    switch (name) {
      case 'get_reference':
        record.result = appDocument(
          `${SKILL_REFERENCES}${String(args.name).replace(/[^a-z-]/g, '')}.md`,
        )
        return record.result
      case 'list_blueprint':
        record.result = HAS_DB
          ? await realListBlueprint(listArgs(args))
          : sampleListBlueprint(listArgs(args))
        return record.result
      case 'get_blueprint':
        record.result = HAS_DB
          ? await realGetBlueprint(args.scenario_id)
          : sampleGetBlueprint(args.scenario_id)
        return record.result
      case 'get_cell':
        record.result = HAS_DB ? await realGetCell(args.cell_id) : sampleGetCell(args.cell_id)
        return record.result
      case 'list_owner_tags':
        record.result = HAS_DB ? await realListOwnerTags() : sampleListOwnerTags()
        return record.result
      case 'list_slices':
        record.result = HAS_DB ? await realListSlices() : sampleListSlices()
        return record.result
      case 'get_slice':
        record.result = HAS_DB
          ? await realGetSlice(args.slice_id)
          : sampleGetSlice(args.slice_id)
        return record.result
      case 'list_findings': {
        const filter = typeof args.status === 'string' ? args.status : 'open'
        record.result = HAS_DB
          ? await realListFindings(filter)
          : formatFindingsList([], { filter })
        return record.result
      }
      case 'list_references':
        // The app's own REFERENCE_NAMES, bundled with the tool declarations —
        // one list, not two.
        record.result = [...REFERENCE_NAMES].map((name) => `- ${name}`).join('\n')
        return record.result
      case 'list_lanes':
        record.result = HAS_DB ? await realListLanes() : sampleListLanes()
        return record.result
      case 'list_cell_dependencies':
        record.result = HAS_DB
          ? await realListCellDependencies(args.cell_id)
          : sampleListCellDependencies(args.cell_id)
        return record.result
      case 'list_stakeholders':
        record.result = HAS_DB ? await realListStakeholders() : NO_CAST()
        return record.result
      case 'list_evidence':
        record.result = HAS_DB
          ? await realListEvidence(args.cell_id)
          : NO_EVIDENCE()
        return record.result
      case 'get_evidence':
        record.result = HAS_DB
          ? await realGetEvidence(args.evidence_ids)
          : NO_EVIDENCE()
        return record.result
      case 'get_business_model':
        record.result = HAS_DB
          ? await realGetBusinessModel()
          : formatBusinessModel(null)
        return record.result
      // The session store is browser state (localStorage plus a merged DB
      // list), and the harness has no browser. Saying so is the honest
      // rehearsal: the agent learns the tool exists and that this environment
      // cannot answer it, rather than seeing a crash.
      case 'list_sessions':
        record.result =
          'Past sessions are not available in this rehearsal environment (no browser session store).'
        return record.result
      case 'get_session':
        record.result =
          'Session transcripts are not available in this rehearsal environment (no browser session store).'
        return record.result
      // The harness drives no canvas, so the three interface calls answer
      // with what the UI bridge says when a navigation LANDS — the app's
      // sentence, not a copy of it — and `get_ui_state` with what the tool
      // says when no shell is reporting.
      case 'get_ui_state':
        record.result = NO_UI_STATE
        return record.result
      case 'open_phase':
        record.result = cameraSettled('phase')
        return record.result
      case 'open_scenario':
        record.result = cameraSettled('scenario')
        return record.result
      case 'focus_cell':
        record.result = CELL_CAMERA_SETTLED
        return record.result
      // A name nothing above maps: a tool this environment cannot serve, or
      // one the model invented. The name does not exist in this session
      // either, so the app's own sentence is true here and this says it —
      // the harness said "not on the allow-list" before, a second wording of
      // the app's commonest refusal and the one a run is likeliest to be
      // graded on recovering from. (Note that the app's allow-list refusal is
      // a DIFFERENT sentence, for a name the tool layer knows; this gate has
      // no counterpart to it, so it stays app-only.)
      default:
        record.result = noSuchToolRefusal(name)
        return record.result
    }
  } catch (error) {
    record.isError = true
    record.result = `Error: ${error.message}`
    return record.result
  }
}

// ---------------------------------------------------------------------------
// Provider glue — neutral conversation shape, three dialects (mirrors
// src/lib/agent/providers/{google,anthropic,openai}.ts).
// Neutral messages:
//   { role: 'user', text }
//   { role: 'assistant', parts: [{ text, signature? } | { call: { id, name, args, signature? } }] }
//   { role: 'tool', results: [{ id, name, result }] }
// ---------------------------------------------------------------------------
function toGoogleSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGoogleSchema)
  if (schema && typeof schema === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(schema)) {
      if (key === '$schema' || key === 'additionalProperties' || key === 'default') continue
      out[key] = toGoogleSchema(value)
    }
    return out
  }
  return schema
}

async function googleChat({ system, messages, tools, model, noTools }) {
  const contents = messages.map((message) => {
    if (message.role === 'user') return { role: 'user', parts: [{ text: message.text }] }
    if (message.role === 'assistant')
      return {
        role: 'model',
        parts: message.parts.map((part) =>
          part.call
            ? {
                functionCall: { name: part.call.name, args: part.call.args },
                ...(part.call.signature ? { thoughtSignature: part.call.signature } : {}),
              }
            : {
                text: part.text,
                ...(part.signature ? { thoughtSignature: part.signature } : {}),
              },
        ),
      }
    return {
      role: 'user',
      parts: message.results.map((result) => ({
        functionResponse: { name: result.name, response: { result: result.result } },
      })),
    }
  })
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        ...(tools.length > 0
          ? {
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: toGoogleSchema(t.parameters),
                  })),
                },
              ],
              ...(noTools ? { toolConfig: { functionCallingConfig: { mode: 'NONE' } } } : {}),
            }
          : {}),
      }),
    },
  )
  if (!response.ok)
    throw new Error(`google ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const body = await response.json()
  const raw = body.candidates?.[0]?.content?.parts ?? []
  let call = 0
  const parts = []
  for (const part of raw) {
    if (part.thought) continue
    if (part.text)
      parts.push({
        text: part.text,
        ...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
      })
    else if (part.functionCall)
      parts.push({
        call: {
          id: `call_${Date.now()}_${call++}`,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
          ...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
        },
      })
  }
  return parts
}

async function anthropicChat({ system, messages, tools, model, noTools }) {
  const converted = messages.map((message) => {
    if (message.role === 'user')
      return { role: 'user', content: [{ type: 'text', text: message.text }] }
    if (message.role === 'assistant')
      return {
        role: 'assistant',
        content: message.parts.map((part) =>
          part.call
            ? { type: 'tool_use', id: part.call.id, name: part.call.name, input: part.call.args }
            : { type: 'text', text: part.text },
        ),
      }
    return {
      role: 'user',
      content: message.results.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.id,
        content: result.result,
      })),
    }
  })
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: converted,
      ...(tools.length > 0 && !noTools
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    }),
  })
  if (!response.ok)
    throw new Error(`anthropic ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const body = await response.json()
  const parts = []
  for (const block of body.content ?? []) {
    if (block.type === 'text') parts.push({ text: block.text })
    else if (block.type === 'tool_use')
      parts.push({ call: { id: block.id, name: block.name, args: block.input } })
  }
  return parts
}

async function openaiChat({ system, messages, tools, model, noTools }) {
  const converted = [{ role: 'system', content: system }]
  for (const message of messages) {
    if (message.role === 'user') converted.push({ role: 'user', content: message.text })
    else if (message.role === 'assistant') {
      const text = message.parts.filter((p) => p.text).map((p) => p.text).join('\n')
      const calls = message.parts
        .filter((p) => p.call)
        .map((p) => ({
          id: p.call.id,
          type: 'function',
          function: { name: p.call.name, arguments: JSON.stringify(p.call.args) },
        }))
      converted.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length > 0 ? { tool_calls: calls } : {}),
      })
    } else {
      for (const result of message.results)
        converted.push({ role: 'tool', tool_call_id: result.id, content: result.result })
    }
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: converted,
      ...(tools.length > 0 && !noTools
        ? {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    }),
  })
  if (!response.ok)
    throw new Error(`openai ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const body = await response.json()
  const choice = body.choices?.[0]
  const parts = []
  if (choice?.message?.content) parts.push({ text: choice.message.content })
  for (const call of choice?.message?.tool_calls ?? []) {
    let parsed = {}
    try {
      parsed = JSON.parse(call.function.arguments)
    } catch {
      // Malformed args reach the tool layer as empty args.
    }
    parts.push({ call: { id: call.id, name: call.function.name, args: parsed } })
  }
  return parts
}

const CHAT = { google: googleChat, anthropic: anthropicChat, openai: openaiChat }
const chat = PROVIDER ? CHAT[PROVIDER.id] : null

// The app loop's round cap (loop.ts MAX_ROUNDS) — keep them equal or the
// harness grades a budget the app does not have.
const MAX_ROUNDS = 12

/**
 * The mode this environment is in, as the app's roster asks for it.
 *
 * Three of the four are read off the case, so a mobile case is offered the
 * mobile roster and a view-only case no write — the same narrowing a session
 * gets, from the same function, rather than from a filter spelled here that
 * had to be kept in step with `roster.ts` by hand.
 *
 * `searchOffered: false` is a FACT, not a choice: there is no deployment
 * index here and no embedding key, which is exactly the state the app
 * withholds `search_blueprint` in.
 *
 * `sampleTrial: false` IS a choice, and the one place this harness declares
 * itself something its environment is not. With no database configured the
 * app reads the bundled sample and has no write tool at all; this harness
 * rehearses every write as a dry run against a client that records instead of
 * writing, so a roster narrowed by the missing database would offer nothing
 * for the write half of the suite to call. The cost is stated rather than
 * hidden: no case here can reach the app's no-database refusal, which is why
 * `refusals.ts` keeps that sentence app-only. The day the harness stops
 * rehearsing, this becomes `!HAS_DB` and that sentence is shareable.
 */
function harnessMode(caseDef) {
  return {
    sampleTrial: false,
    mobileReading: Boolean(caseDef.mobile),
    allowWrites: caseDef.allowWrites !== false,
    searchOffered: false,
  }
}

async function runCaseLLM(caseDef) {
  const trace = []
  const replies = [] // final text per user turn
  const messages = []
  // The offer is the APP'S roster, handed the mode this case runs in, then
  // read off the app's own spec table so the order is the order a session
  // sees. The two gates this used to spell by hand are gone with it.
  const roster = new Set(sessionRoster(harnessMode(caseDef)).map((tool) => tool.name))
  const offered = TOOL_SPECS.filter((spec) => roster.has(spec.name))
  // The tier / mobile injections are the app's, verbatim (loop.ts). The
  // mobile paragraph subsumes the tier one, so only one may speak.
  const system =
    buildSystem(caseDef.skill, caseDef.contextNote, offered) +
    (caseDef.allowWrites !== false || caseDef.mobile
      ? ''
      : '\n\n--- session tier ---\nThis session is VIEW-ONLY (not a service account): you have no write tools. Navigate, read, and answer with citations; when the user wants an edit, describe the exact change for a service account to make — never imply you made it.') +
    (caseDef.mobile
      ? '\n\n--- mobile shell ---\nThe user is on the MOBILE app, which is view-only for everyone — your tools are navigation and reading only (no writes). When the user wants an edit, explain it is made on desktop — never imply you made it.'
      : '')

  for (const [turnIndex, turn] of caseDef.turns.entries()) {
    messages.push({ role: 'user', text: turn })
    const turnText = []
    let capped = true
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const parts = await chat({ system, messages, tools: offered, model: MODEL })
      messages.push({ role: 'assistant', parts })
      for (const part of parts) {
        if (part.text) {
          turnText.push(part.text)
          // Text lands in the trace too (as __text events) so narration
          // ORDER is deterministically checkable.
          trace.push({
            name: '__text',
            args: {},
            turn: turnIndex,
            result: part.text.slice(0, 200),
            isError: false,
          })
        }
      }
      const calls = parts.filter((p) => p.call).map((p) => p.call)
      if (calls.length === 0) {
        capped = false
        break
      }
      const results = []
      for (const call of calls) {
        const result = await dispatch(caseDef, call.name, call.args ?? {}, trace, turnIndex)
        results.push({ id: call.id, name: call.name, result })
      }
      messages.push({ role: 'tool', results })
    }
    // Round cap hit while the model still wanted tools: force one final
    // text-only answer so a flailing run yields something gradeable.
    if (capped) {
      messages.push({
        role: 'user',
        text: '[system] Tool-call budget exhausted. Answer the user NOW with what you have — no more tool calls.',
      })
      const parts = await chat({
        system,
        messages,
        tools: offered,
        model: MODEL,
        noTools: true,
      })
      messages.push({ role: 'assistant', parts })
      for (const part of parts) if (part.text) turnText.push(part.text)
    }
    replies.push(turnText.join('\n'))
  }
  return { trace, replies }
}

// Smoke provider: scripted minimal behavior to validate the machinery
// (dispatch gates, fixture reads, dry-run writes, trace checks) keyless.
async function runCaseSmoke(caseDef) {
  const trace = []
  const replies = []
  for (const [index] of caseDef.turns.entries()) {
    if (index === 0 && caseDef.smokeCalls) {
      for (const [name, callArgs] of caseDef.smokeCalls) {
        await dispatch(caseDef, name, callArgs, trace)
      }
    }
    replies.push(caseDef.smokeReply ?? 'smoke reply — no model involved')
  }
  return { trace, replies }
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------
async function judgeText(prompt) {
  if (PROVIDER.id === 'google') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      },
    )
    if (!response.ok) throw new Error(`google judge ${response.status}`)
    const body = await response.json()
    return body.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[]'
  }
  const parts = await chat({
    system: 'You are a strict grading judge. Respond with ONLY the JSON asked for.',
    messages: [{ role: 'user', text: prompt }],
    tools: [],
    model: JUDGE_MODEL,
  })
  return parts.map((p) => p.text ?? '').join('')
}

async function judge(caseDef, trace, replies) {
  if (!caseDef.judgeLines?.length) return []
  if (SMOKE)
    return caseDef.judgeLines.map((line) => ({ id: line.id, pass: null, note: 'smoke: judge skipped' }))
  const traceSummary = trace
    .map(
      (t, i) =>
        `${i + 1}. [turn ${t.turn + 1}] ${t.name}(${JSON.stringify(t.args)})${t.dryRun ? ' [dry-run]' : ''}${t.isError ? ' [ERROR]' : ''}\n   → ${String(t.result ?? '').replace(/\s+/g, ' ').slice(0, 300)}`,
    )
    .join('\n')
  const prompt = `You are grading an AI agent's behavior against a rubric.

Case: ${caseDef.id} — ${caseDef.title}
User turns:\n${caseDef.turns.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Tool-call trace:\n${traceSummary || '(no tool calls)'}

Agent replies (one per user turn):\n${replies.map((r, i) => `--- reply ${i + 1} ---\n${r}`).join('\n')}

Rubric lines to grade (pass/fail each, be strict but fair):
${caseDef.judgeLines.map((line) => `- id "${line.id}": ${line.text}`).join('\n')}

Respond with ONLY a JSON array: [{"id": "...", "pass": true/false, "note": "one short sentence"}]`
  let text = '[]'
  try {
    text = await judgeText(prompt)
  } catch (error) {
    return caseDef.judgeLines.map((line) => ({ id: line.id, pass: false, note: `judge failed: ${error.message}` }))
  }
  try {
    const match = /\[[\s\S]*\]/.exec(text)
    return JSON.parse(match ? match[0] : text)
  } catch {
    return caseDef.judgeLines.map((line) => ({ id: line.id, pass: false, note: 'judge output unparseable' }))
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const transcriptsDir = resolve(ROOT, 'scripts/agent-harness/transcripts')
mkdirSync(transcriptsDir, { recursive: true })

let selected = CASES.filter((c) => !ONLY || c.id.toLowerCase() === ONLY.toLowerCase())
if (SMOKE) selected = selected.filter((c) => c.smokeCalls)
if (selected.length === 0) {
  console.error(`No case matches "${ONLY}". Known: ${CASES.map((c) => c.id).join(', ')}`)
  process.exit(2)
}

async function runAttempt(caseDef) {
  let trace = []
  let replies = []
  let runError = null
  try {
    ;({ trace, replies } = SMOKE ? await runCaseSmoke(caseDef) : await runCaseLLM(caseDef))
  } catch (error) {
    runError = error.message
  }
  const results = []
  if (runError) {
    results.push({ id: 'run', pass: false, note: `run failed: ${runError}` })
  } else {
    for (const check of caseDef.traceChecks ?? []) {
      try {
        const verdict = check.fn(trace, replies)
        results.push({ id: check.id, pass: verdict === true, note: verdict === true ? '' : String(verdict) })
      } catch (error) {
        results.push({ id: check.id, pass: false, note: `check threw: ${error.message}` })
      }
    }
    results.push(...(await judge(caseDef, trace, replies)))
  }
  return { trace, replies, results }
}

if (!SMOKE)
  console.log(`provider: ${PROVIDER.id} · model: ${MODEL}${HAS_DB ? ' · reads: PostgREST' : ' · reads: bundled fixture'}`)
else console.log(`smoke · reads: ${HAS_DB ? 'PostgREST' : 'bundled fixture'}`)

const rows = []
let failures = 0
for (const caseDef of selected) {
  process.stdout.write(`\n▶ ${caseDef.id} · ${caseDef.title}${REPEAT > 1 ? ` (×${REPEAT}, majority)` : ''}\n`)
  const attempts = []
  for (let attempt = 0; attempt < REPEAT; attempt += 1) {
    attempts.push(await runAttempt(caseDef))
  }
  // Majority per line id across attempts; a line missing from an attempt
  // (e.g. a crashed run) counts as a fail for that attempt.
  const lineIds = [...new Set(attempts.flatMap((a) => a.results.map((r) => r.id)))]
  const results = lineIds.map((id) => {
    const verdicts = attempts.map((a) => a.results.find((r) => r.id === id))
    const passes = verdicts.filter((v) => v?.pass === true).length
    const skips = verdicts.filter((v) => v?.pass === null).length
    if (skips === attempts.length) return { id, pass: null, note: verdicts[0]?.note ?? '' }
    const pass = passes > attempts.length / 2
    const note =
      REPEAT > 1
        ? `${passes}/${attempts.length}${pass ? '' : ` — ${verdicts.find((v) => v && v.pass === false)?.note ?? ''}`}`
        : (verdicts[0]?.note ?? '')
    return { id, pass, note }
  })
  const { trace, replies } = attempts[attempts.length - 1]
  for (const result of results) {
    const mark = result.pass === true ? 'PASS' : result.pass === null ? 'SKIP' : 'FAIL'
    if (result.pass === false) failures += 1
    process.stdout.write(`   ${mark}  ${result.id}${result.note ? ` — ${result.note}` : ''}\n`)
    rows.push({ case: caseDef.id, ...result })
  }
  writeFileSync(
    resolve(transcriptsDir, `${stamp}-${caseDef.id}.md`),
    [
      `# ${caseDef.id} · ${caseDef.title}`,
      `model: ${SMOKE ? 'smoke' : `${PROVIDER.id}/${MODEL}`}`,
      '',
      '## Turns',
      ...caseDef.turns.map((t, i) => `${i + 1}. ${t}`),
      '',
      '## Trace',
      ...trace.map((t, i) => `${i + 1}. ${t.name}(${JSON.stringify(t.args)})${t.dryRun ? ' [dry-run]' : ''}${t.isError ? ' [ERROR]' : ''}\n\n${String(t.result).slice(0, 600)}\n`),
      '## Replies',
      ...replies.map((r, i) => `--- reply ${i + 1} ---\n${r}\n`),
      '## Results',
      ...results.map((r) => `- ${r.pass === true ? 'PASS' : r.pass === null ? 'SKIP' : 'FAIL'} ${r.id} ${r.note ?? ''}`),
    ].join('\n'),
  )
}

const total = rows.filter((r) => r.pass !== null).length
console.log(`\n${'='.repeat(60)}`)
console.log(`${total - failures}/${total} rubric lines passed · transcripts in scripts/agent-harness/transcripts/${stamp}-*.md`)
process.exit(failures > 0 ? 1 : 0)
