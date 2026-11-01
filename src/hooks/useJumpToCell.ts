import { useCallback } from 'react'
import {
  useOpenScenarioOptional,
  useSelectedScenarioIdOptional,
} from '@/contexts/EditorContext'
import { usePathSelectionContextOptional } from '@/contexts/PathSelectionContext'
import { requestScenarioCellFocus } from '@/lib/canvasFocusCells'
import { activateBaseView } from '@/lib/openScenarioSeam'
import type { BlueprintRemoteCell } from '@/types/blueprint'

/** Where a cell is, as much as going there needs. */
export type CellJumpTarget = {
  cellId: string
  pathId: string
  scenarioId: string
}

/** The jump target for a cell, from anything that says where it is. */
export function cellJumpTarget(
  cellId: string,
  where: Pick<BlueprintRemoteCell, 'pathId' | 'scenarioId'>,
): CellJumpTarget {
  return { cellId, pathId: where.pathId, scenarioId: where.scenarioId }
}

/**
 * Go to a cell anywhere in the service: select it and bring the camera to it,
 * across scenarios, phases and paths — the jump a search result makes, plus
 * the path, because a link's far end may be on a path the board is not
 * showing.
 *
 * The far cell's path is ADDED to what the board shows, never put in place of
 * it: a reader comparing two paths who follows a link to a third keeps the
 * two. When the scenario is open, the path joins its selection; when it is
 * not, the scenario opens as it always does and the path joins the one it
 * opens on. Nothing is remembered — the path memory is the phone's, and a
 * link followed is not a path chosen. When the path is already on the board
 * the camera just flies. The focus request waits for the board if it is not
 * drawn yet, as a search result's does.
 *
 * Null where there is no editor to navigate with.
 */
export function useJumpToCell(): ((target: CellJumpTarget) => void) | null {
  const openScenario = useOpenScenarioOptional()
  const selectedScenarioId = useSelectedScenarioIdOptional()
  const pathSelection = usePathSelectionContextOptional()

  const jump = useCallback(
    (target: CellJumpTarget) => {
      const focus = () =>
        requestScenarioCellFocus(target.scenarioId, target.cellId, {
          openDetail: true,
        })
      let navigated = false
      if (selectedScenarioId === target.scenarioId) {
        // A slice or presentation tab may be in front of the board.
        activateBaseView()
        const shown = pathSelection?.getSelectedPathIds(target.scenarioId) ?? []
        if (!shown.includes(target.pathId)) {
          pathSelection?.setSelectedPathIds(target.scenarioId, [
            ...shown,
            target.pathId,
          ])
          navigated = true
        }
      } else {
        openScenario?.(target.scenarioId, {
          closeNav: true,
          withPath: target.pathId,
        })
        navigated = true
      }
      if (!navigated) {
        focus()
        return
      }
      // After the navigation has rendered, not inside the same click. Every
      // scenario's board stays mounted, so the far one's viewport is already
      // registered and a request made now flies at once — before that
      // scenario is the one cells open panels on, and before its new path is
      // drawn — and the panel it asked for never opens. Two frames is the
      // navigation committed and painted; a miss then waits for the fit.
      requestAnimationFrame(() => requestAnimationFrame(focus))
    },
    [openScenario, pathSelection, selectedScenarioId],
  )

  return openScenario ? jump : null
}
