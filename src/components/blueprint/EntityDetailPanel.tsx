import { useEffect, useState, type ComponentType } from 'react'
import { ServicePanel } from '@/components/blueprint/ServicePanel'
import { LanePanel } from '@/components/blueprint/LanePanel'
import { PhasePanel } from '@/components/blueprint/PhasePanel'
import { ScenarioPanel } from '@/components/blueprint/ScenarioPanel'
import { StepPanel } from '@/components/blueprint/StepPanel'
import {
  DetailPanelErrorBoundary,
  PANEL_EXIT_MS,
  PanelDrawerShell,
} from '@/components/blueprint/panelShell'
import {
  useEntityDetail,
  type EntityDetailKind,
  type EntityDetailSelection,
  type StructureDraft,
} from '@/contexts/EntityDetailContext'
import { panelEditorBusy } from '@/lib/panelEditorBusy'
import { useCanvasTopOffset } from '@/hooks/useCanvasTopOffset'

/**
 * The drawer for everything that is not a cell: service, lane, phase,
 * scenario, step.
 *
 * ONE drawer for all three, at one tree position, so switching from a lane to
 * a phase is a content swap inside the open drawer rather than a close and a
 * reopen — the same guarantee the cell panel's four surfaces rely on.
 */
export function EntityDetailPanel() {
  return (
    <DetailPanelErrorBoundary
      logPrefix="entity-detail"
      message="These properties failed to display. The canvas is unaffected."
    >
      <EntityDetailPanelBody />
    </DetailPanelErrorBoundary>
  )
}

/**
 * One panel per kind, keyed by the kind itself.
 *
 * `Record<EntityDetailKind, …>` rather than a ladder of five `kind === '…'`
 * tests: adding a sixth member to the union is then a compile error here
 * instead of a drawer that opens empty. Every panel takes the same two props
 * so the lookup can be rendered without knowing which one it found —
 * `ServicePanel` accepts `id` and ignores it, because there is one service and
 * the panel resolves it itself.
 */
const PANELS: Record<
  EntityDetailKind,
  ComponentType<{
    id: string
    draft?: StructureDraft
    onCreated: (id: string) => void
    onClose: () => void
  }>
> = {
  service: ({ onClose }) => <ServicePanel onClose={onClose} />,
  lane: ({ id, draft, onCreated, onClose }) => (
    <LanePanel
      laneId={id}
      draft={draft?.kind === 'lane' ? draft : undefined}
      onCreated={onCreated}
      onClose={onClose}
    />
  ),
  phase: ({ id, onClose }) => <PhasePanel phaseId={id} onClose={onClose} />,
  scenario: ({ id, onClose }) => (
    <ScenarioPanel scenarioId={id} onClose={onClose} />
  ),
  step: ({ id, draft, onCreated, onClose }) => (
    <StepPanel
      stepId={id}
      draft={draft?.kind === 'step' ? draft : undefined}
      onCreated={onCreated}
      onClose={onClose}
    />
  ),
}

function EntityDetailPanelBody() {
  const { selection, closeEntity, openEntity } = useEntityDetail()
  /*
    Kept only so the exit animation has something to draw. Captured with a
    guarded render-phase set — the codebase's derive-during-render idiom —
    and cleared when the drawer reports it has finished closing. Without it
    the panel empties instantly and then slides out blank.
  */
  const [closing, setClosing] = useState<EntityDetailSelection | null>(
    selection,
  )
  if (selection && closing !== selection) setClosing(selection)

  /*
    The snapshot's other end. `onClosed` (the drawer's own completion
    callback) does not fire for this popup — measured — so the content would
    otherwise stay rendered forever behind a finished exit transition, leaving
    an invisible 320px drawer over the canvas. See PANEL_EXIT_MS.
  */
  useEffect(() => {
    if (selection !== null || closing === null) return
    const timer = window.setTimeout(() => setClosing(null), PANEL_EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [selection, closing])

  // `closing !== null` too: this hook's cleanup removes the measured top
  // variable, and running it the instant a close begins makes the panel jump
  // upward before it slides out. See the same note on the cell panel.
  useCanvasTopOffset(selection !== null || closing !== null)

  const shown = selection ?? closing
  /*
    Nothing open and nothing leaving: render NOTHING, so the drawer mounts
    with `open` already true the next time one is selected. That is what the
    cell panel does (`if (activeSurface === null) return null`) and the entry
    animation depends on it — animations.css states the pre-insertion values
    through `@starting-style` precisely because base-ui's own `starting` flag
    never fires for a root that mounts open. Rendering the shell permanently
    also left a closed drawer stuck mid-exit, still in the DOM at opacity 0.
  */
  if (shown === null) return null

  const Panel = PANELS[shown.kind]

  return (
    <PanelDrawerShell
      open={selection !== null}
      onCloseRequest={closeEntity}
      onClosed={() => setClosing(null)}
    >
      <Panel
        key={`${shown.kind}-${shown.id}`}
        id={shown.id}
        draft={shown.draft}
        onCreated={(id) => openEntity({ kind: shown.kind, id })}
        onClose={() => {
          if (!panelEditorBusy()) closeEntity()
        }}
      />
    </PanelDrawerShell>
  )
}
