#!/usr/bin/env node
/**
 * Sample-content generator — the META-BLUEPRINT: the service blueprint OF
 * this template itself. The sample service maps the journey a team actually
 * runs with the template (Discover → Setup → Operate → Maintain, with Maintain
 * looping back to Operate), so the product demonstrates itself and every cell
 * doubles as true documentation of how the template behaves.
 *
 * Phases carry the arc of the work; SCENARIO names carry the skill vocabulary
 * (map, audit, ideate/what-if, slice), so the phase row never repeats what the
 * scenarios already say.
 *
 * Emits BOTH template sample artifacts from one source of truth:
 *   - src/data/sampleBlueprint.ts  — the offline / no-DB fallback module
 *   - supabase/seed.sql         — the equivalent database seed (service →
 *     phases → scenarios → paths/steps/lanes/cells/dependencies → demo slices)
 *
 * What the content deliberately exercises (the template's rendering smoke):
 *   - four phases, six scenarios, incl. the phase loop
 *     (Maintain.loops_to_phase_id → Operate) drawn on the overview canvas
 *   - ONE lane roster, reused by every scenario, ordered so the interaction
 *     and visibility lines each draw exactly once on every board:
 *     customer_actions → frontstage_touchpoints → frontstage_actions →
 *     backstage_touchpoints → backstage_actions → backstage_touchpoints
 *     (References & guardrails), under a null-role Stakeholders swimlane. The
 *     adjacency rules are asserted below, not hoped for.
 *   - TWO scenarios with two genuinely divergent paths each, shaped so the
 *     compare views show every verdict: fully shared columns (quiet),
 *     divergent columns, path-only cells, path-only STEPS (each Map path
 *     omits the other's column), and shared slots inside divergent columns
 *   - pill lanes (newline multi-pill AND slot-sibling cells) and a storyboard row
 *     carrying four REAL figures
 *
 * The sample content is English-only, deliberately. Non-ASCII rendering is a
 * real guarantee and is tested — against `scripts/tests/sample-ir.json`, a
 * fixture whose whole job is to be bilingual — not demonstrated here, where a
 * CJK lane label in an otherwise English template reads to an adopter as leftover
 * contamination from someone else's deployment. See the note on the spine
 * lane below.
 *   - the cell spec: differing owner / perceived_owner pairs (the case the
 *     docs call the interesting one) and FUNCTION / FORM / VALUE blocks, in
 *     BOTH artifacts, so a keyless clone renders them like a seeded database
 *   - dependency kinds: forward cross-lane, same-column, opt-in spine chains,
 *     cross-lane UPWARD arrows, backward in-lane loops (rework + re-dispatch),
 *     and panel-only `enables` dependencies with labels and notes
 *   - resources pointing at REAL repo paths — every one is existsSync-checked
 *   - three demo slices (journey + step + lane) over the new content
 *
 * Deliberate omissions, so they read as decisions and not oversights:
 *   - `cell` and `custom` slices: three slices is the readability ceiling for
 *     a first-open sidebar, and a single-cell demo teaches nothing the panel
 *     does not.
 *   - `evidence` rows and the lane spec columns (`kpis` / `tools` /
 *     `owner_team`): both exist in the database but not in the offline
 *     `BlueprintData` shape, so seeding them would make the two artifacts
 *     disagree — and this generator's whole contract is that they cannot.
 *   - slot siblings are app-side and seed-side only: `slot > 0` cells carry
 *     no `cell_key`, and the IR an adopter authors has no slot concept.
 *
 * Deterministic UUIDs: f0000000-0000-4000-8000-<S><P><KK><AAAA><BBBB>
 *   S = scenario ordinal (0 = service-scoped), P = path ordinal
 *   (0 = scenario-scoped), KK = kind (00 path, 01 lane, 02 step, 03 cell,
 *   04 dependency, 05 slice, 06 slice item, 07 phase),
 *   AAAA/BBBB = row/column-and-slot (or index) slots.
 *
 * Usage: node scripts/generate_sample_blueprint.mjs
 */

import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'sampleBlueprint.ts')
const SEED_OUT_PATH = join(REPO_ROOT, 'supabase', 'seed.sql')

const pad2 = (n) => String(n).padStart(2, '0')
const pad4 = (n) => String(n).padStart(4, '0')

const KIND = {
  path: 0,
  lane: 1,
  step: 2,
  cell: 3,
  dependency: 4,
  slice: 5,
  sliceItem: 6,
  phase: 7,
}

/** f0000000-0000-4000-8000-<S><P><KK><AAAA><BBBB> */
function fid(scenarioOrdinal, pathOrdinal, kind, a = 0, b = 0) {
  return `f0000000-0000-4000-8000-${scenarioOrdinal}${pathOrdinal}${pad2(kind)}${pad4(a)}${pad4(b)}`
}

/** The sample service (also used by the SQL seed emission below). */
const SERVICE_ID = 'f0000000-0000-4000-8000-000000000010'

/**
 * The deployment's touchpoint registry, minted from every placement name the
 * cells below use — the way an import does. One row per spelling; ids are
 * deterministic so the seed and the fallback name the same entry. No service
 * owns a registry row (ADR 0003), so the rows carry no service.
 */
const REGISTRY_IDS = new Map()
function registryId(name) {
  const key = name.trim().toLowerCase()
  if (!REGISTRY_IDS.has(key)) {
    REGISTRY_IDS.set(key, `f0000000-0000-4000-8000-0008${pad4(REGISTRY_IDS.size + 1)}0000`)
  }
  return REGISTRY_IDS.get(key)
}

const SERVICE = {
  id: SERVICE_ID,
  name: 'Keeping a blueprint true',
  // The route slug (21000130000000): a service's own identity, so the sample
  // keeps its URL if somebody renames it. Spelled out rather than derived —
  // the column exists precisely so the name is not the identity.
  slug: 'keeping-a-blueprint-true',
  summary:
    'The service blueprint of this template itself — how a team finds Uno Blueprint, gets a service onto the board, uses it, and brings it back in line when the service moves. Replace it with your own service; until then it doubles as documentation.',
  // One authored example per core kind, grounding each generic definition in
  // this deployment (the meta-blueprint). Shown under the kind's definition on
  // the board; a re-map of a real service replaces them with its own.
  entityExamples: {
    service:
      'Keeping a blueprint true — this template mapped as its own service, so the board doubles as the documentation.',
    phase:
      'Setup — the one-time work of getting a real service onto the board and signed off.',
    scenario:
      'Map your service — the run that turns a folder of documents, or someone else’s diagram, into a validated board.',
    path: 'From your documents — the ingest route that reads a corpus of service documents with per-claim provenance.',
    step: 'Import and verify — the column where a validated file in a repository becomes rows in the database.',
    lane: 'Blueprint owner — the row for the person driving the map, read across every step.',
  },
}

/** Fixed timestamp for generated derived rows — deterministic output. */
const FIXTURE_TIMESTAMP = '2026-08-18T00:00:00+00:00'

/** GitHub blob base for cell resources — every path is verified to exist. */
const REPO_URL = 'https://github.com/BilLogic/uno-blueprint/blob/main'
const repoLink = (name, path) => {
  // A rename must never leave a 404 on the board: the link is checked against
  // the working tree at emission, not trusted.
  if (!existsSync(join(REPO_ROOT, path))) {
    throw new Error(`repoLink("${name}"): ${path} does not exist in the repo`)
  }
  // A fallback board has no rows to name, so no id and nothing featured.
  return { id: null, name, kind: 'link', url: `${REPO_URL}/${path}`, placementId: null, featured: false }
}

/** Figures for the storyboard row — served from /cover/ by
 * scripts/sync-cover-assets.mjs. A frame is a database value, so it names a
 * served path; the cover page imports the same drawings instead. */
const figure = (name) => {
  if (!existsSync(join(REPO_ROOT, 'docs', 'assets', name))) {
    throw new Error(`figure("${name}"): docs/assets/${name} does not exist`)
  }
  return `/cover/${name}`
}

const PHASES = [
  {
    ordinal: 1,
    key: 'DISCOVER',
    name: 'Discover',
    summary:
      'The evaluation before any commitment: find the template, run it with no backend, and decide whether it fits the team.',
  },
  {
    ordinal: 2,
    key: 'SETUP',
    name: 'Setup',
    summary:
      'The one-time work of getting a real service onto the board and signed off — the onboarding use.',
  },
  {
    ordinal: 3,
    key: 'OPERATE',
    name: 'Operate',
    summary:
      'The blueprint in daily use: check it against reality, trace a change through it, and cut the view an audience asked for.',
  },
  {
    ordinal: 4,
    key: 'MAINTAIN',
    name: 'Maintain',
    summary:
      'Upkeep of the artifact itself — the service moved, so the map is brought back in line, and the team resumes using it. Loops back to Operate.',
    loopsToKey: 'OPERATE',
  },
]
const phaseId = (ordinal) => fid(0, 0, KIND.phase, ordinal, 0)
const phaseByKey = Object.fromEntries(PHASES.map((p) => [p.key, p]))

/**
 * ONE lane roster, reused by every scenario — the reader learns the cast once.
 *
 * The row order is load-bearing. Two rules from
 * `references/lane-roles.md` ("Line-anchoring semantics") decide where the
 * canonical divider lines land, and this order satisfies both on every board:
 *   * the frontstage TECH lane sits directly ABOVE the frontstage ACTIONS
 *     lane, so LINE OF VISIBILITY is drawn once, after the actions lane;
 *   * the backstage ACTIONS lane sits directly above the support lane, which
 *     is the only arrangement that draws LINE OF INTERNAL INTERACTION at all.
 * `assertLaneRoster` below turns both into errors rather than review notes.
 */
const LANES = [
  // A null role, which is what lane-roles.md asks for whenever the lane means
  // something the closed eight do not name: the meaning lives in the display
  // name, and the row renders as a generic swimlane anchoring no divider line.
  // This is the lane that is deliberately quiet on three boards.
  { row: 0, key: 'stakeholders', name: 'Stakeholders', role: null },
  /*
    The spine lane, present on every board.

    This carried a bilingual CJK display name ('服务负责人 · Blueprint
    owner') as the template's non-ASCII rendering smoke test. Removed: this
    is the sample blueprint an adopter meets on first run and on the cover
    page, and a Chinese lane label in an otherwise English template reads as
    leftover contamination from another deployment rather than as a
    deliberate i18n demonstration — which is exactly how it was reported.

    The non-ASCII guarantee is NOT lost with it. `scripts/tests/run_tests.sh`
    covers the same ground against its own dedicated fixture ('现场技术员'),
    where the CJK is the point of the test rather than incidental furniture
    in someone's first look at the product, and the `key_slug` migration
    carries its own non-ASCII handling and comments.
  */
  { row: 1, key: 'owner', name: 'Blueprint owner', role: 'customer_actions' },
  { row: 2, key: 'surface', name: 'App & skill surface', role: 'frontstage_touchpoints' },
  { row: 3, key: 'claude', name: 'Claude in the IDE', role: 'frontstage_actions' },
  { row: 4, key: 'scripts', name: 'Pipeline scripts', role: 'backstage_touchpoints' },
  { row: 5, key: 'agents', name: 'Subagent fleet', role: 'backstage_actions' },
  { row: 6, key: 'refs', name: 'References & guardrails', role: 'backstage_touchpoints' },
]

/**
 * The one documented exception: `Map your service` carries a storyboard row
 * on top, pushing the roster to rows 1–7. Four real figures, so the
 * `storyboard` role is demonstrated on the one board where journey imagery
 * earns a row —
 * rather than an empty band on half of them.
 */
const MAP_LANES = [
  { row: 0, key: 'figures', name: 'Journey figures', role: 'storyboard' },
  ...LANES.map((lane) => ({ ...lane, row: lane.row + 1 })),
]

/**
 * Scenario cell spec:
 *   { lane, col, content, slot?, frame?, summary?, resources?,
 *     touchpoints?, paths?,
 *     owner?, perceivedOwner?, fn?, form?, valueProps? }
 * `content` is a string (present on every path) or a per-path-key record
 * (present only on the named paths; differing values = a divergent slot).
 * `slot` > 0 emits a slot-sibling cell (tech lanes: one cell per touchpoint).
 * The last five are the cell spec (`cells.owner` … `cells.value_props`):
 * `owner`/`perceivedOwner` render as the owner pair in the panel, `fn`/`form`/
 * `valueProps` as its FUNCTION / FORM / VALUE block. They are emitted into both
 * artifacts, so a keyless clone shows the same spec a seeded database does.
 *
 * Scenario options: `spineChain: true` chains consecutive spine cells (only
 * worth it where the spine really is a sequence); `primary: true` marks the
 * scenario the compare demos and the journey slice hang off — exactly one.
 * Path option: `skipSteps: [n]` omits scenario columns from that path, which
 * is what "each path includes a subset of the steps" actually looks like.
 */
const SCENARIOS = [
  // -------------------------------------------------------------------
  // 1 · Find the template and see what it does — Discover (the smallest board)
  // -------------------------------------------------------------------
  {
    ordinal: 1,
    key: 'DISCOVER',
    phaseKey: 'DISCOVER',
    name: 'Find the template and see what it does',
    summary:
      'The evaluation before any commitment: the pitch, the bundled sample board, a run with nothing configured, and the decision that it fits.',
    order: 1,
    layout: 'stacked',
    spineLane: 'owner',
    spineChain: true,
    paths: [
      {
        ordinal: 1,
        key: 'FIRSTLOOK',
        name: 'A first look',
        kind: 'happy',
        summary:
          'Repository to running app to decision, with no account, no key, and no database anywhere.',
      },
    ],
    steps: [
      'Land on the repo',
      'Read what it claims',
      'Open the sample board',
      'Run it with nothing configured',
      'Decide it fits',
    ],
    lanes: LANES,
    cells: [
      { lane: 'stakeholders', col: 1, content: 'A colleague sends the link, usually with a service problem attached to it' },
      { lane: 'stakeholders', col: 5, content: 'Hears what it would take: a repo, a plugin, and one service worth mapping' },

      { lane: 'owner', col: 1, content: 'Lands on the repository, usually from a link or a search' },
      { lane: 'owner', col: 2, content: 'Reads the pitch: a blueprint stops being a poster and becomes a database' },
      { lane: 'owner', col: 3, content: 'Opens the bundled sample board and flips between its paths' },
      { lane: 'owner', col: 4, content: 'Runs npm install and npm run dev with no environment file at all' },
      { lane: 'owner', col: 5, content: 'Checks the stack, the license, and what a public deployment would expose, then decides to map a real service' },

      {
        lane: 'surface', col: 3,
        content: 'Cover page\nOverview canvas',
        summary:
          'The cover is the landing view; its call to action drops the reader on the whole-service overview, so the phase names are the first words of the board they read.',
      },
      {
        lane: 'surface', col: 4,
        content: 'Vite dev server\nNo-DB mode',
        // The owner pair, deliberately DIFFERENT — the case the docs call the
        // interesting one, and true here: with no VITE_SUPABASE_* set, nothing
        // is on the wire and the board is drawn from a module in the bundle.
        owner: 'The bundled sample module',
        perceivedOwner: 'A database somewhere',
        summary:
          'With no VITE_SUPABASE_* variables the app never opens a connection: what renders is src/data/sampleBlueprint.ts, shipped inside the bundle.',
        resources: [repoLink('src/data/blueprintFallbacks.ts', 'src/data/blueprintFallbacks.ts')],
      },

      {
        lane: 'claude', col: 5,
        content: 'Installs the repo as a Claude Code plugin: four skills, five agents, and the hooks load into the session',
        resources: [repoLink('.claude-plugin/plugin.json', '.claude-plugin/plugin.json')],
      },

      {
        lane: 'scripts', col: 4,
        content: 'generate_sample_blueprint.mjs',
        summary:
          'The board a first look renders and the database seed come from one run of this script, so the two can never disagree.',
        resources: [repoLink('scripts/generate_sample_blueprint.mjs', 'scripts/generate_sample_blueprint.mjs')],
      },
      {
        lane: 'scripts', col: 5,
        content: 'run_tests.sh\nagent-harness --smoke',
        summary:
          'Both go green on a keyless clone — a reviewer can check the template’s claims before configuring anything.',
        resources: [repoLink('scripts/tests/run_tests.sh', 'scripts/tests/run_tests.sh')],
      },

      // The Subagent fleet lane is silent on this board: nothing dispatches an
      // agent while somebody is still deciding.

      {
        lane: 'refs', col: 2,
        content: 'README.md',
        resources: [repoLink('README.md', 'README.md')],
      },
      {
        lane: 'refs', col: 3,
        content: 'guide/01 — the blueprint model',
        resources: [repoLink('guide/01 — The blueprint model', 'docs/guide/01-the-blueprint-model.md')],
      },
      {
        lane: 'refs', col: 5,
        content: 'AGENTS.md\nguide/03 — the plugin',
        summary:
          'What a reader opens next: the conventions an agent follows in this repo, and how the template ships as an installable plugin.',
        resources: [
          repoLink('AGENTS.md', 'AGENTS.md'),
          repoLink('guide/03 — The plugin', 'docs/guide/03-the-plugin.md'),
        ],
      },
    ],
    dependencies: [
      { from: ['stakeholders', 1], to: ['owner', 1], label: 'have a look at this' },
      // Cross-lane UPWARD: the support lane answers back into the spine.
      { from: ['refs', 2], to: ['owner', 2], label: 'the pitch' },
      { from: ['surface', 3], to: ['owner', 3] },
      { from: ['owner', 5], to: ['stakeholders', 5], label: 'what it would take' },
      {
        from: ['scripts', 4], to: ['owner', 4], kind: 'enables',
        note: 'A zero-config run has content only because the sample module is generated into the bundle.',
      },
      {
        from: ['scripts', 5], to: ['owner', 5], kind: 'enables',
        note: 'Weighing the cost means running the suites, not reading the claim that they pass.',
      },
    ],
  },

  // -------------------------------------------------------------------
  // 2 · Map your service — ub:map, two starting points, two paths
  //     (name kept verbatim: the harness, findingFingerprint.test.ts, the
  //     audit playbook and skills/audit/SKILL.md all pin this string)
  // -------------------------------------------------------------------
  {
    ordinal: 2,
    key: 'MAP_SERVICE',
    phaseKey: 'SETUP',
    name: 'Map your service',
    summary:
      'The ub:map pipeline from two starting points — a folder of documents, or somebody else’s diagram — converging on one validated, signed-off, imported blueprint.',
    order: 1,
    layout: 'stacked',
    spineLane: 'owner',
    primary: true,
    paths: [
      {
        ordinal: 1,
        key: 'DOCS',
        name: 'From your documents',
        kind: 'happy',
        summary:
          'The ingest route: a corpus of service documents, read by subagents, with per-claim provenance on every cell.',
        // No crosswalk to translate — that column belongs to the other path.
        skipSteps: [5],
      },
      {
        ordinal: 2,
        key: 'DIAGRAM',
        name: 'From someone else’s diagram',
        kind: 'variant',
        summary:
          'The translate route: a FigJam, Miro or spreadsheet export mapped onto lane roles through a crosswalk, with the diagram’s gaps left visible.',
        // No document corpus to read — that column belongs to the other path.
        skipSteps: [4],
      },
    ],
    steps: [
      'Invoke ub:map',
      'Route by what exists',
      'Scope and settle the spine',
      'Read the sources',
      'Translate the crosswalk',
      'Draft the structure',
      'Validate and review',
      'Sign off per scenario',
      'Import and verify',
      'Deploy',
    ],
    lanes: MAP_LANES,
    cells: [
      // The storyboard row draws NOTHING of its own:
      // src/lib/storyboardWalkthrough.ts collects the frames hanging off the
      // OTHER lanes' cells at the same column and lays them out in the
      // storyboard lane. So the four figures are
      // attached below, to the cells whose moment they actually illustrate.
      // Three of the four hang off the Blueprint owner cell at their column:
      // each illustrates the moment the owner is acting in — what a spine is,
      // the outline being nodded on, the ways a reader gets in. They are not
      // on References & guardrails, which is a touchpoint row; why a
      // touchpoint row is the wrong home for drawn artwork is in
      // src/lib/storyboardWalkthrough.ts, where the roster is decided.

      // The Stakeholders lane is deliberately quiet on this board and the two
      // that follow it: mapping is not a spectator sport. Silence is not a gap
      // — skills/audit/references/check-gap-sweep.md says so in as many words.

      { lane: 'owner', col: 1, content: 'Asks for a service to be mapped' },
      {
        lane: 'owner', col: 2,
        content: {
          DOCS: 'Points at the folder of service documents to read',
          DIAGRAM: 'Exports the existing diagram and hands over the file',
        },
      },
      {
        lane: 'owner', col: 3,
        content: 'Answers the scoping question and names whose journey runs along the spine',
        // Journey figure for this column.
        frame: figure('data-model-hierarchy.svg'),
      },
      { lane: 'owner', col: 4, content: { DOCS: 'Says which documents are in scope, and which are sensitive and excluded' } },
      { lane: 'owner', col: 5, content: { DIAGRAM: 'Confirms the crosswalk: which column of the old diagram means which lane role' } },
      {
        lane: 'owner', col: 6,
        content: 'Nods on the proposed step and lane outline before any cell is written',
        // Journey figure for this column.
        frame: figure('blueprint-anatomy.svg'),
      },
      { lane: 'owner', col: 7, content: 'Decides which review findings to accept' },
      { lane: 'owner', col: 8, content: 'Signs off each scenario against its content hash' },
      {
        lane: 'owner', col: 10,
        content: 'Shares the deployed URL with the team',
        // Journey figure for this column.
        frame: figure('four-ways-in.svg'),
      },

      // Slot siblings on a tech lane: one cell per touchpoint at the same
      // moment. They are app-side and seed-side only — slot > 0 carries no
      // cell_key, and the IR an adopter authors has no slot concept.
      { lane: 'surface', col: 7, slot: 0, content: 'ub:map preview' },
      {
        lane: 'surface', col: 7, slot: 1,
        content: 'Cell detail panel',
        touchpoints: [
          {
            name: 'Cell detail panel',
            summary:
              'What one cell holds: summary, owner pair, function / form / value, resources, and the dependency tab.',
          },
        ],
      },
      { lane: 'surface', col: 7, slot: 2, content: 'Compare view' },
      { lane: 'surface', col: 9, content: 'Imported scenario, read back live' },

      {
        lane: 'claude', col: 1,
        content: 'Loads the ub:map skill and its elicitation protocol',
        // Journey figure for this column — the storyboard row picks it up.
        frame: figure('ub-map.svg'),
      },
      {
        lane: 'claude', col: 2,
        content: {
          DOCS: 'Routes to ingest — prose and service docs exist, so it scaffolds the workspace, then ingests',
          DIAGRAM: 'Routes to translate — a foreign structured blueprint exists, so it scaffolds, then builds a crosswalk',
        },
        summary:
          'Entry-state detection is the first thing the skill does: nothing → co-create, docs → ingest, a foreign diagram → translate, an existing workspace → resume.',
        resources: [repoLink('skills/map/SKILL.md', 'skills/map/SKILL.md')],
      },
      { lane: 'claude', col: 3, content: 'Right-sizes the scope and settles the spine before drawing a single lane' },
      { lane: 'claude', col: 4, content: { DOCS: 'Dispatches document-readers instead of reading the corpus in its own context' } },
      { lane: 'claude', col: 5, content: { DIAGRAM: 'Maps the foreign vocabulary onto lane roles through crosswalk-schema.json' } },
      {
        lane: 'claude', col: 6,
        content: {
          DOCS: 'Writes cells with per-claim provenance, and refuses to invent a journey the documents do not describe',
          DIAGRAM: 'Writes only what the source diagram states, and leaves its gaps visible rather than filling them',
        },
      },
      { lane: 'claude', col: 7, content: 'Runs validate_ir.py until it exits 0, then dispatches a reviewer that never saw the drafting' },
      { lane: 'claude', col: 8, content: 'Computes the sign-off hash and records the approval in the workspace file' },
      { lane: 'claude', col: 9, content: 'Imports through the service account and verifies by reading the rows back' },
      { lane: 'claude', col: 10, content: 'Deploys, then dispatches the render-checker over the live app' },

      {
        lane: 'scripts', col: 2,
        content: 'blueprint-workspace.json',
        summary:
          'The workspace-state file: which scenarios are pending, drafted, signed off, or imported, and the hash each sign-off was bound to.',
        resources: [repoLink('workspace-state.md', 'skills/map/references/workspace-state.md')],
      },
      {
        lane: 'scripts', col: 4,
        content: { DOCS: 'ingest-playbook.md' },
        resources: [repoLink('ingest-playbook.md', 'skills/map/references/ingest-playbook.md')],
      },
      {
        lane: 'scripts', col: 5,
        content: { DIAGRAM: 'crosswalk-schema.json\ntranslate-playbook.md' },
        resources: [
          repoLink('crosswalk-schema.json', 'skills/map/references/crosswalk-schema.json'),
          repoLink('translate-playbook.md', 'skills/map/references/translate-playbook.md'),
        ],
      },
      {
        lane: 'scripts', col: 6,
        content: 'blueprint/blueprint.json',
        summary:
          'Where the blueprint lives before it is a database: one intermediate-representation file the skills read and write.',
        resources: [repoLink('references/ir-schema.json', 'references/ir-schema.json')],
      },
      {
        lane: 'scripts', col: 7,
        content: 'validate_ir.py (stdlib-only)',
        summary:
          'No dependencies to install: the validator runs on a stock Python 3, and the drafting phase does not end until it exits 0.',
        resources: [repoLink('scripts/validate_ir.py', 'scripts/validate_ir.py')],
      },
      {
        lane: 'scripts', col: 8,
        content: 'compute_signoff_hash.py',
        fn: 'Bind an approval to exactly the content that was approved, so a later edit cannot inherit yesterday’s sign-off.',
        form: 'A hash computed over one scenario’s content and recorded with the approval in the workspace file.',
        valueProps: [
          { for: 'The person approving', value: 'What they signed is recoverable, not remembered.' },
          { for: 'The next session', value: 'A changed scenario shows as unsigned instead of quietly passing.' },
        ],
        owner: 'The blueprint owner who signs',
        perceivedOwner: 'The skill that computes the hash',
        resources: [repoLink('scripts/compute_signoff_hash.py', 'scripts/compute_signoff_hash.py')],
      },
      {
        lane: 'scripts', col: 9,
        content: 'generate_fallbacks.py --register\ngenerate_seed_sql.py',
        summary:
          'One blueprint file becomes both targets: a no-database data module registered into the app, and a transactional seed for Postgres.',
        resources: [
          repoLink('scripts/generate_fallbacks.py', 'scripts/generate_fallbacks.py'),
          repoLink('scripts/generate_seed_sql.py', 'scripts/generate_seed_sql.py'),
        ],
      },

      {
        lane: 'agents', col: 4,
        content: { DOCS: 'document-reader returns structure, keeping raw source text out of the main context' },
        resources: [repoLink('agents/document-reader.md', 'agents/document-reader.md')],
      },
      {
        lane: 'agents', col: 5,
        content: { DIAGRAM: 'document-reader in foreign-blueprint mode returns lanes, columns and variants' },
        resources: [repoLink('agents/document-reader.md', 'agents/document-reader.md')],
      },
      {
        lane: 'agents', col: 7,
        content: 'blueprint-reviewer returns numbered findings with severities',
        summary:
          'A fresh context that never saw the drafting catches what the drafting context is anchored on.',
        resources: [repoLink('agents/blueprint-reviewer.md', 'agents/blueprint-reviewer.md')],
      },
      {
        lane: 'agents', col: 10,
        content: 'render-checker walks every scenario and view and screenshots each',
        resources: [repoLink('agents/render-checker.md', 'agents/render-checker.md')],
      },

      {
        lane: 'refs', col: 1,
        content: 'elicitation-protocol.md',
        resources: [repoLink('elicitation-protocol.md', 'skills/map/references/elicitation-protocol.md')],
      },
      {
        lane: 'refs', col: 3,
        content: 'lane-roles.md\nlane-vocabulary.md',
        summary:
          'Rendering follows the semantic lane_role, never the display name — which is why lane labels are free-form, in any language.',
        resources: [repoLink('references/lane-roles.md', 'references/lane-roles.md')],
      },
      {
        lane: 'refs', col: 6,
        content: 'data-model.md\nir-schema.json',
        resources: [
          repoLink('references/data-model.md', 'references/data-model.md'),
          repoLink('references/ir-schema.json', 'references/ir-schema.json'),
        ],
      },
      {
        lane: 'refs', col: 8,
        content: 'validate_ir_on_edit.py — re-validates the blueprint file on every edit',
        resources: [repoLink('hooks/validate_ir_on_edit.py', 'hooks/validate_ir_on_edit.py')],
      },
      {
        lane: 'refs', col: 9,
        content: 'secret_guard.py — the service-role key never reaches disk or transcript',
        owner: 'The blueprint owner’s own machine',
        perceivedOwner: 'The template',
        summary:
          'The guard runs in the owner’s harness, on their machine — the template ships the hook, it never holds the key.',
        resources: [repoLink('hooks/secret_guard.py', 'hooks/secret_guard.py')],
      },
      {
        lane: 'refs', col: 10,
        content: 'deploy-notes.md',
        resources: [repoLink('deploy-notes.md', 'skills/map/references/deploy-notes.md')],
      },
    ],
    dependencies: [
      { from: ['claude', 1], to: ['claude', 2] },
      { from: ['claude', 4], to: ['agents', 4], paths: ['DOCS'] },
      { from: ['claude', 5], to: ['scripts', 5], paths: ['DIAGRAM'] },
      { from: ['agents', 5], to: ['claude', 6], label: 'structure', paths: ['DIAGRAM'] },
      // Cross-lane UPWARD: the reviewer's findings come back up to the owner.
      { from: ['agents', 7], to: ['owner', 7], label: 'findings' },
      { from: ['owner', 6], to: ['claude', 6], label: 'nod' },
      { from: ['claude', 8], to: ['claude', 9] },
      { from: ['claude', 9], to: ['surface', 9], label: 'read back' },
      // Backward in-lane rework loop: accepted findings send the draft back.
      {
        from: ['claude', 7], to: ['claude', 6], label: 'rework',
        note: 'Accepted findings send the draft back to cell-writing before a re-validate.',
      },
      {
        from: ['scripts', 8], to: ['owner', 8], kind: 'enables',
        note: 'Sign-off is bound to a content hash, not to a feeling.',
      },
      {
        from: ['scripts', 9], to: ['claude', 9], kind: 'enables',
        note: 'The import consumes the generated seed; the fallback module is registered in the same pass.',
      },
      {
        from: ['scripts', 4], to: ['agents', 4], kind: 'enables', paths: ['DOCS'],
        note: 'The reader follows the ingest playbook rather than improvising a reading order.',
      },
    ],
  },

  // -------------------------------------------------------------------
  // 3 · Audit the check roster — ub:audit, happy vs a reopened finding
  // -------------------------------------------------------------------
  {
    ordinal: 3,
    key: 'AUDIT',
    phaseKey: 'OPERATE',
    name: 'Audit the check roster',
    summary:
      'ub:audit runs its roster of blind checks and lands what they find as triageable rows — and the re-run is where a finding that was closed too early comes back.',
    order: 1,
    layout: 'stacked',
    spineLane: 'owner',
    paths: [
      {
        ordinal: 1,
        key: 'TRIAGED',
        name: 'Findings triaged',
        kind: 'happy',
        summary: 'Every finding dismissed or genuinely resolved, and the re-run comes back quiet.',
      },
      {
        ordinal: 2,
        key: 'REOPENS',
        name: 'A critical finding reopens',
        kind: 'variant',
        summary:
          'A finding marked resolved before the fix landed: the next run re-detects the same fingerprint and reopens it.',
      },
    ],
    steps: [
      'Name the scope',
      'Export once',
      'Dispatch the auditors',
      'Collect and dedupe',
      'Record the findings',
      'Triage the findings',
      'Re-run the roster',
    ],
    lanes: LANES,
    cells: [
      { lane: 'owner', col: 1, content: 'Names the scenario to audit and lets the whole roster run' },
      { lane: 'owner', col: 5, content: 'Reads findings as rows to triage, not as a chat opinion to argue with' },
      {
        lane: 'owner', col: 6,
        content: {
          TRIAGED: 'Triages every finding: dismisses it, or resolves it once the fix has landed',
          REOPENS: 'Marks a critical finding resolved before the fix has actually landed',
        },
      },
      {
        lane: 'owner', col: 7,
        content: {
          TRIAGED: 'Sees the re-run report nothing new on the checks whose cells did not change',
          REOPENS: 'Sees the finding reopen, because its fingerprint matched a resolved row',
        },
      },

      { lane: 'surface', col: 5, content: 'Findings listed in the agent chat\nThe agent can box cited cells on request' },
      {
        lane: 'surface', col: 6,
        content: 'Triage by asking the agent: dismiss, resolve or reopen',
        // The pair check-perceived-owner exists to catch: people read the
        // audit as the thing that closes findings. It never closes anything.
        owner: 'Whoever triages',
        perceivedOwner: 'The audit',
        summary:
          'Humans may change only findings.status. The audit points and never fixes, and it may supersede only its own check’s open rows.',
      },

      { lane: 'claude', col: 1, content: 'Loads ub:audit and reads the audit playbook before executing any route' },
      { lane: 'claude', col: 2, content: 'Exports the blueprint once — every auditor reads that same export' },
      { lane: 'claude', col: 3, content: 'Dispatches one auditor per check, in parallel and blind' },
      { lane: 'claude', col: 4, content: 'Dedupes by fingerprint: dismissed stays dismissed, resolved reopens, open updates in place' },
      { lane: 'claude', col: 5, content: 'Writes findings under one run_id, superseding its own check’s previous open rows' },
      {
        lane: 'claude', col: 7,
        content: {
          TRIAGED: 'Re-runs and reports per-check counts, skipped checks, and failed checks — nothing silent',
          REOPENS: 'Re-runs and reports the reopened finding: the audit never closes what it did not fix',
        },
      },

      {
        lane: 'scripts', col: 2,
        content: 'audit_tools.py export',
        fn: 'Run the roster as machinery rather than judgement: one blind auditor per check, output validated against a fixed findings shape.',
        form: 'A stdlib-only Python module the skill calls, plus one read-only export of the blueprint that every auditor shares.',
        valueProps: [
          { for: 'The blueprint owner', value: 'Findings arrive as triageable rows, not as a chat opinion to argue with.' },
          { for: 'The next run', value: 'Fingerprints dedupe repeats, so a re-audit surfaces what changed.' },
        ],
        resources: [repoLink('audit_tools.py', 'skills/audit/scripts/audit_tools.py')],
      },
      {
        lane: 'scripts', col: 4,
        content: 'Fingerprint = check name + sha256 of the sorted cell keys + reason slug',
        summary:
          'A duplicate fingerprint inside one incoming batch is a reported error, never a second insert; the partial unique index on open fingerprints is the backstop.',
        resources: [repoLink('references/audit-playbook.md', 'references/audit-playbook.md')],
      },
      {
        lane: 'scripts', col: 5,
        content: 'findings table\naudit/findings-report.json',
        summary:
          'Rows in the findings table when a database is reachable, and a JSON ledger when one is not — the audit still runs, straight against the blueprint files.',
        resources: [repoLink('skills/audit/SKILL.md', 'skills/audit/SKILL.md')],
      },
      { lane: 'scripts', col: 7, content: 'Per-check atomic supersede\nOne run_id per run' },

      {
        lane: 'agents', col: 3,
        content: 'auditor — one check doc and the export, never another check’s output',
        summary:
          'Each check’s judgement stays uncontaminated because the auditor running it cannot see any other check or its findings.',
        resources: [repoLink('agents/auditor.md', 'agents/auditor.md')],
      },
      { lane: 'agents', col: 4, content: 'Each auditor’s output is validated against the findings-row shape before any dedupe' },
      {
        lane: 'agents', col: 7,
        content: {
          TRIAGED: 'The re-run’s auditors re-detect nothing on checks whose cells did not change',
          REOPENS: 'The re-detected finding matches a resolved row, so it reopens instead of filing a duplicate',
        },
      },

      {
        lane: 'refs', col: 1,
        content: 'audit-playbook.md',
        summary:
          'Read before executing any route: run semantics, the fingerprint algorithm, triage rules, and the check-authoring template.',
        resources: [repoLink('references/audit-playbook.md', 'references/audit-playbook.md')],
      },
      {
        lane: 'refs', col: 3,
        content: 'check-gap-sweep.md\ncheck-jargon-lint.md\ncheck-channel-conflict.md',
        summary:
          'Three of the roster’s eight checks. The roster is the directory listing, not this list — a check file that exists runs, or is reported skipped.',
        resources: [
          repoLink('check-gap-sweep.md', 'skills/audit/references/check-gap-sweep.md'),
          repoLink('check-jargon-lint.md', 'skills/audit/references/check-jargon-lint.md'),
        ],
      },
      {
        lane: 'refs', col: 5,
        content: 'check-perceived-owner.md\ncheck-value-ledger.md',
        summary:
          'Wave-2 checks read the cell spec columns, and skip gracefully — reported, never silent — when those columns are empty.',
        resources: [
          repoLink('check-perceived-owner.md', 'skills/audit/references/check-perceived-owner.md'),
          repoLink('check-value-ledger.md', 'skills/audit/references/check-value-ledger.md'),
        ],
      },
    ],
    dependencies: [
      { from: ['claude', 2], to: ['scripts', 2] },
      { from: ['claude', 3], to: ['agents', 3] },
      // Cross-lane UPWARD: the auditors' findings surface into what the owner sees.
      { from: ['agents', 4], to: ['surface', 5], label: 'findings' },
      { from: ['surface', 5], to: ['owner', 5] },
      { from: ['owner', 6], to: ['claude', 7], label: 'triaged' },
      // The canonical backward loop, on the unhappy path only.
      {
        from: ['claude', 7], to: ['claude', 3], label: 're-dispatch', paths: ['REOPENS'],
        note: 'A re-run is a full run: the roster goes out again, and supersede semantics make that safe.',
      },
      {
        from: ['scripts', 4], to: ['claude', 4], kind: 'enables',
        note: 'Dedupe is the fingerprint algorithm, not a judgement call about whether two findings feel alike.',
      },
      {
        from: ['refs', 3], to: ['agents', 3], kind: 'enables',
        note: 'An auditor is given exactly one check doc; the roster is the directory listing.',
      },
    ],
  },

  // -------------------------------------------------------------------
  // 4 · Ideate a change (what-if) — ub:whatif on a copy
  // -------------------------------------------------------------------
  {
    ordinal: 4,
    key: 'WHATIF',
    phaseKey: 'OPERATE',
    name: 'Ideate a change (what-if)',
    summary:
      'ub:whatif traces a proposed change through the dependency graph on a copy, and stops at a human gate — nothing lands that nobody agreed to.',
    order: 2,
    layout: 'stacked',
    spineLane: 'owner',
    paths: [
      {
        ordinal: 1,
        key: 'TRACED',
        name: 'Traced before it lands',
        kind: 'happy',
        summary:
          'Hypothetical to traced consequences to an accepted change request, with the base blueprint untouched throughout.',
      },
    ],
    steps: [
      'Frame the hypothetical',
      'Copy to a variant',
      'Trace the graph',
      'Judge the consequences',
      'Verify every claim',
      'Record the comparison',
      'Accept or drop it',
    ],
    lanes: LANES,
    cells: [
      { lane: 'owner', col: 1, content: 'Asks what would happen if a step were removed, automated, or moved out of sight' },
      { lane: 'owner', col: 4, content: 'Reads the affected-cell list before forming an opinion' },
      { lane: 'owner', col: 7, content: 'Accepts the option, or drops it and leaves the blueprint exactly as it was' },

      { lane: 'surface', col: 3, content: 'Dependency tab\nDependency arrows' },
      { lane: 'surface', col: 7, content: 'Nothing on the canvas changes until ub:map promotes an accepted change' },

      { lane: 'claude', col: 1, content: 'Picks the operation: replay, restage, or prioritize' },
      { lane: 'claude', col: 2, content: 'Copies the blueprint into whatif/<key>/ — the hypothetical never touches the base' },
      { lane: 'claude', col: 3, content: 'Dispatches impact-tracer down leads_to and enables edges' },
      { lane: 'claude', col: 4, content: 'Judges the consequences against the operation it picked, not against a general opinion' },
      { lane: 'claude', col: 5, content: 'Dispatches blueprint-reviewer in whatif-claim mode and cuts every claim that fails' },
      { lane: 'claude', col: 6, content: 'Writes comparison.md with citations and zero verbatim excerpts' },
      { lane: 'claude', col: 7, content: 'Emits a change request, then stops: promotion is a separate ub:map invocation' },

      {
        lane: 'scripts', col: 2,
        content: 'validate_ir.py on the variant',
        summary:
          'A hypothetical still has to be a legal blueprint, so the variant passes the same validator the real one does.',
        resources: [repoLink('scripts/validate_ir.py', 'scripts/validate_ir.py')],
      },
      {
        lane: 'scripts', col: 3,
        content: 'Visited set + depth cap',
        summary:
          'Loops are legal in this data — a phase may feed back — so the walk has to survive a cyclic graph rather than assume a tree.',
      },
      {
        lane: 'scripts', col: 6,
        content: 'comparison.md\nchange-request-schema.json',
        resources: [repoLink('change-request-schema.json', 'skills/whatif/references/change-request-schema.json')],
      },
      { lane: 'scripts', col: 7, content: 'Recorded AND recomputed sign-off hashes must both match, or promotion refuses' },

      {
        lane: 'agents', col: 3,
        content: 'impact-tracer returns affected cells, strained assumptions, and displaced demand',
        fn: 'Answer “what else does this touch?” from the graph rather than from whoever remembers the service best.',
        form: 'A read-only walk down leads_to and enables edges from one named cell, returning a bounded list with a truncation flag.',
        valueProps: [
          { for: 'The blueprint owner', value: 'The blast radius of a change, before anyone estimates it.' },
          { for: 'The reviewer', value: 'A claim list with cell keys attached, so every claim is checkable.' },
        ],
        resources: [repoLink('agents/impact-tracer.md', 'agents/impact-tracer.md')],
      },
      {
        lane: 'agents', col: 5,
        content: 'blueprint-reviewer, whatif-claim mode: every surviving claim carries cell keys it confirmed exist',
        resources: [repoLink('agents/blueprint-reviewer.md', 'agents/blueprint-reviewer.md')],
      },

      {
        lane: 'refs', col: 1,
        content: 'whatif-playbook.md',
        resources: [repoLink('whatif-playbook.md', 'skills/whatif/references/whatif-playbook.md')],
      },
      {
        lane: 'refs', col: 6,
        content: 'audit-playbook.md §2–§4 — findings mechanics, shared with the audit',
        resources: [repoLink('references/audit-playbook.md', 'references/audit-playbook.md')],
      },
    ],
    dependencies: [
      { from: ['claude', 1], to: ['claude', 2] },
      { from: ['claude', 3], to: ['agents', 3] },
      // Cross-lane UPWARD: the tracer's result comes back up to the owner.
      { from: ['agents', 3], to: ['owner', 4], label: 'affected cells' },
      { from: ['agents', 3], to: ['surface', 3] },
      { from: ['claude', 5], to: ['agents', 5] },
      {
        from: ['agents', 3], to: ['claude', 6], kind: 'enables',
        note: 'The comparison is written from the tracer’s result, never from memory of the service.',
      },
      {
        from: ['agents', 5], to: ['claude', 7], kind: 'enables',
        note: 'A change request carries only claims the reviewer confirmed.',
      },
      {
        from: ['scripts', 7], to: ['claude', 7], kind: 'enables',
        note: 'The staleness guard compares against the sign-off hashes captured when the variant was copied.',
      },
    ],
  },

  // -------------------------------------------------------------------
  // 5 · Slice for an audience — ub:slice, whenever a room needs one view
  // -------------------------------------------------------------------
  {
    ordinal: 5,
    key: 'SLICE',
    phaseKey: 'OPERATE',
    name: 'Slice for an audience',
    summary:
      'ub:slice takes the one view an audience asked for out of the blueprint and carries it into presentation mode and PDF, still pointing at the cells it quotes.',
    order: 3,
    layout: 'stacked',
    spineLane: 'owner',
    paths: [
      {
        ordinal: 1,
        key: 'READOUT',
        name: 'Stakeholder readout',
        kind: 'happy',
        summary: 'From “show me my part” to a presented, exportable slice that still points at its cells.',
      },
    ],
    steps: [
      'Ask for a view',
      'Choose the slice type',
      'Compose the frames',
      'Validate the slice',
      'Review the claims',
      'Import the slice',
      'Present the frames',
      'Export to PDF',
    ],
    lanes: LANES,
    cells: [
      { lane: 'stakeholders', col: 1, content: 'Asks for just the part of the service that concerns their team' },
      { lane: 'stakeholders', col: 7, content: 'Watches one frame at a time, and follows the locator back to where it sits on the board' },
      { lane: 'stakeholders', col: 8, content: 'Takes the PDF away; the slice still points at the cells it quotes' },

      { lane: 'owner', col: 1, content: 'Relays the ask, and says which scenario it lives in' },
      { lane: 'owner', col: 3, content: 'Nods on the proposed frames, or names the cells they wanted instead' },
      { lane: 'owner', col: 5, content: 'Sees which claims the reviewer could not trace, before anything is presented' },
      { lane: 'owner', col: 7, content: 'Presents the frames rather than a deck built beside the board' },

      { lane: 'surface', col: 6, content: 'Slices sidebar\nFocus view' },
      {
        lane: 'surface', col: 7,
        content: 'Presentation mode\nFilmstrip\nBlueprint locator',
        fn: 'Hold one frame at a time in front of a room without losing the fact that every frame came from a cell on the board.',
        form: 'A darkened full-bleed stage, a filmstrip of the remaining frames, and a locator showing where the frame sits on the blueprint.',
        valueProps: [
          { for: 'The audience', value: 'Their part of the service, in their language, at their length.' },
          { for: 'The blueprint owner', value: 'One artifact to present instead of a deck that drifts from the board.' },
        ],
      },
      { lane: 'surface', col: 8, content: 'Print / PDF export' },

      { lane: 'claude', col: 1, content: 'Asks which of the four questions the audience is really asking' },
      { lane: 'claude', col: 2, content: 'Picks one of five slice types: journey, step, lane, cell, or custom' },
      { lane: 'claude', col: 3, content: 'Proposes member cells by name, in journey order, and waits for a nod' },
      { lane: 'claude', col: 4, content: 'Runs slice_tools.py validate until it exits 0' },
      { lane: 'claude', col: 5, content: 'Waits for the claim review before importing — a slice that quotes nothing is not shippable' },
      { lane: 'claude', col: 6, content: 'Imports through slice_tools.py and reads the rows back' },
      { lane: 'claude', col: 7, content: 'Hands off to the app: the skill’s job ends at the import, presenting is the app’s' },

      {
        lane: 'scripts', col: 2,
        content: 'slice-templates.md',
        summary:
          'The type decides the shape of the read: a journey follows one actor along the board, a step reads one column top to bottom, a lane follows one row across, a cell zooms in on one moment, custom is any hand-picked set.',
        resources: [repoLink('slice-templates.md', 'skills/slice/references/slice-templates.md')],
      },
      {
        lane: 'scripts', col: 3,
        content: 'slice_tools.py select',
        summary:
          'Cell-id derivation lives in the script and must agree byte-for-byte with the blueprint import, or the slice points at rows that do not exist.',
        resources: [repoLink('slice_tools.py', 'skills/slice/scripts/slice_tools.py')],
      },
      {
        lane: 'scripts', col: 4,
        content: 'slice-schema.json',
        resources: [repoLink('slice-schema.json', 'skills/slice/references/slice-schema.json')],
      },
      {
        lane: 'scripts', col: 6,
        content: 'slices\nslides',
        summary:
          'Slides reference cells softly — uuid arrays paired with cell keys — so re-importing a scenario never cascades into a presentation.',
        resources: [repoLink('references/data-model.md', 'references/data-model.md')],
      },

      {
        lane: 'agents', col: 5,
        content: 'blueprint-reviewer, slice mode: every claim traces to a cited cell, nothing invented, nothing quoted',
        resources: [repoLink('agents/blueprint-reviewer.md', 'agents/blueprint-reviewer.md')],
      },

      {
        lane: 'refs', col: 1,
        content: 'slice-playbook.md',
        resources: [repoLink('slice-playbook.md', 'skills/slice/references/slice-playbook.md')],
      },
      {
        lane: 'refs', col: 7,
        content: 'storyboard-prompts.md — optional imagery, only after the text path is complete',
        resources: [repoLink('storyboard-prompts.md', 'skills/slice/references/storyboard-prompts.md')],
      },
    ],
    dependencies: [
      { from: ['stakeholders', 1], to: ['owner', 1], label: 'show me my part' },
      { from: ['claude', 2], to: ['claude', 3] },
      { from: ['claude', 4], to: ['scripts', 4] },
      { from: ['claude', 5], to: ['agents', 5] },
      // Cross-lane UPWARD, the long one: the support lane's guidance and the
      // imported rows both climb back to what the room actually looks at.
      { from: ['agents', 5], to: ['owner', 5], label: 'untraceable claims' },
      { from: ['refs', 7], to: ['stakeholders', 7], label: 'frames, not slides' },
      { from: ['scripts', 6], to: ['surface', 7], label: 'rows the app reads' },
      { from: ['owner', 3], to: ['claude', 4], label: 'nod' },
      {
        from: ['claude', 4], to: ['claude', 6], kind: 'enables',
        note: 'Only a validated slice is importable.',
      },
      {
        from: ['agents', 5], to: ['claude', 6], kind: 'enables',
        note: 'The import waits for the fresh-context claim review to come back clean.',
      },
    ],
  },

  // -------------------------------------------------------------------
  // 6 · Keep it current — Maintain, the smallest board, and where the
  //     service loop lands back into Operate
  // -------------------------------------------------------------------
  {
    ordinal: 6,
    key: 'KEEP',
    phaseKey: 'MAINTAIN',
    name: 'Keep it current',
    summary:
      'The service moved and the board did not: resume the workspace, edit what changed, re-sign it, re-import. A blueprint is maintained, not delivered.',
    order: 1,
    layout: 'stacked',
    spineLane: 'owner',
    spineChain: true,
    paths: [
      {
        ordinal: 1,
        key: 'UPDATE',
        name: 'Update what changed',
        kind: 'happy',
        summary:
          'The smallest loop in the template: one scenario edited, re-signed, and re-imported, with the rest reported as no-ops.',
      },
    ],
    steps: [
      'Notice the drift',
      'Resume the workspace',
      'Edit the scenario',
      'Re-sign',
      'Re-import',
    ],
    lanes: LANES,
    cells: [
      { lane: 'stakeholders', col: 1, content: 'Says the board no longer matches the service they work in' },
      { lane: 'stakeholders', col: 5, content: 'Goes back to reading, auditing, and slicing the board — the loop back into Operate' },

      { lane: 'owner', col: 1, content: 'Confirms the drift is real and names the scenario it lives in' },
      { lane: 'owner', col: 3, content: 'Says what actually changed, step by step' },
      { lane: 'owner', col: 4, content: 'Re-signs only the scenarios whose content changed' },
      { lane: 'owner', col: 5, content: 'Watches the unchanged scenarios report as no-ops' },

      { lane: 'surface', col: 5, content: 'Canvas, redrawn from the re-imported rows' },

      { lane: 'claude', col: 2, content: 'Reads the workspace state and HANDOFF.md, verifies the recorded sign-off hash, and resumes' },
      { lane: 'claude', col: 3, content: 'Edits the existing scenario in place instead of re-mapping the whole service' },
      { lane: 'claude', col: 4, content: 'Recomputes the hash: a changed scenario shows as unsigned until it is re-signed' },
      { lane: 'claude', col: 5, content: 'Re-imports; a scenario whose content hash is unchanged is a no-op' },

      {
        lane: 'scripts', col: 2,
        content: 'blueprint-workspace.json\nHANDOFF.md',
        resources: [repoLink('workspace-state.md', 'skills/map/references/workspace-state.md')],
      },
      {
        lane: 'scripts', col: 4,
        content: 'compute_signoff_hash.py',
        resources: [repoLink('scripts/compute_signoff_hash.py', 'scripts/compute_signoff_hash.py')],
      },
      {
        lane: 'scripts', col: 5,
        content: 'generate_seed_sql.py\ngenerate_fallbacks.py --register',
        resources: [repoLink('scripts/generate_seed_sql.py', 'scripts/generate_seed_sql.py')],
      },

      {
        lane: 'agents', col: 3,
        content: 'document-reader, single-doc mode, when the change arrives as a document',
        resources: [repoLink('agents/document-reader.md', 'agents/document-reader.md')],
      },

      {
        lane: 'refs', col: 2,
        content: 'workspace-state.md',
        resources: [repoLink('workspace-state.md', 'skills/map/references/workspace-state.md')],
      },
      {
        lane: 'refs', col: 3,
        content: 'customization.md — how a workspace is upgraded when the template moves under it',
        resources: [repoLink('references/customization.md', 'references/customization.md')],
      },
    ],
    dependencies: [
      { from: ['stakeholders', 1], to: ['owner', 1], label: 'this is wrong now' },
      { from: ['claude', 2], to: ['claude', 3] },
      { from: ['claude', 5], to: ['surface', 5], label: 'read back' },
      // Cross-lane UPWARD: the reference the resume route depends on, and the
      // hand-back to the people who will use the board again.
      { from: ['refs', 2], to: ['claude', 2], label: 'resume rules' },
      { from: ['surface', 5], to: ['stakeholders', 5], label: 'back in use' },
      {
        from: ['scripts', 4], to: ['claude', 4], kind: 'enables',
        note: 'Re-signing is a recomputed hash, so an edit cannot inherit the previous approval.',
      },
      {
        from: ['claude', 4], to: ['claude', 5], kind: 'enables',
        note: 'Only a re-signed scenario is re-importable.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Structural assertions — the shape the fixture promises, enforced here so a
// content edit cannot quietly cost the board a divider line or a stable
// path identity.
// ---------------------------------------------------------------------------

function assertLaneRoster(scenario) {
  const roles = scenario.lanes.map((lane) => lane.role)
  const customerLanes = roles.filter((role) => role === 'customer_actions').length
  if (customerLanes !== 1) {
    throw new Error(
      `scenario ${scenario.key}: ${customerLanes} customer_actions lanes — the interaction line must draw exactly once`,
    )
  }
  roles.forEach((role, index) => {
    if (
      role === 'frontstage_touchpoints' &&
      roles[index + 1] !== 'frontstage_actions'
    ) {
      throw new Error(
        `scenario ${scenario.key}: frontstage_touchpoints at row ${index} is not immediately followed by frontstage_actions — the visibility line would draw twice`,
      )
    }
  })
}

function assertStructure(scenarios) {
  const seenPathNames = new Map()
  let primaries = 0
  for (const scenario of scenarios) {
    assertLaneRoster(scenario)
    if (scenario.primary) primaries += 1
    for (const path of scenario.paths) {
      // Path identity is `kind:name` (src/lib/pathColorTheme.ts), and the
      // overview path filter keys its options on the same composite — two paths
      // sharing it merge into one row. Uniqueness is a property, not a habit.
      const key = `${path.kind}:${path.name}`
      if (seenPathNames.has(key)) {
        throw new Error(
          `path identity "${key}" is used by both ${seenPathNames.get(key)} and ${scenario.key} — path names must be unique across the service`,
        )
      }
      seenPathNames.set(key, scenario.key)
      if (/^happy\s*path$/i.test(path.name)) {
        throw new Error(
          `scenario ${scenario.key}: a path named "${path.name}" trips the name-keyed tier in src/lib/pathSelection.ts — keep that branch dormant`,
        )
      }
      for (const col of path.skipSteps ?? []) {
        if (col < 1 || col > scenario.steps.length) {
          throw new Error(`scenario ${scenario.key} path ${path.key}: skipSteps column ${col} is out of range`)
        }
      }
    }
  }
  if (primaries !== 1) {
    throw new Error(
      `exactly one scenario must carry primary: true (found ${primaries}) — SAMPLE_SCENARIO_ID derives from it`,
    )
  }
}

assertStructure(SCENARIOS)


// ---------------------------------------------------------------------------
// Build: specs → per-path BlueprintData
// ---------------------------------------------------------------------------

function laneByKey(scenario, key) {
  const lane = scenario.lanes.find((entry) => entry.key === key)
  if (!lane) throw new Error(`scenario ${scenario.key}: unknown lane "${key}"`)
  return lane
}

/**
 * Cells of one scenario resolved onto one path — skipping per-path-absent
 * content AND any column the path omits entirely (`skipSteps`).
 */
function resolveCellsForPath(scenario, path) {
  const skipped = new Set(path.skipSteps ?? [])
  const resolved = []
  for (const spec of scenario.cells) {
    if (skipped.has(spec.col)) continue
    const lane = laneByKey(scenario, spec.lane)
    const slot = spec.slot ?? 0
    let content
    if (typeof spec.content === 'string') content = spec.content
    else if (spec.content && typeof spec.content === 'object') {
      if (!(path.key in spec.content)) continue
      content = spec.content[path.key]
    } else throw new Error(`scenario ${scenario.key}: bad content at ${spec.lane}:${spec.col}`)
    resolved.push({ lane, col: spec.col, slot, content, spec })
  }
  return resolved
}

function buildScenario(scenario) {
  const S = scenario.ordinal
  const steps = scenario.steps.map((name, index) => ({
    id: fid(S, 0, KIND.step, index + 1, 0),
    name,
    position: index + 1,
  }))

  const blueprints = scenario.paths.map((path) => {
    const P = path.ordinal
    // A path carries a SUBSET of the scenario's columns, renumbered so its own
    // grid is contiguous — steps stay scenario-scoped rows, path_steps carries
    // the per-path ordering. This is what "each path includes a subset of the
    // steps" looks like in the data.
    const skipped = new Set(path.skipSteps ?? [])
    const pathSteps = steps
      .filter((step) => !skipped.has(step.position))
      .map((step, index) => ({ ...step, position: index + 1 }))
    const lanes = scenario.lanes.map((lane) => ({
      id: fid(S, P, KIND.lane, lane.row, 0),
      name: lane.name,
      role: lane.role === 'storyboard' ? 'storyboard' : lane.role,
      position: lane.row,
    }))

    const resolved = resolveCellsForPath(scenario, path)
    const cells = resolved.map(({ lane, col, slot, content, spec }) => ({
      id: fid(S, P, KIND.cell, lane.row, slot * 100 + col),
      lane_id: fid(S, P, KIND.lane, lane.row, 0),
      step_id: steps[col - 1].id,
      content,
      frame: spec.frame ?? null,
      summary: spec.summary ?? null,
      resources: spec.resources ?? [],
      touchpoints: (spec.touchpoints ?? []).map((tp) => ({
        id: null,
        touchpointId: registryId(tp.name),
        name: tp.name,
        kind: 'other',
        summary: tp.summary ?? null,
        role: tp.role ?? null,
      })),
      ...(slot > 0 ? { position: slot } : {}),
      // Cell spec — emitted only where authored, so the fixture stays lean.
      // `fn` in the spec, `function` on the row: the column is named for the
      // service-blueprint canon (FUNCTION / FORM / VALUE).
      ...(spec.owner ? { owner: spec.owner } : {}),
      ...(spec.perceivedOwner ? { perceived_owner: spec.perceivedOwner } : {}),
      ...(spec.fn ? { function: spec.fn } : {}),
      ...(spec.form ? { form: spec.form } : {}),
      ...(spec.valueProps ? { value_props: spec.valueProps } : {}),
    }))

    const hasCell = (laneKey, col) =>
      resolved.some((cell) => cell.lane.key === laneKey && cell.col === col && cell.slot === 0)
    const cellId = (laneKey, col) =>
      fid(S, P, KIND.cell, laneByKey(scenario, laneKey).row, col)

    const dependencySpecs = []
    // Forward chain along the customer spine, OPT-IN per scenario: a ten-arrow
    // chain down one lane is a ruler, not a dependency graph, so only the
    // scenarios whose spine really is a sequence ask for it.
    if (scenario.spineChain) {
      const spineCols = resolved
        .filter((cell) => cell.lane.key === scenario.spineLane && cell.slot === 0)
        .map((cell) => cell.col)
        .sort((a, b) => a - b)
      for (let i = 0; i < spineCols.length - 1; i += 1) {
        dependencySpecs.push({
          from: [scenario.spineLane, spineCols[i]],
          to: [scenario.spineLane, spineCols[i + 1]],
        })
      }
    }
    for (const trig of scenario.dependencies) {
      if (trig.paths && !trig.paths.includes(path.key)) continue
      // A column this path omits takes its arrows with it.
      if (skipped.has(trig.from[1]) || skipped.has(trig.to[1])) continue
      for (const [laneKey, col] of [trig.from, trig.to]) {
        if (!hasCell(laneKey, col)) {
          throw new Error(
            `scenario ${scenario.key} path ${path.key}: dependency references missing cell (${laneKey}:${col})`,
          )
        }
      }
      dependencySpecs.push(trig)
    }

    const dependencies = dependencySpecs.map((trig, index) => ({
      id: fid(S, P, KIND.dependency, index + 1, 0),
      source_cell_id: cellId(trig.from[0], trig.from[1]),
      target_cell_id: cellId(trig.to[0], trig.to[1]),
      ...(trig.kind === 'enables' ? { kind: 'enables' } : {}),
      ...(trig.label ? { name: trig.label } : {}),
      ...(trig.note ? { note: trig.note } : {}),
    }))

    return {
      path: {
        id: fid(S, P, KIND.path, 0, 0),
        name: path.name,
        summary: path.summary,
        note: null,
        kind: path.kind,
        // The sample is the offline copy of a board whose rows all default to
        // `live`; nothing here is a proposal, so nothing overrides it.
        status: 'live',
      },
      lanes,
      steps: pathSteps,
      cells,
      dependencies,
    }
  })

  return { scenario, id: fid(S, 0, KIND.path, 0, 1), steps, blueprints }
}

const built = SCENARIOS.map(buildScenario)
const scenarioById = new Map(built.map((entry) => [entry.scenario.key, entry]))

// ---------------------------------------------------------------------------
// Cell keys — the IMPORT key convention (6 segments: service/phase/
// scenario/path/lane/step), matching scripts/generate_seed_sql.py and
// slice_tools.cell_key(). App-minted keys (`mint_cell_key`) use their own
// form; the two never collide because seeds and app-created cells are
// distinct rows. Slot-sibling cells (slot > 0) carry NO key: the 6-segment
// identity names the slot, and cells.cell_key is unique — the slot's first
// cell owns the key, siblings are recovered by position.
// ---------------------------------------------------------------------------

/**
 * Segment slug, mirroring the SQL `key_slug` exactly: ascii slug when the
 * name has ascii, else a deterministic md5 fragment so non-ASCII (CJK)
 * segments are never silently dropped from a key.
 */
const keySlug = (value) => {
  const raw = String(value ?? '')
  if (raw === '') return null
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug !== '' ? slug : `x${createHash('md5').update(raw).digest('hex').slice(0, 8)}`
}

const cellKeyFor = (scenario, pathName, laneName, stepName) =>
  [
    keySlug(SERVICE.name),
    keySlug(phaseByKey[scenario.phaseKey].name),
    keySlug(scenario.name),
    keySlug(pathName),
    keySlug(laneName),
    keySlug(stepName),
  ].join('/')

// ---------------------------------------------------------------------------
// Demo slices — the analysis tier's zero-config content. Three of the five
// slice types, each earning its place: a JOURNEY slice reading the owner's
// spine across the whole of Map your service, a STEP slice reading the import
// column down every lane (the vertical read is the point — the guardrail lane
// is the interesting one), and a LANE slice reading the subagent row across
// the audit, which is the half of the service nobody watches. All three sit
// on their scenario's DEFAULT (first-declared) path, so opening one lights
// its cells up with no path change first, and the journey sits on the primary
// scenario — both are asserted in src/lib/sliceCells.test.ts. `cell` and
// `custom` are deliberately absent: a single-cell demo teaches nothing the
// panel does not, and `custom` has no shape of its own to show.
// ---------------------------------------------------------------------------

function demoCellRef(scenarioKey, pathKey, laneKey, col) {
  const { scenario, blueprints } = scenarioById.get(scenarioKey)
  const path = scenario.paths.find((entry) => entry.key === pathKey)
  const lane = laneByKey(scenario, laneKey)
  const id = fid(scenario.ordinal, path.ordinal, KIND.cell, lane.row, col)
  const blueprint = blueprints.find((bp) => bp.path.id === fid(scenario.ordinal, path.ordinal, KIND.path, 0, 0))
  if (!blueprint.cells.some((cell) => cell.id === id)) {
    throw new Error(`demo slice references missing cell (${scenarioKey}/${pathKey}/${laneKey}:${col})`)
  }
  return {
    id,
    key: cellKeyFor(scenario, path.name, lane.name, scenario.steps[col - 1]),
  }
}

function buildDemoSlices() {
  const timestamps = {
    created_by: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
  }
  const item = (sliceOrdinal, sliceId, position, title, caption, refs) => ({
    id: fid(0, 0, KIND.sliceItem, sliceOrdinal, position),
    slice_id: sliceId,
    position,
    title,
    caption,
    created_by: null,
    shows_all_images: true,
    cell_ids: refs.map((ref) => ref.id),
    cell_keys: refs.map((ref) => ref.key),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
  })

  const journeyId = fid(0, 0, KIND.slice, 1, 0)
  const journey = {
    slice: {
      id: journeyId,
      service_id: SERVICE_ID,
      title: 'The map, end to end',
      summary:
        'One pass down the blueprint owner’s own lane through Map your service, on the documents route — every moment where a person, rather than the pipeline, has to decide something.',
      actor: 'Blueprint owner',
      kind: 'journey',
      authorship: 'generated',
      locale: 'en',
      position: 1,
      ...timestamps,
    },
    items: [
      item(1, journeyId, 1, 'An ask, and the fork it creates',
        'Mapping starts as a sentence, not a project. What happens next is decided by what already exists: a folder of documents routes to ingest, a diagram exported from somewhere else routes to translate. The two routes are the two paths of this scenario, and they rejoin four columns later.',
        [
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 1),
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 2),
        ]),
      item(1, journeyId, 2, 'The two questions asked before anything is built',
        'Scope and spine, in that order, and both answered by a person. Right-sizing decides whether this is one flow or the whole service; the spine decides whose journey the top lane follows. Everything drawn afterwards inherits both answers, which is why they are not left to the drafting.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 3)]),
      item(1, journeyId, 3, 'What the owner still has to say out loud',
        'On the documents route the corpus is not simply handed over: somebody names what is in scope and what is sensitive and excluded. The subagents that read it never make that call, and the cells that result carry provenance back to the documents that survived it.',
        [
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 4),
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 6),
        ]),
      item(1, journeyId, 4, 'Two gates, one of them human',
        'The validator is machinery and the reviewer is a fresh context, but accepting a finding is a judgement, and so is signing. The sign-off binds to a content hash rather than to a memory of having looked — a later edit shows the scenario as unsigned instead of quietly inheriting yesterday’s approval.',
        [
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 7),
          demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 8),
        ]),
      item(1, journeyId, 5, 'The end of the errand, not the end of the work',
        'A URL is where mapping stops and maintaining starts. The Maintain phase loops back to this one on the overview canvas, because the next time the service moves, some part of this board is drawn again.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'owner', 10)]),
    ],
  }

  const stepId = fid(0, 0, KIND.slice, 2, 0)
  const step = {
    slice: {
      id: stepId,
      service_id: SERVICE_ID,
      title: 'The import moment, read top to bottom',
      summary:
        'One column of Map your service — “Import and verify” — read down every lane at once: the step where a file in a repo becomes rows in a database, and the step with the most that can go quietly wrong.',
      actor: null,
      kind: 'step',
      authorship: 'generated',
      locale: 'en',
      position: 2,
      ...timestamps,
    },
    items: [
      item(2, stepId, 1, 'What happens in the open',
        'Claude writes the scenario through the service account and immediately reads it back, because a write that reports success and lands nothing is the failure mode this step exists to catch.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'claude', 9)]),
      item(2, stepId, 2, 'What runs underneath',
        'One blueprint file becomes two targets in the same pass — a data module the keyless app imports, and a transactional seed for Postgres. Neither is asked to be trusted: the verification is a second, independent read, not the first write’s own report.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'scripts', 9)]),
      item(2, stepId, 3, 'What the guardrail is doing while it happens',
        'The interesting lane, and the reason to read this step vertically. A service-role key is in play for exactly this step, and a hook makes sure it never reaches disk or transcript. It runs on the owner’s own machine — the template ships the hook, it never holds the key.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'refs', 9)]),
      item(2, stepId, 4, 'What you see at the end of it',
        'The imported scenario, read back live in the browser. Until this renders, the import is a claim.',
        [demoCellRef('MAP_SERVICE', 'DOCS', 'surface', 9)]),
    ],
  }

  const laneId = fid(0, 0, KIND.slice, 3, 0)
  const lane = {
    slice: {
      id: laneId,
      service_id: SERVICE_ID,
      title: 'Everything that happens out of sight',
      summary:
        'One lane of Audit the check roster — the subagent fleet, on the path where findings get triaged — read left to right: the half of the audit nobody watches, and the half that decides whether its verdicts can be trusted.',
      actor: 'Subagent fleet',
      kind: 'lane',
      authorship: 'generated',
      locale: 'en',
      position: 3,
      ...timestamps,
    },
    items: [
      item(3, laneId, 1, 'One check each, and no peeking',
        'The roster does not run as one long review. Each check goes out to its own fresh context holding exactly one check document and the shared export, which is what keeps a check’s judgement from being coloured by what another check already decided.',
        [demoCellRef('AUDIT', 'TRIAGED', 'agents', 3)]),
      item(3, laneId, 2, 'The shape is checked before the content is believed',
        'An auditor that returns something malformed has failed its check — that is decided before any dedupe, so a broken run is reported as a failed check rather than absorbed as a quiet absence of findings.',
        [demoCellRef('AUDIT', 'TRIAGED', 'agents', 4)]),
      item(3, laneId, 3, 'Why running it again is the normal state',
        'A re-run is a full run. On this path the checks whose cells did not move come back with nothing, which is the point: the noise floor is low enough that a new finding means something changed.',
        [demoCellRef('AUDIT', 'TRIAGED', 'agents', 7)]),
    ],
  }

  return [journey, step, lane]
}

const demoSlices = buildDemoSlices()

// ---------------------------------------------------------------------------
// TS emission
// ---------------------------------------------------------------------------

function emitList(items, indent) {
  return items.map((item) => `${indent}${JSON.stringify(item)},`).join('\n')
}

function emitBlueprint(exportName, blueprint) {
  return `export const ${exportName}: BlueprintData = {
  path: ${JSON.stringify(blueprint.path)},
  lanes: [
${emitList(blueprint.lanes, '    ')}
  ],
  steps: [
${emitList(blueprint.steps, '    ')}
  ],
  cells: [
${emitList(blueprint.cells, '    ')}
  ],
  dependencies: [
${emitList(blueprint.dependencies, '    ')}
  ],
}
`
}

const totals = built.flatMap(({ scenario, blueprints }) =>
  blueprints.map((bp) => ({
    label: `${scenario.name} · ${bp.path.name}`,
    lanes: bp.lanes.length,
    steps: bp.steps.length,
    cells: bp.cells.length,
    dependencies: bp.dependencies.length,
  })),
)

const exportKeyFor = (scenario, path) => `SAMPLE_${scenario.key}_${path.key}`

const header = `// GENERATED by scripts/generate_sample_blueprint.mjs — edit the generator, not this file.
//
// The template's sample content is the META-BLUEPRINT: the service blueprint
// of this template itself. One service (${SERVICE.name}), four phases
// (Discover → Setup → Operate → Maintain, Maintain looping back to Operate),
// six
// scenarios named for the skill journey — evaluating the template, ub:map from two
// starting points (two divergent paths, each omitting the other's column),
// the ub:audit roster (happy vs a reopened finding), ub:whatif on a copy,
// ub:slice for one audience, and the small update loop. Every cell is a true
// statement about how the template behaves, so the sample doubles as
// documentation. Registered as the offline fallback content in
// src/data/blueprintFallbacks.ts and src/types/nav.ts; the matching database
// seed is generated into supabase/seed.sql.
//
// Two things live only in the database, deliberately: \`evidence\` rows (their
// SELECT is restricted, so an offline reader could never see them) and
// slot-sibling cells' identity (\`slot > 0\` carries no cell_key, and the IR an
// adopter authors has no slot concept).
//
// Dimensions:
${totals
  .map(
    (t) =>
      `//   ${t.label}: ${t.lanes} lanes, ${t.steps} steps, ${t.cells} cells, ${t.dependencies} dependencies`,
  )
  .join('\n')}

import type { BlueprintData } from '@/types/blueprint'
import type { Slice, Slide } from '@/types/database'

export const SAMPLE_SERVICE_ID = '${SERVICE_ID}'

/**
 * The sample service's per-kind examples — the no-DB fallback for
 * \`services.entity_examples\`, so a definition popover grounds its generic
 * definition even with no backend configured.
 */
export const SAMPLE_ENTITY_EXAMPLES: Record<string, string> = ${JSON.stringify(
  SERVICE.entityExamples,
  null,
  2,
)}

export type SamplePhase = {
  id: string
  name: string
  summary: string
  position: number
  loops_to_phase_id: string | null
}

export const SAMPLE_PHASES: SamplePhase[] = [
${PHASES.map((phase) =>
  `  ${JSON.stringify({
    id: phaseId(phase.ordinal),
    name: phase.name,
    summary: phase.summary,
    position: phase.ordinal,
    loops_to_phase_id: phase.loopsToKey ? phaseId(phaseByKey[phase.loopsToKey].ordinal) : null,
  })},`,
).join('\n')}
]

export type SampleScenario = {
  id: string
  phase_id: string
  name: string
  summary: string
  position: number
  /** What the scenario opens as — the stored value, one vocabulary. */
  layout: 'stacked' | 'merged'
  /** Exactly one scenario is the compare/slice demo anchor — see SAMPLE_SCENARIO_ID. */
  primary?: boolean
  path_ids: string[]
}

export const SAMPLE_SCENARIOS: SampleScenario[] = [
${built
  .map(
    ({ scenario, id, blueprints }) =>
      `  ${JSON.stringify({
        id,
        phase_id: phaseId(phaseByKey[scenario.phaseKey].ordinal),
        name: scenario.name,
        summary: scenario.summary,
        position: scenario.order,
        layout: scenario.layout,
        ...(scenario.primary ? { primary: true } : {}),
        path_ids: blueprints.map((bp) => bp.path.id),
      })},`,
  )
  .join('\n')}
]

`

const body = built
  .flatMap(({ scenario, blueprints }) =>
    blueprints.map((bp) => {
      const path = scenario.paths.find((p) => fid(scenario.ordinal, p.ordinal, KIND.path, 0, 0) === bp.path.id)
      return emitBlueprint(`${exportKeyFor(scenario, path)}_PATH_FALLBACK`, bp)
    }),
  )
  .join('\n')

const footer = `
/** Path fallbacks per scenario, in picker order. */
export const SAMPLE_BLUEPRINTS_BY_SCENARIO: Record<string, BlueprintData[]> = {
${built
  .map(
    ({ scenario, id, blueprints }) =>
      `  '${id}': [\n${blueprints
        .map((bp) => {
          const path = scenario.paths.find(
            (p) => fid(scenario.ordinal, p.ordinal, KIND.path, 0, 0) === bp.path.id,
          )
          return `    ${exportKeyFor(scenario, path)}_PATH_FALLBACK,`
        })
        .join('\n')}\n  ],`,
  )
  .join('\n')}
}

/**
 * Demo slices over the sample content — the zero-config content for the
 * slices surface (sidebar groups, focus view, presentation). Same shape as
 * the database rows, so the read hooks fall back to them verbatim.
 */
export const SAMPLE_DEMO_SLICES: Slice[] = [
${demoSlices.map(({ slice }) => `  ${JSON.stringify(slice)},`).join('\n')}
]

export const SAMPLE_DEMO_SLIDES: Record<string, Slide[]> = {
${demoSlices
  .map(
    ({ slice, items }) =>
      `  '${slice.id}': [\n${items.map((row) => `    ${JSON.stringify(row)},`).join('\n')}\n  ],`,
  )
  .join('\n')}
}
`

writeFileSync(OUT_PATH, header + body + footer)

// ---------------------------------------------------------------------------
// SQL seed emission (supabase/seed.sql) — same content as the TS fallback.
// ---------------------------------------------------------------------------

const q = (value) => {
  if (value === null || value === undefined) return 'null'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlRows(rows) {
  return rows.map((row) => `  (${row.join(', ')})`).join(',\n')
}

const allBlueprints = built.flatMap(({ scenario, id, steps, blueprints }) =>
  blueprints.map((bp) => ({ scenario, scenarioId: id, steps, bp })),
)

const seedParts = []
seedParts.push(`-- GENERATED by scripts/generate_sample_blueprint.mjs — edit the generator, not this file.
--
-- Sample seed: the META-BLUEPRINT — the service blueprint of this template
-- itself. One '${SERVICE.name}' service, four phases (Discover → Setup
-- → Operate → Maintain, with Maintain.loops_to_phase_id → Operate), six scenarios
-- named for the skill journey, incl. two two-path scenarios shaped for the
-- compare views (each Map path also omits a column the other keeps), and
-- three demo slices (journey / step / lane) over that content. Matches
-- src/data/sampleBlueprint.ts and src/types/nav.ts exactly. Idempotent:
-- replaces the sample service.

begin;

-- Service-replace: drop the prior sample service (cascades to all children).
delete from public.services where id = ${q(SERVICE_ID)};

insert into public.services (id, name, slug, summary, entity_examples) values
  (${q(SERVICE_ID)}, ${q(SERVICE.name)}, ${q(SERVICE.slug)}, ${q(SERVICE.summary)}, ${q(JSON.stringify(SERVICE.entityExamples))}::jsonb);

insert into public.phases (id, service_id, name, summary, position) values
${sqlRows(
  PHASES.map((phase) => [
    q(phaseId(phase.ordinal)),
    q(SERVICE_ID),
    q(phase.name),
    q(phase.summary),
    String(phase.ordinal),
  ]),
)};

-- The service loop: Maintain feeds back into Operate.
${PHASES.filter((phase) => phase.loopsToKey)
  .map(
    (phase) => `update public.phases
set loops_to_phase_id = ${q(phaseId(phaseByKey[phase.loopsToKey].ordinal))}
where id = ${q(phaseId(phase.ordinal))};`,
  )
  .join('\n')}

insert into public.scenarios (id, phase_id, name, summary, position, layout) values
${sqlRows(
  built.map(({ scenario, id }) => [
    q(id),
    q(phaseId(phaseByKey[scenario.phaseKey].ordinal)),
    q(scenario.name),
    q(scenario.summary),
    String(scenario.order),
    q(scenario.layout),
  ]),
)};
`)

seedParts.push(`insert into public.paths (id, scenario_id, name, summary, note, kind) values
${sqlRows(
  allBlueprints.map(({ scenarioId, bp }) => [
    q(bp.path.id),
    q(scenarioId),
    q(bp.path.name),
    q(bp.path.summary),
    q(bp.path.note),
    q(bp.path.kind),
  ]),
)};
`)

seedParts.push(`insert into public.steps (id, scenario_id, name) values
${sqlRows(
  built.flatMap(({ id, steps }) => steps.map((step) => [q(step.id), q(id), q(step.name)])),
)};
`)

seedParts.push(`insert into public.path_steps (path_id, step_id, position) values
${sqlRows(
  allBlueprints.flatMap(({ bp }) =>
    bp.steps.map((step) => [q(bp.path.id), q(step.id), String(step.position)]),
  ),
)};
`)

seedParts.push(`insert into public.lanes (id, path_id, name, lane_role, position) values
${sqlRows(
  allBlueprints.flatMap(({ bp }) =>
    bp.lanes.map((lane) => [
      q(lane.id),
      q(bp.path.id),
      q(lane.name),
      q(lane.role),
      String(lane.position),
    ]),
  ),
)};
`)

seedParts.push(`insert into public.cells (id, path_id, lane_id, step_id, position, content, frame, summary, owner, perceived_owner, function, form, value_props, cell_key) values
${sqlRows(
  allBlueprints.flatMap(({ scenario, bp }) => {
    const laneName = new Map(bp.lanes.map((l) => [l.id, l.name]))
    const stepName = new Map(bp.steps.map((s) => [s.id, s.name]))
    return bp.cells.map((cell) => {
      const slot = cell.position ?? 0
      return [
        q(cell.id),
        q(bp.path.id),
        q(cell.lane_id),
        q(cell.step_id),
        String(slot),
        q(cell.content),
        q(cell.frame),
        q(cell.summary),
        q(cell.owner ?? null),
        q(cell.perceived_owner ?? null),
        q(cell.function ?? null),
        q(cell.form ?? null),
        `${q(JSON.stringify(cell.value_props ?? []))}::jsonb`,
        // Slot siblings carry no key — cell_key is unique and names the slot.
        slot > 0
          ? 'null'
          : q(
              cellKeyFor(
                scenario,
                bp.path.name,
                laneName.get(cell.lane_id),
                stepName.get(cell.step_id),
              ),
            ),
      ]
    })
  }),
)};
`)

// The two relations that replaced `cells.links`. No `id` column: nothing in
// this seed points at one of these rows, and a generated default keeps the
// emitter from minting a second id space nobody reads. Placements first —
// a resource may hang off one.
// The registry first — a placement names an entry in it. It is upserted rather
// than replaced: the registry is the deployment's (ADR 0003), so the service
// delete above no longer cascades to it and wiping it would take another
// service's entries with it. The same stance scripts/generate_seed_sql.py
// takes on the registry it emits.
const registryRows = [...REGISTRY_IDS.entries()].map(([, id]) => {
  const name = allBlueprints
    .flatMap(({ bp }) => bp.cells.flatMap((cell) => cell.touchpoints ?? []))
    .find((placement) => placement.touchpointId === id)?.name
  return [q(id), q(name), q('other'), 'null', 'null', q('import')]
})
if (registryRows.length > 0) {
  seedParts.push(`insert into public.touchpoints (id, name, kind, summary, url, origin) values
${sqlRows(registryRows)}
on conflict (id) do update
  set name = excluded.name,
      kind = excluded.kind,
      summary = excluded.summary,
      url = excluded.url;
`)
}

const touchpointRows = allBlueprints.flatMap(({ bp }) =>
  bp.cells.flatMap((cell) =>
    (cell.touchpoints ?? []).map((placement, index) => [
      q(cell.id),
      q(placement.touchpointId),
      String(index + 1),
      q(placement.summary),
      q(placement.role),
      q('import'),
    ]),
  ),
)
if (touchpointRows.length > 0) {
  seedParts.push(`insert into public.cell_touchpoints (cell_id, touchpoint_id, position, summary, role, origin) values
${sqlRows(touchpointRows)};
`)
}

const resourceRows = allBlueprints.flatMap(({ bp }) =>
  bp.cells.flatMap((cell) =>
    (cell.resources ?? []).map((resource, index) => [
      q(cell.id),
      q(resource.kind ?? 'link'),
      q(resource.name),
      q(resource.url),
      String(index + 1),
      q('import'),
    ]),
  ),
)
if (resourceRows.length > 0) {
  seedParts.push(`insert into public.resources (cell_id, kind, name, url, position, origin) values
${sqlRows(resourceRows)};
`)
}

seedParts.push(`insert into public.cell_dependencies (id, source_cell_id, target_cell_id, kind, name, note) values
${sqlRows(
  allBlueprints.flatMap(({ bp }) =>
    bp.dependencies.map((dependency) => [
      q(dependency.id),
      q(dependency.source_cell_id),
      q(dependency.target_cell_id),
      q(dependency.kind ?? 'leads_to'),
      q(dependency.label ?? null),
      q(dependency.note ?? null),
    ]),
  ),
)};
`)

// Analysis tier: the same demo slices the TS fixture ships, so a seeded
// database and a no-DB session read identical content.
seedParts.push(`insert into public.slices (id, service_id, kind, title, summary, actor, locale, authorship, position) values
${sqlRows(
  demoSlices.map(({ slice }) => [
    q(slice.id),
    q(slice.service_id),
    q(slice.kind),
    q(slice.title),
    q(slice.summary),
    q(slice.actor),
    q(slice.locale),
    q(slice.authorship),
    String(slice.position),
  ]),
)};
`)

const sqlUuidArray = (ids) => `array[${ids.map((id) => `${q(id)}::uuid`).join(', ')}]`
const sqlTextArray = (values) => `array[${values.map((value) => q(value)).join(', ')}]`

seedParts.push(`insert into public.slides (id, slice_id, position, cell_ids, cell_keys, title, caption) values
${sqlRows(
  demoSlices.flatMap(({ items }) =>
    items.map((row) => [
      q(row.id),
      q(row.slice_id),
      String(row.position),
      sqlUuidArray(row.cell_ids),
      sqlTextArray(row.cell_keys),
      q(row.title),
      q(row.caption),
    ]),
  ),
)};

commit;
`)

writeFileSync(SEED_OUT_PATH, seedParts.join('\n'))

console.log(`Wrote ${OUT_PATH}`)
console.log(`Wrote ${SEED_OUT_PATH}`)
for (const t of totals) {
  console.log(`  ${t.label}: ${t.lanes} lanes, ${t.steps} steps, ${t.cells} cells, ${t.dependencies} dependencies`)
}
