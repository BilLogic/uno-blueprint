#!/usr/bin/env node
/** Bundle validation keywords beside the reader; deployments install the application as a package. */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'

function rules(value) {
  if (Array.isArray(value)) return value.map(rules)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['description', 'title', '$comment', '$id', 'examples'].includes(key)).map(([key, child]) => [key, rules(child)]))
}

export function judge(argv = process.argv.slice(2), root = process.cwd()) {
  const what = 'the bundled blueprint validation rules'
  const file = 'src/lib/agent/validation/ir-schema.generated.json'
  const rerun = 'Run npm run generate:validation-rules.'
  try {
    const subject = sweep({ subject: 'references', root, where: path => path === 'references/ir-schema.json', what })
    const source = JSON.parse(subject.read('references/ir-schema.json'))
    const expected = JSON.stringify(rules(source), null, 2) + '\n'
    if (argv.includes('--check')) {
      if (readFileSync(resolve(root, file), 'utf8') !== expected) return { what, findings: [`${file}: bundled rules differ from references/ir-schema.json. ${rerun}`] }
    } else writeFileSync(resolve(root, file), expected)
    return { what, count: 1, line: `PASS: ${file} matches references/ir-schema.json.` }
  } catch (error) { return { what, findings: [`${file}: ${error.message} ${rerun}`] } }
}
whenRun(import.meta.url, judge)
