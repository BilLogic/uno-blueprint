import { toAuthoringError } from '@/lib/authoringErrors'
import { PathOrderSection } from './PathOrderSection'
import { useStructureCreatePaths, NEW_STRUCTURE_ITEM } from '@/hooks/useStructureCreatePaths'
import { useState } from 'react'
import {
  STEP_PANEL_FOOTER_ID,
  Field,
  PanelFooterControls,
  PanelFooterHost,
  PanelHeader,
  PanelIdentity,
  PanelKindBadge,
} from '@/components/blueprint/panelShell'
import { StepPanelLoading } from '@/components/blueprint/panelLoading'
import { PanelTextareaField } from '@/components/blueprint/PanelTextareaField'
import { PanelSectionLabel } from '@/components/blueprint/PanelSectionLabel'
import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import { servedUrl } from '@/lib/basePath'
import { PANEL_TERMS } from '@/lib/panelTerms'
import { useStepSpec, type StepSpec } from '@/hooks/useStepSpec'
import { usePanelFooterHost } from '@/hooks/usePanelFooterHost'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { Input } from '@/components/ui/input'
import type { StructureDraft } from '@/contexts/EntityDetailContext'
import { createStepWithDetails, renameStep } from '@/lib/authoringRpc'
import { DraftStoryboardFields } from './DraftStoryboardFields'
import { updateStepSummary } from '@/lib/stepSpecMutations'

/**
 * The step: one moment, read across every lane.
 *
 * `summary` is the only editable field, and it is the one the storyboard row
 * has always needed — the sentence that makes a step legible without
 * reading five cells. The storyboard row itself stays pictures only, so this
 * panel is where that sentence is read and written, and it is why a
 * storyboard cell opens here rather than into a cell panel describing some
 * other lane's text.
 */
export function StepPanel({
  stepId,
  draft,
  onCreated, focusNext,
  onClose,
}: {
  stepId: string
  draft?: Extract<StructureDraft, { kind: 'step' }>
  onCreated?: (id: string) => void
  focusNext?: boolean
  onClose: () => void
}) {
  const result = useStepSpec(draft ? null : stepId)
  const step: StepSpec | null = draft
    ? {
        id: 'draft',
        name: '',
        summary: '',
        scenarioId: '',
        scenarioName: '',
        phaseName: '',
        positions: [],
        frames: [],
      }
    : result.status === 'ready'
    ? result.data
    : null

  return (
    <>
      <PanelHeader
        crumbs={[step?.phaseName ?? '', step?.scenarioName ?? '']}
        title={draft ? 'Add step' : 'Step properties'}
        titleShown={Boolean(draft)}
        description="What this moment is, across every lane"
        closeLabel="Close step properties"
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 blueprint-scroll">
        {step ? (
          <StepPanelBody
            key={step.id}
            step={step}
            draft={draft}
            onCreated={onCreated}
            focusNext={focusNext}
            onDone={onClose}
          />
        ) : result.status === 'error' ? (
          <p className="text-sm text-muted-foreground">
            That step could not be loaded: {result.message}
          </p>
        ) : (
          <StepPanelLoading />
        )}
      </div>
      <PanelFooterHost id={STEP_PANEL_FOOTER_ID} />
    </>
  )
}

function StepPanelBody({
  step,
  draft,
  onCreated, focusNext,
  onDone,
}: {
  step: StepSpec
  draft?: Extract<StructureDraft, { kind: 'step' }>
  onCreated?: (id: string) => void
  focusNext?: boolean
  onDone: () => void
}) {
  const { client, canWrite } = useSupabase()
  const canEdit = useCanvasModeValue() === 'design' && canWrite

  const [name, setName] = useState(step.name)
  const [originalName, setOriginalName] = useState(step.name)
  const [frames, setFrames] = useState<Array<{ laneId: string; url: string }>>(
    [],
  )
  const [baseline, setBaseline] = useState(step.summary)
  const [summary, setSummary] = useState(baseline)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const paths = useStructureCreatePaths(draft, name)
  const footerHost = usePanelFooterHost(STEP_PANEL_FOOTER_ID)

  const changed = summary !== baseline || name !== originalName

  // A reopened panel can mount from stale cache before its refetch finishes.
  // Follow that response while pristine; a response must never replace a draft.
  if (
    !changed &&
    !busy &&
    (step.summary !== baseline || step.name !== originalName)
  ) {
    setOriginalName(step.name)
    setName(step.name)
    setBaseline(step.summary)
    setSummary(step.summary)
  }

  const handleSave = async () => {
    if (!client || busy || (!draft && !changed)) return
    if (!name.trim()) { setError('Enter a name'); return }
    if (draft && paths.status !== 'ready') return
    setBusy(true)
    setError(null)
    try {
      if (draft) {
        const id = await createStepWithDetails(client, {
          ...draft,
          pathOrders: Object.fromEntries(paths.value.map(entry=>[entry.pathId,entry.order])),
          name,
          summary,
          frames,
        })
        onCreated?.(id)
      } else {
        if (name.trim() !== originalName)
          await renameStep(client, {
            stepId: step.id,
            name: name.trim(),
            previousName: originalName,
          })
        if (summary !== baseline)
          await updateStepSummary(client, step.id, summary, baseline)
        onDone()
      }
    } catch (cause) {
      setError(toAuthoringError(cause instanceof Error ? cause : new Error('Unknown write failure')).message)
    } finally {
      setBusy(false)
    }
  }

  /*
    The meta line says only what a reader could not already see.
    "1st of 1 path" is both of those things — the position is on screen and
    the path is in the breadcrumb — so a step that sits where you would expect
    reports its cell count and nothing else. A step that sits at DIFFERENT
    positions on different paths is the one case worth a sentence, and it gets
    the list below as well.
  */
  const distinct = new Set(step.positions.map((entry) => entry.position))
  const positionLabel =
    step.positions.length === 0
      ? 'in no path yet'
      : distinct.size > 1
      ? `different positions on ${step.positions.length} paths`
      : step.positions.length > 1
      ? `${step.positions.length} paths`
      : null

  /*
    The row's frames open, and step to one another.

    One group, in the order the row draws it — lane order, the same moment
    as each actor saw it, which is the whole reason the row is worth
    comparing. Handed to the viewer rather than discovered by scanning the
    row: a scan would reproduce that order today and only by accident,
    until a wrapper element or a CSS reorder quietly broke it.

    Each frame's name is its lane's, the caption already printed under it.
    A frame carries no caption anywhere in the schema and is not getting
    one for the sake of a label — what the picture shows is this moment,
    and the lane says whose view of it this is.
  */
  const frameSiblings = step.frames.map((frame) => ({
    src: frame.src,
    alt: frame.laneName,
  }))

  return (
    <div
      className="flex flex-col gap-4"
      data-panel-editor=""
      data-busy={busy || undefined}
    >
      <PanelIdentity
        badge={<PanelKindBadge label="Step" />}
        title={step.name}
        // Only the surprise: a step that sits at a DIFFERENT position depending
        // on the path. A cell count is bookkeeping, not something a reader of
        // this panel came for.
        meta={positionLabel ?? ''}
      />

      {canEdit ? (
        <Field
          label="Name"
          required
          hint="Use a short label: usually 1–3 words, about 24 characters. Put the explanation in Summary; longer names are allowed."
        >
          <Input
            aria-label="Name"
            required
            autoFocus={Boolean(draft)}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {error === 'Enter a name' ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        </Field>
      ) : null}

      {draft ? <>
        {paths.status === 'ready' ? <PathOrderSection paths={paths.paths} value={paths.value} onChange={paths.onChange} defaultOrder={paths.defaultOrder} item={{id:NEW_STRUCTURE_ITEM,name:name.trim() || 'New step'}} /> : <p className="text-xs text-muted-foreground">{paths.status === 'error' ? 'Paths could not be loaded. Close this draft and try again.' : 'Loading paths…'}</p>}
      </> : null}
      <PanelTextareaField
        label="Summary"
        autoFocus={focusNext}
        hint="What happens in this moment, across every lane — the sentence that makes the step legible without reading five cells."
        placeholder="e.g. The student picks a slot; the system holds it 10 minutes."
        value={summary}
        rows={3}
        disabled={!canEdit}
        onChange={setSummary}
      />

      {draft ? (
        <DraftStoryboardFields
          pathId={draft.pathId}
          frames={frames}
          onChange={setFrames}
        />
      ) : null}

      {step.frames.length > 0 ? (
        // A LABELLED field: "Storyboard" reads as plain text beside Summary,
        // not an outline badge. Its definition rides the label's hint
        // popover, the touch/press affordance every other field label uses.
        <Field label="Storyboard" hint={PANEL_TERMS.storyboard}>
          {/*
            A ROW of frames, not a stack of full-width ones. A step is drawn
            once per actor lane, so three frames stacked at 4:3 pushed the
            sentence this panel exists for below the fold. Side by side they
            read as what they are — the same moment from each lane — and the
            row scrolls rather than the page.
          */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 blueprint-scroll">
            {step.frames.map((frame, index) => (
              <figure
                key={frame.src}
                className="flex w-32 shrink-0 flex-col gap-1"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-muted/20">
                  <ZoomableImage
                    src={frame.src}
                    alt={frame.laneName}
                    triggerLabel={`Expand: ${frame.laneName}`}
                    siblings={frameSiblings}
                    siblingIndex={index}
                    triggerClassName="absolute inset-0 block cursor-pointer"
                  >
                    <img
                      src={servedUrl(frame.src)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain object-center"
                    />
                  </ZoomableImage>
                </div>
                {/* Provenance, quietly: which lane drew this frame. The
                    frame's MEANING is the summary above it. */}
                <figcaption className="truncate text-xs font-normal text-muted-foreground">
                  {frame.laneName}
                </figcaption>
              </figure>
            ))}
          </div>
        </Field>
      ) : null}

      {distinct.size > 1 ? (
        <div className="flex flex-col gap-1">
          <PanelSectionLabel>Position</PanelSectionLabel>
          <ul className="flex flex-col gap-1">
            {step.positions.map((entry) => (
              <li
                key={`${entry.pathName}-${entry.position}`}
                className="text-sm font-normal text-foreground"
              >
                <span className="font-medium text-foreground">
                  {entry.pathName}
                </span>{' '}
                · position {entry.position + 1}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <PanelFooterControls
          footerHost={footerHost}
          busy={busy}
          changed={draft ? true : Boolean(name.trim()) && changed}
          error={error === 'Enter a name' ? null : error}
          saveLabel={draft ? `Add step${paths.value.length > 1 ? ` to ${paths.value.length} paths` : ''}` : undefined}
          onSave={handleSave}
          onCancel={onDone}
        />
      ) : null}
    </div>
  )
}
