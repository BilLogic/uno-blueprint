import { useEffect } from 'react'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import type { PanelTab } from '@/components/blueprint/CellDetailTabs'

/**
 * Agent parity for the panel's own chrome: whatever a person can do to the
 * open panel with a control, an agent can do by name. Registered while the
 * panel is mounted and withdrawn with it, so the commands never outlive the
 * thing they act on.
 *
 * Widen/narrow stays registered on a phone too, where it moves nothing:
 * parity is about what the agent can reach, not which chrome is on screen.
 */
export function useCellPanelAgentCommands({
  setActiveTab,
  setExpanded,
  clearSelection,
}: {
  setActiveTab: (tab: PanelTab) => void
  setExpanded: (wide: boolean) => void
  clearSelection: () => boolean
}) {
  useEffect(() => {
    const unregister = [
      registerAgentUiCommand({
        name: 'cell_panel_tab',
        summary: "Switch the open cell panel's tab. arg: dependencies | evidence | resources",
        run: (arg) => {
          const tab = arg === 'evidence' || arg === 'resources' ? arg : 'dependencies'
          setActiveTab(tab)
          return `Cell panel is on the ${tab} tab.`
        },
      }),
      registerAgentUiCommand({
        name: 'cell_panel_expand',
        summary: 'Widen or shrink the open cell panel. arg: true (wide) | false (normal)',
        run: (arg) => {
          const wide = arg !== 'false'
          setExpanded(wide)
          return wide ? 'Cell panel expanded.' : 'Cell panel back to normal width.'
        },
      }),
      registerAgentUiCommand({
        name: 'cell_panel_close',
        summary: 'Close the open cell detail panel.',
        run: () => {
          if (!clearSelection()) return 'Panel transition is awaiting a draft decision or the editor is busy.'
          return 'Cell panel closed.'
        },
      }),
    ]
    return () => unregister.forEach((fn) => fn())
  }, [clearSelection, setActiveTab, setExpanded])
}
