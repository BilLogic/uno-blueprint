// @vitest-environment jsdom
/**
 * THE CELL-EDIT-WITH-REVERT SLICE.
 *
 * One flow, end to end, through the real code at every layer but the wire:
 * a person edits a cell from the panel, saves, takes the change back from
 * the ledger, and the row reads back as it was. The panel is the real
 * `CellPanelEditor` over the real cell-detail provider; the save is the
 * real `saveCell` over the real content and spec mutations; the ledger is
 * the real `SessionChangesSheet` over the real session store; the revert is
 * the real `executeRevert`. What is fake is the database — an in-memory
 * `cells` table behind the calls these modules make — and two leaf reads the
 * panel makes of it (the value audiences and the registry touchpoints), so a
 * wrong read-back fails here rather than in a browser.
 *
 * This is the fallback the cell-edit slice ticket named, and the reason is
 * recorded where the hold it lifts is (the large-component-splits decision).
 * The fake is honest about what it cannot see: a grant or a policy.
 * `check:seed-load` asks the real database those questions, as the author,
 * for every column this slice writes.
 *
 * TWO BACKENDS, ONE FLOW. The primary form is the same flow over a REAL
 * database: standalone PostgREST on the stack `check:seed-load` builds,
 * reached through `supabase-js` as a signed-in author carrying the service
 * claim (`src/test/postgrestDatabase.ts`; `scripts/run-slice-over-postgrest.mjs`
 * stands it up and runs this file with the two variables set). There the row
 * is one the seed already holds, the compared columns are the ones the panel
 * writes, and a grant or a policy the recipe forgot fails the save. The
 * in-memory form stays as the fast local one, and the two cases that are
 * about the fake — the RPC log, and the dropped-column proof — run only there;
 * over PostgREST the proof is the runner's, which revokes a grant and
 * requires this file to go red.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryDatabase, type InMemoryDatabase, type Row } from '@/test/inMemoryDatabase'
import { overPostgrest, postgrestClient } from '@/test/postgrestDatabase'

/**
 * The columns this flow reads back, column for column. The panel writes the
 * content half and the spec half of a cell; the ids and position are read so a
 * write that landed on the wrong row is caught. `updated_at` and the rest are
 * the database's business and move on every save, so they are not compared.
 */
const COMPARED = [
  'id',
  'lane_id',
  'step_id',
  'position',
  'content',
  'summary',
  'owner',
  'perceived_owner',
  'status',
  'function',
  'form',
  'value_props',
  'frame',
] as const

/** The in-memory row before anyone edits: every column set, so a revert that restores four of five fields is caught. */
const FIXTURE: Row = {
  id: 'cell-1',
  lane_id: 'lane-1',
  step_id: 'step-1',
  position: 0,
  content: 'Dispatcher confirms the address',
  summary: 'Books a crew',
  owner: 'Dispatch',
  perceived_owner: 'The installer',
  status: 'planned',
  function: 'Confirm the job',
  form: 'A phone call',
  value_props: [{ for: 'Customer', value: 'A booked slot' }],
  frame: null,
}

/**
 * The database behind this run: the in-memory table, or PostgREST. `memory`
 * is set only in the fast form, for the two cases that read the fake itself.
 */
const backend = vi.hoisted(() => ({
  current: null as null | { client: InMemoryDatabase['client']; memory: InMemoryDatabase | null },
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: backend.current!.client, configured: true, canWrite: true }),
}))
// Two leaf reads the panel makes that are not this flow's: the audiences
// the value-proposition datalist suggests, and the registry placements.
vi.mock('@/hooks/useValueAudiences', () => ({
  useValueAudiences: () => ({ status: 'ready', data: [] }),
}))
vi.mock('@/hooks/useRegistryTouchpoints', () => ({
  useRegistryTouchpoints: () => ({ status: 'ready', data: [] }),
  useNameOnlyPlacements: () => ({ status: 'ready', data: [] }),
  useTouchpointEntry: () => ({ status: 'loading' }),
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'
import { SessionChangesSheet } from '@/components/editor/SessionChangesSheet'
import { BlueprintCellDetailProvider } from '@/contexts/BlueprintCellDetailContext'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { normalizeBlueprint } from '@/lib/normalizeBlueprint'
import { queryClient } from '@/lib/queryClient'
import type { BlueprintData } from '@/types/blueprint'

/** The row under edit, as the database held it before this case: the fixture, or a row the seed holds. */
let original: Row = FIXTURE

/** The board the panel was opened from, normalized from the row's own ids the way the canvas read does. */
function boardFrom(row: Row): BlueprintData {
  return normalizeBlueprint({
    id: 'path-1',
    name: 'Happy path',
    kind: 'happy',
    lanes: [{ id: row.lane_id as string, name: 'Dispatch', position: 0 }],
    path_steps: [{ position: 0, steps: { id: row.step_id as string, name: 'Confirm' } }],
    cells: [row] as never,
  })
}

/**
 * What a read-back is asked for. The fast form reads every column, so a
 * stray write outside the panel's set fails it as it always did; over
 * PostgREST the compared columns are the panel's, because `updated_at` moves
 * on every save and is the database's business.
 */
const SELECTED = overPostgrest ? COMPARED.join(', ') : '*'

/** Only the compared columns of a row, in their order — what `toEqual` is asked about over PostgREST. */
function compared(row: Row): Row {
  return overPostgrest ? Object.fromEntries(COMPARED.map((column) => [column, row[column]])) : row
}

/**
 * The row this case edits. Over PostgREST it is the first cell the seed holds,
 * read through the same client the flow writes with, so the case starts from
 * what the database says rather than from a fixture the database never saw.
 */
async function pickRow(): Promise<Row> {
  if (!overPostgrest) return FIXTURE
  const { data, error } = await backend.current!.client
    .from('cells')
    .select(SELECTED)
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('the seed holds no cell to edit')
  return compared(data as unknown as Row)
}

/** The panel over the real provider, the way the drawer mounts it. */
function renderPanel(onDone: () => void) {
  return render(
    <QueryClientProvider client={queryClient}>
      <BlueprintCellDetailProvider blueprints={[boardFrom(original)]}>
        <CellPanelEditor cellId={original.id as string} onDone={onDone} />
      </BlueprintCellDetailProvider>
    </QueryClientProvider>,
  )
}

/**
 * The control under a field's label. `Field` labels its control by position
 * rather than `for`, so there is no accessible name to ask for; the label's
 * text is the descriptor's, and the control is the first one under the same
 * field wrapper.
 */
function controlOf(label: string): HTMLTextAreaElement | HTMLInputElement {
  let node: HTMLElement | null = screen.getByText(label)
  while (node) {
    const control = node.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input')
    if (control) return control
    node = node.parentElement
  }
  throw new Error(`no control under the field labelled ${label}`)
}

/** The row as the database holds it now, through the same client the flow wrote with. */
async function readBack(): Promise<Row | null> {
  const { data, error } = await backend.current!.client
    .from('cells')
    .select(SELECTED)
    .eq('id', original.id as string)
    .maybeSingle()
  if (error) throw error
  return data ? compared(data as unknown as Row) : null
}

/** Edit the summary and the function from the panel, and save. */
async function editAndSave() {
  const onDone = vi.fn()
  renderPanel(onDone)
  fireEvent.change(controlOf('Summary'), { target: { value: 'Books a crew and confirms by text' } })
  fireEvent.change(controlOf('Function'), { target: { value: 'Confirm the job and the crew' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
}

/** The row after the save: the two edited columns, nothing else moved. */
const edited = (): Row => ({
  ...original,
  summary: 'Books a crew and confirms by text',
  function: 'Confirm the job and the crew',
})

/** The fast form's database, fresh per case; the PostgREST form's client, once. */
function useMemory(options: Parameters<typeof inMemoryDatabase>[1] = {}) {
  const memory = inMemoryDatabase({ cells: [FIXTURE] }, options)
  backend.current = { client: memory.client, memory }
  return memory
}

beforeEach(async () => {
  clearSession()
  queryClient.clear()
  if (overPostgrest) backend.current = { client: postgrestClient(), memory: null }
  else useMemory()
  original = await pickRow()
})

afterEach(() => {
  cleanup()
  clearSession()
})

describe('a cell is edited from the panel, saved, and reverted from the ledger', () => {
  it('writes both halves on save and reads back the original after both reverts', async () => {
    await editAndSave()

    // The database holds the edit — both columns, nothing else moved — and
    // the ledger holds one entry per write path, each with its inverse.
    expect(await readBack()).toEqual(edited())
    expect(sessionSnapshot().map((entry) => entry.fn)).toEqual(['update_cell_content', 'update_cell_spec'])
    expect(sessionSnapshot().every((entry) => entry.revert)).toBe(true)

    // Take both back from the ledger, the way a person does: open the
    // change sheet and press Revert on each row.
    render(<SessionChangesSheet />)
    fireEvent.click(screen.getByRole('button', { name: 'Review 2 changes' }))
    for (const remaining of [1, 0]) {
      const [revert] = screen.getAllByRole('button', { name: 'Revert this change' })
      fireEvent.click(revert!)
      await vi.waitFor(() => expect(sessionSnapshot()).toHaveLength(remaining))
    }

    // The row reads back as it was, column for column.
    expect(await readBack()).toEqual(original)
    // The content write synced the placements each time the text was
    // written: once on save, once on revert. Nothing else reached an RPC.
    // The fake keeps that log; PostgREST does not, and there the RPC's
    // grant is what the save itself proved.
    if (backend.current!.memory) {
      expect(backend.current!.memory.rpcs.map((call) => call.fn)).toEqual([
        'sync_cell_touchpoints',
        'sync_cell_touchpoints',
      ])
    }
  })

  // Over PostgREST the same proof is the runner's: it revokes a grant and
  // requires this file to fail. Here it is the fake's dropped column.
  it.runIf(!overPostgrest)('goes red on a wrong read-back: a column the database does not land', async () => {
    // The instrument, proved against a real shape of defect: a column the
    // grant forgot lands nothing, and the same read-back assertion the case
    // above makes after Save no longer holds.
    useMemory({ dropOnWrite: ['function'] })
    await editAndSave()
    const row = await readBack()
    expect(row).not.toEqual(edited())
    expect(row).toMatchObject({ summary: edited().summary, function: original.function })
  })
})
