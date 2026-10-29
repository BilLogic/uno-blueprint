// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  render(<StoryboardCellRows rows={rows} canEdit onOpenFullCell={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Actor' }))
  const form = await screen.findByRole('form', { name: 'Edit Actor' })
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.change(within(form).getByRole('textbox', { name: 'Text' }), {
    target: { value: 'Draft' },
  })
  const close = vi.fn()
  requestPanelTransition(close)
  const prompt = await screen.findByRole('alertdialog')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(within(prompt).getByRole('button', { name: 'Keep editing' }))
  expect(
    (within(form).getByRole('textbox', { name: 'Text' }) as HTMLTextAreaElement)
      .value,
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
  render(<StoryboardCellRows rows={rows} canEdit onOpenFullCell={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Actor' }))
  const form = await screen.findByRole('form', { name: 'Edit Actor' })
  const text = await within(form).findByRole('textbox', { name: 'Text' })
  // The read completing makes the editor available.
  await screen.findByRole('button', { name: 'Open full cell' })
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
it('saves picture, text and summary in one cell change and offers that change’s own Undo', async () => {
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
  const editor = render(
    <StoryboardCellRows rows={rows} canEdit onOpenFullCell={() => {}} />,
  )
  render(<WriteFailureNotices />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Actor' }))
  const form = await screen.findByRole('form', { name: 'Edit Actor' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Text' }), {
    target: { value: 'Saved text' },
  })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Summary' }), {
    target: { value: 'Saved summary' },
  })
  fireEvent.click(
    within(form).getByRole('button', { name: 'Remove featured image' }),
  )
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved the cell')
  editor.unmount()
  expect(sessionSnapshot()).toHaveLength(1)
  expect(calls.filter((call) => call.fn === 'update_cell_storyboard')).toEqual([
    {
      fn: 'update_cell_storyboard',
      body: {
        p_cell_id: 'cell',
        p_content: 'Saved text',
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

it('View offers pictures without Edit, while Cancel and blank Text cannot write', async () => {
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
  const view = render(
    <StoryboardCellRows
      rows={rows}
      canEdit={false}
      onOpenFullCell={() => {}}
    />,
  )
  expect(screen.queryByRole('button', { name: 'Edit Actor' })).toBeNull()
  view.rerender(
    <StoryboardCellRows rows={rows} canEdit onOpenFullCell={() => {}} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Edit Actor' }))
  const form = await screen.findByRole('form', { name: 'Edit Actor' })
  fireEvent.change(within(form).getByRole('textbox', { name: 'Text' }), {
    target: { value: ' ' },
  })
  expect(
    (within(form).getByRole('button', { name: 'Save' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('form')).toBeNull()
  expect(writes).not.toHaveBeenCalled()
})

it('Add picture opens the same editor focused on its picture control, and Save joins the strip', async () => {
  const before = { ...state, frame: null }
  const unpictured = [
    {
      ...rows[0],
      frame: '',
      cell: {
        ...rows[0].cell,
        frame: null,
        resources: [
          {
            id: 'image',
            kind: 'attachment' as const,
            name: 'Diagram',
            url: 'https://example.test/diagram.png',
            position: 0,
          },
        ],
      },
    },
  ]
  const calls: string[] = []
  session.client = createClient<Database>(
    'https://example.supabase.co',
    'key',
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const fn = String(input).split('/').pop()!
          calls.push(fn)
          const body = JSON.parse(String(init?.body ?? '{}'))
          const result =
            fn === 'read_cell_storyboard'
              ? before
              : fn === 'record_authoring_change'
              ? '22222222-2222-4222-8222-222222222222'
              : {
                  cell_id: 'cell',
                  receipt_id: '22222222-2222-4222-8222-222222222222',
                  before,
                  after: { ...before, frame: body.p_frame },
                }
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  const editor = render(
    <StoryboardCellRows
      rows={unpictured}
      canEdit={false}
      onOpenFullCell={() => {}}
    />,
  )
  expect(screen.queryByText('Actor')).toBeNull()
  editor.rerender(
    <StoryboardCellRows rows={unpictured} canEdit onOpenFullCell={() => {}} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add picture for Actor' }))
  const form = await screen.findByRole('form', { name: 'Edit Actor' })
  const choose = within(form).getByRole('button', {
    name: 'Set Diagram as the featured image',
  })
  await vi.waitFor(() => expect(document.activeElement).toBe(choose))
  fireEvent.click(choose)
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
  await vi.waitFor(() => expect(screen.queryByRole('form')).toBeNull())
  editor.rerender(
    <StoryboardCellRows
      rows={[
        {
          ...unpictured[0],
          frame: 'https://example.test/diagram.png',
          cell: {
            ...unpictured[0].cell,
            frame: 'https://example.test/diagram.png',
          },
        },
      ]}
      canEdit
      onOpenFullCell={() => {}}
    />,
  )
  expect(screen.getByRole('button', { name: 'Edit Actor' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Expand: Actor' })).toBeTruthy()
  expect(calls).toEqual([
    'read_cell_storyboard',
    'update_cell_storyboard',
    'record_authoring_change',
  ])
})
