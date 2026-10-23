import { HOST_OPERATIONS, isHostOperation } from '@/lib/hostAuthoringOperations'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toAuthoringError } from '@/lib/authoringErrors'
import { currentAgentSessionId, type SessionEntry } from '@/lib/authoringSession'
import {
  restoreCellTouchpoints,
  updateCellContent,
  updateCellStatus,
  writeCellResources,
  type CellContentUpdate,
  type RemovedPlacement,
  type ResourceRowInput,
} from '@/lib/cellContentMutations'
import { asEntityStatus } from '@/lib/entityStatus'
import {
  writePlacementResources,
  type PlacementResourceRowInput,
} from '@/lib/placementResourceMutations'
import {
  restoreTouchpointPlacement,
  type PlacementDetailColumns,
} from '@/lib/touchpointMutations'
import { updateCellSpec, type CellSpecUpdate } from '@/lib/cellSpecMutations'
import { updateLaneSpec, type LaneSpecUpdate } from '@/lib/laneSpecMutations'
import { updatePhaseSpec, type PhaseSpecUpdate } from '@/lib/phaseSpecMutations'
import {
  updatePathSpec,
  updateScenarioSummary,
  type PathSpecUpdate,
} from '@/lib/scenarioSpecMutations'
import {
  updateBusinessModel,
  updateServiceEntityExamples,
  updateServiceSummary,
  type BusinessModelUpdate,
  type EntityExamplesUpdate,
} from '@/lib/serviceSpecMutations'
import { updateStepSummary } from '@/lib/stepSpecMutations'
import {
  deleteStakeholder,
  updateStakeholder,
  type StakeholderInput,
} from '@/lib/stakeholderMutations'
import {
  deleteEvidence,
  restoreEvidenceRow,
  updateEvidence,
  type EvidenceUpdate,
} from '@/lib/evidenceMutations'
import { removeSlideUploadObjects } from '@/lib/illustrationUpload'
import { restoreSlideImageSet, sliceWritten, type SlideImageMemberInput } from '@/lib/sliceMutations'
import { requireRowsWritten } from '@/lib/optimisticConcurrency'
import { revertHostOperation, invalidateAfterRpc } from '@/lib/authoringRpc'
import { updateFinding, type FindingUpdate } from '@/lib/findingMutations'
import type { Database, Json } from '@/types/database'

type Client = SupabaseClient<Database>
type EvidenceRowType = Database['public']['Tables']['evidence']['Row']
/** The subset of `slices` that `updateSliceMeta` writes, and so restores. */
type SliceMetaFields = Pick<
  Database['public']['Tables']['slices']['Row'],
  'title' | 'summary' | 'kind' | 'actor' | 'authorship'
>

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value) {
    throw new Error(`This change's revert is missing its “${key}” value.`)
  }
  return value
}

/**
 * A captured value that is allowed to be empty.
 *
 * `stringArg` refuses `''` because an identifier never legitimately is one.
 * A one-column prose revert is the opposite case: "it had no summary before"
 * is a real prior state and the commonest one — the FIRST edit of any field
 * captures `''` as its previous value — so an empty string is the value, not
 * a missing one. Every self-inverse summary case reads its arg through here;
 * reading it through `stringArg` would make the first undo of a first summary
 * throw instead of clearing the field.
 */
function optionalStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') {
    throw new Error(`This change's revert is missing its “${key}” value.`)
  }
  return value
}

/**
 * Execute a change's captured inverse.
 *
 * The revert's own writes pass `record: false` (or go straight to the
 * database) so undoing "Added a lane" never appends "Deleted a lane" to the
 * very list the row was just removed from. That decision travels *with each
 * call* rather than through a module-level suspend flag — an ambient flag
 * around an `await` also swallowed any ordinary save that happened to
 * resolve while a revert was in flight.
 *
 * The caller removes the entry (`forgetChange`) and re-reads the grid —
 * every revert is structural or content-bearing, and pessimistic re-read is
 * the house rule for both.
 *
 * ── WHERE THE INPUT MAY COME FROM ─────────────────────────────────────────
 *
 * A `SessionEntry`, and nothing else. That type is minted only by
 * the session recorders, so the entry handed in here was assembled by the
 * build now reading it — never fetched, never deserialised, never older than the
 * code applying it. `public.authoring_changes` keeps the same information
 * durably and is not a source for this function: a row out of it is a
 * `ChangeEntry`-shaped object at best and will not type-check as a
 * `SessionEntry`. `revertBoundaryContract.test.ts` is the rest of that wall —
 * it refuses a cast that would mint the brand anywhere but the session module,
 * and refuses a signature here that widens the parameter back out.
 */
export async function executeRevert(
  client: Client,
  entry: SessionEntry,
): Promise<void> {
  const revert = entry.revert
  if (!revert) {
    throw new Error('This change has nothing recorded to revert it with.')
  }

  if (isHostOperation(entry.fn) && HOST_OPERATIONS[entry.fn].humanOnlyInverse && currentAgentSessionId()) {
    throw new Error('This creation inverse deletes a cell and is human-only.')
  }
  if (isHostOperation(revert.fn)) {
    await revertHostOperation(client, revert.fn, revert.args)
    return
  }
  switch (revert.fn) {
    case 'update_cell_status': {
      const status = asEntityStatus(revert.args.status)
      const expected = asEntityStatus(revert.args.expected_status)
      if (!status || !expected) throw new Error('This status inverse is missing valid statuses.')
      await updateCellStatus(client, { cellId: stringArg(revert.args, 'cell_id'), status, expectedStatus: expected, record: false })
      return
    }
    case 'update_cell_content': {
      const cellId = stringArg(revert.args, 'cell_id')
      const update = revert.args.update as CellContentUpdate
      await updateCellContent(client, cellId, update, undefined, {
        record: false,
      })
      // Restoring the text brings back the names of any placements the
      // original save removed, but not what was written about them at this
      // moment. This puts it back, and has to run after the content write,
      // which is what re-creates the rows.
      const removed = revert.args.removed_placements
      if (Array.isArray(removed) && removed.length > 0) {
        await restoreCellTouchpoints(client, cellId, removed as RemovedPlacement[])
      }
      return
    }
    case 'update_cell_spec': {
      const cellId = stringArg(revert.args, 'cell_id')
      const update = revert.args.update as CellSpecUpdate
      await updateCellSpec(client, cellId, update, undefined, { record: false })
      return
    }
    case 'update_lane_spec': {
      // Self-inverse, like update_cell_spec: the captured payload IS an
      // update. The lane ids are captured too — the fan-out has to land on
      // exactly the rows the save touched, not on whatever carries that label
      // now.
      const laneIds = revert.args.lane_ids
      if (!Array.isArray(laneIds) || laneIds.length === 0) {
        throw new Error("This change's revert is missing its lane ids.")
      }
      const update = revert.args.update as LaneSpecUpdate
      await updateLaneSpec(client, laneIds as string[], update, undefined, {
        record: false,
      })
      return
    }
    case 'update_phase_spec': {
      // Self-inverse, like update_cell_spec.
      const phaseId = stringArg(revert.args, 'phase_id')
      const update = revert.args.update as PhaseSpecUpdate
      await updatePhaseSpec(client, phaseId, update, undefined, {
        record: false,
      })
      return
    }
    case 'update_scenario_spec': {
      const scenarioId = stringArg(revert.args, 'scenario_id')
      const summary = optionalStringArg(revert.args, 'summary')
      await updateScenarioSummary(client, scenarioId, summary, undefined, {
        record: false,
      })
      return
    }
    case 'update_path_spec': {
      const pathId = stringArg(revert.args, 'path_id')
      const update = revert.args.update as PathSpecUpdate
      await updatePathSpec(client, pathId, update, undefined, {
        record: false,
      })
      return
    }
    case 'update_step_spec': {
      const stepId = stringArg(revert.args, 'step_id')
      const summary = optionalStringArg(revert.args, 'summary')
      await updateStepSummary(client, stepId, summary, undefined, {
        record: false,
      })
      return
    }
    case 'update_service_summary': {
      // Self-inverse, like update_cell_spec. Both service writes are direct
      // table updates, not RPCs — without these two cases they fall to the
      // default branch below and call a Postgres function that has never
      // existed, so every service edit would record an undo that could only
      // 404. `revertCoverageContract` is the guard that says so.
      const serviceId = stringArg(revert.args, 'service_id')
      const summary = optionalStringArg(revert.args, 'summary')
      await updateServiceSummary(client, serviceId, summary, undefined, {
        record: false,
      })
      return
    }
    case 'update_business_model': {
      const serviceId = stringArg(revert.args, 'service_id')
      const update = revert.args.update as BusinessModelUpdate
      await updateBusinessModel(client, serviceId, update, undefined, {
        record: false,
      })
      return
    }
    case 'update_service_entity_examples': {
      // Self-inverse, exactly like update_service_summary above: a direct
      // `services` update, so the previous map is handed straight back rather
      // than dispatched to an RPC that does not exist.
      const serviceId = stringArg(revert.args, 'service_id')
      const update = revert.args.update as EntityExamplesUpdate
      await updateServiceEntityExamples(client, serviceId, update, undefined, {
        record: false,
      })
      return
    }
    case 'delete_stakeholder': {
      // Undo of "added someone to the cast".
      await deleteStakeholder(client, stringArg(revert.args, 'stakeholder_id'))
      return
    }
    case 'update_stakeholder': {
      const stakeholderId = stringArg(revert.args, 'stakeholder_id')
      const update = revert.args.update as StakeholderInput
      await updateStakeholder(client, stakeholderId, update, undefined, {
        record: false,
      })
      return
    }
    case 'update_cell_resources': {
      // The captured value is the pre-write list — written back through the
      // same RPC the editor uses, so the revert lands in one transaction for
      // the reason the edit does. Verbatim rather than rebuilt through the
      // draft validator, which could refuse to restore a url it dislikes.
      // By id, so the rows themselves come back, not look-alikes;
      // the RPC raises when the cell is gone.
      const cellId = stringArg(revert.args, 'cell_id')
      const resources = revert.args.resources as ResourceRowInput[]
      await writeCellResources(client, cellId, resources ?? [])
      return
    }
    case 'update_placement_resources': {
      // The same shape as update_cell_resources, for the touchpoint's list at
      // one cell: the captured rows, by id, written back as they stood. The
      // RPC raises when the placement is gone.
      const placementId = stringArg(revert.args, 'placement_id')
      const resources = revert.args.resources as PlacementResourceRowInput[]
      await writePlacementResources(client, placementId, resources ?? [])
      return
    }
    case 'restore_touchpoint_placement': {
      // Undo of "edited a touchpoint at this cell". The captured payload is
      // the detail COLUMNS as the database held them, written back verbatim
      // rather than rebuilt through the input validator — undo has to be able
      // to reach data that was already there. Same rule, same reason, as
      // update_cell_resources.
      //
      // Keyed on the placement id, so a revert after the touchpoint was
      // reordered or the registry entry renamed still lands on the row the
      // edit came from rather than on whatever now spells the same.
      const detailPlacementId = stringArg(revert.args, 'placement_id')
      const captured = revert.args.columns as Partial<PlacementDetailColumns> | undefined
      if (!captured || typeof captured !== 'object') {
        throw new Error('This change’s captured placement detail is malformed.')
      }
      await restoreTouchpointPlacement(client, detailPlacementId, {
        summary: captured.summary ?? null,
        role: captured.role ?? null,
      })
      return
    }
    case 'delete_evidence': {
      // Undo of "added a source": remove the row it created.
      const evidenceId = stringArg(revert.args, 'evidence_id')
      await deleteEvidence(client, evidenceId, undefined, { record: false })
      return
    }
    case 'update_evidence': {
      // Undo of "edited a source": write the captured prior values back.
      // Self-inverse, like update_cell_spec — the captured payload IS an
      // update, so the same function serves both directions.
      const evidenceId = stringArg(revert.args, 'evidence_id')
      const update = revert.args.update as EvidenceUpdate
      await updateEvidence(client, evidenceId, update, { record: false })
      return
    }
    case 'restore_evidence_row': {
      // Undo of "deleted a source": reinsert the captured row verbatim,
      // original id included, so references to it come back intact. The
      // ledger is in-memory today, but the shape check costs nothing and
      // pins the contract if persistence ever lands.
      const row = revert.args.row as EvidenceRowType
      if (
        !row ||
        typeof row !== 'object' ||
        typeof row.id !== 'string' ||
        typeof row.title !== 'string'
      ) {
        throw new Error('This change’s captured evidence row is malformed.')
      }
      await restoreEvidenceRow(client, row)
      return
    }
    case 'restore_slides': {
      // Undo of "rebuilt a slice's slides": one call to `restore_slides`,
      // which clears whatever is there now and puts the captured rows back
      // verbatim — original ids included, so a slide's identity survives the
      // round trip — in a single transaction. As separate requests a refused
      // insert after the delete left the slice with nothing. An empty capture
      // is a real answer: the slice had no slides before the write.
      const sliceId = stringArg(revert.args, 'slice_id')
      const rows = revert.args.rows
      if (!Array.isArray(rows)) {
        throw new Error('This change’s captured slides are malformed.')
      }
      const { data, error } = await client.rpc('restore_slides', {
        p_slice_id: sliceId,
        p_rows: rows as Json,
      })
      if (error) throw toAuthoringError(error)
      sliceWritten(sliceId)
      // Folders of slides the inverse does not restore — the forward write's
      // leftovers — swept after the commit, since storage is not in it.
      // Captured rows keep theirs: replaceSlides left those objects so the
      // verbatim `image_url` the restore wrote still names a file.
      const dropped = (data as { dropped?: unknown } | null)?.dropped
      for (const slideId of Array.isArray(dropped) ? dropped : []) {
        if (typeof slideId === 'string') {
          await removeSlideUploadObjects(client, sliceId, slideId)
        }
      }
      return
    }
    case 'delete_slice_row': {
      // Undo of "added a slice" / "duplicated a slice": remove the row it
      // created. Its `slides` cascade with it, which is why neither of those
      // operations needs a slide capture of its own.
      //
      // A direct delete rather than `deleteSlice`: that wrapper records a
      // `delete_slice` entry, and undoing "Added a slice" must not append
      // "Deleted a slice" to the list the row was just removed from.
      const sliceId = stringArg(revert.args, 'slice_id')
      const { data, error } = await client
        .from('slices')
        .delete()
        .eq('id', sliceId)
        .select('id')
      if (error) throw toAuthoringError(error)
      requireRowsWritten(data, 'slice')
      sliceWritten(sliceId)
      return
    }
    case 'restore_slide_images': {
      // Undo of a write to a slide's image set: put the flag and the members
      // back as they were. The files themselves are never touched here.
      const slideId = stringArg(revert.args, 'slide_id')
      const members = Array.isArray(revert.args.members)
        ? (revert.args.members as SlideImageMemberInput[])
        : []
      await restoreSlideImageSet(client, slideId, {
        shows_all_images: revert.args.shows_all_images === true,
        members,
      })
      return
    }
    case 'restore_slice_meta': {
      // Undo of a slice field edit. Writes `origin` back too: the forward
      // write promotes `generated` to `customized` as a side effect, and an
      // inverse that left the promotion standing would mark a slice as
      // hand-edited when the edit has been taken back.
      const sliceId = stringArg(revert.args, 'slice_id')
      const row = revert.args.row as SliceMetaFields | undefined
      if (!row || typeof row !== 'object' || typeof row.title !== 'string') {
        throw new Error('This change’s captured slice fields are malformed.')
      }
      const { data, error } = await client
        .from('slices')
        .update({
          title: row.title,
          summary: row.summary,
          kind: row.kind,
          actor: row.actor,
          authorship: row.authorship,
        })
        .eq('id', sliceId)
        .select('id')
      if (error) throw toAuthoringError(error)
      requireRowsWritten(data, 'slice')
      sliceWritten(sliceId)
      return
    }
    case 'update_finding': {
      // Undo of an edit to a finding — self-inverse, so the captured payload
      // goes straight back to the function that wrote it. Only the fields the
      // forward write touched were captured, so a status flip made by a person
      // between the edit and the undo survives this rather than being quietly
      // rolled back with it.
      //
      // `record: false`: undoing an edit must not append a second edit to the
      // list the entry was just taken out of.
      const findingId = stringArg(revert.args, 'finding_id')
      const update = revert.args.update as FindingUpdate | undefined
      if (!update || typeof update !== 'object') {
        throw new Error('This change’s captured finding fields are malformed.')
      }
      await updateFinding(client, findingId, update, { record: false })
      return
    }
    case 'rename_owner_tag_scoped': {
      // Tag rename, inverted with precision: only the cells the rename
      // actually touched get the old name back. A name-based inverse would
      // also rewrite cells that legitimately adopted the new name since.
      const from = stringArg(revert.args, 'from')
      const to = stringArg(revert.args, 'to')
      const ids = revert.args.cell_ids
      if (!Array.isArray(ids) || ids.length === 0) return
      const ownerUpdate = await client
        .from('cells')
        .update({ owner: to })
        .eq('owner', from)
        .in('id', ids as string[])
      if (ownerUpdate.error) throw toAuthoringError(ownerUpdate.error)
      const perceivedUpdate = await client
        .from('cells')
        .update({ perceived_owner: to })
        .eq('perceived_owner', from)
        .in('id', ids as string[])
      if (perceivedUpdate.error) throw toAuthoringError(perceivedUpdate.error)
      invalidateAfterRpc(revert.fn, revert.args)
      return
    }
    default: {
      // Authoring RPCs called directly never pass through `call()`, so
      // nothing here is recorded — same effect as record:false above. What
      // the inverse changed on screen is refetched the way the forward
      // write's was, from the same table.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same seam as authoringRpc.call()
      const { error } = await (client.rpc as any)(revert.fn, revert.args)
      if (error) throw toAuthoringError(error)
      invalidateAfterRpc(revert.fn, revert.args)
    }
  }
}
