// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
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

it(`stored-blueprint verdicts agree with Python across ${examples.length} field and integrity mutations`, () => {
  const answers: { valid: boolean; warnings: number }[] = JSON.parse(execFileSync('python3', ['-c', `
import json,sys
sys.path.insert(0,'scripts')
from validate_ir import Report,validate_document
answers=[]
for doc in json.load(sys.stdin):
    report=Report('parity')
    validate_document(doc,report)
    answers.append({'valid':not report.errors,'warnings':len(report.warnings)})
print(json.dumps(answers))
`], { input: JSON.stringify(examples.map(example => example.document)), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }))
  const mismatches = examples.flatMap((example, i) => {
    const result = validateDocument(example.document)
    const actual = result.errors.length === 0
    return actual === answers[i].valid && (!actual || result.warnings.length === answers[i].warnings) ? [] : [{ case: example.name, python: answers[i], server: { valid: actual, warnings: result.warnings.length } }]
  })
  expect(mismatches).toEqual([])
  expect(examples.length).toBeGreaterThan(100)
  console.info(`Parity checked ${examples.length} documents against Python.`)
}, 30000)

it('changes to the canonical rules require renewing the parity proof', () => {
  const fingerprint = execFileSync('python3', ['-c', "import ast,hashlib,pathlib; print(hashlib.sha256(ast.dump(ast.parse(pathlib.Path('scripts/validate_ir.py').read_text()),include_attributes=False).encode()).hexdigest())"], { encoding: 'utf8' }).trim()
  expect(fingerprint, 'Extend the parity corpus for the changed validator rule before refreshing its fingerprint.').toBe('ba70fc9d6017cb456a5ab1de8e1eaddf172d6ab14f94f9480af782ca53f6b716')
})

it('the bundled validator schema matches the canonical schema', () => {
  execFileSync('node', ['scripts/generate-blueprint-validator.mjs', '--check'], { stdio: 'pipe' })
})
