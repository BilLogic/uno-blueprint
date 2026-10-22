import { createPortal } from 'react-dom'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { sessionSnapshot, forgetChange, type SessionEntry } from '@/lib/authoringSession'
import { executeRevert } from '@/lib/revertChange'
import { reportWriteFailure } from '@/lib/writeFailures'
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
    focusNext?: boolean
    onCreated: (id: string) => void
    onClose: () => void
  }>
> = {
  service: ({ onClose }) => <ServicePanel onClose={onClose} />,
  lane: ({ id, draft, focusNext, onCreated, onClose }) => (
    <LanePanel
      laneId={id}
      draft={draft?.kind === 'lane' ? draft : undefined}
      onCreated={onCreated}
      focusNext={focusNext}
      onClose={onClose}
    />
  ),
  phase: ({ id, onClose }) => <PhasePanel phaseId={id} onClose={onClose} />,
  scenario: ({ id, onClose }) => (
    <ScenarioPanel scenarioId={id} onClose={onClose} />
  ),
  step: ({ id, draft, focusNext, onCreated, onClose }) => (
    <StepPanel
      stepId={id}
      draft={draft?.kind === 'step' ? draft : undefined}
      onCreated={onCreated}
      focusNext={focusNext}
      onClose={onClose}
    />
  ),
}

function EntityDetailPanelBody() {
  const { selection, preview, closeEntity, openEntity } = useEntityDetail()
  const { client } = useSupabase()
  const [notice,setNotice] = useState<{entry:SessionEntry; message:string} | null>(null)
  const [undoBusy,setUndoBusy] = useState(false)
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
    <>
    {notice ? createPortal(<div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(32rem,calc(100vw-2rem))]"><Alert className="pointer-events-auto shadow-md"><AlertDescription>{notice.message}</AlertDescription><AlertAction><Button type="button" size="sm" variant="ghost" disabled={undoBusy} onClick={async()=>{
      if (!client) return
      setUndoBusy(true)
      try { await executeRevert(client,notice.entry);forgetChange(notice.entry.id);setNotice(null);closeEntity() } catch(error) { reportWriteFailure('The addition was not undone',error) } finally {setUndoBusy(false)}
    }}>Undo</Button></AlertAction></Alert></div>,document.body) : null}
    <PanelDrawerShell
      open={selection !== null}
      onCloseRequest={closeEntity}
      onClosed={() => setClosing(null)}
    >
      <Panel
        key={`${shown.kind}-${shown.draftKey ?? shown.id}`}
        id={shown.id}
        draft={shown.draft}
        focusNext={shown.focusNext}
        onCreated={(id) => {
          const entry = sessionSnapshot().at(-1)
          if (entry?.revert) setNotice({entry,message:`Added the ${preview?.name.trim() || ''} ${shown.kind} to ${preview?.orders.length ?? 1} ${(preview?.orders.length ?? 1) === 1 ? 'path' : 'paths'}`})
          openEntity({ kind: shown.kind, id, focusNext:true })
        }}
        onClose={() => {
          if (!panelEditorBusy()) closeEntity()
        }}
      />
    </PanelDrawerShell>
    </>
  )
}
