#!/usr/bin/env node
/**
 * `GLOSSARY.md` defines this repository's terms and stops.
 *
 * The engineering skills this repo routes to assume one shape: `AGENTS.md`
 * routes, `GLOSSARY.md` defines terms, and the decision records hold
 * decisions. A glossary grows reference sections inside it — a rename map, an
 * interface-to-schema map, reasoning about which words a check should exempt
 * — and every session that opens the file to look up one word pays for all of
 * them. Each belongs elsewhere: a rename map beside the checks that enforce
 * it, and the interface map in the generated document
 * `repoConfig.interfaceMap` names, where one pointer reaches it.
 *
 * A file that has been cut once grows back unless something holds it. The
 * glossary already SAID it was definitions only, and went on saying it while
 * sections of it were something else. This is that sentence with a build
 * behind it.
 *
 * ── THE GRAMMAR, READ OFF WHAT IS LEFT ──────────────────────────────────────
 *
 * A glossary is headings, prose, and TERM ROWS — `**term** — definition`, the
 * shape every entry in the file already takes. The rules are three, and each
 * one names a way the file grew last time:
 *
 *   1. NO FENCED CODE BLOCK. A definition is a sentence. A fence is an example,
 *      a schema listing or a snippet — the beginning of a reference document,
 *      and reference documents are disclosed rather than always-open.
 *   2. NO TABLE NAMES A COLUMN. Both evicted maps were tables of
 *      `table.column` spans, and that is the tell: a table whose cells are
 *      schema names restates the catalogue, which is what a generated
 *      reference is for. Tables as such are allowed — a glossary may draw one,
 *      of who writes what, and no cell of it names a column — because the rule
 *      that catches the real thing is narrower than "no tables" and needs no
 *      exemption to stay true.
 *   3. EVERY SECTION DEFINES A TERM. A `##` or `###` section with no term row
 *      in it is a body: prose that is about something other than what a word
 *      means. Every evicted section failed this rule on the day it was
 *      written, and it is the one that catches the next one before it is a
 *      hundred lines long.
 *
 * SUBJECT is `GLOSSARY.md` alone. It is named here rather than walked for,
 * because the glossary is one file by the shape's own definition: a second
 * glossary would be a second vocabulary. Every repository that carries this
 * check holds its own glossary to it.
 *
 * AND A GLOSSARY WITH NO TERMS IN IT IS NOT ONE. The three rules above are all
 * written as refusals, which is the right shape for each of them and the wrong
 * shape for the whole: an emptied file breaks none of them. No fence, no
 * table, no section — nothing to fail. The run printed `0 term rows` and
 * exited 0, in the same sentence and the same green as the run over a file
 * with fifty-one. The count was already being computed and printed; it is now
 * also read, which is the difference between reporting a subject and having
 * one.
 *
 * Sibling of the router's three checks — same shape, same failure style, same
 * place in CI — because `GLOSSARY.md` is the first pointer `AGENTS.md` fires
 * and a session that reads the router reads this next. Like them it is the
 * same file in every repository; the one path it names that differs, the
 * interface map, comes from `scripts/repo-config.mjs`.
 *
 * Run: node scripts/check-glossary-only.mjs   (also: npm run check:glossary)
 */
import { repoConfig } from './repo-config.mjs'
import { sweep as sweepSubject } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/** Where a table of column names belongs instead of the glossary. */
const INTERFACE_MAP = repoConfig.interfaceMap

/** The glossary. One file, by the shape's own definition. */
export const SUBJECT = 'GLOSSARY.md'

/** A term row: the bold word, then an em dash, then what it means. */
export const TERM_ROW = /^\*\*[^*\n]+\*\*\s+—\s+\S/

/** Extensions that make a dotted code span a path rather than a column. */
const PATH_SUFFIX = /\.(?:md|mjs|js|ts|tsx|jsx|json|ya?ml|sql|css|sh|py|toml|png|svg)$/

/** Does this code span name a `table.column`? */
export function namesAColumn(span) {
  const text = span.trim()
  if (text.includes('/') || text.includes(' ') || PATH_SUFFIX.test(text)) return false
  return /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(text)
}

/** Every `##`/`###`… section: its heading, its line number, and its body lines. */
export function sectionsIn(lines) {
  const sections = []
  let open = null
  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^(#{2,6})\s+(.*)$/.exec(lines[i])
    if (heading) {
      if (open) sections.push(open)
      open = { heading: heading[2].trim(), line: i + 1, body: [] }
      continue
    }
    if (open) open.body.push(lines[i])
  }
  if (open) sections.push(open)
  return sections
}

/**
 * The three rules, over one document's text.
 *
 * Pure and exported, so the unit test can run them over a fixture rather than
 * over the real glossary — which is the only way to prove every branch goes
 * red without editing the file the check protects.
 */
export function findings(text, subject = SUBJECT) {
  const out = []

  // The subject, before the three rules that read it. A file with no term row
  // in it fails none of them, so without this the emptied glossary and the
  // whole one print the same line.
  if (!text.split('\n').some((line) => TERM_ROW.test(line))) {
    out.push(
      `${subject}:1 defines no term at all — not one \`**term** — definition\` row. The three ` +
        'rules below are refusals, and an empty file breaks none of them, so a glossary that ' +
        'has lost its contents would otherwise pass exactly the way a whole one does.',
    )
    return out
  }
  const lines = text.split('\n')

  const fenceFailure = (line) =>
    `${subject}:${line} a fenced code block — the glossary is headings, prose and ` +
    '`**term** — definition` rows. A snippet, a listing or an example is a reference, ' +
    'and a reference is a document of its own that a pointer reaches.'

  let fence = null
  const inFence = []
  lines.forEach((line, index) => {
    const marker = /^\s*(```+|~~~+)/.exec(line)
    if (marker) {
      if (fence === null) fence = { char: marker[1][0], line: index + 1 }
      else if (marker[1][0] === fence.char) {
        out.push(fenceFailure(fence.line))
        fence = null
      }
    }
    inFence[index] = fence !== null || Boolean(marker)
  })
  if (fence !== null) out.push(fenceFailure(fence.line))

  lines.forEach((line, index) => {
    if (inFence[index]) return
    if (!line.trimStart().startsWith('|')) return
    const named = [...line.matchAll(/`([^`\n]+)`/g)]
      .map((match) => match[1])
      .filter((span) => namesAColumn(span))
    if (named.length === 0) return
    out.push(
      `${subject}:${index + 1} a table row naming ${named.map((one) => `\`${one}\``).join(', ')} — ` +
        'a table of column names restates the catalogue, which is what ' +
        `${INTERFACE_MAP} is generated to do. Put the row there ` +
        'and leave the glossary the word.',
    )
  })

  for (const section of sectionsIn(lines)) {
    if (section.body.some((line) => TERM_ROW.test(line))) continue
    out.push(
      `${subject}:${section.line} § ${section.heading} defines no term — a section with no ` +
        '`**term** — definition` row in it is a body, not a glossary entry. Move it to the ' +
        'document it is about, and leave the words it uses defined here.',
    )
  }

  return out
}

export function sweep(root = process.cwd(), subject = SUBJECT) {
  // The glossary is prose, so its bytes come from the `docs` subject rather
  // than from a path this file joins: a root document is the first thing that
  // sweep lists, and a glossary that is not there is a subject nobody measured
  // rather than a clean run.
  const prose = sweepSubject({ subject: 'docs', root, what: 'document' })
  const text = prose.read(subject)
  if (text === null) throw new Error(`no ${subject} under ${prose.base}: there is no glossary here`)
  const terms = text.split('\n').filter((line) => TERM_ROW.test(line)).length
  return { failures: findings(text, subject), terms, chars: text.length }
}

/**
 * The verdict: the glossary read for everything in it that is not a definition.
 *
 * Pure — it reads, decides, and hands back what it found and how many term rows it
 * counted. Nothing here prints or exits.
 */
export function judge(root = process.cwd()) {
  const { failures, terms, chars } = sweep(root)
  return {
    what: `a term row in ${SUBJECT}`,
    count: terms,
    findings:
      failures.length > 0
        ? [
            `[glossary] ${failures.length} thing(s) in ${SUBJECT} that are not a definition:\n` +
              failures.map((one) => `  ${one}`).join('\n') +
              '\n  -> the glossary defines the words and stops. Everything else is a document ' +
              'of its own with a pointer in AGENTS.md.',
          ]
        : [],
    line:
      `[glossary] ${SUBJECT} is ${terms} term rows of headings, prose and definitions ` +
      `(${chars.toLocaleString('en-US')} chars) — no code fence, no table naming a column, ` +
      'no section without a term.',
  }
}

whenRun(import.meta.url, judge)
