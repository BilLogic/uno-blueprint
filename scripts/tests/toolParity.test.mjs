import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

import { sweep } from '../sweep.mjs'
import { toolSources, toolsOnSurface } from '../tool-sources.mjs'

/**
 * The eval harness must run against the app's tool surface. The spec
 * DECLARATIONS are one-sourced — `surface.mjs` bundles `app-surface.entry.ts`
 * with rolldown once per run, that entry re-exports TOOL_SPECS from specs.ts
 * and derives WRITE_TOOL_NAMES from the definitions, and every harness module
 * imports them from `surface.mjs` — so the check is that the import wiring
 * still exists and no fork has crept back in.
 *
 * Deliberately text-parsed: `registry.ts` imports supabase-js and Vite
 * `?raw` markdown, so it cannot be loaded from Node without a bundler.
 */
// The runner copies test files into a temp dir, so paths resolve from the
// working directory (npm test runs at the repo root), not from import.meta.
const REPO_ROOT = process.cwd()

/** The application, wherever this tree keeps it. */
const app = sweep({ subject: 'app', root: REPO_ROOT })

/** A file of THIS tree: the harness, which a deployment holds beside this test. */
function read(path) {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8')
}

/**
 * A file of the APPLICATION, wherever this tree keeps it.
 *
 * The harness modules above are this repository's and sit next to this test in
 * every deployment. `specs.ts` and `registry.ts` are not: a deployment keeps no
 * `src` and reads them out of `node_modules/uno-blueprint`.
 * Read by hand from `src/…`, this file did not fail there — it threw ENOENT on
 * import, which took the parity checks out of the run entirely. So the sweep
 * reads them through the overlay, and a file it cannot find is a missing
 * subject said out loud rather than an empty string.
 */
function readApp(path) {
  const text = app.read(path)
  assert.ok(text !== null, `no ${path} under ${app.base}: this test has no subject`)
  return text
}


// The spec table lives in specs.ts (pure data); dispatch stays in
// registry.ts. The parity checks read each from where it lives.
const specs = readApp('src/lib/agent/tools/specs.ts')
const registry = readApp('src/lib/agent/tools/registry.ts')
const harness = read('scripts/agent-harness/run.mjs')
const bundler = read('scripts/agent-harness/surface.mjs')
const surfaceEntry = read('scripts/agent-harness/app-surface.entry.ts')

/**
 * A binding the runner takes from the bundled surface. Asserts the NAME is in
 * a destructured list, not the list's ORDER: a pin that spells the whole list
 * reds a correct harness the moment someone adds a binding or a formatter
 * rewraps it.
 */
function destructuredFromSurface(binding) {
  assert.match(
    harness,
    new RegExp(`\\{[^}]*\\b${binding}\\b[^}]*\\}\\s*=\\s*surface`),
    `run.mjs no longer takes ${binding} from the bundled surface`,
  )
}

/**
 * ONE SHARED REFUSAL, four pins — the shape every shared sentence gets, so the
 * next one is one line here and no sentence ends up guarded more loosely than
 * its neighbours.
 *
 *   `binding` the export name: `refusals.ts` must own it, the entry must
 *             re-export it, and run.mjs must destructure it.
 *   `copy`    a pattern over the WORDS of the sentence, which must not appear
 *             in run.mjs. Over the words, not the template syntax: a builder
 *             can be re-spelled as a concatenation, a `%s` format or a
 *             single-name literal, and a regex pinned to `${…}` sees none of
 *             those.
 *   `use`     where the harness's own gate answers with it. An import the
 *             dispatch never reaches is a sentence that only looks shared.
 *             Matched on the assignment alone — the binding in a result
 *             position — never on the `case` label above it or the whitespace
 *             between, which a reformat or an added `if` would move.
 *
 * WHY, once: see the header of `src/lib/agent/tools/refusals.ts`, which owns
 * the rule for what is shared and what is app-only. It is not restated here.
 */
function sharedRefusal({ binding, copy, use }) {
  assert.match(
    surfaceEntry,
    new RegExp(`export\\s*\\{[^}]*\\b${binding}\\b[^}]*\\}\\s*from\\s*'@/lib/agent/tools/refusals'`),
    `app-surface.entry.ts no longer re-exports ${binding} from refusals.ts`,
  )
  destructuredFromSurface(binding)
  assert.doesNotMatch(harness, copy, `run.mjs carries its own copy of ${binding}: ${copy}`)
  assert.match(harness, use, `run.mjs no longer answers its own gate with ${binding}`)
}

test('harness imports the app tool specs instead of forking them', () => {
  // The wiring: surface.mjs bundles the surface entry, the entry derives
  // the rosters from the definitions, and the runner destructures them from the
  // bundle surface.mjs hands it.
  assert.ok(
    bundler.includes("'app-surface.entry.ts'"),
    'surface.mjs no longer bundles app-surface.entry.ts, its neighbour',
  )
  assert.match(
    harness,
    /import\s*\{\s*surface\s*\}\s*from\s*'\.\/surface\.mjs'/,
    'run.mjs no longer takes the bundled surface from surface.mjs',
  )
  assert.match(
    surfaceEntry,
    /export\s*\{\s*TOOL_SPECS\s*\}\s*from\s*'@\/lib\/agent\/tools\/specs'/,
    'app-surface.entry.ts no longer re-exports TOOL_SPECS from specs.ts',
  )
  // The two rosters the harness gates on are derived from the app's
  // definitions inside the entry — the surface and availability each
  // definition states — not listed there.
  assert.match(
    surfaceEntry,
    /WRITE_TOOL_NAMES = new Set\(\s*TOOL_DEFINITIONS\.filter\(\(tool\) => tool\.surface === 'write'\)/,
    'app-surface.entry.ts no longer derives WRITE_TOOL_NAMES from the definitions',
  )
  // The mobile roster is NOT derived here any more, and must not come back:
  // the gate it fed is `admitToolCall`'s, so a set beside it is a second
  // answer to a question the app already answers, in whatever order the block
  // that reads it happens to sit.
  assert.doesNotMatch(
    surfaceEntry,
    /MOBILE_READ_TOOL_NAMES/,
    'app-surface.entry.ts derives a mobile roster again — the dispatch gate is the app’s',
  )
  assert.doesNotMatch(
    harness,
    /MOBILE_READ_TOOL_NAMES/,
    'run.mjs gates on a mobile roster of its own again — the fork is back',
  )
  // The reference list too, so the harness offers exactly the list the app
  // offers.
  assert.match(
    surfaceEntry,
    /export\s*\{\s*REFERENCE_NAMES\s*\}\s*from\s*'@\/lib\/agent\/tools\/referenceNames'/,
    'app-surface.entry.ts no longer re-exports REFERENCE_NAMES from referenceNames.ts',
  )
  for (const binding of [
    'TOOL_SPECS',
    'TOOL_DEFINITIONS',
    'WRITE_TOOL_NAMES',
    'AGENT_CELL_FIELDS',
    'renderCanvasAdapter',
    'rehearsalContext',
    'runTool',
  ])
    destructuredFromSurface(binding)
  // The refusals are destructured too, each with its own pins below.
  // A dry-run write answers in the TOOL's words: its own `run`, through the
  // app's own call seam, against the rehearsal context. The harness composed
  // a sentence per write before, which is a sentence the tool can change
  // without the harness noticing.
  assert.match(
    surfaceEntry,
    /export\s*\{\s*runTool\s*\}\s*from\s*'@\/lib\/agent\/tools\/definition'/,
    'app-surface.entry.ts no longer re-exports runTool from definition.ts',
  )
  assert.match(
    surfaceEntry,
    /export\s*\{\s*rehearsalContext\s*\}\s*from\s*'@\/lib\/agent\/tools\/rehearsal'/,
    'app-surface.entry.ts no longer re-exports rehearsalContext from rehearsal.ts',
  )
  assert.match(
    harness,
    /rehearsalContext\(\{ definition, args, placeholder \}\)/,
    'run.mjs no longer builds the rehearsal from the definition and the call’s own arguments',
  )
  assert.match(
    harness,
    /runTool\(definition, args, rehearsal\.ctx\)/,
    'run.mjs no longer rehearses a dry-run write through the tool’s own run',
  )
  for (const copy of [/accepted, ref dry-/, /Recorded \$\{args\.severity/]) {
    assert.doesNotMatch(harness, copy, `run.mjs composes a write result of its own: ${copy}`)
  }
  // THE REFUSALS. Each shared sentence gets the same four pins, through the
  // one helper above; `src/lib/agent/tools/refusals.ts` owns the rule for
  // which sentences are shared and why, and this test does not restate it.
  sharedRefusal({
    binding: 'BATCH_LIMIT_REFUSAL',
    copy: /Batch limit:/,
    use: /record\.result = BATCH_LIMIT_REFUSAL/,
  })
  sharedRefusal({
    binding: 'MOBILE_SHELL_REFUSAL',
    copy: /mobile shell is view-only/,
    use: /record\.result = MOBILE_SHELL_REFUSAL/,
  })
  sharedRefusal({
    binding: 'VIEW_ONLY_REFUSAL',
    copy: /view-only \(not a service account\)/,
    use: /record\.result = VIEW_ONLY_REFUSAL/,
  })
  sharedRefusal({
    binding: 'noSuchToolRefusal',
    // The one shared sentence BUILDER, so the copy that matters is the one a
    // regex over `${…}` cannot see. These words in run.mjs are a copy however
    // the name is spliced in: a template, a concatenation, a format string, or
    // one name hard-coded.
    copy: /There is no .{0,40} tool in this session/,
    use: /record\.result = noSuchToolRefusal\(name\)/,
  })
  // AND THE ONE THAT BECAME SHAREABLE. The app says `NO_SEARCH_REFUSAL` only
  // where the tool was never offered. The harness used to hand a provider the
  // whole spec table, `search_blueprint` included with no index behind it, so
  // the app's sentence was false of its session and it said a true one of its
  // own — the two readers disagreeing about the OFFER rather than the
  // wording. The offer is derived now (pinned below), the tool is absent from
  // that roster too, and the sentence is true on both sides. The harness's
  // own wording must be gone with it, or a case grades a recovery from a
  // steer no session gives.
  sharedRefusal({
    binding: 'NO_SEARCH_REFUSAL',
    // The first half of this sentence is `noSuchToolRefusal`'s, already
    // pinned above; the steer is the half only this one carries, and the half
    // a case grades.
    copy: /Use list_blueprint for what exists at a level/,
    use: /record\.result = NO_SEARCH_REFUSAL/,
  })
  assert.doesNotMatch(
    harness,
    /NO_SEARCH_HERE/,
    'run.mjs keeps a local ranked-search refusal beside the shared one',
  )
  // THE OFFER IS DERIVED, not mirrored. The harness declares the mode its
  // environment is in and the app's own `sessionRoster` decides membership
  // and order; the two gates run.mjs used to spell over the spec table are
  // the fork this replaced, and a filter naming them again is that fork back.
  assert.match(
    surfaceEntry,
    /export\s*\{\s*sessionRoster\s*\}\s*from\s*'@\/lib\/agent\/tools\/roster'/,
    'app-surface.entry.ts no longer re-exports sessionRoster from roster.ts',
  )
  destructuredFromSurface('sessionRoster')
  assert.match(
    harness,
    /sessionRoster\(harnessMode\(caseDef\)\)/,
    'run.mjs no longer derives the offer from the app roster for the case’s mode',
  )
  assert.doesNotMatch(
    harness,
    /TOOL_SPECS\.filter\([^)]*(?:MOBILE_READ_TOOL_NAMES|availability)/,
    'run.mjs filters the spec table by its own mode gates again — the roster fork is back',
  )
  // AND THE DISPATCH IS DERIVED TOO, which is the half the offer cannot
  // cover: a model can call a name it was never offered. `admitToolCall`
  // answers whether a call may run, so the mobile gate, the write gate and
  // the batch budget are the app's, applied in the app's order. Spelled here
  // again in an order of its own, a call tripping two of them reads back
  // whichever block sits first — the exact failure the app-side change
  // removed, which was still live on this side.
  assert.match(
    surfaceEntry,
    /export\s*\{\s*admitToolCall\s*\}\s*from\s*'@\/lib\/agent\/tools\/admission'/,
    'app-surface.entry.ts no longer re-exports admitToolCall from admission.ts',
  )
  destructuredFromSurface('admitToolCall')
  assert.match(
    harness,
    /admitToolCall\(\{\s*\n?\s*mode: harnessMode\(caseDef\)/,
    'run.mjs no longer asks the app whether a call may run, for the mode the case runs in',
  )
  // The three gates it used to spell. Each was an `if` over a case flag; a
  // dispatch that names one again has taken the question back.
  for (const [gate, pattern] of [
    ['the mobile gate', /caseDef\.mobile &&/],
    ['the write gate', /caseDef\.allowWrites === false &&/],
    ['the batch budget', /(?:executed|writesThisSend) >= WRITE_BATCH_LIMIT/],
  ])
    assert.doesNotMatch(
      harness,
      pattern,
      `run.mjs spells ${gate} in its dispatch again — the admission answer is the app's`,
    )
  // And no fork crept back: a local spec array would re-declare tool
  // objects (`name: '...'` entries) and a local write set would shadow the
  // imported roster.
  for (const [file, source] of [
    ['run.mjs', harness],
    ['surface.mjs', bundler],
    ['app-surface.entry.ts', surfaceEntry],
  ]) {
    assert.ok(
      !/TOOL_SPECS\s*(?::[^=]*)?=\s*\[/.test(source),
      `${file} declares a local TOOL_SPECS array — the fork is back`,
    )
    // The entry DERIVES the write set from the definitions (asserted above);
    // a `new Set` of names in either harness module would be a fork of it.
    if (file !== 'app-surface.entry.ts')
      assert.ok(
        !/WRITE_TOOL(?:_NAME)?S\s*=\s*new Set/.test(source),
        `${file} declares a local write set — the fork is back`,
      )
    assert.ok(
      !/^\s*\{\s*name: '[a-z_]+', description:/m.test(source),
      `${file} contains inline tool-spec declarations — the fork is back`,
    )
  }
})

/**
 * THE APP-ONLY CATEGORY, ENFORCED AS A CATEGORY.
 *
 * `refusals.ts` splits its sentences by one rule — share it when the harness
 * has a gate of its own whose answer is this same statement and the statement
 * is TRUE of the harness's session — and says at every sentence which side it
 * is on. That rule had exactly one enforcement, a `doesNotMatch` over the one
 * sentence that was then app-only; when `NO_SEARCH_REFUSAL` became shared the
 * check went with it and nothing stopped `SAMPLE_TRIAL_REFUSAL` or
 * `STOPPED_REFUSAL` crossing next.
 *
 * So the check is over the CATEGORY, derived from the declarations
 * themselves: every documented export of `refusals.ts` must declare a side,
 * the entry must re-export every SHARED one and nothing marked APP-ONLY, and
 * every shared sentence must reach the runner — an export the dispatch never
 * reads is a sentence that only looks shared. A new refusal is covered on the
 * day it is written, with no line to add here.
 */
test('the harness entry re-exports exactly the shared refusals, and nothing app-only', () => {
  const refusals = readApp('src/lib/agent/tools/refusals.ts')
  // A doc comment immediately followed by its export. The body may not span a
  // `*/`, so the module header — which states the RULE, app-only and all —
  // pairs with nothing and is not read as a declaration.
  const documented = [
    ...refusals.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*export (?:const|function) (\w+)/g),
  ]
  assert.ok(
    documented.length >= 10,
    `read ${documented.length} documented exports from refusals.ts: this check has no subject`,
  )
  const shared = []
  const appOnly = []
  const undeclared = []
  for (const [, doc, name] of documented) {
    if (/APP-ONLY/.test(doc)) appOnly.push(name)
    else if (/SHARED/.test(doc)) shared.push(name)
    else undeclared.push(name)
  }
  // Every SENTENCE picks a side. `WRITE_BATCH_LIMIT` is the one export that
  // is not a sentence — a number two gates quote — so it is the only thing
  // allowed to be silent; anything else silent here is a sentence that never
  // answered the rule, and would be read as shareable by default.
  assert.deepEqual(
    undeclared,
    ['WRITE_BATCH_LIMIT'],
    'a refusal in refusals.ts declares neither SHARED nor APP-ONLY — the rule in its header is the one thing every sentence has to answer',
  )
  assert.ok(shared.length > 0 && appOnly.length > 0, 'the split is empty on one side')
  const reExported = [
    ...surfaceEntry.matchAll(
      /export\s*\{([^}]*)\}\s*from\s*'@\/lib\/agent\/tools\/refusals'/g,
    ),
  ].flatMap((match) =>
    match[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  )
  assert.deepEqual(
    [...reExported].sort(),
    [...shared].sort(),
    'app-surface.entry.ts no longer re-exports exactly the sentences refusals.ts marks SHARED',
  )
  // The stronger half: an app-only sentence must not appear in the entry AT
  // ALL, re-exported or imported for something else. The refusal it answers
  // has no gate on the far side, so a case that met it would grade a recovery
  // from a steer no session there gives.
  for (const name of appOnly)
    assert.doesNotMatch(
      surfaceEntry,
      new RegExp(`\\b${name}\\b`),
      `app-surface.entry.ts carries ${name}, which refusals.ts marks APP-ONLY — see the rule in its header`,
    )
  // And each shared one reaches the dispatch that says it.
  for (const name of shared) destructuredFromSurface(name)
})


/**
 * NO TOOL RESULT SENTENCE IS WRITTEN TWICE.
 *
 * The checks above name the copies that were found and removed, one regex
 * each — which catches those and nothing else. This one is the rule they were
 * instances of: a sentence the harness hands a model as a tool result must
 * not also exist in the application, because then the application can reword
 * it and the harness will go on saying the old words, and the eval will pass
 * against a sentence no tool says.
 *
 * WHAT IT COMPARES. A "sentence literal" is a quoted string with a space in
 * it, at least 20 characters long, with every `${…}` reduced to `${}` so a
 * template matches the same template written with different variable names.
 * On the harness side it reads the literals in RESULT POSITIONS — a line
 * carrying `record.result`, a `return`, a ternary arm, or a SHOUTING const —
 * which is where a tool result is composed; on the application side it sweeps
 * every literal under `src/lib/agent`, through the overlay, so a deployment's
 * own copy of a read is the subject when it has one.
 *
 * WHAT IT DOES NOT CATCH, said out loud: a short sentence, a sentence with no
 * space, and the system-prompt ASSEMBLY, which is declared mirrored-by-hand in
 * run.mjs's header and is not a tool result. Those are the header's business.
 */
const SENTENCE = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
const RESULT_POSITION = /record\.result|\breturn\b|^\s*[?:]\s|^\s*(?:const|let) [A-Z][A-Z0-9_]*\s*=/
const sentences = (text) => {
  const found = new Set()
  for (const match of text.matchAll(SENTENCE)) {
    const literal = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, '${}')
    if (literal.length >= 20 && literal.includes(' ')) found.add(literal)
  }
  return found
}

test('run.mjs composes no tool result sentence the app already says', () => {
  const appSentences = new Set()
  const agent = sweep({
    subject: 'app',
    root: REPO_ROOT,
    where: (path) => path.startsWith('src/lib/agent/') && path.endsWith('.ts'),
    what: 'agent tool surface',
  })
  for (const path of agent.files) {
    const text = agent.read(path)
    if (text !== null) for (const sentence of sentences(text)) appSentences.add(sentence)
  }
  assert.ok(appSentences.size > 0, 'swept no sentences from src/lib/agent: this check has no subject')
  const copies = []
  for (const line of harness.split('\n')) {
    if (!RESULT_POSITION.test(line)) continue
    for (const sentence of sentences(line)) if (appSentences.has(sentence)) copies.push(sentence)
  }
  assert.deepEqual(
    copies,
    [],
    `run.mjs hands a model a sentence the app also says — export it from the src module that owns it, re-export it through app-surface.entry.ts, and use the export: ${copies.map((copy) => JSON.stringify(copy)).join(', ')}`,
  )
})

/**
 * The case file's write list is the dangerous one: a name missing from it
 * makes a "no writes happened" trace check PASS, so drift there hides itself
 * instead of failing loudly. `harness-write-list.test.mjs` pins that it is
 * imported from the bundled surface; this pins that what the trace checks
 * count against IS that roster, not a set built from it or beside it.
 */
test('cases.mjs counts writes against the app write roster itself', () => {
  const cases = read('scripts/agent-harness/cases.mjs')
  assert.match(
    cases,
    /^const WRITES = WRITE_TOOL_NAMES\s*$/m,
    'cases.mjs WRITES is no longer the imported WRITE_TOOL_NAMES roster',
  )
  assert.ok(
    !/WRITES\s*=\s*new Set\(/.test(cases),
    'cases.mjs builds its own write set again — it will drift from specs.ts',
  )
})

/**
 * Every tool is a definition: its schema, its handler and its roster facts
 * are one object under `definitions/`, and `TOOL_SPECS` is a projection of
 * that list. What used to be checked here — that a spec literal had a
 * dispatch case and read the arguments it advertised — is now what the
 * compiler checks. What remains to hold is that the old shape stays gone:
 * no literal back in the spec table, no `case` back in the dispatcher, and
 * every name the write roster still lists is a definition.
 */
test('the spec table declares nothing and the dispatcher switches on nothing', () => {
  assert.ok(
    !/^\s*\{\s*name: '[a-z_]+'/m.test(specs),
    'specs.ts holds an inline tool-spec literal again — a tool is one definition',
  )
  assert.ok(
    !/\bcase '[a-z_]+':/.test(registry),
    'registry.ts dispatches by switch case again — a tool is run from its definition',
  )
  assert.match(
    specs,
    /TOOL_SPECS: ToolSpec\[\] = TOOL_DEFINITIONS\.map\(toolSpec\)/,
    'TOOL_SPECS is no longer a projection of the definition list',
  )
})

test('every write tool is a defineWriteTool definition', () => {
  const definitions = toolSources(REPO_ROOT)
  const writes = toolsOnSurface(definitions, 'write')
  assert.equal(writes.length, 27, `expected the write tools and proposal decisions, found ${writes.length}`)
  for (const name of writes) {
    assert.ok(
      /^export const \w+ = defineWriteTool\(/m.test(definitions) && definitions.includes(`name: '${name}'`),
      `${name} is on the write surface but no definition declares it`,
    )
  }
})

/**
 * The declarations are IMPORTED rather than parsed: specs.ts is pure data and
 * loads in Node. The projection must offer every tool the definitions
 * declare, in their order, and nothing a definition did not declare.
 */
const TOOL_SPECS = (await import('@/lib/agent/tools/specs')).TOOL_SPECS
const TOOL_DEFINITIONS = (await import('@/lib/agent/tools/definitions')).TOOL_DEFINITIONS
const { sessionRoster } = await import('@/lib/agent/tools/roster')

test('the spec table is the definition list, projected', () => {
  assert.deepEqual(
    TOOL_SPECS.map((spec) => spec.name),
    TOOL_DEFINITIONS.map((tool) => tool.name),
  )
  for (const spec of TOOL_SPECS) {
    assert.equal(spec.parameters.type, 'object', `${spec.name} has no object schema`)
  }
})

/**
 * WHAT THE HARNESS IS ACTUALLY OFFERED, pinned rather than counted in prose.
 *
 * Deriving the offer narrowed it, and the narrowing was described by a pair of
 * tool counts that nothing checked — a number in a description ages into a
 * wrong number. The mode run.mjs declares is text (the runner needs a
 * provider, so it cannot be imported here); the offer for that mode is the
 * app's own roster, and this says which tools it is: everything, less ranked
 * search, because no index and no embedding key is the truth of this
 * environment.
 */
test('the harness offer is the app roster for the mode run.mjs declares', () => {
  for (const [field, pattern] of [
    ['sampleTrial: false', /sampleTrial: false,/],
    ['searchOffered: false', /searchOffered: false,/],
    ['mobileReading off the case', /mobileReading: Boolean\(caseDef\.mobile\),/],
    ['allowWrites off the case', /allowWrites: caseDef\.allowWrites !== false,/],
  ])
    assert.match(harness, pattern, `run.mjs no longer declares ${field} in harnessMode`)
  const HARNESS = {
    sampleTrial: false,
    mobileReading: false,
    allowWrites: true,
    searchOffered: false,
  }
  const named = (mode) => sessionRoster(mode).map((tool) => tool.name)
  assert.deepEqual(
    named(HARNESS),
    TOOL_DEFINITIONS.filter((tool) => tool.name !== 'search_blueprint').map((tool) => tool.name),
    'the harness desktop offer is no longer every tool but ranked search',
  )
  assert.deepEqual(
    named({ ...HARNESS, mobileReading: true }),
    TOOL_DEFINITIONS.filter(
      (tool) => tool.availability.mobile && tool.name !== 'search_blueprint',
    ).map((tool) => tool.name),
    'the harness mobile offer is no longer the mobile-available tools but ranked search',
  )
  assert.deepEqual(
    named({ ...HARNESS, allowWrites: false }).filter((name) =>
      TOOL_DEFINITIONS.some((tool) => tool.name === name && tool.surface === 'write'),
    ),
    [],
    'a view-only harness case is offered a write tool',
  )
})
