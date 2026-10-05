// @vitest-environment jsdom
/**
 * The cell budget is advice, not a gate — for the person in the panel as
 * well as for the agent. This file holds the two paths against each other.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureCellBudget, getCellContentLengthGuidance } from '@/lib/cellContentLimits'
import { resolveDeploymentConfig } from '@/deploymentConfig'
import { dispatchTool } from '@/lib/agent/tools/registry'
import { sourceOf } from '@/lib/sourceTree'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

vi.mock('@/lib/cellContentMutations', () => ({
  updateCellContent: vi.fn(async () => {}),
  // The agent's create goes through the occupancy-guarded create; the
  // person's edit through the content writer. Both are stubbed: the subject
  // is the sentence each hears, not the write.
  createCell: vi.fn(async () => ({ id: 'cell-1', inserted: true, previous: null })),
  laneBudgetKind: vi.fn(async () => 'prose'),
}))
vi.mock('@/lib/cellSpecMutations', () => ({
  updateCellSpec: vi.fn(async () => {}),
}))
vi.mock('@/lib/authoringRpc', () => ({
  upsertCell: vi.fn(async () => ({
    id: 'cell-1',
    inserted: true,
    previous: null,
  })),
}))
vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client: {}, configured: true, canWrite: true }),
}))
vi.mock('@/contexts/BlueprintCellDetailContext', () => ({
  useBlueprintCellDetailOptional: () => ({
    blueprints: [
      {
        cells: [
          {
            id: 'cell-1',
            lane_id: 'lane-1',
            content: 'Intake portal',
            summary: 'Where a report is filed.',
            owner: 'Support',
            perceived_owner: 'The council',
            status: 'planned',
            resources: [],
          },
        ],
        lanes: [{ id: 'lane-1', name: 'Customer Actions', role: 'customer_actions' }],
      },
    ],
  }),
}))
vi.mock('@/hooks/useValueAudiences', () => ({
  useValueAudiences: () => ({ status: 'ready', data: [] }),
}))
vi.mock('@/hooks/useRegistryTouchpoints', () => ({
  useRegistryTouchpoints: () => ({ status: 'ready', data: [] }),
  useNameOnlyPlacements: () => ({ status: 'ready', data: [] }),
  useTouchpointEntry: () => ({ status: 'loading' }),
}))
vi.mock('@/components/blueprint/OwnerTagSelect', () => ({
  OwnerTagSelect: ({
    value,
    ariaLabel,
  }: {
    value: string
    ariaLabel: string
    onChange: (next: string) => void
  }) => <input aria-label={ariaLabel} value={value} readOnly />,
}))
vi.mock('@/components/blueprint/StatusSelect', () => ({
  StatusSelect: ({ value }: { value: string; onChange: (next: string) => void }) => (
    <select aria-label="Status" value={value}>
      <option value={value}>{value}</option>
    </select>
  ),
}))

import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'

/**
 * Enough of a client for one cell write: an empty slot for the occupancy
 * guard, and an RPC that the mocked `upsertCell` never actually reaches.
 */
function writingClient() {
  const chain = {
    select: () => chain,
    update: () => chain,
    eq: () => chain,
    or: () => chain,
    limit: () => Promise.resolve({ data: [] as unknown[], error: null }),
    maybeSingle: () =>
      Promise.resolve({
        data: {
          content: 'What the cell said before',
          summary: null,
          status: 'live',
          owner: null,
          perceived_owner: null,
          function: null,
          form: null,
          value_props: null,
        },
        error: null,
      }),
    then: (
      resolve: (value: { data: unknown; error: null }) => unknown,
    ): unknown => resolve({ data: [{ id: 'cell-1' }], error: null }),
  }
  return {
    from: () => chain,
    rpc: () => Promise.resolve({ data: 'cell-1', error: null }),
  } as unknown as SupabaseClient<Database>
}

afterEach(() => {
  configureCellBudget(resolveDeploymentConfig().cellBudget)
  cleanup()
})

describe('the cell editor imposes no maximum length', () => {
  it('does not stop the field at a character cap', () => {
    const editor = sourceOf('components/blueprint/CellPanelEditor.tsx')
    expect(editor).not.toMatch(/maxLength/)
    expect(editor).not.toMatch(/CELL_CONTENT_MAX/)

    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)
    const input = screen.getByDisplayValue('Intake portal')
    expect(input.getAttribute('maxLength')).toBeNull()
    expect(input.getAttribute('maxlength')).toBeNull()
    const long = 'a'.repeat(200)
    fireEvent.change(input, { target: { value: long } })
    expect((input as HTMLInputElement).value).toBe(long)
  })
})

describe('a person and the agent hear the same thresholds', () => {
  it('names the same target and warning under the field and in the tool result', async () => {
    configureCellBudget({
      prose: { target: 40, warning: 60 },
      touchpointLabels: { target: 12, warning: 20 },
    })
    const over = 'w'.repeat(61)
    const personMessage = getCellContentLengthGuidance(over, 'prose').message
    expect(personMessage).toContain('40')
    expect(personMessage).toContain('60')

    render(<CellPanelEditor cellId="cell-1" onDone={() => {}} />)
    fireEvent.change(screen.getByDisplayValue('Intake portal'), {
      target: { value: over },
    })
    expect(screen.getByRole('status').textContent).toBe(personMessage)

    const agentReply = await dispatchTool(
      writingClient(),
      'session',
      'upsert_cell',
      {
        path_id: 'p',
        lane_id: 'l',
        step_id: 's',
        content: over,
      },
    )
    expect(agentReply).toContain(personMessage)
  })
})
