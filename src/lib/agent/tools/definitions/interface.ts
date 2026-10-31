import { z } from 'zod'
import { arg, defineTool } from '@/lib/agent/tools/definition'

/**
 * The tools that drive the interface: they move the user's canvas, open
 * what a click would open, and fire the controls the open surfaces
 * registered. None of them changes a row — the one exception, a `ui_command`
 * the registry marks as changing data, runs attributed to the session the
 * way a write does. Same gestures the human has.
 *
 * Every one reaches the canvas through `ctx.ui` and nothing else, so a test
 * runs them against a canvas it built by hand.
 */

export const openPhaseTool = defineTool({
  name: 'open_phase',
  description:
    'Navigate the user\'s canvas to a phase. Use when asked to go to / show / open something, or to show your work after writing into it.',
  surface: 'interface',
  args: z.object({
    phase_id: arg.text('Phase id from list_blueprint'),
  }),
  availability: { sample: true, mobile: true },
  run: async ({ phase_id }, ctx) => ctx.ui.openPhase(phase_id),
})

export const openScenarioTool = defineTool({
  name: 'open_scenario',
  description:
    'Navigate the user\'s canvas to a scenario. Open the scenario before focus_cell.',
  surface: 'interface',
  args: z.object({
    scenario_id: arg.text('Scenario id from list_blueprint'),
  }),
  availability: { sample: true, mobile: true },
  run: async ({ scenario_id }, ctx) => ctx.ui.openScenario(scenario_id),
})

export const focusCellTool = defineTool({
  name: 'focus_cell',
  description:
    'Focus the active canvas camera on a specific cell and wait for the move to complete — use to point at evidence when answering questions. The cell\'s scenario must be open first (open_scenario).',
  surface: 'interface',
  args: z.object({
    cell_id: arg.text('Cell id'),
  }),
  availability: { sample: true, mobile: true },
  run: async ({ cell_id }, ctx) => ctx.ui.focusCell(cell_id),
})

export const openCellPanelTool = defineTool({
  name: 'open_cell_panel',
  description:
    'Open the cell detail side panel on the user\'s screen — the same panel a click opens. The cell\'s scenario must be open first (open_scenario).',
  surface: 'interface',
  args: z.object({
    cell_id: arg.text('Cell id'),
  }),
  availability: { sample: true, mobile: true },
  run: async ({ cell_id }, ctx) => ctx.ui.openCellPanel(cell_id),
})

export const uiCommandTool = defineTool({
  name: 'ui_command',
  description:
    'Fire a UI control by name (from list_ui_commands), with an optional arg. Interface only, EXCEPT the ones the list marks "[changes data]" — those count against your write batch. Notable [changes data] commands: undo_last_change (reverts whatever is newest, INCLUDING the human\'s own edit if theirs came last — say whose change you are undoing before firing it), revert_my_changes (only your own edits from this session; prefer it whenever the user says "undo what you did"), and keep_all_changes (clears the change sheet and with it every revert in the session — nothing can be taken back afterwards). Reverting the whole session is human-only; revert_all_changes exists to say so.',
  surface: 'interface',
  args: z.object({
    command: arg.text('Command name from list_ui_commands'),
    arg: arg.optionalText('Argument where the command takes one; omit otherwise'),
  }),
  // The desktop surfaces own these controls; the mobile shell has none of
  // them, and the trial has no session to attribute a mutating one to.
  availability: { sample: false, mobile: false },
  run: async ({ command, arg: value }, ctx) => {
    // A command the registry marks `[changes data]` runs under the same
    // attribution as a write tool. Two reasons, both discovered by the
    // scoped revert: it is how `revert_my_changes` knows which entries are
    // its own, and a mutating command that repainted nothing left the canvas
    // showing state the database no longer had. The non-mutating majority
    // stays outside, where an interface command belongs.
    if (!ctx.ui.commandMutates(command)) return ctx.ui.runCommand(command, value)
    return ctx.session.attributed(() => ctx.ui.runCommand(command, value))
  },
})

export const setCanvasModeTool = defineTool({
  name: 'set_canvas_mode',
  description:
    'Switch the user\'s canvas between \'view\' (reading) and \'design\' (authoring) mode — same switch as the toolbar\'s.',
  surface: 'interface',
  args: z.object({
    mode: z.enum(['view', 'design']).describe('Target mode'),
  }),
  availability: { sample: false, mobile: false },
  run: async ({ mode }, ctx) => {
    if (ctx.ui.setCanvasMode(mode) === false) return 'Canvas mode transition is awaiting a draft decision or the editor is busy.'
    return `Canvas mode is now ${mode}.`
  },
})

export const setSidebarTool = defineTool({
  name: 'set_sidebar',
  description: 'Collapse or expand the sidebar (more canvas vs more navigation).',
  surface: 'interface',
  args: z.object({
    collapsed: z.boolean().describe('true = collapse'),
  }),
  availability: { sample: false, mobile: false },
  run: async ({ collapsed }, ctx) => ctx.ui.setSidebar(collapsed),
})

export const annotateCellsTool = defineTool({
  name: 'annotate_cells',
  description:
    'Draw ephemeral annotation boxes around cells on the open canvas (optional short text note above them) — use to point at things visually, like a human with a marker. Marks are scratch-layer only: never saved, cleared on reload.',
  surface: 'interface',
  args: z.object({
    cell_ids: arg.strings('Cells to box (must be on the open scenario)'),
    note: arg.optionalText('Optional short label drawn above the boxes; omit for none'),
  }),
  availability: { sample: false, mobile: false },
  run: async ({ cell_ids, note }, ctx) => {
    if (cell_ids.length === 0) throw new Error('cell_ids must be a non-empty array.')
    return ctx.ui.annotateCells(cell_ids, note)
  },
})
