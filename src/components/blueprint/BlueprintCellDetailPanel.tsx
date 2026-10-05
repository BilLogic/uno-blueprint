import { useEffect, useState } from 'react'
import { ArrowLeft, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { CellInSlicesFooter } from '@/components/blueprint/CellInSlicesFooter'
import { CellDetailDifferencesSurface } from '@/components/blueprint/CellDetailDifferencesSurface'
import { CellDetailDraftSurface } from '@/components/blueprint/CellDetailDraftSurface'
import { CellDetailEmptySurface } from '@/components/blueprint/CellDetailEmptySurface'
import { CellDetailOverview } from '@/components/blueprint/CellDetailOverview'
import { cellDetailCrumbs } from '@/components/blueprint/cellDetailCrumbs'
import {
  CellDetailTabs,
  type PanelTab,
} from '@/components/blueprint/CellDetailTabs'
import { useCellPanelAgentCommands } from '@/components/blueprint/cellDetailAgentCommands'
import { PanelSurfaceSwitcher } from '@/components/blueprint/PanelSurfaceSwitcher'
import {
  useCellOverviewFacts,
  useCellPanelFacts,
  useCellTabsFacts,
  useSelectedCell,
} from '@/components/blueprint/cellDetailFacts'
import {
  CELL_PANEL_FOOTER_ID,
  DetailPanelErrorBoundary,
  PanelDrawerShell,
  PanelFooterHost,
  PanelHeader,
  PanelIdentity,
  PanelKindBadge,
} from '@/components/blueprint/panelShell'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { StoryboardStepDetailStack } from '@/components/blueprint/StoryboardStepDetailStack'
import { Button } from '@/components/ui/button'
import {
  useBlueprintCellDetail,
  type BlueprintPanelSurface,
} from '@/contexts/BlueprintCellDetailContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { ResourceDraftsProvider } from '@/contexts/ResourceDraftsContext'
import { useCanvasTopOffset } from '@/hooks/useCanvasTopOffset'
import { useMobileShell } from '@/hooks/useMobileShell'
import { useSupabase } from '@/contexts/SupabaseProvider'
import {
  setCompareLedgerOpen,
  useCompareReviewState,
} from '@/lib/compareReviewStore'
import {
  buildBlueprintCellSelectionForId,
  scrollBlueprintCellIntoView,
} from '@/lib/blueprintCellConnections'
import {
  buildTouchpointSelectionForItem,
  scrollBlueprintTouchpointCellIntoView,
} from '@/lib/blueprintStepTech'
import { shouldUseStoryboardContent } from '@/lib/blueprintLayout'
import { resolveBlueprintCellId } from '@/lib/resolveBlueprintCellId'
import { panelEditorBusy } from '@/lib/panelEditorBusy'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'


/**
 * Side panel for the selected cell — its content, evidence, dependencies and
 * the slices it belongs to. Anchors below the sticky slide header via a
 * measured CSS variable so it never covers it.
 */
export function BlueprintCellDetailPanel() {
  return (
    <DetailPanelErrorBoundary
      logPrefix="cell-detail"
      message="This cell's details failed to display. The canvas is unaffected."
    >
      <BlueprintCellDetailPanelBody />
    </DetailPanelErrorBoundary>
  )
}

/**
 * The one snapshot of what the drawer was showing, kept only so the exit
 * animation glides out with content — a ledger-only close animates the
 * ledger, a cell close animates the cell. Cleared when the exit animation
 * completes; while the panel is open it mirrors the live state exactly, so
 * a mid-close reopen can never strand a stale flag.
 */
type PanelClosingSnapshot = {
  selection: BlueprintCellSelection | null
  draft: DraftCellTarget | null
  surface: BlueprintPanelSurface
}

function BlueprintCellDetailPanelBody() {
  const {
    selection: currentSelection,
    clearSelection,
    isOpen,
    blueprints,
    selectCell,
    draftCell,
    panelState,
    setPanelSurface,
  } =
    useBlueprintCellDetail()
  const [closing, setClosing] = useState<PanelClosingSnapshot | null>(
    panelState
      ? {
          selection: currentSelection,
          draft: draftCell,
          surface: panelState.surface,
        }
      : null,
  )
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<PanelTab>('dependencies')
  /*
    Widen/narrow is a DESKTOP control: it trades canvas width for panel
    width, and the phone's posture is a bottom sheet the full width of the
    screen with nothing to trade.
  */
  const mobile = useMobileShell()
  /**
   * One-shot "← Back to Differences" button: set when the ledger's ⇱ opens a
   * cell in Details, cleared when used — and whenever the panel leaves
   * Details, so it can never go stale.
   */
  const [returnToDifferences, setReturnToDifferences] = useState(false)
  const compareRegistration = useCompareReviewState().registration
  const comparing = compareRegistration !== null

  useCellPanelAgentCommands({ setActiveTab, setExpanded, clearSelection })
  const [addingDependency, setAddingDependency] = useState(false)
  const { canWrite } = useSupabase()
  // View mode presents everything read-only; every edit affordance in this
  // panel — pencils, Add dependency, resource editing — is Edit-mode only.
  const canEdit = useCanvasModeValue() === 'design' && canWrite
  const selection = currentSelection ?? closing?.selection ?? null
  const draft = draftCell ?? closing?.draft ?? null
  const activeSurface: BlueprintPanelSurface | null =
    panelState?.surface ?? closing?.surface ?? null
  /*
    `closing !== null` too, not just open: the drawer's `top` comes from the
    measured `--cell-detail-panel-top` variable, and this hook's cleanup
    REMOVES that variable. Keyed on `panelState` alone, the cleanup ran the
    instant a close began — while the exit animation still had ~150ms to
    play — so `top` fell back to the un-measured default (~53px vs the ~94px
    measured under the navbar) and the panel visibly teleported UP, then slid
    out. The variable must outlive the panel by exactly as long as the exit
    does, which is what `closing` measures.
  */
  useCanvasTopOffset(panelState !== null || closing !== null)

  /*
    The drawer's `open` is derived from `panelState`, full stop.

    It used to be its own state, synced from the selection by an effect,
    through a requestAnimationFrame, and back again through base-ui's async
    close callbacks — two owners of one fact, reconciled asynchronously,
    which is a machine for manufacturing disagreements. The reproducible
    one: close the panel, reselect a cell during the ~1s exit animation,
    and the two halves wedge — selection set, canvas dimmed, drawer
    convinced it is already open, and no edge left that could ever reopen
    it. Minutes later a delayed close callback would wipe a selection it
    had never met.

    `closing` survives only to keep the *content* rendered during the exit
    animation, and is cleared when that animation completes. panelState is
    the SINGLE owner — never OR a second boolean into this.
  */
  const drawerOpen = panelState !== null

  /*
    While the panel is open the snapshot mirrors the live state exactly —
    ONE snapshot for everything the drawer renders (selection, draft,
    surface), so a stale half from a still-animating close can never win
    over freshly opened content. Guarded render-phase set, the codebase's
    derive-during-render idiom.
  */
  if (
    panelState &&
    (closing?.selection !== currentSelection ||
      closing.draft !== draftCell ||
      closing.surface !== panelState.surface)
  ) {
    setClosing({
      selection: currentSelection,
      draft: draftCell,
      surface: panelState.surface,
    })
  }

  // One-shot hygiene for the return button (guarded render-phase set).
  if (
    returnToDifferences &&
    (activeSurface !== 'details' || !comparing)
  ) {
    setReturnToDifferences(false)
  }

  // A new cell always opens on Dependencies (state reset during render).
  // The arrow editor closes with it — a half-typed arrow carried onto a
  // different cell would be pointing away from somewhere nobody is looking.
  const currentCellId = currentSelection?.paths[0]?.cellId
  const [lastCellId, setLastCellId] = useState(currentCellId)
  if (lastCellId !== currentCellId) {
    setLastCellId(currentCellId)
    setActiveTab('dependencies')
    setAddingDependency(false)
  }

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !panelEditorBusy()) {
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection, isOpen])

  // Mirror "the ledger is showing" into the compare store so surfaces with
  // no React path to this panel (get_ui_state, the strip) can read it.
  const ledgerShowing = panelState?.surface === 'differences'
  useEffect(() => {
    setCompareLedgerOpen(ledgerShowing)
    return () => setCompareLedgerOpen(false)
  }, [ledgerShowing])

  /*
    ONE resolution of the selected cell — the path's board, the cell in it, the
    lane it sits in, the dependencies that reach it — and three narrow readings
    hung off it, one per reader. The resolution is a handle this body forwards,
    never a bag it reads facts out of: everything below comes from the drawer's
    own reading, and each reader's props name what that reader reads and
    nothing else.
  */
  const selectedCell = useSelectedCell({ blueprints, selection, draft })
  const panelFacts = useCellPanelFacts(selectedCell)
  const overviewFacts = useCellOverviewFacts(selectedCell)
  const tabsFacts = useCellTabsFacts(selectedCell)
  const {
    pathEntry,
    cellId: resolvedCellId,
    blueprint: selectedBlueprint,
    lane: laneResolution,
    dependencyCandidates,
    existingDependencies,
    dependencySource,
    storyboardStepEntries,
  } = panelFacts

  const selectedLane = selection ? (laneResolution?.lane ?? null) : null

  /*
    The lane badge, tinted with that lane's own cell colour. Defined here
    rather than in the details branch because the DRAFT branch renders it
    too — the row a new cell is being written into is the first thing that
    branch says, and it used to say it through a hand-rolled span whose
    `backgroundColor: style.lane` was a role key ("actor"), not a colour.
    The browser dropped the declaration and the badge rendered untinted,
    which is the fault `PanelKindBadge` exists to have fixed once.
  */
  const laneBadge = laneResolution ? (
    <PanelKindBadge
      label={laneResolution.laneName}
      laneRole={laneResolution.style.lane}
      title={laneResolution.laneName}
      description={laneResolution.description}
    />
  ) : null

  // Fully closed and the exit animation has completed — nothing to render.
  if (activeSurface === null) return null

  const handleClosed = () => setClosing(null)

  const expandToggle = mobile ? null : (
    <IconTooltip
      label={expanded ? 'Narrow the panel' : 'Widen the panel'}
      side="left"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
        aria-pressed={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <PanelRightClose /> : <PanelRightOpen />}
      </Button>
    </IconTooltip>
  )

  /*
    The Details │ Differences switcher — the two surfaces are true siblings
    of the whole panel, so their switch is TOP-LEVEL chrome, above every
    branch's own header. Rendered only while a comparison is live; outside
    compare the panel is exactly what it was before v3.
  */
  const surfaceSwitcher = comparing ? (
    <div className="flex shrink-0 items-center border-b border-muted px-4 py-2">
      <PanelSurfaceSwitcher
        value={activeSurface}
        onValueChange={setPanelSurface}
      />
    </div>
  ) : null

  const handleOpenCellFromDifferences = (
    nextSelection: BlueprintCellSelection,
  ) => {
    setReturnToDifferences(true)
    selectCell(nextSelection)
  }

  // Differences: a sibling of the cell view, and needs no selection.
  if (activeSurface === 'differences') {
    return (
      <PanelDrawerShell
        open={drawerOpen}
        expanded={expanded}
        onCloseRequest={clearSelection}
        onClosed={handleClosed}
      >
        <CellDetailDifferencesSurface
          comparing={comparing}
          registration={compareRegistration}
          expandToggle={expandToggle}
          onSurfaceChange={setPanelSurface}
          onClose={clearSelection}
          onOpenCell={handleOpenCellFromDifferences}
        />
      </PanelDrawerShell>
    )
  }

  // A draft cell: an empty slot's target, written only on Save.
  if (!selection && draft) {
    return (
      <PanelDrawerShell
        open={drawerOpen}
        expanded={expanded}
        onCloseRequest={clearSelection}
        onClosed={handleClosed}
      >
        <CellDetailDraftSurface
          draft={draft}
          laneBadge={laneBadge}
          surfaceSwitcher={surfaceSwitcher}
          onClose={clearSelection}
        />
        {/* The editor portals Create/Cancel here — panel-level footing. */}
        <PanelFooterHost id={CELL_PANEL_FOOTER_ID} />
      </PanelDrawerShell>
    )
  }

  // Details with nothing picked — a placeholder, not a vanished drawer.
  if (!selection) {
    return (
      <PanelDrawerShell
        open={drawerOpen}
        expanded={expanded}
        onCloseRequest={clearSelection}
        onClosed={handleClosed}
      >
        <CellDetailEmptySurface
          surfaceSwitcher={surfaceSwitcher}
          onClose={clearSelection}
        />
      </PanelDrawerShell>
    )
  }

  // View mode presents everything read-only, so the form — and the one Save
  // it portals into the footer below — exists only where an author may write.
  const editingCell = canEdit && resolvedCellId !== null
  const isStoryboardLane = Boolean(
    selectedLane && shouldUseStoryboardContent(selectedLane),
  )
  // The board is named by the drawer's own reading — the panel does not look
  // the path up a second time to answer a click on a row of it.
  const handleConnectionSelect = (cellId: string) => {
    const blueprint = selectedBlueprint
    if (!blueprint) return

    const nextSelection = buildBlueprintCellSelectionForId(
      blueprint,
      resolveBlueprintCellId(cellId),
      selection.scenarioName,
      selection.phaseName,
    )
    if (!nextSelection) return

    selectCell(nextSelection)
    requestAnimationFrame(() => {
      scrollBlueprintCellIntoView(cellId)
    })
  }

  /*
    Edit mode's half of the Dependencies list. Null in view mode, and null is
    what makes the list read-only — the same component either way. The panel
    supplies what the rows cannot work out for themselves (who the source is,
    where an arrow may point, what already exists) plus the one navigation only
    the panel can perform.
  */
  const dependencyEditing =
    canEdit && dependencySource
      ? {
          source: dependencySource,
          candidates: dependencyCandidates,
          existing: existingDependencies,
          // The pencil NAVIGATES: the panel swaps to the cell that owns the
          // arrow, exactly as clicking any other row here does. Not a second
          // panel, and not an inline editor for another cell's row.
          onEditFromOwner: (cellId: string) => {
            setActiveTab('dependencies')
            handleConnectionSelect(cellId)
          },
        }
      : null

  const handleTechSelect = (cellId: string, techItem: string) => {
    const blueprint = selectedBlueprint
    if (!blueprint) return

    const nextSelection = buildTouchpointSelectionForItem(
      blueprint,
      resolveBlueprintCellId(cellId),
      techItem,
      selection.scenarioName,
      selection.phaseName,
    )
    if (!nextSelection) return

    selectCell(nextSelection)
    requestAnimationFrame(() => {
      scrollBlueprintTouchpointCellIntoView(cellId, techItem)
    })
  }

  return (
    <PanelDrawerShell
      open={drawerOpen}
      expanded={expanded}
      onCloseRequest={clearSelection}
      onClosed={handleClosed}
    >
        {surfaceSwitcher}
        {returnToDifferences && comparing ? (
          <div className="shrink-0 px-4 pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors ease-arrive motion-reduce:transition-none duration-(--motion-micro) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => {
                setReturnToDifferences(false)
                setPanelSurface('differences')
              }}
            >
              <ArrowLeft className="size-3" aria-hidden />
              Back to Differences
            </button>
          </div>
        ) : null}
        <PanelHeader
          crumbs={cellDetailCrumbs({ selection, pathEntry })}
          title="Cell details"
          description="Details for the selected blueprint cell"
          actions={expandToggle}
          closeLabel="Close cell details"
          onClose={clearSelection}
        />

        {isStoryboardLane ? (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 blueprint-scroll">
            {/*
              A storyboard cell titles itself with the STEP, not the lane: the
              frames below belong to the moment, not to the row they were
              drawn on.
            */}
            <PanelIdentity badge={laneBadge} title={selection.stepName} meta="" />
            <StoryboardStepDetailStack entries={storyboardStepEntries} />
          </div>
        ) : (
          <>
            {/*
              Overview content is not a tab — it always renders inline at the
              top; the tab row (Dependencies default) sits below it and both
              share one scroll area.
            */}
            {/*
              The resource draft, held here because its two halves are not
              parent and child: the Resources tab edits it, and the form in
              the overview counts it and writes it on its one Save. Keyed the
              way the form is — the cell, the touchpoint it was opened on, and
              whether anybody is editing — so a different cell, a different
              touchpoint or a trip through View mode starts a clean draft,
              and Cancel, which closes the panel, discards it with the rest.
            */}
            <ResourceDraftsProvider
              key={`${resolvedCellId ?? 'no-cell'}:${overviewFacts.placement?.id ?? ''}:${editingCell}`}
              resources={tabsFacts.resources}
              frame={tabsFacts.frame}
              touchpoints={tabsFacts.touchpoints}
              openedPlacementId={overviewFacts.placement?.id ?? null}
            >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto blueprint-scroll">
              <div className="flex flex-col gap-5 px-4 pb-5">
                <CellDetailOverview
                  facts={overviewFacts}
                  selection={selection}
                  laneBadge={laneBadge}
                  editingCell={editingCell}
                  onDone={clearSelection}
                />
              </div>
              <CellDetailTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                facts={tabsFacts}
                dependencyEditing={dependencyEditing}
                addingDependency={addingDependency}
                onAddingDependencyChange={setAddingDependency}
                onCellSelect={handleConnectionSelect}
                onTechSelect={handleTechSelect}
              />
            </div>
            </ResourceDraftsProvider>
            {/* The editor portals Save/Cancel here — below the tabs, shared
                footing for every property the panel holds. */}
            {editingCell ? (
              <PanelFooterHost id={CELL_PANEL_FOOTER_ID} />
            ) : null}
            <CellInSlicesFooter cellId={pathEntry?.cellId ?? null} />
          </>
        )}
    </PanelDrawerShell>
  )
}
