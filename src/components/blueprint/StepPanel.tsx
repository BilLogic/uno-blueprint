import type { SessionEntry } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import { PathOrderSection } from './PathOrderSection'
import {
  useStructureCreatePaths,
  NEW_STRUCTURE_ITEM,
} from '@/hooks/useStructureCreatePaths'
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
import { useStepSpec, type StepSpec } from '@/hooks/useStepSpec'
import { usePanelFooterHost } from '@/hooks/usePanelFooterHost'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { Input } from '@/components/ui/input'
import type { StructureDraft } from '@/contexts/EntityDetailContext'
import {
  createStepWithDetails,
  updateStepWithDetails,
} from '@/lib/authoringRpc'

/**
 * The step header opens this panel to read and edit Name and Summary.
 * Storyboard pictures belong to the step's cells in walkthrough lanes and
 * are edited on those cells; their read-only collection has its own panel.
 */
export function StepPanel({
  stepId,
  draft,
  onCreated,
  focusNext,
  onSaved,
  onClose,
}: {
  stepId: string
  draft?: Extract<StructureDraft, { kind: 'step' }>
  onCreated?: (id: string, entry: SessionEntry) => void
  focusNext?: boolean
  onClose: () => void
  onSaved?: () => void
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
            onDone={onSaved ?? onClose}
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
  onCreated,
  focusNext,
  onDone,
}: {
  step: StepSpec
  draft?: Extract<StructureDraft, { kind: 'step' }>
  onCreated?: (id: string, entry: SessionEntry) => void
  focusNext?: boolean
  onDone: () => void
}) {
  const { client, canWrite } = useSupabase()
  const canEdit = useCanvasModeValue() === 'design' && canWrite

  const [name, setName] = useState(step.name)
  const [originalName, setOriginalName] = useState(step.name)
  const [baseline, setBaseline] = useState(step.summary)
  const [summary, setSummary] = useState(baseline)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{
    field: 'name' | 'role' | 'paths' | 'form'
    message: string
  } | null>(null)
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
    if (!name.trim()) {
      setError({ field: 'name', message: 'Enter a name' })
      return
    }
    if (draft && paths.status !== 'ready') return
    if (draft && paths.value.length === 0) {
      setError({ field: 'paths', message: 'Choose at least one path' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (draft) {
        const {id,entry} = await createStepWithDetails(client, {
          ...draft,
          pathId: paths.value.some((entry) => entry.pathId === draft.pathId)
            ? draft.pathId
            : paths.value[0].pathId,
          pathOrders: Object.fromEntries(
            paths.value.map((entry) => [entry.pathId, entry.order]),
          ),
          name,
          summary,
        })
        onCreated?.(id,entry)
      } else {
        await updateStepWithDetails(client, { stepId: step.id, name, summary })
        onDone()
      }
    } catch (cause) {
      setError({
        field: 'form',
        message: toAuthoringError(
          cause instanceof Error ? cause : new Error('Unknown write failure'),
        ).message,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-4"
      data-panel-editor=""
      data-busy={busy || undefined}
    >
      <PanelIdentity
        badge={<PanelKindBadge label="Step" />}
        title={step.name}

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
          {error?.field === 'name' ? (
            <p role="alert" className="text-xs text-destructive">
              {error.message}
            </p>
          ) : null}
        </Field>
      ) : null}

      {draft ? (
        <>
          {error?.field === 'paths' ? <p role="alert" className="text-xs text-destructive">{error.message}</p> : null}
          {paths.status === 'ready' ? (
            <PathOrderSection
              required
              paths={paths.paths}
              value={paths.value}
              onChange={paths.onChange}
              defaultOrder={paths.defaultOrder}
              item={{ id: NEW_STRUCTURE_ITEM, name: name.trim() || 'New step' }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {paths.status === 'error'
                ? 'Paths could not be loaded. Close this draft and try again.'
                : 'Loading paths…'}
            </p>
          )}
        </>
      ) : null}
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

      {canEdit ? (
        <PanelFooterControls
          footerHost={footerHost}
          busy={busy}
          changed={draft ? true : Boolean(name.trim()) && changed}
          error={error?.field === 'form' ? error.message : null}
          saveLabel={
            draft
              ? `Add step${
                  paths.value.length > 1
                    ? ` to ${paths.value.length} paths`
                    : ''
                }`
              : undefined
          }
          onSave={handleSave}
          onCancel={onDone}
        />
      ) : null}
    </div>
  )
}
