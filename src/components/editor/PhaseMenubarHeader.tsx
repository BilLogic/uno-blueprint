import { Columns2, Diff, GitCompareArrows } from 'lucide-react'
import type { PathOption } from '@/components/blueprint/PathMultiSelect'
import { EntityHeader } from '@/components/blueprint/EntityHeader'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { ScenarioMenubarBreadcrumb } from '@/components/editor/ScenarioMenubarBreadcrumb'
import { BLUEPRINT_MENUBAR_HEADER_CLASS } from '@/components/editor/menubarHeaderLayout'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/editor/SegmentedControl'
import { Menubar } from '@/components/ui/menubar'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { useEditor } from '@/contexts/EditorContext'
import { countCompareDifferences } from '@/lib/compareLedger'
import { useCompareReviewState } from '@/lib/compareReviewStore'
import {
  getSlideDisplayLabel,
  isSubslide,
  type NavItem,
  type SlideViewType,
} from '@/types/nav'
import { cn } from '@/lib/utils'

type PhaseMenubarHeaderProps = {
  slide: NavItem
  slides: NavItem[]
  /** Paths still inform the summary fallback; filtering lives in the sidebar. */
  paths?: PathOption[]
  selectedPathIds?: string[]
  className?: string
}

function resolveHeaderSummary(
  slide: NavItem,
  paths: PathOption[],
  selectedPathIds: string[],
): string | null | undefined {
  if (isSubslide(slide)) {
    if (slide.summary?.trim()) return slide.summary

    const selectedPath = paths.find((path) => selectedPathIds.includes(path.id))
    return selectedPath?.summary ?? paths[0]?.summary ?? null
  }

  return (
    slide.summary ?? 'Scenarios in this phase and how they connect.'
  )
}

/**
 * Stacked ⇄ Merged, on the bar that holds the scenario title.
 *
 * Visible only while two or more paths are selected — with one path there
 * is nothing to compare and the control would be a question with no answer.
 * Same track-and-raised-square vocabulary as the View/Edit switch.
 */
function CompareViewToggle({ slide }: { slide: NavItem }) {
  const { getScenarioDisplayViewType, setScenarioDisplayViewType } = useEditor()
  // A scenario that has never been toggled reads as Stacked here — the
  // control has to point at a segment, and Stacked is the default view.
  const current = getScenarioDisplayViewType(slide) ?? 'stacked'

  // `label` is the name a screen reader hears; `hint` is what the control
  // DOES, for the sighted reader hovering a glyph and the keyboard reader
  // focusing one. Below xl the label is hidden and the glyph is the whole
  // face, so the hint is the only sentence either of them gets.
  const segments: Array<{
    value: SlideViewType
    label: string
    hint: string
    icon: typeof Columns2
  }> = [
    {
      value: 'stacked',
      label: 'Stacked',
      hint: 'Show each path as its own band',
      icon: Columns2,
    },
    {
      value: 'merged',
      label: 'Merged',
      hint: 'Show the paths merged into one grid',
      icon: GitCompareArrows,
    },
  ]

  return (
    <SegmentedControl
      aria-label="Path display"
      value={current}
      onValueChange={(value) => setScenarioDisplayViewType(slide.id, value)}
    >
      {segments.map(({ value, label, hint, icon: Icon }) => (
        <IconTooltip key={value} label={hint}>
          <SegmentedControlItem value={value} className="px-2" aria-label={label}>
            <Icon className="size-3.5" aria-hidden />
            {/* Narrow shells go icon-only; the aria-label keeps the name. */}
            <span className="max-xl:hidden">{label}</span>
          </SegmentedControlItem>
        </IconTooltip>
      ))}
    </SegmentedControl>
  )
}

/**
 * The `[Diff N]` button — the menubar entry to the difference ledger, beside
 * the compare toggles. A real toggle: pressed while the panel is open ON the
 * Differences surface, and clicking it then CLOSES the panel (the panel's own
 * atomic clear, never a second owner of "is the panel open"). Hidden below 2
 * selected paths (the compare cluster gate), disabled at zero because "open
 * the empty ledger" is a dead end.
 *
 * The count is a badge, not prose — it is one of exactly two counts in the
 * app (this and each ledger group's trailing number), so it has to read as a
 * value rather than a label.
 */
function CompareDifferencesCount({ slide }: { slide: NavItem }) {
  const { registration } = useCompareReviewState()
  const cellDetail = useBlueprintCellDetailOptional()
  if (!registration || registration.slideId !== slide.id || !cellDetail) {
    return null
  }
  const count = countCompareDifferences(registration.model)
  const open = cellDetail.panelState?.surface === 'differences'
  const control = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={count === 0}
      aria-pressed={open}
      aria-label={
        count === 0
          ? 'No differences between the compared paths'
          : open
            ? 'Close the difference ledger'
            : `Open the difference ledger (${count} differences)`
      }
      className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => (open ? cellDetail.closePanel() : cellDetail.openDifferences())}
    >
      <Diff className="size-3.5" aria-hidden />
      <span className="max-xl:hidden">Diff</span>
      <span
        aria-hidden
        className={cn(
          // geometry: the count is a digit packed into a 24px rounded control, not a prose line.
          'ml-1 rounded-full px-2 py-px font-mono text-xs leading-none tabular-nums',
          // Resting: neutral. Pressed: brand tint one step stronger than the
          // button's own selected fill, so the count stays legible on it.
          open
            ? 'bg-sidebar-selected-rail/20 text-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {count}
      </span>
    </Button>
  )
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {control}
      </TooltipTrigger>
      <TooltipContent>
        {count === 0
          ? 'Paths are identical — nothing to list'
          : open
            ? 'Close the difference ledger'
            : 'Open the difference ledger'}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The compare controls as ONE right-aligned cluster (Stacked/Merged, Diff) — the navbar composes it beside the path selector so every view
 * control shares one edge and one gap rhythm, instead of toggles floating
 * mid-bar next to the title.
 */
export function CompareControlsCluster({
  slide,
  selectedPathIds,
}: {
  slide: NavItem
  selectedPathIds: string[]
}) {
  if (!isSubslide(slide) || selectedPathIds.length < 2) return null
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <CompareViewToggle slide={slide} />
      <CompareDifferencesCount slide={slide} />
    </div>
  )
}

/** Phase or scenario title bar using the shadcn Menubar component. */
export function PhaseMenubarHeader({
  slide,
  slides,
  paths = [],
  selectedPathIds = [],
  className,
}: PhaseMenubarHeaderProps) {
  const label = getSlideDisplayLabel(slide, slides)
  const isScenario = isSubslide(slide)
  const summary = resolveHeaderSummary(slide, paths, selectedPathIds)

  return (
    <Menubar
      modal={false}
      data-phase-menubar-header
      className={cn(BLUEPRINT_MENUBAR_HEADER_CLASS, className)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {/*
        Title and summary as one block, the slice header band's shape adapted
        to the menubar: identity first, then what this thing is, truncated. The
        summary used to live only inside the title's hover tooltip, which is a
        strange place for the one sentence that says what you are looking at.

        On a scenario the identity line is the TRAIL, handed to the block as
        its title slot: `Phase › Scenario`, where the last crumb is the title
        and the phase crumb is the way back to that phase on the overview. The
        bar prints no second title — the trail is the only owner of the name.

        The block itself is `EntityHeader`, shared with the service bar above
        — same shape, same class, one place to change it. Identity is props,
        never a query result: this bar does not print `status` / `message`.
      */}
      <EntityHeader
        kind={isScenario ? 'scenario' : 'phase'}
        id={slide.id}
        label={label}
        summary={summary}
        trail={
          isScenario
            ? (current) => (
                <ScenarioMenubarBreadcrumb
                  slide={slide}
                  slides={slides}
                  current={current}
                />
              )
            : undefined
        }
      />
      {/* Compare controls moved to the navbar's right cluster
          (CompareControlsCluster) — the title keeps the left edge to
          itself. */}
    </Menubar>
  )
}
