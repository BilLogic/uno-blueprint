import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { reorderLanes, reorderSteps } from '@/lib/authoringRpc'
import { forgetChange } from '@/lib/authoringSession'
import { executeRevert } from '@/lib/revertChange'
import { reportWriteFailure, reportWriteSuccess } from '@/lib/writeFailures'
import type { BlueprintData } from '@/types/blueprint'
import { registerCanvasStructureReorder } from './canvasStructureReorder'

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
  const reconcile = useRef<(() => void) | null>(null)
  const latest = useRef({ blueprint, scale })
  useLayoutEffect(() => {
    latest.current = { blueprint, scale }
    reconcile.current?.()
  })
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
    let waiting: {
      kind: 'step' | 'lane'
      ids: string[]
      source: readonly unknown[]
    } | null = null
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
    reconcile.current = () => {
      if (!waiting) return
      const items =
        waiting.kind === 'step'
          ? latest.current.blueprint.steps
          : latest.current.blueprint.lanes
      const actual = items
        .filter((item) => item.seamSize === undefined)
        .map((item) => item.id)
      // A concurrent author may supply a newer order before our refetch lands.
      // Any fresh readback settles the save; do not wait forever for our order.
      if (
        items !== waiting.source ||
        JSON.stringify(actual) === JSON.stringify(waiting.ids)
      ) {
        waiting = null
        setBusy(false)
      }
    }
    const dispose = registerCanvasStructureReorder(body, {
      root: single ? board ?? body : body,
      busy: () => busy,
      scale: () => latest.current.scale,
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
        void (kind === 'step' ? reorderSteps : reorderLanes)(
          client,
          pathId,
          ids,
          expected,
        )
          .then((entry) => {
            waiting = {
              kind,
              ids,
              source:
                kind === 'step'
                  ? latest.current.blueprint.steps
                  : latest.current.blueprint.lanes,
            }
            reconcile.current?.()
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
            waiting = null
            setBusy(false)
            reportWriteFailure(`The ${kind} was not moved`, error)
          })
      },
    })
    return () => {
      dispose()
      reconcile.current = null
      setBusy(false)
      delete body.dataset.canvasReorder
      if (single && board) delete board.dataset.canvasReorderGlobal
    }
  }, [ref, pathId, stacked, single, mode, client, canWrite, draft])
}
