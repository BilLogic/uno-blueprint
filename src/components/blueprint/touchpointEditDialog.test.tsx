// @vitest-environment jsdom
/**
 * The touchpoint editor: the registry entry behind a placement, edited whole
 * in a dialog over the cell panel, with a Save of its own.
 *
 * What it promises, held here at the component: it says how far an edit
 * reaches before anything is typed; Save is lit only by a real change, in the
 * shape the write stores; every way out but Save writes nothing; a rename the
 * panel cannot follow is refused before it is sent; an icon that is not
 * a raster is turned away with the reason; and a link that is not https, or
 * an icon that is not one the icon rule takes, keeps Save dark and says why,
 * before the write is asked. The panel's
 * side of a rename is `cellPanelEditorTouchpointEdit.test.tsx`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TouchpointEntryRead } from '@/hooks/useRegistryTouchpoints'
import type { TouchpointUpdate } from '@/lib/touchpointMutations'

const { entry, updateTouchpoint } = vi.hoisted(() => ({
  entry: { current: null as TouchpointEntryRead | null },
  updateTouchpoint: vi.fn(),
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
vi.mock('@/hooks/useRegistryTouchpoints', () => ({
  useTouchpointEntry: (id: string | null) =>
    id && entry.current ? { status: 'ready', data: entry.current } : { status: 'loading' },
}))
vi.mock('@/lib/touchpointMutations', () => ({ updateTouchpoint }))
// The real upload, so its own type check still runs, behind a spy a test can
// point at a finished upload without a storage client.
vi.mock('@/lib/attachmentUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/attachmentUpload')>()
  return { ...actual, uploadTouchpointIcon: vi.fn(actual.uploadTouchpointIcon) }
})
// Served from under a prefix, so a root-relative icon path has to be asked
// for through `servedUrl` — the build under test is served from the root,
// where the call would be invisible.
vi.mock('@/lib/basePath', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/basePath')>()
  return { ...actual, servedUrl: (url: string) => actual.servedUrl(url, '/demo/') }
})

import { TouchpointEditDialog } from '@/components/blueprint/TouchpointEditDialog'
import { uploadTouchpointIcon } from '@/lib/attachmentUpload'
import { ICON_URL_PROBLEM } from '@/lib/resourceUrl'
import { panelEditorBusy } from '@/lib/panelEditorBusy'

const PORTAL: TouchpointEntryRead = {
  id: 'tp-1',
  name: 'Intake portal',
  kind: 'app',
  summary: 'Where a report is filed.',
  url: 'https://example.com/portal',
  iconUrl: 'https://example.com/portal.png',
  placements: 4,
}

function saved(over: Partial<TouchpointUpdate> = {}): TouchpointUpdate {
  return {
    touchpointId: 'tp-1',
    name: 'Intake portal',
    previousName: 'Intake portal',
    cellIds: [],
    changed: true,
    previous: {
      name: 'Intake portal',
      kind: 'app',
      summary: 'Where a report is filed.',
      url: 'https://example.com/portal',
      iconUrl: 'https://example.com/portal.png',
    },
    ...over,
  }
}

/** The dialog as the panel holds it: open state owned outside, like the editor does. */
function open(props: { renameRefusal?: string | null } = {}) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  function Harness() {
    return (
      <TouchpointEditDialog
        touchpointId="tp-1"
        open
        onOpenChange={onOpenChange}
        renameRefusal={props.renameRefusal ?? null}
        onSaved={onSaved}
      />
    )
  }
  render(<Harness />)
  return { onSaved, onOpenChange }
}

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: 'Save touchpoint' }) as HTMLButtonElement

beforeEach(() => {
  entry.current = { ...PORTAL }
  updateTouchpoint.mockReset()
})

afterEach(cleanup)

describe('the touchpoint editor', () => {
  it('opens on the entry as it stands, titled and with every field labelled', () => {
    open()

    expect(screen.getByRole('dialog', { name: 'Edit touchpoint' })).toBeTruthy()
    expect(field('Name').value).toBe('Intake portal')
    expect(screen.getByRole('combobox', { name: 'Kind' }).textContent).toContain('App')
    expect(field('Summary').value).toBe('Where a report is filed.')
    expect(field('URL').value).toBe('https://example.com/portal')
    expect(
      (screen.getByAltText('The touchpoint’s icon') as HTMLImageElement).src,
    ).toBe('https://example.com/portal.png')
  })

  it('says how many steps an edit reaches, counted from the entry’s placements', () => {
    open()
    expect(screen.getByText('Changes apply at all 4 steps that use Intake portal.')).toBeTruthy()

    cleanup()
    entry.current = { ...PORTAL, placements: 1 }
    open()
    expect(screen.getByText('Changes apply at the one step that uses Intake portal.')).toBeTruthy()
  })

  it('keeps Save dark until a field differs from what it opened with, trimmed as stored', () => {
    open()
    expect(saveButton().disabled).toBe(true)

    // A trailing space is the same name to the write, so it is not an edit.
    fireEvent.change(field('Name'), { target: { value: 'Intake portal ' } })
    expect(saveButton().disabled).toBe(true)

    fireEvent.change(field('Summary'), { target: { value: 'Where a report starts.' } })
    expect(saveButton().disabled).toBe(false)

    // Back to the opened text: nothing to save again.
    fireEvent.change(field('Summary'), { target: { value: 'Where a report is filed.' } })
    expect(saveButton().disabled).toBe(true)
  })

  it('writes the whole entry through updateTouchpoint, then hands the result back and closes', async () => {
    const result = saved({ name: 'Report portal', cellIds: ['cell-1'] })
    updateTouchpoint.mockResolvedValue(result)
    const { onSaved, onOpenChange } = open()

    fireEvent.change(field('Name'), { target: { value: '  Report portal ' } })
    fireEvent.change(field('URL'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear icon' }))
    fireEvent.click(saveButton())

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(result))
    expect(updateTouchpoint).toHaveBeenCalledTimes(1)
    expect(updateTouchpoint).toHaveBeenCalledWith({}, 'tp-1', {
      name: 'Report portal',
      kind: 'app',
      summary: 'Where a report is filed.',
      url: null,
      iconUrl: null,
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('writes nothing on Cancel, on the close button or on Escape', () => {
    const { onOpenChange } = open()
    fireEvent.change(field('Summary'), { target: { value: 'Edited and abandoned.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.keyDown(field('Summary'), { key: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledTimes(3)
    expect(onOpenChange.mock.calls.every(([next]) => next === false)).toBe(true)
    expect(updateTouchpoint).not.toHaveBeenCalled()
  })

  it('holds the panel open while it is on screen, so its Escape is not the panel’s', () => {
    open()
    expect(panelEditorBusy()).toBe(true)
    cleanup()
    expect(panelEditorBusy()).toBe(false)
  })

  it('shows a refused save inline and stays open', async () => {
    updateTouchpoint.mockRejectedValue(new Error('A touchpoint named Kiosk already exists.'))
    const { onSaved, onOpenChange } = open()

    fireEvent.change(field('Name'), { target: { value: 'Kiosk' } })
    fireEvent.click(saveButton())

    expect(await screen.findByText('A touchpoint named Kiosk already exists.')).toBeTruthy()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('refuses a rename the panel cannot follow, before anything is sent, and still saves the rest', async () => {
    updateTouchpoint.mockResolvedValue(saved())
    open({ renameRefusal: 'Save or cancel the panel first.' })

    fireEvent.change(field('Name'), { target: { value: 'Report portal' } })
    expect(screen.getByText('Save or cancel the panel first.')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(saveButton())
    expect(updateTouchpoint).not.toHaveBeenCalled()

    // The name back, another field changed: that reaches no cell's text.
    fireEvent.change(field('Name'), { target: { value: 'Intake portal' } })
    fireEvent.change(field('Summary'), { target: { value: 'Where a report starts.' } })
    expect(screen.queryByText('Save or cancel the panel first.')).toBeNull()
    fireEvent.click(saveButton())
    await waitFor(() => expect(updateTouchpoint).toHaveBeenCalledTimes(1))
    expect(updateTouchpoint.mock.calls[0][2].name).toBe('Intake portal')
  })

  it('asks for a seeded root-relative icon under the path the app is served from', () => {
    entry.current = { ...PORTAL, iconUrl: '/touchpoints/portal.png' }
    open()
    expect(screen.getByAltText('The touchpoint’s icon').getAttribute('src')).toBe(
      '/demo/touchpoints/portal.png',
    )
  })

  it('turns away an icon that is not a PNG, JPEG or WebP, with the reason, and keeps the old one', async () => {
    open()
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Icon file'), { target: { files: [svg] } })
    })

    expect(
      await screen.findByText('A touchpoint icon has to be a PNG, JPEG or WebP image.'),
    ).toBeTruthy()
    expect((screen.getByAltText('The touchpoint’s icon') as HTMLImageElement).src).toBe(
      'https://example.com/portal.png',
    )
    expect(saveButton().disabled).toBe(true)
  })

  it.each([
    ['javascript:alert(1)', 'Links must start with https — “javascript:” is not allowed.'],
    ['http://example.com', 'Use an https link — this one is http, which is not secure.'],
    ['not a link', '“not a link” is not a link.'],
  ])('keeps Save dark on a URL of %s and says why', (url, problem) => {
    open()

    fireEvent.change(field('URL'), { target: { value: url } })

    expect(screen.getByText(problem)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(saveButton())
    expect(updateTouchpoint).not.toHaveBeenCalled()
  })

  it('saves a bare host as the https link it names', async () => {
    updateTouchpoint.mockResolvedValue(saved())
    open()

    fireEvent.change(field('URL'), { target: { value: 'figma.com/file/x' } })
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateTouchpoint).toHaveBeenCalledTimes(1))
    expect(updateTouchpoint.mock.calls[0][2].url).toBe('https://figma.com/file/x')
  })

  it('leaves a link it opened with alone, so an older http entry can still be edited', async () => {
    updateTouchpoint.mockResolvedValue(saved())
    entry.current = { ...PORTAL, url: 'http://legacy.example/portal' }
    open()

    fireEvent.change(field('Summary'), { target: { value: 'Where a report starts.' } })
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateTouchpoint).toHaveBeenCalledTimes(1))
    expect(updateTouchpoint.mock.calls[0][2].url).toBe('http://legacy.example/portal')
  })

  it('keeps Save dark on an uploaded icon at a plain http host, and says why', async () => {
    const png = new File(['png'], 'logo.png', { type: 'image/png' })
    vi.mocked(uploadTouchpointIcon).mockResolvedValueOnce({
      url: 'http://storage.example/touchpoints/tp-1/a.png',
      objectKey: 'touchpoints/tp-1/a.png',
    })
    open()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Icon file'), { target: { files: [png] } })
    })
    expect(screen.getByText(ICON_URL_PROBLEM)).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it.each([
    ['an https object URL', 'https://storage.example/touchpoints/tp-1/b.png'],
    // What the local stack's storage hands back for the same upload.
    ['the local stack’s loopback URL', 'http://127.0.0.1:54321/storage/v1/object/public/cell-attachments/touchpoints/tp-1/b.png'],
    ['a path on this site', '/touchpoint-logos/portal.png'],
  ])('saves an uploaded icon at %s', async (_label, uploaded) => {
    updateTouchpoint.mockResolvedValue(saved())
    const png = new File(['png'], 'logo.png', { type: 'image/png' })
    vi.mocked(uploadTouchpointIcon).mockResolvedValueOnce({
      url: uploaded,
      objectKey: 'touchpoints/tp-1/b.png',
    })
    open()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Icon file'), { target: { files: [png] } })
    })
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(updateTouchpoint).toHaveBeenCalledTimes(1))
    expect(updateTouchpoint.mock.calls[0][2].iconUrl).toBe(uploaded)
  })
})
