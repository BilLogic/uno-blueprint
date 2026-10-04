import { useState } from 'react'
import { Diamond, LayoutGrid, Settings } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AgentSettingsFields } from '@/components/editor/AgentSettingsFields'
import { NavChildren, NavRow, NavSection } from '@/components/editor/SidebarNav'
import {
  SlideNavLoadingSkeleton,
  SliceListLoadingSkeleton,
} from '@/components/editor/EditorLoadingSkeletons'
import { ThemeToggle } from '@/components/editor/ThemeToggle'
import { getSlideDisplayLabel } from '@/types/nav'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/types/nav'
import type { Slice } from '@/types/database'
import {
  SLICE_GROUP_TITLE,
  SLICE_TYPE_GROUPS,
  sliceKindGroup,
} from '@/lib/sliceGroups'

/**
 * The drawer IS the index: a rail + panel, the same IA as the desktop
 * sidebar — and the same COMPONENTS. Rows are `NavRow`/`NavChildren` from
 * SidebarNav, so the phone inherits the desktop
 * disclosure vocabulary wholesale: chevron in a fixed left slot (always
 * visible on coarse pointers), children indent by one chevron slot. One
 * divergence from desktop, decided 2026-08-17: a phase row is purely an
 * accordion header — label and chevron both just toggle — because on a
 * phone "tap phase" navigating somewhere read as a misfire.
 *
 * The rail carries the surface radio — Blueprints ◫ / Slices ◇,
 * `EditorRail`'s vocabulary — with the light/dark control at its foot.
 * Expansion lives on `EditorContext.expandedPhaseIds`, reported up.
 *
 * Doctrine unchanged from Phase 2: this component only reports WHAT was
 * tapped. What a tap means for the visible view is the shell's decision.
 */
export type MobileNavSurface = 'blueprints' | 'slices' | 'settings'

const RAIL_SURFACES: Array<{
  id: MobileNavSurface
  label: string
  icon: typeof LayoutGrid
}> = [
  { id: 'blueprints', label: 'Blueprints', icon: LayoutGrid },
  { id: 'slices', label: 'Slices', icon: Diamond },
]

/** The drawer's Slices surface: type groups (open by default), NavRow rows. */
function SliceGroups({
  slices,
  loading,
  onSelectSlice,
}: {
  slices: Slice[]
  loading: boolean
  onSelectSlice: (sliceId: string) => void
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set(),
  )
  const groups = SLICE_TYPE_GROUPS.map((type) => ({
    type,
    slices: slices.filter(
      (slice) => sliceKindGroup(slice.kind) === type,
    ),
  })).filter((group) => group.slices.length > 0)

  if (groups.length === 0) {
    // Loading and empty are different states: skeleton rows while the list
    // is in flight, the empty message only once it has truly come back bare.
    if (loading) return <SliceListLoadingSkeleton />
    return (
      <p className="px-2 py-2 text-xs text-tertiary-foreground">
        No saved slices yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <NavSection
          key={group.type}
          title={SLICE_GROUP_TITLE[group.type]}
          open={!collapsedGroups.has(group.type)}
          onOpenChange={(open) =>
            setCollapsedGroups((collapsed) => {
              const next = new Set(collapsed)
              if (open) next.delete(group.type)
              else next.add(group.type)
              return next
            })
          }
        >
          <ul className="flex flex-col gap-1">
            {group.slices.map((slice) => (
              <li key={slice.id}>
                <NavRow
                  rowId={slice.id}
                  className="min-h-11"

                  label={slice.title}
                  icon={<Diamond className="inline size-3" />}
                  onSelect={() => onSelectSlice(slice.id)}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        </NavSection>
      ))}
    </div>
  )
}

export function MobileNavSheet({
  open,
  onOpenChange,
  surface,
  onSurfaceChange,
  slices,
  slicesLoading,
  phases,
  scenariosByPhase,
  slides,
  phasesLoading,
  expandedPhaseIds,
  onPhaseExpandedChange,
  selectedPhaseId,
  selectedScenarioId,
  onSelectSlice,
  onSelectScenario,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  surface: MobileNavSurface
  onSurfaceChange: (surface: MobileNavSurface) => void
  slices: Slice[]
  slicesLoading: boolean
  phases: NavItem[]
  scenariosByPhase: Map<string, NavItem[]>
  slides: NavItem[]
  /** The phase list is a fetch in flight, not a workspace with no phases. */
  phasesLoading: boolean
  expandedPhaseIds: ReadonlySet<string>
  onPhaseExpandedChange: (phaseId: string, open: boolean) => void
  selectedPhaseId: string | null
  selectedScenarioId: string | null
  onSelectSlice: (sliceId: string) => void
  onSelectScenario: (scenarioId: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        aria-label="Blueprint contents"
        className="flex w-80 flex-row bg-sidebar p-0 text-sidebar-foreground"
      >
        {/* The rail: surface radio on top, utilities at the foot. */}
        <nav
          aria-label="Sidebar surfaces"
          className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-muted px-2 py-2"
        >
          {RAIL_SURFACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={surface === id}
              onClick={() => onSurfaceChange(id)}
              className={cn(
                'relative flex size-11 items-center justify-center rounded-md',
                surface === id
                  ? 'bg-sidebar-selected text-sidebar-selected-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-selected-rail'
                  : 'text-muted-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
          <div className="flex-1" aria-hidden />
          {/*
            The phone's front door. Sign-in used to live only in the desktop
            rail's ⚙, so on a phone the deployed site had no route to a
            session at all — and with no session there is no agent, which is
            why the ✦ button looked "missing" rather than gated. Same
            component as the desktop popover, so the two cannot drift.
          */}
          <button
            type="button"
            aria-label="Settings"
            aria-pressed={surface === 'settings'}
            onClick={() => onSurfaceChange('settings')}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-md',
              surface === 'settings'
                ? 'bg-sidebar-selected text-sidebar-selected-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-selected-rail'
                : 'text-muted-foreground',
            )}
          >
            <Settings className="size-4" aria-hidden />
          </button>
          {/* size-11 = the 44px touch floor (plan Phase 5). */}
          <ThemeToggle size="icon-sm" className="size-11" />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm">
              {surface === 'slices'
                ? 'Slices'
                : surface === 'settings'
                  ? 'Settings'
                  : 'Blueprints'}
            </SheetTitle>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            {surface === 'settings' ? (
              <AgentSettingsFields active={open} />
            ) : surface === 'slices' ? (
              <SliceGroups
                slices={slices}
                loading={slicesLoading}
                onSelectSlice={onSelectSlice}
              />
            ) : phases.length === 0 ? (
              /*
                Loading and empty are different states here too — the same
                distinction `SliceGroups` above already draws.

                It once had no reachable empty state at all: a read with
                no rows fell back to the template's bundled sample, so this list
                always had phases in it, and on a connected deployment they
                were the template's under the deployment's name. The drawer
                auto-opens on first load, so that was the phone's whole first
                screen. Now a configured workspace draws its own rows or says
                it has none.
              */
              phasesLoading ? (
                <SlideNavLoadingSkeleton rows={4} />
              ) : (
                <p className="px-2 py-2 text-xs text-tertiary-foreground">
                  No phases in this workspace yet.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-1">
                {phases.map((phase) => {
                  const children = scenariosByPhase.get(phase.id) ?? []
                  const hasChildren = children.length > 0
                  const isOpen = hasChildren && expandedPhaseIds.has(phase.id)
                  const phaseLabel = getSlideDisplayLabel(phase, slides)
                  return (
                    <div key={phase.id}>
                      <NavRow
                        rowId={phase.id}
                        className="min-h-11"

                        label={phaseLabel}
                        toggleLabel={phaseLabel}
                        open={hasChildren ? isOpen : undefined}
                        onToggle={
                          hasChildren
                            ? () => onPhaseExpandedChange(phase.id, !isOpen)
                            : undefined
                        }
                        // One touch space, one meaning (decided 2026-08-17):
                        // a phase row is an accordion header, nothing more —
                        // tapping it toggles its scenarios and never moves
                        // the camera. Scenarios are the only navigators here.
                        onSelect={() => {
                          if (hasChildren)
                            onPhaseExpandedChange(phase.id, !isOpen)
                        }}
                        selected={
                          phase.id === selectedPhaseId && !selectedScenarioId
                        }
                      />
                      {hasChildren && isOpen ? (
                        <NavChildren>
                          {children.map((item) => (
                            <li key={item.id}>
                              <NavRow
                                rowId={item.id}
                                className="min-h-11"

                                label={getSlideDisplayLabel(item, slides)}
                                onSelect={() => onSelectScenario(item.id)}
                                selected={item.id === selectedScenarioId}
                                size="sm"
                              />
                            </li>
                          ))}
                        </NavChildren>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
