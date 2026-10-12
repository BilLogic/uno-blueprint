import type { SupabaseClient } from '@supabase/supabase-js'
import { recordChange } from '@/lib/authoringSession'
import { toAuthoringError } from '@/lib/authoringErrors'
import {
  asUpdatedAtToken,
  readWriteOutcome,
  requireRowsWritten,
  type UpdatedAtToken,
  type WriteOutcome,
} from '@/lib/optimisticConcurrency'
import { authorshipAfterEdit, type DraftSlide, type SliceKind } from '@/lib/sliceValidation'
import { removeSlideUploadObjects } from '@/lib/illustrationUpload'
import { asSlideWithImages, imageSetCarriedOntoReplacedSlide } from '@/lib/slideImages'
import type { Database, Slice } from '@/types/database'
import { invalidateQueries } from '@/lib/queryClient'
import { queryKeys } from '@/lib/queryKeys'

type Client = SupabaseClient<Database>

/**
 * A slice's rows moved: the catalog that lists it and its own detail. Called
 * by every writer below, and by the revert path's own slice writes, so no
 * caller does it. `null` when only a slide is known — every detail, then.
 */
export function sliceWritten(sliceId: string | null): void {
  invalidateQueries(queryKeys.slices.prefix)
  invalidateQueries(sliceId ? queryKeys.slice.of(sliceId) : queryKeys.slice.prefix)
}

/**
 * A `slides` row exactly as the server stores it — what a slide revert
 * puts back. Captured verbatim rather than rebuilt from the draft shape: a
 * slide carries `cell_keys` that `DraftSlide` has no field for, and a
 * "restore" that silently dropped them would not be one.
 */
type SlideRow = Database['public']['Tables']['slides']['Row']
type SlideImageRow = Database['public']['Tables']['slide_images']['Row']
type CapturedSlide = SlideRow & { slide_images?: SlideImageRow[] }

/**
 * What deleting a slice would destroy.
 *
 * A separate read from `deletion_impact`, which does not and should not know
 * about slices: that function answers "how much of the BLUEPRINT dies", and a
 * slice delete destroys none of it. Trying to squeeze a slice into its shape
 * would put a cell count in front of someone about to delete a slice, which is
 * the exact wrong number — the reassuring fact here is that the cells survive.
 *
 * A plain read: it must never reach the session ledger.
 */
export type SliceDeletionImpact = {
  label: string
  slide_count: number
  /** Distinct blueprint cells this slice points at. They are not deleted. */
  referenced_cell_count: number
}

export async function sliceDeletionImpact(
  client: Client,
  sliceId: string,
): Promise<SliceDeletionImpact> {
  const { data: slice, error: sliceError } = await client
    .from('slices')
    .select('title')
    .eq('id', sliceId)
    .single()
  if (sliceError) throw toAuthoringError(sliceError)

  const { data: items, error: itemsError } = await client
    .from('slides')
    .select('cell_ids')
    .eq('slice_id', sliceId)
  if (itemsError) throw toAuthoringError(itemsError)

  const cells = new Set<string>()
  for (const item of items ?? []) {
    for (const cellId of item.cell_ids ?? []) cells.add(cellId)
  }

  return {
    label: slice.title,
    slide_count: (items ?? []).length,
    referenced_cell_count: cells.size,
  }
}

/**
 * Delete a slice; slides cascade in the database.
 *
 * Recorded in the session ledger with **no** revert, and named in `DESTRUCTIVE`
 * so Save asks twice. There is deliberately no captured inverse: unlike a
 * scenario or path delete nothing archives a slice's rows,
 * so nothing exists to put back. An entry with a revert control that could not
 * actually restore the slides would be worse than one without.
 *
 * `title` is passed only so the change list can name what went — it is not
 * part of the delete.
 */
export async function deleteSlice(
  client: Client,
  sliceId: string,
  title?: string,
): Promise<void> {
  const { data: slides, error: slidesError } = await client
    .from('slides')
    .select('id')
    .eq('slice_id', sliceId)
  if (slidesError) throw toAuthoringError(slidesError)
  for (const slide of slides ?? []) {
    await removeSlideUploadObjects(client, sliceId, slide.id)
  }

  const { error } = await client.from('slices').delete().eq('id', sliceId)
  if (error) throw toAuthoringError(error)
  sliceWritten(sliceId)
  recordChange('delete_slice', { slice_id: sliceId, title: title ?? null })
}

export type NewSlice = {
  serviceId: string
  title: string
  summary: string
  sliceKind: SliceKind
  actor: string
  /** Ordered cell ids; one slide per cell unless `slides` is given. */
  cellIds: readonly string[]
  slides?: readonly DraftSlide[]
}

/**
 * Create a slice and its slides.
 *
 * `authorship` is `human` — this slice was authored here, so the slice skill will
 * never regenerate over it. Slides default to one cell each: that is the
 * honest reading of a selection made by clicking cells one at a time, and
 * merging them afterwards is one click in the editor.
 *
 * One RPC, `create_slice`, writes the row and the slides in one transaction.
 * As two requests a refused slide insert left an empty slice behind, and an
 * agent's one mistyped cell id was enough to do it.
 */
export async function createSlice(
  client: Client,
  input: NewSlice,
): Promise<Slice> {
  const slides: DraftSlide[] =
    input.slides?.map((slide) => ({ ...slide })) ??
    input.cellIds.map((cellId) => ({ cells: [cellId], title: '', caption: '' }))

  const { data, error } = await client.rpc('create_slice', {
    p_service_id: input.serviceId,
    p_title: input.title.trim(),
    p_summary: input.summary.trim(),
    p_kind: input.sliceKind,
    p_actor: input.actor.trim(),
    // A new slice has no prior slides to carry an image set from.
    p_slides: slides.map((slide) => plannedSlide(slide, undefined)),
  })
  if (error) throw toAuthoringError(error)
  const slice = data as unknown as Slice

  sliceWritten(slice.id)
  // ONE change in the ledger, not a create followed by a slide replacement of
  // nothing. Its inverse deletes the slice, which takes the slides with it.
  recordChange(
    'create_slice',
    { slice_id: slice.id, title: slice.title },
    { fn: 'delete_slice_row', args: { slice_id: slice.id } },
  )
  return slice
}

/**
 * One slide as `replace_slides` and `create_slice` take it: the cells, the
 * words, and the image set it carries — decided here, from the row it
 * replaces, so the database writes what it is sent.
 *
 * `cell_keys` is written as the cell ids themselves. Human-authored slices
 * have no IR key path to record — the slice skill fills real key paths when
 * it generates one. The column is a recovery trail, and an id is a better
 * trail than an empty array.
 */
function plannedSlide(slide: DraftSlide, prior: CapturedSlide | undefined) {
  const carried = imageSetCarriedOntoReplacedSlide(prior, slide.cells)
  return {
    ...(prior ? { id: prior.id } : {}),
    cell_ids: [...slide.cells],
    cell_keys: [...slide.cells],
    title: slide.title.trim() || null,
    caption: slide.caption.trim() || null,
    shows_all_images: carried.showsAllImages,
    images: carried.members,
  }
}

/**
 * Replace a slice's slides wholesale.
 *
 * Delete-then-insert rather than a per-row diff: slide identity is position,
 * and reordering by position update trips the uniqueness constraint halfway
 * through unless every move is staged. Replacing sidesteps the whole class of
 * problem, and a slice has tens of slides, not thousands.
 *
 * **The delete and the insert are one transaction.** `replace_slides` does
 * both, with the slides' `slide_images`, so a refused insert — one bad cell
 * id — leaves the slice exactly as it was. As separate requests the delete
 * stood and the slice was left with nothing.
 *
 * **The prior rows are carried as the inverse.** This is the most destructive
 * write in the file — it removes every slide of a slice — and it is reachable
 * both from the editor's Save and from the agent's `replace_slides` tool.
 * Without the capture there was no ledger row, no revert control, and
 * nothing counted against the destructive-save gate. The capture is the one
 * the function returns, taken under its lock, not the read below: that read
 * only decides which image set each replacement slide carries.
 *
 * `record: false` is for callers that own a coarser entry, and for the revert
 * path, which must not log its own undo.
 *
 * Dropped slides leave their upload folders in the bucket. The inverse
 * captures those `image_url`s, and `restore_slides` writes them back
 * verbatim — deleting the object here would restore a row that points at
 * nothing. A sweep can collect folders no row names; this write must not.
 */
export async function replaceSlides(
  client: Client,
  sliceId: string,
  slides: readonly DraftSlide[],
  options?: { record?: boolean },
): Promise<void> {
  const record = options?.record !== false

  // Each authored image set is carried onto the replacement slide that still
  // names its slide.
  const { data, error } = await client
    .from('slides')
    .select('*, slide_images(*)')
    .eq('slice_id', sliceId)
    .order('position', { ascending: true })
  if (error) throw toAuthoringError(error)
  const existing: CapturedSlide[] = (data ?? []).map(asSlideWithImages)

  const { data: replaced, error: replaceError } = await client.rpc('replace_slides', {
    p_slice_id: sliceId,
    p_slides: slides.map((slide) =>
      plannedSlide(slide, slide.id ? existing.find((row) => row.id === slide.id) : undefined),
    ),
  })
  if (replaceError) throw toAuthoringError(replaceError)

  sliceWritten(sliceId)
  // After the write, like every other entry: the ledger records what landed.
  // A reply without its capture is still recorded — an entry without a revert
  // is recoverable from, a missing entry is not.
  if (record) {
    const previous = (replaced as { previous?: unknown } | null)?.previous
    recordChange(
      'replace_slides',
      { slice_id: sliceId, slide_count: slides.length },
      Array.isArray(previous)
        ? { fn: 'restore_slides', args: { slice_id: sliceId, rows: previous as CapturedSlide[] } }
        : undefined,
    )
  }
}

/**
 * Copy a slice — row and slides — as "<title> copy".
 *
 * The copy is `authorship: 'human'` regardless of the source's authorship: the act
 * of duplicating is authorship, and a copy the slice skill could regenerate
 * over would not be the safe scratchpad duplication exists to provide.
 */
export async function duplicateSlice(
  client: Client,
  sliceId: string,
): Promise<Slice> {
  const { data: source, error: sourceError } = await client
    .from('slices')
    .select()
    .eq('id', sliceId)
    .single()
  if (sourceError) throw toAuthoringError(sourceError)

  const { data: items, error: itemsError } = await client
    .from('slides')
    .select('*, slide_images(*)')
    .eq('slice_id', sliceId)
    .order('position', { ascending: true })
  if (itemsError) throw toAuthoringError(itemsError)
  const sourceSlides = (items ?? []).map(asSlideWithImages)

  const { data: copy, error: insertError } = await client
    .from('slices')
    .insert({
      service_id: source.service_id,
      title: `${source.title} copy`,
      summary: source.summary,
      kind: source.kind,
      actor: source.actor,
      authorship: 'human',
    })
    .select()
    .single()
  if (insertError) throw toAuthoringError(insertError)

  if (sourceSlides.length > 0) {
    const rows = sourceSlides.map((item) => ({
      slice_id: copy.id,
      position: item.position,
      cell_ids: item.cell_ids,
      cell_keys: item.cell_keys,
      title: item.title,
      caption: item.caption,
      shows_all_images: item.shows_all_images,
    }))
    const { data: copies, error } = await client.from('slides').insert(rows).select()
    if (error) throw toAuthoringError(error)
    const imageRows = sourceSlides.flatMap((item) => {
      const copied = (copies ?? []).find((row) => row.position === item.position)
      if (!copied) return []
      return (item.slide_images ?? []).map((member) => ({
        slide_id: copied.id,
        position: member.position,
        cell_id: member.cell_id,
        image_url: member.image_url,
      }))
    })
    if (imageRows.length > 0) {
      const { error: imageError } = await client.from('slide_images').insert(imageRows)
      if (imageError) throw toAuthoringError(imageError)
    }
  }

  sliceWritten(copy.id)
  // One entry for the whole copy, inverted by deleting the copy — the slides
  // cascade with it, so nothing of the original is at risk in the undo.
  recordChange(
    'duplicate_slice',
    { slice_id: copy.id, source_slice_id: sliceId, title: copy.title },
    { fn: 'delete_slice_row', args: { slice_id: copy.id } },
  )

  return copy
}

export type SliceMetaUpdate = {
  title: string
  summary: string
  sliceKind: SliceKind
  actor: string
  /** Current authorship; an edit promotes `generated` to `customized`. */
  authorship: string
}

/**
 * Update a slice's own fields under an optimistic-concurrency guard.
 *
 * Returns `conflict` when the row moved under us — the caller refetches to
 * find out whether it was edited elsewhere or deleted outright.
 *
 * The before-state is read here rather than taken from the caller. Every call
 * site already holds the row (it had to, for the token), but a captured
 * inverse that depends on each caller remembering to pass one is an inverse
 * that will be missing somewhere — and the one field a caller would most
 * likely forget is `authorship`, which this write *changes* as a side effect
 * (`generated` → `customized`) without being asked to.
 *
 * Recorded only on `ok`. A conflict wrote nothing, and the ledger's whole
 * claim is that it lists writes that landed.
 */
export async function updateSliceMeta(
  client: Client,
  sliceId: string,
  token: UpdatedAtToken,
  update: SliceMetaUpdate,
) {
  const { data: before, error: beforeError } = await client
    .from('slices')
    .select('title, summary, kind, actor, authorship')
    .eq('id', sliceId)
    .maybeSingle()
  if (beforeError) throw toAuthoringError(beforeError)

  const { data, error } = await client
    .from('slices')
    .update({
      title: update.title.trim(),
      summary: update.summary.trim() || null,
      kind: update.sliceKind,
      actor: update.actor.trim() || null,
      authorship: authorshipAfterEdit(update.authorship),
      // updated_at is trigger-maintained — never set it here.
    })
    .eq('id', sliceId)
    .eq('updated_at', token)
    .select()
  const outcome = readWriteOutcome<Slice>(data, error)

  // Recorded only when a field actually moved. The slide editor calls this on
  // every Save with the slice's current values, purely to exercise the
  // concurrency guard before it rewrites the slides — logging that would put
  // an "Edited slice" row in the list on saves where nobody edited the slice,
  // which is the ledger claiming a change that did not happen.
  //
  // `before === null` cannot coexist with `ok` (the guarded update matched a
  // row), but it is recorded rather than skipped if it ever does: an entry
  // without a revert is recoverable from, a missing entry is not.
  if (outcome.status === 'ok') sliceWritten(sliceId)
  if (outcome.status === 'ok' && (!before || metaMoved(before, outcome.row))) {
    recordChange(
      'update_slice_meta',
      { slice_id: sliceId, title: outcome.row.title },
      before
        ? { fn: 'restore_slice_meta', args: { slice_id: sliceId, row: before } }
        : undefined,
    )
  }

  return outcome
}

/**
 * Edit the fields a patch names and keep the rest, under the same
 * concurrency guard: the row is read for its token and its current values,
 * and the update goes through `updateSliceMeta` with both. What comes back
 * is that function's outcome — `conflict` when the row moved between the
 * read and the write, which the caller words for whoever asked.
 */
export async function patchSliceMeta(
  client: Client,
  sliceId: string,
  patch: Partial<Omit<SliceMetaUpdate, 'authorship'>>,
): Promise<WriteOutcome<Slice>> {
  const { data, error } = await client
    .from('slices')
    .select('title, summary, kind, actor, authorship, updated_at')
    .eq('id', sliceId)
    .maybeSingle()
  if (error) throw toAuthoringError(error)
  if (!data) throw new Error(`No slice with id ${sliceId}.`)
  return updateSliceMeta(client, sliceId, asUpdatedAtToken(data.updated_at), {
    title: patch.title ?? data.title,
    summary: patch.summary ?? data.summary ?? '',
    sliceKind: patch.sliceKind ?? (data.kind as SliceKind),
    actor: patch.actor ?? data.actor ?? '',
    authorship: data.authorship,
  })
}

/** The subset of `slices` a meta update writes — what is compared and restored. */
type SliceMetaFields = Pick<
  Slice,
  'title' | 'summary' | 'kind' | 'actor' | 'authorship'
>

/**
 * Did the update change anything?
 *
 * Compared field by field against the row the update RETURNED, not against the
 * caller's intent: `authorship` is rewritten by `authorshipAfterEdit` rather
 * than passed through, and the trimming happens in the update itself, so
 * comparing `before` to the arguments would call a no-op save a change (and
 * vice versa).
 */
function metaMoved(before: SliceMetaFields, after: SliceMetaFields): boolean {
  return (
    before.title !== after.title ||
    before.summary !== after.summary ||
    before.kind !== after.kind ||
    before.actor !== after.actor ||
    before.authorship !== after.authorship
  )
}

/** One member of a slide's authored image set, as the writer sends it. */
export type SlideImageMemberInput = {
  position: number
  cell_id: string | null
  image_url: string | null
}

/**
 * Replace one slide's authored image set.
 *
 * `slide_images` is outside the write surface: the set is deleted and
 * re-inserted as a whole rather than patched row by row. `shows_all_images`
 * is the discriminator — an empty set with the flag false is "chose nothing",
 * not the untouched default.
 */
export async function replaceSlideImageSet(
  client: Client,
  slideId: string,
  next: {
    showsAllImages: boolean
    members: SlideImageMemberInput[]
  },
): Promise<void> {
  const { data: before, error: beforeError } = await client
    .from('slides')
    .select('shows_all_images, slide_images(*)')
    .eq('id', slideId)
    .maybeSingle()
  if (beforeError) throw toAuthoringError(beforeError)
  if (!before) throw new Error('That slide no longer exists — nothing was written.')
  const previousMembers = asSlideWithImages(before).slide_images ?? []

  await writeSlideImageSet(client, slideId, next)

  recordChange(
    'update_slide_images',
    {
      slide_id: slideId,
      shows_all_images: next.showsAllImages,
      member_count: next.members.length,
    },
    {
      fn: 'restore_slide_images',
      args: {
        slide_id: slideId,
        shows_all_images: before.shows_all_images,
        members: previousMembers.map((member) => ({
          position: member.position,
          cell_id: member.cell_id,
          image_url: member.image_url,
        })),
      },
    },
  )
}

/**
 * Put a captured image set back. Used by revert; does not write the ledger.
 */
export async function restoreSlideImageSet(
  client: Client,
  slideId: string,
  next: {
    shows_all_images: boolean
    members: SlideImageMemberInput[]
  },
): Promise<void> {
  await writeSlideImageSet(client, slideId, {
    showsAllImages: next.shows_all_images,
    members: next.members,
  })
}

/**
 * Write `shows_all_images` and replace every `slide_images` row for one slide.
 */
async function writeSlideImageSet(
  client: Client,
  slideId: string,
  next: {
    showsAllImages: boolean
    members: SlideImageMemberInput[]
  },
): Promise<void> {
  const { data, error } = await client
    .from('slides')
    .update({ shows_all_images: next.showsAllImages })
    .eq('id', slideId)
    .select('id')
  if (error) throw toAuthoringError(error)
  requireRowsWritten(data, 'slide')

  const { error: deleteError } = await client.from('slide_images').delete().eq('slide_id', slideId)
  if (deleteError) throw toAuthoringError(deleteError)

  if (next.members.length === 0) return
  const { error: insertError } = await client.from('slide_images').insert(
    next.members.map((member) => ({
      slide_id: slideId,
      position: member.position,
      cell_id: member.cell_id,
      image_url: member.image_url,
    })),
  )
  if (insertError) throw toAuthoringError(insertError)
  // The slide's slice is not in hand; every detail, and the catalog's thumbnails.
  sliceWritten(null)
}

/**
 * The same update, guarded against the row a form was **seeded** from rather
 * than against a token the caller happens to hold.
 *
 * `updateSliceMeta` can only be as honest as its token, and a long-lived form
 * has no honest one. Sending the stamp captured when the form opened fails
 * renames nobody raced, because an unrelated write bumps `updated_at` without
 * touching a field the form shows. Sending the freshest stamp the client has
 * seen fails nothing at all: by the time someone else's rename has been
 * refetched, it is the token, and the guard waves the overwrite through. Both
 * were shipped in turn, and neither is visible at the call site — only the
 * *value* of the token differs.
 *
 * So the comparison moves off the stamp and onto the fields. The row is read
 * back here, at submit, and matched against what the form was seeded from: a
 * row whose meta still says what the user was looking at is safe to write, at
 * whatever stamp it now carries, and a row whose meta has moved is a conflict
 * however recently this client learned of it. A missing row is a conflict too
 * — deleted, or hidden by RLS, which is the same ambiguity a zero-row guarded
 * update leaves and the same "reopen it" the caller prints for it.
 *
 * The freshly read stamp still goes to `updateSliceMeta` as the token, so the
 * window between this read and that write stays guarded.
 *
 * One extra round trip per save. That is the price of a guard that answers
 * both questions, and a rename is not a hot path.
 */
export async function updateSliceMetaFromSeed(
  client: Client,
  sliceId: string,
  seeded: SliceMetaFields,
  update: SliceMetaUpdate,
): Promise<WriteOutcome<Slice>> {
  const { data: current, error } = await client
    .from('slices')
    .select('title, summary, kind, actor, authorship, updated_at')
    .eq('id', sliceId)
    .maybeSingle()
  if (error) throw toAuthoringError(error)
  if (!current || seedMoved(seeded, current)) return { status: 'conflict' }

  return updateSliceMeta(client, sliceId, sliceToken(current), update)
}

/**
 * Did the row move out from under the form between opening and submitting?
 *
 * Not `metaMoved`. That one compares two rows the database actually stored,
 * which is the right question for the ledger and the wrong one here:
 * `authorship` is DERIVED on write by `authorshipAfterEdit`, not preserved. A Save
 * on an agent-authored slice flips `agent` to `customized` without a person
 * touching a word of it, and comparing the raw field would then refuse a
 * rename that would have stored the very same value.
 *
 * So `authorship` is compared through the same projection the write applies. The
 * four fields that ARE round-tripped are compared verbatim.
 */
function seedMoved(seeded: SliceMetaFields, current: SliceMetaFields): boolean {
  return (
    seeded.title !== current.title ||
    seeded.summary !== current.summary ||
    seeded.kind !== current.kind ||
    seeded.actor !== current.actor ||
    authorshipAfterEdit(seeded.authorship) !== authorshipAfterEdit(current.authorship)
  )
}

/** The token a guarded update needs, taken verbatim from a loaded row. */
export function sliceToken(slice: Pick<Slice, 'updated_at'>): UpdatedAtToken {
  return asUpdatedAtToken(slice.updated_at)
}
