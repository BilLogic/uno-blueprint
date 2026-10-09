// @vitest-environment jsdom
/**
 * A row belongs to the service you are looking at — and keeps belonging to
 * the one you switch to.
 *
 * The wrong-service family: evidence, a slice and a phase each once landed on
 * the first service by `created_at`, whatever the URL said, because each
 * surface resolved a service for itself. Now none of them resolves anything:
 * the shell resolves once into a store, and every write surface and the
 * agent's dispatcher read the answer. So there is one thing left to assert,
 * and one place to assert it: with the store set to one service, every
 * write names that service; switch the store mid-session, and the next
 * write from the same mounted surface names the other. The per-site tests
 * this replaces each mocked their way around a resolver; this one has no
 * resolver to mock.
 *
 * A step has no service of its own — it belongs to a path — so no step
 * write takes a service id, and none is asserted here.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CellEvidenceTab } from '@/components/blueprint/CellEvidenceTab'
import { CreateSliceSheet } from '@/components/editor/CreateSliceSheet'
import { SlideModeSidebarNav } from '@/components/editor/SlideModeView'
import { StructureRowContextMenu } from '@/components/editor/StructureRowMenu'
import { setActiveService } from '@/contexts/activeService'
import { runTool } from '@/lib/agent/tools/definition'
import { createEvidenceTool } from '@/lib/agent/tools/definitions/evidence'
import { createFindingTool } from '@/lib/agent/tools/definitions/findings'
import { createPhaseTool } from '@/lib/agent/tools/definitions/journey'
import { createSliceTool } from '@/lib/agent/tools/definitions/slices'
import { fakeToolContext } from '@/lib/agent/tools/definitions/testContext'
import { dispatchTool } from '@/lib/agent/tools/registry'
import type { Database } from '@/types/database'

const ROOFTOP = { id: 'svc-1', slug: 'rooftop-retrofit', name: 'Rooftop Retrofit' }
const HEAT_PUMPS = { id: 'svc-2', slug: 'heat-pump-grants', name: 'Heat Pump Grants' }

/** Nothing here reads the database; the client is a token the writes are handed. */
const client = {} as unknown as SupabaseClient<Database>

vi.mock('@/contexts/SupabaseProvider', () => ({
  useSupabase: () => ({ client, configured: true, canWrite: true, isEditPreview: false }),
}))

/** The writes, captured at the mutation seam: which service each was given. */
const evidenceServiceIds: (string | undefined)[] = []
vi.mock('@/lib/evidenceMutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/evidenceMutations')>()),
  addEvidence: async (_client: unknown, draft: { serviceId?: string }) => {
    evidenceServiceIds.push(draft.serviceId)
    return 'e-new'
  },
}))
const sliceServiceIds: (string | undefined)[] = []
vi.mock('@/lib/sliceMutations', () => ({
  createSlice: async (_client: unknown, input: { serviceId?: string }) => {
    sliceServiceIds.push(input.serviceId)
    return { id: 'slice-new' }
  },
}))
const phaseServiceIds: (string | undefined)[] = []
vi.mock('@/lib/authoringRpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/authoringRpc')>()),
  createPhase: async (_client: unknown, input: { serviceId: string }) => {
    phaseServiceIds.push(input.serviceId)
    return 'phase-new'
  },
}))

/** The phase dialog is the seam for the two sidebar affordances: the prop IS the answer. */
const phaseDialogServiceIds: (string | null)[] = []
vi.mock('@/components/editor/CreatePhaseDialog', () => ({
  CreatePhaseDialog: ({ serviceId }: { serviceId: string | null }) => {
    phaseDialogServiceIds.push(serviceId)
    return null
  },
}))

vi.mock('@/hooks/useEvidence', () => ({
  useEvidence: () => ({ status: 'ready', data: [], source: 'database' }),
}))
vi.mock('@/contexts/viewStateStore', () => ({
  useViewState: () => ({ openTab: () => {}, activeKey: null, activateTab: () => {} }),
}))
vi.mock('@/contexts/canvasModeContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/canvasModeContext')>()),
  useCanvasModeValue: () => 'design',
}))

// Chrome around the subjects. None of it decides which service a row lands on.
vi.mock('@/components/editor/SliceSlideComposer', () => ({ SliceSlideComposer: () => null }))
vi.mock('@/components/editor/SlideNav', () => ({ SlideNav: () => null }))
vi.mock('@/components/editor/SlicesSidebarSection', () => ({ SlicesSidebarSection: () => null }))
vi.mock('@/components/editor/CreateBlueprintDialog', () => ({ CreateBlueprintDialog: () => null }))
vi.mock('@/components/editor/CreateVersionDialog', () => ({ CreateVersionDialog: () => null }))
vi.mock('@/components/editor/DeleteStructureDialog', () => ({ DeleteStructureDialog: () => null }))
vi.mock('@/components/ui/sidebar', () => ({
  SidebarContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/hooks/useArchiveAvailable', () => ({ useArchiveAvailable: () => true }))
vi.mock('@/hooks/useScenarioPaths', () => ({ useScenarioPaths: () => ({ status: 'loading' }) }))
vi.mock('@/contexts/EditorContext', () => ({
  useEditor: () => ({
    slides: [],
    selectPhase: () => {},
    selectScenario: () => {},
    openScenario: () => {},
    selectedPhaseId: null,
    selectedScenarioId: null,
    focusNonce: 0,
    view: 'home',
    slidesLoading: false,
    slidesError: null,
    expandedPhaseIds: [],
    setPhaseExpanded: () => {},
  }),
}))

beforeEach(() => {
  evidenceServiceIds.length = 0
  sliceServiceIds.length = 0
  phaseServiceIds.length = 0
  phaseDialogServiceIds.length = 0
  setActiveService(ROOFTOP)
})

afterEach(() => {
  cleanup()
  setActiveService(null)
})

/** Name a source and save it, on an already-mounted tab. */
function addASource(view: ReturnType<typeof render>, title: string) {
  fireEvent.click(view.getByRole('button', { name: 'Add source' }))
  fireEvent.change(view.getByLabelText('Title'), { target: { value: title } })
  fireEvent.click(view.getByRole('button', { name: 'Add source' }))
}

describe('a write lands on the active service, and follows a switch', () => {
  it('evidence, from one mounted tab, before and after the switch', async () => {
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    addASource(view, 'Site visit, household 3')
    await waitFor(() => expect(evidenceServiceIds).toEqual(['svc-1']))

    act(() => setActiveService(HEAT_PUMPS))
    addASource(view, 'Metabase, 2026-08-08')
    await waitFor(() => expect(evidenceServiceIds).toEqual(['svc-1', 'svc-2']))
  })

  it('a slice, from one mounted sheet, before and after the switch', async () => {
    const view = render(
      <CreateSliceSheet
        cellIds={['cell-1']}
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        trigger={<button type="button">New slice</button>}
      />,
    )
    const createASlice = (title: string) => {
      fireEvent.click(view.getByRole('button', { name: 'Next' }))
      fireEvent.change(view.getByPlaceholderText('First-time customer journey'), {
        target: { value: title },
      })
      fireEvent.click(view.getByRole('button', { name: 'Create slice' }))
    }
    createASlice('Grant application, end to end')
    await waitFor(() => expect(sliceServiceIds).toEqual(['svc-1']))

    act(() => setActiveService(HEAT_PUMPS))
    createASlice('Fault report, end to end')
    await waitFor(() => expect(sliceServiceIds).toEqual(['svc-1', 'svc-2']))
  })

  it("a phase from the sidebar's `+`: the dialog is handed the active id, and the next one after a switch", async () => {
    render(<SlideModeSidebarNav panel="blueprints" />)
    await waitFor(() => expect(phaseDialogServiceIds).toContain('svc-1'))
    act(() => setActiveService(HEAT_PUMPS))
    await waitFor(() => expect(phaseDialogServiceIds).toContain('svc-2'))
  })

  it("a phase from a row menu's New phase: the same id, from the same store", async () => {
    const view = render(
      <StructureRowContextMenu kind="phase" id="phase-1" name="Discover">
        <div>Discover</div>
      </StructureRowContextMenu>,
    )
    fireEvent.contextMenu(view.getByText('Discover'))
    fireEvent.click(await view.findByText('New phase'))
    await waitFor(() => expect(phaseDialogServiceIds).toContain('svc-1'))
    act(() => setActiveService(HEAT_PUMPS))
    await waitFor(() => expect(phaseDialogServiceIds).toContain('svc-2'))
  })

  it("a phase the agent creates lands on the store's service through the dispatcher, before and after the switch", async () => {
    // Through `dispatchTool`, not a hand-built context: the dispatcher is the
    // agent session's resolution point, and this is the store → ctx.service
    // seam under test.
    await dispatchTool(client, 'session', 'create_phase', { name: 'Onboard' })
    act(() => setActiveService(HEAT_PUMPS))
    await dispatchTool(client, 'session', 'create_phase', { name: 'Renew' })
    expect(phaseServiceIds).toEqual(['svc-1', 'svc-2'])
  })

  it('every tool that creates under the service refuses a scope that is not one service', async () => {
    const none = fakeToolContext({ client, scope: null })
    await expect(runTool(createPhaseTool, { name: 'Lost' }, none)).rejects.toThrow('No service is active')
    await expect(
      runTool(createEvidenceTool, { cell_id: 'c1', kind: 'interview', title: 'Lost' }, none),
    ).rejects.toThrow('No service is active')
    await expect(
      runTool(createSliceTool, { title: 'Lost', kind: 'journey', cell_ids: ['c1'] }, none),
    ).rejects.toThrow('No service is active')
    await expect(
      runTool(
        createFindingTool,
        { source: 'audit', check_key: 'k', severity: 'info', impact: 'low', effort: 'low', summary: 'Lost', cell_ids: ['c1'] },
        none,
      ),
    ).rejects.toThrow('No service is active')
    expect(phaseServiceIds).toEqual([])
    expect(evidenceServiceIds).toEqual([])
    expect(sliceServiceIds).toEqual([])
  })

  it('with no active service, a surface disables its write rather than falling back', async () => {
    setActiveService(null)
    const view = render(<CellEvidenceTab cellId="cell-1" />)
    fireEvent.click(view.getByRole('button', { name: 'Add source' }))
    fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Nowhere' } })
    const submit = view.getByRole('button', { name: 'Add source' })
    expect(submit).toHaveProperty('disabled', true)
    fireEvent.click(submit)
    await act(async () => {})
    expect(evidenceServiceIds).toEqual([])
  })
})
