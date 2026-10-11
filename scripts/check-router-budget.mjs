#!/usr/bin/env node
/**
 * The always-loaded tier stays under a stated char budget, and the budget falls.
 *
 * A tier that bloats defeats the tier. `AGENTS.md` is handed to every session
 * before it decides anything, so every character in it is paid for by every
 * task, including the ones the character has nothing to do with — and a router
 * nobody finishes reading routes nobody. Who is in the tier, and why
 * `CONTEXT.md` and `INDEX.md` are not, is `scripts/always-loaded.mjs`.
 *
 * WHAT IS COUNTED: characters of the files in `ALWAYS_LOADED`, whole, as they
 * sit on disk; and, as a second census with its own budget, characters of
 * every skill and agent frontmatter description (`descriptionsIn`). No frontmatter stripping — these files have none — and no
 * tokenisation, because a char count is the number an author can check against
 * their own editor. The report names every file it counted and its size, so a
 * total is never printed without the census behind it.
 *
 * TWO DIRECTIONS, ONE CONSTANT. `BUDGET` is a ceiling: over it, the check
 * fails. It is also a RATCHET: fall more than `SLACK` below it and the check
 * fails too, asking for the budget to be lowered. A ceiling that only ever
 * blocks is a ceiling that stops describing the file — a router shrinks when
 * its bodies move out to the documents they name, and a budget written before
 * that cut goes on passing while meaning nothing. The downward failure is the
 * cheapest possible fix, a one-line edit, and it is what makes the number a
 * promise rather than a decoration.
 *
 * `SLACK` is wide on purpose. A pointer added or a trigger reworded moves the
 * file by tens of chars and must not turn the build red; only a cut big enough
 * to change what the budget describes does.
 *
 * The two numbers are this repository's own, in `scripts/repo-config.mjs`. A
 * ceiling is set against one router; copied to another, it describes a file it
 * never measured. The mechanism is the standard's always-loaded budget and is
 * the same file in every repository that carries it.
 *
 * Run: node scripts/check-router-budget.mjs   (also: npm run check:budget)
 */
import { ALWAYS_LOADED, DESCRIPTIONS_NOUN, TIER_NOUN, descriptionsIn } from './always-loaded.mjs'
import { repoConfig } from './repo-config.mjs'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/** The ceiling, in characters. Lower it whenever the tier lands well under. */
export const BUDGET = repoConfig.router.budget

/** How far under the budget the tier may sit before the budget is stale. */
export const SLACK = repoConfig.router.slack

/** The descriptions' own ceiling and slack, the same ratchet over the second census. */
export const DESCRIPTIONS_BUDGET = repoConfig.descriptions.budget
export const DESCRIPTIONS_SLACK = repoConfig.descriptions.slack

const withCommas = (n) => n.toLocaleString('en-US')

/**
 * The tier's census: one entry per file, plus the total.
 *
 * Exported so a test can measure a throwaway tree rather than the repository,
 * which is the only way to prove the failing branches without editing the real
 * router.
 *
 * The bytes come from the `docs` subject — the tier is prose, and a root
 * document is the first thing that sweep lists — so nothing here resolves a
 * root of its own or decides what an absent file means. `files` stays a
 * parameter: which files the tier holds is `always-loaded.mjs`'s answer.
 */
export function measure(root = process.cwd(), files = ALWAYS_LOADED) {
  const tier = sweep({ subject: 'docs', root, what: 'document' })
  const counted = files.map((rel) => {
    const text = tier.read(rel)
    // Counting an absent file as zero chars is a tier that reads as further
    // under budget the more of it goes missing.
    if (text === null) throw new Error(`no ${rel} under ${tier.base}: the ${TIER_NOUN} lost a file`)
    return { file: rel, chars: text.length }
  })
  return { counted, total: counted.reduce((sum, one) => sum + one.chars, 0) }
}

/**
 * The description census: one entry per skill or agent that carries a
 * frontmatter description, its chars, plus the total. Only the description is
 * counted; the body below it loads when the description fires.
 */
export function measureDescriptions(root = process.cwd()) {
  const tier = sweep({ subject: 'docs', root, what: 'document' })
  const counted = descriptionsIn(tier).map((one) => ({ file: one.file, chars: one.text.length }))
  return { counted, total: counted.reduce((sum, one) => sum + one.chars, 0) }
}

/**
 * The verdict, as the reader is owed it: the failures, and the line to print.
 *
 * Pure, so both failing branches can be asserted without a file on disk.
 */
export function verdict(
  { counted, total },
  { budget = BUDGET, slack = SLACK, noun = TIER_NOUN, key = 'router.budget' } = {},
) {
  const census = counted.map((one) => `${one.file} ${withCommas(one.chars)}`).join(' · ') || 'none'
  const failures = []
  if (total > budget) {
    failures.push(
      `[budget] over budget, the ${noun}: ${withCommas(total)} chars against ` +
        `${withCommas(budget)}, ${withCommas(total - budget)} over (${census}).\n` +
        '  -> move the body into the document the line names and leave the pointer. A rule\n' +
        '     that has to be inline — one that holds for every skill — stays, and the budget\n' +
        `     rises to fit it only as a deliberate edit to ${key} in scripts/repo-config.mjs,\n` +
        '     said out loud in the pull request.',
    )
  } else if (budget - total > slack) {
    failures.push(
      `[budget] the ${noun}: ${withCommas(budget - total)} chars under a ` +
        `${withCommas(budget)} budget, more than the ${withCommas(slack)} slack: the budget ` +
        `no longer describes the file (${census}).\n` +
        `  -> lower ${key} in scripts/repo-config.mjs to about ` +
        `${withCommas(total + slack / 2)}. A ceiling that only ever blocks stops being a\n` +
        '     ratchet, and a stale one passes while meaning nothing.',
    )
  }
  const margin = budget - total
  return {
    failures,
    line:
      `[budget] the ${noun}: ${withCommas(total)} chars against a ` +
      `${withCommas(budget)} budget — ${withCommas(margin)} to spare ` +
      `(${budget > 0 ? ((margin / budget) * 100).toFixed(1) : '0.0'}%). Counted: ${census}.`,
  }
}

/**
 * The verdict: the router tier and the descriptions measured, each held to
 * its own budget.
 *
 * Pure — it measures, decides, and hands back what it found. Nothing here prints
 * or exits.
 */
export function judge() {
  const router = measure()
  const described = measureDescriptions()
  const first = verdict(router)
  const second = verdict(described, {
    budget: DESCRIPTIONS_BUDGET,
    slack: DESCRIPTIONS_SLACK,
    noun: DESCRIPTIONS_NOUN,
    key: 'descriptions.budget',
  })
  return {
    what: `the files of the ${TIER_NOUN} and the ${DESCRIPTIONS_NOUN}`,
    count: router.counted.length + described.counted.length,
    findings: [...first.failures, ...second.failures],
    line: `${first.line}\n${second.line}`,
  }
}

whenRun(import.meta.url, judge)
