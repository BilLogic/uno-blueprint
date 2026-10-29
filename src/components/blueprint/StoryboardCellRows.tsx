import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
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
import { registerPanelTransitionGuard } from '@/lib/openPanelStore'
import type { UploadedAttachment } from '@/lib/attachmentUpload'
import type { BlueprintCell } from '@/types/blueprint'
import type { StoryboardFrameEntry } from '@/lib/storyboardWalkthrough'
import { errorMessage } from '@/lib/utils'

export type StoryboardCellRow = StoryboardFrameEntry & { cell: BlueprintCell }
type Draft = {
  expected: CellStoryboardState | null
  summary: string
  frame: string | null
  attachments: UploadedAttachment[]
}
type EditorState = { dirty: boolean; busy: boolean; discard: () => void }
type ReportEditor = (id: string, state: EditorState | null) => void
const fromSnapshot = (expected: CellStoryboardState): Draft => ({
  expected,
  summary: expected.summary ?? '',
  frame: expected.frame,
  attachments: [],
})

/** Canvas Edit mode is the editor; there is no second per-picture mode switch. */
export function StoryboardCellRows({
  rows,
  canEdit,
  draftCellId,
}: {
  rows: StoryboardCellRow[]
  canEdit: boolean
  /** An explicitly chosen existing cell may receive its first picture. */
  draftCellId?: string
}) {
  const pictures = rows.filter((row) =>
    (row.frame || row.cell.id === draftCellId) && row.cell.content.trim(),
  )
  const editors = useRef(new Map<string, EditorState>())
  const pendingAction = useRef<(() => void) | null>(null)
  const [confirming, setConfirming] = useState(false)
  const reportEditor: ReportEditor = useCallback((id, state) => {
    if (state) editors.current.set(id, state)
    else editors.current.delete(id)
  }, [])
  useEffect(
    () =>
      registerPanelTransitionGuard((action) => {
        if (
          pendingAction.current ||
          [...editors.current.values()].some((state) => state.busy)
        )
          return false
        if ([...editors.current.values()].some((state) => state.dirty)) {
          pendingAction.current = action
          setConfirming(true)
          return false
        }
        action()
        return true
      }),
    [],
  )
  const keepEditing = () => {
    pendingAction.current = null
    setConfirming(false)
  }
  return (
    <div className="flex flex-col gap-5">
      {pictures.map((row) => (
        <section
          key={row.cell.id}
          aria-label={row.label}
          className="flex flex-col gap-2"
        >
          {canEdit ? (
            <StoryboardCellEditor row={row} reportEditor={reportEditor} showLabel={!draftCellId} />
          ) : (
            <StoryboardStepDetailStack
              entries={[{ ...row, summary: row.cell.summary?.trim() || '' }]}
              galleryEntries={pictures}
            />
          )}
        </section>
      ))}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) keepEditing()
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          data-panel-dialog=""
          className="flex w-[min(28rem,calc(100%-2rem))] flex-col gap-4 p-6"
        >
          <DialogTitle className="text-lg font-semibold">
            Discard unsaved changes?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your changes have not been saved.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={keepEditing}>
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = pendingAction.current
                for (const state of editors.current.values()) {
                  state.dirty = false
                  state.discard()
                }
                keepEditing()
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

/** Each pictured cell keeps its own Save and draft; the parent guards leaving any of them. */
function StoryboardCellEditor({
  row,
  reportEditor,
  showLabel,
}: {
  row: StoryboardCellRow
  reportEditor: ReportEditor
  showLabel: boolean
}) {
  const { client, canWrite } = useSupabase()
  const cellId = row.cell.id
  const [draft, setDraft] = useState<Draft>(() => ({
    expected: null,
    summary: row.cell.summary ?? '',
    frame: row.cell.frame ?? null,
    attachments: [],
  }))
  const [busy, setBusy] = useState(Boolean(client))
  const [needsReload, setNeedsReload] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const alive = useRef(false)
  const readVersion = useRef(0)
  const live = useRef({ dirty: false, busy: Boolean(client) })
  const dirty = Boolean(
    draft.expected &&
      (draft.summary !== (draft.expected.summary ?? '') ||
        draft.frame !== draft.expected.frame ||
        draft.attachments.length),
  )
  const discard = () => {
    if (draft.expected) setDraft(fromSnapshot(draft.expected))
    setProblem(null)
    setBusy(Boolean(client))
    setAttempt((value) => value + 1)
  }
  useLayoutEffect(() => {
    live.current = { dirty, busy }
  })
  useLayoutEffect(() =>
    reportEditor(cellId, {
      dirty,
      busy: busy && Boolean(draft.expected),
      discard,
    }),
  )
  useLayoutEffect(
    () => () => reportEditor(cellId, null),
    [cellId, reportEditor],
  )
  const reload = useCallback(
    async (failurePrefix = '') => {
      if (!client) return
      const version = ++readVersion.current
      try {
        const expected = await readCellStoryboard(client, cellId)
        if (alive.current && version === readVersion.current) {
          setDraft(fromSnapshot(expected))
          setNeedsReload(false)
        }
      } catch (error) {
        if (alive.current && version === readVersion.current) {
          setNeedsReload(true)
          setProblem(`${failurePrefix}${errorMessage(error)}`)
        }
      } finally {
        if (alive.current && version === readVersion.current) setBusy(false)
      }
    },
    [client, cellId],
  )
  useEffect(() => {
    alive.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload writes state only after the awaited canonical server read settles.
    void reload()
    return () => {
      alive.current = false
      readVersion.current += 1
    }
  }, [reload, attempt])
  const change = (update: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...update }))
  const announceSaved = (entry: SessionEntry, message = 'Saved the cell') => {
    if (!client) return
    reportWriteSuccess(message, entry.id, async () => {
      await executeRevert(client, entry)
      forgetChange(entry.id)
      if (!alive.current) return
      if (live.current.dirty) {
        setNeedsReload(true)
        setProblem(
          'The cell was undone. Cancel your draft to reload the restored cell before saving.',
        )
        return
      }
      setBusy(true)
      await reload('The cell was undone, but could not be reloaded. ')
    })
  }
  const save = async () => {
    if (
      !client ||
      !canWrite ||
      !draft.expected ||
      needsReload ||
      !dirty ||
      busy
    )
      return
    setBusy(true)
    setProblem(null)
    let entry: SessionEntry
    let message = 'Saved the cell'
    try {
      entry = await updateCellStoryboard(client, {
        cellId,
        content: draft.expected.content,
        summary: draft.summary,
        frame: draft.frame,
        expected: draft.expected,
        attachments: draft.attachments,
      })
    } catch (error) {
      if (error instanceof PartialAuthoringWriteError) {
        entry = error.entry
        message =
          'The cell saved, but its durable change record failed. Undo is available for this edit.'
        if (alive.current) setProblem(message)
      } else {
        if (alive.current) {
          setProblem(errorMessage(error))
          setBusy(false)
        }
        return
      }
    }
    // Keep the form open after Save, with a fresh canonical baseline for the next edit.
    announceSaved(entry, message)
    if (!alive.current) return
    setDraft((current) => ({ ...current, expected: null, attachments: [] }))
    await reload('The cell saved, but could not be reloaded. ')
  }
  return (
    <form
      aria-label={`Edit ${row.label}`}
      data-panel-editor=""
      data-busy={busy ? '' : undefined}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {showLabel ? <p className="mb-2 text-xs font-medium text-foreground">{row.label}</p> : null}
      <fieldset
        disabled={
          busy || needsReload || !draft.expected || !canWrite || !client
        }
        className="flex flex-col gap-3"
      >
        <FeaturedImageField
          cellId={cellId}
          variant="figure"
          frame={draft.frame}
          savedFrame={draft.expected?.frame ?? row.cell.frame ?? null}
          resources={row.cell.resources ?? []}
          stagedAttachments={draft.attachments}
          touchpoints={row.cell.touchpoints}
          onChange={(frame) => change({ frame })}
          onUploaded={(attachment) =>
            setDraft((current) => ({
              ...current,
              attachments: [...current.attachments, attachment],
            }))
          }
          onUploadingChange={setBusy}
        />
        <label className="flex flex-col gap-1 text-sm">
          Caption
          <Textarea
            value={draft.summary}
            onChange={(event) => change({ summary: event.target.value })}
          />
        </label>
      </fieldset>
      {problem ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {problem}
        </p>
      ) : null}
      {!busy && !dirty && (needsReload || !draft.expected) ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setBusy(true)
            setProblem(null)
            setAttempt((value) => value + 1)
          }}
        >
          Reload cell
        </Button>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !dirty}
          onClick={discard}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            busy || needsReload || !canWrite || !dirty || !draft.expected
          }
        >
          {!draft.expected && busy ? 'Loading…' : busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
