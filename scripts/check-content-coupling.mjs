#!/usr/bin/env node
/**
 * Can a deployment's CONTENT hide in shared code without spelling its name?
 *
 * `check:standalone` is a word-grep. It sweeps every file a commit would carry
 * for the handful of words that NAME the deployment this template was
 * generalised from — its repository, its bot, a sibling deployment; the list
 * is `PATTERNS` in that script — and it caught eighteen sentences nobody had
 * read in months. What it cannot see is the other half of the same leak:
 * content with the name filed off. A cell id copied out of that deployment's
 * database is thirty-two hex digits and names nothing. `Regular Tutor` is its
 * cast, not its title. `Standard Scheduling` is one of its scenarios. Each of
 * those is as unusable to an adopter as its repository name in a comment, and
 * every one of them walks straight past a grep for that name (#329).
 *
 *   node scripts/check-content-coupling.mjs   (also: npm run check:content-coupling)
 *
 * Exits 1 naming each file, line, the value, and the pattern that caught it.
 *
 * ── The subject ────────────────────────────────────────────────────────────
 *
 * EVERYTHING A COMMIT WOULD CARRY — tracked plus untracked files git would not
 * ignore, the subject `check-standalone.mjs` settled in #182 and the `commit`
 * subject of `sweep.mjs` now answers for every check that wants it. That header
 * holds the listing, the reason the untracked files are in it (#180, #181), the
 * vanished-file rule and the refusal of an empty subject; what is left to each
 * sweep is the narrowing, and the two narrow differently. This one skips the
 * BINARY payloads the word-grep skips plus `svg`, which carries no id, cast or
 * asset path; it skips FIXTURES, which the word-grep does not; and it names the
 * remaining exclusions one at a time below.
 *
 * IT USED TO BE NARROWED BY DIRECTORY, over a list of seven roots — `src/`,
 * `skills/`, `agents/`, `references/`, `evals/`, `scripts/`, `docs/` — that no
 * root-level file can match. So every root document was outside the subject:
 * `README.md`, `GLOSSARY.md`, `SETUP.md`, `INDEX.md`, `CONTRIBUTING.md`,
 * `SECURITY.md`, and `AGENTS.md`, which is the always-loaded tier — the one
 * file every session is handed without choosing. A foreign cell id, a cast
 * role and a deployment touchpoint asset appended to `AGENTS.md` and `SETUP.md`
 * passed in green while the same three lines in `references/data-model.md`
 * failed at once. `hooks/` and the changesets were outside it too. The list was
 * an escape rather than a decision, because nothing beside it said which
 * documents it dropped or why, so it is gone and the exclusions that survive
 * are named one at a time with their reasons.
 *
 * TESTS. A fixture has to be able to write down the value the code under test
 * receives, and the check's own tests have to be able to plant one. This is
 * the same rule `check-database-names.mjs` states for a dead relation: a test
 * naming instance content is a fixture, and a check that flagged its sibling's
 * evidence would be pressure to weaken one of the two. `scripts/tests/` and
 * every `*.test.*` file are out.
 *
 * `supabase/`. The seed there is 1,474 generated ids and the migrations are a
 * historical record — neither is a place anybody hides content, and the seed's
 * generator (`scripts/generate_sample_blueprint.mjs`) IS in subject, which is
 * where a planted id would have to be written by hand. `src/data/sampleBlueprint.ts`
 * is the seed's TypeScript twin and stays IN, because the id rule below passes
 * it for a reason worth asserting: the sample's ids are all in the sample's own
 * namespace, and the day one is not, something was pasted in.
 *
 * `CHANGELOG.md` stays IN, and is the one place the widening found anything:
 * a released entry quotes this file's own header, cast and all. History is not
 * rewritten, so that one site is in ALLOWED below rather than excluded — which
 * leaves the rest of the file swept, and leaves the changesets it is generated
 * FROM in subject, where a pasted value is caught before it is ever released.
 *
 * ── The patterns, and why each is bounded the way it is ────────────────────
 *
 * Each entry is a SHAPE, not a copy of a deployment's data. Enumerating one
 * adopter's scenario catalogue would be a list this template has no business
 * carrying and no way to keep current; what these four catch is the class of
 * value that can only have come from somewhere else.
 *
 * 1. AN OPAQUE ID. A UUID literal that is neither the template sample's own
 *    nor a placeholder somebody typed. Two allowances, and both are checkable
 *    rather than listed:
 *
 *      - the sample namespace, `f0000000-0000-4000-8000-…`, which is what
 *        `fid()` in `scripts/generate_sample_blueprint.mjs` mints. Every id in
 *        the sample blueprint and its seed comes out of that one function, so
 *        the prefix is a proof of origin rather than an exemption.
 *      - a hand-minted placeholder. Drop the version and variant nibbles —
 *        the `4` and the `8` a valid v4 UUID is required to carry, which say
 *        nothing about where it came from — and count what is left. A UUID a
 *        person typed is a few digits repeated (`11111111-1111-4111-8111-…`,
 *        `aaaaaaaa-0000-4000-8000-000000000001`); a UUID copied out of a
 *        database is drawn from all sixteen. Three or fewer distinct digits is
 *        the line, and the gap either side of it is enormous: the deployment's
 *        own ids run five and up.
 *
 * 2. THE CAST OF THE SERVICE THIS TEMPLATE WAS GENERALISED FROM. That
 *    deployment is a tutoring service, and `Regular Tutor` / `Lead Tutor` are
 *    its lane actors. They had reached twelve sites in shared code — nine
 *    comments, and three LIVE strings the canvas agent reads as its tool
 *    contract, where the example an adopter's model is shown is somebody
 *    else's staff. Word-bounded and case-insensitive; `tutorial` is untouched.
 *    `src/content/coverContent.test.ts` already forbids exactly this word over
 *    the cover-page object. This generalises it to the tree, the same way
 *    `check-standalone.mjs` holds the deployment's names for the tree and
 *    that file imports them from it.
 *
 * 3. THAT DEPLOYMENT'S SCHEDULING VOCABULARY. `call-off`, `fill-in request`
 *    and `Standard Scheduling` are its words for a shift somebody drops, the
 *    shift somebody else picks up, and the scenario that covers both. They are
 *    scenario names, so they arrive as illustrative content — "with Standard
 *    Scheduling focused, 176 lane headers…" — and a service-blueprinting
 *    template has no use for any of them.
 *
 * 4. A DEPLOYMENT TOUCHPOINT ASSET. `/touchpoint-logos/<file>` is a path into
 *    a deployment's `public/`. Baked into shared code it ships a broken image
 *    to every adopter, and it names a vendor rather than the deployment, so
 *    nothing else would report it. The template's own fixture,
 *    `example-logo.png` (`scripts/check-seed-loads.mjs`), is the one spelling
 *    that passes — by shape, not by allowlist entry.
 *
 * ── What is NOT matched, deliberately ──────────────────────────────────────
 *
 * `Warm-Up`, `Goal Setting`, `Wrap-Up`, `Help Request`. All of them are that
 * deployment's scenario names AND ordinary English a template may legitimately
 * write. They appear here only in tests, which are out of subject, and a
 * pattern for them would fail on the first honest sentence that used one.
 *
 * `Zoom`, `Slack`, `Notion`, `Figma`, `Google Docs` — the keys of
 * `TOUCHPOINT_COLORS`. Vendor names are product vocabulary, not one
 * deployment's content, for the same reason `check-standalone.mjs` leaves them
 * alone. What is matched is the ASSET PATH, which is a deployment's file.
 *
 * `student`, `session`, `lesson`. Live generic words in a service blueprint —
 * a session is a moment on any board. Matching them would report the domain
 * this template is for.
 *
 * `Front Stage Tech`, `Customer Actions`, `Support Actions`. Standard service-
 * blueprint row names, and a documented compatibility surface here:
 * `LEGACY_NAME_TO_ROLE` in `src/lib/laneRoles.ts` resolves them for content
 * that predates `lane_role`, and `references/lane-roles.md` § Legacy name shim
 * invites a deployment to ADD its own spellings. They are this template's
 * vocabulary, not one adopter's.
 *
 * And the boundary this sweep cannot cross: a role noun that is also ordinary
 * English. `Supervisor` was one deployment's actor, quoted as "the live
 * example" in an audit-check document, and no bounded pattern separates it
 * from the word a template may honestly write. It was fixed by hand rather
 * than by pattern, and the class stays a reviewer's job — what these four
 * catch is everything that CAN be bounded.
 */

import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/** The namespace `fid()` in scripts/generate_sample_blueprint.mjs mints. */
export const SAMPLE_ID_PREFIX = 'f0000000-0000-4000-8000-'

/** The template's own touchpoint-icon fixture; see scripts/check-seed-loads.mjs. */
const TEMPLATE_LOGO = '/touchpoint-logos/example-logo.png'

/**
 * Distinct hex digits in a UUID, ignoring the version and variant nibbles.
 *
 * Those two are structural — a v4 UUID carries `4` and one of `89ab` whatever
 * its origin — so counting them would make every placeholder look two digits
 * richer than the person who typed it made it.
 */
export function idAlphabet(uuid) {
  const hex = uuid.toLowerCase().replace(/-/g, '')
  const meaningful = hex.slice(0, 12) + hex.slice(13, 16) + hex.slice(17)
  return new Set(meaningful).size
}

/** Whether a UUID literal is the template's own content rather than an import. */
export function isTemplateId(uuid) {
  return uuid.toLowerCase().startsWith(SAMPLE_ID_PREFIX) || idAlphabet(uuid) <= 3
}

/**
 * The instance-content shapes, each with the reason it is drawn that way.
 *
 * `find` is applied per line with the `g` flag; `allow` gets the matched text
 * and returns true for a spelling that is this template's own. `why` is
 * printed with the failure, so a person who has never opened this file learns
 * from the report what the pattern is for.
 */
export const PATTERNS = [
  {
    label: 'an opaque id',
    find: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    allow: isTemplateId,
    why:
      'a UUID that is neither in the sample namespace (' +
      SAMPLE_ID_PREFIX +
      '…) nor a placeholder — it was copied out of somebody else’s database. ' +
      'Look the row up by name, or mint the id from the sample generator.',
  },
  {
    label: 'the cast of the deployment this template was generalised from',
    find: /\btutors?\b/gi,
    why:
      'that deployment is a tutoring service and this is its staff. Use the ' +
      'sample blueprint’s own cast — Blueprint owner, Stakeholders — so the ' +
      'example is one an adopter can read.',
  },
  {
    label: 'that deployment’s scheduling vocabulary',
    find: /\b(?:call[-\s]?offs?|fill[-\s]?in requests?|standard scheduling)\b/gi,
    why:
      'its words for a dropped shift, the cover for one, and the scenario ' +
      'holding both. Use a scenario from the sample blueprint — Map your ' +
      'service, Audit the check roster.',
  },
  {
    label: 'a deployment touchpoint asset',
    find: /\/touchpoint-logos\/[\w.-]+/g,
    allow: (path) => path === TEMPLATE_LOGO,
    why:
      'a path into a deployment’s public/ that no adopter has the file for. ' +
      `The template ships ${TEMPLATE_LOGO}.`,
  },
]

/**
 * Paths swept for none of it, and the reason each would otherwise cry wolf.
 *
 * The same two kinds `check-standalone.mjs` lists. MIRRORED content:
 * `src/lib/agent/skill/` is a byte-for-byte vendored copy of `skills/` +
 * `references/`, held identical by `sync-canvas-skills.mjs --check` in
 * `npm test`, so a violation cannot hide there — fix the source and both are
 * clean. And FILES THAT MUST CARRY THE VALUES to do their job.
 */
export const EXCLUDED = [
  'src/lib/agent/skill/', // mirror of skills/ + references/
  'scripts/check-content-coupling.mjs', // this file
  // A generated seed of 1,474 sample ids and a historical migration series.
  // Neither is a place anybody hides content, and the hand-written source of
  // both — `scripts/generate_sample_blueprint.mjs` — is in subject. Named here
  // rather than left to fall outside a root list, so the decision is readable.
  'supabase/',
]

/** A fixture is out of subject — see the header. */
const TEST_FILE = /(?:^|\/)(?:tests?)\/|\.test\.[cm]?[jt]sx?$|\.test\.sh$|_test\.py$|(?:^|\/)test_[^/]*\.py$/

/** Binary payloads git happens to track. Nothing to read a line out of. */
const BINARY = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|pdf|zip|mp4)$/i

export function isScanned(path) {
  if (BINARY.test(path) || TEST_FILE.test(path)) return false
  return !EXCLUDED.some((prefix) => path.startsWith(prefix))
}

/**
 * The sweep this check reads: the `commit` subject of `sweep.mjs`, narrowed by
 * `isScanned`. The sweep refuses an empty result, which either step between
 * `git ls-files` and this subject can produce — the listing, and a predicate
 * that can reject every path in it — and either used to print
 * `no deployment content in 0 shared files` in the usual green.
 */
export function scannedSweep(root = process.cwd()) {
  return sweep({
    subject: 'commit',
    root,
    where: isScanned,
    what: 'shared file a commit would carry',
  })
}

/** Every file the sweep reads: what a commit would carry, minus the exclusions. */
export function scannedFiles(root = process.cwd()) {
  return scannedSweep(root).files
}

/**
 * A value a line carries that a deployment could only have supplied.
 *
 * @typedef {{ line: number, label: string, match: string, why: string, text: string }} Coupling
 */

/** Every `Coupling` in one file's source. */
export function couplingsIn(source) {
  const found = []
  source.split('\n').forEach((text, index) => {
    for (const { label, find, allow, why } of PATTERNS) {
      for (const hit of text.matchAll(find)) {
        if (allow?.(hit[0])) continue
        found.push({ line: index + 1, label, match: hit[0], why, text: text.trim() })
      }
    }
  })
  return found
}

/**
 * Values allowed to stay, each with the decision that keeps them there.
 *
 * Same two rules as every other list of its kind here: an entry names one
 * site exactly, and an entry that matches nothing any more is itself a
 * failure — a stale exemption is a hole nobody is watching. Identified by
 * FILE AND VALUE rather than by line, because a line number churns with every
 * edit above it and a churning identifier is one people stop reading.
 *
 * @type {ReadonlyArray<{ file: string, match: string, why: string }>}
 */
export const ALLOWED = [
  {
    file: 'CHANGELOG.md',
    match: 'Tutor',
    why:
      'a released changelog entry quoting this check’s own header — the ' +
      'sentence that explains what `Regular Tutor` is. A changelog is history ' +
      'and rewriting a released entry falsifies it; the changesets it is ' +
      'generated from are in subject, so a value pasted into a new one fails ' +
      'before it can reach this file.',
  },
  {
    file: 'scripts/generate_seed_sql.py',
    match: '37310bd6-53e3-578e-9879-ed5cc6845c87',
    why:
      'the seed generator’s UUIDv5 namespace. Every id a generated seed has ' +
      'ever minted derives from it, in this template and in every deployment ' +
      'that seeds through it, so it is a constant rather than a lookup: a ' +
      'different value re-keys every row on the next seed.',
  },
]

/** Whether one site is one of the allowlist's. */
export function isAllowed(path, match, allowed = ALLOWED) {
  return allowed.some((entry) => entry.file === path && entry.match === match)
}

/**
 * Every coupling in the tree, allowlisted sites removed. `walk` is the sweep to
 * read, so a caller that has already asked for one reads exactly the subject it
 * counted; a path the listing named and the tree no longer has comes back null
 * from the sweep's `read` and is skipped, and every other read failure throws.
 */
export function findings(allowed = ALLOWED, walk = scannedSweep()) {
  const out = []
  for (const path of walk.files) {
    const source = walk.read(path)
    if (source === null) continue // listed, then gone before this read
    if (source.includes('\0')) continue // binary without a listed extension
    for (const hit of couplingsIn(source)) {
      if (isAllowed(path, hit.match, allowed)) continue
      out.push({ path, ...hit })
    }
  }
  return out
}

/** Allowlist entries the tree no longer has a site for, over a handed-in sweep. */
export function staleAllowances(walk = scannedSweep(), allowed = ALLOWED) {
  const live = new Set()
  for (const path of walk.files) {
    const source = walk.read(path)
    if (source === null) continue // listed, then gone before this read
    for (const hit of couplingsIn(source)) live.add(`${path}\0${hit.match}`)
  }
  return allowed.filter((entry) => !live.has(`${entry.file}\0${entry.match}`))
}

/**
 * The verdict: every shared file a commit would carry, read for a deployment's
 * content, and the allowlist read back for entries nothing reaches.
 *
 * Pure — it sweeps, decides, and hands back what it found. Nothing here prints
 * or exits.
 */
export function judge() {
  const walk = scannedSweep()
  const problems = findings(ALLOWED, walk)
  const stale = staleAllowances(walk)

  // Both halves report, so both are findings in one list rather than a frame
  // around one of them: a run can carry a coupling and a stale allowance at
  // once, and the reader is owed the two reports in the order they were
  // written.
  const said = []
  if (problems.length > 0) {
    said.push(
      'This package claims to stand alone. `check:standalone` reads names; ' +
        'these lines carry a deployment’s CONTENT, which names nothing:\n',
    )
    for (const { path, line, label, match, why, text } of problems) {
      said.push(`  ${path}:${line} — ${match} · ${label}`)
      said.push(`    ${text.slice(0, 120)}`)
      said.push(`    ${why}`)
    }
    said.push(
      `\n${problems.length} coupling${problems.length === 1 ? '' : 's'}. ` +
        'Replace each with the template sample’s own content, or look the ' +
        'value up rather than writing it down. If a site is load-bearing and ' +
        'cannot move without a design decision, add it to ALLOWED in ' +
        'scripts/check-content-coupling.mjs with that decision as its `why`.',
    )
  }

  if (stale.length > 0) {
    said.push(
      `\n${stale.length} entr${stale.length === 1 ? 'y' : 'ies'} in ALLOWED match ` +
        'nothing any more. An exemption nobody can reach is a hole nobody is ' +
        'watching — delete each one:\n',
    )
    for (const entry of stale) said.push(`  ${entry.file} — ${entry.match}`)
  }

  return {
    what: 'a shared file a commit would carry',
    count: walk.files.length,
    findings: said,
    line:
      `no deployment content in ${walk.files.length} shared files a commit would carry` +
      ` — ${PATTERNS.length} patterns, ${ALLOWED.length} allowed`,
  }
}

whenRun(import.meta.url, judge)
