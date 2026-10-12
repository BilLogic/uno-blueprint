import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * A write invalidates what it changed, and nothing else — asserted against
 * a recording stand-in for the cache module, so each mutation module's
 * freshness is one list of keys rather than a screen that lies until a
 * reload. The panels and the agent no longer invalidate; if a module here
 * forgot, no caller would catch it.
 */

const invalidated: string[] = []
vi.mock('@/lib/queryClient', () => ({
  invalidateQueries: (prefix: string) => invalidated.push(prefix),
  invalidateStructure: () => invalidated.push('<structure>'),
  invalidateCanvasBlueprintsForScenario: (id: string) => invalidated.push(`<canvas scenario ${id}>`),
  invalidateCanvasBlueprintsForPath: (id: string) => invalidated.push(`<canvas path ${id}>`),
  invalidateCanvasBlueprintsForCell: (id: string) => invalidated.push(`<canvas cell ${id}>`),
  invalidateCellBoard: (id: string | null) => invalidated.push(`<cell board ${id ?? 'every'}>`),
}))

import { deleteCell, renameOwnerTag, setCellFeaturedImage, upsertCell } from '@/lib/authoringRpc'
import { clearSession, sessionSnapshot } from '@/lib/authoringSession'
import { updateCellContent } from '@/lib/cellContentMutations'
import { updateCellSpec } from '@/lib/cellSpecMutations'
import { addEvidence, deleteEvidence } from '@/lib/evidenceMutations'
import { updateLaneSpec } from '@/lib/laneSpecMutations'
import { updatePhaseSpec } from '@/lib/phaseSpecMutations'
import { updatePathSpec, updateScenarioSummary } from '@/lib/scenarioSpecMutations'
import {
  updateBusinessModel,
  updateServiceEntityExamples,
  updateServiceSummary,
} from '@/lib/serviceSpecMutations'
import { executeRevert } from '@/lib/revertChange'
import { replaceSlides } from '@/lib/sliceMutations'
import { updateStakeholder } from '@/lib/stakeholderMutations'
import { updateStepSummary } from '@/lib/stepSpecMutations'
import { queryKeys } from '@/lib/queryKeys'

/**
 * A client whose every builder chain resolves to `rows` — one row when the
 * chain ended in `.single()` / `.maybeSingle()`, the list otherwise — and
 * whose every RPC resolves to `rpcResult`. Enough for the modules to reach
 * the line after their write, which is the line under test.
 */
function fakeClient(rows: Record<string, unknown>[] = [{ id: 'row-1', cell_id: 'c1' }], rpcResult: unknown = null) {
  const chain = (single: boolean): unknown =>
    new Proxy(() => {}, {
      get: (_target, prop) => {
        if (prop === 'then') {
          const data = single ? (rows[0] ?? null) : rows
          return (resolve: (value: unknown) => void) => resolve({ data, error: null, count: null })
        }
        return (..._args: unknown[]) => chain(single || prop === 'single' || prop === 'maybeSingle')
      },
    })
  return {
    from: () => chain(false),
    rpc: async () => ({ data: rpcResult, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the seam is untyped, see authoringRpc.invoke
  } as any
}

beforeEach(() => {
  invalidated.length = 0
})
afterEach(() => {
  clearSession()
})

const STRUCTURE = ['<structure>']

describe('the structural RPCs', () => {
  it('a cascade refetches the whole structural set', async () => {
    await deleteCell(fakeClient(), 'c1')
    expect(invalidated).toEqual(STRUCTURE)
  })

  it('a cell upsert refetches the grid and the one board holding its path', async () => {
    await upsertCell(fakeClient([], { id: 'c1', inserted: true }), {
      pathId: 'p1',
      laneId: 'l1',
      stepId: 's1',
      content: 'Text',
    })
    expect(invalidated).toEqual([queryKeys.servicePhases.prefix, '<canvas path p1>'])
  })

  it('a featured image refetches the structure and every step spec', async () => {
    await setCellFeaturedImage(fakeClient([], { cell_id: 'c1', frame: null }), {
      cellId: 'c1',
      imageUrl: 'https://example.test/a.png',
    })
    expect(invalidated).toEqual([...STRUCTURE, queryKeys.stepSpec.prefix])
  })

  it('an owner-tag rename refetches the vocabulary and the grid, and records a scoped inverse', async () => {
    const ids = await renameOwnerTag(fakeClient([], ['c1', 'c2']), { from: 'Ops', to: 'Field Ops' })
    expect(ids).toEqual(['c1', 'c2'])
    expect(invalidated).toEqual([queryKeys.ownerTags, queryKeys.servicePhases.prefix])
    expect(sessionSnapshot().at(-1)?.revert).toEqual({
      fn: 'rename_owner_tag_scoped',
      args: { cell_ids: ['c1', 'c2'], from: 'Field Ops', to: 'Ops' },
    })
  })
})

describe('the row-level modules', () => {
  it("a cell's text refetches the grid, its board, and the owner vocabulary", async () => {
    await updateCellContent(fakeClient(), 'c1', {
      content: 'Text',
      summary: '',
      owner: 'Ops',
      perceivedOwner: '',
      status: 'live',
    })
    expect(invalidated).toEqual(['<cell board c1>', queryKeys.ownerTags])
  })

  it("a cell's spec refetches the grid, its board, and the audiences", async () => {
    await updateCellSpec(fakeClient(), 'c1', { function: 'f', form: '', valueProps: [] })
    expect(invalidated).toEqual(['<cell board c1>', queryKeys.valueAudiences])
  })

  it("evidence refetches the cell's own list — the deleted row's cell when it is known", async () => {
    await addEvidence(fakeClient([{ id: 'e1' }]), {
      serviceId: 'svc',
      cellId: 'c1',
      cellKey: 'c1',
      kind: 'interview',
      title: 'Intake call',
      note: null,
    })
    expect(invalidated).toEqual([queryKeys.evidence.of('c1')])
    invalidated.length = 0
    await deleteEvidence(fakeClient(), 'e1')
    expect(invalidated).toEqual([queryKeys.evidence.prefix])
  })

  it('a phase spec refetches its own key and the overview that repeats the summary', async () => {
    await updatePhaseSpec(fakeClient(), 'ph1', {
      summary: 'S',
      businessImpact: '',
      operationalRequirements: '',
    })
    expect(invalidated).toEqual([queryKeys.phaseSpec.of('ph1'), queryKeys.servicePhases.prefix])
  })

  it('a step summary refetches its own key and the boards that caption with it', async () => {
    await updateStepSummary(fakeClient(), 'st1', 'Caption')
    expect(invalidated).toEqual([queryKeys.stepSpec.of('st1'), queryKeys.canvasBlueprints.prefix])
  })

  it('a lane spec refetches the whole lane family, because every sibling moved', async () => {
    await updateLaneSpec(fakeClient(), ['l1', 'l2'], {
      ownerTeam: 'Ops',
      kpis: [],
      tools: [],
      stakeholderId: null,
    })
    expect(invalidated).toEqual([queryKeys.laneSpec.prefix])
  })

  it("a scenario summary refetches its own key and the overview that repeats it", async () => {
    await updateScenarioSummary(fakeClient(), 'sc1', 'S')
    expect(invalidated).toEqual([queryKeys.scenarioSpec.of('sc1'), queryKeys.servicePhases.prefix])
  })

  it('a path spec refetches every scenario, because the path does not name its own', async () => {
    await updatePathSpec(fakeClient(), 'p1', { summary: 'S', note: '', status: 'live' })
    expect(invalidated).toEqual([queryKeys.scenarioSpec.prefix, queryKeys.servicePhases.prefix])
  })

  it("a service's summary refetches the service spec and the examples beside it", async () => {
    await updateServiceSummary(fakeClient(), 'svc1', 'S')
    expect(invalidated).toEqual([
      queryKeys.serviceSpec.prefix,
      queryKeys.serviceEntityExamples.prefix,
    ])
  })

  it('a business model refetches the same pair — one panel, two rows', async () => {
    await updateBusinessModel(fakeClient(), 'svc1', {
      funding: 'F',
      pricing: '',
      deliveryCost: '',
      revenueModel: '',
      partners: '',
    })
    expect(invalidated).toEqual([
      queryKeys.serviceSpec.prefix,
      queryKeys.serviceEntityExamples.prefix,
    ])
  })

  it('the entity examples refetch the same pair', async () => {
    await updateServiceEntityExamples(fakeClient(), 'svc1', { service: 'A retrofit' })
    expect(invalidated).toEqual([
      queryKeys.serviceSpec.prefix,
      queryKeys.serviceEntityExamples.prefix,
    ])
  })

  it("a slice's slides refetch the catalog and the slice's own detail", async () => {
    await replaceSlides(fakeClient([], { previous: [] }), 'sl1', [])
    expect(invalidated).toEqual([queryKeys.slices.prefix, queryKeys.slice.of('sl1')])
  })

  it('a stakeholder edit refetches the cast, the slices that name it, and the audience picker', async () => {
    await updateStakeholder(fakeClient(), 'sh1', { name: 'N', kind: 'person', summary: '', aliases: [] })
    expect(invalidated).toEqual([
      queryKeys.stakeholders,
      queryKeys.slices.prefix,
      queryKeys.slice.prefix,
      queryKeys.valueAudiences,
    ])
  })
})

describe('a revert', () => {
  it("that goes to the database itself refetches what the forward write's table says", async () => {
    await executeRevert(fakeClient([], null), {
      id: 'x',
      fn: 'add_step',
      args: { path_id: 'p1' },
      revert: { fn: 'remove_step', args: { path_id: 'p1', step_id: 's1' } },
      at: 0,
      sessionId: null,
    } as never)
    expect(invalidated).toEqual(STRUCTURE)
  })

  it('of a slice creation refetches the catalog and the detail', async () => {
    await executeRevert(fakeClient([{ id: 'sl1' }]), {
      id: 'x',
      fn: 'create_slice',
      args: { slice_id: 'sl1' },
      revert: { fn: 'delete_slice_row', args: { slice_id: 'sl1' } },
      at: 0,
      sessionId: null,
    } as never)
    expect(invalidated).toEqual([queryKeys.slices.prefix, queryKeys.slice.of('sl1')])
  })
})
