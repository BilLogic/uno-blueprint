import { expect, test } from 'vitest'
import { sourceOf, sourcePathsOn } from '@/lib/sourceTree'

/**
 * A write that is refused is translated, never forwarded raw.
 *
 * `AuthoringError` exists so that a person reads a sentence and the console
 * reads Postgres. A module that raises `new Error(error.message)` around it
 * sends the database's own text to the panel — `new row violates row-level
 * security policy for table "phases"` is not something to show a reader — and
 * discards `.raw`, which is the only place the original survives.
 *
 * Since the funnel gained a side effect, a module that routes around it loses
 * more than the phrasing: `toAuthoringError` is where an authorization denial
 * re-derives the session tier, so a raw raise is also a refused write that
 * leaves the UI still offering the button the database just refused.
 *
 * The rule is scoped to the modules that WRITE, and deliberately not wider. A
 * hook raising `error.message` from a `.select()` is a different problem with
 * a different answer: a failed read has no authoring failure to phrase, and
 * widening this to every file would make it a list of exemptions rather than a
 * rule. `lib/*Mutations.ts` is matched by shape, because adding one is the
 * sanctioned way to add a write and should not need an edit here.
 *
 * The pattern is anchored at `lib/` on purpose: a `components/FooMutations.ts`
 * is not a mutation module, it is this test being routed around.
 */
const MUTATION_MODULE = /^lib\/[A-Za-z]+Mutations\.ts$/

/** Writers outside the `*Mutations` family, each asserted to exist below. */
const ALSO_WRITES: readonly string[] = ['lib/authoringRpc.ts', 'lib/agent/tools/definitions/slices.ts']

const RAW_THROW = /throw new Error\(\s*[A-Za-z_$][\w$]*\.message\s*\)/g

const writers = sourcePathsOn().filter(
  (relative) => MUTATION_MODULE.test(relative) || ALSO_WRITES.includes(relative),
)

test('the writers this rule covers exist, so a rename fails loudly', () => {
  // A set derived by pattern can quietly become empty. Both halves are held:
  // the shape matches something, and every named exception is still a file.
  expect(writers.filter((one) => MUTATION_MODULE.test(one)).length).toBeGreaterThan(0)
  for (const named of ALSO_WRITES) expect(writers).toContain(named)
})

test('a write that is refused is translated, never forwarded raw', () => {
  const offenders: string[] = []
  for (const relative of writers) {
    const text = sourceOf(relative)
    for (const hit of text.match(RAW_THROW) ?? []) {
      offenders.push(`src/${relative}: ${hit}`)
    }
  }

  expect(
    offenders,
    offenders.length === 0
      ? ''
      : `Raw database text raised at the reader:\n  ${offenders.join('\n  ')}\n\n` +
        'Use `throw toAuthoringError(error)`. It phrases the failure for a ' +
        "person, keeps the database's own text on `.raw` for the console, " +
        'and is where an authorization denial re-derives the session tier.',
  ).toEqual([])
})

test('the translation rule can fail', () => {
  // A regex over source text passes just as happily when it matches nothing.
  // Prove it matches the shape it claims to, and permits the shape it permits.
  expect('if (error) throw new Error(error.message)'.match(RAW_THROW)).not.toBeNull()
  expect('throw new Error(readError.message)'.match(RAW_THROW)).not.toBeNull()
  expect('throw toAuthoringError(error)'.match(RAW_THROW)).toBeNull()
  expect('throw new Error(`That ${subject} no longer exists.`)'.match(RAW_THROW)).toBeNull()
})
