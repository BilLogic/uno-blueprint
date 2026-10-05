import { test, expect } from 'vitest'
import {
  clearSession,
  describeChange,
  groupChanges,
  recordChange,
  sessionHasDestructive,
  sessionSnapshot,
  type ChangeEntry,
  type WriteFn,
} from '@/lib/authoringSession'

/**
 * The two guarantees `WriteFn` exists to make. Both are compile-time — this
 * file is type-checked by `npm run build` — so the runtime assertions below
 * exist only so a failure is reported by name rather than as a silent absence.
 */

/**
 * A read RPC's name may never be a member of `WriteFn`.
 *
 * The ledger used to hold a deny-list of these and silently drop anything
 * matching it. Silent dropping is the wrong shape of guard: it protects
 * against a read being recorded (harmless, cosmetic) by risking a write being
 * forgotten (data loss, invisible). The union inverts that — a read name at
 * the ledger's door is a type error at the call site instead.
 */
type ReadFn = 'deletion_impact' | 'cell_natural_key' | 'slices_referencing'
type ReadsThatAreWrites = Extract<WriteFn, ReadFn>
const NO_READ_IS_A_WRITE: ReadsThatAreWrites extends never ? true : false = true

test('no read RPC can be recorded as a change', () => {
  expect(NO_READ_IS_A_WRITE).toBe(true)
})

/**
 * Every `WriteFn` has a sentence. `describeChange` is a `Record<WriteFn, …>`,
 * so this cannot fail to compile — but it can fail at runtime if the record is
 * ever built dynamically, and the list below doubles as the readable inventory
 * of what the sheet can say.
 *
 * Keyed (`satisfies Record<WriteFn, true>`) rather than a `WriteFn[]`, because
 * an array of the union's members happily accepts a SHORT array: adding an
 * operation and forgetting to list it here left the new sentence untested and
 * the omission invisible. Keyed, the omission does not compile — the same
 * argument `DESCRIBERS` itself makes.
 */
const EVERY_WRITE = Object.keys({
  create_phase: true,
  create_scenario: true,
  create_path: true,
  duplicate_path: true,
  duplicate_scenario: true,
  rename_phase: true,
  rename_scenario: true,
  update_scenario_layout: true,
  rename_path: true,
  rename_owner_tag: true,
  add_step: true,
  add_lane: true,
  upsert_cell: true,
  update_cell_content: true,
  update_cell_resources: true,
  update_placement_resources: true,
  set_featured_resource: true,
  restore_featured_resources: true,
  set_placement_touchpoint: true,
  remove_placement: true,
  restore_placement: true,
  rename_touchpoint: true,
  update_touchpoint: true,
  update_touchpoint_placement: true,
  update_cell_spec: true,
  update_lane_spec: true,
  update_phase_spec: true,
  update_scenario_spec: true,
  update_service_summary: true,
  update_business_model: true,
  update_service_entity_examples: true,
  update_path_spec: true,
  update_step_spec: true,
  create_stakeholder: true,
  update_stakeholder: true,
  add_evidence: true,
  update_evidence: true,
  delete_evidence: true,
  set_cell_dependency: true,
  update_cell_dependency: true,
  set_cell_featured_image: true,
  clear_cell_dependency: true,
  reorder_steps: true,
  set_path_steps: true,
  reorder_lanes: true,
  delete_scenario: true,
  delete_path: true,
  remove_step: true,
  remove_lane: true,
  delete_cell: true,
  delete_slice: true,
  create_slice: true,
  duplicate_slice: true,
  update_slice_meta: true,
  replace_slides: true,
  update_slide_images: true,
  create_finding: true,
  update_finding: true,
} satisfies Record<WriteFn, true>) as WriteFn[]

test('every recordable operation reads as a sentence, not an identifier', () => {
  for (const fn of EVERY_WRITE) {
    const entry: ChangeEntry = { id: 'c1', fn, args: {}, at: 0 }
    const described = describeChange(entry)
    expect(described.length).toBeGreaterThan(0)
    // The old switch's `default` returned the lowercased function name, which
    // is what put "duplicate scenario" in the change list.
    expect(described).not.toBe(fn.replace(/_/g, ' '))
    // A sentence, so it starts like one.
    expect(described[0]).toBe(described[0].toUpperCase())
  }
})

/**
 * The two upserts say which half they took, and the sentence follows.
 *
 * Both `upsert_cell` and `set_cell_dependency` land on either an insert or an
 * update, and both learned to report which — that is what let `deriveRevert`
 * stop deducing an inverse from the operation's NAME. The sentence was left
 * behind: it still read "Added a cell" over a write that had edited one, which
 * is the same mistake in the one place a person actually sees it.
 *
 * The entry carries no report of its own, so the describers read the derived
 * inverse, which is where the report survives. That makes the absence of an
 * inverse meaningful too: an insert always derives one, so a missing inverse
 * is the update half whose before-state did not come back — an edit.
 */
const CELL_INSERT: ChangeEntry = {
  id: 'c1',
  fn: 'upsert_cell',
  args: {},
  at: 0,
  revert: { fn: 'delete_cell', args: { cell_id: 'cell-1' } },
}

const CELL_UPDATE: ChangeEntry = {
  id: 'c2',
  fn: 'upsert_cell',
  args: {},
  at: 0,
  revert: { fn: 'restore_cell_content', args: { cell_id: 'cell-1', content: 'was' } },
}

const EDGE_INSERT: ChangeEntry = {
  id: 'c3',
  fn: 'set_cell_dependency',
  args: {},
  at: 0,
  revert: { fn: 'clear_cell_dependency', args: { dependency_id: 'dep-1' } },
}

const EDGE_UPDATE: ChangeEntry = {
  id: 'c4',
  fn: 'set_cell_dependency',
  args: {},
  at: 0,
  revert: {
    fn: 'restore_cell_dependency',
    args: { dependency_id: 'dep-1', name: null, note: 'was' },
  },
}

test('an upsert that inserted reads as a create', () => {
  expect(describeChange(CELL_INSERT)).toBe('Added a cell')
  expect(describeChange(EDGE_INSERT)).toBe('Connected two cells')
})

test('an upsert that updated does not read as a create', () => {
  expect(describeChange(CELL_UPDATE)).toBe('Edited a cell’s text')
  expect(describeChange(EDGE_UPDATE)).toBe('Edited a connection')
})

test('an update with no recoverable before-state still reads as an edit', () => {
  // No inverse is how the ledger says the prior state did not come back. Only
  // the update half can be in that state, so the sentence must not fall back
  // to the create — the fallback is the defect, not the safe default.
  const entry: ChangeEntry = { id: 'c5', fn: 'upsert_cell', args: {}, at: 0 }
  expect(describeChange(entry)).toBe('Edited a cell’s text')
  const edge: ChangeEntry = { id: 'c6', fn: 'set_cell_dependency', args: {}, at: 0 }
  expect(describeChange(edge)).toBe('Edited a connection')
})

/*
 * The session change log itself.
 *
 * The list is what makes "discard all changes" trustworthy, so what is pinned
 * here is that it never lies: it describes what was done rather than which
 * table moved, it groups changes that would otherwise be indistinguishable,
 * and it knows which of them destroy something.
 */

/** A hand-built entry. `fn` is loose so an operation outside the union can be asked about. */
const entry = (fn: string, args: Record<string, unknown> = {}): ChangeEntry => ({
  id: 'x',
  fn: fn as WriteFn,
  args,
  at: 0,
})

test('a change is only logged once it has been recorded', () => {
  clearSession()
  expect(sessionSnapshot()).toHaveLength(0)
  recordChange('add_step', { path_id: 'p1', name: 'Greet' })
  expect(sessionSnapshot()).toHaveLength(1)
  clearSession()
  expect(sessionSnapshot()).toHaveLength(0)
})

test('saving clears the list without touching anything else', () => {
  clearSession()
  recordChange('add_step', { path_id: 'p1' })
  recordChange('add_lane', { scenario_id: 's1' })
  expect(sessionSnapshot()).toHaveLength(2)
  clearSession()
  expect(sessionSnapshot()).toEqual([])
})

test('the snapshot is a new array per change, so subscribers re-render', () => {
  clearSession()
  const before = sessionSnapshot()
  recordChange('add_step', {})
  expect(sessionSnapshot()).not.toBe(before)
  clearSession()
})

test('changes are named by what was done, never by table', () => {
  expect(describeChange(entry('add_step', { name: 'Greet' }))).toBe('Added step “Greet”')
  expect(describeChange(entry('add_step'))).toBe('Added a step')
  expect(describeChange(entry('remove_lane'))).toBe('Deleted a lane')
})

test('an unknown operation still appears rather than vanishing', () => {
  // Silence would be the one failure the sheet exists to prevent: a change
  // that happened and is not listed.
  expect(describeChange(entry('some_new_rpc'))).toBe('some new rpc')
})

test('a duplicate names the copy it made', () => {
  // `duplicate_scenario` once shipped with no case and fell to the old
  // switch's default, so the sheet listed the raw function name — which reads
  // plausibly enough that nobody caught it. The sentence is pinned here with
  // its sibling.
  expect(describeChange(entry('duplicate_scenario', { name: 'Intake (copy)' }))).toBe(
    'Duplicated a blueprint as “Intake (copy)”',
  )
  expect(describeChange(entry('duplicate_path', { name: 'Happy Path (copy)' }))).toBe(
    'Duplicated a path as “Happy Path (copy)”',
  )
})

test('a duplicated blueprint groups with the blueprint it copied', () => {
  // duplicate_scenario's args carry `source_scenario_id` and nothing else the
  // grouper knew about, so the row landed in the no-path bucket — away from
  // every other change to the same blueprint.
  const groups = groupChanges([
    entry('add_lane', { scenario_id: 's1' }),
    entry('duplicate_scenario', { source_scenario_id: 's1', name: 'Copy' }),
  ])
  expect(groups).toHaveLength(1)
  expect(groups[0].pathId).toBe('s1')
})

test('a blank name is not quoted as an empty string', () => {
  expect(describeChange(entry('add_lane', { name: '   ' }))).toBe('Added lane')
})

test('changes group by the path they touched', () => {
  const groups = groupChanges([
    entry('add_step', { path_id: 'p1' }),
    entry('upsert_cell', { path_id: 'p2' }),
    entry('add_step', { path_id: 'p1' }),
  ])
  expect(groups).toHaveLength(2)
  expect(groups[0].pathId).toBe('p1')
  expect(groups[0].entries).toHaveLength(2)
  expect(groups[1].pathId).toBe('p2')
})

test('changes with no path fall into their own bucket, not a wrong one', () => {
  const groups = groupChanges([
    entry('create_phase', { lifecycle_id: 'l1' }),
    entry('add_step', { path_id: 'p1' }),
  ])
  expect(groups[0].pathId).toBeNull()
  expect(groups[1].pathId).toBe('p1')
})

test('grouping preserves the order changes were made in', () => {
  const groups = groupChanges([
    entry('add_step', { path_id: 'p1', name: 'first' }),
    entry('add_step', { path_id: 'p1', name: 'second' }),
  ])
  expect(groups[0].entries.map((e) => e.args.name)).toEqual(['first', 'second'])
})

test('a destructive session is flagged, an additive one is not', () => {
  expect(sessionHasDestructive([entry('add_step'), entry('upsert_cell')])).toBe(false)
  expect(sessionHasDestructive([entry('add_step'), entry('remove_lane')])).toBe(true)
})

test('a slice delete is named and counts as destructive', () => {
  expect(
    describeChange(entry('delete_slice', { slice_id: 's1', title: 'Customer journey' })),
  ).toBe('Deleted slice “Customer journey”')
  expect(describeChange(entry('delete_slice', { slice_id: 's1', title: null }))).toBe(
    'Deleted a slice',
  )
  expect(sessionHasDestructive([entry('delete_slice')])).toBe(true)
})
