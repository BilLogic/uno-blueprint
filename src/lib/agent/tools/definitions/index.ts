import type { ToolDefinition } from '@/lib/agent/tools/definition'
import { listSuggestedChangesTool, approveSuggestedChangeTool, declineSuggestedChangeTool } from '@/lib/agent/tools/definitions/proposals'
import { getProfileTool } from '@/lib/agent/tools/definitions/profile'
import {
  compareBlueprintTool,
  getBlueprintTool,
  listBlueprintTool,
  listLanesTool,
  listOwnerTagsTool,
  measureDeletionImpactTool,
  searchBlueprintTool,
} from '@/lib/agent/tools/definitions/blueprint'
import {
  createCellDependencyTool,
  getCellTool,
  listCellDependenciesTool,
  updateCellTool,
  upsertCellTool,
} from '@/lib/agent/tools/definitions/cells'
import {
  createEvidenceTool,
  getEvidenceTool,
  listEvidenceTool,
  updateEvidenceTool,
} from '@/lib/agent/tools/definitions/evidence'
import {
  createFindingTool,
  listFindingsTool,
  updateFindingTool,
} from '@/lib/agent/tools/definitions/findings'
import {
  createLaneTool,
  createPathTool,
  createPhaseTool,
  createScenarioTool,
  createStepTool,
  duplicatePathTool,
  duplicateScenarioTool,
  updatePathTool,
} from '@/lib/agent/tools/definitions/journey'
import {
  annotateCellsTool,
  focusCellTool,
  openCellPanelTool,
  openPhaseTool,
  openScenarioTool,
  setCanvasModeTool,
  setSidebarTool,
  uiCommandTool,
} from '@/lib/agent/tools/definitions/interface'
import { getReferenceTool, listReferencesTool } from '@/lib/agent/tools/definitions/references'
import { getBusinessModelTool } from '@/lib/agent/tools/definitions/service'
import {
  getChangeHistoryTool,
  getSessionTool,
  listSessionsTool,
} from '@/lib/agent/tools/definitions/sessions'
import {
  createSliceTool,
  getSliceTool,
  listSlicesTool,
  replaceSlidesTool,
  updateSliceTool,
} from '@/lib/agent/tools/definitions/slices'
import {
  createStakeholderTool,
  listStakeholdersTool,
  updateStakeholderTool,
} from '@/lib/agent/tools/definitions/stakeholders'
import { getUiStateTool, listUiCommandsTool } from '@/lib/agent/tools/definitions/ui'

/**
 * Every tool, in the order the model is offered them: the reads, the
 * interface, then the writes. A tool exists by being in this list and
 * nowhere else — the spec table, the roster and the dispatcher all read it.
 *
 * The check scripts that read tool names from source (`check:manifest`,
 * the ownership test) read this folder alongside the spec table, so a tool
 * stays a tool they can see.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  listSuggestedChangesTool,
  getProfileTool,
  getReferenceTool,
  listBlueprintTool,
  searchBlueprintTool,
  getBlueprintTool,
  compareBlueprintTool,
  getCellTool,
  listSlicesTool,
  getSliceTool,
  listOwnerTagsTool,
  listStakeholdersTool,
  listLanesTool,
  listReferencesTool,
  listCellDependenciesTool,
  listEvidenceTool,
  getEvidenceTool,
  getBusinessModelTool,
  listSessionsTool,
  getSessionTool,
  getUiStateTool,
  getChangeHistoryTool,
  listUiCommandsTool,
  measureDeletionImpactTool,
  listFindingsTool,
  // The interface: the calls that drive the canvas, in the order the model
  // was always offered them.
  openPhaseTool,
  openScenarioTool,
  focusCellTool,
  uiCommandTool,
  openCellPanelTool,
  setCanvasModeTool,
  setSidebarTool,
  annotateCellsTool,
  // The writes, in the order the model was always offered them.
  createStakeholderTool,
  updateStakeholderTool,
  createPhaseTool,
  createScenarioTool,
  createPathTool,
  duplicatePathTool,
  duplicateScenarioTool,
  createSliceTool,
  updateSliceTool,
  replaceSlidesTool,
  createStepTool,
  createLaneTool,
  upsertCellTool,
  updateCellTool,
  createCellDependencyTool,
  updatePathTool,
  createEvidenceTool,
  updateEvidenceTool,
  createFindingTool,
  updateFindingTool,
  approveSuggestedChangeTool,
  declineSuggestedChangeTool,
]

const byName = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]))

export function findToolDefinition(name: string): ToolDefinition | undefined {
  return byName.get(name)
}
