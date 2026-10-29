import {
  getLaneRole,
  isTouchpointLaneRole,
  STORYBOARD_ROLE,
} from '@/lib/laneRoles'
import { buildCellLookup, getCellAt } from '@/lib/normalizeBlueprint'
import { isBlueprintStepStoryboardPlaceholder } from '@/lib/blueprintStoryboardPlaceholder'
import { pickPreferredPath } from '@/lib/pathSelection'
import type { BlueprintData } from '@/types/blueprint'
import type { PathKind } from '@/types/database'

/**
 * The lanes a walkthrough steps through, named by the blueprint rather than
 * by this module: an adopter's actor lanes carry their own names, so the
 * roster is discovered from the data (see `getWalkthroughLaneNames`)
 * and this constant stays empty as the pinned-order override.
 *
 * A fork that wants a fixed lane order for its walkthrough lists its lane
 * names here; anything listed wins, anything else follows board order.
 */
export const STORYBOARD_WALKTHROUGH_LANE_NAMES: readonly string[] = []

/** Short lane labels for the walkthrough chrome; defaults to the lane name. */
export const STORYBOARD_LANE_SHORT_LABELS: Record<string, string> = {}

/**
 * Frame paths whose artwork draws its own border.
 *
 * Written by {@link configureStoryboardBorders} from the deployment config,
 * never authored here — the paths are a fact about one installation's image
 * files, and this file stays identical across installs. Empty (the template
 * default) means no artwork of this kind, so the chrome borders every frame.
 */
let embeddedBorderPaths: readonly string[] = []

/**
 * Replace the list {@link hasEmbeddedStoryboardFrame} matches against.
 *
 * Called from `DeploymentConfigProvider` in a layout effect, and from tests
 * directly. Replaces rather than merges: the resolved config is the whole
 * list. Copied, so a later mutation of the host's array cannot reach the
 * walkthrough.
 */
export function configureStoryboardBorders(paths?: readonly string[]): void {
  embeddedBorderPaths = paths ? [...paths] : []
}

/**
 * Whether a step's frame already has a border drawn into the artwork, so the
 * walkthrough should not draw one around it. Two senses of one word met here:
 * `frame` is the image on the cell, and the border is a frame in the picture
 * sense — so the border keeps the word and the image does not.
 *
 * Matched as a SUBSTRING of the frame path, so a deployment names the folder a
 * batch of artwork sits in rather than every file in it. No path convention in
 * the template, and none possible: whether a border is painted into a PNG is
 * knowable only to whoever drew it, so it is stated on the config rather than
 * guessed from a name.
 */
export function hasEmbeddedStoryboardFrame(frame: string): boolean {
  return embeddedBorderPaths.some((path) => frame.includes(path))
}

export type StoryboardWalkthroughLaneEntry = {
  laneName: string
  content: string
  frame: string
}

export type StoryboardFrameEntry = {
  laneName: string
  label: string
  frame: string
  summary: string
}

export type StoryboardWalkthroughStep = {
  stepIndex: number
  stepName: string
  laneEntries: StoryboardWalkthroughLaneEntry[]
  frames: string[]
}

export type StoryboardWalkthroughSession = {
  pathId: string
  pathName: string
  pathSummary: string | null
  pathKind: PathKind
  scenarioName?: string
  phaseName?: string
  steps: StoryboardWalkthroughStep[]
}

export type StoryboardWalkthroughContextMeta = {
  scenarioName?: string
  phaseName?: string
}

export function filterWalkthroughBlueprints(
  blueprints: BlueprintData[],
): BlueprintData[] {
  return blueprints.filter(
    (blueprint) => buildStoryboardWalkthroughSession(blueprint).steps.length > 0,
  )
}

export function pickWalkthroughBlueprint(
  blueprints: BlueprintData[],
): BlueprintData | null {
  if (blueprints.length === 0) return null
  const preferredPath = pickPreferredPath(
    blueprints.map((blueprint) => blueprint.path),
  )
  return (
    blueprints.find((blueprint) => blueprint.path.id === preferredPath?.id) ??
    blueprints[0]
  )
}

type StoryboardBlueprint = Pick<BlueprintData, 'lanes' | 'cells'>

/**
 * The lanes a walkthrough steps through, in board order: every lane that is
 * NOT one of the storyboard rows — those hold the artwork the walkthrough shows,
 * so stepping through them would show each frame next to itself — and not one
 * of the touchpoint rows either, because a touchpoint cell's frame is its
 * logo, not a moment. Placing a touchpoint fills the cell's empty frame with
 * the touchpoint's icon, so every placed touchpoint carries one; a walkthrough
 * that took them would step a reader through a product's mark as though a
 * person had drawn it. Nothing is written or cleared to arrange that: the
 * cell panel still shows the touchpoint's frame at logo size.
 *
 * The one place the roster is decided, so the stack, the strip, the deck and
 * `stepHasStoryboardWalkthroughLaneCells` agree by construction.
 *
 * `STORYBOARD_WALKTHROUGH_LANE_NAMES` overrides this when a fork pins its own
 * roster — a deployment that named its lanes gets exactly those, touchpoint
 * rows included, because naming a lane is the decision. Empty (the template
 * default) means "whatever the board has", which is the only rule that
 * survives an adopter naming their lanes themselves.
 */
function getWalkthroughLaneNames(
  blueprint: StoryboardBlueprint,
): string[] {
  if (STORYBOARD_WALKTHROUGH_LANE_NAMES.length > 0) {
    return [...STORYBOARD_WALKTHROUGH_LANE_NAMES]
  }

  return blueprint.lanes
    .filter((lane) => {
      const role = getLaneRole(lane)
      if (role === STORYBOARD_ROLE) return false
      return !isTouchpointLaneRole(role)
    })
    .map((lane) => lane.name)
}

function resolveCellSummary(cell: BlueprintData['cells'][number] | undefined): string {
  return cell?.summary?.trim() || cell?.content.trim() || ''
}

export function resolveStoryboardCellRows(
  blueprint: StoryboardBlueprint,
  stepId: string,
): Array<StoryboardFrameEntry & { cell: BlueprintData['cells'][number] }> {
  const cellLookup = buildCellLookup(blueprint.cells)
  const laneByName = new Map(blueprint.lanes.map((lane) => [lane.name, lane]))

  return getWalkthroughLaneNames(blueprint).flatMap((name) => {
    const lane = laneByName.get(name)
    if (!lane) return []
    const cell = getCellAt(cellLookup, lane.id, stepId)
    if (!cell) return []
    const frame = isBlueprintStepStoryboardPlaceholder(cell.frame) ? '' : cell.frame!.trim()
    return [
      {
        cell,
        laneName: name,
        label: STORYBOARD_LANE_SHORT_LABELS[name] ?? name,
        frame,
        summary: resolveCellSummary(cell),
      },
    ]
  })
}

export function resolveStoryboardStripEntries(blueprint: StoryboardBlueprint, stepId: string): StoryboardFrameEntry[] {
  return resolveStoryboardCellRows(blueprint, stepId).filter(row => row.frame && row.cell.content.trim()).map(({ laneName, label, frame, summary }) => ({ laneName, label, frame, summary }))
}

/** True when any walkthrough lane has a cell in this step. */
export function stepHasStoryboardWalkthroughLaneCells(
  blueprint: StoryboardBlueprint,
  stepId: string,
): boolean {
  const cellLookup = buildCellLookup(blueprint.cells)
  const laneByName = new Map(blueprint.lanes.map((lane) => [lane.name, lane]))

  return getWalkthroughLaneNames(blueprint).some((name) => {
    const lane = laneByName.get(name)
    if (!lane) return false
    const cell = getCellAt(cellLookup, lane.id, stepId)
    return Boolean(cell?.content.trim())
  })
}

export function resolveStoryboardStrip(
  blueprint: StoryboardBlueprint,
  stepId: string,
): string[] {
  return resolveStoryboardStripEntries(blueprint, stepId).map(
    (entry) => entry.frame,
  )
}

export function buildStoryboardWalkthroughSession(
  blueprint: BlueprintData,
  meta?: StoryboardWalkthroughContextMeta,
): StoryboardWalkthroughSession {
  const steps = [...blueprint.steps]
    .sort((a, b) => a.position - b.position)
    .map((step, stepIndex) => {
      const pictureEntries = resolveStoryboardStripEntries(blueprint, step.id)
      return {
        stepIndex,
        stepName: step.name,
        laneEntries: pictureEntries.map((entry) => ({
          laneName: entry.laneName,
          content: entry.summary,
          frame: entry.frame,
        })),
        frames: pictureEntries.map((entry) => entry.frame),
      }
    })
  return {
    pathId: blueprint.path.id,
    pathName: blueprint.path.name,
    pathSummary: blueprint.path.summary,
    pathKind: blueprint.path.kind,
    scenarioName: meta?.scenarioName?.trim() || undefined,
    phaseName: meta?.phaseName?.trim() || undefined,
    steps,
  }
}
