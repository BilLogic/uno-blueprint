import type { ReactNode } from 'react'
import { Diamond, LayoutGrid, Sparkles } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Figma's sidebar IA, in two groups that mean two different things.
 *
 * TOP — the panel surfaces (Blueprints, Slices). A radio group: exactly
 * one is showing, and the selected one wears the left rail bar, which is
 * this app's "you are here" mark.
 *
 * BOTTOM — the toggles (Agent chat, Settings). The chat is a companion,
 * not a surface: it docks *under* whichever panel is open, or floats over
 * the canvas, and turning it on takes nothing away. Sitting it in the
 * radio group made it look mutually exclusive with the panel it actually
 * accompanies, so it moved down with the other utilities and wears a
 * filled tint + presence dot instead of the rail bar.
 *
 * The types say the same thing. `SidebarPanel` is the radio group and only
 * the radio group; ✦ has its own `onToggleAgent`. It was briefly a third
 * member of this union, which meant every consumer carried an
 * `Exclude<…, 'agent'>` or a coercion to strip a value the state could never
 * hold — the rail's own handler intercepted it and toggled the chat instead
 * of selecting it.
 */
export type SidebarPanel = 'blueprints' | 'slices'

export const EDITOR_RAIL_WIDTH_CLASS = 'w-12'

const PANEL_SURFACES: Array<{
  id: SidebarPanel
  label: string
  icon: typeof LayoutGrid
}> = [
  { id: 'blueprints', label: 'Blueprints', icon: LayoutGrid },
  { id: 'slices', label: 'Slices', icon: Diamond },
]

function RailButton({
  label,
  selected,
  toggled,
  onClick,
  children,
}: {
  label: string
  /** Radio member: wears the left rail bar. */
  selected?: boolean
  /** Toggle: wears a tint and a presence dot, never the rail bar. */
  toggled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconTooltip label={label} side="right">
      <button
        type="button"
        aria-label={label}
        aria-pressed={toggled ?? selected}
        onClick={onClick}
        className={cn(
          'relative flex size-9 items-center justify-center rounded-md transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          selected &&
            'bg-sidebar-selected text-sidebar-selected-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-selected-rail',
          toggled &&
            'bg-sidebar-selected/70 text-sidebar-selected-foreground after:absolute after:right-1 after:top-1 after:size-1.5 after:rounded-full after:bg-primary',
          !selected &&
            !toggled &&
            'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        {children}
      </button>
    </IconTooltip>
  )
}

/**
 * The vertical icon rail. `topSlot` holds the sidebar's ONE collapse
 * toggle — same corner the floating navbar occupies when collapsed.
 * `bottomSlot` is pinned under a spacer — the ⚙ settings entry lives there
 * so keys are reachable from any surface.
 */
export function EditorRail({
  panel,
  onSelectPanel,
  onToggleAgent,
  showAgent,
  agentActive,
  topSlot,
  bottomSlot,
}: {
  panel: SidebarPanel
  onSelectPanel: (panel: SidebarPanel) => void
  /** ✦ — turns the chat on and off. Never selects a panel. */
  onToggleAgent: () => void
  /** Deployed read-only builds hide the agent surface entirely. */
  showAgent: boolean
  /**
   * ✦ is a TOGGLE, not a surface swap — the chat docks under whichever
   * panel is open (or floats), so Blueprints/Slices keeps its own
   * highlight while the agent is showing.
   */
  agentActive?: boolean
  topSlot?: ReactNode
  bottomSlot?: ReactNode
}) {
  return (
    <TooltipProvider delay={300}>
      <nav
        aria-label="Sidebar surfaces"
        className={cn(
          'flex h-full shrink-0 flex-col items-center gap-1 border-r border-muted px-2 py-2',
          EDITOR_RAIL_WIDTH_CLASS,
        )}
        data-editor-rail
      >
        {topSlot ? (
          <>
            {topSlot}
            <div className="my-1 h-px w-6 shrink-0 bg-border/60" aria-hidden />
          </>
        ) : null}
        {PANEL_SURFACES.map(({ id, label, icon: Icon }) => (
          <RailButton
            key={id}
            label={label}
            selected={panel === id}
            onClick={() => onSelectPanel(id)}
          >
            <Icon className="size-4" aria-hidden />
          </RailButton>
        ))}
        <div className="flex-1" aria-hidden />
        {showAgent ? (
          <>
            <RailButton
              label={agentActive ? 'Hide the agent' : 'Show the agent'}
              toggled={agentActive === true}
              onClick={onToggleAgent}
            >
              <Sparkles className="size-4" aria-hidden />
            </RailButton>
            <div className="my-1 h-px w-6 shrink-0 bg-border/60" aria-hidden />
          </>
        ) : null}
        {bottomSlot}
      </nav>
    </TooltipProvider>
  )
}
