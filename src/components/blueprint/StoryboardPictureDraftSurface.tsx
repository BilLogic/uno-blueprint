import { useId, useState } from 'react'
import { OptionSelect } from '@/components/blueprint/OptionSelect'
import { PanelHeader, PanelKindBadge } from '@/components/blueprint/panelShell'
import { StoryboardCellRows, type StoryboardCellRow } from '@/components/blueprint/StoryboardCellRows'
import type { DraftCellTarget } from '@/components/blueprint/CellPanelEditor'
import { requestPanelTransition } from '@/lib/openPanelStore'

/** An empty strip adds a picture to a chosen cell; it never creates a storyboard cell. */
export function StoryboardPictureDraftSurface({
  draft,
  rows,
  canEdit,
  onClose,
}: {
  draft: DraftCellTarget
  rows: StoryboardCellRow[]
  canEdit: boolean
  onClose: () => void
}) {
  const candidates = rows.filter((row) => row.cell.content.trim())
  const [cellId, setCellId] = useState(candidates.length === 1 ? candidates[0].cell.id : '')
  const selected = candidates.find((row) => row.cell.id === cellId)
  const selectorId = useId()
  return (
    <>
      <PanelHeader
        title="Add picture"
        titleShown
        description={`Step ${draft.stepIndex + 1} · ${draft.stepName}`}
        descriptionShown
        closeLabel="Close storyboard"
        closeAriaLabel="Close storyboard"
        onClose={onClose}
      />
      <div className="blueprint-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <PanelKindBadge label="Storyboard" />
        {candidates.length ? (
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={selectorId}>Picture for</label>
            <OptionSelect
              id={selectorId}
              value={selected?.cell.id ?? ''}
              required
              disabled={!canEdit}
              options={[
                { value: '', label: 'Choose a cell' },
                ...candidates.map((row) => ({
                  value: row.cell.id,
                  label: row.label,
                  meaning: row.cell.content,
                })),
              ]}
              onChange={(next) => requestPanelTransition(() => setCellId(next))}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add a cell in another lane at this step first.
          </p>
        )}
        <StoryboardCellRows
          rows={selected ? [selected] : []}
          draftCellId={selected?.cell.id}
          canEdit={canEdit}
        />
      </div>
    </>
  )
}
