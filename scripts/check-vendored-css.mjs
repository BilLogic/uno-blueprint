#!/usr/bin/env node
/**
 * The vendored shadcn stylesheet, held to the file it was copied from.
 *
 *   npm run check:vendored-css
 *
 * The app's stylesheet used to import `shadcn/tailwind.css` straight out of
 * the package, and that one import is why `shadcn` sat in `dependencies`. A
 * deployment builds the app out of `node_modules/uno-blueprint`, so the import
 * had to resolve there, and the whole CLI installed into every deployment for
 * the sake of one CSS file — its `ts-morph`, its `fast-glob`, and under those
 * `micromatch` and a `braces` with a high advisory and no patched release. Seven
 * `npm audit` findings a deployment could not fix, all of them that chain.
 *
 * So the file is vendored: `src/styles/shadcn-tailwind.css` is the upstream
 * file byte for byte, under a header naming the version it came from, and
 * `shadcn` is a devDependency again, kept for `npx shadcn add`. A copy nobody
 * compares is a fork by the next release, which is what this check is for. It
 * goes red when the header names no version, when that version is not the one
 * installed (a bump that nobody re-vendored), or when the body differs from the
 * installed file (an edit made to a copy rather than upstream). The fix is the
 * same each time: `npm run vendor:shadcn-css`, which rewrites the copy from the
 * installed package.
 *
 * Where `shadcn` is not installed — a deployment, which installs the template
 * without its devDependencies — there is nothing to compare against, and that
 * is said through the unverified register rather than passed or failed.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'

/** The copy, as an application path: a deployment reads it out of the package. */
export const VENDORED = 'src/styles/shadcn-tailwind.css'

/** The upstream file, as the package exports it. */
const UPSTREAM = 'shadcn/tailwind.css'

const NAMED = /^\/\*\n \* Vendored from shadcn@([^\s]+) /

/**
 * The copy's contents: a header naming the version, a blank line, and the
 * upstream file unchanged.
 */
export function vendor(upstream, version) {
  return (
    '/*\n' +
    ` * Vendored from shadcn@${version} — \`${UPSTREAM}\`, byte for byte below this\n` +
    ' * header. Imported from here rather than from the package so the app builds\n' +
    ' * without the shadcn CLI installed. Do not edit: `npm run vendor:shadcn-css`\n' +
    ' * rewrites it, and `npm run check:vendored-css` fails when it drifts.\n' +
    ' */\n' +
    '\n' +
    upstream
  )
}

/** The version and body of a copy `vendor` wrote, or null when it has no such header. */
export function readVendored(text) {
  const version = NAMED.exec(text)?.[1]
  if (!version) return null
  const end = text.indexOf(' */\n\n')
  if (end === -1) return null
  return { version, body: text.slice(end + ' */\n\n'.length) }
}

/** The line, in `a`, of the first character where `a` and `b` part. */
function firstDifference(a, b) {
  let index = 0
  while (index < a.length && a[index] === b[index]) index += 1
  return a.slice(0, index).split('\n').length
}

/**
 * What is wrong with the copy, one sentence each.
 * @param {{ vendored: string, upstream: string, installed: string }} sides
 */
export function drift({ vendored, upstream, installed }) {
  const copy = readVendored(vendored)
  if (!copy) {
    return [`${VENDORED}:1 names no upstream version in its header`]
  }
  const found = []
  if (copy.version !== installed) {
    found.push(
      `${VENDORED}:2 was copied from shadcn@${copy.version}, and shadcn@${installed} is installed`,
    )
  }
  if (copy.body !== upstream) {
    // Measured against the copy `vendor` would write, so the line is the
    // copy's own and a reader can open the file at it.
    const line = firstDifference(vendored, vendor(upstream, copy.version))
    found.push(`${VENDORED}:${line} differs from the installed ${UPSTREAM}`)
  }
  return found
}

/** The installed upstream file and its package version, or null when shadcn is not installed. */
export function installedUpstream(root = process.cwd()) {
  const require = createRequire(join(resolve(root), 'package.json'))
  let path
  try {
    path = require.resolve(UPSTREAM)
  } catch {
    return null
  }
  const pkg = JSON.parse(readFileSync(join(dirname(dirname(path)), 'package.json'), 'utf8'))
  return { text: readFileSync(path, 'utf8'), version: pkg.version }
}

/**
 * The verdict: the vendored copy against the installed upstream file.
 *
 * Pure — it reads, decides, and hands back what it found. Nothing here prints
 * or exits.
 */
export function judge(root = process.cwd()) {
  const what = 'the vendored shadcn stylesheet'
  const upstream = installedUpstream(root)
  if (!upstream) {
    return {
      what,
      unverified:
        `${UPSTREAM} does not resolve here, which a tree installed without devDependencies ` +
        'does not; install them to compare the copy against it.',
    }
  }
  const app = sweep({ subject: 'app', root, what, where: (path) => path === VENDORED })
  // A copy that vanished between the listing and the read is read as empty,
  // which `drift` reports as a copy with no header.
  const vendored = app.read(VENDORED) ?? ''
  const findings = drift({ vendored, upstream: upstream.text, installed: upstream.version })
  return {
    what,
    count: app.files.length,
    findings: findings.map((finding) => `  ${finding}`),
    opening: 'The vendored shadcn stylesheet is not the installed upstream file:\n',
    closing: '\nRewrite it from the installed package: npm run vendor:shadcn-css',
    line: `${VENDORED} is shadcn@${upstream.version}'s ${UPSTREAM}, byte for byte.`,
  }
}

whenRun(import.meta.url, judge)
