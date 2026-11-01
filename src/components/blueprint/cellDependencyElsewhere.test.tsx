// @vitest-environment jsdom
/**
 * The Dependencies tab lists a link to another path with the rest of them,
 * says where its other end is, goes there, and removes it the way it removes
 * any row this cell owns.
 *
 * A row for an end on this board selects that cell; an end on another path
 * is not on this board, so the same click goes there instead. Writes and the
 * jump are stubbed at their module boundaries, as the in-place editing tests
 * stub them.
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

const rpc = vi.hoisted(() => ({
  clear: vi.fn(async (_client: unknown, _dependencyId: string) => undefined),
  update: vi.fn(async () => ({})),
}))
const jump = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
vi.mock('@/lib/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authoringRpc')>()),
  clearCellDependency: rpc.clear,
  updateCellDependency: rpc.update,
}))
vi.mock('@/hooks/useJumpToCell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useJumpToCell')>()),
  useJumpToCell: () => jump,
}))

import { CellDependencySections } from '@/components/blueprint/CellDependencySections'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ROW_REVEAL_CLASS } from '@/lib/rowReveal'

afterEach(() => {
  cleanup()
  rpc.clear.mockReset()
  jump.mockReset()
})

const SOURCE = { cellId: 'cell-review', label: '2. Reviews the goal · Tutor' }
const REPORT_LABEL = 'Weekly class report › Main route · Writes it up · Tutor'

const elsewhere = (
  patch: Partial<BlueprintCellConnection> = {},
): BlueprintCellConnection => ({
  dependencyId: 'edge-to-report',
  cellId: 'cell-report',
  laneName: 'Tutor',
  laneRowPosition: -1,
  stepName: 'Writes it up',
  stepIndex: -1,
  kind: 'connection',
  linkKind: 'leads_to',
  linkNote: null,
  isTech: false,
  techItems: [],
  contentPreview: 'Writes the weekly report',
  reachedIn: {
    pathId: 'path-report',
    pathName: 'Main route',
    scenarioId: 'scenario-report',
    scenarioName: 'Weekly class report',
    phaseName: 'Week',
    placeName: 'Weekly class report',
    placeLabel: 'Weekly class report › Main route',
    placeDetail: 'Main route › Weekly class report · Week',
  },
  ...patch,
})

function draw({
  incoming = [] as BlueprintCellConnection[],
  outgoing = [] as BlueprintCellConnection[],
  edit = false,
  onCellSelect = vi.fn(),
  onEditFromOwner = vi.fn(),
} = {}) {
  render(
    <TooltipProvider>
      <CellDependencySections
        connections={{ incoming, outgoing }}
        otherTech={[]}
        editing={
          edit
            ? {
                source: SOURCE,
                candidates: [SOURCE, { cellId: 'cell-report', label: REPORT_LABEL }],
                existing: [],
                onEditFromOwner,
              }
            : null
        }
        onCellSelect={onCellSelect}
        onTechSelect={() => {}}
      />
    </TooltipProvider>,
  )
  return { onCellSelect, onEditFromOwner }
}

const group = (title: string) => {
  const found = document.querySelector<HTMLElement>(
    `[data-dependency-group="${title}"]`,
  )
  if (!found) throw new Error(`no "${title}" group is drawn`)
  return found
}

describe('a link to another path, in the list', () => {
  it('is one line at rest — lane and step — with a muted mark that it leaves this path', () => {
    draw({ outgoing: [elsewhere()] })
    const row = within(group('Leads to')).getByRole('button', { name: /Tutor/ })
    expect(row.textContent).toBe('Tutor · Writes it upOn another path')
    expect(row.querySelector('[data-dependency-leaves-path]')).not.toBeNull()
    // Named for a screen reader, hidden from sight: the arrow is the mark.
    expect(within(row).getByText('On another path').className).toContain('sr-only')
  })

  it('describes where it lands, then what the far cell says', () => {
    draw({ outgoing: [elsewhere()] })
    const row = within(group('Leads to')).getByRole('button', { name: /Tutor/ })
    const description = document.getElementById(row.getAttribute('aria-describedby')!)
    expect(description?.textContent).toBe(
      'Main route › Weekly class report · WeekWrites the weekly report',
    )
  })

  it('lists the recorded kind too, which no marker draws', () => {
    draw({
      incoming: [elsewhere({ dependencyId: 'edge-enabled', linkKind: 'enables' })],
    })
    expect(group('Enabled by').textContent).toContain('Weekly class report')
  })

  it('goes to the other end rather than selecting a cell this board does not hold', () => {
    const { onCellSelect } = draw({ incoming: [elsewhere({ dependencyId: 'edge-in' })] })
    fireEvent.click(
      within(group('Follows')).getByRole('button', { name: /Tutor/ }),
    )
    expect(onCellSelect).not.toHaveBeenCalled()
    expect(jump).toHaveBeenCalledWith({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
  })
})

describe('a link to another path, in edit mode', () => {
  it('is removed from its row like any link this cell owns', async () => {
    draw({ outgoing: [elsewhere()], edit: true })
    fireEvent.click(
      screen.getByLabelText(`Remove the connection to ${REPORT_LABEL}`),
    )
    await waitFor(() =>
      expect(rpc.clear).toHaveBeenCalledWith({}, 'edge-to-report'),
    )
  })

  it('reveals its pencil on hover and focus, and always where the pointer is coarse', () => {
    draw({ incoming: [elsewhere({ dependencyId: 'edge-in' })], edit: true })
    const pencil = within(group('Follows')).getByLabelText(/^Edit in /)
    expect(pencil.closest('span')?.className).toContain(ROW_REVEAL_CLASS)
  })

  it('is edited from its owner on the other path, and the pencil goes there', () => {
    const { onEditFromOwner } = draw({
      incoming: [elsewhere({ dependencyId: 'edge-in' })],
      edit: true,
    })
    fireEvent.click(within(group('Follows')).getByLabelText(/^Edit in /))
    expect(onEditFromOwner).not.toHaveBeenCalled()
    expect(jump).toHaveBeenCalledWith({
      cellId: 'cell-report',
      pathId: 'path-report',
      scenarioId: 'scenario-report',
    })
  })
})
