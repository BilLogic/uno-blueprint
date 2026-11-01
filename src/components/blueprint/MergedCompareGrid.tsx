import { structureDraftExtent } from '@/lib/structureDraftMotion'
import { StructureLaneDraftZone } from './StructureDraftZones'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import { BlueprintLaneHandles } from './BlueprintLaneHandles'
import { BlueprintColumnHandles } from './BlueprintColumnHandles'
import { Fragment, useMemo, useRef, type RefObject } from 'react'
import {
  BlueprintDividerRow,
  BlueprintLabelRow,
  BlueprintStickyLabelBackdrop,
  BlueprintSwimLaneDivider,
} from '@/components/blueprint/BlueprintLabelRail'
import {
  CompareCellBlock,
  type CompareCellPathMembership,
} from '@/components/blueprint/CompareCellBlock'
import { CompareLaneRowShell } from '@/components/blueprint/CompareLaneRowShell'
import { CompareStepHeaderRow } from '@/components/blueprint/CompareTrackDecorations'
import { IntegratedDependencyArrows } from '@/components/blueprint/IntegratedDependencyArrows'
import { PathLabelBadge } from '@/components/blueprint/PathLabelBadge'
import { useCompareGridAxis } from '@/hooks/useCompareGridAxis'
import {
  BLUEPRINT_LANE_ROW_GAP,
  STEP_COLUMN_GAP,
  STEP_COLUMN_WIDTH,
  hasBlueprintCellContent,
  shouldUseTouchpointCellContent,
  shouldUseStoryboardContent,
  type BlueprintCellVariant,
} from '@/lib/blueprintLayout'
import {
  blueprintPanelSectionFillColor,
  getBlueprintLaneStyle,
  getBlueprintLaneZone,
  type BlueprintLaneStyle,
} from '@/lib/blueprintTheme'
import type { CompareGridTrack } from '@/lib/compareGridTracks'
import {
  assembleMergedSlot,
  buildMergedArrowRemap,
  remapMergedPathDependencies,
  type MergedSlotAssembly,
  type MergedSlotCandidate,
  type MergedSubCell,
} from '@/lib/compareMergedGrid'
import {
  makeSlotKey,
  normalizeCompareName,
  type CompareModel,
} from '@/lib/compareSlots'
import {
  COMPARE_LABEL_TRACK_WIDTH,
  COMPARE_PATH_SECTION_BOTTOM_INSET,
  COMPARE_PATH_SECTION_H_INSET,
  COMPARE_PATH_SECTION_TOP_INSET,
  COMPARE_STACKED_HEADER_GAP,
  COMPARE_STEP_HEADER_HEIGHT,
  getComparePathArrowData,
  getCompareBoardWrapperPadding,
  getMergedCompareRowTrackCss,
} from '@/lib/sideBySideCompareLayout'
import { resolveBlueprintLane } from '@/lib/laneCorridor'
import { cellResources } from '@/lib/cellResources'
import { cellTouchpoints } from '@/lib/cellTouchpoints'
import { crossPathLinksFor } from '@/lib/crossPathLinks'
import { getPathColor } from '@/lib/pathColorTheme'
import { resolveStoryboardStripEntries } from '@/lib/storyboardWalkthrough'
import { cn } from '@/lib/utils'
import type {
  BlueprintCell,
  BlueprintData,
  BlueprintLane,
  BlueprintStep,
} from '@/types/blueprint'

type MergedCompareGridProps = {
  /** In selection order — the order sub-cells stack in and the legend reads. */
  blueprints: BlueprintData[]
  /** The compare model owned by `ScenarioBlueprintPanel`; merged only mounts
   *  once it exists (≥2 paths, all loaded from one refetch generation). */
  model: CompareModel
  className?: string
  compact?: boolean
  scrollContainerRef?: RefObject<HTMLDivElement | null>
  scenarioName?: string
  phaseName?: string
}

/** Everything the grid needs about one compared path, indexed once. */
type MergedPathRuntime = {
  blueprint: BlueprintData
  cellById: Map<string, BlueprintCell>
  stepById: Map<string, BlueprintStep>
  stepIndexById: Map<string, number>
  membership: CompareCellPathMembership
}

/**
 * The MERGED canvas: the compared paths combined into ONE blueprint — one
 * lane set (labels rendered once), one canonical step axis (the same tracks
 * the stacked bands use), and per SLOT (lane × canonical column):
 *
 * - the paths agree ⇒ ONE cell, drawn exactly like a normal blueprint cell,
 *   with every member path represented on its rounded outline
 * - the paths disagree, or only some have anything ⇒ each present path's
 *   cell(s) stack vertically inside that one slot, each carrying a
 *   path-coloured rounded outline; full names are disclosed on hover/focus
 *
 * The slot grows only where the paths disagree, and that vertical swell IS
 * the diff signal — no extra paint beyond the column tint. Every sub-cell
 * keeps its own real `cellId`, so selection, focus/pulse and the agent's
 * cell tools work with no disambiguation.
 *
 * Merged has no cell drop targets or resize handles. Structural gap targets
 * open the same create panels as Stacked; a step target names the backing
 * path it inserts into, rather than silently writing every compared path.
 */
export function MergedCompareGrid({
  blueprints,
  model,
  className,
  compact = false,
  scrollContainerRef,
  scenarioName,
  phaseName,
}: MergedCompareGridProps) {
  const bandRef = useRef<HTMLDivElement>(null)
  const fallbackScrollRef = useRef<HTMLDivElement>(null)
  const resolvedScrollRef = scrollContainerRef ?? fallbackScrollRef
  const { lanes, rows, toggleLane, tracks, gridTemplateColumns } =
    useCompareGridAxis(model, blueprints, compact)

  const rowTrackCss = useMemo(
    () => rows.map((row) => getMergedCompareRowTrackCss(row)).join(' '),
    [rows],
  )

  const pathIds = useMemo(
    () => blueprints.map((blueprint) => blueprint.path.id),
    [blueprints],
  )

  const runtimeByPathId = useMemo(() => {
    return new Map<string, MergedPathRuntime>(
      blueprints.map((blueprint) => {
        const { path } = blueprint
        return [
          path.id,
          {
            blueprint,
            cellById: new Map(blueprint.cells.map((cell) => [cell.id, cell])),
            stepById: new Map(blueprint.steps.map((step) => [step.id, step])),
            stepIndexById: new Map(
              blueprint.steps.map((step, index) => [step.id, index]),
            ),
            membership: {
              color: getPathColor(path),
              pathName: path.name,
            },
          },
        ]
      }),
    )
  }, [blueprints])

  /*
    Every slot assembled once, keyed lane × track. One pass feeds both the
    lane rows and the arrow remap, and the assembly is pure
    (`assembleMergedSlot`) so the ordering and the merge rule are unit-tested
    rather than implied by the JSX.
  */
  const assemblyByKey = useMemo(() => {
    const slotByKey = new Map(model.slots.map((slot) => [slot.slotKey, slot]))
    const byKey = new Map<string, MergedSlotAssembly>()
    for (const row of rows) {
      if (row.kind !== 'lane' || !row.lane || row.collapsed) continue
      const lane = row.lane
      const laneKey = normalizeCompareName(lane.name)
      const variant = resolveMergedCellVariant(lane)
      for (const track of tracks) {
        if (track.kind !== 'column') continue
        const slot = slotByKey.get(makeSlotKey(laneKey, track.key))
        const candidates: MergedSlotCandidate[] = []
        for (const pathId of pathIds) {
          const runtime = runtimeByPathId.get(pathId)
          const stepId = track.stepIdByPath[pathId]
          if (!runtime || stepId === undefined) continue
          const entry = slot?.perPath[pathId]
          const cellIds = entry?.present ? entry.cellIds : undefined
          if (variant === 'storyboard') {
            // A storyboard lane's face comes from the walkthrough lanes' frames,
            // not from its own cell text, so it merges on the frame set.
            const frames = resolveStoryboardStripEntries(
              runtime.blueprint,
              stepId,
            )
            if (frames.length === 0) continue
            candidates.push({
              pathId,
              stepId,
              cellIds: cellIds ?? [`storyboard-${stepId}`],
              signature: frames
                .map((frame) => `${frame.label}=${frame.frame}`)
                .join('\u0000'),
            })
            continue
          }
          if (!entry?.present) continue
          if (
            !entry.contents.some((content) =>
              hasBlueprintCellContent(content, variant),
            )
          ) {
            continue
          }
          candidates.push({
            pathId,
            stepId,
            cellIds: entry.cellIds,
            // Content only: the canvas fork condition is "content differs OR
            // presence differs", so a detail-only difference (V7) merges into
            // one cell here and is reported by the ledger instead.
            signature: entry.fieldSignatures.content,
          })
        }
        byKey.set(
          mergedSlotKey(lane.id, track.key),
          assembleMergedSlot(pathIds, candidates),
        )
      }
    }
    return byKey
  }, [model, pathIds, rows, runtimeByPathId, tracks])

  /*
    Arrows: every path's cells live in ONE container here, so each path gets
    its own overlay pair over that container (the segments already carry the
    path's colour + dash). A shared slot draws one cell, so a hidden path's
    endpoints are remapped onto the drawn cell and a wholly-shared arrow is
    drawn once — both at the data level.
  */
  const arrowDataByPath = useMemo(() => {
    const remap = buildMergedArrowRemap(assemblyByKey.values())
    // After the remap, two paths' dependencies can land on the SAME drawn
    // (source, target) pair — subset-shared endpoints alias onto one cell.
    // Draw that edge once: N identical strokes stack into one visually
    // "doubled" arrowhead and say nothing extra.
    const drawnEdges = new Set<string>()
    return blueprints.map((blueprint, index) => {
      const data = getComparePathArrowData(blueprint)
      // Kind + label ride the dedupe key: only dependencies that draw the SAME
      // edge with the same meaning collapse. Only `leads_to` reaches here, so
      // it is the label that keeps two distinct edges between one remapped
      // pair apart. Both live on the RAW blueprint dependencies, so look them
      // up by id.
      const rawById = new Map(
        blueprint.dependencies.map((raw) => [raw.id, raw]),
      )
      const remapped = remapMergedPathDependencies(
        data.dependencies,
        remap,
        index === 0,
      )
      const dependencies = remapped.filter((dependency) => {
        const raw = rawById.get(dependency.id)
        const key = [
          dependency.source_cell_id,
          dependency.target_cell_id,
          raw?.kind ?? 'leads_to',
          raw?.name ?? '',
        ].join(' | ')
        if (drawnEdges.has(key)) return false
        drawnEdges.add(key)
        return true
      })
      return { path: blueprint.path, ...data, dependencies }
    })
  }, [assemblyByKey, blueprints])

  return (
    <div
      data-structure-board=""
      data-structure-density={compact ? "compact" : undefined}
      className={cn('w-max shrink-0', className)}
      style={getCompareBoardWrapperPadding()}
    >
      <div
        data-structure-grid=""
        className="relative grid w-max"
        style={{
          gridTemplateColumns,
          gridTemplateRows: `${COMPARE_STEP_HEADER_HEIGHT}px auto`,
          columnGap: STEP_COLUMN_GAP,
        }}
      >
        <CompareStepHeaderRow tracks={tracks} pathId={blueprints[0]?.path.id} />
        <div
          ref={bandRef}
          data-structure-paths={blueprints.map(blueprint => blueprint.path.id).join(' ')}
          className="relative z-0 grid overflow-visible"
          style={{
            gridRow: 2,
            gridColumn: '1 / -1',
            gridTemplateColumns: 'subgrid',
            gridTemplateRows: rowTrackCss,
            // Do NOT rely on gap inheritance into the subgrid — explicit here.
            columnGap: STEP_COLUMN_GAP,
            rowGap: BLUEPRINT_LANE_ROW_GAP,
            marginTop: COMPARE_STACKED_HEADER_GAP,
          }}
        >
          <StructureLaneDraftZone rows={rows} />
          <BlueprintLaneHandles
            bodyRef={bandRef}
            pathId={blueprints[0]?.path.id}
            pathIds={blueprints.map((blueprint) => blueprint.path.id)}
          />
          <BlueprintColumnHandles
            bodyRef={bandRef}
            steps={tracks.map((track) => {
              const path = blueprints.find(
                (blueprint) => track.stepIdByPath[blueprint.path.id],
              )!
              const step = path.steps.find(
                (step) => step.id === track.stepIdByPath[path.path.id],
              )!
              return {
                ...step,
                pathId: path.path.id,
                pathName: path.path.name,
                pathIds: Object.keys(track.stepIdByPath),
              }
            })}
          />
          <MergedSectionFrame blueprints={blueprints} />
          {tracks.map(() => null)}
          {/* One lane rail for the whole comparison — the point of merging. */}
          <BlueprintStickyLabelBackdrop
            rowCount={rows.length}
            bleedTop={COMPARE_STACKED_HEADER_GAP}
            bleedBottom={COMPARE_PATH_SECTION_BOTTOM_INSET - 3}
            bleedLeft={COMPARE_PATH_SECTION_H_INSET - 3}
          />
          {rows.map((row, rowIndex) =>
            row.kind === 'interaction' ||
            row.kind === 'visibility' ||
            row.kind === 'internalInteraction' ? (
              <BlueprintDividerRow
                key={`rail-${row.key}`}
                rowIndex={rowIndex}
                label={row.label}
                lineStyle={
                  row.kind === 'interaction'
                    ? 'dashed'
                    : row.kind === 'internalInteraction'
                    ? 'dotted'
                    : 'solid'
                }
              />
            ) : (
              <Fragment key={`rail-${row.key}`}>
                <BlueprintLabelRow
                  row={row}
                  lanes={lanes}
                  compact={compact}
                  onToggleLane={toggleLane}
                  style={{
                    gridColumn: 1,
                    gridRow: rowIndex + 1,
                    alignSelf: 'start',
                    height: '100%',
                  }}
                />
                {row.showDividerBelow && rows[rowIndex + 1]?.lane?.seamSize === undefined ? (
                  <BlueprintSwimLaneDivider rowIndex={rowIndex} />
                ) : null}
              </Fragment>
            ),
          )}
          {arrowDataByPath.map((data) => (
            <IntegratedDependencyArrows
              key={`forward-${data.path.id}`}
              layer="forward"
              dependencies={data.dependencies}
              cells={data.cells}
              steps={data.steps}
              paths={[data.path]}
              contentRef={bandRef}
              scrollContainerRef={resolvedScrollRef}
            />
          ))}
          {rows.map((row, rowIndex) => (
            <CompareLaneRowShell
              key={row.key}
              row={row}
              rowIndex={rowIndex}
              cellTracksOnly
            >
              {row.lane ? (
                <MergedLaneRow
                  lane={row.lane}
                  lanes={lanes}
                  tracks={tracks}
                  assemblyByKey={assemblyByKey}
                  runtimeByPathId={runtimeByPathId}
                  compact={compact}
                  scenarioName={scenarioName}
                  phaseName={phaseName}
                />
              ) : null}
            </CompareLaneRowShell>
          ))}
          {arrowDataByPath.map((data) => (
            <IntegratedDependencyArrows
              key={`wrap-${data.path.id}`}
              layer="wrap"
              dependencies={data.dependencies}
              cells={data.cells}
              steps={data.steps}
              paths={[data.path]}
              contentRef={bandRef}
              scrollContainerRef={resolvedScrollRef}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Lane × track — the merged grid's DOM-side slot identity. */
function mergedSlotKey(laneId: string, trackKey: string): string {
  return `${laneId}\u0000${trackKey}`
}

function resolveMergedCellVariant(lane: BlueprintLane): BlueprintCellVariant {
  return shouldUseStoryboardContent(lane)
    ? 'storyboard'
    : shouldUseTouchpointCellContent(lane)
    ? 'touchpoints'
    : 'default'
}

/**
 * The merged board's frame: neutral, because it belongs to no single path.
 * The compared paths are named on its top edge in selection order, each
 * badge carrying the short label its cell rails use.
 */
function MergedSectionFrame({ blueprints }: { blueprints: BlueprintData[] }) {
  return (
    <>
      {/* Axis labels stay outside the data boundary in every arrangement. */}
      <div
        aria-hidden
        data-structure-content-frame=""
        className="pointer-events-none absolute rounded-xl border-2 border-border"
        style={{
          top: -COMPARE_PATH_SECTION_TOP_INSET,
          left:
            COMPARE_LABEL_TRACK_WIDTH +
            STEP_COLUMN_GAP -
            COMPARE_PATH_SECTION_H_INSET,
          right: -COMPARE_PATH_SECTION_H_INSET,
          bottom: -COMPARE_PATH_SECTION_BOTTOM_INSET,
          backgroundColor: blueprintPanelSectionFillColor(),
        }}
      />
      <div
        className="pointer-events-auto absolute z-50 flex max-w-[calc(100%-12px)] items-center gap-2"
        style={{
          top: -COMPARE_PATH_SECTION_TOP_INSET,
          left:
            COMPARE_LABEL_TRACK_WIDTH +
            STEP_COLUMN_GAP -
            COMPARE_PATH_SECTION_H_INSET +
            10,
          transform: 'translateY(-50%)',
        }}
      >
        {blueprints.map(({ path }) => (
          <PathLabelBadge
            key={path.id}
            name={path.name}
            summary={path.summary}
            pathKind={path.kind}
          />
        ))}
      </div>
    </>
  )
}

/** One lane, merged: the same slot sequence as a stacked band's lane row. */
function MergedLaneRow({
  lane,
  lanes,
  tracks,
  assemblyByKey,
  runtimeByPathId,
  compact,
  scenarioName,
  phaseName,
}: {
  lane: BlueprintLane
  lanes: BlueprintLane[]
  tracks: readonly CompareGridTrack[]
  assemblyByKey: ReadonlyMap<string, MergedSlotAssembly>
  runtimeByPathId: ReadonlyMap<string, MergedPathRuntime>
  compact?: boolean
  scenarioName?: string
  phaseName?: string
}) {
  const laneStyle = getBlueprintLaneStyle(
    lane.name,
    getBlueprintLaneZone(lane, lanes),
    lane.role,
  )
  const variant = resolveMergedCellVariant(lane)

  return (
    <div className="relative flex items-stretch rounded-md">
      {tracks.map((track, trackIndex) => {
        const isLast = trackIndex === tracks.length - 1
        // The gap element the arrow router measures, indexed in the CANONICAL
        // track space — the same space the sub-cells' `data-step-index`
        // carries. Indexing it per path was the strike-through bug: the
        // router resolves `[data-step-gap="<source's step index>"]`, so a
        // non-primary path's arrow found a gap belonging to a different
        // column — often LEFT of its own source — and the polyline doubled
        // back through the cell it started from.
        const gapSpacer = isLast ? null : (
          <div
            aria-hidden
            className="shrink-0"
            data-step-gap={trackIndex}
            style={{ width: STEP_COLUMN_GAP, minWidth: STEP_COLUMN_GAP }}
          />
        )

        const assembly = assemblyByKey.get(mergedSlotKey(lane.id, track.key))
        const subCells: readonly MergedSubCell[] =
          assembly === undefined || assembly.kind === 'empty'
            ? []
            : assembly.kind === 'shared'
            ? [assembly.representative]
            : assembly.subCells
        // Every drawn cell states its membership positively — a
        // fully-shared cell wears every path's segment, which is the plain
        // "used in both" statement, and a subset cell wears only its own.
        const membershipFor = (
          subCell: MergedSubCell,
        ): CompareCellPathMembership[] | undefined => {
          const memberships = subCell.pathIds
            .map((pathId) => runtimeByPathId.get(pathId)?.membership)
            .filter(
              (membership): membership is CompareCellPathMembership =>
                membership !== undefined,
            )
          return memberships.length > 0 ? memberships : undefined
        }

        return (
          <Fragment key={track.key}>
            {subCells.length === 0 ? (
              <div
                aria-hidden
                data-compare-column-spacer=""
                data-structure-seam-track={
                  track.seamSize !== undefined ? 'step' : undefined
                }
                data-structure-placeholder={
                  lane.id === STRUCTURE_PLACEHOLDER_ID ||
                  Object.values(track.stepIdByPath).includes(
                    STRUCTURE_PLACEHOLDER_ID,
                  )
                    ? ''
                    : undefined
                }
                data-step-index={trackIndex}
                className="shrink-0 self-stretch rounded-md"
                style={{
                  width: track.seamSize === undefined ? Object.values(track.stepIdByPath).includes(STRUCTURE_PLACEHOLDER_ID) ? structureDraftExtent(STEP_COLUMN_WIDTH) : STEP_COLUMN_WIDTH : `calc(var(--structure-seam-progress, 1) * ${track.seamSize}px)`,
                  minWidth: track.seamSize === undefined && !Object.values(track.stepIdByPath).includes(STRUCTURE_PLACEHOLDER_ID) ? STEP_COLUMN_WIDTH : 0,
                }}
              />
            ) : subCells.length === 1 ? (
              <MergedSubCellBlock
                subCell={subCells[0]}
                runtime={runtimeByPathId.get(subCells[0].pathId)}
                columnIndex={trackIndex}
                lane={lane}
                laneStyle={laneStyle}
                variant={variant}
                compact={compact}
                pathMembership={membershipFor(subCells[0])}
                scenarioName={scenarioName}
                phaseName={phaseName}
              />
            ) : (
              <div className="flex shrink-0 flex-col self-start">
                {subCells.map((subCell) => (
                  <MergedSubCellBlock
                    key={`${subCell.pathId}-${subCell.stepId}`}
                    subCell={subCell}
                    runtime={runtimeByPathId.get(subCell.pathId)}
                    columnIndex={trackIndex}
                    lane={lane}
                    laneStyle={laneStyle}
                    variant={variant}
                    compact={compact}
                    pathMembership={membershipFor(subCell)}
                    scenarioName={scenarioName}
                    phaseName={phaseName}
                  />
                ))}
              </div>
            )}
            {gapSpacer}
          </Fragment>
        )
      })}
    </div>
  )
}

/** One path's contribution to a merged slot — a normal compare cell face. */
function MergedSubCellBlock({
  subCell,
  runtime,
  columnIndex,
  lane,
  laneStyle,
  variant,
  compact,
  pathMembership,
  scenarioName,
  phaseName,
}: {
  subCell: MergedSubCell
  runtime: MergedPathRuntime | undefined
  /** Canonical track index — the LAYOUT column, see `stepIndex` below. */
  columnIndex: number
  lane: BlueprintLane
  laneStyle: BlueprintLaneStyle
  variant: BlueprintCellVariant
  compact?: boolean
  /** One entry per member path of this rendered sub-cell. */
  pathMembership?: readonly CompareCellPathMembership[]
  scenarioName?: string
  phaseName?: string
}) {
  // Before the early returns: a hook may not be skipped on some renders.
  const crossPathLinks = useMemo(
    () => (runtime ? crossPathLinksFor(runtime.blueprint, subCell.cellIds) : undefined),
    [runtime, subCell.cellIds],
  )
  if (!runtime) return null
  const { blueprint } = runtime
  const step = runtime.stepById.get(subCell.stepId)
  /*
    Two indices, and merged is the one arrangement where they differ:

    - `columnIndex` is where the cell SITS. It is what `data-step-index`
      carries, because every consumer of that attribute reasons about layout
      (arrow routing: column adjacency, which gap to route through, which
      cells obstruct a run; marquee selection; column queries). Per-path
      indices there make the router compute geometry for a column the cell
      is not in.
    - `pathStepIndex` is which step of ITS OWN path the cell belongs to. That
      is a fact about the data, so it travels in the selection context, where
      the panel and the agent read it.
  */
  const pathStepIndex = runtime.stepIndexById.get(subCell.stepId)
  if (!step || pathStepIndex === undefined) return null

  const cells = subCell.cellIds
    .map((cellId) => runtime.cellById.get(cellId))
    .filter((cell): cell is BlueprintCell => cell !== undefined)
  const isStoryboard = variant === 'storyboard'
  const cell = cells[0]
  const cellId =
    cell?.id ?? (isStoryboard ? `storyboard-${subCell.stepId}` : undefined)
  const storyboardPictures = isStoryboard
    ? resolveStoryboardStripEntries(blueprint, subCell.stepId)
    : undefined

  return (
    <CompareCellBlock
      cellId={cellId}
      stepIndex={columnIndex}
      content={cell?.content}
      laneStyle={laneStyle}
      variant={variant}
      compact={compact}
      storyboardPictures={storyboardPictures}
      slotCells={variant === 'touchpoints' ? cells : undefined}
      pathMembership={pathMembership}
      crossPathLinks={crossPathLinks}
      selectionContext={
        scenarioName && cellId
          ? {
              scenarioName,
              phaseName,
              // The canonical lane name — lanes are reconciled across paths
              // by normalized name, and this path's own lane is the one the
              // cell actually lives in.
              laneName: resolveBlueprintLane(lane, blueprint).name,
              stepId: subCell.stepId,
              stepName: step.name,
              stepIndex: pathStepIndex,
              cellId,
              cellContent: cell?.content ?? '',
              cellFrame: cell?.frame ?? null,
              cellSummary: cell?.summary ?? null,
              cellTouchpoints: cellTouchpoints(cell ?? {}),
              cellResources: cellResources(cell ?? {}),
              pathId: blueprint.path.id,
              pathName: blueprint.path.name,
              pathSummary: blueprint.path.summary,
              pathKind: blueprint.path.kind,
            }
          : undefined
      }
    />
  )
}
