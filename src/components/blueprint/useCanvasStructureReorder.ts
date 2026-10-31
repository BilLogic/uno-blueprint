import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { reorderLanes, reorderSteps } from '@/lib/authoringRpc'
import { forgetChange } from '@/lib/authoringSession'
import type { RawPath } from '@/lib/normalizeBlueprint'
import { queryClient } from '@/lib/queryClient'
import { queryKeys } from '@/lib/queryKeys'
import { executeRevert } from '@/lib/revertChange'
import { reportWriteFailure, reportWriteSuccess } from '@/lib/writeFailures'
import type { BlueprintData } from '@/types/blueprint'
import { registerCanvasStructureReorder } from './canvasStructureReorder'

/*
 * Drop handoff, so the moved item never paints at its old seat:
 * - the destination preview stays parked while the optimistic cache update
 *   below notifies its readers;
 * - a layout effect clears the offsets only once the new order commits,
 *   before that frame paints, and a lost pointer capture after a completed
 *   drop does not cancel it;
 * - routing corridors keep their layout space: the interaction boundary's
 *   lower gap belongs to the destination seat, while overhead and in-lane
 *   loop space travel with the lane;
 * - `reorder_lanes` / `reorder_steps` invalidate the other structure reads
 *   without refetching this optimistic board.
 */

/**
 * Patch every cached canvas-blueprint query that holds `pathId` so the board
 * paints the dropped order before the RPC refetch returns.
 *
 * @param pathId - Path whose lanes or steps moved.
 * @param kind - Axis that was reordered.
 * @param ids - Identity order after the drop.
 */
function applyOptimisticStructureOrder(
  pathId: string,
  kind: 'lane' | 'step',
  ids: string[],
): void {
  const entries = queryClient.getQueriesData<RawPath[]>({
    predicate: (query) =>
      String(query.queryKey[0] ?? '').startsWith(
        queryKeys.canvasBlueprints.prefix,
      ),
  })
  for (const [key, rows] of entries) {
    if (!Array.isArray(rows)) continue
    let touched = false
    const next = rows.map((row) => {
      if (row.id !== pathId) return row
      if (kind === 'lane' && row.lanes) {
        const byId = new Map(row.lanes.map((lane) => [lane.id, lane]))
        const lanes = ids.flatMap((id, position) => {
          const lane = byId.get(id)
          return lane ? [{ ...lane, position }] : []
        })
        if (lanes.length !== ids.length) return row
        touched = true
        return { ...row, lanes }
      }
      if (kind === 'step' && row.path_steps) {
        const byId = new Map(
          row.path_steps.flatMap((pathStep) =>
            pathStep.steps ? [[pathStep.steps.id, pathStep] as const] : [],
          ),
        )
        const path_steps = ids.flatMap((id, position) => {
          const pathStep = byId.get(id)
          return pathStep ? [{ ...pathStep, position }] : []
        })
        if (path_steps.length !== ids.length) return row
        touched = true
        return { ...row, path_steps }
      }
      if (kind === 'step' && row.steps) {
        const byId = new Map(row.steps.map((step) => [step.id, step]))
        const steps = ids.flatMap((id, position) => {
          const step = byId.get(id)
          return step ? [{ ...step, position }] : []
        })
        if (steps.length !== ids.length) return row
        touched = true
        return { ...row, steps }
      }
      return row
    })
    if (touched) queryClient.setQueryData(key, next)
  }
}

/**
 * Stable string of lane then step identities — changes when a drop lands.
 *
 * @param blueprint - Board currently painted for this path.
 */
function structureOrderKey(blueprint: BlueprintData): string {
  return [
    blueprint.lanes.map((lane) => lane.id).join(','),
    blueprint.steps.map((step) => step.id).join(','),
  ].join('|')
}

/**
 * Wire lane/step reorder grips for a single stacked path in Edit mode.
 *
 * @param ref - Path band body that owns the structure parts.
 * @param blueprint - Path board being drawn.
 * @param stacked - True when the compare grid is stacked (row arrangement).
 * @param single - True when exactly one path is visible.
 */
export function useCanvasStructureReorder(
  ref: RefObject<HTMLDivElement | null>,
  blueprint: BlueprintData,
  stacked: boolean,
  single: boolean,
) {
  const mode = useCanvasModeValue(),
    scale = useCanvasScale()
  const context = useEntityDetailOptional()
  const { client, canWrite } = useSupabase()
  const draft = Boolean(context?.selection?.draft)
  const latest = useRef({ blueprint, scale })
  const settle = useRef<{ release: (() => void) | null }>({ release: null })
  useLayoutEffect(() => {
    latest.current = { blueprint, scale }
  })
  const orderKey = structureOrderKey(blueprint)
  // Clear parked drop translates in the same frame the new order paints —
  // never on a fixed timer that races the refetch.
  useLayoutEffect(() => {
    settle.current.release?.()
  }, [orderKey])
  const pathId = blueprint.path.id
  useEffect(() => {
    const body = ref.current
    if (
      !body ||
      !stacked ||
      !single ||
      mode !== 'design' ||
      !client ||
      !canWrite ||
      draft
    )
      return
    body.dataset.canvasReorder = ''
    const board = body.closest<HTMLElement>('[data-structure-board]')
    if (single && board) board.dataset.canvasReorderGlobal = ''
    let busy = false
    const setBusy = (value: boolean) => {
      busy = value
      const root = single ? board ?? body : body
      root.toggleAttribute('data-structure-save-busy', value)
      root.setAttribute('aria-busy', String(value))
      root.querySelectorAll('[data-structure-reorder]').forEach((node) => {
        if (value) node.setAttribute('aria-disabled', 'true')
        else node.removeAttribute('aria-disabled')
      })
    }
    const dispose = registerCanvasStructureReorder(body, {
      root: single ? board ?? body : body,
      busy: () => busy,
      scale: () => latest.current.scale,
      settle: settle.current,
      items: (kind) =>
        (kind === 'step'
          ? latest.current.blueprint.steps
          : latest.current.blueprint.lanes
        )
          .map((item, index) => {
            const selector =
              kind === 'step'
                ? `[data-step-index="${index}"]:not([data-structure-seam-track]), [data-structure-reorder="step"][data-structure-id="${CSS.escape(
                    item.id,
                  )}"]`
                : `[data-blueprint-row][data-lane-id="${CSS.escape(
                    item.id,
                  )}"], [data-structure-lane-label="${CSS.escape(item.id)}"]`
            const candidates = Array.from(
              body.querySelectorAll<HTMLElement>(selector),
            )
            if (kind === 'step' && single) {
              const global = board?.querySelector<HTMLElement>(
                `[data-blueprint-column-header]:has([data-structure-id="${CSS.escape(
                  item.id,
                )}"])`,
              )
              if (global) candidates.push(global)
            }
            return {
              ...item,
              parts: candidates.filter(
                (node) =>
                  !candidates.some(
                    (parent) => parent !== node && parent.contains(node),
                  ),
              ),
            }
          })
          .filter((item) => item.seamSize === undefined),
      save: (kind, id, ids, expected) => {
        if (busy) return
        setBusy(true)
        const name =
          (kind === 'step'
            ? latest.current.blueprint.steps
            : latest.current.blueprint.lanes
          ).find((item) => item.id === id)?.name ?? kind
        // Query observers notify asynchronously. Keep the destination preview
        // until the orderKey layout effect acknowledges the rendered seats.
        applyOptimisticStructureOrder(pathId, kind, ids)
        void (kind === 'step' ? reorderSteps : reorderLanes)(
          client,
          pathId,
          ids,
          expected,
        )
          .then((entry) => {
            if (entry?.revert)
              reportWriteSuccess(
                `Moved the ${name} ${kind}`,
                entry.id,
                async () => {
                  await executeRevert(client, entry)
                  forgetChange(entry.id)
                },
              )
          })
          .catch((error) => {
            applyOptimisticStructureOrder(pathId, kind, expected)
            // A fast refusal can beat the observer's first notification. In
            // that case there will be no order change for the layout effect.
            const current = kind === 'step'
              ? latest.current.blueprint.steps
              : latest.current.blueprint.lanes
            if (current.map((item) => item.id).join(',') === expected.join(','))
              settle.current.release?.()
            reportWriteFailure(`The ${kind} was not moved`, error)
          })
          .finally(() => setBusy(false))
      },
    })
    return () => {
      dispose()
      setBusy(false)
      delete body.dataset.canvasReorder
      if (single && board) delete board.dataset.canvasReorderGlobal
    }
  }, [ref, pathId, stacked, single, mode, client, canWrite, draft])
}
