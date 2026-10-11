#!/usr/bin/env node
/**
 * Prohibition tokens across the always-loaded tier only fall.
 *
 * Steering by prohibition drags the forbidden behaviour into context and makes
 * it MORE available, not less — "don't think of an elephant". The fix is to
 * prompt the positive: state the target behaviour, so the banned one is never
 * spoken. A prohibition earns its place as a hard guardrail that cannot be
 * phrased positively — a rule that holds for every skill, inline in the router
 * because it binds before any pointer fires, is that category — and even then
 * it carries its positive twin.
 *
 * This is a RATCHET, not a threshold. A threshold invites arguing about the
 * number and gets switched off the day it blocks someone; a ratchet only asks
 * that the count go down. It is the standard's negation ratchet, and the same
 * file in every repository that carries it — the same metric, the same five
 * tokens and the same quoted-speech rule — so that one harness review reads
 * every repository's number the same way. Only the number is each
 * repository's own.
 *
 * ── WHAT IS COUNTED, AND WHAT IS NOT ────────────────────────────────────────
 *
 * PROHIBITION TOKENS: five imperative bans, and the metric is named that
 * wherever it is printed, because it is not a count of negation as written. A
 * regex broad enough to catch negation as written also catches the contrastive
 * appositive — "a variant is an alternative, not a stage" — which STATES A
 * TARGET and names the near miss beside it, so broadening the pattern would
 * penalise the writing this guard exists to encourage. Every match here is an
 * imperative ban, which is what makes the number impossible to litigate at the
 * moment it blocks someone.
 *
 * Quoted speech and code spans are exempt: `never` inside a code span is an
 * identifier, and `Say "I don't know"` is an instruction TO do something.
 *
 * SCOPE is the always-loaded tier — the files in `scripts/always-loaded.mjs`,
 * which cost every session their whole length before any task begins, and
 * every skill and agent frontmatter description, which costs every turn the
 * same way. A description scores under its file's name with ` (description)`
 * after it, and counts as one file measured.
 * Everything else loads when a pointer fires, and the decision records are
 * append-only: a record saying "X is not reversible" ADDS prohibitions by
 * doing its job, so a ratchet over them would rise by construction.
 *
 * ── THE RECORDED COUNT ──────────────────────────────────────────────────────
 *
 * `RECORDED` is the baseline, kept in `scripts/repo-config.mjs` with this
 * repository's other numbers rather than in a JSON file beside this script:
 * one place to look for every number a check holds this repository to, and a
 * script that is the same in every repository. It carries the FILE COUNT as well as the token
 * count, and a run measuring fewer files fails — a ratchet fails only when the
 * count RISES, so a corpus that lost a file clears it every time and reports a
 * smaller, greener number while doing so.
 *
 * A fall is a pass with a nudge to re-record: the count is a fact about prose,
 * and a good rewrite must never arrive as a red build. (The char budget next
 * door DOES fail downward, because a stale ceiling silently stops describing
 * the file, while a stale prohibition count still blocks every rise it was
 * recorded to block.)
 *
 * Run: node scripts/check-negation-ratchet.mjs   (also: npm run check:negation)
 */
import { ALWAYS_LOADED, TIER_NOUN, descriptionsIn } from './always-loaded.mjs'
import { repoConfig } from './repo-config.mjs'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'


/** The five tokens, in one place, so the regex and the label cannot drift apart. */
export const PROHIBITION_TOKENS = ['never', "don't", 'do not', 'cannot', 'must not']

/** What the number is called wherever it is written down or printed. */
export const METRIC = 'prohibition tokens'

/** The baseline: what the tier scored when this repository last recorded it. */
export const RECORDED = repoConfig.router.prohibitions

const PROHIBITION = new RegExp(`\\b(${PROHIBITION_TOKENS.join('|')})\\b`, 'gi')
const stripQuoted = (text) => text.replace(/"[^"\n]*"/g, '""').replace(/`[^`\n]*`/g, '``')

/**
 * One document's score.
 *
 * Exported so the tests assert the REAL counter rather than a re-implementation
 * of it — including what it deliberately does not see.
 */
export const countProhibitions = (text) => (stripQuoted(text).match(PROHIBITION) || []).length

/**
 * The tier's census: one entry per file that scores, plus the total.
 *
 * The bytes come from the `docs` subject — the tier is prose, and a root
 * document is the first thing that sweep lists — so this file neither joins a
 * path onto a root of its own nor decides what an absent one means. `files`
 * stays a parameter, because which files the tier holds is
 * `always-loaded.mjs`'s answer and a test hands its own list.
 */
export function measure(root = process.cwd(), files = ALWAYS_LOADED) {
  const counts = {}
  let total = 0
  const tier = sweep({ subject: 'docs', root, what: 'document' })
  for (const rel of files) {
    const text = tier.read(rel)
    // A tier file that is not there is the shrink this ratchet fails on, said
    // where the reader can see which file: counting it as zero would report a
    // smaller, greener number instead.
    if (text === null) throw new Error(`no ${rel} under ${tier.base}: the ${TIER_NOUN} lost a file`)
    const n = countProhibitions(text)
    if (n > 0) counts[rel] = n
    total += n
  }
  const described = descriptionsIn(tier)
  for (const one of described) {
    const n = countProhibitions(one.text)
    if (n > 0) counts[`${one.file} (description)`] = n
    total += n
  }
  return { files: files.length + described.length, counts, total }
}

/**
 * The verdict. Pure, so both failing branches can be asserted without authoring
 * a prohibition into the real router.
 */
export function verdict({ files, counts, total }, recorded = RECORDED) {
  const census =
    Object.entries(counts)
      .map(([file, n]) => `${file} ${n}`)
      .join(' · ') || 'none'
  const failures = []
  if (files < recorded.files) {
    failures.push(
      `[negation] the ${TIER_NOUN} shrank: ${files} file(s) measured, against the ` +
        `${recorded.files} this count was recorded over.\n` +
        '  -> A ratchet fails only when the count RISES, so a tier that lost a file passes\n' +
        '     every time, and passes with a SMALLER number that reads like progress. If a\n' +
        '     file left the tier on purpose, re-record router.prohibitions in\n' +
        '     scripts/repo-config.mjs and say which, and why.',
    )
  } else if (total > recorded.tokens) {
    failures.push(
      `[negation] ${METRIC} across the ${TIER_NOUN} rose ${recorded.tokens} -> ${total} (${census}).\n` +
        '  -> state the target behaviour instead of banning its opposite. A ban that is a real\n' +
        '     guardrail keeps its place — a rule that holds for every skill is that category —\n' +
        '     but pair it with the positive so attention lands on what to do. If the rise is\n' +
        '     deliberate, raise router.prohibitions.tokens in scripts/repo-config.mjs and say why.',
    )
  }
  const fell = total < recorded.tokens
  return {
    failures,
    line:
      `[negation] ${total} ${METRIC} (${PROHIBITION_TOKENS.join(' / ')}) across the ` +
      `${TIER_NOUN}, against a recorded ${recorded.tokens} — ${census}` +
      (fell
        ? `. Down ${recorded.tokens - total}: lower router.prohibitions.tokens in ` +
          `scripts/repo-config.mjs to ${total}.`
        : '.'),
  }
}

/**
 * The verdict: the prohibitions in the router tier counted, and held to the
 * recorded number.
 *
 * Pure — it measures, decides, and hands back what it found. Nothing here prints
 * or exits.
 */
export function judge() {
  const counted = measure()
  const { failures, line } = verdict(counted)
  return { what: `the files of the ${TIER_NOUN}`, count: counted.files, findings: failures, line }
}

whenRun(import.meta.url, judge)
