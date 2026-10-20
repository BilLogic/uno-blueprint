/**
 * Check D — a word this template ships to an agent is a word this template defines.
 *
 * #86: `skills/audit/SKILL.md` tells an agent to read "the spec columns" and
 * `skills/slice/SKILL.md` told it to apply "the derived-layer migrations",
 * while the glossary — the file that exists to be the vocabulary — had never
 * heard of either. Both words were published, in shipped skill documents, to
 * every instance built from this template.
 *
 * Two halves, and they fail differently:
 *
 * **RETIRED SPELLINGS.** "derived layer" is built on `layer`, which `21000104`
 * retired when `layers` became `lanes`, and it is wrong on its own terms —
 * only `findings` is derived, because a human may author a slice. Its
 * replacement, "analysis tier", is retired too: evidence is source material and
 * a slice is a presentation, neither is analysis, and `tier` already names an
 * access level. Nothing in the catalogue ever carried either phrase, so no
 * database check can reach them and `check-retired-identifiers` never will.
 * They are prose, so only a prose sweep finds them.
 *
 * **UNDEFINED LOAD-BEARING WORDS.** The opposite failure. `spec`, `slice`,
 * `finding` and `evidence` are the current, correct words; the defect is that
 * an agent is instructed to use them and given nowhere to look them up. A word
 * the skills depend on must be defined where a reader looks for definitions.
 *
 * The list is the four records SEPARATELY on purpose. It used to be one entry,
 * `analysis tier`, and the collective noun is what went stale — twice — while
 * the words for the things themselves never did.
 *
 * SUBJECT: the text this template *publishes* — `GLOSSARY.md`, `AGENTS.md`, and
 * markdown under `skills/`, `references/` and `docs/`. Not source comments,
 * which no agent reads, and not the three exempt classes below.
 *
 * THE EXEMPTION IS A RULE, NOT A LIST: **an applied or dated record keeps the
 * spelling it was written with.** Migrations every instance has already run,
 * the files generated from them, and changelog entries for shipped releases all
 * say what was true when they were written. Rewriting an applied migration to
 * tidy a comment makes applied migrations mutable, which costs more than the
 * tidiness is worth. The "words that keep a retired spelling" section in the
 * header of `scripts/check-retired-identifiers.mjs` records the same rule in
 * prose for the person running the next sweep — it was `CONTEXT.md`'s until
 * #137 moved it beside the check that acts on it.
 *
 * IF THIS PRODUCES A FALSE POSITIVE, NARROW THE SUBJECT — NEVER THE WORD LIST.
 * A retired word dropped to silence one legitimate use becomes a rule that
 * never covered it, and the next person cannot tell the difference.
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname)
const RERUN = 'npm test -- scripts/tests/agent-vocabulary.test.mjs'

/** The trees whose markdown is published to an agent or to a reader. */
const PUBLISHED_DIRS = ['skills', 'references', 'docs']
const PUBLISHED_FILES = ['GLOSSARY.md', 'AGENTS.md', 'README.md']

/**
 * Applied or dated records, which keep their spelling.
 *
 * `docs/` is swept, so the one file inside it that transcribes migration
 * headers is named here rather than the whole tree being dropped.
 */
const EXEMPT = [
  'supabase/migrations/',
  'supabase/generated/',
  'CHANGELOG.md',
]

/**
 * Retired prose spellings, and what to say instead.
 *
 * The first two entries are collective nouns for the same four records, and
 * both were retired for the same reason: no one word is true of `evidence`,
 * `findings`, `slices` and `slides` at once. There is no third noun, so the
 * replacement is to name the record — or, where a sentence genuinely covers
 * all four, to enumerate them. The header of `scripts/retired-vocabulary.mjs`
 * carries the argument, which is also why that file is not swept: it is code,
 * and the one place those two phrases are allowed to be written out.
 *
 * `kit` is the third. It named the template (#552). Whole-word, so `kitchen`,
 * `toolkit` and `kitfox` stay live English. The map's copy list is what holds
 * the same word on screen; this list holds it in published markdown.
 */
const RETIRED_PROSE = [
  { pattern: /derived[\s-]+layer/gi, use: 'the record’s own name' },
  { pattern: /analysis[\s-]+tier/gi, use: 'the record’s own name' },
  { pattern: /\bkit\b/gi, use: 'template' },
]

/**
 * Words the skills instruct an agent to use, which therefore have to be
 * DEFINED — not merely present.
 *
 * The distinction is the whole check, and getting it wrong made this vacuous
 * the first time: a substring search for "spec" is satisfied by "specific",
 * "respective" and "specification", so deleting the definition outright left
 * the test green. `GLOSSARY.md` opens every definition with the term in bold,
 * so that is what is looked for.
 */
const MUST_BE_DEFINED = ['Slice', 'Finding', 'Evidence', 'Spec', 'Template', 'Deployment']

function guardFailure(location, message) {
  return `${location}: ${message}\nRun: ${RERUN}`
}

function retiredVocabularyFailure(offenders) {
  const location = offenders[0]?.split(' — ')[0] ?? 'scripts/tests/agent-vocabulary.test.mjs:1'
  return guardFailure(
    location,
    `Retired vocabulary in text this template publishes:\n  ${offenders.join('\n  ')}\n\n` +
      `These are shipped to every instance built from this template. Applied ` +
      `migrations, generated files and changelog entries are exempt — an applied ` +
      `or dated record keeps the spelling it was written with.`,
  )
}

function missingDefinitionsFailure(missing) {
  return guardFailure(
    'GLOSSARY.md:1',
    `Not defined in GLOSSARY.md: ${missing.join(', ')} — a definition is a ` +
      `bolded term followed by an em dash, the shape every other entry uses. ` +
      `A skill instructs an agent to use these words (see skills/audit/SKILL.md ` +
      `on the spec columns). A word an agent is told to read has to be defined ` +
      `where a reader looks for definitions.`,
  )
}

test('guard failures name a source line and the focused rerun command', () => {
  assert.equal(
    retiredVocabularyFailure(['skills/slice/SKILL.md:16 — "derived layer", use "analysis tier"']),
    'skills/slice/SKILL.md:16: Retired vocabulary in text this template publishes:\n' +
      '  skills/slice/SKILL.md:16 — "derived layer", use "analysis tier"\n\n' +
      'These are shipped to every instance built from this template. Applied migrations, ' +
      'generated files and changelog entries are exempt — an applied or dated record keeps ' +
      'the spelling it was written with.\n' +
      'Run: npm test -- scripts/tests/agent-vocabulary.test.mjs',
  )
  assert.equal(
    missingDefinitionsFailure(['Spec']),
    'GLOSSARY.md:1: Not defined in GLOSSARY.md: Spec — a definition is a bolded term followed ' +
      'by an em dash, the shape every other entry uses. A skill instructs an agent to use ' +
      'these words (see skills/audit/SKILL.md on the spec columns). A word an agent is told ' +
      'to read has to be defined where a reader looks for definitions.\n' +
      'Run: npm test -- scripts/tests/agent-vocabulary.test.mjs',
  )
})

function markdownUnder(dir) {
  const root = resolve(REPO_ROOT, dir)
  const out = []
  let entries
  try {
    entries = readdirSync(root)
  } catch {
    return out
  }
  for (const name of entries) {
    const path = resolve(root, name)
    if (statSync(path).isDirectory()) {
      out.push(...markdownUnder(relative(REPO_ROOT, path)))
    } else if (name.endsWith('.md')) {
      out.push(path)
    }
  }
  return out
}

function publishedMarkdown() {
  const files = [
    ...PUBLISHED_DIRS.flatMap(markdownUnder),
    ...PUBLISHED_FILES.map((name) => resolve(REPO_ROOT, name)),
  ]
  return files.filter((path) => {
    const rel = relative(REPO_ROOT, path)
    return !EXEMPT.some((prefix) => rel.startsWith(prefix))
  })
}

test('no retired prose spelling reaches a published document', () => {
  const offenders = []
  for (const path of publishedMarkdown()) {
    let source
    try {
      source = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const rel = relative(REPO_ROOT, path)
    /*
      `CONTEXT.md` used to need a stopping point. It documented its own
      retirements, and a file that names the word it is retiring cannot be swept
      end to end, so this sweep ran only as far as its rename map. #137 moved
      that map — and the two collective nouns' whole argument — into
      `scripts/retired-vocabulary.mjs`, which is code and therefore outside the
      published subject. So the glossary is swept whole, like every other
      published document, and no document in the subject is allowed to say
      either phrase.
    */
    for (const { pattern, use } of RETIRED_PROSE) {
      for (const match of source.matchAll(pattern)) {
        // A migration FILENAME is an applied record too: the file is named
        // `..._derived_layer.sql` on every instance and renaming the reference
        // would point at a file that does not exist.
        const around = source.slice(Math.max(0, match.index - 40), match.index + 60)
        if (/_derived_layer[\w.]*\.sql/.test(around) && /_/.test(match[0])) continue
        const line = source.slice(0, match.index).split('\n').length
        offenders.push(`${rel}:${line} — "${match[0]}", use "${use}"`)
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    retiredVocabularyFailure(offenders),
  )
})

test('every word the skills are told to use is defined in GLOSSARY.md', () => {
  const glossary = readFileSync(resolve(REPO_ROOT, 'GLOSSARY.md'), 'utf8')
  const missing = MUST_BE_DEFINED.filter(
    (term) => !new RegExp(`^\\*\\*${term}\\*\\* —`, 'mi').test(glossary),
  )
  assert.deepEqual(
    missing,
    [],
    missingDefinitionsFailure(missing),
  )
})

test('the sweep can fail', () => {
  // The guard above is a regex over prose, which is the kind of check that
  // passes because it matched nothing. Prove it matches what it claims to,
  // and does not match the applied-filename case it permits.
  const hits = (text) =>
    RETIRED_PROSE.flatMap(({ pattern }) => [
      ...text.matchAll(new RegExp(pattern.source, pattern.flags)),
    ])
  assert.equal(hits('apply the derived-layer migrations').length, 1)
  assert.equal(hits('the derived layer exists').length, 1)
  assert.equal(hits('Derived Layer: slices, findings').length, 1)
  // The second noun, which used to be this rule's ADVICE. A sweep that still
  // recommended it would have kept shipping the word it now retires.
  assert.equal(hits('the analysis tier exists').length, 1)
  assert.equal(hits('Analysis tier: slices, findings').length, 1)
  assert.equal(hits('analysis-tier records reference cells softly').length, 1)
  // Neither pattern is a sweep for the word "analysis" or the word "layer".
  assert.equal(hits('the audit tier of this analysis, one layer at a time').length, 0)
  assert.equal(hits('a slice belongs to the slice; evidence belongs to nobody').length, 0)
  // #552 — kit names the template. Whole-word, so kitchen / toolkit / kitfox
  // stay live English.
  assert.equal(hits('cloned the kit').length, 1)
  assert.equal(hits('the Kit ships a sample').length, 1)
  assert.equal(hits('kitchen').length, 0)
  assert.equal(hits('the toolkit').length, 0)
  assert.equal(hits('kitfox').length, 0)
})

test('the definition check can fail, and is not satisfied by a substring', () => {
  // "spec" appears inside "specific" and "respective". The first version of
  // this check searched for the bare word and stayed green with the definition
  // deleted.
  const defined = (term, text) => new RegExp(`^\\*\\*${term}\\*\\* —`, 'mi').test(text)
  assert.equal(defined('Spec', '**Spec** — the descriptive detail hanging off a board object.'), true)
  assert.equal(defined('Spec', 'the specific respective specification of a spec'), false)
  assert.equal(defined('Evidence', '**Evidence** — one provenance record attached to a cell.'), true)
  assert.equal(defined('Evidence', 'evidence is cited by a slice and weighed by an audit'), false)
})
