/**
 * This repository's own numbers and paths, read by the meta-checks.
 *
 * The router, glossary, sweep and docs-index scripts are one mechanism in
 * every repository that carries them — this template and each deployment of
 * it — but each repository has its own router, its own docs tree and its own
 * routing. Those values live here and nowhere else, so the scripts that read
 * them can be the same file everywhere. It is the seam the app draws with
 * `DeploymentConfig`: the mechanism is shared, the values are the
 * installation's.
 *
 * NEVER SHARED. Every repository writes its own copy of this file, and no
 * sync, import or merge carries it across. A value copied from another
 * repository describes that repository's files: a budget set against a
 * different router passes while measuring nothing.
 *
 * Every field is required. `DeploymentConfig` is a sparse overlay on the
 * template's defaults; this file has no defaults to fall back to, because a
 * check with no number of its own has nothing to hold the repository to.
 */

/** The generated interface-to-schema map. Named once, read twice below. */
const INTERFACE_MAP = 'references/interface-schema-map.md'

export const repoConfig = {
  router: {
    /**
     * The always-loaded tier's ceiling, in characters (`check-router-budget.mjs`).
     * Set against this router, whose skill routing table carries four rows.
     * Lower it whenever the tier lands well under.
     */
    budget: 3700,
    /** How far under `budget` the tier may sit before the budget is stale. */
    slack: 740,
  },

  /**
   * The skill and agent descriptions' ceiling, in characters
   * (`check-router-budget.mjs`): every description a plugin host puts in
   * front of a session on every turn, counted apart from the router. Set
   * against five skills (`ub:init` and its four moves) and five agents.
   * Lower it whenever they land well under.
   */
  descriptions: {
    budget: 3500,
    /** How far under `budget` the descriptions may sit before the budget is stale. */
    slack: 500,
  },

  /**
   * The prohibition-token baseline across the router and the descriptions
   * (`check-negation-ratchet.mjs`): the files it was measured over — the
   * router plus one per description — and the count it scored.
   */
  prohibitions: { files: 11, tokens: 0 },

  /**
   * Folders whose markdown every prose sweep reads, beside the root docs
   * (the sweep's `docs` subject, `sweep.mjs`). A folder named here that this
   * tree does not have is swept as empty and announced as unverified on every
   * run, so name only folders that exist. The skill and agent description
   * census finds its files on its own and reads nothing from this list.
   */
  sweptDirs: ['docs', 'references', 'skills', 'agents'],

  /**
   * Trees whose markdown keeps the words of the day it was written, so no
   * sweep rewrites it (the sweep's `docs` subject, `sweep.mjs`). Decision records are the whole of
   * it here: rewriting one is falsifying it. Prefixes, matched against the
   * repo-relative path.
   */
  datedRecords: ['docs/adr'],

  /**
   * The agent-account document and the ratchet baseline beside it
   * (`generate-agent-account.mjs`). The generator is one mechanism in every
   * repository that carries it; WHERE it writes is each repository's own, and
   * the two trees do not agree — this one keeps the baseline under
   * `docs/engineering/`, a deployment may keep it wherever its generated
   * reference material lives.
   */
  agentAccount: {
    document: 'docs/agents/blueprint.md',
    baseline: 'docs/engineering/agent-account-baseline.json',
  },

  /**
   * The composition documents, and which of this repository's own trees they
   * claim beside the application (`check-harness-claims.mjs`).
   *
   * `documents` is the folder they live in. The check reads this repository's
   * folder and, in a deployment, the installed package's underneath it — the
   * overlay rule the application already resolves per path, resolved here per
   * document — so the name is stated once per repository rather than spelled
   * in a script both repositories run.
   *
   * `claimed` is the trees of assembled files this repository holds that are
   * NOT the application's. The package claims what the package ships, so here
   * the list is empty and the application is the whole subject; a deployment
   * that assembles files of its own names those trees here, and each of their
   * files needs a claim in a document of its own.
   */
  composition: {
    documents: 'docs/guidelines/composition',
    claimed: [],
  },

  /**
   * Where a glossary row that names a column belongs instead
   * (`check-glossary-only.mjs`), and a routing target below.
   */
  interfaceMap: INTERFACE_MAP,

  /** The authored half of the generated `INDEX.md` (`generate-docs-index.mjs`). */
  docsIndex: {
    /**
     * A row per task someone arrives holding, led by the noun the task is
     * about so a scanning reader matches on its first word. Each target is a
     * backticked repo-relative path, which makes the row a pointer in the
     * grammar `check-pointers.mjs` reads. Targets include the plugin
     * contract's own folders: an agent's task is far more often "which rule
     * applies" than "which document".
     *
     * Three decision records have rows of their own, because they answer the
     * rename and move questions a contributor asks before acting. Every other
     * record is reached through the decision-record overview.
     */
    routing: [
      ['Purpose — what this is, and why I would want it', '`README.md`'],
      ['Vocabulary — what lane, path, slice, dependency or finding means', '`GLOSSARY.md`'],
      ['Panel labels — what each one names in the schema', `\`${INTERFACE_MAP}\``],
      ['Setup — getting it running on my machine', '`SETUP.md`'],
      ['Guide — the whole thing, start to finish', '`docs/guide/`'],
      ['Blueprint model — what I am looking at in a blueprint', '`docs/guide/01-the-blueprint-model.md`'],
      ['Practice — what I do with a blueprint', '`docs/guide/02-using-it-in-practice.md`'],
      ['Plugin machinery — how it works, and what lands on my disk', '`docs/guide/03-the-plugin.md`'],
      ['Operations — who may do what once it is deployed', '`docs/guide/04-operations.md`'],
      ['Customizing a deployment — theming, config fields, agent search, bundling', '`docs/guide/05-customizing-a-deployment.md`'],
      ['Data model — the tables, columns, enums and import order', '`references/data-model.md`'],
      ['Blueprint file — what one has to contain', '`references/ir-schema.json`'],
      ['Adapter contract — what an import, its target and its secrets require', '`references/adapter-contract.md`'],
      ['Backend contract — what a store answers to serve this app live, Supabase or any other', '`docs/connectors/backend-contract.md` + `supabase/generated/portable-core.generated.sql`'],
      ['Canvas agent tools — which it may call, and which of them write', '`references/canvas-adapter.md`'],
      ['Lane roles and names — what a role does to rendering; what to call a lane', '`references/lane-roles.md` + `references/lane-vocabulary.md`'],
      ['Audit checks — writing or changing one', '`references/audit-playbook.md`'],
      ['Upgrades — taking a new template release into a workspace', '`references/customization.md`'],
      ['Database — connecting the app, what a column means, row-level security', '`docs/connectors/supabase/database.md`'],
      ["Agent account — generating a deployment's from a connected database", '`docs/agents/blueprint.md`'],
      ['Migration history — desynced from upstream', '`docs/connectors/supabase/database.md`'],
      ['CI checks — what a red one defends', '`docs/engineering/checks.md`'],
      ['Releases — cutting one', '`docs/engineering/releasing.md`'],
      ['Renames — whether one is a breaking change', '`docs/adr/0001-two-contract-tiers-and-a-frozen-identifier-layer.md`'],
      ['File moves under references/ or skills/', '`docs/adr/0004-reference-paths-are-a-published-interface.md`'],
      ['Document moves out of this package, for a document a deployment reads', '`docs/adr/0023-a-document-a-deployment-resolves-is-a-published-path.md`'],
      ['Decisions — why it is built this way, every record by number', '`docs/adr/overview.md`'],
      ['Assembled surfaces — which document owns one, and who writes its claim', '`docs/guidelines/composition/overview.md`'],
      ['Documentation — adding or moving a document', '`docs/guidelines/documentation.md`'],
      ['Contributions — what a commit and a pull request carry', '`docs/guidelines/contributing.md`'],
      ['Work in flight — the GitHub issues queue', '`docs/agents/issue-tracker.md`'],
    ],

    /**
     * The `## Reading paths` list, as the markdown it renders to: one bullet
     * per kind of reader, in the order that reader should go.
     */
    readingPaths: `- **Adopting the plugin** — README → SETUP → guide/03, then \`references/\` as
  the tasks come up.
- **Deploying the template** — SETUP → \`docs/connectors/supabase/database.md\` →
  guide/04 → guide/05.
- **Bringing your own backend** — \`docs/connectors/backend-contract.md\` →
  \`supabase/generated/portable-core.generated.sql\` → guide/04.
- **Working on this repository** — SETUP → \`docs/guidelines/contributing.md\` →
  \`docs/engineering/checks.md\`, with \`docs/adr/\` before anything that renames.
- **Agent sessions** — \`AGENTS.md\` (auto-loaded) → this table, and \`GLOSSARY.md\`
  when the task writes a domain word.`,
  },
}
