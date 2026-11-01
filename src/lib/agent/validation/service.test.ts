// @vitest-environment node
import { expect, it } from 'vitest'
import { serviceDocument, validateService } from './service'

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function scenario(n: number) {
  return {
    id: id(n), name: `Scenario ${n}`, position: n, layout: 'stacked', steps: [{ id: id(n + 1), name: 'Ask' }], paths: [{
      id: id(n + 2), name: 'Main', kind: 'happy', path_steps: [{ step_id: id(n + 1), position: 0 }],
      lanes: [{ id: id(n + 3), name: 'Customer', lane_role: 'customer_actions', position: 0 }],
      cells: [{ id: id(n + 4), lane_id: id(n + 3), step_id: id(n + 1), content: 'Ask' }], dependencies: [] as unknown[],
    }],
  }
}

// A stored link names its target cell by lane and step; the lane says which
// path, and so which scenario, that cell is on.
it('a stored link to another scenario of the service is a valid, qualified end', () => {
  const here = scenario(10), there = scenario(20)
  here.paths[0].dependencies.push({ source_lane_id: id(13), source_step_id: id(11), target_lane_id: id(23), target_step_id: id(21), kind: 'enables' })
  const blueprint = { id: id(1), name: 'Support', entity_examples: {}, phases: [{ id: id(2), name: 'Arrival', position: 0, scenarios: [here, there] }] }
  const { document } = serviceDocument(blueprint)
  const edge = (document.service.phases[0].scenarios[0].paths[0].dependencies as unknown[])[0]
  expect(edge).toEqual({ source: { lane: id(13), step: id(11) }, target: { lane: id(23), step: id(21), path: id(22), scenario: id(20) }, kind: 'enables' })
  expect(validateService(blueprint)).toMatchObject({ valid: true, errors: [] })
})
