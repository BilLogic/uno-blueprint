/**
 * An impact trace reaches every path of its service.
 *
 * A dependency may join two cells on different paths or scenarios of one
 * service (ADR 0035). The walk that follows dependencies is not code: it is
 * the Method in `agents/impact-tracer.md`, which `ub:whatif`, map's update
 * mode and the `channel-conflict` auditor all run. So the contract lives in
 * prose, and this file holds that prose to it.
 *
 * What it holds, one test each:
 *
 *   - the tracer states no same-path rule, follows an edge into another path
 *     or scenario, and keeps the visited set and the depth cap;
 *   - its output names an affected cell's scenario and path when they differ
 *     from the seed's, in a field the callers read;
 *   - what-if traces the whole service and brings a reached scenario into
 *     the sign-off scope, so a promote refuses when that scenario moved;
 *   - the two audit checks that read edges say how they read one that leaves
 *     its path.
 *
 * The plausible regression is a copy edit that puts "same path only" back
 * beside the walk, because an arrow on the canvas is drawn within one path.
 * The canvas is one reader of an edge; the trace is another, and its reach is
 * the service.
 *
 * Run: npm test
 */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8')

/** The fenced JSON block a prompt ends with: the shape its caller parses. */
function outputShape(markdown) {
  const match = markdown.match(/```json\n([\s\S]*?)```/)
  assert.ok(match, 'the prompt carries no ```json output block')
  return match[1]
}

test('the tracer follows an edge into another path or scenario, under the same bounds', () => {
  const tracer = read('agents/impact-tracer.md')
  assert.doesNotMatch(tracer, /same-path edges only/i)
  assert.match(tracer, /another path,? or another scenario/)
  assert.match(tracer, /same visited set, same depth cap/)
  assert.match(tracer, /\*\*Depth cap: 8\.\*\*/)
  assert.match(tracer, /\*\*Visited set, always\.\*\*/)
})

test('an affected cell elsewhere carries its scenario and path', () => {
  const shape = outputShape(read('agents/impact-tracer.md'))
  assert.match(shape, /"elsewhere": null \| \{ "scenario": "<scenario key>", "path": "<path key>" \}/)
  // The keys stay fully qualified, which is what keeps a cross-path chain
  // unambiguous: two paths may share a lane and a step name.
  assert.match(read('agents/impact-tracer.md'), /<service>\/<phase>\/<scenario>\/<path>\/<lane>\/<step>/)
})

test('what-if traces the whole service and signs for every scenario the trace reaches', () => {
  const playbook = read('skills/whatif/references/whatif-playbook.md')
  assert.match(playbook, /BASE export of\s+the whole service/)
  assert.match(playbook, /A scenario is in scope when the change touches it or the trace\s+reaches a cell in it\./)
  assert.match(read('skills/whatif/SKILL.md'), /every path and scenario of the service is in reach/)
})

test('map’s update mode sends a chain question to the tracer over the whole service', () => {
  const map = read('skills/map/SKILL.md')
  assert.match(map, /chain question/)
  assert.match(map, /`impact-tracer`, seeded with the edited cells, on the\s+export of the whole service/)
})

test('the audit checks that read edges say how they read one that leaves its path', () => {
  const gaps = read('skills/audit/references/check-gap-sweep.md')
  assert.match(gaps, /an edge coming in from\s+another path or scenario is an incoming edge/)
  const conflict = read('skills/audit/references/check-channel-conflict.md')
  assert.match(conflict, /Simultaneity stays a step on one path/)
  assert.match(conflict, /edges into other paths\s+and scenarios followed like any other/)
})

test('the decision record that said same-path points at the one that lifted it', () => {
  const record = read('docs/adr/0030-the-impact-tracer-walks-either-way.md')
  const status = record.split('\n**Context**')[0]
  assert.match(status, /Amended 2026-10-31/)
  assert.match(status, /0035-a-link-may-cross-paths-within-one-service\.md/)
})
