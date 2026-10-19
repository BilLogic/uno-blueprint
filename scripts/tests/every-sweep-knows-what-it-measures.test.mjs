#!/usr/bin/env node
/**
 * No script names an application path without knowing where the application is.
 *
 * A deployment installs this repository as a package and reads the application
 * out of `node_modules/uno-blueprint/src`, laid under whatever
 * residents its own `src` still holds. `src/lib/agent/tools/specs.ts` written by hand is a file that is not
 * there: the check either crashes or sweeps an empty set and reports success —
 * and the second goes on reporting it, because a check that has stopped
 * looking prints the same line as one that looked and found nothing.
 *
 * Two answers are correct and this holds both apart. A script that measures
 * the APPLICATION names the `app` subject of `sweep.mjs`. A script that measures
 * THIS REPOSITORY — a generator writing into its own `src/data`, the vendoring
 * sync, a sweep of what this commit would carry — says so on the
 * repository-only list below, with the reason, so that the next sweep through
 * these files does not re-decide the same handful.
 *
 * WHAT IS NOT CHECKED HERE is whether a resolving script resolves EVERY path
 * it names; a file that names the `app` subject is taken at its word. This
 * guard is for the file that was written without the question being asked at
 * all, which is how all of them got here.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sweep } from '../sweep.mjs'

/**
 * The repository this suite runs over, from its own location.
 *
 * A CHECK may not do this — it is handed a root, because its own location says
 * nothing about which tree it is checking. A test may: it is a fact about this
 * repository, run from this repository, and `process.cwd()` was only ever right
 * because the runner happens to start there.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * THE SCRIPTS THAT MEASURE THIS REPOSITORY rather than the application, and
 * why each one does. A deployment installs this repository as a package and
 * reads the application out of node_modules; a script that measures the
 * application asks the sweep for the `app` subject and is swept where the
 * build resolves it. A script that measures THIS TREE does not, and this is
 * where it says so — once, with the reason, so the next sweep does not
 * re-litigate the same handful of files. What makes a script repository-only
 * is the QUESTION it asks: it writes into this repository's own application
 * (a generator, a vendoring sync — a deployment has nothing to write into),
 * or it asks what THIS COMMIT would carry (the `commit` subject, whether by
 * name or through `scannedFiles`, which is that listing exported — a
 * deployment's commit is the deployment's). The list used to be a module of
 * its own, `repository-only.mjs`; it is the fence's, because the fence is
 * the only reader it ever had.
 */
/**
 * @type {ReadonlyArray<{ script: string, why: string }>}
 */
const REPOSITORY_ONLY = [
  {
    script: 'scripts/generate_sample_blueprint.mjs',
    why:
      'it WRITES src/data/sampleBlueprint.ts and the seed beside it. The ' +
      'sample board is this repository’s own content, generated into its own ' +
      'application; a deployment brings its own board and would be editing ' +
      'its dependency.',
  },
  {
    script: 'scripts/generate_fallbacks.py',
    why:
      'it WRITES src/data/generatedBlueprints.ts, src/data/blueprintFallbacks.ts ' +
      'and src/data/sampleNav.ts. Same reason as the sample generator: the ' +
      'offline board is authored here, into this tree’s application.',
  },
  {
    script: 'scripts/generate-database-types.mjs',
    why:
      'it WRITES src/types/database.ts, generated from this repository’s own ' +
      'portable core and recipe. The types are the template’s statement of ' +
      'its schema; a deployment generates its own file against its own ' +
      'project and holds it to this one with the superset check, it does not ' +
      'regenerate the package’s.',
  },
  {
    script: 'scripts/sync-canvas-skills.mjs',
    why:
      'it VENDORS references/ and skills/ into src/lib/agent/skill/, holding ' +
      'the two byte-identical. Both sides are this repository’s — the source ' +
      'of the copy is this tree’s plugin surface, so the destination is this ' +
      'tree’s application and no other.',
  },
  {
    script: 'scripts/check-standalone.mjs',
    why:
      'its subject is `git ls-files` — what THIS commit would carry — and its ' +
      'question is whether a deployment’s name survived into the template. A ' +
      'deployment running it would be asked whether its own files name it, ' +
      'which they are entitled to.',
  },
  {
    script: 'scripts/tests/a-lane-is-not-a-layer.test.mjs',
    why:
      'its subject is `scannedFiles` — the same `git ls-files` listing the ' +
      'standalone sweep reads — because the retired sense of the word turns up ' +
      'in prose anywhere in the tree, not in the application alone. The one ' +
      'application path it names is an argument to `quotesTheRetiredSense`, not ' +
      'a file it opens.',
  },
  {
    script: 'scripts/tests/the-vendored-copy-is-only-the-copy.test.mjs',
    why:
      'it stages the vendoring sync — this repository’s own plugin surface beside ' +
      'this repository’s own application — and plants a file inside the staged copy. ' +
      'Same subject and same reason as the sync it drives: both sides are this ' +
      'tree’s, and a deployment has neither to stage.',
  },
  {
    script: 'scripts/check-content-coupling.mjs',
    why:
      'the same subject and the same reason as the standalone sweep: `git ' +
      'ls-files` over this commit, asking whether a deployment’s CONTENT — ' +
      'its ids, its cast, its vocabulary — survived into the template.',
  },
]

/** Just the paths. */
const REPOSITORY_ONLY_SCRIPTS = REPOSITORY_ONLY.map((entry) => entry.script)

/**
 * The resolver itself, the two files that describe the arrangement, and a
 * module that only names a path.
 *
 * `sweep.mjs` is the one module that answers where a subject is, and it cannot
 * be asked to import itself. The next two spell the application's root as the
 * PATTERN they look for, or hold the list this test reads. The last holds a
 * path as a constant for others to resolve, and reads nothing itself.
 */
const NOT_A_SWEEP = new Set([
  'scripts/sweep.mjs',
  // This fence: it spells the application's root in the pattern it looks for.
  // `roots-stated.mjs` does the same — `src${suffix}` is the pair it reports on,
  // not a path it reads — and it asks the sweep for the `scripts` subject,
  // which is not a claim about where the application is.
  'scripts/tests/every-sweep-knows-what-it-measures.test.mjs',
  'scripts/roots-stated.mjs',
  // The vendored stylesheet's path, named once and read nowhere here: the
  // check that reads it resolves it through the `app` subject, and the token
  // model reads it through its own source tree.
  'scripts/vendored-css.mjs',
  'scripts/vendored-css.d.mts',
])

/**
 * Test files whose every application path is a FIXTURE — an argument handed to
 * a pure function, or a file written into a throwaway tree — and which fixture
 * it is.
 *
 * THE WHOLE `tests/` TREE WAS SKIPPED BEFORE, on the ground that a fixture is
 * allowed to name anything. That is true and it is not a reason to skip the
 * tree: a test that SWEEPS the application has exactly the defect this fence
 * exists for, and twenty-two of the twenty-six suites that name an application
 * path already resolve through the `app` subject and would have been read here
 * from the first run. Naming the ones that do not is cheaper than meeting the
 * thirty-first file with the defect.
 */
const FIXTURE_ONLY = new Map([
  [
    'scripts/tests/tool-server-checks.test.mjs',
    'the minimal tool-server application and browser-session module it builds in temporary fixture roots, then removes after judging each bundle',
  ],
  [
    'scripts/tests/reference-paths.test.mjs',
    'one path handed to `absences`, to prove it reports a file outside the plugin surface',
  ],
  [
    'scripts/tests/harness-claims.test.mjs',
    'the four assembled directories it asserts the check names, and the component files it plants inside a packaged `src` in a temporary directory of its own and deletes after',
  ],
  [
    'scripts/tests/rpc-arguments.test.mjs',
    'a `src/lib` it creates inside a temporary directory of its own and deletes after',
  ],
  [
    'scripts/tests/sample-content.test.mjs',
    'the marker table and the `isScanned` cases, arguments to the extraction rather than reads of a tree',
  ],
  [
    'scripts/tests/the-overlay-answers-per-path.test.mjs',
    'the two layers it builds inside a temporary directory of its own — a `src` overlay and a packaged `src` beneath it — and deletes after',
  ],
])

/**
 * Every script, including the suites — `FIXTURE_ONLY` names the exceptions.
 *
 * The `scripts` subject of `sweep.mjs`, not a walk of its own: this fence is
 * the last thing in the tree that should be resolving a root and listing a
 * directory by hand. The subject is wider than the walk it replaced — it
 * carries `skills/<skill>/scripts/` as well, where a model runs Python against
 * a live database, and those two files are IN because they pass: neither names
 * a path into the application, and a script that starts naming one there has
 * the same defect as one under `scripts/`. It also carries the `.sh` suites,
 * which the old extension list dropped.
 */
export function scriptsUnder(root) {
  return sweep({ subject: 'scripts', root, what: 'script' }).files
}

/** Comments blanked, newlines kept, so a docblock naming a path is not a use. */
export function withoutComments(code, python = false) {
  let out = ''
  let i = 0
  const blank = (text) => text.replace(/[^\n]/g, ' ')
  while (i < code.length) {
    const char = code[i]
    if (!python && char === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i)
      i = end === -1 ? code.length : end
      continue
    }
    if (!python && char === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end === -1 ? code.length : end + 2
      out += blank(code.slice(i, stop))
      i = stop
      continue
    }
    if (python && char === '#') {
      const end = code.indexOf('\n', i)
      i = end === -1 ? code.length : end
      continue
    }
    if (python && (code.startsWith('"""', i) || code.startsWith("'''", i))) {
      const quote = code.slice(i, i + 3)
      const end = code.indexOf(quote, i + 3)
      const stop = end === -1 ? code.length : end + 3
      out += blank(code.slice(i, stop))
      i = stop
      continue
    }
    out += char
    i += 1
  }
  return out
}

/** Every quoted literal in `code`. */
const LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g

/**
 * A literal that is a path into the application: `src`, `src/…`, `../src`.
 *
 * Whitespace disqualifies it, which is what separates a path from a sentence
 * about one — `'src/types/database.ts has drifted from the schema'` is a
 * failure message, and a check is entitled to name the file it is reporting on.
 */
export function applicationPathsIn(code, python = false) {
  const found = []
  for (const match of withoutComments(code, python).matchAll(LITERAL)) {
    const value = match[2]
    if (/\s/.test(value)) continue
    if (/^(?:\.{1,2}\/)*src(?:\/|$)/.test(value)) found.push(value)
  }
  return found
}

/**
 * Whether a script asks where the application is: by naming the `app` subject
 * of `sweep.mjs`, or by asking it for `appLayers` — the two roots themselves,
 * which is what a file holding the build to them wants. Importing the sweep for
 * another subject is not asking about the application, so the import alone is
 * not taken as the answer.
 */
export function resolvesTheApplication(code) {
  return (
    /from\s+'[^']*\/sweep\.mjs'/.test(code) &&
    (/subject:\s*'app'/.test(code) || /\bappLayers\b/.test(code))
  )
}

test('every script naming an application path either resolves it or says it is this repository’s', () => {
  const unresolved = []
  for (const script of scriptsUnder(REPO_ROOT)) {
    if (NOT_A_SWEEP.has(script) || FIXTURE_ONLY.has(script)) continue
    if (REPOSITORY_ONLY_SCRIPTS.includes(script)) continue
    const code = readFileSync(join(REPO_ROOT, script), 'utf8')
    // `#` is a comment in Python and in shell alike, and the subject carries
    // both; a docblock naming a path is not a use in either.
    const paths = applicationPathsIn(code, /\.(?:py|sh)$/.test(script))
    if (paths.length === 0 || resolvesTheApplication(code)) continue
    unresolved.push(`${script}: ${[...new Set(paths)].join(', ')}`)
  }
  assert.deepEqual(
    unresolved,
    [],
    'These scripts name a path into the application and never ask where the ' +
      'application is. In a deployment that reads it out of the package there ' +
      'is no `src`, so each one either fails there or sweeps nothing and ' +
      'reports success. Resolve through scripts/sweep.mjs, add the ' +
      'script to the repository-only list in this file with the reason it measures this ' +
      'repository alone, or — if it is a suite whose paths are all fixtures — ' +
      `to FIXTURE_ONLY beside this test, with the fixture named:\n${unresolved.join('\n')}`,
  )
})

test('the sweep read scripts, and enough of them to mean something', () => {
  // The shape the assertion above cannot see from the inside: a sweep that
  // came back short reports no unresolved script, which is exactly what a
  // clean tree reports. The sweep itself refuses an empty subject; these
  // assertions are about a subject that is there and is not all of it.
  const scripts = scriptsUnder(REPO_ROOT)
  assert.ok(scripts.length > 20, `only ${scripts.length} scripts in the subject`)
  assert.ok(
    scripts.includes('scripts/roots-stated.mjs'),
    'the sweep did not return scripts/roots-stated.mjs, so it is not reading scripts/',
  )
  assert.ok(
    scripts.includes('scripts/tests/retired-copy.test.mjs'),
    'the sweep did not reach the suites, which is the tree it used to skip whole',
  )
})

test('a fixture exemption names a file that is here, and the fixture it is', () => {
  // Same shape as the repository-only list next door. An exemption naming a
  // file nobody has exempts nothing and says it did; one with no reason is a
  // judgement the next reader has to make again from scratch.
  for (const [script, why] of FIXTURE_ONLY) {
    assert.ok(existsSync(join(REPO_ROOT, script)), `${script} is exempted and is not here`)
    assert.ok(why.length > 40, `${script} is exempted without a reason worth reading`)
  }
})

test('every repository-only script is a file that is here, with a reason', () => {
  // A list that names a file nobody has is a list that exempts nothing and
  // says it did.
  const missing = REPOSITORY_ONLY_SCRIPTS.filter(
    (script) => !existsSync(join(REPO_ROOT, script)),
  )
  assert.deepEqual(missing, [], `repository-only scripts that are not here: ${missing.join(', ')}`)
  assert.ok(REPOSITORY_ONLY.length > 0, 'the repository-only list is empty')
  for (const entry of REPOSITORY_ONLY) {
    assert.ok(
      entry.why && entry.why.length > 40,
      `${entry.script} is exempted without a reason worth reading`,
    )
  }
})

test('a repository-only listing is not a place to park an application sweep', () => {
  // Every entry has to still BE repository-only. The two shapes the list
  // admits are a write into this tree's own application and a `git ls-files`
  // sweep of what this commit would carry; a file doing neither is a file that
  // was put here to quiet the guard.
  const wrong = []
  for (const entry of REPOSITORY_ONLY) {
    const code = readFileSync(join(REPO_ROOT, entry.script), 'utf8')
    const writes = /writeFileSync|copyFileSync|mkdirSync|\bPath\(|\.write_text\(/.test(code)
    // `scannedSweep` IS the `commit` sweep, and `scannedFiles` its listing,
    // exported so a second suite can ask the same question of the same walk; a
    // caller of either is asking what this commit would carry as surely as the
    // shell-out is.
    const listsTheCommit = /ls-files|\bscannedFiles\b|\bscannedSweep\b/.test(code)
    if (!writes && !listsTheCommit) wrong.push(entry.script)
  }
  assert.deepEqual(
    wrong,
    [],
    'a script on the repository-only list neither writes into this tree nor ' +
      `sweeps what this commit would carry:\n${wrong.join('\n')}`,
  )
})
