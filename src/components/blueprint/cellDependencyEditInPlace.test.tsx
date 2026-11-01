// @vitest-environment jsdom
/**
 * A connection is edited where it sits, inside the group it already sits in.
 *
 * The Dependencies tab groups a cell's connections by direction — Follows,
 * Leads to, Enabled by, Enables — and edit mode keeps that grouping rather
 * than replacing it with a list of its own. These are the things that
 * arrangement has to keep true.
 *
 *   1. A CELL EDITS ONLY THE CONNECTIONS IT IS THE SOURCE OF. An arriving row
 *      belongs to the cell at the other end. It gets no fields — a select on
 *      it would be a control that cannot do what it looks like it does — and
 *      one pencil, which opens the cell that owns it.
 *   2. THE FIELDS RENDER IN THE ROW'S OWN GROUP. An outgoing `leads_to` is
 *      edited under Leads to and an outgoing `enables` under Enables, and the
 *      two ends of `enables` stay two groups rather than folding into one.
 *   3. FAILURE IS LOCAL. A row that could not save says so under itself. At
 *      the top of the tab the message would be as far from the row as the
 *      panel allows, and would make seven rows look broken because one is.
 *   4. THE NOTE TRAVELS WITH THE KIND. `update_cell_dependency` takes all
 *      three or none, so a kind change carries the sentence along; a write
 *      that dropped it would erase an author's words as a side effect of
 *      changing a select.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BlueprintCellConnection } from '@/lib/blueprintCellConnections'

/*
  The write path, stubbed at the module boundary rather than under a fake
  Supabase client: what these tests are about is which call the row makes and
  with what, and a fake client would answer that through a second layer of
  guesswork about PostgREST.

  The arguments are typed, not `any`, because the second one is the assertion
  in the first test — an untyped mock would let a renamed field pass.
*/
type UpdateInput = {
  dependencyId: string
  kind: string
  targetCellId: string
  note: string | null
}

const rpc = vi.hoisted(() => ({
  update: vi.fn(async (_client: unknown, _input: UpdateInput) => ({})),
  clear: vi.fn(async (_client: unknown, _dependencyId: string) => undefined),
  set: vi.fn(async (_client: unknown, _input: unknown) => ({})),
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
vi.mock('@/lib/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authoringRpc')>()),
  updateCellDependency: rpc.update,
  clearCellDependency: rpc.clear,
  setCellDependency: rpc.set,
}))

import { CellDependencyEditor } from '@/components/blueprint/CellDependencyEditor'
import { CellDependencySections } from '@/components/blueprint/CellDependencySections'
import { TooltipProvider } from '@/components/ui/tooltip'

const SOURCE = { cellId: 'cell-source', label: 'Customer · Step 1' }
const TARGET = { cellId: 'cell-target', label: 'Backstage · Step 2' }
const OTHER = { cellId: 'cell-other', label: 'Backstage · Step 3' }

const NOTE = 'the sentence this edge arrived with'

const connection = (patch: Partial<BlueprintCellConnection> = {}): BlueprintCellConnection => ({
  dependencyId: 'dep-1',
  cellId: TARGET.cellId,
  laneName: 'Backstage',
  laneRowPosition: 2,
  stepName: 'Confirm',
  stepIndex: 1,
  kind: 'connection',
  linkKind: 'leads_to',
  linkNote: NOTE,
  isTech: false,
  techItems: [],
  contentPreview: 'Confirms the booking',
  ...patch,
})

const editing = (onEditFromOwner: (cellId: string) => void = () => {}) => ({
  source: SOURCE,
  candidates: [SOURCE, TARGET, OTHER],
  existing: [
    {
      id: 'dep-1',
      targetCellId: TARGET.cellId,
      targetLabel: TARGET.label,
      kind: 'leads_to',
      note: NOTE,
    },
  ],
  onEditFromOwner,
})

function draw({
  outgoing = [] as BlueprintCellConnection[],
  incoming = [] as BlueprintCellConnection[],
  otherTech = [] as { id: string; cellId: string; item: string }[],
  onEditFromOwner = (() => {}) as (cellId: string) => void,
  edit = true,
} = {}) {
  return render(
    <TooltipProvider>
      <CellDependencySections
        connections={{ incoming, outgoing }}
        otherTech={otherTech}
        editing={edit ? editing(onEditFromOwner) : null}
        onCellSelect={() => {}}
        onTechSelect={() => {}}
      />
    </TooltipProvider>,
  )
}

/** A group by its heading, as the panel draws it. */
const group = (container: HTMLElement, title: string) => {
  const found = container.querySelector<HTMLElement>(
    `[data-dependency-group="${title}"]`,
  )
  if (!found) throw new Error(`no "${title}" group is drawn`)
  return found
}

/*
  Driving `OptionSelect`, which is not a native `<select>` — it is Base UI's
  combobox, so `fireEvent.change` reaches nothing. A real mouse pick has to
  START on the item, because Base UI ignores a click whose pointer never went
  down there.
*/
const kindTrigger = () => screen.getByLabelText(/Connection kind for/)
const open = (element: HTMLElement) => fireEvent.mouseDown(element, { button: 0 })
function choose(name: string) {
  const option = screen.getByRole('option', { name })
  fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 })
  fireEvent.click(option)
}
async function pickKind(label: string) {
  open(kindTrigger())
  await waitFor(() => expect(screen.queryAllByRole('option')).not.toHaveLength(0))
  choose(label)
}

afterEach(() => {
  cleanup()
  rpc.update.mockReset()
  rpc.update.mockImplementation(async () => ({}))
  rpc.clear.mockReset()
})

describe('the row this cell owns', () => {
  it('is the fields for that row, under the group it already sits in', () => {
    const { container } = draw({ outgoing: [connection()] })
    const leadsTo = group(container, 'Leads to')
    expect(leadsTo.querySelector('[data-dependency-row="dep-1"]')).not.toBeNull()
    expect(within(leadsTo).getByLabelText(/Connection kind for/)).not.toBeNull()
    expect(within(leadsTo).getByLabelText(/Connects to/)).not.toBeNull()
  })

  it('is edited under Enables when it is an enables edge', () => {
    const { container } = draw({ outgoing: [connection({ linkKind: 'enables' })] })
    const enables = group(container, 'Enables')
    expect(enables.querySelector('[data-dependency-row="dep-1"]')).not.toBeNull()
    expect(container.querySelector('[data-dependency-group="Leads to"] [data-dependency-row="dep-1"]')).toBeNull()
  })

  it('carries its note on a kind change', async () => {
    draw({ outgoing: [connection()] })
    await pickKind('Enables')
    await waitFor(() => expect(rpc.update).toHaveBeenCalledTimes(1))
    expect(rpc.update.mock.calls[0]?.[1]).toEqual({
      dependencyId: 'dep-1',
      kind: 'enables',
      targetCellId: TARGET.cellId,
      // Not dropped, and not re-sent as null: a kind change is not an
      // instruction to erase what somebody wrote about the edge.
      note: NOTE,
    })
  })

  it('saves the note when its field loses focus, and only when it changed', async () => {
    draw({ outgoing: [connection()] })
    // The note field opens for the row that is being worked on, one at a time.
    fireEvent.focus(kindTrigger())
    const field = await screen.findByRole('textbox')
    fireEvent.blur(field)
    expect(rpc.update).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'what the author wrote instead' } })
    fireEvent.blur(field)
    await waitFor(() => expect(rpc.update).toHaveBeenCalledTimes(1))
    expect(rpc.update.mock.calls[0]?.[1]).toEqual({
      dependencyId: 'dep-1',
      kind: 'leads_to',
      targetCellId: TARGET.cellId,
      note: 'what the author wrote instead',
    })
  })

  it('says what went wrong under itself, never at the top of the tab', async () => {
    rpc.update.mockRejectedValueOnce(new Error('That connection already exists'))
    const { container } = draw({ outgoing: [connection()] })
    await pickKind('Enables')
    const message = await screen.findByText(/That connection already exists/)
    // Inside the row's own `<li>`, which is the assertion — a message rendered
    // above the list would satisfy `findByText` just as happily.
    const row = container.querySelector('[data-dependency-row="dep-1"]')
    expect(row).not.toBeNull()
    expect(row?.contains(message)).toBe(true)
    expect(container.querySelectorAll('[data-dependency-row-error]')).toHaveLength(1)
  })

  it('is removed from the row itself', async () => {
    draw({ outgoing: [connection()] })
    fireEvent.click(screen.getByLabelText(`Remove the connection to ${TARGET.label}`))
    await waitFor(() => expect(rpc.clear).toHaveBeenCalledWith({}, 'dep-1'))
  })
})

describe('the row the other cell owns', () => {
  it('renders no field and exactly one pencil, under Follows', () => {
    const { container } = draw({ incoming: [connection({ dependencyId: 'dep-in' })] })
    const follows = group(container, 'Follows')
    // No select, no input: an arriving edge is edited from the cell it
    // leaves, and a control here would be a promise this panel cannot keep.
    // Asked of `select-trigger` and `combobox` rather than of `<select>`,
    // because `OptionSelect` is not a native one.
    expect(container.querySelectorAll('[data-slot="select-trigger"]')).toHaveLength(0)
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(container.querySelectorAll('input')).toHaveLength(0)
    expect(within(follows).getAllByLabelText(/^Edit in /)).toHaveLength(1)
  })

  it('carries its pencil under Enabled by, and the pencil opens the owner', () => {
    const onEditFromOwner = vi.fn()
    const { container } = draw({
      incoming: [connection({ dependencyId: 'dep-in', linkKind: 'enables' })],
      onEditFromOwner,
    })
    const enabledBy = group(container, 'Enabled by')
    fireEvent.click(within(enabledBy).getByLabelText(/^Edit in /))
    expect(onEditFromOwner).toHaveBeenCalledWith(TARGET.cellId)
  })
})

describe('the groups', () => {
  it('keep the two ends of enables apart', () => {
    // One group for both ends read "Enables › A" at the target, i.e. as this
    // cell enabling A — the inversion the split by direction ended.
    const { container } = draw({
      incoming: [connection({ dependencyId: 'dep-in', linkKind: 'enables', cellId: OTHER.cellId })],
      outgoing: [connection({ linkKind: 'enables' })],
    })
    expect(group(container, 'Enabled by').querySelector('[data-dependency-row="dep-in"]')).toBeNull()
    expect(within(group(container, 'Enabled by')).getAllByLabelText(/^Edit in /)).toHaveLength(1)
    expect(group(container, 'Enables').querySelector('[data-dependency-row="dep-1"]')).not.toBeNull()
  })

  it('name the last group for every touchpoint on the step, not only technology', () => {
    const { container } = draw({
      edit: false,
      otherTech: [{ id: `${OTHER.cellId}:Email`, cellId: OTHER.cellId, item: 'Email' }],
    })
    expect(group(container, 'Also on this step')).not.toBeNull()
    expect(screen.queryByText('Tech in this step')).toBeNull()
  })

  it('in read mode, are the list they always were', () => {
    const { container } = draw({
      edit: false,
      incoming: [connection({ dependencyId: 'dep-in' })],
      outgoing: [connection()],
    })
    expect(container.querySelectorAll('[data-dependency-row]')).toHaveLength(0)
    expect(screen.queryAllByLabelText(/^Edit in /)).toHaveLength(0)
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })
})

describe('the add form', () => {
  it('does not list again the connections the rows already show', () => {
    render(
      <CellDependencyEditor
        source={SOURCE}
        candidates={[SOURCE, TARGET, OTHER]}
        existing={editing().existing}
        onDone={() => {}}
      />,
    )
    // Each row carries its own remove now; a second list of the same edges
    // under the form would be the same connection twice.
    expect(screen.queryByLabelText(/^Remove connection to/)).toBeNull()
    expect(screen.queryByText(TARGET.label, { selector: 'li span' })).toBeNull()
  })
})
