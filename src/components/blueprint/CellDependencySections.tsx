import { useId, useState, type ReactNode } from 'react'
import { PanelSectionLabel } from '@/components/blueprint/PanelSectionLabel'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Plus,
} from 'lucide-react'
import {
  DependencyEditRow,
  InboundRowPencil,
  type DependencyEditing,
} from '@/components/blueprint/CellDependencyEditor'
import { TouchpointCellFace } from '@/components/blueprint/TouchpointCellFace'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { cellJumpTarget, useJumpToCell } from '@/hooks/useJumpToCell'
import type {
  BlueprintCellConnection,
  BlueprintCellConnections,
} from '@/lib/blueprintCellConnections'
import { cn } from '@/lib/utils'

export type CellDependencyTechEntry = {
  id: string
  cellId: string
  item: string
  laneName?: string
  stepIndex?: number
}

type SelectHandlers = {
  onCellSelect: (cellId: string) => void
  onTechSelect: (cellId: string, techItem: string) => void
}

type RowDirection = 'prev' | 'next' | 'up' | 'down' | 'related'

/** Indents wrapped detail lines under the label: DirectionIcon width (size-3, 12px) + the row's 7px gap. */
const detailIndentClass = 'pl-[19px]'

/** Which list(s) a connection came from — drives the direction glyph. */
type RowFlow = 'in' | 'out'

function resolveRowDirection(
  connection: BlueprintCellConnection,
  flow: RowFlow,
  selectedLaneRowPosition: number,
): RowDirection {
  if (connection.kind === 'interaction') {
    // Same step, different lane — vertical relationship.
    if (selectedLaneRowPosition < 0) return 'related'
    return connection.laneRowPosition < selectedLaneRowPosition
      ? 'up'
      : 'down'
  }
  return flow === 'in' ? 'prev' : 'next'
}

function DirectionIcon({ direction }: { direction: RowDirection }) {
  const iconClass = 'size-3 shrink-0 text-muted-foreground'

  switch (direction) {
    case 'up':
      return <ArrowUp className={iconClass} aria-hidden />
    case 'down':
      return <ArrowDown className={iconClass} aria-hidden />
    case 'prev':
      return <ArrowLeft className={iconClass} aria-hidden />
    case 'next':
      return <ArrowRight className={iconClass} aria-hidden />
    default:
      // Same-step relationship without an explicit directional connection.
      return <Plus className={iconClass} aria-hidden />
  }
}

/**
 * Where the other end is, after the lane: its step number on this board, or
 * — for an end on another path, whose column this board never read — its
 * step's name.
 */
function connectionStepLabel(connection: BlueprintCellConnection): string {
  return connection.reachedIn
    ? connection.stepName
    : `Step ${connection.stepIndex + 1}`
}

/** Lane and step, as the row itself says them — and as the pencil names them. */
function connectionRowLabel(connection: BlueprintCellConnection): string {
  const label = `${connection.laneName} · ${connectionStepLabel(connection)}`
  return connection.reachedIn
    ? `${label} in ${connection.reachedIn.placeName}`
    : label
}


/**
 * One connection, as one line: the direction, then the lane and step of the
 * cell at the other end. Nothing else at rest.
 *
 * The rest is read one row at a time, on hover or keyboard focus, from the
 * app's tooltip: where the other end is when it is on another path, then
 * what that cell says, then the note on the edge. A list that printed all of
 * it drew three or four lines per row and read as a wall. The same words are
 * the row's description (`aria-describedby`), because this tooltip is not an
 * accessible name — its popup carries no role and no link back — and a
 * screen reader has to reach them without a pointer.
 *
 * A connection to another path differs at rest by one muted mark at the end
 * of the line, the "leaves this path" arrow, named for a screen reader. On
 * touch nothing hovers: the line stays one line and a tap goes to the other
 * cell, whose own panel says what it is and where.
 */
function DependencyRow({
  connection,
  direction,
  action,
  onCellSelect,
  onTechSelect,
}: {
  connection: BlueprintCellConnection
  direction: RowDirection
  /**
   * Absolutely positioned at the row's top right — the arriving row's pencil.
   * Overlaid rather than laid out beside the text, because the pencil belongs
   * to the whole row rather than to its first line.
   */
  action?: ReactNode
} & SelectHandlers) {
  const detail = useBlueprintCellDetailOptional()
  const jump = useJumpToCell()
  const describedById = useId()
  const reachedIn = connection.reachedIn
  const cellText = connection.isTech ? '' : connection.contentPreview
  const hasDetail = Boolean(reachedIn || cellText || connection.linkNote)

  const preview = (techItem: string | null) => {
    detail?.setPreviewHover({ cellId: connection.cellId, techItem })
  }
  const clearPreview = () => detail?.setPreviewHover(null)

  const row = (
    <button
      type="button"
      className="flex min-w-0 items-center gap-[7px] text-left text-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
      aria-describedby={hasDetail ? describedById : undefined}
      onMouseEnter={() => preview(null)}
      onMouseLeave={clearPreview}
      onFocus={() => preview(null)}
      onBlur={clearPreview}
      onClick={() => {
        clearPreview()
        // An end on another path is not on this board, so selecting it here
        // would select nothing: go there instead, as the cell's marker does.
        if (reachedIn) {
          jump?.(cellJumpTarget(connection.cellId, reachedIn))
          return
        }
        onCellSelect(connection.cellId)
      }}
      data-dependency-reached-in={reachedIn ? '' : undefined}
    >
      <DirectionIcon direction={direction} />
      <span className="min-w-0 flex-1 truncate font-normal text-foreground">
        {connection.laneName}
        <span className="text-muted-foreground">
          {' '}
          · {connectionStepLabel(connection)}
        </span>
      </span>
      {reachedIn ? (
        <>
          <ArrowUpRight
            className="size-3 shrink-0 text-muted-foreground"
            aria-hidden
            data-dependency-leaves-path=""
          />
          <span className="sr-only">On another path</span>
        </>
      ) : null}
    </button>
  )

  const detailLines = (
    <>
      {reachedIn ? <span>{reachedIn.placeDetail}</span> : null}
      {cellText ? (
        <span className={reachedIn ? 'text-muted-foreground' : undefined}>
          {cellText}
        </span>
      ) : null}
      {connection.linkNote ? (
        <span className="text-muted-foreground italic">{connection.linkNote}</span>
      ) : null}
    </>
  )

  return (
    <li
      className={cn(
        'group border-b border-muted last:border-0',
        action ? 'relative' : undefined,
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-1 px-2 py-2 text-xs transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover:bg-accent group-focus-within:bg-accent',
          action ? 'pr-8' : undefined,
        )}
      >
        {hasDetail ? (
          <>
            <span id={describedById} className="sr-only" data-dependency-detail="">
              {detailLines}
            </span>
            <Tooltip>
              <TooltipTrigger render={row} />
              <TooltipContent className="flex max-w-72 flex-col items-start gap-1 text-left">
                {detailLines}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          row
        )}
        {connection.isTech && connection.techItems.length > 0 ? (
          <span className={cn('flex flex-wrap gap-1 pt-1', detailIndentClass)}>
            {connection.techItems.map((item) => (
              <button
                key={item}
                type="button"
                className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                onMouseEnter={() => preview(item)}
                onMouseLeave={clearPreview}
                onFocus={() => preview(item)}
                onBlur={clearPreview}
                onClick={() => {
                  clearPreview()
                  onTechSelect(connection.cellId, item)
                }}
              >
                <TouchpointCellFace
                  item={item}
                  compact
                  asSpan
                  inline
                  // geometry: packs the name into the compact inline face, not a canvas cell.
                  className="!w-fit max-w-full !px-2 !py-1 !text-xs !font-normal leading-none text-muted-foreground"
                />
              </button>
            ))}
          </span>
        ) : null}
        {action}
      </div>
    </li>
  )
}

function DependencyGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1" data-dependency-group={title}>
      <PanelSectionLabel>{title}</PanelSectionLabel>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

type CellDependencySectionsProps = {
  connections: BlueprintCellConnections
  /** Touchpoints on the same step that no connection of this cell names. */
  otherTech: CellDependencyTechEntry[]
  /** Lane row position of the selected cell — orients up/down glyphs. */
  selectedLaneRowPosition?: number
  /**
   * Present only in edit mode. Absent, this is exactly the read list it has
   * always been — the same component, not a second one.
   */
  editing?: Omit<DependencyEditing, 'activeDependencyId' | 'onActivate'> | null
  className?: string
} & SelectHandlers

/**
 * Dependencies tab: grouped by the kind and by which end of it this cell is.
 *
 *   Follows      `leads_to` arriving       Leads to   `leads_to` leaving
 *   Enabled by   `enables` arriving        Enables    `enables` leaving
 *
 * The recorded kind is split by end the way the drawn kind is. One group for
 * both ends read "Enables › A" at the target, i.e. as this cell enabling A —
 * the inversion the rename existed to end. Each end gets its own word.
 *
 * ONE LIST, IN BOTH MODES. Edit mode does not add a second list of the same
 * edges — it turns the rows this cell OWNS (the two leaving groups) into the
 * fields for those rows, where they already sit, and hangs a pencil on the
 * arriving ones, which belong to the cell at the other end. The headings, the
 * grouping and the reading order are the same in both modes, because they are
 * the same list.
 *
 * The last group, "Also on this step", is the touchpoints standing in the same
 * step that nothing on this cell points at. A touchpoint is not always
 * technology, so the heading says where they stand rather than what they are.
 */
export function CellDependencySections({
  connections,
  otherTech,
  selectedLaneRowPosition = -1,
  editing = null,
  onCellSelect,
  onTechSelect,
  className,
}: CellDependencySectionsProps) {
  /*
    Which owned row has its note field open. One at a time: "the row being
    edited" is a singular thing, and a note field under every owned row would
    be eight fields where most edges carry no note. Set on focus or
    pointer-down within a row and cleared only when another row claims it —
    never on blur, because the select's list is a portal and losing focus to it
    would close the row that opened it.
  */
  const [activeDependencyId, setActiveDependencyId] = useState<string | null>(
    null,
  )
  const jump = useJumpToCell()

  const follows = connections.incoming.filter(
    (connection) => connection.linkKind === 'leads_to',
  )
  const leadsTo = connections.outgoing.filter(
    (connection) => connection.linkKind === 'leads_to',
  )
  const enabledBy = connections.incoming.filter(
    (connection) => connection.linkKind === 'enables',
  )
  const enables = connections.outgoing.filter(
    (connection) => connection.linkKind === 'enables',
  )

  const linkedTechIds = new Set(
    [...connections.incoming, ...connections.outgoing].flatMap((connection) =>
      connection.techItems.map((item) => `${connection.cellId}:${item}`),
    ),
  )
  const remainingTech = otherTech.filter(
    (entry) => !linkedTechIds.has(entry.id),
  )

  if (
    follows.length === 0 &&
    leadsTo.length === 0 &&
    enabledBy.length === 0 &&
    enables.length === 0 &&
    remainingTech.length === 0
  ) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        No dependencies recorded for this cell.
      </p>
    )
  }

  const handlers = { onCellSelect, onTechSelect }
  const direction = (connection: BlueprintCellConnection, flow: RowFlow) =>
    resolveRowDirection(connection, flow, selectedLaneRowPosition)

  const rowEditing: DependencyEditing | null = editing
    ? { ...editing, activeDependencyId, onActivate: setActiveDependencyId }
    : null

  /** A leaving row — this cell's own — as the fields for that row, or as read. */
  const leavingRow = (connection: BlueprintCellConnection, keyPrefix: string) =>
    rowEditing ? (
      <DependencyEditRow
        key={`edit:${connection.dependencyId}`}
        dependencyId={connection.dependencyId}
        kind={connection.linkKind}
        targetCellId={connection.cellId}
        note={connection.linkNote}
        editing={rowEditing}
      />
    ) : (
      <DependencyRow
        key={`${keyPrefix}:${connection.dependencyId}`}
        connection={connection}
        direction={direction(connection, 'out')}
        {...handlers}
      />
    )

  /** An arriving row: flat text, and in edit mode the way to its owner. */
  const arrivingRow = (connection: BlueprintCellConnection, keyPrefix: string) => {
    const ownerReachedIn = connection.reachedIn
    return (
      <DependencyRow
        key={`${keyPrefix}:${connection.dependencyId}`}
        connection={connection}
        direction={direction(connection, 'in')}
        action={
          rowEditing ? (
            <InboundRowPencil
              ownerCellId={connection.cellId}
              ownerLabel={connectionRowLabel(connection)}
              onEditFromOwner={
                // The owner of an arrival from another path is on that path:
                // the pencil goes there, where the row is the owner's to edit.
                ownerReachedIn
                  ? (cellId) => jump?.(cellJumpTarget(cellId, ownerReachedIn))
                  : rowEditing.onEditFromOwner
              }
            />
          ) : undefined
        }
        {...handlers}
      />
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {follows.length > 0 ? (
        <DependencyGroup title="Follows">
          {follows.map((connection) => arrivingRow(connection, 'in'))}
        </DependencyGroup>
      ) : null}
      {leadsTo.length > 0 ? (
        <DependencyGroup title="Leads to">
          {leadsTo.map((connection) => leavingRow(connection, 'out'))}
        </DependencyGroup>
      ) : null}
      {enabledBy.length > 0 ? (
        <DependencyGroup title="Enabled by">
          {enabledBy.map((connection) => arrivingRow(connection, 'enabled-by'))}
        </DependencyGroup>
      ) : null}
      {enables.length > 0 ? (
        <DependencyGroup title="Enables">
          {enables.map((connection) => leavingRow(connection, 'enables'))}
        </DependencyGroup>
      ) : null}
      {remainingTech.length > 0 ? (
        <DependencyGroup title="Also on this step">
          <li className="px-2 py-2">
            <span className="flex flex-wrap gap-1">
              {remainingTech.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onTechSelect(entry.cellId, entry.item)}
                >
                  <TouchpointCellFace
                    item={entry.item}
                    compact
                    asSpan
                    inline
                    // geometry: packs the name into the compact inline face, not a canvas cell.
                    className="!w-fit max-w-full !px-2 !py-1 !text-xs !font-normal leading-none text-muted-foreground"
                  />
                </button>
              ))}
            </span>
          </li>
        </DependencyGroup>
      ) : null}
    </div>
  )
}
