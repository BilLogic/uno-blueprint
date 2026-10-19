#!/usr/bin/env node
/**
 * Does every repository path this package's own prose names still exist?
 *
 * `skills/`, `references/`, `agents/` and `hooks/` are what an installed
 * `ub:map` / `ub:audit` / `ub:slice` / `ub:whatif` reads at runtime. When one
 * of those documents writes `` `src/styles/tokens.css` `` the agent does not
 * treat it as illustration — it opens the file, and a rename three months ago
 * turns a routing instruction into a dead end the agent has to recover from
 * mid-run. Same class as check-dependency-kinds, one level
 * out: a document asserting an interface the tree does not have.
 *
 *   node scripts/check-doc-paths.mjs
 *
 * ── WHAT THIS CHECK IS THE AUTHORITY FOR ──────────────────────────────────
 *
 * This check and the citation guard in `src/citations.ts` ask opposite
 * questions about the same string, and for one tree they would contradict
 * each other outright if the line were not drawn. This one REQUIRES a path
 * the document names to resolve HERE; that one FORBIDS a shared file naming a
 * path its reader does not have. A document under both rules could satisfy
 * neither.
 *
 * THE LINE IS WHICH READER THE DOCUMENT IS WRITTEN FOR, and it has not moved.
 * What moved is the subject, which used to stop short of it.
 *
 *   - A document PACKED WITH THIS PACKAGE, read out of this package's own
 *     installed tree. `skills/`, `references/`, `agents/`, `hooks/` — and
 *     their byte-for-byte copy under `src/lib/agent/skill/`, which
 *     `sync-canvas-skills.mjs` writes — plus `docs/` and the root documents.
 *     An agent that opens the vendored rulebook out of
 *     `node_modules/uno-blueprint/` finds `docs/erd.mmd`
 *     exactly where the sentence said, and finds it whether the sentence was
 *     written in `references/data-model.md` or in `docs/guide/`. This check is
 *     the authority over all of them and holds their paths true.
 *   - A SHARED FILE, read by somebody standing in their OWN repository: the
 *     rest of `src/`, and a script a deployment holds byte-identical. There
 *     the path dangles, the citation guard is the authority, and this check
 *     never looks. The two subjects do not overlap: the citation guard sweeps
 *     `src/` and the named shared scripts, and nothing here is either.
 *
 * `docs/` sat on the first side of that line and was swept by nothing. It is
 * the largest prose tree in the repository, and a dangling path planted in
 * `docs/engineering/checks.md` and in `CONTEXT.md` passed the whole suite.
 * Measured before widening: three failures under `docs/engineering/`, none
 * under `docs/guidelines/`, eleven under the rest of `docs/`, and one in
 * `README.md` — against thirty-four in `CHANGELOG.md`, which is why history is
 * the one thing the wider subject leaves out.
 *
 * The three that motivated it, all landed by ordinary refactors that never
 * looked at the prose:
 *
 *   - `src/lib/mutations/{authoringRpc,sliceMutations,findingMutations}.ts`
 *     in references/adapter-contract.md — that directory has never existed;
 *     two of the three files live flat under `src/lib/`, the third is the
 *     `findings.recordFindings` port on the backend adapters.
 *   - `src/styles/tokens.css` in references/customization.md — the styles
 *     were split into a dozen files, and the BRAND SEAM an adopter is being
 *     sent to edit moved to `src/styles/themes/light.css`.
 *   - `scripts/generate_scale_fixture.mjs` in references/data-model.md —
 *     renamed to `generate_sample_blueprint.mjs`.
 *
 * ── How a token is resolved ───────────────────────────────────────────────
 *
 * Backticked tokens and relative markdown link targets that end in a source
 * or document extension. A token passes on the FIRST of:
 *
 *   1. it exists at the repository root;
 *   2. it exists relative to the document that names it;
 *   3. it is a segment-aligned SUFFIX of a tracked path. This is what lets
 *      prose name `agent/persistence.ts` or a bare `validate_ir.py` without
 *      spelling the whole path every time — the docs do this constantly and
 *      the reader resolves it fine. A suffix that matches nothing is the
 *      failure this check is for;
 *   4. it is in WORKSPACE_ARTIFACTS below — a file an ADOPTER's workspace
 *      has and this tree never will, whatever document names it;
 *   5. it is in ABSENT_BY_DESIGN below, which exempts ONE document naming ONE
 *      token, because the reasons there are about the sentence rather than
 *      about the path.
 *
 * `*` is honoured at every step, including in WORKSPACE_ARTIFACTS — the
 * roster genuinely is a glob (`skills/audit/references/check-*.md`), and
 * `blueprint/*.json` was listed as one and matched only a document that wrote
 * the asterisk down, which left the three documents naming the real file
 * failing against an exemption written for them.
 *
 * BOTH LISTS FAIL CLOSED, the way the references test's NOT_TOOLS does: a file
 * that legitimately cannot exist here is a one-line admission with a reason,
 * not a hole the next stale path slips through. And an entry in either that
 * matches nothing any more is itself a failure, for the reason every list of
 * its kind here gives — an exemption nobody can reach is a hole nobody is
 * watching.
 */
import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

import { repoConfig } from './repo-config.mjs'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/**
 * The application, swept — the second place a claimed path can be.
 *
 * Half of what these documents name is APPLICATION source: `src/lib/…`,
 * `src/styles/…`, the adapter's ports. A deployment that reads the application
 * out of the package has none of that in its own tree or in its commit, so
 * every one of those claims resolved to nothing and the check reported thirty
 * stale paths in documents that had not changed. The sweep answers both halves
 * of that — which files the application has, and where a named one of them
 * actually is — so nothing here joins a path onto a root of its own.
 *
 * Asked once and kept: the listing feeds every claim in every document, and
 * the application is part of the listing, so a tree with no application is
 * refused before any claim is read — which is right, because a document that
 * names `src/…` is measured against nothing there.
 */
let swept = null
const application = () => (swept ??= sweep({ subject: 'app', root: process.cwd() }))

/**
 * This repository's prose, swept — the documents this check reads.
 *
 * The `docs` subject is the same corpus this check described for itself: the
 * root documents but the changelog, and the markdown under the folders
 * `repo-config.mjs` names, less the dated records. So the walk, the missing
 * folder and the file that vanished between the listing and the read are the
 * sweep's, and what is left here is `isPackagedProse` — which of those
 * documents this check holds to the tree — and the judgement on each path.
 */
let prose = null
const documents = () => (prose ??= sweep({ subject: 'docs', root: process.cwd() }))

/**
 * The trees this package packs and its reader reads out of it.
 *
 * The first four are what an installed plugin reads at run time; `docs/` ships
 * beside them and is the largest prose tree here. A root-level document is in
 * subject too — see `isPackagedProse` — and is not a prefix anybody can write.
 */
const PACKAGED_TREES = ['skills/', 'references/', 'agents/', 'hooks/', 'docs/']

/**
 * Documents the wider subject leaves out, each with the reason it is out.
 *
 * HISTORY. `CHANGELOG.md` is a record of what shipped on the day it shipped,
 * and every path in it was true then. Thirty-four are not true now — renamed
 * files, deleted ones, and a dozen fixtures invented to explain a guard — and
 * holding a released entry to today's tree would mean editing what happened.
 *
 * DECISION RECORDS. `repoConfig.datedRecords` is the same rule one tree over,
 * and the `docs` subject of `sweep.mjs` already states it: a decision record keeps the words of
 * the day it was written, and rewriting one is falsifying it. Four of them
 * name a path this tree does not have — a file in the DEPLOYMENT's repository,
 * an instance's override, a workspace artifact and the ADR filename template —
 * and all four are correct sentences about something other than this tree.
 * Read from the config rather than spelled here, so a repository that keeps
 * its records elsewhere is not holding a name this one chose.
 */
const UNHELD_PROSE = ['CHANGELOG.md', ...repoConfig.datedRecords.map((dir) => `${dir}/`)]

/** Whether a tracked path is a document this check holds to the tree. */
export function isPackagedProse(path) {
  if (!path.endsWith('.md')) return false
  if (UNHELD_PROSE.some((prefix) => path === prefix || path.startsWith(prefix))) return false
  // A root-level document — README, GLOSSARY, AGENTS, SETUP, INDEX and the
  // rest — is packed and read from here exactly as the trees below are.
  return !path.includes('/') || PACKAGED_TREES.some((dir) => path.startsWith(dir))
}

/** Extensions that make a backticked token a claim about a file. */
const EXTENSIONS =
  'md|json|py|mjs|cjs|js|ts|tsx|sql|sh|css|html|yaml|yml|toml'

/**
 * Paths named by this package's prose that are created in an ADOPTER's
 * workspace at run time and are therefore never tracked here. Each line is a
 * claim that the file's absence is correct — keep it short, and keep the
 * reason attached. `*` is honoured, so an entry may be the glob the documents
 * actually write around.
 */
export const WORKSPACE_ARTIFACTS = new Map([
  ['blueprint-workspace.json', 'per-workspace state file, written by ub:map'],
  ['blueprint/*.json', 'the adopter\'s IR, authored in their workspace'],
  ['HANDOFF.md', 'generated per workspace from assets/HANDOFF.md.template'],
  ['audit/findings-report.json', 'the no-DB findings ledger, written per run'],
  ['export-all.json', 'the whole-blueprint audit export, written at dispatch'],
  ['sweep_orphans.py', 'declared planned in whatif-playbook §4, with a skip'],
])

/**
 * ONE DOCUMENT naming ONE token, where the sentence is right and the file is
 * correctly absent. Keyed by both, because the reason is about the sentence:
 * `src/styles/tokens.css` is exempt in the document that explains why it is
 * gone and stays a failure in the document that sends a reader to it, which is
 * where this check caught it.
 *
 * @type {ReadonlyArray<{ doc: string, token: string, why: string }>}
 */
export const ABSENT_BY_DESIGN = [
  {
    doc: 'docs/guide/03-the-plugin.md',
    token: 'CLAUDE.md',
    why: 'the file Claude Code creates with its built-in /init, not a file this repository ships',
  },
  {
    doc: 'docs/engineering/checks.md',
    token: 'src/styles/tokens.css',
    why: 'quoted as one of the three stale paths this check was written to catch — it is named BECAUSE it is gone',
  },
  {
    doc: 'docs/engineering/checks.md',
    token: 'scripts/generate_scale_fixture.mjs',
    why: 'the same row, the same three: renamed to generate_sample_blueprint.mjs, and quoted as the rename this check found',
  },
  {
    doc: 'docs/engineering/checks.md',
    token: 'shadcn/tailwind.css',
    why: "a package export specifier, not a repository path: the upstream file check:vendored-css holds the vendored copy to, which resolves out of node_modules",
  },
  {
    doc: 'docs/engineering/checks.md',
    token: 'path.md',
    why: 'a placeholder standing for any pointer target, in the shape a pointer takes: `path.md` § Heading',
  },
  {
    doc: 'docs/agents/blueprint.md',
    token: 'docs/engineering/agent-account-baseline.json',
    why: 'the ratchet baseline repo-config.mjs names, written by generate-agent-account.mjs --record and not recorded in this tree',
  },
  {
    doc: 'docs/agents/domain.md',
    token: 'CONTEXT-MAP.md',
    why: 'named as a conditional — the document says to read it IF it exists and to proceed silently otherwise, which is a fact about a multi-context repository rather than a claim about this one',
  },
  {
    doc: 'docs/connectors/supabase/database.md',
    token: '20260901120000_theirs.sql',
    why: 'an invented filename in the worked example of a fork whose migration history desynced from upstream',
  },
]

/** Whether one document naming one token is excused by the list above. */
export function isAbsentByDesign(doc, token, list = ABSENT_BY_DESIGN) {
  return list.some((entry) => entry.doc === doc && entry.token === token)
}

/**
 * Entries with no site left, which is a hole nobody is watching.
 *
 * `claims` is every unresolved `{ doc, token }` the sweep found, excused ones
 * included — an entry is live exactly while the document still names the
 * token and the tree still lacks it.
 */
export function staleAbsences(claims, list = ABSENT_BY_DESIGN) {
  const live = new Set(claims.map(({ doc, token }) => `${doc}\0${token}`))
  return list.filter((entry) => !live.has(`${entry.doc}\0${entry.token}`))
}

/**
 * Every path a claim can land on: this tree's commit, and the application.
 *
 * The commit is the right universe for the documents themselves and for
 * everything this repository authors. It is the wrong one for the application
 * exactly when the application is not in it — and the two lists are the same
 * list in a tree that keeps its own `src`, which is why this went unnoticed.
 *
 * AN EMPTY LISTING IS A FAILURE, and the `commit` subject is where that
 * refusal lives now: every claim in every document resolves against this, so a
 * listing that came back empty turns the check into one that reports every
 * path stale, and a subject that is only the application turns it into one
 * that cannot see its own documents. The listing is what a COMMIT would carry
 * — tracked, plus untracked and not ignored — for the reason `sweep.mjs`
 * gives: a file written and checked before `git add` is one a reader can
 * already follow.
 */
export function trackedPaths() {
  const listed = sweep({ subject: 'commit', root: process.cwd() }).files
  return [...new Set([...listed, ...application().files])].sort()
}

/**
 * The documents this check holds: `isPackagedProse` over the swept prose.
 *
 * AN EMPTY RESULT IS A FAILURE, and the refusal belongs here rather than one
 * level up. The `docs` subject already refuses a sweep that finds nothing — but
 * the sweep is not what this check reads. A FILTER stands between them, and a filter
 * that matches nothing empties the subject just as completely as a listing
 * that came back empty: the loop runs zero times, no claim is resolved, and
 * the report says `every path named by 0 packaged documents resolves` in the
 * same green as the run over fifty-eight. One renamed folder in
 * `PACKAGED_TREES` does it.
 */
export function surfaceDocs(tracked) {
  const found = tracked.filter(isPackagedProse)
  if (found.length === 0) {
    throw new Error(
      `no markdown at the root or under ${PACKAGED_TREES.join(', ')} in ${process.cwd()}: ` +
        `this check has no subject, which is a failure and not a pass`,
    )
  }
  return found
}

/**
 * Whether a token is one of the adopter-workspace artifacts.
 *
 * The entries are GLOBS, because that is how the documents write: three of
 * them name `blueprint/blueprint.json` and the list carries `blueprint/*.json`.
 * An exact-key lookup matched only a document that wrote the asterisk down, so
 * the exemption sat there excusing nothing while the documents it was written
 * for failed.
 */
function isWorkspaceArtifact(token) {
  if (WORKSPACE_ARTIFACTS.has(token)) return true
  for (const entry of WORKSPACE_ARTIFACTS.keys()) {
    if (entry.includes('*') && asPattern(entry).test(token)) return true
  }
  return false
}

/** A `*` glob as a whole-string regexp; a plain token as itself. */
function asPattern(token) {
  const escaped = token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
  return new RegExp(`^${escaped}$`)
}

function matchesSomePath(pattern, tracked) {
  return tracked.some((path) => pattern.test(path))
}

/**
 * Every file-shaped token a document claims, with its line number.
 * Backticked tokens, plus relative markdown link targets.
 */
export function claimedPaths(source) {
  const backticked = new RegExp(`\`([A-Za-z0-9_./*-]+\\.(?:${EXTENSIONS}))\``, 'g')
  const linked = new RegExp(`\\]\\(([A-Za-z0-9_./*-]+\\.(?:${EXTENSIONS}))[)#]`, 'g')
  const claims = []
  source.split('\n').forEach((line, index) => {
    for (const regexp of [backticked, linked]) {
      regexp.lastIndex = 0
      for (const [, token] of line.matchAll(regexp)) {
        claims.push({ token, line: index + 1 })
      }
    }
  })
  return claims
}

/** Does `token`, as named by a document in `docDir`, resolve to something? */
export function resolves(token, docDir, tracked) {
  if (isWorkspaceArtifact(token)) return true

  const bare = token.replace(/^\//, '')
  const candidates = [bare, normalize(join(docDir, bare))]

  for (const candidate of candidates) {
    if (candidate.includes('*')) continue
    if (existsSync(join(process.cwd(), candidate))) return true
    // An application path is asked of the application, which is where the
    // overlay says the file is — a resident, or the package's copy under it.
    if (/^src(?:\/|$)/.test(candidate) && existsSync(application().locate(candidate))) return true
  }

  // Segment-aligned suffix of a tracked path — how the docs actually write.
  const suffix = asPattern(bare)
  const anywhere = new RegExp(suffix.source.replace(/^\^/, '^(?:.*/)?'))
  if (matchesSomePath(anywhere, tracked)) return true
  for (const candidate of candidates) {
    if (matchesSomePath(asPattern(candidate), tracked)) return true
  }
  return false
}

/**
 * The verdict: every path this package's own documents name, resolved.
 *
 * Pure — it reads the tree, decides, and hands back what it found and how many
 * documents it looked at. Nothing here prints or exits.
 */
export function judge() {
  const tracked = trackedPaths()
  const unresolved = []

  const docs = surfaceDocs(documents().files)
  let read = 0
  for (const doc of docs) {
    const docDir = dirname(doc)
    const source = documents().read(doc)
    if (source === null) continue // listed, then gone before this read
    read += 1
    for (const { token, line } of claimedPaths(source)) {
      if (!resolves(token, docDir, tracked)) unresolved.push({ doc, line, token })
    }
  }
  const failures = unresolved.filter(({ doc, token }) => !isAbsentByDesign(doc, token))
  const stale = staleAbsences(unresolved)

  // `read` is the count the verdict is handed, and it is the breadth assertion
  // the sweep's `read` asks each of its callers for: the skip above is right
  // for a file that went away mid-run and wrong as an account of the whole
  // subject, so a sweep where every read skipped is a sweep that measured
  // nothing — which is the empty-subject rule, decided one place for every
  // check rather than restated here.
  const judgement = {
    what: 'packaged document',
    count: read,
    line:
      `check-doc-paths: every path named by ${read} packaged documents resolves` +
      ` — ${ABSENT_BY_DESIGN.length} absent by design.`,
  }

  // NOTHING READ OUTRANKS BOTH REPORTS BELOW. With no document read, `failures`
  // is empty and `staleAbsences` calls EVERY exemption stale — so the run would
  // go red saying the exemptions match nothing, which is true and is not what
  // happened. Handing the bare judgement over lets the empty-subject rule name
  // the real fact.
  if (read === 0) return judgement

  if (failures.length > 0) {
    return {
      ...judgement,
      opening: `${failures.length} path${failures.length === 1 ? '' : 's'} named by this package's own documents that nothing in the tree matches:\n`,
      findings: failures.map(({ doc, line, token }) => `  ${doc}:${line}  ${token}`),
      closing:
        '\nFix the document to name the file that exists, or — if the path is an' +
        '\nartifact of an adopter workspace rather than of this repository — add it' +
        '\nto WORKSPACE_ARTIFACTS in scripts/check-doc-paths.mjs with its reason.' +
        '\nIf the sentence is right and the absence is correct only THERE, the list' +
        '\nis ABSENT_BY_DESIGN, which takes the document and the token together.' +
        '\n\n  npm run check:doc-paths\n',
    }
  }

  if (stale.length > 0) {
    return {
      ...judgement,
      opening:
        `\n${stale.length} entr${stale.length === 1 ? 'y' : 'ies'} in ABSENT_BY_DESIGN match ` +
        'nothing any more. An exemption nobody can reach is a hole nobody is ' +
        'watching — delete each one:\n',
      findings: stale.map((entry) => `  ${entry.doc} — ${entry.token}`),
    }
  }

  return judgement
}

whenRun(import.meta.url, judge)
