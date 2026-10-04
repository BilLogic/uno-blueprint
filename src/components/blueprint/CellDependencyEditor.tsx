import { useState } from 'react'
import { Loader2, Pencil, X } from 'lucide-react'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/editor/SegmentedControl'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { OptionSelect } from '@/components/blueprint/OptionSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSupabase } from '@/contexts/SupabaseProvider'
import {
  clearCellDependency,
  setCellDependency,
  updateCellDependency,
} from '@/lib/authoringRpc'
import {
  DEPENDENCY_EDIT_TEXT,
  DEPENDENCY_KINDS,
  DEPENDENCY_KIND_HINTS,
  DEPENDENCY_KIND_LABELS,
  validateDraftDependency,
  type DependencyEndpoint,
  type DraftDependency,
} from '@/lib/dependencyValidation'
import type { DependencyKind } from '@/lib/authoringRpc'
import { cn, errorMessage } from '@/lib/utils'

export type ExistingDependency = {
  id: string
  targetCellId: string
  targetLabel: string
  kind: string
  note: string | null
}

/**
 * What a connection row needs in order to be edited where it sits.
 *
 * OWNERSHIP. A cell edits only the connections it is the SOURCE of. An
 * arriving connection belongs to the cell at the other end and is edited from
 * there, which is what `InboundRowPencil` is: not a statement that the row is
 * uneditable, but the way to go and edit it.
 *
 * Candidates come from the caller rather than a query here: the panel already
 * holds the version's cells, and re-reading them would be a second round trip
 * for data on screen.
 */
export type DependencyEditing = {
  source: DependencyEndpoint
  candidates: DependencyEndpoint[]
  /** Every edge this cell is the source of — the duplicate check reads it. */
  existing: ExistingDependency[]
  /** Which row has its note field open; one at a time, or null. */
  activeDependencyId: string | null
  onActivate: (dependencyId: string | null) => void
  /** Select the cell an arriving connection belongs to. */
  onEditFromOwner: (cellId: string) => void
}

const KIND_OPTIONS = DEPENDENCY_KINDS.map((kind) => ({
  value: kind,
  label: DEPENDENCY_KIND_LABELS[kind],
}))

/*
  Two selects on one line, in a panel a few hundred pixels wide. Not the
  segmented control the add form wears: both kind words plus a target select
  do not fit on one line, and the row has to stay one line or it is not the
  row the reader was already looking at.
*/
const KIND_SELECT_CLASS = 'h-7 w-[5.75rem] shrink-0 gap-1 px-2 text-xs'
const TARGET_SELECT_CLASS = 'h-7 min-w-0 flex-1 gap-1 px-2 text-xs'

/** Indents the note field and the kind hint under the row they belong to. */
const ROW_DETAIL_INDENT = 'pl-1'

/**
 * The trailing control on an editable row: remove, or — while its write is in
 * flight — the row's own spinner.
 *
 * Per row, deliberately. A tab-wide busy state would freeze seven rows because
 * the eighth is saving, and a tab-wide error would put the message as far from
 * the row that failed as the panel allows.
 */
function RowAction({
  busy,
  label,
  onClick,
}: {
  busy: boolean
  label: string
  onClick: () => void
}) {
  if (busy) {
    return (
      <span
        className="flex size-7 shrink-0 items-center justify-center"
        role="status"
        aria-label="Saving"
      >
        <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden />
      </span>
    )
  }
  return (
    <IconTooltip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={label}
        onClick={onClick}
      >
        <X className="size-3" />
      </Button>
    </IconTooltip>
  )
}

/** The kind hint, attached to the control it describes and nothing else. */
function KindHint({ kind }: { kind: DependencyKind }) {
  return (
    <p className={cn('text-xs text-muted-foreground', ROW_DETAIL_INDENT)}>
      {DEPENDENCY_KIND_HINTS[kind]}
    </p>
  )
}

/**
 * The one prose field a dependency has, labelled — the same words the add form
 * uses, because it is the same field.
 */
function NoteField({
  value,
  disabled,
  onChange,
  onCommit,
}: {
  value: string
  disabled: boolean
  onChange: (next: string) => void
  onCommit: () => void
}) {
  return (
    <label className={cn('flex flex-col gap-1', ROW_DETAIL_INDENT)}>
      <span className="text-xs font-medium text-muted-foreground">
        {DEPENDENCY_EDIT_TEXT.noteLabel}
        <span className="font-normal text-muted-foreground">
          {' '}
          {DEPENDENCY_EDIT_TEXT.noteOptional}
        </span>
      </span>
      <Input
        value={value}
        disabled={disabled}
        placeholder={DEPENDENCY_EDIT_TEXT.notePlaceholder}
        className="h-7 text-xs"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
      />
    </label>
  )
}

/** The message goes under the row that produced it, never at the top of a tab. */
function RowError({ message }: { message: string }) {
  return (
    <p
      className={cn('text-xs text-destructive', ROW_DETAIL_INDENT)}
      data-dependency-row-error=""
    >
      {message}
    </p>
  )
}

/**
 * One connection this cell owns, as fields, where the row already sits.
 *
 * Kind and target save the moment they change; the note saves on blur, because
 * a round trip per keystroke is a write per letter of a sentence.
 *
 * Every one of those goes through `updateCellDependency`, and it has to.
 * `setCellDependency` upserts on (source, target, kind): a new kind or a new
 * target is a new conflict key, so editing either through it INSERTS a second
 * row and orphans the first, which the board keeps drawing.
 *
 * The note travels on EVERY write, including the two that are not about it.
 * The function takes all three or none — an update told nothing about the note
 * would clear it — so changing a kind carries the sentence along unchanged.
 */
export function DependencyEditRow({
  dependencyId,
  kind,
  targetCellId,
  note,
  editing,
}: {
  dependencyId: string
  kind: DependencyKind
  targetCellId: string
  note: string | null
  editing: DependencyEditing
}) {
  const { client } = useSupabase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState(note ?? '')
  const [seed, setSeed] = useState(note ?? '')

  // The stored note changed under us — a save landed, or another session wrote
  // it. Re-seed rather than keep showing a draft of a value that is gone.
  if (seed !== (note ?? '')) {
    setSeed(note ?? '')
    setDraftNote(note ?? '')
  }

  const active = editing.activeDependencyId === dependencyId

  const write = async (next: {
    kind: DependencyKind
    targetCellId: string
    note: string
  }) => {
    if (!client || busy) return
    setBusy(true)
    setError(null)
    try {
      await updateCellDependency(client, {
        dependencyId,
        kind: next.kind,
        targetCellId: next.targetCellId,
        note: next.note.trim() || null,
      })
    } catch (writeError) {
      setError(errorMessage(writeError))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!client || busy) return
    setBusy(true)
    setError(null)
    try {
      await clearCellDependency(client, dependencyId)
    } catch (removeError) {
      setError(errorMessage(removeError))
    } finally {
      setBusy(false)
    }
  }

  const targetLabel =
    editing.candidates.find((entry) => entry.cellId === targetCellId)?.label ??
    targetCellId
  const targetOptions = editing.candidates
    .filter((entry) => entry.cellId !== editing.source.cellId)
    .map((entry) => ({ value: entry.cellId, label: entry.label }))

  return (
    <li
      className="border-b border-muted px-2 py-2 last:border-0"
      data-dependency-row={dependencyId}
      onFocusCapture={() => editing.onActivate(dependencyId)}
      onPointerDownCapture={() => editing.onActivate(dependencyId)}
    >
      {/* Dimmed while its own write is in flight. The rest of the list stays
          live — nothing about this row's save makes the next one untrue. */}
      <div
        className={cn(
          'flex flex-col gap-2 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
          busy ? 'opacity-60' : undefined,
        )}
      >
        <div className="flex items-center gap-2">
          <OptionSelect
            value={kind}
            options={KIND_OPTIONS}
            disabled={busy}
            className={KIND_SELECT_CLASS}
            aria-label={`Connection kind for ${targetLabel}`}
            onChange={(next) => {
              editing.onActivate(dependencyId)
              void write({ kind: next, targetCellId, note: draftNote })
            }}
          />
          <OptionSelect
            value={targetCellId}
            options={targetOptions}
            disabled={busy}
            className={TARGET_SELECT_CLASS}
            aria-label={`Connects to ${targetLabel}`}
            onChange={(next) => {
              editing.onActivate(dependencyId)
              void write({ kind, targetCellId: next, note: draftNote })
            }}
          />
          <RowAction
            busy={busy}
            label={`Remove the connection to ${targetLabel}`}
            onClick={() => void remove()}
          />
        </div>
        {active ? <KindHint kind={kind} /> : null}
        {active ? (
          <NoteField
            value={draftNote}
            disabled={busy}
            onChange={setDraftNote}
            onCommit={() => {
              if (draftNote.trim() === (note ?? '')) return
              void write({ kind, targetCellId, note: draftNote })
            }}
          />
        ) : null}
        {error ? <RowError message={error} /> : null}
      </div>
    </li>
  )
}

/**
 * A connection this cell does not own, and the way to go and edit it.
 *
 * A control, not a sentence. "Edited from the other cell" would state a fact
 * that only ever interests someone who wants to change the row, and the pencil
 * is what that person needs.
 */
export function InboundRowPencil({
  ownerCellId,
  ownerLabel,
  onEditFromOwner,
}: {
  ownerCellId: string
  ownerLabel: string
  onEditFromOwner: (cellId: string) => void
}) {
  const label = `Edit in “${ownerLabel}”`
  return (
    <span className="absolute top-1 right-1">
      <IconTooltip label={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={() => onEditFromOwner(ownerCellId)}
        >
          <Pencil className="size-3" />
        </Button>
      </IconTooltip>
    </span>
  )
}

/**
 * Connect this cell to another one in the same version.
 *
 * `leads_to` draws an arrow; `enables` does not, and that asymmetry is the whole
 * point of having two kinds. A blueprint where every relationship is drawn is
 * unreadable, and most "this depends on that" facts are constraints rather
 * than handoffs — worth recording, not worth drawing.
 *
 * The form adds, and only adds. It used to list the cell's outgoing
 * connections above itself, each with a remove button, which put every edge on
 * the tab twice once the rows became editable where they sit. Removing and
 * changing a connection are the row's own controls now; `existing` is still
 * read, by the duplicate check.
 */
export function CellDependencyEditor({
  source,
  candidates,
  existing,
  onDone,
}: {
  source: DependencyEndpoint
  candidates: DependencyEndpoint[]
  existing: ExistingDependency[]
  onDone: () => void
}) {
  const { client } = useSupabase()
  const [draft, setDraft] = useState<DraftDependency>({
    sourceCellId: source.cellId,
    targetCellId: null,
    kind: 'leads_to',
    note: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target =
    candidates.find((entry) => entry.cellId === draft.targetCellId) ?? null
  const problems = validateDraftDependency(draft, source, target, existing)

  const handleAdd = async () => {
    if (!client || busy || problems.length > 0 || !draft.targetCellId) return
    setBusy(true)
    setError(null)
    try {
      await setCellDependency(client, {
        sourceCellId: draft.sourceCellId,
        targetCellId: draft.targetCellId,
        kind: draft.kind,
        note: draft.note,
      })
      setDraft((current) => ({ ...current, targetCellId: null, note: '' }))
    } catch (addError) {
      setError(errorMessage(addError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-cell-dependency-editor="">
      {/* One control, two positions — the same track-and-raised-square
          vocabulary as the View/Edit switch, because that is what this is:
          a mode for the connection, not two competing buttons. */}
      <SegmentedControl
        aria-label="Connection kind"
        value={draft.kind}
        onValueChange={(kind) => setDraft((current) => ({ ...current, kind }))}
      >
        {DEPENDENCY_KINDS.map((kind) => (
          <SegmentedControlItem key={kind} value={kind}>
            {DEPENDENCY_KIND_LABELS[kind]}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <p className="text-xs text-muted-foreground">
        {DEPENDENCY_KIND_HINTS[draft.kind]}
      </p>

      <select
        value={draft.targetCellId ?? ''}
        onChange={(event) =>
          setDraft((current) => ({
            ...current,
            targetCellId: event.target.value || null,
          }))
        }
        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        aria-label={DEPENDENCY_EDIT_TEXT.connectTo}
      >
        <option value="">Pick a cell…</option>
        {candidates
          .filter((entry) => entry.cellId !== source.cellId)
          .map((entry) => (
            <option key={entry.cellId} value={entry.cellId}>
              {entry.label}
            </option>
          ))}
      </select>

      {/* The one prose field, and it writes the column the row reads back.
          It used to write `name` — specified as a badge, the word on the
          arrow — while the row drew `note`, so a sentence typed here landed
          somewhere nothing renders. */}
      <Input
        value={draft.note}
        aria-label={`${DEPENDENCY_EDIT_TEXT.noteLabel} ${DEPENDENCY_EDIT_TEXT.noteOptional}`}
        placeholder={DEPENDENCY_EDIT_TEXT.notePlaceholder}
        className="h-7 text-xs"
        onChange={(event) =>
          setDraft((current) => ({ ...current, note: event.target.value }))
        }
      />

      {problems.length > 0 && draft.targetCellId ? (
        <ul
          className="flex flex-col gap-1 text-xs text-muted-foreground"
          data-dependency-problems=""
        >
          {problems.map((problem) => (
            <li key={problem}>· {problem}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || problems.length > 0}
          onClick={handleAdd}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
