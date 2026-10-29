// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { createClient } from '@supabase/supabase-js'
import { StoryboardCellRows } from './StoryboardCellRows'
import { WriteFailureNotices } from '@/components/editor/WriteFailureNotices'
import { resetWriteFailures } from '@/lib/writeFailures'
import { requestPanelTransition } from '@/lib/openPanelStore'
import type { Database } from '@/types/database'
const session = vi.hoisted(() => ({ client: null as unknown, canWrite: true }))
vi.mock('@/contexts/SupabaseProvider', () => ({ useSupabase: () => session }))
const state = {
  cell_id: 'cell',
  path_id: 'path',
  lane_id: 'lane',
  step_id: 'step',
  content: 'Original text',
  summary: 'Original summary',
  frame: '/picture.png',
  resources: [],
  placements: [],
}
const rows = [
  {
    cell: {
      id: 'cell',
      lane_id: 'lane',
      step_id: 'step',
      content: 'Original text',
      summary: 'Original summary',
      frame: '/picture.png',
    },
    label: 'Actor',
    laneName: 'Actor',
    frame: '/picture.png',
    summary: 'Original summary',
  },
]
async function readyForm(name = 'Actor') {
  const form = await screen.findByRole('form', { name: `Edit ${name}` })
  await waitFor(() =>
    expect(
      within(form)
        .getByRole('textbox', { name: 'Caption' })
        .matches(':disabled'),
    ).toBe(false),
  )
  return form
}
afterEach(() => {
  cleanup()
  resetWriteFailures()
})
it('a dirty row keeps its text and the pending close until the author discards', async () => {
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify(state), {
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    },
  )
  render(<StoryboardCellRows rows={rows} canEdit />)
  const form = await readyForm()
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Draft' },
  })
  const close = vi.fn()
  requestPanelTransition(close)
  const prompt = await screen.findByRole('alertdialog')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(within(prompt).getByRole('button', { name: 'Keep editing' }))
  expect(
    (
      within(form).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Draft')
  requestPanelTransition(close)
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Discard changes',
    }),
  )
  expect(close).toHaveBeenCalledTimes(1)
})
it('a refused Save keeps the draft, and a pending Save refuses navigation', async () => {
  let refuse: ((response: Response) => void) | undefined
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input) =>
          String(input).endsWith('/read_cell_storyboard')
            ? new Response(JSON.stringify(state), {
                headers: { 'Content-Type': 'application/json' },
              })
            : new Promise<Response>((resolve) => {
                refuse = resolve
              }),
      },
    },
  )
  render(<StoryboardCellRows rows={rows} canEdit />)
  const form = await readyForm()
  const text = await within(form).findByRole('textbox', { name: 'Caption' })
  fireEvent.change(text, { target: { value: 'Changed text' } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await within(form).findByRole('button', { name: 'Saving…' })
  const close = vi.fn()
  expect(requestPanelTransition(close)).toBe(false)
  expect(close).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).toBe(null)
  refuse!(
    new Response(
      JSON.stringify({
        message: 'This cell changed. Reopen it before saving.',
        code: '40001',
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    ),
  )
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect((text as HTMLTextAreaElement).value).toBe('Changed text')
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})
it('saves picture and caption without changing action text in one cell change and offers that change’s own Undo', async () => {
  const { clearSession, sessionSnapshot, recordChange } = await import(
    '@/lib/authoringSession'
  )
  clearSession()
  const calls: Array<{ fn: string; body: Record<string, unknown> }> = []
  const token = '22222222-2222-4222-8222-222222222222'
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const fn = String(input).split('/').pop()!
          const body = JSON.parse(String(init?.body ?? '{}'))
          calls.push({ fn, body })
          const result =
            fn === 'read_cell_storyboard'
              ? state
              : fn === 'record_authoring_change'
              ? token
              : fn === 'update_cell_storyboard'
              ? {
                  cell_id: 'cell',
                  receipt_id: token,
                  before: state,
                  after: {
                    ...state,
                    content: body.p_content,
                    summary: body.p_summary,
                    frame: body.p_frame,
                  },
                }
              : null
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  const editor = render(<StoryboardCellRows rows={rows} canEdit />)
  render(<WriteFailureNotices />)
  const form = await readyForm()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Saved text' },
  })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Saved summary' },
  })
  fireEvent.click(within(form).getByRole('button', { name: 'Remove picture' }))
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved the cell')
  editor.unmount()
  expect(sessionSnapshot()).toHaveLength(1)
  expect(calls.filter((call) => call.fn === 'update_cell_storyboard')).toEqual([
    {
      fn: 'update_cell_storyboard',
      body: {
        p_cell_id: 'cell',
        p_content: 'Original text',
        p_summary: 'Saved summary',
        p_frame: null,
        p_expected: state,
        p_attachments: [],
      },
    },
  ])
  recordChange(
    'set_cell_featured_image',
    { cell_id: 'another' },
    {
      fn: 'set_cell_featured_image',
      args: { cell_id: 'another', image_url: null },
    },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await vi.waitFor(() =>
    expect(
      calls.filter((call) => call.fn === 'restore_cell_storyboard'),
    ).toHaveLength(1),
  )
  expect(calls.filter((call) => call.fn === 'restore_cell_storyboard')).toEqual(
    [{ fn: 'restore_cell_storyboard', body: { p_receipt_id: token } }],
  )
  expect(sessionSnapshot().map((entry) => entry.args.cell_id)).toEqual([
    'another',
  ])
  clearSession()
})

it('View is read-only and Cancel discards Caption changes without writing', async () => {
  const writes = vi.fn()
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          if (!String(input).endsWith('/read_cell_storyboard')) writes()
          return new Response(JSON.stringify(state), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  const view = render(<StoryboardCellRows rows={rows} canEdit={false} />)
  expect(screen.queryByRole('button', { name: 'Edit Actor' })).toBeNull()
  view.rerender(<StoryboardCellRows rows={rows} canEdit />)
  const form = await readyForm()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: ' ' },
  })
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  await readyForm()
  expect(
    (
      within(form).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Original summary')
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  expect(writes).not.toHaveBeenCalled()
})

it('shows only the strip’s pictured cells in both modes, without unrelated Add picture rows', () => {
  const mixed = [
    {
      ...rows[0],
      label: 'Blueprint owner',
      laneName: 'Blueprint owner',
      frame: '',
      cell: { ...rows[0].cell, id: 'unpictured', frame: null },
    },
    ...rows,
  ]
  const editor = render(<StoryboardCellRows rows={mixed} canEdit={false} />)
  expect(screen.queryByRole('region', { name: 'Blueprint owner' })).toBeNull()
  editor.rerender(<StoryboardCellRows rows={mixed} canEdit />)
  expect(screen.queryByRole('region', { name: 'Blueprint owner' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Add picture/ })).toBeNull()
  expect(screen.getByRole('form', { name: 'Edit Actor' })).toBeTruthy()
})

it('keeps every staged upload selectable before the one Save', async () => {
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes('/storage/v1/object/')
                ? { Key: 'image', Id: 'image' }
                : state,
            ),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      },
    },
  )
  render(<StoryboardCellRows rows={rows} canEdit />)
  const form = await readyForm()
  fireEvent.change(within(form).getByLabelText('Upload picture'), {
    target: { files: [new File(['A'], 'first.png', { type: 'image/png' })] },
  })
  await waitFor(() =>
    expect(within(form).getByAltText('Picture').getAttribute('src')).not.toBe(
      '/picture.png',
    ),
  )
  const firstUrl = within(form).getByAltText('Picture').getAttribute('src')
  fireEvent.change(within(form).getByLabelText('Upload picture'), {
    target: { files: [new File(['B'], 'second.png', { type: 'image/png' })] },
  })
  await waitFor(() =>
    expect(within(form).getByAltText('Picture').getAttribute('src')).not.toBe(
      firstUrl,
    ),
  )
  fireEvent.click(within(form).getByRole('button', { name: 'Use first' }))
  expect(within(form).getByAltText('Picture').getAttribute('src')).toBe(
    firstUrl,
  )
  expect(within(form).queryByRole('button', { name: 'Use first' })).toBeNull()
})

it('opens every pictured cell’s fields directly in Edit mode, with no second Edit button', async () => {
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body ?? '{}'))
          return new Response(
            JSON.stringify({ ...state, cell_id: body.p_cell_id }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        },
      },
    },
  )
  const pictures = [
    ...rows,
    {
      ...rows[0],
      label: 'Second actor',
      laneName: 'Second actor',
      cell: { ...rows[0].cell, id: 'second' },
    },
  ]
  const panel = render(<StoryboardCellRows rows={pictures} canEdit={false} />)
  expect(screen.queryByRole('form')).toBeNull()
  panel.rerender(<StoryboardCellRows rows={pictures} canEdit />)
  expect(await screen.findByRole('form', { name: 'Edit Actor' })).toBeTruthy()
  expect(
    await screen.findByRole('form', { name: 'Edit Second actor' }),
  ).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
})

it('Cancel resets only its cell and the close guard checks every pictured draft', async () => {
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body ?? '{}'))
          return new Response(
            JSON.stringify({ ...state, cell_id: body.p_cell_id }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        },
      },
    },
  )
  render(
    <StoryboardCellRows
      rows={[
        ...rows,
        {
          ...rows[0],
          label: 'Second actor',
          laneName: 'Second actor',
          cell: { ...rows[0].cell, id: 'second' },
        },
      ]}
      canEdit
    />,
  )
  const first = await readyForm()
  const second = await readyForm('Second actor')
  fireEvent.change(within(first).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'First draft' },
  })
  fireEvent.change(within(second).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Second draft' },
  })
  fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }))
  expect(
    (
      within(first).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Original summary')
  expect(
    (
      within(second).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Second draft')
  await readyForm()
  const close = vi.fn()
  expect(requestPanelTransition(close)).toBe(false)
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Keep editing',
    }),
  )
  expect(close).not.toHaveBeenCalled()
  requestPanelTransition(close)
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Discard changes',
    }),
  )
  expect(close).toHaveBeenCalledTimes(1)
  expect(
    (
      within(second).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Original summary')
  expect(screen.getAllByRole('form')).toHaveLength(2)
})

it('Save leaves the fields open with the saved baseline for the next edit', async () => {
  let current = { ...state }
  const token = '22222222-2222-4222-8222-222222222222'
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const fn = String(input).split('/').pop()
          const body = JSON.parse(String(init?.body ?? '{}'))
          let result: unknown = current
          if (fn === 'update_cell_storyboard') {
            const before = current
            current = {
              ...current,
              content: body.p_content,
              summary: body.p_summary,
              frame: body.p_frame,
            }
            result = {
              cell_id: 'cell',
              receipt_id: token,
              before,
              after: current,
            }
          } else if (fn === 'record_authoring_change') result = token
          else if (fn === 'restore_cell_storyboard') {
            current = { ...state }
            result = null
          }
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  render(
    <>
      <StoryboardCellRows rows={rows} canEdit />
      <WriteFailureNotices />
    </>,
  )
  const form = await readyForm()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Saved text' },
  })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(
      within(form)
        .getByRole('textbox', { name: 'Caption' })
        .matches(':disabled'),
    ).toBe(false),
  )
  expect(screen.getByRole('form', { name: 'Edit Actor' })).toBe(form)
  expect(
    (
      within(form).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Saved text')
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  await waitFor(() =>
    expect(
      (
        within(form).getByRole('textbox', {
          name: 'Caption',
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('Original summary'),
  )
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Next draft' },
  })
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false)
})

it('limits the direct editor to picture controls and the stored Caption', async () => {
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async () =>
          new Response(JSON.stringify(state), {
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    },
  )
  render(<StoryboardCellRows rows={rows} canEdit />)
  expect(
    await screen.findByRole('textbox', { name: 'Caption', exact: true }),
  ).toBeTruthy()
  expect(
    screen.queryByRole('textbox', { name: 'Text', exact: true }),
  ).toBeNull()
  expect(
    screen.queryByRole('textbox', { name: 'Summary', exact: true }),
  ).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Open full cell', exact: true }),
  ).toBeNull()
  expect(
    screen.queryByRole('button', {
      name: 'Set saved image as the featured image',
    }),
  ).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Replace picture', exact: true }),
  ).toBeTruthy()
})

it('offers Reload when Undo succeeds but refreshing the visible caption fails', async () => {
  let current = { ...state }
  let failRead = false
  const token = '22222222-2222-4222-8222-222222222222'
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const fn = String(input).split('/').pop()
          const body = JSON.parse(String(init?.body ?? '{}'))
          if (fn === 'read_cell_storyboard' && failRead) {
            failRead = false
            return new Response(
              JSON.stringify({ message: 'Snapshot unavailable' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } },
            )
          }
          let result: unknown = current
          if (fn === 'update_cell_storyboard') {
            const before = current
            current = { ...current, summary: body.p_summary }
            result = {
              cell_id: 'cell',
              receipt_id: token,
              before,
              after: current,
            }
          } else if (fn === 'record_authoring_change') result = token
          else if (fn === 'restore_cell_storyboard') {
            current = { ...state }
            failRead = true
            result = null
          }
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  render(
    <>
      <StoryboardCellRows rows={rows} canEdit />
      <WriteFailureNotices />
    </>,
  )
  const form = await readyForm()
  fireEvent.change(within(form).getByRole('textbox', { name: 'Caption' }), {
    target: { value: 'Saved caption' },
  })
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await readyForm()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'could not be reloaded',
  )
  expect(
    within(form).getByRole('textbox', { name: 'Caption' }).matches(':disabled'),
  ).toBe(true)
  fireEvent.click(within(form).getByRole('button', { name: 'Reload cell' }))
  await readyForm()
  expect(
    (
      within(form).getByRole('textbox', {
        name: 'Caption',
      }) as HTMLTextAreaElement
    ).value,
  ).toBe('Original summary')
})

it('does not present action text as a caption when no caption is stored', () => {
  render(
    <StoryboardCellRows
      rows={[
        {
          ...rows[0],
          summary: 'Original text',
          cell: { ...rows[0].cell, summary: null },
        },
      ]}
      canEdit={false}
    />,
  )
  expect(screen.getByRole('button', { name: 'Expand: Actor' })).toBeTruthy()
  expect(screen.queryByText('Original text')).toBeNull()
  expect(screen.queryByText('No summary')).toBeNull()
})
