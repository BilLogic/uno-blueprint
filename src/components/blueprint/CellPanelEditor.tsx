import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { OwnerTagSelect } from '@/components/blueprint/OwnerTagSelect'
import { StatusSelect } from '@/components/blueprint/StatusSelect'
import {
  CELL_PANEL_FOOTER_ID,
  Field,
  PANEL_TEXTAREA_CLASS,
} from '@/components/blueprint/panelShell'
import { usePanelFooterHost } from '@/hooks/usePanelFooterHost'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { useResourceDraftsOptional } from '@/contexts/ResourceDraftsContext'
import { useBlueprintCell } from '@/hooks/useBlueprintCell'
import { useValueAudiences } from '@/hooks/useValueAudiences'
import { useNameOnlyPlacements } from '@/hooks/useRegistryTouchpoints'
import {
  cellBudgetKindForLane,
  getCellContentLengthGuidance,
  type CellBudgetKind,
} from '@/lib/cellContentLimits'
import {
  cellEditsFromCell,
  changedCellFields,
  EDITABLE_CELL_FIELDS,
  type CellEditKey,
  type CellEdits,
  type CellEditValue,
  type EditableCellField,
} from '@/lib/cellFields'
import { saveCell } from '@/lib/cellSave'
import type { EntityStatus } from '@/lib/entityStatus'
import { RegistryLink } from '@/components/blueprint/RegistryLink'
import { TouchpointField } from '@/components/blueprint/TouchpointField'
import { TouchpointEditDialog } from '@/components/blueprint/TouchpointEditDialog'
import { RoleSelect } from '@/components/blueprint/RoleSelect'
import {
  changedPlacementFields,
  placementSurvivesContent,
  updateTouchpointPlacement,
  type PlacementDetailColumns,
  type PlacementDetailDraft,
  type TouchpointUpdate,
} from '@/lib/touchpointMutations'
import { renameContentItem } from '@/lib/renameContentItem'
import { cellTouchpoints } from '@/lib/cellTouchpoints'
import {
  assertPlanWritable,
  planResourceSave,
  resourceChangeCount,
} from '@/lib/resourceDrafts'
import { errorMessage } from '@/lib/utils'
import type { BlueprintData, CellTouchpoint } from '@/types/blueprint'
import { parseCellContentItems } from '@/lib/parseCellContent'
import type { ValueProp } from '@/lib/valueProps'

/** Where a not-yet-created cell would go — the draft the editor writes on Save. */
export type DraftCellTarget = {
  pathId: string
  laneId: string
  stepId: string
  laneName: string
  /**
   * The lane's role, as the board read it. Which budget a new cell is measured
   * against is the role's question, the same one an existing cell asks; the
   * name alone answers it only for the legacy lane names, and `lanes.name` is
   * free-form.
   */
  laneRole: string | null
  stepName: string
  stepIndex: number
  scenarioName?: string
  phaseName?: string
}

/**
 * The form: the cell's editable fields, keyed by column and shaped by the
 * cell field list, plus one thing that is not a cell field.
 */
type FormState = CellEdits & {
  /**
   * The selected touchpoint's own detail, when a touchpoint was clicked to
   * open this panel. Part of the SAME form state as the cell's fields, and
   * deliberately so: the panel is showing one cell and one of its
   * placements, and two Save buttons for what a reader experiences as one
   * screen is the arrangement this editor was built to end.
   */
  placement: PlacementDetailDraft
}

/** An unmarked, unwritten placement — the state a cell with none selected sits in. */
const EMPTY_PLACEMENT: PlacementDetailDraft = {
  summary: '',
  role: null,
}

/**
 * Which per-kind budget a panel field is measured against.
 *
 * A draft carries its lane's name and role; an existing cell looks the lane
 * up on the board the panel was opened from. Either missing falls through to
 * prose, matching the agent tool's fallback when it cannot see a role.
 */
function budgetKindForEditor(
  cellId: string | null,
  draft: DraftCellTarget | undefined,
  blueprints: BlueprintData[] | undefined,
): CellBudgetKind {
  if (draft) {
    return cellBudgetKindForLane({ name: draft.laneName, role: draft.laneRole })
  }
  if (!cellId || !blueprints) return cellBudgetKindForLane(null)
  for (const blueprint of blueprints) {
    const cell = blueprint.cells.find((entry) => entry.id === cellId)
    if (!cell) continue
    const lane = blueprint.lanes?.find((entry) => entry.id === cell.lane_id)
    if (lane) return cellBudgetKindForLane(lane)
  }
  return cellBudgetKindForLane(null)
}

/**
 * The fields as rows of the form: one per row, except fields whose editor
 * names the same `row`, which share one. The descriptor says it; the form
 * only groups what it is told to.
 */
function fieldRows(fields: readonly EditableCellField[]): EditableCellField[][] {
  const rows: EditableCellField[][] = []
  const byName = new Map<string, EditableCellField[]>()
  for (const field of fields) {
    const name = 'row' in field.editor ? field.editor.row : null
    const shared = name ? byName.get(name) : undefined
    if (shared) {
      shared.push(field)
      continue
    }
    const row = [field]
    if (name) byName.set(name, row)
    rows.push(row)
  }
  return rows
}

/**
 * The columns to restore, read back out of the FROZEN baseline draft.
 *
 * Not off the `placement` prop, which keeps tracking the live query: a revert
 * of this same cell refetches it and changes the prop mid-edit, and an
 * inverse captured from it would then promise to restore values that were
 * already gone when editing began. Same reason the baseline is frozen at all.
 *
 * The round trip through the draft normalises an empty string to null, which
 * is the shape the column holds anyway — the read path checks for null, and
 * restoring `''` where the row had NULL would be restoring a second spelling
 * of empty that nothing else in the app writes.
 */
function placementColumns(draft: PlacementDetailDraft): PlacementDetailColumns {
  return {
    summary: draft.summary || null,
    role: draft.role,
  }
}

/**
 * What the touchpoint editor says when a rename would leave this form behind.
 *
 * The rename rewrites this cell's text in the database. Untouched, the form's
 * copy follows it; edited, there is no honest way to merge the two, and the
 * form's next Save would write the old name back — which the content sync
 * reads as removing the placement, Summary, Role and resources with it.
 */
const RENAME_WAITS_FOR_CONTENT =
  'Save or cancel your edits to this cell’s Content before renaming the touchpoint. Its other fields can be saved now.'

/**
 * The form's fields for a placement, seeded from its OWN values.
 *
 * Never from `resolveTouchpointDetail`'s resolved text, which falls back to
 * the cell's summary when the placement has none: seeding with that would
 * copy the cell's sentence onto the placement the first time anybody pressed
 * Save, and the two would then say the same thing forever without anyone
 * having decided that they should.
 */
function placementDraft(placement: CellTouchpoint): PlacementDetailDraft {
  return {
    summary: placement.summary ?? '',
    role: placement.role,
  }
}


/**
 * The whole cell in one form, one Save.
 *
 * This replaced two stacked editors (content/owners and function/form/
 * value proposition) that each carried their own Save and Cancel — four buttons for one cell,
 * and a Save that only saved half of what was on screen. Here Save writes
 * everything that changed and Cancel discards everything, at page level.
 *
 * Two modes share the form: editing an existing cell, and a **draft** — a
 * cell that does not exist yet. The draft writes *nothing* until Save; a
 * cancelled draft never touches the database. That is the fix for creation
 * feeling broken: the row used to be written first and filled in later.
 */
export function CellPanelEditor({
  cellId,
  draft,
  placement = null,
  fallbackSummary = '',
  onDone,
}: {
  /** Existing cell to edit; null when creating from a draft target. */
  cellId: string | null
  draft?: DraftCellTarget
  /**
   * The touchpoint placement the panel was opened on, when a touchpoint was
   * clicked. Its detail fields join this form.
   *
   * A placement with no `id` is not editable and is passed through as absent:
   * that is a board with no database behind it, where the placements come out
   * of the bundled sample content and there is no row to write into.
   */
  placement?: CellTouchpoint | null
  /**
   * What the panel displays as this cell's summary when the column is
   * empty (tech cells keep prose in `links`). Seeded into the field so the
   * editor shows the same text the reader saw — saving moves it into the
   * column, which takes precedence from then on.
   */
  fallbackSummary?: string
  onDone: () => void
}) {
  const { configured } = useSupabase()
  // The whole cell, off the board the panel was opened from. Two per-cell
  // queries used to fetch nine columns here — content, summary, the owner
  // pair, the spec block — and the board query now selects every one of them,
  // so the values are in memory before the panel opens. There is no loading
  // state left to render around and no request left to fail.
  const cell = useBlueprintCell(configured && cellId ? cellId : null)
  // A placement is editable only when it has a row behind it.
  const editable = placement?.id ? placement : null

  if (cellId) {
    // Null means the board does not hold this cell, and there is nothing to
    // edit — the same case the fetch answered with no row.
    if (!cell) return null

    // The DB truth, in the form's shape. The summary *field* may be seeded
    // with the links-derived fallback below, but diffs and reverts compare
    // against this — an owner-only edit must not smuggle the fallback prose
    // into the summary column, and undo must restore what the DB held.
    const baseline: FormState = {
      ...cellEditsFromCell(cell),
      placement: editable ? placementDraft(editable) : EMPTY_PLACEMENT,
    }

    return (
      <CellPanelEditorForm
        // Keyed on the placement as well as the cell: clicking a second
        // touchpoint on the same cell keeps the same cell id, and without the
        // placement in the key the frozen baseline below would still describe
        // the touchpoint the author had finished with.
        key={editable ? `${cellId}:${editable.id}` : cellId}
        cellId={cellId}
        draft={undefined}
        placement={editable}
        holdsTouchpoint={cellTouchpoints(cell).length > 0}
        liveContent={cell.content}
        baseline={baseline}
        seededSummary={cell.summary ?? fallbackSummary}
        onDone={onDone}
      />
    )
  }

  if (!draft) return null
  return (
    <CellPanelEditorForm
      key={`${draft.laneId}:${draft.stepId}`}
      cellId={null}
      draft={draft}
      baseline={{
        // The empty form, with the status column's own default.
        ...cellEditsFromCell(null),
        // A cell that does not exist yet holds no placements: its touchpoints
        // come into being when its text is first saved and synced.
        placement: EMPTY_PLACEMENT,
      }}
      seededSummary=""
      placement={null}
      holdsTouchpoint={false}
      liveContent={null}
      onDone={onDone}
    />
  )
}

function CellPanelEditorForm({
  cellId,
  draft,
  placement,
  holdsTouchpoint,
  liveContent,
  baseline: baselineProp,
  seededSummary,
  onDone,
}: {
  cellId: string | null
  draft: DraftCellTarget | undefined
  /** Non-null only when it carries a row id — see CellPanelEditor. */
  placement: CellTouchpoint | null
  /**
   * Whether the saved cell holds any placement, the opened one or another.
   * A rename in Content is what removes one, so that is where the hint goes.
   */
  holdsTouchpoint: boolean
  /**
   * The cell's text as the board holds it now — unlike `baseline`, it tracks
   * the live query. Read only to follow an undo of a rename this panel saved;
   * null for a draft, which has no row to follow.
   */
  liveContent: string | null
  baseline: FormState
  seededSummary: string
  onDone: () => void
}) {
  const { client } = useSupabase()
  const detail = useBlueprintCellDetailOptional()
  const audiencesResult = useValueAudiences()
  const nameOnlyResult = useNameOnlyPlacements(cellId)
  const nameOnly = nameOnlyResult.status === 'ready' ? nameOnlyResult.data : []
  const renameHintId = useId()
  // The opened placement's own registry card goes in its block, where the
  // touchpoint is named; any other name-only placement keeps its card above.
  const openedNameOnly = nameOnly.find((one) => one.id === placement?.id) ?? null
  const otherNameOnly = nameOnly.filter((one) => one !== openedNameOnly)
  const audiences =
    audiencesResult.status === 'ready' ? audiencesResult.data : []
  // The footer host mounts in the same commit as this form; looked up once
  // after mount so the portal lands below the scroll region.
  const footerHost = usePanelFooterHost(CELL_PANEL_FOOTER_ID)
  /*
    Frozen at mount (state initializer, never re-set from the props). The
    props keep tracking the live query — a ⌘Z revert of this same cell
    refetches it and changes them mid-edit — but the form's diff and its
    captured `previous` must speak about the world as it was when editing
    began, or Save quietly writes reverted values back.

    One write moves it, and its undo moves it back: a touchpoint rename saved
    from this panel's own touchpoint editor, which rewrote this cell's
    Content in the database. The baseline then has to say what the database
    now holds, or the diff would find a content edit nobody made — see
    `handleTouchpointSaved`, and the undo check after the `rename` state.

    A save moves it too: one that wrote the cell and then failed on a later
    write takes what it wrote as the new starting point, so the retry sends
    only what is left.
  */
  const [baseline, setBaseline] = useState(baselineProp)
  const [form, setForm] = useState<FormState>({
    ...baseline,
    summary: seededSummary,
  })
  // Only a deliberate edit persists the seeded fallback prose into the
  // summary column; an untouched field keeps whatever the DB held.
  const [summaryTouched, setSummaryTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A save that resolves after this form unmounted (the user switched
  // cells) must not call onDone — that would slam shut whatever panel they
  // are reading now.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])
  // A draft that created its row but failed a later write resumes on retry
  // instead of upserting a second time (which would log a second "Added a
  // cell" whose revert deletes the same row).
  const [createdId, setCreatedId] = useState<string | null>(null)
  // The registry entry's own editor, over the panel.
  const [editingTouchpoint, setEditingTouchpoint] = useState(false)
  /*
    A rename this panel saved, followed until it settles one way or the other.

    `content` is the text this form moved its Content to, or null when the
    rename did not rewrite this cell. `seen` turns true once the board shows
    the new name: before that the placement prop is the board's pre-rename
    copy, and the block and the content check below would still be asking
    about the old name, which the text no longer lists.
  */
  const [rename, setRename] = useState<{
    from: string
    to: string
    content: string | null
    seen: boolean
  } | null>(null)
  /*
    A rename undone under an edited Content — see `renameUndoneBlocks` below.
    Kept until the panel closes; it only blocks while it is still true.
  */
  const [undoneRename, setUndoneRename] = useState<{ from: string; to: string } | null>(null)
  if (rename && !rename.seen && placement?.name === rename.to) {
    setRename({ ...rename, seen: true })
  }
  /*
    The rename taken back while the panel is open — a ⌘Z revert, which puts
    the old name back in the registry and in every cell's text. The board
    says the old name again, and this form, which followed the rename, would
    hold a baseline the database no longer has: Save would see the old name
    missing from Content and skip the placement's edits without a word, or
    write the new name back over the reverted text.

    So the form follows the undo the way it followed the rename. When this
    cell's text on the board is exactly the reverse item-rewrite of the text
    the form moved to, the baseline moves back to it; an untouched Content
    moves with it, and the form again holds no edit of its own. An edited
    Content cannot be moved without guessing at the author's intent, so it
    stays as typed and Save waits until it names the placement again.
  */
  if (rename?.seen && placement?.name === rename.from) {
    setRename(null)
    if (
      rename.content !== null &&
      liveContent !== null &&
      baseline.content === rename.content &&
      liveContent === renameContentItem(rename.content, rename.to, rename.from)
    ) {
      const back = liveContent
      if (form.content === baseline.content) {
        setForm((current) => ({ ...current, content: back }))
      } else {
        setUndoneRename({ from: rename.from, to: rename.to })
      }
      setBaseline((current) => ({ ...current, content: back }))
    }
  }
  const placementName =
    placement && rename && !rename.seen && placement.name === rename.from
      ? rename.to
      : placement?.name

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const setPlacement = <K extends keyof PlacementDetailDraft>(
    key: K,
    value: PlacementDetailDraft[K],
  ) =>
    setForm((current) => ({
      ...current,
      placement: { ...current.placement, [key]: value },
    }))

  const blocked = !form.content.trim()
  const budgetKind = budgetKindForEditor(cellId, draft, detail?.blueprints)
  const lengthGuidance = getCellContentLengthGuidance(form.content, budgetKind)

  // The text as the form holds it against the text it opened with — the
  // question a rename asks before it is allowed to rewrite this cell.
  const contentEdited = form.content !== baseline.content

  /*
    A registry save landed. Only a rename reaches this form: the other four
    fields are the registry's alone and appear nowhere in it.

    The database has rewritten every cell that listed the old name, by whole
    item, and `cell_ids` says which. When this cell is one of them the form's
    copy of Content moves the same way — baseline and field together, so the
    form still holds no edit of its own and its next Save leaves the text,
    and the placement it keeps, alone. A rename is only sent while Content is
    untouched (`RENAME_WAITS_FOR_CONTENT`), which is what makes moving both
    the same edit.
  */
  const handleTouchpointSaved = (result: TouchpointUpdate) => {
    if (result.name === result.previousName) return
    const savedCell = cellId ?? createdId
    const rewritten = Boolean(savedCell && result.cellIds.includes(savedCell))
    const moved = rewritten
      ? renameContentItem(baseline.content, result.previousName, result.name)
      : null
    setRename({ from: result.previousName, to: result.name, content: moved, seen: false })
    if (moved === null) return
    if (form.content === baseline.content) {
      setForm((current) => ({ ...current, content: moved }))
    }
    setBaseline((current) => ({ ...current, content: moved }))
  }

  /*
    The one case the undo above cannot settle: Content was edited after the
    rename and still names the touchpoint by the name the undo took away.
    Saving it would write that name back, and the content sync would read it
    as a new touchpoint — the placement the panel is about would lose its
    registry entry and a second one would be minted. Refused, with the way
    out, rather than written; the placement is otherwise keyed on a name
    check that just went stale, and would be skipped without a word.
  */
  const renameUndoneBlocks =
    undoneRename !== null &&
    placementSurvivesContent(form.content, undoneRename.to) &&
    !placementSurvivesContent(form.content, undoneRename.from)

  // The summary Save would write: only a deliberate edit persists the seeded
  // fallback prose, so an untouched field still says what the DB held.
  const persistedSummary =
    cellId && !summaryTouched ? baseline.summary : form.summary

  // The placement's edits, compared the way its write stores them. The write
  // gate and the count share this one rule, so Save never offers to write a
  // change the write would find identical.
  const changedPlacement = placement
    ? changedPlacementFields(form.placement, baseline.placement)
    : []
  const placementChanged = changedPlacement.length > 0

  /*
    How far the form has moved from the baseline it froze at mount, counted
    per field: the cell's, as Save would write them, and the placement's —
    only while the text still names it, since a save that drops the name
    deletes the placement and writes none of its edits.
    Against the frozen baseline and not the live query, for the same reason
    the baseline is frozen — a refetch mid-edit must not make an edit look
    saved, or a revert look like one.

    An existing cell saves only when this is above zero. Save on an unchanged
    form wrote nothing and closed the editor as if it had saved, which is a
    button promising work it was not going to do. A draft keeps its own rule:
    there is no row yet, so any content at all is a change.
  */
  // Asked of the name the placement has now — a rename this panel saved
  // moves it before the board does — and against the baseline as it stands,
  // which that rename moves too: a followed rename is not an edit.
  const placementWillWrite =
    placement !== null &&
    placementName !== undefined &&
    placementSurvivesContent(form.content, placementName)

  /*
    The Resources tab's draft, which lives beside this form rather than in
    it — the tabs are not inside the form — and joins it here: its changes
    count toward this Save and are written by it. One per write Save would
    send: a changed list, a moved featured flag, a moved featured image.
    A placement whose name the text no longer holds is deleted by the save,
    so its list is neither counted nor written, the same rule as its fields.
  */
  const resourceDrafts = useResourceDraftsOptional()
  const survives = (owner: string) => {
    // The opened placement by the name it has now, which a rename saved
    // from this panel moves before the board does.
    const name =
      owner === placement?.id
        ? placementName
        : resourceDrafts?.owners.find((entry) => entry.id === owner)?.name
    return name !== undefined && placementSurvivesContent(form.content, name)
  }
  const resourceCount =
    cellId && resourceDrafts
      ? resourceChangeCount(
          planResourceSave(resourceDrafts.state.baseline, resourceDrafts.state.drafts, survives),
        )
      : 0

  const unsavedCount = cellId
    ? changedCellFields({ ...form, summary: persistedSummary }, baseline).length +
      (placementWillWrite ? changedPlacement.length : 0) +
      resourceCount
    : 0
  const unchanged = cellId !== null && unsavedCount === 0

  const handleSave = async () => {
    if (!client || busy || blocked || unchanged || renameUndoneBlocks) return
    setBusy(true)
    setError(null)
    try {
      // Every list this Save will write is checked before the first write,
      // so a row the sync would refuse stops the save with nothing written
      // rather than after the cell and the lists before it had landed.
      if (cellId && resourceDrafts) {
        assertPlanWritable(
          planResourceSave(resourceDrafts.state.baseline, resourceDrafts.state.drafts, survives),
        )
      }
      const { placement: placementEdits, ...cellEdits } = form
      const { placement: placementBaseline, ...cellBaseline } = baseline
      // The one save: it creates the cell when there is none — the draft
      // becomes real here and only here, Cancel never writes — and routes
      // each changed field to its own write path. Which field goes where is
      // the cell field list's business, not this form's.
      const existing = cellId ?? createdId
      const saved = await saveCell(client, {
        // An existing cell by id — the one opened, or the one a failed earlier
        // attempt created — else the draft's slot. `draft!` because the form
        // is only ever mounted with a cell id or a draft.
        ...(existing !== null
          ? { cellId: existing }
          : { cellId: null, slot: { pathId: draft!.pathId, laneId: draft!.laneId, stepId: draft!.stepId } }),
        values: {
          ...cellEdits,
          summary: persistedSummary,
        },
        baseline: cellBaseline,
        // The create already logs "Added a cell"; its field fill-in — and a
        // retry after the create landed — is part of the same user action,
        // not a second change.
        record: Boolean(cellId),
        // Remembered as soon as the row exists, not when the save returns: a
        // draft that created its row and then failed a later write resumes
        // on retry instead of upserting a second time.
        onCreated: setCreatedId,
      })
      if (cellId) {
        setBaseline((current) => ({ ...current, ...cellEdits, summary: persistedSummary }))
      }

      /*
        The placement, after the cell — and after the sync the cell's save
        runs, which is what makes the order load-bearing rather than tidy.

        The content write calls `sync_cell_touchpoints`, and a save that
        removed this touchpoint's name from the text deletes its placement
        along with everything written about it. Writing the detail first would
        write words onto a row about to be destroyed; writing it afterwards
        without asking would fail on zero rows, on a save that did exactly
        what the author asked for. So it asks.
      */
      if (
        placement?.id &&
        placementName &&
        placementChanged &&
        placementSurvivesContent(form.content, placementName)
      ) {
        await updateTouchpointPlacement(
          client,
          { id: placement.id, cellId: saved.cellId, name: placementName },
          placementEdits,
          placementColumns(placementBaseline),
        )
        setBaseline((current) => ({ ...current, placement: placementEdits }))
      }

      /*
        The resources last, for the same reason the placement follows the
        cell: the content write may have deleted a placement, and its list
        is not written onto nothing. Inside, the order is the cell's list,
        each placement's, the featured flags, then the featured image — and
        each settles as it lands, so a failure keeps only what is unwritten.
      */
      if (cellId && resourceDrafts) {
        await resourceDrafts.store.save(client, { cellId: saved.cellId, survives })
      }

      // Each write above refetched what it changed — the grid, the board
      // holding the cell, the owner and audience vocabularies.
      if (aliveRef.current) onDone()
    } catch (saveError) {
      if (aliveRef.current) {
        setError(errorMessage(saveError))
      }
    } finally {
      if (aliveRef.current) setBusy(false)
    }
  }

  /*
    The placement, directly under the text that lists it.

    Enclosed rather than mixed into the cell's fields, because these belong
    to a DIFFERENT thing: the cell is the moment, the placement is one
    touchpoint used at it, and the same tool at the next step keeps its own
    words. Two fields called Summary on one screen is why the group draws a
    border, and the Touchpoint field at its head is what says whose they
    are — so the group needs no heading or copy of its own. Its labels are
    not the cell field list's: they name the touchpoint and two columns of
    `cell_touchpoints`, and the interface-schema map binds each one.

    Directly under Content and not at the bottom because the author
    reached this panel by clicking that touchpoint. Making them scroll
    past six of the cell's fields to reach the thing they clicked is how
    an editor teaches people it is not for them.

    A name-only placement's registry card sits in the Touchpoint field,
    under the name it is about, since linking it is the decision that field
    is waiting on. The placement's resources are not here: the Resources tab
    holds them, in a group under the touchpoint's name, saved by this Save.
  */
  const placementGroup = placement ? (
    <div
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3"
      data-touchpoint-block=""
    >
      <TouchpointField
        name={placementName ?? placement.name}
        beside={
          // Only an entry the registry holds has anything to edit. A
          // name-only placement's decision is the Link to registry card below.
          placement.touchpointId ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy}
                onClick={() => setEditingTouchpoint(true)}
              >
                Edit touchpoint
              </Button>
              <TouchpointEditDialog
                touchpointId={placement.touchpointId}
                open={editingTouchpoint}
                onOpenChange={setEditingTouchpoint}
                renameRefusal={contentEdited ? RENAME_WAITS_FOR_CONTENT : null}
                onSaved={handleTouchpointSaved}
              />
            </>
          ) : null
        }
        below={
          openedNameOnly && cellId ? (
            <RegistryLink
              placement={openedNameOnly}
              cellId={cellId}
              shown={parseCellContentItems(form.content)}
            />
          ) : null
        }
      />
      <Field
        label="Summary"
        hint="What this touchpoint does at this moment — the screen, the message, the part of it being used."
      >
        <textarea
          value={form.placement.summary}
          rows={3}
          onChange={(event) => setPlacement('summary', event.target.value)}
          className={PANEL_TEXTAREA_CLASS}
        />
      </Field>
      <Field
        label="Role"
        hint="Whether the moment happens through this touchpoint or merely alongside it. Most placements are never marked, and leaving it unmarked is not the same as calling it peripheral."
      >
        <RoleSelect
          value={form.placement.role}
          aria-label="Role"
          onChange={(next) => setPlacement('role', next)}
        />
      </Field>
    </div>
  ) : null

  return (
    <div
      className="flex flex-col gap-3"
      data-panel-editor=""
      // Read by the panel's dismiss paths: Escape while a save is in flight
      // must not close the drawer — "cancelled" a beat after clicking Create
      // would otherwise materialize the cell into a panel-less silence.
      data-busy={busy || undefined}
    >
      {/*
        One card per placement the registry lacks, above the fields, because
        deciding what a name-only placement IS comes before editing the words
        around it. Unlike everything else on this form these write straight
        through — they are the placement's identity, not one of its fields —
        so they refresh the board themselves. Removing one does not close the
        panel: the panel is the cell's here, and the cell is still there.
        The placement the panel was opened on is the exception: its card
        sits in its own block, under the name.
      */}
      {cellId
        ? otherNameOnly.map((placement) => (
            <RegistryLink
              key={placement.id}
              placement={placement}
              cellId={cellId}
              shown={parseCellContentItems(form.content)}
            />
          ))
        : null}
      {/*
        The cell's fields, from the cell field list: label, hint and control
        are the descriptor's, in the list's order — what the cell says and
        who owns it, then what it is like. Two things sit between them that
        are not cell fields: the length guidance under Content, and the
        placement group directly under the text that lists it.
      */}
      {fieldRows(EDITABLE_CELL_FIELDS).map((row) => {
        const editors = row.map((field) => (
          <CellFieldEditor
            key={field.key}
            field={field}
            value={form[field.key]}
            onChange={(value) => {
              if (field.key === 'summary') setSummaryTouched(true)
              set(field.key, value)
            }}
            autoFocus={field.key === 'content' && cellId === null}
            audiences={audiences}
            after={
              field.key === 'content' ? (
                <>
                  {lengthGuidance.message ? (
                    // Advice, not a gate. The same note the agent receives in its
                    // tool result lands under this field at the same thresholds;
                    // stopping the box used to contradict that (cellContentLimits).
                    <p role="status" className="text-xs font-normal text-muted-foreground">
                      {lengthGuidance.message}
                    </p>
                  ) : null}
                  {holdsTouchpoint ? (
                    // The sync keys a placement on the name the text shows, so
                    // a rename here is a removal and a new name, not an edit.
                    <p id={renameHintId} className="text-xs text-muted-foreground">
                      Changing a touchpoint’s name here removes its Summary,
                      Role and resources at this step.
                    </p>
                  ) : null}
                </>
              ) : null
            }
            below={field.key === 'content' ? placementGroup : null}
            describedBy={
              field.key === 'content' && holdsTouchpoint ? renameHintId : undefined
            }
          />
        ))
        // A shared row sits side by side — the owner pair, whose interesting
        // case is when the two differ and a reader compares them at a glance.
        return row.length > 1 ? (
          <div key={row.map((field) => field.key).join(':')} className="grid grid-cols-2 gap-2">
            {editors}
          </div>
        ) : (
          editors
        )
      })}

      {blocked ? (
        <p className="text-xs text-muted-foreground">
          A cell needs content.
        </p>
      ) : null}
      {renameUndoneBlocks && undoneRename ? (
        <p className="text-xs text-destructive">
          The rename to “{undoneRename.to}” was undone, and Content still says
          “{undoneRename.to}”. Change it back to “{undoneRename.from}”, or cancel,
          before saving.
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {(() => {
        const controls = (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || blocked || unchanged || renameUndoneBlocks}
              onClick={handleSave}
            >
              {busy ? 'Saving…' : cellId ? 'Save' : 'Create cell'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onDone}
            >
              Cancel
            </Button>
            {/*
              Beside Cancel, so the reason Save is off sits next to it. An
              edit only: a draft has no baseline worth counting against.
            */}
            {cellId ? (
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {unsavedCount === 0
                  ? 'No changes'
                  : `${unsavedCount} unsaved ${unsavedCount === 1 ? 'change' : 'changes'}`}
              </span>
            ) : null}
          </div>
        )
        // Pinned to the drawer bottom when the host exists — shared footing
        // for everything on the panel. Inline only as a fallback.
        return footerHost ? createPortal(controls, footerHost) : controls
      })()}
    </div>
  )
}

/**
 * One field of the form, rendered from its descriptor: the label and hint
 * are the descriptor's, the control is the one its `editor` names, and the
 * value is typed by the field. `after` sits inside the field under the
 * control (the length guidance); `below` sits after the field (the
 * placement group).
 */
function CellFieldEditor<K extends CellEditKey>({
  field,
  value,
  onChange,
  autoFocus,
  audiences,
  after,
  below,
  describedBy,
}: {
  field: EditableCellField & { key: K }
  value: CellEditValue<K>
  onChange: (value: CellEditValue<K>) => void
  autoFocus: boolean
  audiences: readonly string[]
  after: ReactNode
  below: ReactNode
  /** The id of a note under the control that says more about it. */
  describedBy?: string
}) {
  // Each branch narrows the value by the control rather than by the key,
  // so a second field with the same control needs no branch of its own;
  // the casts are the price of a union the descriptor list correlates and
  // the checker cannot.
  const change = onChange as (value: unknown) => void
  const control = (() => {
    switch (field.editor.control) {
      case 'input':
        return (
          <Input
            value={value as string}
            autoFocus={autoFocus}
            aria-describedby={describedBy}
            onChange={(event) => change(event.target.value)}
          />
        )
      case 'textarea':
        return (
          <textarea
            value={value as string}
            rows={field.editor.rows}
            aria-describedby={describedBy}
            onChange={(event) => change(event.target.value)}
            className={PANEL_TEXTAREA_CLASS}
          />
        )
      case 'status':
        return <StatusSelect value={value as EntityStatus} onChange={change} />
      case 'ownerTag':
        return (
          <OwnerTagSelect value={value as string} ariaLabel={field.label} onChange={change} />
        )
      case 'valueProps':
        return (
          <ValuePropsEditor value={value as ValueProp[]} onChange={change} audiences={audiences} />
        )
    }
  })()

  const rendered = (
    <Field label={field.label} hint={field.hint} required={field.required}>
      {control}
      {after}
    </Field>
  )
  if (!below) return rendered
  return (
    <>
      {rendered}
      {below}
    </>
  )
}

/** The value propositions: a list of audience/value pairs, added and removed by row. */
function ValuePropsEditor({
  value,
  onChange,
  audiences,
}: {
  value: ValueProp[]
  onChange: (value: ValueProp[]) => void
  audiences: readonly string[]
}) {
  const update = (index: number, patch: Partial<ValueProp>) =>
    onChange(value.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  return (
    <div className="flex flex-col gap-2">
      {value.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={entry.for}
            placeholder="For…"
            // Suggests the audiences already in use — same tag logic as
            // owners, lighter control: a datalist suggests, never blocks.
            list="cell-value-audiences"
            className="h-7 w-24 shrink-0 text-xs"
            onChange={(event) => update(index, { for: event.target.value })}
          />
          <Input
            value={entry.value}
            placeholder="…gets this"
            className="h-7 min-w-0 flex-1 text-xs"
            onChange={(event) => update(index, { value: event.target.value })}
          />
          <IconTooltip label="Remove this value proposition">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove value proposition"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X className="size-3" />
            </Button>
          </IconTooltip>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start px-2 text-muted-foreground hover:text-foreground"
        onClick={() => onChange([...value, { for: '', value: '' }])}
      >
        <Plus className="size-3" />
        Add value proposition
      </Button>
      <datalist id="cell-value-audiences">
        {audiences.map((audience) => (
          <option key={audience} value={audience} />
        ))}
      </datalist>
    </div>
  )
}
