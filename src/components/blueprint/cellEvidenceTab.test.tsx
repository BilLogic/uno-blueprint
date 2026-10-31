// @vitest-environment jsdom
/**
 * A source is three fields and one note.
 *
 * The seam is the tab, not the form or the row, because the change is one
 * claim that spans all three: what an author is asked for, what reaches the
 * mutation, and what a reader gets back. A test that mounted the form alone
 * could not say whether the row still wears three type treatments, and a test
 * that asserted which column a value landed in would have gone green on the
 * shape this change exists to remove — `excerpt` was a real column holding
 * two values in 66 rows, one of them not a quote.
 *
 * So every assertion here is what a person sees: a label, a rendered anchor,
 * the absence of a separator. The one exception is the argument `addEvidence`
 * is called with, which is the agent-facing half of the same claim.
 *
 * A placeholder cannot do a label's job — it describes a box only until
 * somebody types into it — so the labelling assertions are made twice, empty
 * and full. A field says it may be left empty the one way this panel says
 * it: `Field`'s asterisk on the field that may not, rather than the word
 * "optional" beside the ones that may.
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellEvidenceTab } from '@/components/blueprint/CellEvidenceTab'
import { PANEL_TEXTAREA_CLASS } from '@/components/blueprint/panelShell'
import type { Evidence } from '@/types/database'
import { setActiveService } from '@/contexts/activeService'

/** The draft the tab hands the mutation — the agent-facing half of the claim. */
type Draft = Record<string, unknown>
const addEvidence = vi.fn<(client: unknown, draft: Draft) => Promise<string>>(
  async () => 'e-new',
)
vi.mock('@/lib/evidenceMutations', () => ({
  addEvidence: (client: unknown, draft: Draft) => addEvidence(client, draft),
}))

/** The draft of the nth call, once one has been made. */
const draftOf = (call: number): Draft => {
  const args = addEvidence.mock.calls[call]
  if (!args) throw new Error(`addEvidence was not called ${call + 1} time(s)`)
  return args[1]
}
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
// The service is the resolved store's; the root that would set it is stood
// in for below.
setActiveService({ id: 'svc-1', slug: 'svc-1', name: 'Rooftop Retrofit' })

let rows: Evidence[] = []
vi.mock('@/hooks/useEvidence', () => ({
  useEvidence: () => ({ status: 'ready', data: rows, source: 'database' }),
}))

const source = (over: Partial<Evidence> & { id: string }): Evidence =>
  ({
    cell_id: 'cell-1',
    cell_key: 'cell-1',
    proposition_question_key: null,
    kind: 'interview',
    title: 'Onboarding interview 4',
    note: null,
    observed_at: null,
    added_by: null,
    created_by: null,
    service_id: 'svc-1',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...over,
  }) as Evidence

const open = () => {
  const view = render(<CellEvidenceTab cellId="cell-1" />)
  fireEvent.click(view.getByRole('button', { name: 'Add source' }))
  return view
}

beforeEach(() => {
  rows = []
  addEvidence.mockClear()
})
afterEach(cleanup)

describe('the add-a-source form', () => {
  it('asks three questions, in one group, with no rule between them', () => {
    const view = open()
    const form = view.container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.querySelector('hr')).toBeNull()
    expect(form?.querySelector('[role="separator"]')).toBeNull()
    expect(form?.querySelector('.border-t')).toBeNull()
    // Three controls, and the count is the assertion: a fourth would be the
    // author sorting a sentence into boxes again. Counted by the panel's own
    // control slots rather than by tag, because the panel select renders a
    // trigger button over a hidden native input, and a bare `input` sweep
    // counts that hidden one as a field an author can see.
    expect(
      form?.querySelectorAll(
        '[data-slot="input"], [data-slot="select-trigger"], textarea',
      ),
    ).toHaveLength(3)
  })

  it('sets the kind and the title on one row, and the note under them', () => {
    // A kind is a short enum and a title is a sentence. Stacked, they were
    // two of three full-width boxes in a narrow panel, and the enum was as
    // wide as the sentence.
    const view = open()
    const form = view.container.querySelector('form') as HTMLFormElement
    const rowOf = (control: HTMLElement) =>
      Array.from(form.children).find((child) => child.contains(control))

    const kindRow = rowOf(view.getByLabelText('Kind'))
    expect(kindRow).toBeDefined()
    expect(rowOf(view.getByLabelText('Title'))).toBe(kindRow)
    expect(rowOf(view.getByLabelText('Note'))).not.toBe(kindRow)
  })

  it('labels every field, and keeps saying so once they are full', () => {
    const view = open()

    // The label a reader sees, and the name the control answers to.
    for (const label of ['Kind', 'Title', 'Note']) {
      expect(view.getByText(label, { selector: 'span' })).toBeTruthy()
      expect(view.getByLabelText(label)).toBeTruthy()
    }
    expect(view.queryByLabelText('Source reference')).toBeNull()
    expect(view.queryByLabelText('Source excerpt')).toBeNull()

    fireEvent.change(view.getByLabelText('Title'), {
      target: { value: 'Site visit, household 3' },
    })
    fireEvent.change(view.getByLabelText('Note'), {
      target: { value: 'Household 3 found the consent form on the second try.' },
    })
    expect(view.getByText('Title', { selector: 'span' })).toBeTruthy()
    expect(view.getByText('Note', { selector: 'span' })).toBeTruthy()
  })

  it('marks the one field that cannot be left empty, and says it once', () => {
    const view = open()
    const title = view.getByText('Title', { selector: 'span' }).parentElement
    const note = view.getByText('Note', { selector: 'span' }).parentElement
    expect(title?.textContent).toBe('Title*')
    expect(note?.textContent).toBe('Note')
    expect(view.container.textContent).not.toContain('optional')
  })

  it('wears the shared input, the panel select and the panel textarea', () => {
    const { getByLabelText, container } = open()

    // The kind control is the panel's own select, not a bare `<select>`
    // wearing hand-written classes — which clipped its value and was the one
    // control in the panel with no hover state.
    expect(container.querySelector('select')).toBeNull()
    const kind = getByLabelText('Kind')
    expect(kind.getAttribute('data-slot')).toBe('select-trigger')

    // The title is the shared input at its own size. The two share a row, so
    // they share a height: a title squeezed to `h-7` beside an `h-8` trigger
    // is a row whose baselines do not meet.
    const title = getByLabelText('Title')
    expect(title.getAttribute('data-slot')).toBe('input')
    expect(title.className).toContain('h-8')
    expect(title.className).not.toMatch(/\bh-7\b/)
    expect(kind.className).toContain('h-8')

    // The cell panel's multi-line treatment, shared from `panelShell` rather
    // than a fifth copy of its focus ring.
    expect(getByLabelText('Note').className).toBe(PANEL_TEXTAREA_CLASS)
  })

  it('saves a source that is only a kind and a title', async () => {
    const view = open()
    fireEvent.change(view.getByLabelText('Title'), {
      target: { value: '  Metabase, 2026-08-08  ' },
    })
    fireEvent.click(view.getByRole('button', { name: 'Add source' }))
    await waitFor(() => expect(addEvidence).toHaveBeenCalled())
    expect(draftOf(0)).toMatchObject({
      kind: 'interview',
      title: 'Metabase, 2026-08-08',
      note: null,
    })
  })

  it('sends the note as the one piece of prose, and nothing beside it', async () => {
    const view = open()
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'PR 1151' } })
    fireEvent.change(view.getByLabelText('Note'), {
      target: { value: 'Shipped behind a flag — https://example.com/pr/1151' },
    })
    fireEvent.click(view.getByRole('button', { name: 'Add source' }))
    await waitFor(() => expect(addEvidence).toHaveBeenCalled())
    const draft = draftOf(0)
    expect(draft.note).toBe('Shipped behind a flag — https://example.com/pr/1151')
    expect(draft).not.toHaveProperty('ref')
    expect(draft).not.toHaveProperty('excerpt')
  })
})

describe('a saved source', () => {
  it('renders the kind as a word beside the title', () => {
    rows = [source({ id: 'e-1', kind: 'meeting', title: 'Intake review' })]
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    const row = view.getByRole('listitem')
    expect(row.textContent).toContain('Intake review')
    expect(row.textContent).toContain('meeting')
  })

  it('carries the prose the renamed column holds, in one text treatment', () => {
    rows = [
      source({
        id: 'e-1',
        note: 'Team agreed every intake call must state that help is available on demand',
      }),
    ]
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    const row = view.getByRole('listitem')
    expect(row.textContent).toContain('help is available on demand')
    // The three that used to stack: a monospaced link, an italic passage, and
    // the rule down its left edge.
    expect(row.querySelector('.font-mono')).toBeNull()
    expect(row.querySelector('.italic')).toBeNull()
    expect(row.querySelector('.border-l-2')).toBeNull()
  })

  it('makes a URL written inside the note a link', () => {
    rows = [
      source({
        id: 'e-1',
        note: 'Numbers are in the dashboard: https://example.com/dash?q=1 — refreshed nightly.',
      }),
    ]
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    const link = view.getByRole('link', { name: 'https://example.com/dash?q=1' })
    expect(link.getAttribute('href')).toBe('https://example.com/dash?q=1')
    expect(link.getAttribute('rel')).toContain('noopener')
    // The sentence around it survives as text.
    expect(view.getByRole('listitem').textContent).toContain('refreshed nightly.')
  })

  it('leaves a note with no URL alone', () => {
    rows = [source({ id: 'e-1', note: 'See the note in data-model.md' })]
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    expect(view.queryByRole('link')).toBeNull()
  })
})

it('renders preserved evidence when its cell is detached, without needing a live cell', () => {
  rows = [source({ id: 'kept-source', cell_id: 'detached-cell', title: 'Retained observation', note: 'The original claim remains traceable.' })]
  const view = render(<CellEvidenceTab cellId="detached-cell" />)
  expect(view.getByText('Retained observation')).toBeTruthy()
  expect(view.getByText('The original claim remains traceable.')).toBeTruthy()
})
