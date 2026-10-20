#!/usr/bin/env node
/** Bundle validation keywords beside the reader; deployments install the application as a package. */
import { readFileSync, writeFileSync } from 'node:fs'
const source = JSON.parse(readFileSync('references/ir-schema.json', 'utf8'))
function rules(value) {
  if (Array.isArray(value)) return value.map(rules)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['description', 'title', '$comment', '$id', 'examples'].includes(key)).map(([key, child]) => [key, rules(child)]))
}
const file = 'src/lib/agent/validation/ir-schema.generated.json'
const expected = JSON.stringify(rules(source), null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== expected) { console.error(`The bundled validator schema differs from the canonical schema. Run node scripts/generate-blueprint-validator.mjs.`); process.exitCode = 1 }
} else writeFileSync(file, expected)
