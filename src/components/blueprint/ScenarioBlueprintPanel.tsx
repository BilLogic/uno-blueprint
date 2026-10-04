import { memo, useEffect, useMemo, useRef, type RefObject } from 'react'
import { ResizableComparePanel } from '@/components/blueprint/ResizableComparePanel'
import { MergedCompareGrid } from '@/components/blueprint/MergedCompareGrid'
import { StackedCompareGrid } from '@/components/blueprint/StackedCompareGrid'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { ScenarioBoardScopeContext } from '@/contexts/scenarioBoardScopeContext'
import { registerAgentUiContext } from '@/lib/agent/uiBridge'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import {
  countCompareDifferences,
  deriveCompareStepGroups,
  parseCompareLedgerFilter,
  resolveCompareStepKeys,
} from '@/lib/compareLedger'
import { jumpToCompareStep } from '@/lib/compareZoneNavigation'
import {
  clearCompareFilters,
  getCompareReviewState,
  registerCompareReview,
  setCompareFilters,
} from '@/lib/compareReviewStore'
import {
  buildCompareModel,
  type CompareBlueprints,
} from '@/lib/compareSlots'
import { FOCUS_DIM_CLASS, FOCUS_DIM_STYLE } from '@/lib/canvasFocusDim'
import { itemsInSelectionOrder, type PathListItem } from '@/lib/pathSelection'
import { cn } from '@/lib/utils'
import {
  getComparePanelHeight,
  getComparePanelWidth,
  getMergedComparePanelHeight,
  getStackedComparePanelHeight,
  getStackedComparePanelWidth,
} from '@/lib/sideBySideCompareLayout'

export {
  getScenarioBlueprintPanelHeight,
  getScenarioSwimlaneBodyHeight,
} from '@/lib/sideBySideCompareLayout'
export type { ScenarioSwimlaneLayoutInput } from '@/lib/sideBySideCompareLayout'
import {
  getParentSlide,
  getSlideDisplayLabel,
  type NavItem,
  type SlideViewType,
} from '@/types/nav'
import { BlueprintPanelLoadingSkeleton } from '@/components/editor/EditorLoadingSkeletons'
import type { BlueprintData } from '@/types/blueprint'

export type ScenarioBlueprintPanelProps = {
  slide: NavItem
  slides: NavItem[]
  paths: PathListItem[]
  selectedPathIds: string[]
  blueprintsByPathId: Map<string, BlueprintData>
  loading?: boolean
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  /** When set, scenario title sits on the gray panel; path frames show path type. */
  sectionTitleLabel?: string
  /** Fixed panel height (phase overview uses the max across scenarios). */
  lockedPanelHeight?: number
  /** When true, panel height does not grow with measured content. */
  lockPanelHeight?: boolean
  /** When set, clicking the panel opens this scenario. */
  onNavigate?: () => void
  /** Phase/overview filter view type — keeps row sizing aligned across scenarios. */
  displayViewType?: SlideViewType
  /** When true, this panel is visually de-emphasized (canvas focus mode). */
  dimmed?: boolean
  /** When true, this panel is the camera focus target — no hover chrome. */
  focusActive?: boolean
  /** See `ResizableComparePanel`. */
  excludeFromRowHeight?: boolean
}

type ScenarioBlueprintPanelBodyProps = ScenarioBlueprintPanelProps & {
  getScenarioDisplayViewType: (scenario: NavItem) => SlideViewType | undefined
}

/**
 * One scenario's blueprint inside a compare panel — title badge, filters and
 * grid. Memoised, with the editor's view-type getter handed in as a prop
 * rather than read from the combined navigation context.
 */
export const ScenarioBlueprintPanelBody = memo(function ScenarioBlueprintPanelBody({
  slide,
  slides,
  paths,
  selectedPathIds,
  blueprintsByPathId,
  loading = false,
  scrollContainerRef: scrollContainerRefProp,
  sectionTitleLabel,
  lockedPanelHeight,
  lockPanelHeight = false,
  onNavigate,
  displayViewType: displayViewTypeProp,
  dimmed = false,
  focusActive = false,
  excludeFromRowHeight = false,
  getScenarioDisplayViewType,
}: ScenarioBlueprintPanelBodyProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = scrollContainerRefProp ?? internalScrollRef

  const scenarioName = getSlideDisplayLabel(slide, slides)
  const parentPhase = getParentSlide(slide, slides)
  const phaseName = parentPhase
    ? getSlideDisplayLabel(parentPhase, slides)
    : undefined
  const storedViewType =
    // The deployment's context answers `undefined` for a scenario that has
    // made no choice, so the default lands here rather than in the reader.
    displayViewTypeProp ?? getScenarioDisplayViewType(slide) ?? 'stacked'
  // Compare needs two sides. The toggle hides below 2 selected paths, but
  // the stored override survives — falling back here keeps a scenario from
  // being stranded in a compare it can no longer leave.
  const displayViewType =
    storedViewType === 'merged' && selectedPathIds.length < 2
      ? 'stacked'
      : storedViewType
  // One path stacked is one band — there is no third arrangement, and no
  // second one either: an overview tile draws the board smaller, never
  // differently.
  const useSideBySideLayout = selectedPathIds.length > 0

  const visibleBlueprints = useMemo(
    () =>
      useSideBySideLayout
        ? itemsInSelectionOrder(selectedPathIds, (id) =>
            blueprintsByPathId.get(id),
          )
        : [],
    [blueprintsByPathId, selectedPathIds, useSideBySideLayout],
  )

  /*
    THE compare model — computed once here, distributed via props; consumers
    never call `buildCompareModel` themselves. Gated null until every
    selected blueprint is loaded: a half-refreshed pair would fabricate
    flash divergences.
  */
  const compareModel = useMemo(() => {
    if (!useSideBySideLayout) return null
    if (visibleBlueprints.length < 2) return null
    if (visibleBlueprints.length !== selectedPathIds.length) return null
    return buildCompareModel(visibleBlueprints as CompareBlueprints)
  }, [selectedPathIds.length, useSideBySideLayout, visibleBlueprints])

  /*
    Merged = ONE COMBINED BLUEPRINT (Phase 4b). `MergedCompareGrid` renders
    the compared paths as a single grid — one lane rail, one canonical step
    axis, shared slots drawn once, divergent slots stacking each path's
    version — so the mode is a real canvas change, not a reading posture.

    The reading PRESET: entering Merged opens the Differences ledger, so
    one gesture lands in review posture. (Fold retired 2026-08-17 — the
    step axis no longer compresses on entry.)

    This is THE one seam for it: both entry paths — the menubar
    CompareViewToggle and the agent's `set_scenario_view merged` — mutate the
    EditorContext view override, and both land here as a `displayViewType`
    transition. Gating the tracked mode on `compareModel` makes degenerate
    cases (<2 paths, half-loaded pair, overview rows) a natural no-op, and
    the null-reset means re-entering compare does not replay a stale
    transition.
  */
  const cellDetail = useBlueprintCellDetailOptional()
  const openDifferences = cellDetail?.openDifferences
  /*
    Is THIS board the one the detail view is scoped to? Every scenario stays
    mounted behind the focused one, and the cell-detail provider's `enabled`
    is a single boolean above all of them — which is why the two axis headers
    would go live on every board at once, and why a lane header on a band the
    reader had not chosen would open "Nothing recorded for this lane yet."
    Published as a context rather than threaded as a prop: the headers sit
    five components down (rail → band → grid → panel body) and nothing in
    between has any business knowing about focus.

    Not `focusActive` — that is the CAMERA's focus, and it is false on the one
    board a slice tab renders solo, where the detail view is nonetheless
    scoped to exactly that scenario.
  */
  const boardInDetailScope =
    cellDetail?.scenarioId != null && cellDetail.scenarioId === slide.id
  const compareMode = compareModel ? displayViewType : null
  const previousCompareModeRef = useRef<SlideViewType | null>(null)
  useEffect(() => {
    const previous = previousCompareModeRef.current
    previousCompareModeRef.current = compareMode
    if (previous === 'stacked' && compareMode === 'merged') {
      openDifferences?.()
    }
  }, [compareMode, openDifferences])

  /*
    Publish THE compare context (model + blueprints + scenario identity) to
    the cross-surface store — the menubar [≠ N] count, the portalled ledger
    drawer and the agent all read from it. Exactly one panel qualifies at a
    time (only the focused scenario leaves the overview's shared-row
    contract), so the registration is effectively a singleton. Agent parity
    ships with the surface: differences_filter + the get_ui_state 'compare'
    line register alongside.
  */
  useEffect(() => {
    // Multiple compare-capable panels remain mounted in overview/phase views.
    // Only the explicitly focused scenario may own singleton agent commands
    // and the portalled review store; mount order is not active ownership.
    if (!compareModel || !focusActive) return
    const unregisterStore = registerCompareReview({
      slideId: slide.id,
      scenarioName,
      phaseName,
      viewMode: displayViewType,
      model: compareModel,
      blueprints: visibleBlueprints,
    })
    const unregisterContext = registerAgentUiContext('compare', () => {
      const state = getCompareReviewState()
      const registration = state.registration
      if (!registration) return null
      const stepGroups = deriveCompareStepGroups(registration.model)
      const names = registration.blueprints
        .map((blueprint) => `"${blueprint.path.name}"`)
        .join(' vs ')
      const filterBits: string[] = []
      if (state.filters.lanes.length > 0)
        filterBits.push(`lanes ${state.filters.lanes.join(', ')}`)
      if (state.filters.verdicts.length > 0)
        filterBits.push(`verdicts ${state.filters.verdicts.join(', ')}`)
      if (state.filters.steps.length > 0) {
        const labels = stepGroups
          .filter((group) => state.filters.steps.includes(group.columnKey))
          .map((group) => group.headerLabel)
        filterBits.push(`steps ${labels.join(', ')}`)
      }
      const activeIndex = stepGroups.findIndex(
        (group) => group.columnKey === state.activeStepKey,
      )
      // Mode is a real canvas fact, not a preset: describe what the reader
      // is looking at so the agent never says "Merged view" without saying
      // that the paths are drawn as ONE blueprint.
      const modeLine =
        registration.viewMode === 'merged'
          ? 'Merged view — the paths are combined into ONE blueprint: one lane rail, one step axis, shared cells drawn once, and divergent slots stacking each path\'s version (each still its own clickable cell)'
          : 'Stacked view — one full band per path on a shared step axis'
      return [
        `Comparing ${names} in ${modeLine} (scenario "${registration.scenarioName}"):`,
        `${countCompareDifferences(registration.model)} differences across ${stepGroups.length} divergent steps.`,
        activeIndex >= 0
          ? `Active step ${stepGroups[activeIndex].headerLabel} (${activeIndex + 1} of ${stepGroups.length}).`
          : 'No step active.',
        state.ledgerOpen
          ? 'Difference ledger is OPEN.'
          : 'Difference ledger is closed.',
        filterBits.length > 0
          ? `Ledger filter: ${filterBits.join('; ')}.`
          : 'Ledger filter: none.',
      ].join(' ')
    })
    const unregisterJump = registerAgentUiCommand({
      name: 'jump_divergence',
      summary:
        "Fly the camera to a divergent STEP of the compared paths and mark it active (the ledger opens that step's group). arg: next | prev | <step number> — the canonical step number the ledger shows as \"Step N\".",
      run: async (arg) => {
        const state = getCompareReviewState()
        const registration = state.registration
        if (!registration) return 'No comparison is active.'
        const stepGroups = deriveCompareStepGroups(registration.model)
        if (stepGroups.length === 0)
          return 'The compared paths have no divergent steps — they are identical on the canvas.'
        const currentIndex = stepGroups.findIndex(
          (group) => group.columnKey === state.activeStepKey,
        )
        const input = arg?.trim() ?? ''
        let targetIndex: number
        if (input === '' || input === 'next') {
          targetIndex =
            currentIndex < 0
              ? 0
              : Math.min(currentIndex + 1, stepGroups.length - 1)
        } else if (input === 'prev') {
          targetIndex =
            currentIndex < 0 ? stepGroups.length - 1 : Math.max(currentIndex - 1, 0)
        } else {
          const parsedStep = Number(input)
          const found = stepGroups.findIndex((group) => group.step === parsedStep)
          if (!Number.isInteger(parsedStep) || found < 0)
            return `No divergent step "${input}" — divergent steps are ${stepGroups
              .map((group) => group.step)
              .join(', ')}. arg: next | prev | <step number>.`
          targetIndex = found
        }
        const group = stepGroups[targetIndex]
        const outcome = await jumpToCompareStep(group, registration.slideId)
        return `${group.headerLabel} — divergent step ${targetIndex + 1} of ${stepGroups.length}, ${group.slots.length} difference${
          group.slots.length === 1 ? '' : 's'
        }${
          outcome?.kind === 'flown' && outcome.completion === 'completed'
            ? ' — camera flown to it.'
            : ` — marked active, but the camera ${outcome?.kind === 'flown' ? outcome.completion : 'could not resolve its cells'}.`
        }`
      },
    })
    const unregisterFilter = registerAgentUiCommand({
      name: 'differences_filter',
      summary:
        'Filter the difference ledger. arg grammar: lane:"Front Stage" verdict:divergent step:"Pay" — space-separated, multi-select per key; verdicts: divergent | only; steps are matched by step name; empty arg clears the filter.',
      run: (arg) => {
        const input = arg?.trim() ?? ''
        if (input === '') {
          clearCompareFilters()
          return 'Ledger filter cleared — showing every difference.'
        }
        const registration = getCompareReviewState().registration
        if (!registration) return 'No comparison is active.'
        const parsed = parseCompareLedgerFilter(input)
        if (parsed.errors.length > 0)
          return `Could not parse: ${parsed.errors.join(', ')}. Grammar: lane:"<lane name>" verdict:<divergent|only> step:"<step name>". Nothing was changed.`
        const resolvedSteps = resolveCompareStepKeys(
          registration.model,
          parsed.stepNames,
        )
        if (resolvedSteps.unknown.length > 0)
          return `No such step${
            resolvedSteps.unknown.length === 1 ? '' : 's'
          }: ${resolvedSteps.unknown.join(', ')}. Steps in this comparison: ${registration.model.columns
            .map((column) => column.label)
            .join(', ')}. Nothing was changed.`
        setCompareFilters({
          lanes: parsed.lanes,
          verdicts: parsed.verdicts,
          steps: resolvedSteps.steps,
        })
        const bits: string[] = []
        if (parsed.lanes.length > 0) bits.push(`lanes: ${parsed.lanes.join(', ')}`)
        if (parsed.verdicts.length > 0)
          bits.push(`verdicts: ${parsed.verdicts.join(', ')}`)
        if (parsed.stepNames.length > 0)
          bits.push(`steps: ${parsed.stepNames.join(', ')}`)
        return `Ledger filtered — ${bits.join('; ') || 'no facets'}.`
      },
    })
    // Fold retired 2026-08-17: collapse_shared / toggle_pleat commands
    // removed with the human toggle — no agent-only canvas state.
    return () => {
      unregisterFilter()
      unregisterJump()
      unregisterContext()
      unregisterStore()
    }
  }, [
    compareModel,
    displayViewType,
    focusActive,
    phaseName,
    scenarioName,
    slide.id,
    visibleBlueprints,
  ])

  /*
    Merged only renders once the model exists — it IS a comparison, so a
    single path or a half-loaded pair has nothing to merge and falls back to
    the stacked bands (which read fine with one band).
  */
  const mergedModel = displayViewType === 'merged' ? compareModel : null

  // View mode owns arrangement; camera focus only changes the viewport
  // transform. This key therefore stays stable across overview ⇄ focus.
  const compareFitContentKey = `${slide.id}:${selectedPathIds.join(',')}:${displayViewType}:${paths.length}`
  const stackedColumnCount =
    compareModel?.columns.length ??
    visibleBlueprints.reduce((sum, blueprint) => sum + blueprint.steps.length, 0)
  const sectionTitleSummary = sectionTitleLabel
    ? slide.summary
    : undefined
  const sectionTitleInfoTooltip = sectionTitleLabel
    ? (slide.note ?? null)
    : null

  // The chrome this panel will ACTUALLY have. A locked panel carries no
  // resize handle, and an estimate that budgets one is dead gray space —
  // the estimate has to describe the same panel the measurement will.
  const scrollChrome = { lockHeight: lockPanelHeight }
  const panelHeight =
    lockedPanelHeight ??
    (mergedModel !== null
      ? // Merged is about one band tall; the swell over divergent slots
        // comes from the panel's measurement, not from this floor.
        getMergedComparePanelHeight(visibleBlueprints, false, scrollChrome)
      : useSideBySideLayout
        ? getStackedComparePanelHeight(visibleBlueprints, false, scrollChrome)
        : getComparePanelHeight(visibleBlueprints, false, scrollChrome))

  const comparePanelProps = {
    // Compare-grid estimates run hot (the height one predates
    // classification collapsing stacked slots). A floor set from a hot
    // estimate is dead gray space — the measured content rules instead.
    minWidth: useSideBySideLayout
      ? getStackedComparePanelWidth(stackedColumnCount)
      : getComparePanelWidth(visibleBlueprints),
    minHeight: panelHeight,
    defaultWidth: useSideBySideLayout
      ? getStackedComparePanelWidth(stackedColumnCount)
      : getComparePanelWidth(visibleBlueprints),
    defaultHeight: panelHeight,
    lockHeight: lockPanelHeight,
    excludeFromRowHeight,
    onNavigate,
    navigateLabel: onNavigate ? `Open ${scenarioName} scenario` : undefined,
    panelTitleLabel: sectionTitleLabel,
    panelTitleSummary: sectionTitleSummary,
    panelTitleInfoTooltip: sectionTitleInfoTooltip,
    focusSlideId: slide.id,
    dimmed,
    focusActive,
    scrollContainerRef,
  }

  // The stacked axis needs every selected blueprint before it means anything
  // — a band-by-band trickle would reshuffle canonical columns per arrival.
  const stackedStillLoading =
    loading &&
    useSideBySideLayout &&
    selectedPathIds.length >= 2 &&
    visibleBlueprints.length < selectedPathIds.length

  if (
    (loading && visibleBlueprints.length === 0) ||
    stackedStillLoading
  ) {
    return (
      <div
        className={cn(
          'flex flex-col gap-2 transition-opacity motion-reduce:transition-none duration-(--motion-fade) ease-arrive',
          dimmed && FOCUS_DIM_CLASS,
        )}
        data-focus-slide-id={slide.id}
        data-canvas-focus-dimmed={dimmed ? '' : undefined}
        style={dimmed ? FOCUS_DIM_STYLE : undefined}
        role="status"
        aria-busy="true"
        aria-label="Loading blueprint"
      >
        <BlueprintPanelLoadingSkeleton />
      </div>
    )
  }

  if (visibleBlueprints.length === 0) {
    // Selected filter paths don't exist here — omit the card entirely so only
    // scenarios that contain the path remain in the phase row.
    if (selectedPathIds.length === 0 && paths.length > 0) {
      return null
    }

    return (
      <div
        className={cn(
          'flex min-h-[280px] min-w-[320px] items-center justify-center rounded-lg border border-dashed p-8 text-center transition-opacity motion-reduce:transition-none duration-(--motion-fade) ease-arrive',
          dimmed && FOCUS_DIM_CLASS,
        )}
        data-focus-slide-id={slide.id}
        data-canvas-focus-dimmed={dimmed ? '' : undefined}
        style={dimmed ? FOCUS_DIM_STYLE : undefined}
      >
        <p className="text-sm text-muted-foreground">
          No blueprint data for this scenario yet.
        </p>
      </div>
    )
  }

  if (useSideBySideLayout) {
    return (
      <ScenarioBoardScopeContext.Provider value={boardInDetailScope}>
        <ResizableComparePanel
          {...comparePanelProps}
          fitContentKey={`${compareFitContentKey}:${visibleBlueprints.map((b) => b.path.id).join(',')}`}
        >
          {mergedModel !== null ? (
            <MergedCompareGrid
              blueprints={visibleBlueprints}
              model={mergedModel}
              scrollContainerRef={scrollContainerRef}
              scenarioName={scenarioName}
              phaseName={phaseName}
            />
          ) : (
            <StackedCompareGrid
              blueprints={visibleBlueprints}
              model={compareModel}
              scrollContainerRef={scrollContainerRef}
              scenarioName={scenarioName}
              phaseName={phaseName}
              sectionTitleLabel={sectionTitleLabel}
            />
          )}
        </ResizableComparePanel>
      </ScenarioBoardScopeContext.Provider>
    )
  }

  return (
    /* No path selected: the same scope, an empty board — see the branch above. */
    <ScenarioBoardScopeContext.Provider value={boardInDetailScope}>
      <ResizableComparePanel
        {...comparePanelProps}
        fitContentKey={`${compareFitContentKey}:${visibleBlueprints.map((b) => b.path.id).join(',')}:none`}
      >
        {/*
          Nothing, on purpose. This branch is reached only with no visible
          blueprint. It used to map that empty list over the horizontal
          overview arrangement, which no path can reach now that a scenario
          is one board drawn at one size. The empty state is the same empty
          state; the second renderer that drew it is gone.
        */}
        <div className="flex flex-row items-start gap-6" />
      </ResizableComparePanel>
    </ScenarioBoardScopeContext.Provider>
  )
})
