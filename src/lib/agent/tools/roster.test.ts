import { afterEach, describe, expect, it } from 'vitest'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { configureAgentTools, sessionRoster, toolEnabled } from '@/lib/agent/tools/roster'
import { dispatchTool } from '@/lib/agent/tools/registry'

/*
 * The Roster is derived: the definition list, filtered by the deployment's
 * allowlist and by each tool's availability for the session's mode. These
 * tests read the derived list for a given config and mode — nothing here
 * names a set of tool names the roster is compared against, because no
 * such set exists any more.
 */

afterEach(() => {
  configureAgentTools(undefined)
})

const DESKTOP = { sampleTrial: false, mobileReading: false, allowWrites: true, searchOffered: true }
const names = (mode: Parameters<typeof sessionRoster>[0]) =>
  sessionRoster(mode).map((tool) => tool.name)

describe('the deployment allowlist', () => {
  it('absent means every tool the mode allows', () => {
    expect(names(DESKTOP)).toEqual(TOOL_DEFINITIONS.map((tool) => tool.name))
  })

  it('naming a subset yields exactly that subset, in the definition order', () => {
    configureAgentTools(['get_cell', 'upsert_cell', 'list_blueprint'])
    expect(names(DESKTOP)).toEqual(['list_blueprint', 'get_cell', 'upsert_cell'])
  })

  it('a name no definition declares is not there, and is not an error', () => {
    configureAgentTools(['get_cell', 'list_scenarios'])
    expect(names(DESKTOP)).toEqual(['get_cell'])
  })

  it('answers per call too, so a disabled tool a model remembers is refused rather than run', () => {
    expect(toolEnabled('upsert_cell')).toBe(true)
    configureAgentTools(['get_cell'])
    expect(toolEnabled('get_cell')).toBe(true)
    expect(toolEnabled('upsert_cell')).toBe(false)
  })

  it('narrows under every mode gate rather than around it', () => {
    configureAgentTools(['get_cell', 'upsert_cell'])
    expect(names({ ...DESKTOP, allowWrites: false })).toEqual(['get_cell'])
    expect(names({ ...DESKTOP, sampleTrial: true })).toEqual(['get_cell'])
  })
})

describe('the mode gates', () => {
  it('offers server reads only when their definitions explicitly declare server availability', () => {
    const server = sessionRoster({ ...DESKTOP, server: true, allowWrites: false })
    expect(server.map((tool) => tool.name)).toEqual(TOOL_DEFINITIONS
      .filter((tool) => tool.surface === 'read' && tool.browserBacked === false && !tool.resourceOnly)
      .map((tool) => tool.name))
  })

  it('a viewer sees no write tool; an author sees every one', () => {
    const viewer = sessionRoster({ ...DESKTOP, allowWrites: false })
    expect(viewer.some((tool) => tool.surface === 'write')).toBe(false)
    expect(viewer.map((tool) => tool.name)).toContain('annotate_cells')
    expect(names(DESKTOP)).toContain('upsert_cell')
  })

  it('the no-database trial is offered exactly the tools that say they run without one', () => {
    const trial = sessionRoster({ ...DESKTOP, sampleTrial: true, allowWrites: false })
    expect(trial).toEqual(TOOL_DEFINITIONS.filter((tool) => tool.availability.sample))
    expect(trial.some((tool) => tool.surface === 'write')).toBe(false)
    for (const name of ['list_blueprint', 'get_blueprint', 'get_cell', 'open_phase'])
      expect(trial.map((tool) => tool.name)).toContain(name)
  })

  it('the mobile shell is offered exactly the tools that say they run there, for every tier', () => {
    const mobile = TOOL_DEFINITIONS.filter((tool) => tool.availability.mobile)
    expect(sessionRoster({ ...DESKTOP, mobileReading: true })).toEqual(mobile)
    expect(sessionRoster({ ...DESKTOP, mobileReading: true, allowWrites: false })).toEqual(mobile)
    expect(mobile.some((tool) => tool.surface === 'write')).toBe(false)
  })

  it('a tool unavailable in the trial is absent from its roster, and refused in words if called', async () => {
    const trial = names({ ...DESKTOP, sampleTrial: true })
    expect(trial).not.toContain('list_stakeholders')
    expect(trial).not.toContain('set_canvas_mode')
    const text = await dispatchTool(null, 'session', 'list_stakeholders', {})
    expect(text).toMatch(/"list_stakeholders" does not exist here/)
    expect(text).toContain('Available: get_reference')
  })
})
