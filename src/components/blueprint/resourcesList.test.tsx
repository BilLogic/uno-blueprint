// @vitest-environment jsdom
/**
 * One list, grouped by owner, and every edit a draft.
 *
 * `ResourcesList` is the whole of a cell's resources in Edit mode: This cell,
 * then a group per touchpoint placed at it. It writes nothing. Each case here
 * drives the Resources tab the way the panel mounts it — inside the panel's
 * resource draft — and asserts two things: what the draft now says, in the
 * shape the panel's Save will send, and that no write left the browser.
 *
 * The rest is what a class or a prop cannot pin. The order has to be reachable
 * without a pointer, because the drag is pointer-only. The featured block has
 * to have no handle, because it has no order. An upload has to be visible for
 * its whole life, because the bucket reports no progress. And a name has to be
 * optional on the way in and reachable afterwards through the row menu.
 */
import { useEffect } from 'react'
import { cleanup, fireEvent, render, waitFor, type RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellResourcesTab } from '@/components/blueprint/CellResourcesTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ResourceDraftsProvider,
  useResourceDraftsOptional,
} from '@/contexts/ResourceDraftsContext'
import { planResourceSave, rowsForSync, type ResourceDraftState } from '@/lib/resourceDrafts'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

const rpc = vi.fn()
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: { rpc }, canWrite: true }),
}))
vi.mock('@/contexts/canvasModeContext', () => ({ useCanvasModeValue: () => 'design' }))
const uploadAttachment = vi.fn()
vi.mock('@/lib/attachmentUpload', () => ({
  uploadAttachment: (...args: unknown[]) => uploadAttachment(...args),
}))

const SHOT =
  'https://x.supabase.co/storage/v1/object/public/cell-attachments/cells/cell-1/r.pdf'
const PICTURE =
  'https://x.supabase.co/storage/v1/object/public/cell-attachments/cells/cell-1/screen.png'

const row = (over: Partial<CellResource> & { id: string; url: string }): CellResource => ({
  name: 'Tracker',
  kind: 'link',
  placementId: null,
  featured: false,
  ...over,
})

const TRACKER = row({ id: 'r-cell', url: 'https://tracker.dev/1' })
const PLACED = row({
  id: 'r-tp',
  url: 'https://intake.example/form',
  name: 'Intake form',
  placementId: 'p-1',
})

const placement = (id: string, name: string): CellTouchpoint => ({
  id,
  touchpointId: null,
  name,
  kind: null,
  summary: null,
  role: null,
})
const PORTAL = placement('p-1', 'Intake portal')

/** The row menu is a Base UI trigger: it opens on the mouse, not on Enter. */
function openMenu(trigger: HTMLElement) {
  fireEvent.mouseDown(trigger, { button: 0 })
  fireEvent.mouseUp(trigger, { button: 0 })
  fireEvent.click(trigger)
}

async function chooseFromMenu(view: RenderResult, rowName: string, item: string) {
  openMenu(view.getByLabelText(`More for ${rowName}`))
  await waitFor(() => expect(document.body.textContent).toContain(item))
  fireEvent.click(view.getByText(item))
}

/**
 * Open a row's rename the only way in: the item in that row's own menu.
 *
 * There is no second door — the name beside it is text, not a control — so
 * every test that needs the field open goes through the menu.
 */
async function openRename(view: RenderResult, name: string) {
  await chooseFromMenu(view, name, 'Rename…')
  return await waitFor(() => view.getByLabelText(`Rename ${name}`) as HTMLInputElement)
}

/** The draft, as the panel's form would read it. */
let latest: ResourceDraftState | null = null
function Probe() {
  const state = useResourceDraftsOptional()?.state ?? null
  useEffect(() => {
    latest = state
  })
  return null
}
const plan = () => planResourceSave(latest!.baseline, latest!.drafts)
const listOf = (owner: string | null) =>
  plan().lists.find((list) => list.owner === owner)?.rows ?? null

function mount(
  resources: CellResource[],
  {
    touchpoints = [PORTAL],
    frame = null,
    opened = null,
  }: { touchpoints?: CellTouchpoint[]; frame?: string | null; opened?: string | null } = {},
) {
  return render(
    <TooltipProvider>
      <ResourceDraftsProvider
        resources={resources}
        frame={frame}
        touchpoints={touchpoints}
        openedPlacementId={opened}
      >
        <CellResourcesTab cellId="cell-1" resources={resources} touchpoints={touchpoints} />
        <Probe />
      </ResourceDraftsProvider>
    </TooltipProvider>,
  )
}

beforeEach(() => {
  latest = null
  uploadAttachment.mockReset()
  rpc.mockReset()
})
afterEach(() => {
  // Whatever a case did, it wrote nothing: the panel's Save is the only writer.
  expect(rpc).not.toHaveBeenCalled()
  cleanup()
})

describe('one list, grouped by owner', () => {
  it('heads This cell first, then each touchpoint placed at the cell by its name', () => {
    const { container, getByLabelText } = mount([TRACKER, PLACED])
    const groups = [...container.querySelectorAll('[data-resource-group]')]
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'This cell',
      'Intake portal',
    ])
    expect(getByLabelText('This cell').textContent).toContain('Tracker')
    expect(getByLabelText('Intake portal').textContent).toContain('Intake form')
    // Both owners' rows are editable here: there is no read-only second list.
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(2)
  })

  it('offers no Save resources button — the panel’s Save is the only one', () => {
    const { queryByText } = mount([TRACKER, PLACED])
    expect(queryByText('Save resources')).toBeNull()
  })

  it('a pasted link joins the touchpoint the panel was opened on, named by its host', () => {
    const { getByLabelText, getByText, queryByPlaceholderText } = mount([TRACKER], {
      opened: 'p-1',
    })
    // A link is named by its host and a file by its filename. A box beside
    // the paste field would make naming a toll on the way in.
    expect(queryByPlaceholderText('Name')).toBeNull()
    fireEvent.change(getByLabelText('Paste a link'), { target: { value: 'youtu.be/walk' } })
    fireEvent.click(getByText('Add'))

    expect(getByLabelText('Intake portal').textContent).toContain('youtu.be')
    expect(rowsForSync(listOf('p-1')!)).toEqual([
      { id: null, kind: 'link', name: 'youtu.be', url: 'https://youtu.be/walk' },
    ])
    expect(listOf(null)).toBeNull()
  })

  it('with no touchpoint opened, a pasted link joins This cell', () => {
    const { getByLabelText, getByText } = mount([TRACKER])
    fireEvent.change(getByLabelText('Paste a link'), { target: { value: 'youtu.be/walk' } })
    fireEvent.click(getByText('Add'))
    expect(rowsForSync(listOf(null)!).at(-1)).toEqual({
      id: null,
      kind: 'link',
      name: 'youtu.be',
      url: 'https://youtu.be/walk',
    })
  })

  it('a new row says it is unsaved, and an untouched one does not', () => {
    const { container, getByLabelText, getByText } = mount([TRACKER])
    expect(container.querySelector('[data-unsaved]')).toBeNull()
    fireEvent.change(getByLabelText('Paste a link'), { target: { value: 'youtu.be/walk' } })
    fireEvent.click(getByText('Add'))
    const marked = [...container.querySelectorAll('[data-unsaved]')]
    expect(marked).toHaveLength(1)
    expect(marked[0]!.textContent).toContain('youtu.be')
    expect(marked[0]!.textContent).toContain('Unsaved')
  })

  it('removing a row drafts its list without it', async () => {
    const view = mount([TRACKER, PLACED])
    await chooseFromMenu(view, 'Intake form', 'Remove from the list')
    await waitFor(() => expect(view.queryByLabelText('More for Intake form')).toBeNull())
    expect(listOf('p-1')).toEqual([])
    expect(listOf(null)).toBeNull()
  })

  it('moving a row to another owner removes it from one list and adds it to the other', async () => {
    const view = mount([
      row({ id: 'r-cell', url: 'https://tracker.dev/1', featured: true }),
    ])
    await chooseFromMenu(view, 'Tracker', 'Move to Intake portal')

    await waitFor(() =>
      expect(view.getByLabelText('Intake portal').textContent).toContain('Tracker'),
    )
    expect(listOf(null)).toEqual([])
    // A new row to the placement: no id, and its featured flag left behind.
    expect(rowsForSync(listOf('p-1')!)).toEqual([
      { id: null, kind: 'link', name: 'Tracker', url: 'https://tracker.dev/1' },
    ])
    expect(latest!.drafts.rows[0]!.featured).toBe(false)
    expect(plan().featured).toEqual([])
  })
})

describe('featuring is a draft too', () => {
  it('offers a picture as the featured image and a link as a button, and a file as neither', async () => {
    const view = mount([
      row({ id: 'r-pic', url: PICTURE, kind: 'attachment', name: 'Screen' }),
      row({ id: 'r-shot', url: SHOT, kind: 'attachment', name: 'Runbook' }),
      TRACKER,
    ])

    openMenu(view.getByLabelText('More for Screen'))
    await waitFor(() => expect(document.body.textContent).toContain('Set as featured image'))
    expect(document.body.textContent).not.toContain('Set as button')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() =>
      expect(document.body.textContent).not.toContain('Set as featured image'),
    )

    openMenu(view.getByLabelText('More for Runbook'))
    await waitFor(() => expect(document.body.textContent).toContain('Rename…'))
    expect(document.body.textContent).not.toContain('Set as featured image')
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(document.body.textContent).not.toContain('Rename…'))

    openMenu(view.getByLabelText('More for Tracker'))
    await waitFor(() => expect(document.body.textContent).toContain('Set as button'))
    expect(document.body.textContent).not.toContain('Set as featured image')
  })

  it('“Set as button” drafts one flag, and the featured block shows it', async () => {
    const view = mount([TRACKER])
    await chooseFromMenu(view, 'Tracker', 'Set as button')
    await waitFor(() =>
      expect(view.getByLabelText('Featured').textContent).toContain('Open link · Tracker'),
    )
    expect(plan().featured).toEqual([{ key: 'r-cell', featured: true }])
  })

  it('“Unset” drafts the flag off and keeps the row in the list', () => {
    const { container, getByLabelText } = mount([{ ...TRACKER, featured: true }])
    fireEvent.click(getByLabelText('Unset Tracker'))
    expect(plan().featured).toEqual([{ key: 'r-cell', featured: false }])
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(1)
  })

  it('“Set as featured image” drafts the frame, from either owner', async () => {
    const view = mount([
      row({ id: 'r-pic', url: PICTURE, kind: 'attachment', name: 'Screen', placementId: 'p-1' }),
    ])
    await chooseFromMenu(view, 'Screen', 'Set as featured image')
    expect(plan().frame).toEqual({ url: PICTURE })
    openMenu(view.getByLabelText('More for Screen'))
    await waitFor(() => expect(document.body.textContent).toContain('Featured image'))
    expect(document.body.textContent).not.toContain('Set as featured image')
  })

  it('shows the picture that already is the frame as the featured image, and offers nothing to do', async () => {
    const view = mount(
      [row({ id: 'r-pic', url: PICTURE, kind: 'attachment', name: 'Screen' })],
      { frame: PICTURE },
    )
    openMenu(view.getByLabelText('More for Screen'))
    await waitFor(() => expect(document.body.textContent).toContain('Featured image'))
    const item = view.getByText('Featured image').closest('[role="menuitem"]')!
    expect(item.getAttribute('aria-disabled') ?? item.getAttribute('data-disabled')).not.toBeNull()
    expect(plan().frame).toBeNull()
  })

  it('gives the featured block no handle — it has no order of its own', () => {
    const { getByLabelText, queryByLabelText } = mount([{ ...TRACKER, featured: true }])
    expect(
      getByLabelText('Featured').querySelectorAll('button[aria-label^="Reorder"]'),
    ).toHaveLength(0)
    expect(queryByLabelText('Reorder Tracker')).not.toBeNull()
  })

  it('an attachment flagged featured leads nothing any more', () => {
    const { queryByLabelText } = mount([
      row({ id: 'r-shot', url: SHOT, kind: 'attachment', name: 'Runbook', featured: true }),
    ])
    expect(queryByLabelText('Featured')).toBeNull()
  })
})

describe('the order stays reachable without a pointer', () => {
  it('the drag handle answers Up and Down, within the row’s own group', () => {
    const { getByLabelText } = mount([
      TRACKER,
      row({ id: 'r-shot', url: SHOT, kind: 'attachment', name: 'Runbook' }),
      PLACED,
    ])
    fireEvent.keyDown(getByLabelText('Reorder Runbook'), { key: 'ArrowUp' })
    expect(listOf(null)!.map((entry) => entry.id)).toEqual(['r-shot', 'r-cell'])
    // The placement's list did not move.
    expect(listOf('p-1')).toBeNull()
  })

  it('will not walk a row off either end of its group', () => {
    const { getByLabelText } = mount([TRACKER, PLACED])
    fireEvent.keyDown(getByLabelText('Reorder Tracker'), { key: 'ArrowUp' })
    fireEvent.keyDown(getByLabelText('Reorder Tracker'), { key: 'ArrowDown' })
    expect(plan().lists).toEqual([])
  })
})

describe('naming a resource is a second, optional act', () => {
  it('opens the rename from the row menu, and Enter commits it to the draft', async () => {
    const view = mount([TRACKER])
    const field = await openRename(view, 'Tracker')
    expect(field.value).toBe('Tracker')
    fireEvent.change(field, { target: { value: 'Delivery tracker' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => expect(view.getByLabelText('More for Delivery tracker')).toBeTruthy())
    expect(rowsForSync(listOf(null)!)).toEqual([
      { id: 'r-cell', kind: 'link', name: 'Delivery tracker', url: 'https://tracker.dev/1' },
    ])
  })

  it('a placement’s row reaches the rename through its row menu too', async () => {
    const view = mount([PLACED])
    const field = await openRename(view, 'Intake form')
    expect(field.value).toBe('Intake form')
  })

  it('Escape abandons the rename and leaves the standing name', async () => {
    const view = mount([TRACKER])
    const field = await openRename(view, 'Tracker')
    fireEvent.change(field, { target: { value: 'Something else' } })
    fireEvent.keyDown(field, { key: 'Escape' })

    await waitFor(() => expect(view.queryByLabelText('Rename Tracker')).toBeNull())
    expect(view.container.textContent).not.toContain('Something else')
    expect(plan().lists).toEqual([])
  })

  it('a rename typed down to nothing leaves the name it had', async () => {
    const view = mount([TRACKER])
    const field = await openRename(view, 'Tracker')
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => expect(view.queryByLabelText('Rename Tracker')).toBeNull())
    expect(view.container.textContent).toContain('Tracker')
    expect(plan().lists).toEqual([])
  })
})

describe('an upload stores the file on pick; only its row waits for Save', () => {
  const landed = (url: string, objectKey: string) => ({
    kind: 'attachment',
    name: 'Runbook',
    url,
    objectKey,
  })

  it('is a dimmed row with an indeterminate bar, then an ordinary row', async () => {
    let land: (value: unknown) => void = () => {}
    uploadAttachment.mockReturnValue(new Promise((resolve) => (land = resolve)))
    const { container, getByLabelText, getByText } = mount([TRACKER])
    fireEvent.change(getByLabelText('Upload a file'), {
      target: { files: [new File(['pdf'], 'Runbook.pdf', { type: 'application/pdf' })] },
    })

    await waitFor(() => expect(container.querySelector('[data-upload-row]')).not.toBeNull())
    const pending = container.querySelector('[data-upload-row]')!
    expect(pending.textContent).toContain('Runbook')
    expect(pending.className).toContain('opacity-60')
    expect(getByLabelText('Uploading Runbook').getAttribute('role')).toBe('progressbar')
    expect(getByText('Uploading…')).toBeTruthy()
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(1)

    land(landed(SHOT, 'cells/cell-1/r.pdf'))
    await waitFor(() => expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(2))
    expect(container.querySelector('[data-upload-row]')).toBeNull()
  })

  it('a refused upload says so, offers Retry, and the retry lands the same file', async () => {
    uploadAttachment.mockRejectedValueOnce(new Error('The file could not be uploaded: gateway'))
    const { container, getByLabelText, getByText } = mount([TRACKER])
    const file = new File(['pdf'], 'Runbook.pdf', { type: 'application/pdf' })
    fireEvent.change(getByLabelText('Upload a file'), { target: { files: [file] } })

    await waitFor(() =>
      expect(container.querySelector('[data-upload-row]')?.textContent).toContain(
        'The file did not upload.',
      ),
    )
    expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(1)

    uploadAttachment.mockResolvedValueOnce(landed(SHOT, 'cells/cell-1/r.pdf'))
    fireEvent.click(getByText('Retry'))
    await waitFor(() => expect(container.querySelectorAll('[data-resource-row]')).toHaveLength(2))
    expect(uploadAttachment).toHaveBeenNthCalledWith(2, expect.anything(), {
      cellId: 'cell-1',
      file,
    })
  })

  it('files the object under the cell, and drafts its row into the chosen owner', async () => {
    uploadAttachment.mockResolvedValue(landed(SHOT, 'cells/cell-1/r.pdf'))
    const { getByLabelText } = mount([TRACKER], { opened: 'p-1' })
    const file = new File(['pdf'], 'Runbook.pdf', { type: 'application/pdf' })
    fireEvent.change(getByLabelText('Upload a file'), { target: { files: [file] } })

    await waitFor(() => expect(listOf('p-1')).not.toBeNull())
    expect(uploadAttachment).toHaveBeenCalledWith(expect.anything(), { cellId: 'cell-1', file })
    expect(rowsForSync(listOf('p-1')!)).toEqual([
      { id: null, kind: 'attachment', name: 'Runbook', url: SHOT },
    ])
  })
})
