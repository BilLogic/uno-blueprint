import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { FeaturedImageField } from './FeaturedImageControl'
import { StoryboardStepDetailStack } from './StoryboardStepDetailStack'
import { useSupabase } from '@/contexts/SupabaseProvider'
import {
  readCellStoryboard,
  updateCellStoryboard,
  type CellStoryboardState,
} from '@/lib/authoringRpc'
import {
  PartialAuthoringWriteError,
  forgetChange,
  type SessionEntry,
} from '@/lib/authoringSession'
import { reportWriteSuccess } from '@/lib/writeFailures'
import { executeRevert } from '@/lib/revertChange'
import {
  registerPanelTransitionGuard,
  requestPanelTransition,
} from '@/lib/openPanelStore'
import type { UploadedAttachment } from '@/lib/attachmentUpload'
import type { BlueprintCell } from '@/types/blueprint'
import type { StoryboardFrameEntry } from '@/lib/storyboardWalkthrough'
import { errorMessage } from '@/lib/utils'

export type StoryboardCellRow = StoryboardFrameEntry & { cell: BlueprintCell }
type Draft = {
  row: StoryboardCellRow
  expected: CellStoryboardState | null
  content: string
  summary: string
  frame: string | null
  attachments: UploadedAttachment[]
}

/** A vertical row editor; the presentation stack remains a read-only reader. */
export function StoryboardCellRows({
  rows,
  canEdit,
  onOpenFullCell,
}: {
  rows: StoryboardCellRow[]
  canEdit: boolean
  onOpenFullCell: (cellId: string) => void
}) {
  const { client, canWrite } = useSupabase()
  const picturedRows = rows.filter(
    (row) => row.frame && row.cell.content.trim(),
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState<(() => void) | null>(null)
  const dirty = Boolean(
    draft?.expected &&
      (draft.content !== draft.expected.content ||
        draft.summary !== (draft.expected.summary ?? '') ||
        draft.frame !== draft.expected.frame ||
        draft.attachments.length),
  )
  const live = useRef({ dirty, busy, pending })
  useLayoutEffect(() => {
    live.current = { dirty, busy, pending }
  })
  useEffect(
    () =>
      registerPanelTransitionGuard((action) => {
        if (live.current.busy || live.current.pending) return false
        if (live.current.dirty) {
          live.current.pending = action
          setPending(() => action)
          return false
        }
        action()
        return true
      }),
    [],
  )
  const open = (row: StoryboardCellRow) =>
    requestPanelTransition(() => {
      if (!client) return
      live.current.busy = true
      setBusy(true)
      setProblem(null)
      setDraft({
        row,
        expected: null,
        content: row.cell.content,
        summary: row.cell.summary ?? '',
        frame: row.cell.frame ?? null,
        attachments: [],
      })
      void readCellStoryboard(client, row.cell.id)
        .then((expected) => {
          setDraft({
            row,
            expected,
            content: expected.content,
            summary: expected.summary ?? '',
            frame: expected.frame,
            attachments: [],
          })
        })
        .catch((error) => setProblem(errorMessage(error)))
        .finally(() => {
          live.current.busy = false
          setBusy(false)
        })
    })
  const change = (update: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...update } : null))
  const announceSaved = (entry: SessionEntry, message = 'Saved the cell') => {
    if (!client) return
    reportWriteSuccess(message, entry.id, async () => {
      await executeRevert(client, entry)
      forgetChange(entry.id)
    })
  }
  const save = async () => {
    if (
      !canEdit ||
      !canWrite ||
      !client ||
      !draft?.expected ||
      !dirty ||
      !draft.content.trim() ||
      live.current.busy
    )
      return
    live.current.busy = true
    setBusy(true)
    setProblem(null)
    try {
      const entry = await updateCellStoryboard(client, {
        cellId: draft.row.cell.id,
        content: draft.content,
        summary: draft.summary,
        frame: draft.frame,
        expected: draft.expected,
        attachments: draft.attachments,
      })
      live.current.dirty = false
      announceSaved(entry)
      setDraft(null)
    } catch (error) {
      if (error instanceof PartialAuthoringWriteError) {
        live.current.dirty = false
        announceSaved(
          error.entry,
          'The cell saved, but its durable change record failed. Undo is available for this edit.',
        )
        setDraft(null)
        setProblem(
          'The cell saved, but its durable change record failed. Undo remains available for this edit.',
        )
      } else setProblem(errorMessage(error))
    } finally {
      live.current.busy = false
      setBusy(false)
    }
  }
  const cancel = () => {
    if (live.current.busy) return
    live.current.dirty = false
    setDraft(null)
    setProblem(null)
  }
  return (
    <div className="flex flex-col gap-5">
      {picturedRows.map((row) => (
        <section
          key={row.cell.id}
          aria-label={row.label}
          className="flex flex-col gap-2"
        >
          {draft?.row.cell.id === row.cell.id ? (
            <form
              aria-label={`Edit ${row.label}`}
              data-panel-editor=""
              data-busy={busy ? '' : undefined}
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <p className="mb-2 text-xs font-medium text-foreground">
                {row.label}
              </p>
              <fieldset
                disabled={busy || !draft.expected || !canEdit || !canWrite}
                className="flex flex-col gap-3"
              >
                <FeaturedImageField
                  cellId={row.cell.id}
                  frame={draft.frame}
                  savedFrame={draft.expected?.frame ?? row.cell.frame ?? null}
                  resources={row.cell.resources ?? []}
                  stagedAttachments={draft.attachments}
                  touchpoints={row.cell.touchpoints}
                  onChange={(frame) => change({ frame })}
                  onUploaded={(attachment) =>
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            attachments: [...current.attachments, attachment],
                          }
                        : null,
                    )
                  }
                  onUploadingChange={(uploading) => {
                    live.current.busy = uploading
                    setBusy(uploading)
                  }}
                />
                <label className="flex flex-col gap-1 text-sm">
                  Text
                  <Textarea
                    required
                    value={draft.content}
                    onChange={(event) =>
                      change({ content: event.target.value })
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Summary
                  <Textarea
                    value={draft.summary}
                    onChange={(event) =>
                      change({ summary: event.target.value })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => onOpenFullCell(row.cell.id)}
                >
                  Open full cell
                </Button>
              </fieldset>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !canEdit ||
                    !canWrite ||
                    !dirty ||
                    !draft.content.trim()
                  }
                >
                  {!draft.expected ? 'Loading…' : busy ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <StoryboardStepDetailStack
                entries={[row]}
                galleryEntries={picturedRows}
              />
              {canEdit ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => open(row)}
                  aria-label={`Edit ${row.label}`}
                >
                  Edit
                </Button>
              ) : null}
            </>
          )}
        </section>
      ))}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) {
            live.current.pending = null
            setPending(null)
          }
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          data-panel-dialog=""
          className="fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl bg-background p-6 text-foreground shadow-lg ring-1 ring-border-overlay"
        >
          <DialogTitle className="text-lg font-semibold">
            Discard unsaved changes?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your changes to this cell have not been saved.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                live.current.pending = null
                setPending(null)
              }}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = pending
                live.current.dirty = false
                live.current.pending = null
                setPending(null)
                setDraft(null)
                action?.()
              }}
            >
              Discard changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
