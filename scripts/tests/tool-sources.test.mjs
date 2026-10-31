import { expect, it } from 'vitest'
import { toolSurfaces } from '../tool-sources.mjs'

it('the structure-write wrapper declares a write surface alongside direct definitions', () => {
  expect([...toolSurfaces(`
export const read = defineTool({ name: 'read_board', surface: 'read' })
export const create = structureWrite({ name: 'create_step', args: schema })
export const record = defineWriteTool({ name: 'create_finding', args: schema })
`)]).toEqual([['read_board', 'read'], ['create_step', 'write'], ['create_finding', 'write']])
})
