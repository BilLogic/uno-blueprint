/**
 * Every revert a mutation can record must be one executeRevert can perform.
 *
 * `WriteFn` already buys a compile-time guarantee for `describeChange` — add a
 * write and forget its sentence and the build breaks. That guard was pointed at
 * the switch that writes the ledger's *prose*. The switch that performs the
 * *undo* had none, and the gap cost exactly what you would expect: the two
 * service mutations recorded `fn: 'update_service_summary'` and
 * `'update_business_model'`, executeRevert had no case for either, and both
 * fell to a default branch that calls `client.rpc(fn, args)` — a Postgres
 * function that has never existed. Every service edit shipped an undo button
 * that could only 404, and nothing failed until a human pressed it.
 *
 * This test reads both files as text rather than importing them. executeRevert
 * needs a live Supabase client to run, and the question here is not what it
 * does but which names it knows — which is a fact about the source, and
 * readable without standing up a database.
 *
 * WHICH NAMES, not which spellings. The mutation modules now declare a spec
 * level rather than writing the six stations out per level, and `fn` is a
 * field of that declaration — so the scan below reads the same names off the
 * same files. The one claim here that was about a payload's spelling has moved
 * onto a run, where it is about the payload instead.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  setCellDependency,
  setCellFeaturedImage,
  updateCellDependency,
  upsertCell,
  type CellDependencyBefore,
  type CellDependencyRow,
  type CellDependencyWrite,
  type CellFeaturedImageBefore,
  type CellWrite,
} from '@/lib/authoringRpc'
import { sourceOf } from '@/lib/sourceTree'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { executeRevert } from '@/lib/revertChange'
import { updateBusinessModel, updateServiceSummary } from '@/lib/serviceSpecMutations'
import { inMemoryDatabase } from '@/test/inMemoryDatabase'
import type { Database } from '@/types/database'

const readLib = (file: string) => sourceOf(`lib/${file}`)

/**
 * Files that can record a revert. A mutation module not listed here is
 * invisible to this test, so the list is asserted non-empty and each file is
 * read eagerly — a renamed module fails loudly rather than quietly shrinking
 * the set under audit.
 */
const MUTATION_MODULES = [
  'authoringRpc.ts',
  'cellContentMutations.ts',
  'cellSpecMutations.ts',
  'evidenceMutations.ts',
  'findingMutations.ts',
  'laneSpecMutations.ts',
  'phaseSpecMutations.ts',
  'scenarioSpecMutations.ts',
  'serviceSpecMutations.ts',
  'sliceMutations.ts',
  'stakeholderMutations.ts',
  'stepSpecMutations.ts',
  'touchpointMutations.ts',
  'placementResourceMutations.ts',
  'placementLinkMutations.ts',
] as const

/**
 * Reverts that are genuinely Postgres functions, and so are *correctly* served
 * by executeRevert's default branch — it calls `client.rpc(fn, args)`, which is
 * exactly right when the name really is an RPC.
 *
 * Verified against the migration series, which is what builds that list:
 *   select proname from pg_proc where pronamespace = 'public'::regnamespace
 *
 * Every other recorded name is a direct table write dressed as a function name,
 * and needs a case of its own. That is the distinction this file exists to
 * police: `update_service_summary` looked exactly like the ten names below and
 * was not one of them.
 */
const RPC_BACKED = new Set([
  'clear_cell_dependency',
  'delete_cell',
  'delete_path',
  'delete_scenario',
  'remove_lane',
  'remove_lanes',
  'remove_step',
  'rename_path',
  'rename_phase',
  'rename_scenario',
  // The rename has to move the registry row and every bearing cell's text in
  // one transaction, so it is a function, and its inverse is that same
  // function pointed back at the previous name.
  'rename_touchpoint',
  // The whole-entry edit is the same shape: one function, and its inverse is
  // that function fed the previous values it returned.
  'update_touchpoint',
  // The header toggle's write, self-inverse with the previous layout, so
  // the default branch calls it back as is.
  'update_scenario_layout',
  // The inverse of featuring a resource writes the captured {id, featured}
  // pairs back, and is a function reached through the default branch.
  // (`set_featured_resource` itself is never a revert target — its inverse
  // is this one — so it is not listed here.)
  'restore_featured_resources',
  // A placement's identity and its removal are both one function with a
  // returned inverse; the inverse of each is itself an RPC.
  'set_placement_touchpoint',
  'restore_placement',
  // Editing a connection where it sits is one function, and its inverse is
  // that same function pointed at the row it returned, keyed on the row's own
  // id — so the default branch calls it back as is.
  'update_cell_dependency',
  // Setting a cell's featured image writes its frame and returns the frame
  // as it stood; the inverse is the same function fed that value.
  'set_cell_featured_image',
  // The inverse of the half of `set_cell_dependency` that UPDATED: the two
  // prose columns, on one row, by id. It exists only to be an undo, like the
  // two names above it, and is reached through the default branch.
  'restore_cell_dependency',
  // And the same for the half of `upsert_cell` that UPDATED: the one column
  // that half writes, on one cell, by id.
  'restore_cell_content',
])

/** `fn: 'name'` inside a recorded RevertSpec. */
const RECORDED_FN = /\bfn:\s*'([a-z_]+)'/g

/** `case 'name':` in executeRevert's switch. */
const HANDLED_FN = /\bcase\s+'([a-z_]+)':/g

const matchAll = (source: string, pattern: RegExp): string[] => {
  const found = new Set<string>()
  for (const match of source.matchAll(pattern)) found.add(match[1])
  return [...found].sort()
}

const recordedFns = (): string[] => {
  const found = new Set<string>()
  for (const file of MUTATION_MODULES) {
    let source: string
    try {
      source = readLib(file)
    } catch {
      // A module in the list that no longer exists is itself the failure —
      // silently skipping it would shrink the audit to nothing over time.
      throw new Error(
        `${file} is listed as a mutation module but could not be read. ` +
          'If it was renamed, update MUTATION_MODULES.',
      )
    }
    for (const fn of matchAll(source, RECORDED_FN)) found.add(fn)
  }
  return [...found].sort()
}

describe('revert coverage', () => {
  it('watches a non-empty set of mutation modules', () => {
    expect(MUTATION_MODULES.length).toBeGreaterThan(0)
    expect(recordedFns().length).toBeGreaterThan(0)
  })

  it('handles every recorded revert that is not a real RPC', () => {
    const handled = new Set(matchAll(readLib('revertChange.ts'), HANDLED_FN))
    const stranded = recordedFns().filter(
      (fn) => !handled.has(fn) && !RPC_BACKED.has(fn),
    )

    // An unhandled name does not crash at the switch — it reaches the default
    // branch and is called as `client.rpc(fn, args)`. If no such function
    // exists, the undo fails with a PostgREST 404, and it fails at the moment
    // a person presses "take back", not at build time.
    expect(
      stranded,
      `Recorded by a mutation, handled by neither an executeRevert case nor a ` +
        `real Postgres function. These will 404 when reverted: ` +
        `${stranded.join(', ')}. Add a case to revertChange.ts, or add the name ` +
        `to RPC_BACKED if you just shipped it as an RPC.`,
    ).toEqual([])
  })

  it('does not claim an RPC that no mutation records any more', () => {
    // Keeps RPC_BACKED honest in the other direction: a stale entry would
    // silently excuse a future direct-table mutation that reused the name.
    const recorded = new Set(recordedFns())
    const orphans = [...RPC_BACKED].filter((fn) => !recorded.has(fn)).sort()
    expect(
      orphans,
      `RPC_BACKED lists names no mutation records any more: ${orphans.join(', ')}`,
    ).toEqual([])
  })

  it('records the service writes with the argument shape their revert reads', async () => {
    // Both service reverts are self-inverse: executeRevert hands the captured
    // args straight back to the same function. The payload therefore has to be
    // the shape that function's parameter takes. update_business_model
    // originally spread a camelCase BusinessModelUpdate flat into args, which
    // no consumer on either side could read.
    //
    // Asked of the WRITE rather than of its source. The shape used to be a
    // literal in `serviceSpecMutations.ts` and is now the `previousAs` of a
    // level's declaration, so a check reading either file for a string would
    // be pinned to how the payload is spelled rather than to what it is. The
    // run answers the same question and cannot be satisfied by a comment.
    clearSession()
    const db = inMemoryDatabase({
      services: [{ id: 'svc-1' }],
      business_models: [{ service_id: 'svc-1' }],
    })
    await updateServiceSummary(db.client, 'svc-1', 'The new sentence', 'The old sentence')
    await updateBusinessModel(
      db.client,
      'svc-1',
      { funding: 'Grant', pricing: '', deliveryCost: '', revenueModel: '', partners: '' },
      { funding: 'Fees', pricing: '', deliveryCost: '', revenueModel: '', partners: '' },
    )

    expect(sessionSnapshot().map((entry) => entry.revert)).toEqual([
      {
        fn: 'update_service_summary',
        args: { service_id: 'svc-1', summary: 'The old sentence' },
      },
      {
        fn: 'update_business_model',
        args: {
          service_id: 'svc-1',
          update: { funding: 'Fees', pricing: '', deliveryCost: '', revenueModel: '', partners: '' },
        },
      },
    ])
  })
})

/**
 * The one operation whose inverse cannot be derived from its name.
 *
 * Everything above is a fact about the SOURCE — which names are recorded and
 * which are handled. These are facts about a RUN, and they belong here rather
 * than in a file of their own for the reason this file exists at all: the
 * question "does this write carry an inverse that works" already has a seam,
 * and a second one beside it can only ever disagree with it.
 *
 * `set_cell_dependency` upserts. The insert half's inverse is a delete and the
 * update half's is a restore, and the two are indistinguishable from the
 * operation's name — which is what the ledger derived from until the write
 * started reporting which half it took.
 */
describe('an upsert’s inverse follows what it did, not what it is called', () => {
  const written = (outcome: CellDependencyWrite) => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { data: fn === 'set_cell_dependency' ? outcome : null, error: null }
      },
    } as unknown as SupabaseClient<Database>
    return { client, calls }
  }

  /** The row the author already had, as `set_cell_dependency` hands it back. */
  const AN_EDGE: CellDependencyRow = {
    id: 'dep-1',
    source_cell_id: 'cell-a',
    target_cell_id: 'cell-b',
    kind: 'leads_to',
    name: null,
    note: null,
  }

  beforeEach(() => {
    clearSession()
  })

  it('reverts an upsert that INSERTED by deleting the row it created', async () => {
    const { client } = written({ id: AN_EDGE.id, inserted: true, previous: null })
    await setCellDependency(client, {
      sourceCellId: 'cell-a',
      targetCellId: 'cell-b',
      note: 'the sentence the agent wrote',
    })

    const [entry] = sessionSnapshot()
    expect(entry.fn).toBe('set_cell_dependency')
    expect(entry.revert).toEqual({
      fn: 'clear_cell_dependency',
      args: { dependency_id: 'dep-1' },
    })
  })

  it('reverts an upsert that UPDATED to the previous values, not by deleting', async () => {
    const { client } = written({
      id: AN_EDGE.id,
      inserted: false,
      previous: AN_EDGE,
    })
    await setCellDependency(client, {
      sourceCellId: 'cell-a',
      targetCellId: 'cell-b',
      note: 'the sentence the agent wrote',
    })

    const [entry] = sessionSnapshot()
    // The whole defect in one assertion: this used to be a delete.
    expect(entry.revert?.fn).not.toBe('clear_cell_dependency')
    expect(entry.revert).toEqual({
      fn: 'restore_cell_dependency',
      args: { dependency_id: 'dep-1', name: null, note: null },
    })
  })

  it('leaves an edge that existed before an agent run standing after the undo', async () => {
    const { client, calls } = written({
      id: AN_EDGE.id,
      inserted: false,
      previous: { ...AN_EDGE, note: 'what the author wrote' },
    })
    await setCellDependency(client, {
      sourceCellId: 'cell-a',
      targetCellId: 'cell-b',
      note: 'what the agent wrote over it',
    })

    const [entry] = sessionSnapshot()
    await executeRevert(client, entry)

    // Nothing in the undo removes the row, and what it does write is the
    // author's sentence, addressed by the row's own id.
    expect(calls.map((call) => call.fn)).toEqual([
      'set_cell_dependency',
      'restore_cell_dependency',
    ])
    expect(calls[1].args).toEqual({
      dependency_id: 'dep-1',
      name: null,
      note: 'what the author wrote',
    })
  })

  it('offers no undo for an update whose before-state did not come back', async () => {
    // The narrow race the function reports honestly: another session inserted
    // the edge between the capture and the upsert, so this call updated a row
    // it never saw. No inverse is the right answer, and the ledger already
    // knows how to show one — a row with no revert control, as a delete has.
    const { client } = written({ id: AN_EDGE.id, inserted: false, previous: null })
    await setCellDependency(client, {
      sourceCellId: 'cell-a',
      targetCellId: 'cell-b',
      note: 'the sentence the agent wrote',
    })

    const [entry] = sessionSnapshot()
    expect(entry.revert).toBeUndefined()
  })
})

/**
 * The other one, and the reason it is here despite nothing reaching it.
 *
 * `upsert_cell` upserts onto a square of the grid. Both callers establish the
 * square is empty first — the panel has no cell id, the agent tool reads the
 * slot and refuses — so the update half is not reachable through the app as it
 * stands, and these are not a regression test for a bug anybody has seen.
 *
 * They are a test for the reason nobody has: two callers remembering. The
 * agent tool's read is a read followed by a write, which holds nothing between
 * them, and the rule is carried per caller rather than by the operation. What
 * the assertions below pin is that the LEDGER no longer depends on either —
 * the inverse follows the write's own account of which half it took, so a
 * third caller, or the race the guard cannot close, cannot produce an undo
 * that deletes a cell somebody already had.
 */
describe('a cell upsert’s inverse follows what it did, not what it is called', () => {
  const written = (outcome: CellWrite) => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { data: fn === 'upsert_cell' ? outcome : null, error: null }
      },
    } as unknown as SupabaseClient<Database>
    return { client, calls }
  }

  const AT = {
    pathId: 'path-1',
    laneId: 'lane-1',
    stepId: 'step-1',
    content: 'what the agent wrote',
  }

  beforeEach(() => {
    clearSession()
  })

  it('reverts an upsert that INSERTED by deleting the cell it created', async () => {
    const { client } = written({ id: 'cell-1', inserted: true, previous: null })
    await upsertCell(client, AT)

    const [entry] = sessionSnapshot()
    expect(entry.fn).toBe('upsert_cell')
    expect(entry.revert).toEqual({ fn: 'delete_cell', args: { cell_id: 'cell-1' } })
  })

  it('reverts an upsert that UPDATED to the previous text, not by deleting', async () => {
    const { client } = written({
      id: 'cell-1',
      inserted: false,
      previous: { id: 'cell-1', content: 'what the author wrote' },
    })
    await upsertCell(client, AT)

    const [entry] = sessionSnapshot()
    // The whole defect in one assertion: this used to be a delete, and the
    // cell it deleted carried a summary, a Function and an owner pair this
    // write never touched.
    expect(entry.revert?.fn).not.toBe('delete_cell')
    expect(entry.revert).toEqual({
      fn: 'restore_cell_content',
      args: { cell_id: 'cell-1', content: 'what the author wrote' },
    })
  })

  it('puts an emptied cell back to empty rather than treating blank as silence', async () => {
    // The state a coalescing inverse could not express. `cells.content` is
    // `not null default ''`, and the panel creates a cell from a draft with
    // `form.content.trim()` — so a blank square an agent writes onto is the
    // ordinary case, not the corner.
    const { client, calls } = written({
      id: 'cell-1',
      inserted: false,
      previous: { id: 'cell-1', content: '' },
    })
    await upsertCell(client, AT)

    const [entry] = sessionSnapshot()
    await executeRevert(client, entry)

    expect(calls.map((call) => call.fn)).toEqual(['upsert_cell', 'restore_cell_content'])
    expect(calls[1].args).toEqual({ cell_id: 'cell-1', content: '' })
  })

  it('offers no undo for an update whose before-state did not come back', async () => {
    const { client } = written({ id: 'cell-1', inserted: false, previous: null })
    await upsertCell(client, AT)

    const [entry] = sessionSnapshot()
    expect(entry.revert).toBeUndefined()
  })
})

/**
 * An edit in place is undone by itself, pointed at the row it returned.
 *
 * `update_cell_dependency` changes one row's kind, target and note and hands
 * back the row as it stood. The inverse is the same function fed those values,
 * keyed on the row's own id — so an edit that moved the target is undone on the
 * row that moved, not on whatever joins the new pair by the time undo runs.
 */
describe('an edit in place is undone by itself, keyed on the row', () => {
  const edited = (before: CellDependencyBefore | null) => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { data: fn === 'update_cell_dependency' ? before : null, error: null }
      },
    } as unknown as SupabaseClient<Database>
    return { client, calls }
  }

  const AS_IT_STOOD: CellDependencyBefore = {
    id: 'dep-1',
    source_cell_id: 'cell-a',
    target_cell_id: 'cell-b',
    kind: 'leads_to',
    note: 'what the author wrote',
  }

  /** Kind, target and note all move, so an inverse that missed one shows. */
  const THE_EDIT = {
    dependencyId: 'dep-1',
    kind: 'enables' as const,
    targetCellId: 'cell-c',
    note: null,
  }

  beforeEach(() => {
    clearSession()
  })

  it('records the row as it stood as the inverse', async () => {
    const { client } = edited(AS_IT_STOOD)
    await updateCellDependency(client, THE_EDIT)

    const [entry] = sessionSnapshot()
    expect(entry.fn).toBe('update_cell_dependency')
    expect(entry.revert).toEqual({
      fn: 'update_cell_dependency',
      args: {
        dependency_id: 'dep-1',
        kind: 'leads_to',
        target_cell_id: 'cell-b',
        note: 'what the author wrote',
      },
    })
  })

  it('puts the edge back where it started when the undo runs', async () => {
    const { client, calls } = edited(AS_IT_STOOD)
    await updateCellDependency(client, THE_EDIT)

    const [entry] = sessionSnapshot()
    await executeRevert(client, entry)

    expect(calls.map((call) => call.fn)).toEqual([
      'update_cell_dependency',
      'update_cell_dependency',
    ])
    expect(calls[1].args).toEqual({
      dependency_id: 'dep-1',
      kind: 'leads_to',
      target_cell_id: 'cell-b',
      note: 'what the author wrote',
    })
  })

  it('offers no undo when the row as it stood did not come back', async () => {
    const { client } = edited(null)
    await updateCellDependency(client, THE_EDIT)

    const [entry] = sessionSnapshot()
    expect(entry.revert).toBeUndefined()
  })
})

/**
 * Setting a featured image is undone by itself, fed the frame as it stood.
 */
describe('a featured image is undone by itself, keyed on the cell', () => {
  const written = (before: CellFeaturedImageBefore | null) => {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { data: before, error: null }
      },
    } as unknown as SupabaseClient<Database>
    return { client, calls }
  }

  beforeEach(() => {
    clearSession()
  })

  it('records the frame as it stood as the inverse, and the undo sends it back', async () => {
    const { client, calls } = written({ cell_id: 'cell-1', frame: '/storyboards/one.png' })
    await setCellFeaturedImage(client, { cellId: 'cell-1', imageUrl: '/touchpoint-logos/example-logo.png' })

    const [entry] = sessionSnapshot()
    expect(entry.fn).toBe('set_cell_featured_image')
    expect(entry.revert).toEqual({
      fn: 'set_cell_featured_image',
      args: { cell_id: 'cell-1', image_url: '/storyboards/one.png' },
    })

    await executeRevert(client, entry)
    expect(calls[1]).toEqual({
      fn: 'set_cell_featured_image',
      args: { cell_id: 'cell-1', image_url: '/storyboards/one.png' },
    })
  })

  it('an empty frame as it stood is undone by clearing', async () => {
    const { client } = written({ cell_id: 'cell-1', frame: null })
    await setCellFeaturedImage(client, { cellId: 'cell-1', imageUrl: 'https://x.example/a.png' })
    expect(sessionSnapshot()[0]!.revert).toEqual({
      fn: 'set_cell_featured_image',
      args: { cell_id: 'cell-1', image_url: null },
    })
  })

  it('offers no undo when the frame as it stood did not come back', async () => {
    const { client } = written(null)
    await setCellFeaturedImage(client, { cellId: 'cell-1', imageUrl: 'https://x.example/a.png' })
    expect(sessionSnapshot()[0]!.revert).toBeUndefined()
  })
})
