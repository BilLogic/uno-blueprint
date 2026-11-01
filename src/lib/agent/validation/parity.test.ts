// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { pythonVerdicts } from '@/test/blueprintValidatorParity'
import { validateDocument } from './service'

type Example = { name: string; document: unknown }
const sample = JSON.parse(readFileSync('scripts/tests/sample-ir.json', 'utf8'))
const examples: Example[] = [{ name: 'committed bilingual blueprint', document: sample }]
function change(path: (string | number)[], value: unknown, remove = false) {
  const document = structuredClone(sample)
  let parent = document
  for (const key of path.slice(0, -1)) parent = parent[key]
  if (remove) delete parent[path.at(-1)!]
  else parent[path.at(-1)!] = value
  examples.push({ name: `${path.join('.')}: ${remove ? 'absent' : JSON.stringify(value)?.slice(0, 40)}`, document })
}
// Every field in the committed IR is exercised, with the first array member
// representing its shape. Expected verdicts come from Python, never this port.
function walk(value: unknown, path: (string | number)[] = []) {
  if (path.length) {
    change(path, null); change(path, undefined, true)
    for (const wrong of [false, -1, 'not a key ?', {}, []]) change(path, wrong)
  }
  if (Array.isArray(value)) {
    if (value.length) { change(path, [...value, value[0]]); walk(value[0], [...path, 0]) }
  } else if (value && typeof value === 'object') {
    change([...path, 'unknown_field'], true)
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key])
  }
}
walk(sample)
change(['service', 'phases', 0, 'scenarios', 0, 'paths', 0, 'cells', 0, 'frame'], 'https://example.test/frame.png')
change(['service', 'phases', 0, 'scenarios', 0, 'paths', 0, 'cells', 0, 'picture'], 'https://example.test/frame.png')
// A link may join any two cells of one service: ends qualified by path and
// scenario, resolved once the whole service is read.
type Document = typeof sample
function link(name: string, edit: (document: Document) => void) {
  const document = structuredClone(sample)
  edit(document)
  examples.push({ name: `cross-path link: ${name}`, document })
}
const scenario = (document: Document) => document.service.phases[0].scenarios[0]
const listed = (document: Document, k = 0) => scenario(document).paths[k].dependencies as unknown[]
const another = (document: Document) => {
  const copy = structuredClone(scenario(document))
  copy.key = 'asset-repair-again'
  document.service.phases[0].scenarios.push(copy)
}
link('to another path of the scenario', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'as-done' } }))
link('to another path, scenario named', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'as-done', scenario: 'asset-repair' }, kind: 'enables' }))
link('to another scenario', d => { another(d); listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'report', path: 'as-done', scenario: 'asset-repair-again' } }) })
link('a scenario without its path', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', scenario: 'asset-repair' } }))
link('an unknown path', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'nowhere' } }))
link('an unknown scenario', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'as-done', scenario: 'nowhere' } }))
link('a missing cell on the named path', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'field-tech', step: 'nowhere', path: 'as-done' } }))
link('neither end on the listing path', d => listed(d).push({ source: { lane: 'citizen', step: 'report', path: 'as-done' }, target: { lane: 'citizen', step: 'triage', path: 'as-done' } }))
link('itself, once resolved', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'report', path: 'as-designed' } }))
link('listed on both of its paths', d => {
  listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'as-done' } })
  listed(d, 1).push({ source: { lane: 'citizen', step: 'report', path: 'as-designed' }, target: { lane: 'citizen', step: 'triage' } })
})
link('a malformed qualifier', d => listed(d).push({ source: { lane: 'citizen', step: 'report' }, target: { lane: 'citizen', step: 'triage', path: 'Not A Key' } }))

it(`stored-blueprint verdicts agree with Python across ${examples.length} field and integrity mutations`, () => {
  const answers = pythonVerdicts(examples.map(example => example.document))
  const mismatches = examples.flatMap((example, i) => {
    const result = validateDocument(example.document)
    const actual = result.errors.length === 0
    return JSON.stringify(result.errors.map(e => e.path).sort()) === JSON.stringify(answers[i].paths) && actual === answers[i].valid && (!actual || result.warnings.length === answers[i].warnings) ? [] : [{ case: example.name, python: answers[i], server: { valid: actual, warnings: result.warnings.length, paths: result.errors.map(e=>e.path).sort() } }]
  })
  expect(mismatches).toEqual([])
  expect(examples.length).toBeGreaterThan(100)
  console.info(`Parity checked ${examples.length} documents against Python.`)
}, 30000)

it('changes to the canonical rules require renewing the parity proof', () => {
  const fingerprint = createHash('sha256').update(readFileSync('scripts/validate_ir.py')).digest('hex')
  expect(fingerprint, 'Extend the parity corpus for the changed validator rule before refreshing its fingerprint.').toBe('57b633af255906be3e49b1d30579754a1161b020a732acc25f8456e225d8518e')
})

it('the bundled validator schema matches the canonical schema', () => {
  execFileSync('node', ['scripts/generate-blueprint-validator.mjs', '--check'], { stdio: 'pipe' })
})
