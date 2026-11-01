// @vitest-environment jsdom
/**
 * The dependency editor writes the column the dependency row reads.
 *
 * It did not. The editor offered one prose field labelled "Name (optional)"
 * and the agent's dependency tool offered one argument called `label`, and
 * both landed in `cell_dependencies.name` — the badge, the word on the arrow.
 * The row draws `cell_dependencies.note`. So an author who typed the sentence
 * the row exists to show put it somewhere nothing reads, was told the
 * connection had been made, and was right about that: the edge was saved and
 * the sentence was not shown.
 *
 * A deployment measured the cost from the data side. Of 434 dependency rows, 8
 * carried a name and none carried a note, and all 8 of the names were
 * sentences about why the edge exists. Authors were not misusing a badge
 * field; it was the only field they were offered.
 *
 * Both halves are pinned here — the editor and the agent tool — because they
 * are two write surfaces onto one column and either could be moved back
 * alone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const { setCellDependency, clearCellDependency } = vi.hoisted(() => ({
  setCellDependency: vi.fn(async () => 'dep-1'),
  clearCellDependency: vi.fn(async () => {}),
}))

/**
 * Spread over the real module rather than replacing it: `registry.ts` imports
 * a long list of writers from here and only two of them are being watched.
 */
vi.mock('@/lib/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authoringRpc')>()),
  setCellDependency,
  clearCellDependency,
}))

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))

import { CellDependencyEditor } from '@/components/blueprint/CellDependencyEditor'
import { dispatchTool } from '@/lib/agent/tools/registry'
import { TOOL_SPECS } from '@/lib/agent/tools/specs'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOTE = 'The portal is only reachable once the account exists.'

afterEach(() => {
  cleanup()
  setCellDependency.mockClear()
  clearCellDependency.mockClear()
})

/** Two cells on one path, which is the only pairing the editor will accept. */
function draw() {
  render(
    <CellDependencyEditor
      source={{ cellId: 'cell-1', label: '1 · Apply — Customer' }}
      candidates={[
        { cellId: 'cell-1', label: '1 · Apply — Customer' },
        { cellId: 'cell-2', label: '2 · Review — Backstage' },
      ]}
      existing={[]}
      onDone={() => {}}
    />,
  )
}

/** Fill the form the way an author does, and press the one button that saves. */
function connectWith(text: string) {
  fireEvent.change(screen.getByLabelText('Connect to'), {
    target: { value: 'cell-2' },
  })
  fireEvent.change(screen.getByLabelText('Note (optional)'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
}

describe('the dependency editor s prose field', () => {
  it('is labelled Note and says it is optional', () => {
    // The label is half the fix. "Name" made an author decide whether their
    // sentence counted as one, and the honest answer was no.
    draw()
    expect(screen.getByLabelText('Note (optional)')).not.toBeNull()
  })

  it('invites anything worth knowing, rather than one kind of remark', () => {
    // Deliberately general. "Why this edge exists" is narrower than what
    // authors write, and a narrow frame is what sent them to the wrong field.
    draw()
    const field = screen.getByLabelText('Note (optional)')
    expect(field.getAttribute('placeholder')).toBe(
      'Anything worth knowing about this dependency',
    )
  })

  it('offers no second prose field to lose a sentence in', () => {
    draw()
    expect(screen.queryByLabelText(/^Name/)).toBeNull()
    expect(screen.queryByPlaceholderText(/^Name/)).toBeNull()
  })

  it('writes the note, and writes no name', async () => {
    draw()
    connectWith(NOTE)
    await vi.waitFor(() => expect(setCellDependency).toHaveBeenCalledTimes(1))
    const [, payload] = setCellDependency.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ]
    expect(payload.note).toBe(NOTE)
    expect(payload).not.toHaveProperty('name')
  })
})

describe('the agent s dependency tool', () => {
  /**
   * The argument keeps the spelling it was published with. Changing where a
   * value lands is safe for a skill pinned to an older release — it goes on
   * sending `label` and the sentence now arrives somewhere a reader sees it.
   * Changing the spelling at the same time would not be: that release's skill
   * would send a key this handler no longer reads, and the value would be
   * dropped in silence.
   */
  it('still declares the argument it was published with', () => {
    const spec = TOOL_SPECS.find((entry) => entry.name === 'create_cell_dependency')
    expect(spec).toBeDefined()
    expect(
      Object.keys(spec!.parameters.properties as Record<string, unknown>),
    ).toContain('label')
  })

  it('lands that argument in the note', async () => {
    const client = {} as unknown as SupabaseClient
    await dispatchTool(client, 'session-1', 'create_cell_dependency', {
      source_cell_id: 'cell-1',
      target_cell_id: 'cell-2',
      kind: 'enables',
      label: NOTE,
    })
    expect(setCellDependency).toHaveBeenCalledTimes(1)
    const [, payload] = setCellDependency.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ]
    expect(payload.note).toBe(NOTE)
    expect(payload.name).toBeUndefined()
  })
})
