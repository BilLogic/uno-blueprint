#!/usr/bin/env node
/**
 * A chunk the deploy no longer ships answers 404, and a chunk it does ships
 * cacheable forever.
 *
 * Two rules, in files a host reads before any of this repository's code runs,
 * and neither rule is visible to a build, a test or a page load. That is why
 * they get a check: the failure each one prevents arrives at a reader months
 * later, as a sentence about something else.
 *
 * THE FIRST IS THE ORDER. `netlify.toml` ends in the single-page catch-all,
 * `/*` → `/index.html` with a 200, and the host takes the FIRST rule that
 * matches. A content-hashed chunk under `/assets/` that this deploy does not
 * have therefore matches the catch-all, and the browser is handed
 * `index.html` — a 200, and `text/html`, where it asked for a script. What it
 * reports is "Failed to fetch dynamically imported module", naming the import
 * site and not the file that is missing, so the first place anyone looks is
 * the import. An `/assets/*` rule with a 404 above the catch-all makes the
 * missing file say it is missing.
 *
 * A rule added BELOW the catch-all is the same defect wearing the fix, and it
 * reads as correct in a diff — which is the whole reason the order is asserted
 * rather than described.
 *
 * WHY A PRESENT ASSET IS STILL SERVED, since the rule matches its path too:
 * a host does not shadow existing content with a NON-FORCED rule. The file
 * wins, and the rule is consulted only where there is no file. `:splat` does
 * not do that job — it keeps the TARGET honest, so the rule cannot quietly
 * rewrite one path into another — and with a 404 status the body is the site's
 * own 404 page whatever the target says. `force` is what removes the
 * protection: a forced 404 on `/assets/*` answers 404 for every asset that
 * DOES exist, which is the whole site, and in a diff it reads as merely more
 * emphatic. So forcing is asserted against, and it is the assertion nothing
 * else in this repository could make.
 *
 * THE SECOND IS THE CACHE, and it is only safe because of the hash. Vite puts
 * the content hash in every name under `/assets/`, so that name can never mean
 * two things and a year is not a risk. Nothing else may take a long cache: the
 * shell — `/`, `index.html`, the icon, the image folders — is what carries the
 * new hashes, and a shell served from a year-old cache pins a reader to the
 * deploy they first visited, asking for chunks the site no longer has. Which
 * is the first rule's failure again, arriving from the other side.
 *
 * ── The subject ────────────────────────────────────────────────────────────
 *
 * The `commit` subject of `sweep.mjs`, whose `files` answer "is this path in
 * the commit" and whose `read` answers "is the file there". A host deploys
 * what a git install would ship, so both questions are asked of every rule
 * file: a `netlify.toml` nobody committed is not deployed however well it
 * reads on disk, and that gap is reported rather than passed over. This is the
 * shape `check-reference-paths.mjs` already uses for the same pair of
 * questions.
 *
 * THREE FILES, not two. `public/_redirects` is not in this template and the
 * check reads for it anyway, because a host processes that file BEFORE the
 * configuration file: a repository started from this template that adds its
 * own catch-all there reinstates the defect above every rule in `netlify.toml`,
 * and would do it with this check green. So the file is optional and, where it
 * exists, holds the same order.
 *
 * Both header sources are read: `public/_headers`, and the `[[headers]]`
 * blocks a `netlify.toml` may carry. Only the first has to declare the hashed
 * cache — one home for the rule — but a long cache on an unhashed path is the
 * defect wherever it is written, and a check that read only one of the two
 * would be a check with a documented way around it.
 *
 * UNDER A BASE PATH every rule moves with the output. A deployment served
 * from a prefix sets `BASE_PATH` (`vite.config.ts`), and its build lands in
 * `dist/<prefix>/`, so the hashed chunks are `/<prefix>/assets/*` and the
 * fallback is `/<prefix>/*`. The check reads the same setting — the
 * environment first, then the `[build.environment]` table of `netlify.toml`,
 * which is where a host that builds from the file takes it. The build writes
 * the prefixed rules itself: `dist/_redirects` gets the root redirect, the
 * `/<prefix>/assets/*` 404 and the `/<prefix>/*` fallback, in that order, and
 * the hashed cache in `dist/_headers` moves under the prefix. So a committed
 * file still written for the root is held to the root's rules, and one that
 * already names the prefix — a deployment writing the rules by hand — is held
 * to the whole prefixed set. A `public/_redirects` under a prefix is held to
 * what the build accepts above the rules it writes: it need not carry them,
 * and the finding is a line that would answer in their place. Unset, the base
 * is `/` and every rule reads as it always did.
 *
 * `--built` reads the build instead of the commit: `dist/_redirects` and
 * `dist/_headers`, held strictly to the rules of the base the build was made
 * for, and under a prefix the root of `dist/`, which holds those two and the
 * prefix's folder and nothing a previous build left. That is the half that
 * proves the build wrote what it says it writes.
 * `dist/` is read off the disk, not through a sweep subject: every subject the
 * sweep names is a tree a commit carries, and `dist/` is the one it never does.
 *
 * What it counts is RULES, not files. Every file here passes every assertion
 * below when it is empty, so a run over emptied files would otherwise print
 * the same green line as a run over the real ones.
 *
 * Run: node scripts/check-hosting-rules.mjs   (also: npm run check:hosting)
 *      node scripts/check-hosting-rules.mjs --built   (after npm run build)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/** The host's redirect table, and its optional header blocks. */
export const CONFIG = 'netlify.toml'

/** The host's response headers. */
export const HEADERS = 'public/_headers'

/**
 * The redirect file a host reads BEFORE the configuration file. Not in this
 * template; read for because a repository started from it may add one.
 */
export const FILE_REDIRECTS = 'public/_redirects'

/** The path the hashed build output is served from. */
export const ASSETS = '/assets/*'

/** What the missing-chunk rule has to say, in full. */
export const MISSING_CHUNK = { from: ASSETS, to: '/assets/:splat', status: '404' }

/**
 * A base-path setting as `/` or `/<segments>/`, refusing what is not a path —
 * the rule `vite.config.ts` builds with, restated here because a check reads
 * no application module. `base-path-rule.test.mjs` holds this copy and the
 * build's to one answer.
 *
 * @param {string | undefined} value
 */
export function normalizeBasePath(value) {
  const trimmed = (value ?? '').trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('.') || /[?#]/.test(trimmed)) {
    throw new Error(`BASE_PATH must be a path such as /demo/, not ${JSON.stringify(value)}`)
  }
  const segments = trimmed.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}

/**
 * The base path this deployment builds with: `BASE_PATH` from the
 * environment, or else from the `[build.environment]` table of the host's
 * configuration file — the one place a host that builds from the file reads
 * it. Only that table: a `[context.*.environment]` value applies to some
 * deploys and not others, and a check that guessed which would be guessing.
 *
 * @param {string | null} configText
 * @param {Record<string, string | undefined>} [env]
 */
export function basePathIn(configText, env = process.env) {
  if (env.BASE_PATH?.trim()) return normalizeBasePath(env.BASE_PATH)
  let inBuildEnvironment = false
  for (const raw of (configText ?? '').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('#')) continue
    if (line.startsWith('[')) {
      inBuildEnvironment = line === '[build.environment]'
      continue
    }
    if (!inBuildEnvironment) continue
    const pair = /^BASE_PATH\s*=\s*(.*)$/.exec(line)
    if (pair) return normalizeBasePath(pair[1].trim().replace(/^["']|["']$/g, ''))
  }
  return '/'
}

/**
 * The rules, under a base path: the hashed output's path, the missing-chunk
 * rule in full, the catch-all's `from`, the single-page fallback in full, and
 * the redirect that sends the site root on to the prefix. At `/` these are
 * `ASSETS`, `MISSING_CHUNK`, `/*`, `/*` → `/index.html`, and no redirect —
 * the root is where the app already is.
 *
 * Under a prefix they are also what the build writes into `dist/_redirects`,
 * in this order: the root redirect, the missing-chunk rule, the fallback.
 * `vite.config.ts` writes them from its own copy, because a config reads no
 * script, and `a-path-build-writes-its-hosting-rules.test.mjs` holds that copy
 * to this one.
 *
 * @param {string} [base]
 */
export function hostingRules(base = '/') {
  if (base === '/') {
    return {
      assets: ASSETS,
      missingChunk: MISSING_CHUNK,
      catchAll: '/*',
      fallback: { from: '/*', to: '/index.html', status: '200' },
      toPrefix: null,
    }
  }
  const assets = `${base}assets/*`
  return {
    assets,
    missingChunk: { from: assets, to: `${base}assets/:splat`, status: MISSING_CHUNK.status },
    catchAll: `${base}*`,
    fallback: { from: `${base}*`, to: `${base}index.html`, status: '200' },
    toPrefix: { from: '/', to: base, status: '301' },
  }
}

/**
 * The base a committed rule file is written for: the deployment's base when
 * any rule in it already names the prefix, and the root otherwise.
 *
 * A build under a prefix writes the prefixed rules into `dist/` itself, so a
 * committed file still written for the root is no longer the defect — it is
 * the default, and it is held to the root's order and cache. A file that names
 * the prefix is a deployment writing the rules by hand, and is held to the
 * whole prefixed set: half of it is the defect it always was.
 *
 * @param {Array<string | undefined>} paths every `from` or header path in the file
 * @param {string} base
 */
export function baseWrittenFor(paths, base) {
  if (base === '/') return '/'
  return paths.some((path) => path?.startsWith(base)) ? base : '/'
}

/** What a hashed asset may be cached for. A year, and never revalidated. */
export const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * How long a cache has to be before it outlives a deploy.
 *
 * An hour is a CDN detail; a day is a decision about how long a reader may be
 * held on an old shell. Anything at or above this on an unhashed path is the
 * defect, `immutable` at any length is the defect, and below it is somebody's
 * ordinary revalidation policy and not this check's business.
 */
export const LONG_CACHE_SECONDS = 86400

/**
 * Every freshness directive that names a number of seconds.
 *
 * `max-age` for a browser, `s-maxage` for a shared cache — and `s-maxage` is
 * spelled without the second hyphen, so a pattern written as `(?:s-)?max-age`
 * matches the browser one and walks straight past the CDN one. A shell a CDN
 * holds for a year is the same reader on the same stale shell.
 */
const SECONDS_DIRECTIVE = /\b(?:s-maxage|s-max-age|max-age)\s*=\s*(\d+)/g

/**
 * Every `[[redirects]]` block in a TOML file, in the order the host reads
 * them.
 *
 * Deliberately a line reader rather than a TOML parse: the order is the claim,
 * and an object parse hands back a list whose order is an artifact of the
 * parser rather than of the file. The line number comes with each block
 * because a finding that cannot be jumped to is a finding somebody has to
 * reproduce.
 *
 * @param {string} text
 * @returns {Array<{ line: number, from?: string, to?: string, status?: string, force?: boolean }>}
 */
export function redirectsIn(text) {
  const blocks = []
  let open = null
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (line.startsWith('#')) return
    if (line === '[[redirects]]') {
      open = { line: index + 1 }
      blocks.push(open)
      return
    }
    // Any other table header closes the block: a key under `[build]` is not a
    // redirect, whatever it is called.
    if (line.startsWith('[')) {
      open = null
      return
    }
    if (!open) return
    const pair = /^(from|to|status|force)\s*=\s*(.*)$/.exec(line)
    if (!pair) return
    const value = pair[2].trim().replace(/^["']|["']$/g, '')
    if (pair[1] === 'force') open.force = value === 'true'
    else open[pair[1]] = value
  })
  return blocks
}

/**
 * Every rule in a `_redirects` file, in order.
 *
 * The format is positional — `from  to  status` on one line — and forcing is a
 * `!` on the status rather than a key of its own, which is a whole clause of
 * meaning in one character nobody reviews.
 *
 * @param {string} text
 * @returns {Array<{ line: number, from?: string, to?: string, status?: string, force?: boolean }>}
 */
export function redirectLinesIn(text) {
  const rules = []
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const [from, to, status] = line.split(/\s+/)
    rules.push({
      line: index + 1,
      from,
      to,
      status: status?.replace(/!$/, ''),
      force: Boolean(status?.endsWith('!')),
    })
  })
  return rules
}

/**
 * Every path block in a `_headers` file: the path, and the headers under it.
 *
 * The format is positional — a path at column zero, its headers indented
 * beneath — so an indented line belongs to whatever path was last seen, and a
 * header before any path belongs to nothing and is dropped.
 *
 * @param {string} text
 * @returns {Array<{ path: string, line: number, headers: Array<{ name: string, value: string, line: number }> }>}
 */
export function headerBlocksIn(text) {
  const blocks = []
  let open = null
  text.split('\n').forEach((raw, index) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return
    if (!/^\s/.test(raw)) {
      open = { path: raw.trim(), line: index + 1, headers: [] }
      blocks.push(open)
      return
    }
    if (!open) return
    const pair = /^([^:]+):\s*(.*)$/.exec(raw.trim())
    if (!pair) return
    open.headers.push({ name: pair[1].trim(), value: pair[2].trim(), line: index + 1 })
  })
  return blocks
}

/**
 * Every `[[headers]]` block in a TOML file, in the shape `_headers` parses to.
 *
 * `for = "<path>"` names the path and the values live in a nested
 * `[headers.values]` table, so that sub-table is the one `[` which does not
 * close the block. Returned in the same shape as `headerBlocksIn`, so one
 * cache judgement reads both sources.
 *
 * @param {string} text
 * @returns {Array<{ path: string, line: number, headers: Array<{ name: string, value: string, line: number }> }>}
 */
export function tomlHeaderBlocksIn(text) {
  const blocks = []
  let open = null
  let inValues = false
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (line.startsWith('#')) return
    if (line === '[[headers]]') {
      open = { path: undefined, line: index + 1, headers: [] }
      inValues = false
      blocks.push(open)
      return
    }
    if (line === '[headers.values]') {
      inValues = true
      return
    }
    if (line.startsWith('[')) {
      open = null
      inValues = false
      return
    }
    if (!open) return
    const forPath = /^for\s*=\s*(.*)$/.exec(line)
    if (forPath) {
      open.path = forPath[1].trim().replace(/^["']|["']$/g, '')
      return
    }
    if (!inValues) return
    const pair = /^([A-Za-z0-9-]+)\s*=\s*(.*)$/.exec(line)
    if (!pair) return
    open.headers.push({
      name: pair[1].trim(),
      value: pair[2].trim().replace(/^["']|["']$/g, ''),
      line: index + 1,
    })
  })
  return blocks.filter((block) => block.path !== undefined)
}

/**
 * Is this header name a cache directive?
 *
 * Every one of them ends in `cache-control`: the standard header, and the
 * `CDN-Cache-Control` / `Netlify-CDN-Cache-Control` pair a host reads in
 * preference to it. Matching the bare name alone left the two that override it
 * unread.
 *
 * @param {string} name
 */
export function isCacheHeader(name) {
  return name.trim().toLowerCase().endsWith('cache-control')
}

/**
 * Does this cache value outlive a deploy?
 *
 * @param {string} value
 */
export function outlivesADeploy(value) {
  const lowered = value.toLowerCase()
  if (/\bimmutable\b/.test(lowered)) return true
  for (const match of lowered.matchAll(SECONDS_DIRECTIVE)) {
    if (Number(match[1]) >= LONG_CACHE_SECONDS) return true
  }
  return false
}

/**
 * The order claim, over one already-parsed redirect table.
 *
 * Pure and exported, so every branch can be driven from a fixture instead of
 * from the file the check protects — which is the only way to see the guard go
 * red without editing what a host reads. `note` is the sentence a particular
 * file adds about its own precedence.
 *
 * @param {ReturnType<typeof redirectsIn>} blocks
 * @param {string} subject
 * @param {string} [note]
 * @param {string} [base]
 * @returns {string[]}
 */
export function orderFindings(blocks, subject, note = '', base = '/') {
  const found = []
  const tail = note ? ` ${note}` : ''
  const { missingChunk, catchAll: fallback } = hostingRules(base)
  const missing = blocks.findIndex((block) => block.from === missingChunk.from)
  const catchAll = blocks.findIndex((block) => block.from === fallback)

  if (missing === -1) {
    found.push(
      `${subject} has no \`${missingChunk.from}\` rule, so a hashed chunk this deploy no ` +
        'longer ships falls through to the catch-all and is answered with the app shell — a 200 ' +
        'and text/html where a script was asked for. Add the rule with ' +
        `from = "${missingChunk.from}", to = "${missingChunk.to}", ` +
        `status = ${missingChunk.status}, and no force.${tail}`,
    )
  } else {
    const block = blocks[missing]
    if (block.to !== missingChunk.to) {
      found.push(
        `${subject}:${block.line} sends \`${missingChunk.from}\` to \`${block.to}\` — the ` +
          `target has to be \`${missingChunk.to}\`, which is what keeps the rule from quietly ` +
          'rewriting one path into another.',
      )
    }
    if (block.status !== missingChunk.status) {
      found.push(
        `${subject}:${block.line} answers \`${missingChunk.from}\` with ${block.status} — the ` +
          `status has to be ${missingChunk.status}, which is the whole point of the rule: a ` +
          'missing chunk saying it is missing.',
      )
    }
  }

  // FORCING, on either rule, and this is the finding that matters most. A
  // non-forced rule is not consulted while the file exists, which is the only
  // reason a 404 over the whole of `/assets/*` is safe. Forced, the same rule
  // answers for the files too — a 404 for every asset the site HAS — and the
  // diff that did it reads as emphasis.
  for (const index of [missing, catchAll]) {
    if (index === -1) continue
    const block = blocks[index]
    if (!block.force) continue
    found.push(
      `${subject}:${block.line} forces \`${block.from}\`. A host does not shadow existing ` +
        'content with a non-forced rule, and that — not `:splat` — is why an asset that IS ' +
        'there is still served. Forced, the rule answers for the files too: on ' +
        `\`${missingChunk.from}\` that is a ${missingChunk.status} for every asset the site ` +
        'has. Remove the force.',
    )
  }

  if (catchAll === -1) {
    found.push(
      `${subject} has no \`${fallback}\` catch-all, so there is nothing for the ` +
        `\`${missingChunk.from}\` rule to precede and no path reaches the app. The single-page ` +
        `fallback is what every deep link depends on.${tail}`,
    )
  } else if (missing > catchAll) {
    found.push(
      `${subject}:${blocks[missing].line} puts the \`${missingChunk.from}\` rule BELOW the ` +
        `\`${fallback}\` catch-all on line ${blocks[catchAll].line}. The host takes the first rule that ` +
        'matches, so below it the rule is never reached and the defect it fixes is back, wearing ' +
        `the fix. Move the block above the catch-all.${tail}`,
    )
  }

  return found
}

/** The order claim over one `netlify.toml`'s text. */
export function redirectFindings(text, subject = CONFIG, base = '/') {
  return orderFindings(redirectsIn(text), subject, '', base)
}

/**
 * The order claim over one `_redirects` file's text.
 *
 * The note is the reason this file is read at all: a host processes it BEFORE
 * the configuration file, so a catch-all here sits above every rule in
 * `netlify.toml` and reinstates the defect from above it.
 */
export function fileRedirectFindings(text, subject = FILE_REDIRECTS, base = '/') {
  return orderFindings(
    redirectLinesIn(text),
    subject,
    `A host processes ${subject} BEFORE ${CONFIG}, so this file's own order is the one that ` +
      `decides; the rules in ${CONFIG} are never reached for a path this file matches.`,
    base,
  )
}

/**
 * Whether a redirect's `from` answers for the app under `base`: the site root,
 * the prefix itself, or any path beneath it — the case a splat or a
 * placeholder in the segment after the prefix makes. A literal segment there
 * (`/demo/api/*`) names a path of the repository's own.
 *
 * The rule `vite.config.ts` refuses a repository's own redirect by, restated
 * here because a check reads no application module;
 * `a-path-build-writes-its-hosting-rules.test.mjs` holds the two to one answer.
 *
 * @param {string} from
 * @param {string} base
 */
export function answersForTheApp(from, base) {
  if (from === '/') return true
  const want = base.split('/').filter(Boolean)
  const have = from.split('/').filter(Boolean)
  for (const [index, segment] of want.entries()) {
    const said = have[index]
    if (said === undefined) return false
    if (said === '*') return true
    if (said !== segment && !said.startsWith(':')) return false
  }
  const next = have[want.length]
  return next === undefined || next === '*' || next.startsWith(':')
}

/**
 * A repository's own `_redirects`, under a prefix the build writes rules for.
 *
 * The build keeps the file above the rules it writes, drops a line that states
 * one of them exactly, and refuses any other line that answers a path they are
 * for. So the file does not have to carry the missing-chunk rule or the
 * fallback — the build supplies both, in order — and the one finding is the
 * line the build would refuse, found here before a build is run.
 *
 * @param {string} text
 * @param {string} subject
 * @param {string} base
 * @returns {string[]}
 */
export function ownRedirectFindings(text, subject, base) {
  const { toPrefix, missingChunk, fallback } = hostingRules(base)
  const generated = [toPrefix, missingChunk, fallback]
  const found = []
  for (const rule of redirectLinesIn(text)) {
    const restates = generated.some(
      (one) =>
        one.from === rule.from && one.to === rule.to && one.status === rule.status && !rule.force,
    )
    if (restates) continue
    if (!generated.some((one) => one.from === rule.from) && !answersForTheApp(rule.from, base)) {
      continue
    }
    found.push(
      `${subject}:${rule.line} sends \`${rule.from}\`, which a host reads before the rules a ` +
        `build under BASE_PATH=${base} writes (${generated.map((one) => one.from).join(', ')}) ` +
        'and so answers in their place, and the build refuses it. Remove the line; the build ' +
        'writes the prefixed rules itself.',
    )
  }
  return found
}

/**
 * The hashed output declares its own long cache — once.
 *
 * @param {ReturnType<typeof headerBlocksIn>} blocks
 * @param {string} subject
 * @param {string} [base]
 * @returns {string[]}
 */
export function hashedCacheFindings(blocks, subject = HEADERS, base = '/') {
  const found = []
  const { assets } = hostingRules(base)
  const hashed = blocks.filter((block) => block.path === assets)

  if (hashed.length === 0) {
    found.push(
      `${subject} has no \`${assets}\` block, so every hashed asset is revalidated on every ` +
        `navigation even though its name already encodes its content. Add \`${assets}\` with ` +
        `\`Cache-Control: ${IMMUTABLE}\`.`,
    )
    return found
  }

  if (hashed.length > 1) {
    // Two blocks for one path is one answer and one lie: a host reads the
    // first, a reader reads the last, and a `no-store` underneath the year
    // passes every assertion made about the year alone.
    found.push(
      `${subject}:${hashed[1].line} declares \`${assets}\` a second time (the first is on line ` +
        `${hashed[0].line}). One path, one block — a second one is a rule nobody can read off ` +
        'the file, and the one further down is the one a reviewer sees.',
    )
  }

  for (const block of hashed) {
    const cache = block.headers.find((header) => isCacheHeader(header.name))
    if (!cache) {
      found.push(
        `${subject}:${block.line} \`${assets}\` carries no Cache-Control, so the long cache the ` +
          `content hash makes safe is not claimed. Add \`Cache-Control: ${IMMUTABLE}\`.`,
      )
      continue
    }
    if (cache.value !== IMMUTABLE) {
      found.push(
        `${subject}:${cache.line} \`${assets}\` is cached as \`${cache.value}\` rather than ` +
          `\`${IMMUTABLE}\`. The hash in the name is what makes a year safe; anything shorter ` +
          'spends a round trip per navigation for nothing.',
      )
    }
  }

  return found
}

/**
 * Nothing unhashed is cached past a deploy — in whichever file it was written.
 *
 * @param {ReturnType<typeof headerBlocksIn>} blocks
 * @param {string} subject
 * @param {string} [base]
 * @returns {string[]}
 */
export function longCacheFindings(blocks, subject = HEADERS, base = '/') {
  const found = []
  const { assets } = hostingRules(base)
  for (const block of blocks) {
    if (block.path === assets) continue
    for (const header of block.headers) {
      if (!isCacheHeader(header.name)) continue
      if (!outlivesADeploy(header.value)) continue
      found.push(
        `${subject}:${header.line} \`${block.path}\` is cached as \`${header.name}: ` +
          `${header.value}\`, which outlives a deploy, and nothing under that path carries a ` +
          'content hash. The shell is what delivers the new hashes: served from an old cache it ' +
          `asks for chunks the site no longer has. Only \`${assets}\` may be cached this long.`,
      )
    }
  }
  return found
}

/** Both cache claims over one `_headers` file's text. */
export function cacheFindings(text, subject = HEADERS, base = '/') {
  const blocks = headerBlocksIn(text)
  return [
    ...hashedCacheFindings(blocks, subject, base),
    ...longCacheFindings(blocks, subject, base),
  ]
}

/**
 * The commit, whose `files` answer membership and whose `read` answers
 * presence.
 *
 * @param {string} [root]
 */
export function hostingSweep(root = process.cwd()) {
  return sweep({ subject: 'commit', root, what: 'file a commit would carry' })
}

/**
 * Every finding, and how many rules were read for them.
 *
 * A rule file the tree does not have is a FINDING rather than a throw: the
 * guard set's own rule is that a check names a subject and judges, and
 * `verdict.mjs` reserves a throw for a fact about the tree rather than a fact
 * about the subject. With no rule file there is nothing to count either, so
 * `count` falls to zero and the NO SUBJECT outcome says the rest.
 *
 * `base` is the path the deployment is served from; `judge` reads it with
 * `basePathIn`. Each file is held to the rules of the base it is written for
 * (`baseWrittenFor`): the prefixed set where it names the prefix, the root's
 * where it does not, because the build then writes the prefixed set itself.
 * `redirectsAt` is the base `netlify.toml` was held to, and `headersAt` the
 * base `public/_headers` was. A `public/_redirects` under a prefix is held to
 * what the build accepts above the rules it writes (`ownRedirectFindings`).
 *
 * @param {{ read: (path: string) => string | null, files: string[] }} walk
 * @param {string} [base]
 */
export function hostingFindings(walk, base = '/') {
  const tracked = new Set(walk.files)
  const found = []
  let rules = 0
  let redirectsAt = base
  let headersAt = base

  /** Present, committed, or neither — asked of one rule file. */
  const present = (subject, required) => {
    const text = walk.read(subject)
    if (text === null) {
      if (required) {
        found.push(
          `${subject} is not in this tree. It is what tells the host to answer a missing chunk ` +
            'with a 404 and to cache the hashed output for a year, and neither rule has any ' +
            'other home. Restore it.',
        )
      }
      return null
    }
    if (!tracked.has(subject)) {
      found.push(
        `${subject} is untracked — a git install would not ship it, so a deploy resolves none ` +
          'of the rules in it however well the file reads here. Commit it.',
      )
    }
    return text
  }

  const config = present(CONFIG, true)
  if (config !== null) {
    const blocks = redirectsIn(config)
    const tomlHeaders = tomlHeaderBlocksIn(config)
    rules += blocks.length + tomlHeaders.length
    redirectsAt = baseWrittenFor(
      [...blocks.map((block) => block.from), ...tomlHeaders.map((block) => block.path)],
      base,
    )
    found.push(...orderFindings(blocks, CONFIG, '', redirectsAt))
    // `[[headers]]` here does not have to declare the hashed cache — that is
    // `public/_headers`'s one home for it — but a long cache on an unhashed
    // path is the defect wherever it was written down.
    found.push(...longCacheFindings(tomlHeaders, CONFIG, redirectsAt))
  }

  const headers = present(HEADERS, true)
  if (headers !== null) {
    const blocks = headerBlocksIn(headers)
    headersAt = baseWrittenFor(
      blocks.map((block) => block.path),
      base,
    )
    rules += blocks.length
    found.push(...hashedCacheFindings(blocks, HEADERS, headersAt))
    found.push(...longCacheFindings(blocks, HEADERS, headersAt))
  }

  // Optional, and read for anyway: this template ships none, and a repository
  // started from it that adds one puts its rules AHEAD of everything above.
  const fileRedirects = present(FILE_REDIRECTS, false)
  if (fileRedirects !== null) {
    const lines = redirectLinesIn(fileRedirects)
    rules += lines.length
    // Under a prefix the build always writes the prefixed rules below this
    // file, whatever it is written for, so it is held to what the build
    // accepts rather than to a whole table of its own.
    found.push(
      ...(base === '/'
        ? fileRedirectFindings(fileRedirects, FILE_REDIRECTS, base)
        : ownRedirectFindings(fileRedirects, FILE_REDIRECTS, base)),
    )
  }

  return { failures: found, rules, redirectsAt, headersAt }
}

/** The directory a build publishes, whose root a host serves as `/`. */
export const BUILT = 'dist'

/** Where a build publishes the redirect file a host reads first. */
export const BUILT_REDIRECTS = 'dist/_redirects'

/** Where a build publishes the response headers. */
export const BUILT_HEADERS = 'dist/_headers'

/**
 * Every finding over a BUILT output, and how many rules were read for them.
 *
 * The committed files say what a repository asked for; `dist/` is what a host
 * is handed. Under a prefix they differ — the build writes the prefixed rules
 * into `dist/_redirects` and moves the hashed cache in `dist/_headers` — so
 * the published pair is held to the whole prefixed set here, strictly, with
 * no root reading to fall back on: the root redirect, then the missing-chunk
 * rule above the fallback, nothing forced, and only `/<prefix>/assets/*`
 * cached past a deploy. At the root a build writes no `_redirects` and the
 * `netlify.toml` table answers, so only the headers are required.
 *
 * Under a prefix the root of `dist/` holds the two host files and the
 * prefix's folder, and nothing else. Anything more is a previous build's — a
 * host cache restores one as readily as a local `dist/` keeps it — and a host
 * serves a file that is there ahead of any rule that is not forced, so a root
 * `index.html` answers `/` with the old app and the redirect to the prefix is
 * never reached. `entries` is what the root holds; left out, it is not judged.
 *
 * Read from disk rather than from the commit: `dist/` is never committed, and
 * whether a file is tracked says nothing about what a build just wrote.
 *
 * @param {(path: string) => string | null} read
 * @param {string} [base]
 * @param {string[] | null} [entries] the names at the root of `dist/`
 */
export function builtFindings(read, base = '/', entries = null) {
  const found = []
  let rules = 0
  const { toPrefix } = hostingRules(base)

  if (toPrefix && entries) {
    const allowed = new Set(['_headers', '_redirects', base.split('/').filter(Boolean)[0]])
    const stray = entries.filter((name) => !allowed.has(name)).sort()
    if (stray.length > 0) {
      found.push(
        `${BUILT}/ holds ${stray.map((name) => `\`${name}\``).join(', ')} beside the build for ` +
          `${base}. A host serves a file that is there before the redirect that sends \`/\` on ` +
          `to ${base}, so the site root answers with whatever an earlier build left. Build again ` +
          'under BASE_PATH, which clears them, and clear any build cache the host restores.',
      )
    }
  }

  const redirects = read(BUILT_REDIRECTS)
  if (redirects === null) {
    if (toPrefix) {
      found.push(
        `${BUILT_REDIRECTS} is not in the build. A build under BASE_PATH=${base} writes the ` +
          `prefixed rules there, and without them no deep link under ${base} reaches the app. ` +
          `Build again with BASE_PATH=${base} set.`,
      )
    }
  } else {
    const lines = redirectLinesIn(redirects)
    rules += lines.length
    found.push(...fileRedirectFindings(redirects, BUILT_REDIRECTS, base))
    if (toPrefix) {
      const root = lines.find((rule) => rule.from === toPrefix.from)
      if (!root || root.to !== toPrefix.to || root.status !== toPrefix.status) {
        found.push(
          `${BUILT_REDIRECTS} does not send \`${toPrefix.from}\` on to \`${toPrefix.to}\` with ` +
            `a ${toPrefix.status}, so a visitor to the site root meets a 404 where the app is ` +
            'one path segment away.',
        )
      }
    }
  }

  const headers = read(BUILT_HEADERS)
  if (headers === null) {
    found.push(
      `${BUILT_HEADERS} is not in the build, so nothing tells the host to cache the hashed ` +
        'output — or to send the CSP. Build again; `public/_headers` is what it is made from.',
    )
  } else {
    const blocks = headerBlocksIn(headers)
    rules += blocks.length
    found.push(...hashedCacheFindings(blocks, BUILT_HEADERS, base))
    found.push(...longCacheFindings(blocks, BUILT_HEADERS, base))
  }

  return { failures: found, rules }
}

/**
 * The verdict: the files a host reads, held to the order and the cache.
 *
 * Pure — it reads, decides, and hands back what it found and how many rules it
 * counted. Nothing here prints or exits.
 *
 * `--built` reads the build in `dist/` instead of the commit: what a host is
 * handed, after a build under `BASE_PATH` has written the prefixed rules into
 * it. Those files are read off the disk rather than through a sweep subject,
 * because every subject `sweep.mjs` names is a tree a commit carries, and
 * `dist/` is the one tree here a commit never does.
 *
 * @param {string[]} [argv]
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [root]
 */
export function judge(argv = process.argv.slice(2), env = process.env, root = process.cwd()) {
  const built = argv.includes('--built')
  const plural = (count) => `${count} rule${count === 1 ? '' : 's'}`
  if (built) {
    const read = (path) => {
      const file = resolve(root, path)
      return existsSync(file) ? readFileSync(file, 'utf8') : null
    }
    const base = basePathIn(read(CONFIG), env)
    const { assets, missingChunk, catchAll } = hostingRules(base)
    const published = resolve(root, BUILT)
    const entries = existsSync(published) ? readdirSync(published) : null
    const { failures, rules } = builtFindings(read, base, entries)
    return {
      what: 'a hosting rule a build publishes',
      count: rules,
      opening: `The rule files this build publishes for ${base} do not say what they have to:\n`,
      findings: failures.map((one) => `  ${one}`),
      closing:
        `\n${plural(failures.length)} to fix in ${BUILT_REDIRECTS} / ${BUILT_HEADERS}. ` +
        'Build again, then run npm run check:hosting -- --built.',
      line:
        base === '/'
          ? `[hosting] ${rules} rules in the build for / — only ${assets} is cached past a ` +
            `deploy, and the redirect table is ${CONFIG}'s.`
          : `[hosting] ${rules} rules in the build for ${base} — a missing chunk answers ` +
            `${missingChunk.status} above the ${catchAll} catch-all, nothing is forced, and ` +
            `only ${assets} is cached past a deploy.`,
    }
  }

  const walk = hostingSweep(root)
  const base = basePathIn(walk.read(CONFIG), env)
  const { failures, rules, redirectsAt, headersAt } = hostingFindings(walk, base)
  const { missingChunk, catchAll } = hostingRules(redirectsAt)
  const { assets } = hostingRules(headersAt)
  const written =
    redirectsAt === base && headersAt === base
      ? ''
      : ` The build writes the ${base} rules into ${BUILT_REDIRECTS} and ${BUILT_HEADERS}.`
  return {
    what: 'a hosting rule a commit would carry',
    count: rules,
    opening:
      'The files a host reads before any of this code runs no longer say what they have to:\n',
    findings: failures.map((one) => `  ${one}`),
    closing:
      `\n${plural(failures.length)} to fix in ${CONFIG} / ${HEADERS}. ` +
      'Then run npm run check:hosting.',
    line:
      `[hosting] ${rules} rules in ${CONFIG} and ${HEADERS} — a missing chunk answers ` +
      `${missingChunk.status} above the ${catchAll} catch-all, nothing is forced, and only ` +
      `${assets} is cached past a deploy.${written}`,
  }
}

whenRun(import.meta.url, judge)
