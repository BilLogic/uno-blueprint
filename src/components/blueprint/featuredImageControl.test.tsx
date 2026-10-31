// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { inMemoryDatabase } from '@/test/inMemoryDatabase'
import { FeaturedImageControl } from '@/components/blueprint/FeaturedImageControl'
import type { CellResource } from '@/types/blueprint'

const boundary = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: boundary.client, canWrite: true }),
}))
const PICTURE = 'https://example.test/screen.png'
const resources: CellResource[] = [
  { id: 'picture', name: 'Screen', kind: 'attachment', url: PICTURE, placementId: null, featured: false },
]
let database: ReturnType<typeof inMemoryDatabase>
beforeEach(() => {
  database = inMemoryDatabase({}, {
    rpc: () => ({ cell_id: 'cell-1', frame: null }),
  })
  boundary.client = database.client
})
afterEach(cleanup)

it('keeps a picture choice local until Save and discards it on Cancel', async () => {
  const saved = vi.fn()
  render(<FeaturedImageControl cellId="cell-1" frame={null} resources={resources} onSaved={saved} />)
  const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  fireEvent.click(screen.getByRole('button', { name: 'Set Screen as the featured image' }))
  expect(save().disabled).toBe(false)
  expect(database.rpcs).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(save().disabled).toBe(true)
  expect(screen.queryByAltText('Featured image')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Set Screen as the featured image' }))
  fireEvent.click(save())
  await waitFor(() => expect(saved).toHaveBeenCalledWith(PICTURE))
  expect(save().disabled).toBe(true)
  expect(database.rpcs).toEqual([{ fn: 'set_cell_featured_image', args: { cell_id: 'cell-1', image_url: PICTURE } }])
})

it('can replace a storyboard illustration with an inherited logo and clear the image without removing attachments', async () => {
  const saved = vi.fn()
  render(<FeaturedImageControl cellId="cell-1" frame="/storyboard/moment.png" resources={resources} touchpoints={[{
    id: 'placement', touchpointId: 'app', name: 'Portal', kind: 'app', iconUrl: '/logos/portal.png', summary: null, role: null,
  }]} onSaved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set Portal logo as the featured image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith('/logos/portal.png'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove featured image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toHaveBeenLastCalledWith(null))
  expect(screen.queryByAltText('Featured image')).toBeNull()
  expect(screen.getByRole('button', { name: 'Set Screen as the featured image' })).toBeTruthy()
})

it('uploads a picture into the draft and writes its attachment with the picture only on Save', async () => {
  const upload = vi.fn(async () => ({ error: null }))
  const publicUrl = 'https://example.test/upload.png'
  Object.assign(database.client, { storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl } }) }) } })
  const saved = vi.fn()
  render(<FeaturedImageControl cellId="cell-1" frame={null} resources={[]} onSaved={saved} />)
  fireEvent.change(screen.getByLabelText('Upload featured image'), { target: { files: [new File(['pixels'], 'upload.png', { type: 'image/png' })] } })
  await waitFor(() => expect(screen.getByAltText('Featured image').getAttribute('src')).toBe(publicUrl))
  expect(database.rpcs).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith(publicUrl))
  expect(upload).toHaveBeenCalledTimes(1)
  expect(database.rpcs.map((call) => call.fn)).toEqual(['sync_cell_resources', 'set_cell_featured_image'])
})

it('keeps a failed picture save available for retry', async () => {
  let attempts = 0
  database = inMemoryDatabase({}, { rpc: () => {
    attempts += 1
    if (attempts === 1) throw new Error('Picture write refused')
    return { cell_id: 'cell-1', frame: null }
  } })
  boundary.client = database.client
  const saved = vi.fn()
  render(<FeaturedImageControl cellId="cell-1" frame={null} resources={resources} onSaved={saved} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set Screen as the featured image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Picture write refused'))
  expect(saved).not.toHaveBeenCalled()
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saved).toHaveBeenCalledWith(PICTURE))
})

it('opens a fresh draft when the control is given a different cell', () => {
  const view = render(<FeaturedImageControl cellId="cell-1" frame={null} resources={resources} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set Screen as the featured image' }))
  view.rerender(<FeaturedImageControl cellId="cell-2" frame="/storyboard/next.png" resources={[]} />)
  expect(screen.getByAltText('Featured image').getAttribute('src')).toBe('/storyboard/next.png')
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  expect(database.rpcs).toEqual([])
})

it('keeps the saved storyboard illustration available while trying another picture', () => {
  render(<FeaturedImageControl cellId="cell-1" frame="/storyboard/moment.png" resources={resources} />)
  fireEvent.click(screen.getByRole('button', { name: 'Set Screen as the featured image' }))
  fireEvent.click(screen.getByRole('button', { name: 'Set saved image as the featured image' }))
  expect(screen.getByAltText('Featured image').getAttribute('src')).toBe('/storyboard/moment.png')
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
})

it('discards an upload error on Cancel without writing a resource or a picture', async () => {
  Object.assign(database.client, { storage: { from: () => ({ upload: async () => ({ error: { message: 'Storage refused' } }) }) } })
  render(<FeaturedImageControl cellId="cell-1" frame={null} resources={resources} />)
  fireEvent.change(screen.getByLabelText('Upload featured image'), { target: { files: [new File(['pixels'], 'upload.png', { type: 'image/png' })] } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Storage refused'))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(database.rpcs).toEqual([])
})
