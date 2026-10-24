import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useCanvasScale } from '@/contexts/CanvasScaleContext'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useEntityDetailOptional } from '@/contexts/EntityDetailContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { reorderLanes, reorderSteps } from '@/lib/authoringRpc'
import { forgetChange, sessionSnapshot } from '@/lib/authoringSession'
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
  const latest = useRef({ blueprint, scale })
  useLayoutEffect(() => {
    latest.current = { blueprint, scale }
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
    const dispose = registerCanvasStructureReorder(body, {
      root: single ? board ?? body : body,
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
      save: (kind, id, ids) => {
        if (busy) return
        busy = true
        const name =
          (kind === 'step'
            ? latest.current.blueprint.steps
            : latest.current.blueprint.lanes
          ).find((item) => item.id === id)?.name ?? kind
        void (kind === 'step' ? reorderSteps : reorderLanes)(
          client,
          pathId,
          ids,
        )
          .then(() => {
            const entry = sessionSnapshot().at(-1)
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
          .catch((error) =>
            reportWriteFailure(`The ${kind} was not moved`, error),
          )
          .finally(() => {
            busy = false
          })
      },
    })
    return () => {
      dispose()
      delete body.dataset.canvasReorder
      if (single && board) delete board.dataset.canvasReorderGlobal
    }
  }, [ref, pathId, stacked, single, mode, client, canWrite, draft])
}
