/**
 * The check that keeps the hosting rules true, proven by rule files that break
 * it.
 *
 * A guard seen only passing is not evidence. `netlify.toml` and
 * `public/_headers` pass today and would pass just as quietly if the check had
 * stopped reading them, so every branch is driven from a fixture that violates
 * it — no `/assets/*` rule, the rule below the catch-all, the wrong target,
 * the wrong status, a FORCED rule, a long cache on the shell, a `_redirects`
 * file that reinstates the defect ahead of everything, and a rule file the tree
 * does not have — and the committed files are asserted last, as one case among
 * several rather than as the whole suite.
 *
 * Two cases matter more than the rest, because both are a green check over a
 * broken site. The rule placed BELOW the catch-all, where every word of the fix
 * is present and only the order is wrong. And `force = true`, which reads as
 * emphasis and 404s every asset the site actually has: a non-forced rule is not
 * consulted while the file exists, and that — not `:splat` — is what keeps a
 * present chunk served.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ASSETS,
  CONFIG,
  FILE_REDIRECTS,
  BUILT_HEADERS,
  BUILT_REDIRECTS,
  HEADERS,
  IMMUTABLE,
  LONG_CACHE_SECONDS,
  MISSING_CHUNK,
  baseWrittenFor,
  basePathIn,
  builtFindings,
  cacheFindings,
  fileRedirectFindings,
  hashedCacheFindings,
  headerBlocksIn,
  hostingFindings,
  hostingRules,
  isCacheHeader,
  judge,
  longCacheFindings,
  outlivesADeploy,
  redirectFindings,
  redirectLinesIn,
  redirectsIn,
  tomlHeaderBlocksIn,
} from '../check-hosting-rules.mjs'

// `fileURLToPath` rather than `.pathname`, which leaves a checkout under a
// directory with a space in its name pointing at a path that does not exist.
const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** The missing-chunk rule, as a TOML block. */
const MISSING_CHUNK_BLOCK = [
  '[[redirects]]',
  `  from = "${MISSING_CHUNK.from}"`,
  `  to = "${MISSING_CHUNK.to}"`,
  `  status = ${MISSING_CHUNK.status}`,
].join('\n')

/** The single-page fallback, as a TOML block. */
const CATCH_ALL_BLOCK = [
  '[[redirects]]',
  '  from = "/*"',
  '  to = "/index.html"',
  '  status = 200',
].join('\n')

/** A redirect table that passes: the 404, then the fallback. */
const ORDERED = [
  '[build]',
  '  command = "npm run build"',
  '  publish = "dist"',
  '',
  '# from = "/never" — a commented rule is not a rule.',
  MISSING_CHUNK_BLOCK,
  '',
  CATCH_ALL_BLOCK,
  '',
].join('\n')

/** A `_headers` file that passes: the CSP for everything, the year for hashes. */
const CACHED = [
  '/*',
  "  Content-Security-Policy: default-src 'self'",
  '',
  ASSETS,
  `  Cache-Control: ${IMMUTABLE}`,
  '',
].join('\n')

/* ------------------------------------------------------------- the parsers */

test('the redirect table is read in the order the host reads it', () => {
  const blocks = redirectsIn(ORDERED)
  assert.deepEqual(
    blocks.map((block) => block.from),
    [MISSING_CHUNK.from, '/*'],
  )
  // `publish = "dist"` sits under `[build]`, and a table header closes the
  // block, so no redirect picks it up as a key of its own. The commented
  // `from` above the first block is not a rule either.
  assert.equal(blocks[0].to, MISSING_CHUNK.to)
  assert.equal(blocks[0].status, MISSING_CHUNK.status)
  assert.equal(blocks[0].force, undefined)
})

test('a `_redirects` line is a rule, and `!` on the status is forcing', () => {
  const rules = redirectLinesIn(
    ['# the fallback', '/assets/*  /assets/:splat  404', '/*  /index.html  200!', ''].join('\n'),
  )
  assert.deepEqual(
    rules.map((rule) => [rule.from, rule.to, rule.status, rule.force]),
    [
      [ASSETS, MISSING_CHUNK.to, '404', false],
      ['/*', '/index.html', '200', true],
    ],
  )
})

test('a header belongs to the path it is indented under', () => {
  const blocks = headerBlocksIn(CACHED)
  assert.deepEqual(
    blocks.map((block) => block.path),
    ['/*', ASSETS],
  )
  assert.deepEqual(
    blocks[1].headers.map((header) => header.name),
    ['Cache-Control'],
  )
  // A header before any path belongs to nothing, and a comment is not a path.
  assert.deepEqual(headerBlocksIn('# a note\n  Cache-Control: no-store\n'), [])
})

test('a TOML `[[headers]]` block parses to what a `_headers` block parses to', () => {
  const blocks = tomlHeaderBlocksIn(
    [
      '[[redirects]]',
      '  from = "/*"',
      '',
      '[[headers]]',
      '  for = "/"',
      '  [headers.values]',
      `    Cache-Control = "${IMMUTABLE}"`,
      '',
    ].join('\n'),
  )
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].path, '/')
  assert.deepEqual(
    blocks[0].headers.map((header) => [header.name, header.value]),
    [['Cache-Control', IMMUTABLE]],
  )
})

test('every header name ending in cache-control is a cache directive', () => {
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Netlify-CDN-Cache-Control'])
    assert.equal(isCacheHeader(name), true, name)
  assert.equal(isCacheHeader('Content-Security-Policy'), false)
})

test('a cache outlives a deploy when it is immutable, or a day in any register', () => {
  assert.equal(outlivesADeploy(IMMUTABLE), true)
  assert.equal(outlivesADeploy(`public, max-age=${LONG_CACHE_SECONDS}`), true)
  // `s-maxage` has no second hyphen, so a pattern written for `max-age` walks
  // past the directive a CDN actually reads.
  assert.equal(outlivesADeploy(`public, s-maxage=${LONG_CACHE_SECONDS}`), true)
  assert.equal(outlivesADeploy(`public, max-age=0, s-maxage=${LONG_CACHE_SECONDS}`), true)
  assert.equal(outlivesADeploy(`public, max-age=${LONG_CACHE_SECONDS - 1}`), false)
  assert.equal(outlivesADeploy('no-store'), false)
})

/* -------------------------------------------------------------- the order */

test('the ordered table passes', () => {
  assert.deepEqual(redirectFindings(ORDERED), [])
})

test('a table with no /assets rule fails, and names the file rather than a line', () => {
  const found = redirectFindings([CATCH_ALL_BLOCK, ''].join('\n'))
  assert.equal(found.length, 1)
  // No line number, because there is no site: `:1` would point at `[build]`,
  // where nothing is wrong.
  assert.match(found[0], new RegExp(`^${CONFIG} has no`))
})

test('the rule below the catch-all fails, which is the diff that reads as correct', () => {
  const inverted = [CATCH_ALL_BLOCK, '', MISSING_CHUNK_BLOCK, ''].join('\n')
  const found = redirectFindings(inverted)
  assert.equal(found.length, 1)
  assert.match(found[0], /BELOW the `\/\*` catch-all on line 1/)
})

test('the wrong target and the wrong status each fail on their own line', () => {
  const flattened = redirectFindings(
    [
      '[[redirects]]',
      `  from = "${MISSING_CHUNK.from}"`,
      '  to = "/index.html"',
      '  status = 200',
      '',
      CATCH_ALL_BLOCK,
      '',
    ].join('\n'),
  )
  assert.equal(flattened.length, 2)
  assert.match(flattened[0], /the target has to be/)
  assert.match(flattened[1], /the status has to be 404/)
})

test('a forced rule fails — it 404s every asset the site has', () => {
  // Every word of the fix is here. `force = true` reads as emphasis, and turns
  // a rule that answers for missing files into one that answers for all of
  // them.
  const forced = redirectFindings(
    [MISSING_CHUNK_BLOCK, '  force = true', '', CATCH_ALL_BLOCK, ''].join('\n'),
  )
  assert.equal(forced.length, 1)
  assert.match(forced[0], /forces `\/assets\/\*`/)
  assert.match(forced[0], /not `:splat`/)

  // And on the fallback, where it shadows every asset with the app shell.
  const forcedFallback = redirectFindings(
    [MISSING_CHUNK_BLOCK, '', CATCH_ALL_BLOCK, '  force = true', ''].join('\n'),
  )
  assert.equal(forcedFallback.length, 1)
  assert.match(forcedFallback[0], /forces `\/\*`/)
})

test('a table with no catch-all fails, because there is nothing to precede', () => {
  const found = redirectFindings([MISSING_CHUNK_BLOCK, ''].join('\n'))
  assert.equal(found.length, 1)
  assert.match(found[0], /has no `\/\*` catch-all/)
})

test('a `_redirects` file holds the same order, and says why it decides it', () => {
  assert.deepEqual(
    fileRedirectFindings(['/assets/*  /assets/:splat  404', '/*  /index.html  200', ''].join('\n')),
    [],
  )
  // The shape a repository started from this template reaches for: a
  // single-page fallback, in the file the host reads FIRST, which reinstates
  // the defect above every rule in the configuration file.
  const found = fileRedirectFindings('/*  /index.html  200\n')
  assert.equal(found.length, 1)
  assert.match(found[0], new RegExp(`^${FILE_REDIRECTS.replace('/', '\\/')} has no`))
  assert.match(found[0], new RegExp(`processes ${FILE_REDIRECTS.replace('/', '\\/')} BEFORE`))
})

/* -------------------------------------------------------------- the cache */

test('the cached headers pass', () => {
  assert.deepEqual(cacheFindings(CACHED), [])
})

test('headers with no /assets block fail', () => {
  const found = cacheFindings("/*\n  Content-Security-Policy: default-src 'self'\n")
  assert.equal(found.length, 1)
  assert.match(found[0], new RegExp(`^${HEADERS.replace('/', '\\/')} has no`))
})

test('a short cache on the hashed assets fails', () => {
  const found = cacheFindings([ASSETS, '  Cache-Control: public, max-age=600', ''].join('\n'))
  assert.equal(found.length, 1)
  assert.match(found[0], /rather than/)
})

test('an /assets block with no Cache-Control fails', () => {
  const found = cacheFindings([ASSETS, '  X-Frame-Options: DENY', ''].join('\n'))
  assert.equal(found.length, 1)
  assert.match(found[0], /carries no Cache-Control/)
})

test('a second /assets block fails rather than being skipped', () => {
  // A host reads the first block and a reviewer reads the last, so a
  // `no-store` underneath the year passes every assertion made about the year.
  const found = cacheFindings([CACHED, ASSETS, '  Cache-Control: no-store', ''].join('\n'))
  assert.equal(found.length, 2)
  assert.match(found[0], /a second time/)
  assert.match(found[1], /rather than/)
})

test('a long cache on anything unhashed fails, in either register', () => {
  for (const path of ['/*', '/index.html', '/favicon.svg', '/step-visuals/*']) {
    const found = cacheFindings([CACHED, path, `  Cache-Control: ${IMMUTABLE}`, ''].join('\n'))
    assert.equal(found.length, 1, path)
    assert.match(found[0], /outlives a deploy/)
  }
  // The two a host reads in preference to `Cache-Control`, and the directive a
  // shared cache reads instead of `max-age`.
  for (const header of [
    `CDN-Cache-Control: ${IMMUTABLE}`,
    `Netlify-CDN-Cache-Control: public, max-age=${LONG_CACHE_SECONDS}`,
    `Cache-Control: public, s-maxage=${LONG_CACHE_SECONDS}`,
  ]) {
    const found = cacheFindings([CACHED, '/', `  ${header}`, ''].join('\n'))
    assert.equal(found.length, 1, header)
    assert.match(found[0], /outlives a deploy/)
  }
  // A day is the line: a shorter revalidation policy is nobody's business here.
  assert.deepEqual(
    cacheFindings([CACHED, '/*', '  Cache-Control: public, max-age=300', ''].join('\n')),
    [],
  )
})

test('a long cache written as a TOML header block is the same defect', () => {
  const blocks = tomlHeaderBlocksIn(
    [
      '[[headers]]',
      '  for = "/"',
      '  [headers.values]',
      `    Cache-Control = "${IMMUTABLE}"`,
      '',
    ].join('\n'),
  )
  const found = longCacheFindings(blocks, CONFIG)
  assert.equal(found.length, 1)
  assert.match(found[0], /outlives a deploy/)
  // The hashed cache is NOT required there — `public/_headers` is its one home
  // — so a configuration file with no `[[headers]]` at all is not a gap.
  assert.deepEqual(longCacheFindings([], CONFIG), [])
  assert.equal(hashedCacheFindings(blocks, CONFIG).length, 1)
})

/* -------------------------------------------- the files, and their absence */

/** A walk over a handed-in tree: `files` is membership, `read` is presence. */
const walkOver = (tree) => ({
  files: Object.keys(tree),
  read: (path) => tree[path] ?? null,
})

test('a rule file the tree does not have is a finding, and counts nothing', () => {
  // Not a throw: `verdict.mjs` reserves a throw for a fact about the tree
  // rather than a finding about the subject, and `count` falling to zero is
  // what makes the NO SUBJECT outcome name it.
  const { failures, rules } = hostingFindings(walkOver({}))
  assert.equal(rules, 0)
  assert.equal(failures.length, 2)
  assert.match(failures[0], new RegExp(`^${CONFIG} is not in this tree`))
  assert.match(failures[1], new RegExp(`^${HEADERS.replace('/', '\\/')} is not in this tree`))
})

test('a rule file on disk and out of the commit is a finding too', () => {
  // The gap the subject paragraph claims to close: a host deploys what a git
  // install would ship, so a gitignored `netlify.toml` resolves none of its
  // rules however well it reads here.
  const tree = { [CONFIG]: ORDERED, [HEADERS]: CACHED }
  const { failures } = hostingFindings({
    files: [HEADERS], // the commit carries one of the two
    read: (path) => tree[path] ?? null,
  })
  assert.equal(failures.length, 1)
  assert.match(failures[0], /untracked — a git install would not ship it/)
})

test('a `_redirects` file nobody asked for is read, and the passing tree is silent', () => {
  const clean = hostingFindings(walkOver({ [CONFIG]: ORDERED, [HEADERS]: CACHED }))
  assert.deepEqual(clean.failures, [])
  assert.equal(clean.rules, redirectsIn(ORDERED).length + headerBlocksIn(CACHED).length)

  const withFallback = hostingFindings(
    walkOver({
      [CONFIG]: ORDERED,
      [HEADERS]: CACHED,
      [FILE_REDIRECTS]: '/*  /index.html  200\n',
    }),
  )
  assert.equal(withFallback.failures.length, 1)
  assert.match(withFallback.failures[0], new RegExp(`^${FILE_REDIRECTS.replace('/', '\\/')} has no`))
  assert.equal(withFallback.rules, clean.rules + 1)
})

/* ------------------------------------------------------ under a base path */

// A deployment served from a prefix builds its output under `dist/<prefix>/`,
// so every rule above moves under the prefix with it: the hashed chunks are
// `/demo/assets/*`, and the fallback is `/demo/*`. The build writes those
// rules into `dist/` itself, so a committed table still written for the root
// is held to the root's rules. One that names the prefix is a deployment
// writing them by hand, and is held to the whole prefixed set.

/** The rule files a deployment served from `/demo/` writes. */
const PREFIXED_CONFIG = [
  '[build.environment]',
  '  BASE_PATH = "/demo/"',
  '',
  '[[redirects]]',
  '  from = "/demo/assets/*"',
  '  to = "/demo/assets/:splat"',
  '  status = 404',
  '',
  '[[redirects]]',
  '  from = "/demo/*"',
  '  to = "/demo/index.html"',
  '  status = 200',
  '',
].join('\n')

const PREFIXED_HEADERS = [
  '/*',
  "  Content-Security-Policy: default-src 'self'",
  '',
  '/demo/assets/*',
  `  Cache-Control: ${IMMUTABLE}`,
  '',
].join('\n')

test('the rules move under the base path, and are the root rules at the root', () => {
  assert.deepEqual(hostingRules('/'), {
    assets: ASSETS,
    missingChunk: MISSING_CHUNK,
    catchAll: '/*',
    fallback: { from: '/*', to: '/index.html', status: '200' },
    toPrefix: null,
  })
  assert.deepEqual(hostingRules('/demo/'), {
    assets: '/demo/assets/*',
    missingChunk: { from: '/demo/assets/*', to: '/demo/assets/:splat', status: '404' },
    catchAll: '/demo/*',
    fallback: { from: '/demo/*', to: '/demo/index.html', status: '200' },
    toPrefix: { from: '/', to: '/demo/', status: '301' },
  })
})

test('the base path is read from the environment, then from the build table', () => {
  assert.equal(basePathIn(ORDERED, {}), '/')
  assert.equal(basePathIn(PREFIXED_CONFIG, {}), '/demo/')
  assert.equal(basePathIn(ORDERED, { BASE_PATH: 'demo' }), '/demo/')
  assert.equal(basePathIn(PREFIXED_CONFIG, { BASE_PATH: '/other/' }), '/other/')
  // A commented key is not a setting.
  assert.equal(basePathIn('[build.environment]\n# BASE_PATH = "/demo/"\n', {}), '/')
  // A key under another table is not the build's.
  assert.equal(basePathIn('[context.dev.environment]\n  BASE_PATH = "/demo/"\n', {}), '/')
})

test('a prefixed deployment passes with prefixed rules', () => {
  const walk = walkOver({ [CONFIG]: PREFIXED_CONFIG, [HEADERS]: PREFIXED_HEADERS })
  assert.deepEqual(hostingFindings(walk, '/demo/').failures, [])
})

test('a prefixed deployment with the root rules passes, because the build writes the prefixed ones', () => {
  const said = hostingFindings(walkOver({ [CONFIG]: ORDERED, [HEADERS]: CACHED }), '/demo/')
  assert.deepEqual(said.failures, [])
  assert.equal(said.redirectsAt, '/')
  assert.equal(said.headersAt, '/')
  assert.equal(baseWrittenFor(['/assets/*', '/*'], '/demo/'), '/')
  assert.equal(baseWrittenFor(['/demo/*'], '/demo/'), '/demo/')
  assert.equal(baseWrittenFor(['/demo/*'], '/'), '/')
})

test('under a prefix a `_redirects` of its own is held to what the build accepts', () => {
  // The build writes the 404 and the fallback below this file, so the file
  // need not carry them, and a copy of them is dropped rather than refused.
  const tree = { [CONFIG]: ORDERED, [HEADERS]: CACHED }
  const own = (text) => hostingFindings(walkOver({ ...tree, [FILE_REDIRECTS]: text }), '/demo/')
  assert.deepEqual(own('/old  /demo/  301\n').failures, [])
  assert.deepEqual(
    own('/demo/assets/*  /demo/assets/:splat  404\n/demo/*  /demo/index.html  200\n').failures,
    [],
  )
  // A root catch-all is read before the generated rules and answers for them.
  const fallback = own('/*  /index.html  200\n').failures
  assert.equal(fallback.length, 1)
  assert.match(fallback[0], /^public\/_redirects:1 sends `\/\*`.*the build refuses it/)
})

test('a table that names the prefix is held to the whole prefixed set', () => {
  // Half a hand-written conversion — the fallback moved, the 404 left at the
  // root — is the defect it always was.
  const half = ORDERED.replace('from = "/*"', 'from = "/demo/*"')
  const { failures } = hostingFindings(walkOver({ [CONFIG]: half, [HEADERS]: CACHED }), '/demo/')
  assert.equal(failures.length, 1)
  assert.match(failures[0], /no `\/demo\/assets\/\*` rule/)

  // And headers that name the prefix hold no year on the root's assets.
  const both = `${PREFIXED_HEADERS}\n${ASSETS}\n  Cache-Control: ${IMMUTABLE}\n`
  const cached = hostingFindings(walkOver({ [CONFIG]: PREFIXED_CONFIG, [HEADERS]: both }), '/demo/')
  assert.equal(cached.failures.length, 1)
  assert.match(cached.failures[0], /`\/assets\/\*` is cached as/)
})

test('under a base path a long cache on the root assets is the unhashed-path defect', () => {
  // `/assets/*` names nothing a prefixed site serves, so a year on it is a
  // year on a path with no hash behind it.
  const found = cacheFindings(`${PREFIXED_HEADERS}\n${ASSETS}\n  Cache-Control: ${IMMUTABLE}\n`, HEADERS, '/demo/')
  assert.equal(found.length, 1)
  assert.match(found[0], /`\/assets\/\*` is cached as/)
})

/* ----------------------------------------------------------- and the build */

// `--built` reads what a host is handed rather than what was committed, and
// holds it strictly: under a prefix there is no root reading to fall back on,
// because the build is what was meant to write the prefixed rules.

/** The `_redirects` a build under `/demo/` publishes. */
const BUILT_PREFIXED = [
  '/  /demo/  301',
  '/demo/assets/*  /demo/assets/:splat  404',
  '/demo/*  /demo/index.html  200',
  '',
].join('\n')

const builtOver = (tree) => (path) => tree[path] ?? null

test('a build under a prefix passes with the prefixed rules it wrote', () => {
  const said = builtFindings(
    builtOver({ [BUILT_REDIRECTS]: BUILT_PREFIXED, [BUILT_HEADERS]: PREFIXED_HEADERS }),
    '/demo/',
  )
  assert.deepEqual(said.failures, [])
  assert.equal(said.rules, 3 + 2)
})

test('a build under a prefix with no `_redirects`, or the root rules, fails', () => {
  const missing = builtFindings(builtOver({ [BUILT_HEADERS]: PREFIXED_HEADERS }), '/demo/')
  assert.equal(missing.failures.length, 1)
  assert.match(missing.failures[0], /^dist\/_redirects is not in the build/)

  // Built output is never read at the root's rules on a prefixed build.
  const root = builtFindings(
    builtOver({
      [BUILT_REDIRECTS]: '/assets/*  /assets/:splat  404\n/*  /index.html  200\n',
      [BUILT_HEADERS]: CACHED,
    }),
    '/demo/',
  )
  assert.ok(root.failures.some((one) => /no `\/demo\/assets\/\*` rule/.test(one)))
  assert.ok(root.failures.some((one) => /does not send `\/` on to `\/demo\/`/.test(one)))
  assert.ok(root.failures.some((one) => /no `\/demo\/assets\/\*` block/.test(one)))
})

test('a root build needs no `_redirects`, and still needs its headers', () => {
  assert.deepEqual(builtFindings(builtOver({ [BUILT_HEADERS]: CACHED }), '/').failures, [])
  const bare = builtFindings(builtOver({}), '/')
  assert.equal(bare.rules, 0)
  assert.equal(bare.failures.length, 1)
  assert.match(bare.failures[0], /^dist\/_headers is not in the build/)
})

test('`--built` reads `dist/` off the disk, at the base the environment names', () => {
  const root = mkdtempSync(join(tmpdir(), 'hosting-built-'))
  try {
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, CONFIG), ORDERED)
    writeFileSync(join(root, BUILT_REDIRECTS), BUILT_PREFIXED)
    writeFileSync(join(root, BUILT_HEADERS), PREFIXED_HEADERS)
    const said = judge(['--built'], { BASE_PATH: '/demo/' }, root)
    assert.deepEqual(said.findings, [])
    assert.equal(said.count, 5)
    assert.match(said.line, /in the build for \/demo\//)

    // The same build judged as a root build is the wrong build.
    assert.ok(judge(['--built'], {}, root).findings.length > 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a build under a prefix fails while anything but the host files and the prefix is at the root', () => {
  const tree = { [BUILT_REDIRECTS]: BUILT_PREFIXED, [BUILT_HEADERS]: PREFIXED_HEADERS }
  const clean = ['_headers', '_redirects', 'demo']
  assert.deepEqual(builtFindings(builtOver(tree), '/demo/', clean).failures, [])

  // A root build's shell and chunks, left behind: a host serves them as
  // files, ahead of the redirect that sends `/` on to the prefix.
  const stale = builtFindings(builtOver(tree), '/demo/', [...clean, 'assets', 'index.html'])
  assert.equal(stale.failures.length, 1)
  assert.match(stale.failures[0], /^dist\/ holds `assets`, `index\.html` beside/)

  // At the root the whole of `dist/` is the app, and nothing there is stray.
  const root = builtFindings(builtOver({ [BUILT_HEADERS]: CACHED }), '/', ['assets', 'index.html'])
  assert.deepEqual(root.failures, [])
})

test('`--built` reads the entries at the root of `dist/` off the disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'hosting-built-'))
  try {
    mkdirSync(join(root, 'dist', 'demo'), { recursive: true })
    writeFileSync(join(root, CONFIG), ORDERED)
    writeFileSync(join(root, BUILT_REDIRECTS), BUILT_PREFIXED)
    writeFileSync(join(root, BUILT_HEADERS), PREFIXED_HEADERS)
    assert.deepEqual(judge(['--built'], { BASE_PATH: '/demo/' }, root).findings, [])
    writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html>')
    const said = judge(['--built'], { BASE_PATH: '/demo/' }, root)
    assert.equal(said.findings.length, 1)
    assert.match(said.findings[0], /`index\.html`/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

/* ------------------------------------------------- and the committed files */

test('the committed rule files pass, and the check counted them', () => {
  const said = judge([], {}, ROOT)
  assert.deepEqual(said.findings, [])
  assert.ok(said.count > 0, 'a green line over no rules is the defect this check exists for')
  const config = readFileSync(resolve(ROOT, CONFIG), 'utf8')
  assert.equal(
    said.count,
    redirectsIn(config).length +
      tomlHeaderBlocksIn(config).length +
      headerBlocksIn(readFileSync(resolve(ROOT, HEADERS), 'utf8')).length,
  )
})
