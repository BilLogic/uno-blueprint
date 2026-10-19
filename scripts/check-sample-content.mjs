#!/usr/bin/env node
/**
 * Is this still the template's blueprint, or is it yours?
 *
 * Two guards already sweep for content leaking the wrong way.
 * `check:standalone` reads the NAMES of the deployment this template was
 * generalised from; `check:content-coupling` reads that deployment's CONTENT
 * with the name filed off — a cell id copied out of its database, one of its
 * lane actors, one of its scenario titles. Both face the same way: they
 * protect the template from the deployment it came out of. Neither faces an
 * adopter, and until this file nothing in the repository did.
 *
 * This is the mirror. It knows the SAMPLE's own markers — the meta-blueprint,
 * the service blueprint of this template itself — and reports where a deployment
 * is still carrying them.
 *
 *   node scripts/check-sample-content.mjs   (also: npm run check:sample-content)
 *   node scripts/check-sample-content.mjs --all   (every site, not a sample)
 *
 * ── Advisory. It reports and exits 0, deliberately ─────────────────────────
 *
 * Every other check in `docs/engineering/checks.md` goes red on what it
 * finds. This one must not, for two reasons that are both about who is
 * reading it.
 *
 * A FRESH CLONE IS FULL OF SAMPLE CONTENT ON PURPOSE. `supabase/seed.sql` is
 * a real blueprint — of this template — and SETUP.md § 2 asks a new reader to run
 * the app against it before configuring anything. A check that failed here
 * would fail the state the template ships in, which is not a defect to fix but the
 * front door.
 *
 * A HALF-MIGRATED DEPLOYMENT IS A LEGITIMATE STATE. Adoption is a sequence:
 * the seed goes first, the offline fallback registry follows, and there are
 * days in between when both are true at once. Failing a build on the middle
 * of a supported path teaches its owner to stop reading build output, and a
 * guard whose readers have learned to skip it is worse than no guard.
 *
 * So the exit code is 0 whatever it finds, the report says so in its own
 * words, and the only thing this check ever asks of anybody is that they read
 * it. Its CI counterpart does not exist for the same reason: in this
 * repository it would report the sample on every pull request, forever, and
 * correctly.
 *
 * ── The subject ────────────────────────────────────────────────────────────
 *
 * Only the two places a DEPLOYMENT'S CONTENT lives:
 *
 *   - the seed the database is loaded from — whatever `[db.seed]` in
 *     `supabase/config.toml` names, read with `resolveSeedFiles` from
 *     `check-deployment-seed-loads.mjs` so a deployment that renamed or split
 *     its seed is still swept;
 *   - `src/data/`, the board the app renders when no database is configured.
 *     That is the directory `scripts/generate_fallbacks.py --register`
 *     rewrites, and its marker-delimited blocks are where an adopter's own
 *     content lands.
 *
 * Everything else in the tree is out, and this is the whole reason the check
 * can reach zero. `scripts/generate_sample_blueprint.mjs` IS the sample and
 * always will be. `docs/connectors/supabase/database.md` quotes it as an
 * example. `README.md` and `SETUP.md` describe it by name. None of those is
 * a deployment's content, none of them goes away on adoption, and a sweep
 * that reported them would never reach zero on any deployment, ever — which
 * is the failure mode where a report becomes wallpaper.
 *
 * Tests are out, for the reason `check-content-coupling.mjs` states next
 * door: a fixture has to be able to write the value down, and this check's
 * own fixtures have to be able to plant one.
 *
 * ── The markers, and why each is drawn the way it is ───────────────────────
 *
 * 1. THE SAMPLE SERVICE. `Keeping a blueprint true`, and the slug
 *    `keeping-a-blueprint-true` the seed writes beside it. This is the
 *    anchor: no adopter writes that sentence by accident, and one hit is
 *    enough to know whose board is loaded.
 *
 * 2. THE SAMPLE'S OWN ID NAMESPACE. `f0000000-0000-4000-8000-…`, minted by
 *    `fid()` in `scripts/generate_sample_blueprint.mjs`. This is the marker
 *    with the NAME FILED OFF — thirty-two hex digits that say nothing, and
 *    the reason a deployment can look entirely its own in prose and still be
 *    keyed on the template's rows. The constant is imported from
 *    `check-content-coupling.mjs` rather than copied, because the two guards
 *    are one claim read from two sides: the prefix that guard trusts as proof
 *    of origin is the prefix this one reports.
 *
 * 3. THE SAMPLE'S SCENARIO TITLES. The six the generator asserts, matched as
 *    whole phrases. These are the softest of the three and are ranked last on
 *    purpose — see below.
 *
 * ── What is NOT matched, deliberately ──────────────────────────────────────
 *
 * THE PHASE NAMES. `Discover`, `Setup`, `Operate`, `Maintain` are four of the
 * most ordinary words a service blueprint can carry, and any adopter may
 * reach for all four. Matching them would report a deployment for having
 * phases.
 *
 * THE LANE ACTORS. `Blueprint owner`, `Stakeholders`, `Claude in the IDE`.
 * The first two are the vocabulary this template teaches — `GLOSSARY.md` and the
 * skills use them as the generic cast — so an adopter who names a lane
 * `Blueprint owner` has taken the template's ADVICE, not left its content behind.
 *
 * THE PATH NAMES. `A first look`, `From your documents`, `Findings triaged`.
 * Ordinary English describing an ordinary branch. Same failure as the phases.
 *
 * And the boundary this check cannot cross, stated rather than papered over:
 * A DEPLOYMENT THAT BLUEPRINTS A BLUEPRINTING SERVICE. Marker 3 is the one
 * that can cry wolf — a team mapping their own use of this template could
 * honestly write `Map your service` as a scenario title. Two things keep that
 * from being a reason not to ship the check. The report says which marker
 * caught each line, so `the sample's scenario titles` and `the sample's own
 * id namespace` never arrive as one undifferentiated number and a reader can
 * dismiss the first while acting on the second. And the consequence of a
 * false positive here is a sentence somebody reads and disagrees with, not a
 * red build — which is the whole argument for the check being advisory, made
 * from the other end.
 */
import { join, relative, resolve } from 'node:path'
import { SAMPLE_ID_PREFIX } from './check-content-coupling.mjs'
import { resolveSeedFiles } from './check-deployment-seed-loads.mjs'
import { readFileSync } from 'node:fs'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'

/** The tree this script runs in: the working directory — never this file's location; `sweep.mjs` says why. */
const REPO_ROOT = process.cwd()

/**
 * The offline half of a deployment's content — see the header.
 *
 * It is APPLICATION source, so it is read wherever the application is. A
 * deployment that reads the application out of the package has no `src` of its
 * own: resolved against the deployment's root this directory is simply absent,
 * the sweep quietly drops to the seed alone, and the report says how many
 * files it read without saying that half of them were never there.
 */
export const FALLBACK_DIR = 'src/data'

/** The database half, before `[db.seed]` gets a say. */
export const DEFAULT_SEED = 'supabase/seed.sql'

/** The six titles `scripts/generate_sample_blueprint.mjs` asserts. */
export const SAMPLE_SCENARIO_TITLES = [
  'Find the template and see what it does',
  'Map your service',
  'Audit the check roster',
  'Ideate a change (what-if)',
  'Slice for an audience',
  'Keep it current',
]

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The sample's markers, each with the reason it is drawn the way it is.
 *
 * Same shape as `PATTERNS` in `check-content-coupling.mjs`: `find` is applied
 * per line with the `g` flag, and `why` is printed with the report, so a
 * person who has never opened this file learns from the output what the
 * marker is for. Ordered strongest first — the report keeps that order, and
 * the order is the reader's triage.
 */
export const MARKERS = [
  {
    label: 'the sample service',
    find: /Keeping a blueprint true|keeping-a-blueprint-true/gi,
    why:
      'the meta-blueprint’s service name — this template mapped as its own ' +
      'service. Replace it with yours: scripts/generate_seed_sql.py from a ' +
      'validated blueprint file, or let ub:map build one from your documents.',
  },
  {
    label: 'the sample’s own id namespace',
    find: new RegExp(`${escape(SAMPLE_ID_PREFIX)}[0-9a-f]{12}`, 'gi'),
    why:
      'a row id minted by fid() in scripts/generate_sample_blueprint.mjs. ' +
      'It names nothing, so content can read as entirely yours and still be ' +
      'keyed on the template’s rows — a re-import that mints its own ids is what ' +
      'clears it.',
  },
  {
    label: 'the sample’s scenario titles',
    find: new RegExp(SAMPLE_SCENARIO_TITLES.map(escape).join('|'), 'gi'),
    why:
      'the six scenarios of the meta-blueprint, named for this template’s own ' +
      'skill journey. The softest of the three markers: a deployment that ' +
      'blueprints a blueprinting service could write one of these honestly.',
  },
]

/** A fixture is out of subject — see the header. */
const TEST_FILE = /(?:^|\/)(?:tests?)\/|\.test\.[cm]?[jt]sx?$|\.test\.sh$/

/** Binary payloads a content directory might happen to carry. */
const BINARY = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|pdf|zip|mp4)$/i

export function isScanned(path) {
  return !BINARY.test(path) && !TEST_FILE.test(path)
}

/** Whether a swept application path is part of the offline board. */
const isBoard = (path) => path.startsWith(`${FALLBACK_DIR}/`)

/**
 * The offline half, swept: the application, and the board inside it.
 *
 * THE FILTER IS NOT THE SWEEP'S, deliberately, and it is the one place this
 * check does not want the sweep's empty-subject refusal. A `where` that left
 * nothing would refuse here, and a deployment that re-registered its board and
 * has no `src/data` at all is a tree this report can still say something true
 * about from the seed alone — the refusal this check owes its reader is the one
 * below, over BOTH halves. What the sweep does refuse is the case that was
 * always a failure: no application anywhere, which is a `src/data` nobody can
 * resolve rather than one a deployment has replaced.
 */
export function boardFiles(root = REPO_ROOT) {
  const swept = sweep({ subject: 'app', root })
  return { swept, files: swept.files.filter(isBoard) }
}

/**
 * The two content surfaces, as paths relative to `root`, seed first.
 *
 * The seed comes from `[db.seed]` rather than from a hardcoded filename, so a
 * deployment that renamed its seed or split it across several files is swept
 * as it actually loads. When there is no config to read, the default stands.
 */
export function contentFiles(root = REPO_ROOT, board = boardFiles(root).files) {
  const seeds = resolveSeedFiles(join(root, DEFAULT_SEED))
    .map((file) => relative(root, file).split('\\').join('/'))
    .filter((path) => !path.startsWith('..'))
  const seen = new Set()
  const found = [...seeds, ...board].filter((path) => {
    if (seen.has(path) || !isScanned(path)) return false
    seen.add(path)
    return true
  })
  // NEITHER HALF IS OPTIONAL TOGETHER. A deployment may have moved its seed or
  // re-registered its board, and either half alone is a tree this report can
  // still say something true about — but no content at all is a sweep that
  // reports "no sample content" because it read nothing, which is the one
  // answer it must not give quietly.
  if (found.length === 0) {
    throw new Error(
      `no content file under ${root}: neither ${DEFAULT_SEED} nor ` +
        `${FALLBACK_DIR} in the application, so this sweep has no subject`,
    )
  }
  return found
}

/**
 * A value one line carries that could only have come from the template's sample.
 *
 * @typedef {{ line: number, label: string, match: string, why: string, text: string }} Site
 */

/** Every `Site` in one file's source. */
export function sitesIn(source) {
  const found = []
  source.split('\n').forEach((text, index) => {
    for (const { label, find, why } of MARKERS) {
      for (const hit of text.matchAll(find)) {
        found.push({ line: index + 1, label, match: hit[0], why, text: text.trim() })
      }
    }
  })
  return found
}

/**
 * Every site in a deployment's content surfaces, over the files handed in.
 *
 * `files` is `[{ path, text }]` — whatever a deployment serves its blueprint
 * from, already opened. The judgement is the markers and nothing else, so every
 * case this check makes can be written down as a couple of strings; `contentFromTree`
 * below is the only thing that has to know where those strings come from.
 *
 * An empty list is refused for the reason the gatherer refuses its own: a sweep
 * of nothing reports "no sample content" because it read nothing, which is the
 * one answer this report must not give quietly.
 */
export function findings(files) {
  if (files.length === 0) {
    throw new Error('no content file was handed in, so this sweep has no subject')
  }
  const out = []
  for (const { path, text } of files) {
    for (const site of sitesIn(text)) out.push({ path, ...site })
  }
  return out
}

/**
 * The content surfaces of one tree, opened: `[{ path, text }]`, seed first.
 *
 * The board is opened through the `app` sweep, which resolves a `src/data/…`
 * path to the layer that holds it, and a null read is a file that went between
 * the listing and here. The seed is opened as `seed-list.mjs` listed it: that
 * module has already stated each file is there (`RESOLVES_TO_NOTHING` is its
 * refusal when one is not), so a seed file that cannot be read now is not a
 * skip but a failure, and it is left to throw with the path in it. No sweep
 * lists "this tree's seed" — the `deployment-seed` subject is a SIBLING's — and
 * a listing through the commit would have made a static report of a checkout
 * that is not a git repository throw, which this report never did. A bare
 * catch is still the wrong shape either side: it would take a permission the
 * checkout should not have and a directory where a file belongs, and a sweep
 * that skips every file it cannot open reports nothing and looks exactly like
 * a clean tree — the one answer this report must not give quietly.
 */
export function contentFromTree(root = REPO_ROOT, board = boardFiles(root)) {
  const files = contentFiles(root, board.files)
  const out = []
  let read = 0
  for (const path of files) {
    const text = isBoard(path) ? board.swept.read(path) : readFileSync(resolve(root, path), 'utf8')
    if (text === null) continue // removed between the listing and here
    read += 1
    if (text.includes('\0')) continue // binary without a listed extension
    out.push({ path, text })
  }
  // The breadth assertion the sweep's read asks of each of its callers: what
  // skips cannot be allowed to shrink the subject quietly. The listing is
  // refused when it is empty; this is the other end of the same claim, over the
  // files that were actually opened.
  if (read === 0) {
    throw new Error(
      `${files.length} content file(s) were listed under ${root} and none could be read, ` +
        `so this sweep has no subject`,
    )
  }
  return out
}

/**
 * Sites folded to one group per marker and file, in `MARKERS` order.
 *
 * A fresh clone carries the sample's ids on well over a thousand lines, and a
 * report that printed every one of them would be scrolled past rather than
 * read. So the shape of the report is the shape of the answer: which marker,
 * in which file, how many, and enough named sites to go and look.
 */
export function groupSites(sites, files = []) {
  const groups = new Map()
  for (const site of sites) {
    const key = `${site.label}\0${site.path}`
    const group = groups.get(key)
    if (group) group.sites.push(site)
    else groups.set(key, { label: site.label, path: site.path, why: site.why, sites: [site] })
  }
  const byLabel = MARKERS.map((marker) => marker.label)
  const rank = (list, value) => (list.indexOf(value) === -1 ? list.length : list.indexOf(value))
  return [...groups.values()].sort(
    (a, b) =>
      rank(byLabel, a.label) - rank(byLabel, b.label) ||
      rank(files, a.path) - rank(files, b.path) ||
      a.path.localeCompare(b.path),
  )
}

/** Named sites printed per group before the count takes over. */
export const EXAMPLES = 3

/**
 * One group's lines of the report, in the order they are printed.
 *
 * Strings rather than writes: the report is one stdout block, and the verdict
 * prints it. A blank string is the blank line that separated the groups.
 */
function report(groups, { all }) {
  const lines = []
  for (const { label, path, why, sites } of groups) {
    lines.push(`  ${path} — ${sites.length} × ${label}`)
    lines.push(`    ${why}`)
    const shown = all ? sites : sites.slice(0, EXAMPLES)
    for (const site of shown) {
      lines.push(`      ${path}:${site.line} — ${site.match}`)
      lines.push(`        ${site.text.slice(0, 120)}`)
    }
    const rest = sites.length - shown.length
    if (rest > 0) lines.push(`      … and ${rest} more — run with --all to list them`)
    lines.push('')
  }
  return lines
}

/**
 * The verdict: what the sample still holds, as a report rather than a failure.
 *
 * THIS CHECK IS ADVISORY AND STAYS GREEN. A fresh clone ships the sample
 * deliberately, so its sites are not findings — they are the answer, and they
 * go out on stdout as the summary line however many of them there are. The
 * only red left to it is the one every check has: a run that examined no
 * content file at all.
 */
export function judge(argv = process.argv.slice(2)) {
  const all = argv.includes('--all')
  // One sweep of the application for both halves of the answer: the files the
  // report counts and the files it reads are the same files.
  const board = boardFiles()
  const files = contentFiles(REPO_ROOT, board.files)
  const sites = findings(contentFromTree(REPO_ROOT, board))

  const judgement = { what: 'a content file this deployment serves its blueprint from', count: files.length }

  if (sites.length === 0) {
    return {
      ...judgement,
      line:
        `no sample content in the ${files.length} file${files.length === 1 ? '' : 's'} ` +
        'this deployment serves its blueprint from — ' +
        `${MARKERS.length} markers, ${files.join(', ')}`,
    }
  }

  return {
    ...judgement,
    line: [
      'The template’s own sample content — the meta-blueprint, this template mapped as ' +
        'its own service — is still what this deployment serves.\n',
      ...report(groupSites(sites, files), { all }),
      `${sites.length} site${sites.length === 1 ? '' : 's'} across ` +
        `${new Set(sites.map((site) => site.path)).size} of ${files.length} content ` +
        `file${files.length === 1 ? '' : 's'}.\n` +
        '\nThis is a report, and the check exits 0 on purpose. A fresh clone ' +
        'ships the sample deliberately — SETUP.md § 2 asks you to run the app ' +
        'against it before configuring anything — and a half-migrated ' +
        'deployment, seed replaced and fallbacks not yet re-registered, is a ' +
        'legitimate place to be for a while. Nothing here is failing.\n' +
        '\nWhen you do want it gone: SETUP.md § 5 replaces the seed, and ' +
        '`python3 scripts/generate_fallbacks.py --register` rewrites the ' +
        'offline board under src/data/ to match it.',
    ].join('\n'),
  }
}

whenRun(import.meta.url, judge)
