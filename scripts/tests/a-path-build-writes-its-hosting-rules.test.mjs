/**
 * A build served from a path writes the hosting rules the path needs.
 *
 * `vite.config.ts` writes them: under a prefix it adds the root redirect, the
 * `/<prefix>/assets/*` 404 and the `/<prefix>/*` fallback to `dist/_redirects`
 * and moves the hashed cache in `dist/_headers` under the prefix, so a host
 * given nothing but `BASE_PATH` serves the app there. The config cannot import
 * the hosting check — it is bundled in isolation, and a deployment holds it
 * byte-identical with no `scripts/` beside it — so it carries its own copy of
 * the rules, and this suite is what makes the two copies one fact: the text
 * the build writes is read back through the check's own parsers and judged by
 * the check's own findings, both ways round. The rule by which a repository's
 * own `_redirects` line is refused is held the same way: the build refuses a
 * line exactly when the check finds it.
 *
 * The render walk previews with `vite preview`, which reads no `_redirects`,
 * so the deep links are proven here instead: the written rules are resolved
 * the way a host resolves them — first match wins, and a non-forced rule
 * never shadows a file that is there.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  IMMUTABLE,
  answersForTheApp as checkAnswers,
  cacheFindings,
  fileRedirectFindings,
  headerBlocksIn,
  hostingRules,
  ownRedirectFindings,
  redirectLinesIn,
} from '../check-hosting-rules.mjs'
import { answersForTheApp as buildAnswers, hostRulesUnder } from '../../vite.config.ts'

const BASE = '/demo/'
const COMMITTED_HEADERS = readFileSync(
  fileURLToPath(new URL('../../public/_headers', import.meta.url)),
  'utf8',
)

const rulesOf = (text) =>
  redirectLinesIn(text).map(({ from, to, status, force }) => ({ from, to, status, force }))

/** What the build writes under `BASE` over a repository's own files. */
const write = (own = {}) => hostRulesUnder(BASE, { redirects: null, headers: null, ...own })

/* ------------------------------------------------- the rules, one fact twice */

test('the build writes the check’s rules, in the check’s order, none forced', () => {
  const { toPrefix, missingChunk, fallback } = hostingRules(BASE)
  const { redirects } = write()
  assert.deepEqual(
    rulesOf(redirects),
    [toPrefix, missingChunk, fallback].map((rule) => ({ ...rule, force: false })),
  )
  assert.deepEqual(fileRedirectFindings(redirects, 'dist/_redirects', BASE), [])

  // And the other way round: every rule the check names under a prefix is one
  // the build writes, so a rule added to the check alone goes red here rather
  // than in CI's read of a real build.
  const named = Object.values(hostingRules(BASE)).filter((rule) => rule?.from && rule?.to)
  for (const rule of named) {
    assert.ok(
      rulesOf(redirects).some(
        (one) => one.from === rule.from && one.to === rule.to && one.status === rule.status,
      ),
      `the build writes ${rule.from}`,
    )
  }
})

test('the committed headers come out with the hashed cache under the prefix', () => {
  const { headers } = write({ headers: COMMITTED_HEADERS })
  assert.deepEqual(cacheFindings(headers, 'dist/_headers', BASE), [])
  // Moved, not added beside: the root's `/assets/*` names nothing a prefixed
  // site serves, and a year on it is a year on a path with no hash behind it.
  assert.deepEqual(
    headerBlocksIn(headers).map((block) => block.path),
    headerBlocksIn(COMMITTED_HEADERS).map((block) =>
      block.path === '/assets/*' ? '/demo/assets/*' : block.path,
    ),
  )
})

test('with no headers of its own, or empty ones, the build writes the hashed cache alone', () => {
  for (const headers of [null, '', '\n\n']) {
    const written = write({ headers }).headers
    assert.deepEqual(cacheFindings(written, 'dist/_headers', BASE), [])
    assert.equal(written, `/demo/assets/*\n  Cache-Control: ${IMMUTABLE}\n`)
  }
})

test('headers already written for the prefix are left as they are', () => {
  const written = `/*\n  X-Frame-Options: DENY\n\n/demo/assets/*\n  Cache-Control: ${IMMUTABLE}\n`
  assert.equal(write({ headers: written }).headers, written)
})

/* ---------------------------------------------- a repository's own redirects */

test('a repository’s own rules are kept above the generated ones, where they still apply', () => {
  const own = '# a proxy\n/demo/api/*  https://api.example.org/:splat  200\n/old  /demo/  301\n'
  const { redirects } = write({ redirects: own })
  assert.ok(redirects.startsWith(own), 'the repository’s file is kept verbatim, first')
  assert.deepEqual(
    rulesOf(redirects).map((rule) => rule.from),
    ['/demo/api/*', '/old', '/', '/demo/assets/*', '/demo/*'],
  )
  assert.deepEqual(fileRedirectFindings(redirects, 'dist/_redirects', BASE), [])
})

test('a repository rule that answers for the app refuses the build in one line', () => {
  const answering = [
    '/*',
    '/',
    '/demo/',
    '/demo',
    '/demo/*',
    '/demo/assets/*',
    '/demo/:slug',
    '/:section/*',
  ]
  for (const from of answering) {
    assert.throws(
      () => write({ redirects: `/keep  /x  301\n${from}  /index.html  200\n` }),
      (error) => {
        assert.match(error.message, /^public\/_redirects line 2 /)
        assert.ok(error.message.includes(from), `names ${from}`)
        assert.ok(!error.message.includes('\n'), 'one line')
        return true
      },
      `${from} refused`,
    )
  }
})

test('a line that states a generated rule exactly is dropped, and the rest kept', () => {
  // A repository that already wrote the prefixed set into its own file: the
  // build writes each rule once, below whatever else the file says.
  const own = [
    '/old  /demo/  301',
    '/  /demo/  301',
    '/demo/assets/*  /demo/assets/:splat  404',
    '/demo/*  /demo/index.html  200',
    '',
  ].join('\n')
  const { redirects } = write({ redirects: own })
  assert.deepEqual(
    rulesOf(redirects).map((rule) => rule.from),
    ['/old', '/', '/demo/assets/*', '/demo/*'],
  )
  assert.deepEqual(fileRedirectFindings(redirects, 'dist/_redirects', BASE), [])

  // The same rule forced is not the same rule.
  assert.throws(() => write({ redirects: '/demo/*  /demo/index.html  200!\n' }), /line 1 sends/)
})

test('what the build wrote, read back as its own, comes out unchanged', () => {
  // A second build under a prefix finds the first one's files at the root of
  // `dist/` unless they are cleared; written once, they are the same file.
  const first = write({ redirects: '/old  /demo/  301\n', headers: COMMITTED_HEADERS })
  assert.deepEqual(write(first), first)
  const bare = write()
  assert.deepEqual(write(bare), bare)
})

test('the build and the check agree on which own rules a prefix refuses', () => {
  const froms = [
    '/', '/*', '/demo', '/demo/', '/demo/*', '/demo/:slug', '/:section', '/:section/*',
    '/demo/api/*', '/demo/assets/foo', '/old', '/other/*', '/demo-other/*', '/demo/assets/*',
  ]
  for (const from of froms) {
    assert.equal(buildAnswers(from, BASE), checkAnswers(from, BASE), from)
    const text = `${from}  /somewhere  302\n`
    let refused = false
    try {
      write({ redirects: text })
    } catch {
      refused = true
    }
    assert.equal(
      ownRedirectFindings(text, 'public/_redirects', BASE).length > 0,
      refused,
      `${from}: the check finds what the build refuses`,
    )
  }
  // And a file the build keeps whole passes the check without a table of its own.
  assert.deepEqual(ownRedirectFindings('/old  /demo/  301\n', 'public/_redirects', BASE), [])
})

/* ----------------------------------------------- and the deep links resolve */

/**
 * Where a host sends one request, under `_redirects` rules: the first rule
 * whose `from` matches, except that a non-forced rule is skipped where a file
 * is there. A trailing `*` matches any rest of the path, and `:splat` is that
 * rest.
 */
function resolveRequest(rules, path, files) {
  if (files.has(path)) return { status: 200, file: path }
  for (const rule of rules) {
    const splat = rule.from.endsWith('*')
    const head = splat ? rule.from.slice(0, -1) : rule.from
    if (splat ? !path.startsWith(head) : path !== head) continue
    const to = rule.to.replace(':splat', splat ? path.slice(head.length) : '')
    if (rule.status === '200') return { status: 200, file: files.has(to) ? to : null }
    return { status: Number(rule.status), to }
  }
  return { status: 404 }
}

test('the written rules serve deep links, 404 a missing chunk, and send the root on', () => {
  const rules = rulesOf(write().redirects)
  const files = new Set(['/demo/index.html', '/demo/assets/index-abc123.js'])
  const at = (path) => resolveRequest(rules, path, files)

  assert.deepEqual(at('/demo/any/route'), { status: 200, file: '/demo/index.html' })
  assert.deepEqual(at('/demo/'), { status: 200, file: '/demo/index.html' })
  assert.deepEqual(at('/'), { status: 301, to: '/demo/' })
  assert.deepEqual(at('/demo/assets/index-abc123.js'), {
    status: 200,
    file: '/demo/assets/index-abc123.js',
  })
  assert.deepEqual(at('/demo/assets/index-gone00.js'), {
    status: 404,
    to: '/demo/assets/index-gone00.js',
  })
})
