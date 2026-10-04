import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { PhaseSectionFlowArrow } from '@/components/editor/PhaseSectionFlowArrow'
import { ordinalLabel } from '@/types/nav'
import {
  PHASE_SECTION_BOTTOM_INSET,
  PHASE_SECTION_INSET,
  PHASE_SECTION_TOP_INSET,
} from '@/components/editor/canvasPhaseSectionLayout'
import {
  OVERVIEW_PHASE_FLOW_ARROW_HEIGHT,
  OVERVIEW_PHASE_ROW_GAP,
  OVERVIEW_PHASE_SECTION_BOTTOM_INSET,
  OVERVIEW_PHASE_SECTION_INSET,
  OVERVIEW_PHASE_SECTION_TOP_INSET,
} from '@/lib/overviewLayout'
import { ScenarioTitleBadge } from '@/components/blueprint/ScenarioTitleBadge'
import { SLIDE_GAP } from '@/lib/slideLayout'
import { cn } from '@/lib/utils'

export {
  PHASE_SECTION_BOTTOM_INSET,
  PHASE_SECTION_INSET,
  PHASE_SECTION_TOP_INSET,
} from '@/components/editor/canvasPhaseSectionLayout'

type CanvasPhaseSectionProps = {
  title: string
  /** 1-based service position. Phases ARE an ordered sequence in time, so
   * the ordinal is information — it prefixes the badge (`01 · Application`)
   * in the same time-marker register the mobile reader uses. */
  ordinal: number
  summary?: string | null
  phaseId: string
  children: ReactNode
  className?: string
  /** Service overview uses tighter insets and row gaps. */
  variant?: 'default' | 'overview'
  /** Flow arrow from bottom center of this section to the next phase below. */
  showFlowArrow?: boolean
  /** Marks Application — other flow arrows align to this section's center. */
  isFlowArrowAnchor?: boolean
  /** Post-session service loop exits this section on the left. */
  isLoopArrowFrom?: boolean
  /** Pre-session service loop enters this section on the left. */
  isLoopArrowTo?: boolean
  /** Overview: hover + click opens the phase detail view. */
  onNavigate?: () => void
  /** When true, this phase is visually de-emphasized (canvas focus mode). */
  dimmed?: boolean
  /** When true, this phase is the camera focus target — no hover chrome. */
  focusActive?: boolean
}

function useAlignedFlowArrowLeft(
  sectionRef: RefObject<HTMLElement | null>,
  showFlowArrow: boolean,
) {
  useLayoutEffect(() => {
    const section = sectionRef.current
    if (!showFlowArrow || !section) return

    const overview = section.closest('[data-service-overview]')
    if (!overview) return

    const updateArrowLeft = () => {
      const anchor = overview.querySelector<HTMLElement>(
        '[data-flow-arrow-anchor]',
      )
      const anchorCenter = anchor
        ? anchor.offsetLeft + anchor.offsetWidth / 2
        : section.offsetLeft + section.offsetWidth / 2
      const arrowLeft = anchorCenter - section.offsetLeft
      section.style.setProperty('--phase-flow-arrow-left', `${arrowLeft}px`)
    }

    updateArrowLeft()

    const resizeObserver = new ResizeObserver(updateArrowLeft)
    resizeObserver.observe(overview)
    overview
      .querySelectorAll<HTMLElement>('[data-canvas-phase-section]')
      .forEach((phaseSection) => {
        resizeObserver.observe(phaseSection)
      })

    return () => resizeObserver.disconnect()
  }, [sectionRef, showFlowArrow])
}

function isBlueprintPanelTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof HTMLElement &&
      target.closest('[data-phase-scenario-panel]'),
  )
}

/** Figma-style canvas section grouping a service phase and its scenarios. */
export function CanvasPhaseSection({
  title,
  ordinal,
  summary,
  phaseId,
  children,
  className,
  showFlowArrow = false,
  isFlowArrowAnchor = false,
  isLoopArrowFrom = false,
  isLoopArrowTo = false,
  onNavigate,
  dimmed = false,
  focusActive = false,
  variant = 'default',
}: CanvasPhaseSectionProps) {
  const sectionRef = useRef<HTMLElement>(null)
  useAlignedFlowArrowLeft(sectionRef, showFlowArrow)

  const isOverview = variant === 'overview'
  const sectionInset = isOverview
    ? OVERVIEW_PHASE_SECTION_INSET
    : PHASE_SECTION_INSET
  const sectionTopInset = isOverview
    ? OVERVIEW_PHASE_SECTION_TOP_INSET
    : PHASE_SECTION_TOP_INSET
  const sectionBottomInset = isOverview
    ? OVERVIEW_PHASE_SECTION_BOTTOM_INSET
    : PHASE_SECTION_BOTTOM_INSET
  const phaseRowGap = isOverview ? OVERVIEW_PHASE_ROW_GAP : SLIDE_GAP
  const flowArrowHeight = isOverview
    ? OVERVIEW_PHASE_FLOW_ARROW_HEIGHT
    : undefined

  const handleNavigateKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onNavigate || focusActive) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onNavigate()
    }
  }

  const interactive = Boolean(onNavigate)
  // `navigable` also gates the data-canvas-phase-interactive pan-ignore
  // marker below: in focus mode the click affordance is gone, and a drag
  // inside the board must PAN, not die on that attribute.
  // `onNavigate` absent means nothing happens on a click, and a section that
  // says it is navigable while nothing is listening is a promise to a reader
  // and to a keyboard that the section cannot keep.
  const navigable = interactive && !focusActive && Boolean(onNavigate)

  const handleSectionClick = (event: MouseEvent<HTMLElement>) => {
    if (!navigable || isBlueprintPanelTarget(event.target)) return
    onNavigate?.()
  }

  return (
    <section
      ref={sectionRef}
      className={cn(
        /*
          No dim on the section itself — neither an opacity nor a filter.

          A dimmed phase carries `data-canvas-focus-dimmed`, and
          `blueprint.css` dims its frame, its badge and each of its
          scenarios one by one. Either property on the section would
          composite the whole subtree into one layer, and nothing inside a
          translucent ancestor can become clearer than it: a hovered
          scenario in a dimmed phase could change fill and shadow and still
          sit at the section's opacity. Those three children are also what
          the camera fades during a flight, so a dim here would stack under
          that fade.

          Nothing inside is made inert either, the same treatment a dimmed
          scenario panel gets. A cell in a dimmed phase ignores its own click
          (`BlueprintCellButton`) and lets it through to the scenario or the
          phase around it.
        */
        'relative inline-flex w-max flex-col items-start',
        navigable &&
          'cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0',
        className,
      )}
      data-canvas-phase-section=""
      data-phase-id={phaseId}
      data-canvas-focus-dimmed={dimmed ? '' : undefined}
      {...(focusActive ? { 'data-canvas-focus-active': '' } : {})}
      data-phase-section-inset={sectionInset}
      {...(navigable ? { 'data-canvas-phase-interactive': '' } : {})}
      {...(isFlowArrowAnchor ? { 'data-flow-arrow-anchor': '' } : {})}
      {...(isLoopArrowFrom ? { 'data-phase-loop-from': '' } : {})}
      {...(isLoopArrowTo ? { 'data-phase-loop-to': '' } : {})}
      style={showFlowArrow ? { marginBottom: phaseRowGap } : undefined}
      role={navigable ? 'button' : undefined}
      tabIndex={navigable ? 0 : undefined}
      aria-label={navigable ? `Open ${title} phase` : undefined}
      onClick={navigable ? handleSectionClick : undefined}
      onKeyDown={navigable ? handleNavigateKeyDown : undefined}
      onMouseLeave={
        navigable
          ? () => {
              if (
                sectionRef.current?.contains(document.activeElement) &&
                document.activeElement instanceof HTMLElement
              ) {
                document.activeElement.blur()
              }
            }
          : undefined
      }
    >
      <div
        aria-hidden
        data-phase-frame=""
        className="pointer-events-none absolute rounded-xl border border-solid"
        style={{
          top: -sectionTopInset,
          left: -sectionInset,
          right: -sectionInset,
          bottom: -sectionBottomInset,
        }}
      />
      <ScenarioTitleBadge
        name={ordinalLabel(ordinal, title)}
        summary={summary}
        // The phase register. An identity, not an affordance: a phase frame
        // that does not navigate (the mobile canvas) is still a phase, and
        // its badge still says so.
        tone="phase"
        // The time-marker label, `01 · Discover`, built by `ordinalLabel`:
        // sans, sentence case, no tracking — the rule every small label
        // follows. The aria-label above keeps the plain title. Legibility at
        // overview zoom is the counter-scale on `[data-phase-title-badge]`,
        // not capitals.
        // z-30: zoomed far out the badge counter-scales larger than its
        // inset and must not sink under a neighboring phase's panels.
        className="pointer-events-auto absolute z-30 max-w-[min(100%,28rem)] border-transparent"
        style={{
          top: -sectionTopInset,
          // On the frame's own left edge, which sits at `-sectionInset`: a
          // label that names a container reads as belonging to it only when
          // their edges agree. Inset from that edge, the badge floated a
          // band's width in from the corner it labels.
          left: -sectionInset,
          transform: 'translateY(-50%)',
        }}
      />
      <div className="relative flex flex-col gap-4">{children}</div>
      {showFlowArrow ? (
        <div
          // Structural connector: above the phase frame, below the z-30
          // title badges and far below the z-60 annotation surface — the
          // band `PhaseOverviewPhaseLoopArrow` already uses for the same
          // kind of line.
          className="pointer-events-none absolute z-20 -translate-x-1/2"
          style={{
            left: 'var(--phase-flow-arrow-left, 50%)',
            top: `calc(100% + ${sectionBottomInset}px)`,
            width: 24,
          }}
        >
          <PhaseSectionFlowArrow height={flowArrowHeight} />
        </div>
      ) : null}
    </section>
  )
}
