import { useCallback } from 'react'
import {
  useOpenScenarioOptional,
  useSelectedScenarioIdOptional,
} from '@/contexts/EditorContext'
import { usePathSelectionContextOptional } from '@/contexts/PathSelectionContext'
import { requestScenarioCellFocus } from '@/lib/canvasFocusCells'
import { activateBaseView } from '@/lib/openScenarioSeam'
import { writeLastViewedPath } from '@/lib/pathMemory'

/** Where a cell is, as much as going there needs. */
export type CellJumpTarget = {
  cellId: string
  pathId: string
  scenarioId: string
}

/**
 * Go to a cell anywhere in the service: select it and bring the camera to it,
 * across scenarios, phases and paths — the jump a search result makes, plus
 * the path, because a link's far end may be on a path the board is not
 * showing.
 *
 * When the cell's path is already on the board — its scenario open, its path
 * among the ones shown — nothing about the board changes and the camera
 * flies, so a reader comparing two paths keeps both. Otherwise the scenario
 * opens on that path: it is remembered as the path last read there, which is
 * the path `openScenario` lands on. The focus request waits for the board if
 * it is not drawn yet, as a search result's does.
 *
 * Null where there is no editor to navigate with.
 */
export function useJumpToCell(): ((target: CellJumpTarget) => void) | null {
  const openScenario = useOpenScenarioOptional()
  const selectedScenarioId = useSelectedScenarioIdOptional()
  const pathSelection = usePathSelectionContextOptional()

  const jump = useCallback(
    (target: CellJumpTarget) => {
      const onBoard =
        selectedScenarioId === target.scenarioId &&
        (pathSelection?.getSelectedPathIds(target.scenarioId) ?? []).includes(
          target.pathId,
        )
      if (onBoard) {
        // A slice or presentation tab may be in front of the board.
        activateBaseView()
      } else {
        writeLastViewedPath(target.scenarioId, target.pathId)
        openScenario?.(target.scenarioId, { closeNav: true })
      }
      requestScenarioCellFocus(target.scenarioId, target.cellId, {
        openDetail: true,
      })
    },
    [openScenario, pathSelection, selectedScenarioId],
  )

  return openScenario ? jump : null
}
