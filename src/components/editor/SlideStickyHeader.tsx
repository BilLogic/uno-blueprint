import type { CSSProperties } from 'react'
import type { PathOption } from '@/components/blueprint/PathMultiSelect'
import { ScenarioTitleDefinition } from '@/components/blueprint/ScenarioTitleDefinition'
import { PathSelectorMenu } from '@/components/editor/PathSelectorMenu'
import {
  CompareControlsCluster,
  PhaseMenubarHeader,
} from '@/components/editor/PhaseMenubarHeader'
import {
  BLUEPRINT_MENUBAR_FLAT_CLASS,
  BLUEPRINT_NAVBAR_BAR_CLASS,
} from '@/components/editor/menubarHeaderLayout'
import {
  useCollapsedNavSummary,
  useSidebarCollapsedState,
} from '@/contexts/sidebarCollapsedContext'
import {
  getSlideDisplayLabel,
  isSubslide,
  type NavItem,
} from '@/types/nav'
import { cn } from '@/lib/utils'

type SlideHeaderContentProps = {
  slide: NavItem
  slides: NavItem[]
  /** Paths still inform the summary fallback; filtering lives in the sidebar. */
  paths: PathOption[]
  selectedPathIds: string[]
  /** When true, title and summary share one row inside a menubar. */
  inlineSummary?: boolean
}

function resolveScenarioSummary(
  slide: NavItem,
  paths: PathOption[],
  selectedPathIds: string[],
): string | null | undefined {
  if (slide.summary?.trim()) return slide.summary

  const selectedPath = paths.find((path) => selectedPathIds.includes(path.id))
  return selectedPath?.summary ?? paths[0]?.summary ?? null
}

function SlideHeaderContent({
  slide,
  slides,
  paths,
  selectedPathIds,
  inlineSummary = false,
}: SlideHeaderContentProps) {
  if (inlineSummary) {
    return (
      <PhaseMenubarHeader
        slide={slide}
        slides={slides}
        paths={paths}
        selectedPathIds={selectedPathIds}
      />
    )
  }

  const label = getSlideDisplayLabel(slide, slides)
  const isScenario = isSubslide(slide)

  const summary = isScenario
    ? resolveScenarioSummary(slide, paths, selectedPathIds)
    : slide.summary ??
      paths[0]?.summary ??
      'Scenarios in this phase and how they connect.'

  return (
    <div
      className={cn(
        'rounded-xl border border-muted bg-card',
        'px-4 py-3',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <ScenarioTitleDefinition
              kind={isScenario ? 'scenario' : 'phase'}
              slide={isScenario ? slide : null}
            >
              <h1
                className={cn(
                  'w-fit rounded-md text-base font-semibold tracking-tight text-foreground outline-none',
                  'focus-visible:ring-2 focus-visible:ring-ring/50',
                )}
              >
                {label}
              </h1>
            </ScenarioTitleDefinition>
          </div>
          {summary ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {summary}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

type SlideStickyHeaderProps = SlideHeaderContentProps & {
  className?: string
}

/** Docked horizontal navbar above the canvas (main column only). */
export function SlideStickyHeader({
  className,
  ...contentProps
}: SlideStickyHeaderProps) {
  // Collapsed: the floating navbar carries this header's identity instead —
  // one chrome layer at any width. The path selector rides along on a
  // SCENARIO, handed over as `paths`; a phase passes an empty list and the
  // selector self-hides there. The zoom readout is still not folded in.
  const { collapsed } = useSidebarCollapsedState()
  useCollapsedNavSummary(
    collapsed
      ? {
          title: getSlideDisplayLabel(contentProps.slide, contentProps.slides),
          paths: contentProps.paths,
        }
      : null,
  )
  if (collapsed) return null

  return (
    <div
      data-editor-navbar
      // Flush left at every width: the sidebar is in flow and never draws over
      // this column, so there is no overlay to surrender a margin to.
      className={cn(
        'relative flex items-center gap-3',
        BLUEPRINT_NAVBAR_BAR_CLASS,
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <PhaseMenubarHeader
        slide={contentProps.slide}
        slides={contentProps.slides}
        paths={contentProps.paths}
        selectedPathIds={contentProps.selectedPathIds}
        className={cn('min-w-0 flex-1', BLUEPRINT_MENUBAR_FLAT_CLASS)}
      />
      {/* Right cluster in FLOW, not absolute: the title's truncation now
          respects the controls' real width instead of running under them.
          One edge, one gap rhythm for every view control. */}
      <div className="flex shrink-0 items-center gap-2">
        <CompareControlsCluster
          slide={contentProps.slide}
          selectedPathIds={contentProps.selectedPathIds}
        />
        <PathSelectorMenu options={contentProps.paths} />
      </div>
    </div>
  )
}

type CanvasSlideHeaderProps = SlideHeaderContentProps & {
  style: CSSProperties
  className?: string
}

/** Header anchored above an artboard on the pannable canvas. */
export function CanvasSlideHeader({
  style,
  className,
  ...contentProps
}: CanvasSlideHeaderProps) {
  return (
    <div
      data-slide-sticky-header
      className={cn('pointer-events-none absolute z-10', className)}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-auto w-full">
        <SlideHeaderContent {...contentProps} />
      </div>
    </div>
  )
}
