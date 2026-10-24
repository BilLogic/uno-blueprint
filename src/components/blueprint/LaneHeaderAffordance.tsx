import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import { highlightStructure } from './structureHighlight'
import { useStructureRename } from './useStructureRename'
import { useEffect, useRef, useState } from 'react'
import { EntityDefinitionPopover } from '@/components/blueprint/EntityDefinitionPopover'
import { useBlueprintCellDetailOptional } from '@/contexts/BlueprintCellDetailContext'
import { useScenarioBoardInScope } from '@/contexts/scenarioBoardScopeContext'
import { useEntityDetail } from '@/contexts/EntityDetailContext'
import {
  CANVAS_HEADER_BOX,
  CANVAS_HEADER_HOVER_DELAY,
  CANVAS_HEADER_INFO,
  CANVAS_HEADER_NAME,
  CANVAS_HEADER_OPENER,
  CANVAS_HEADER_STATE,
  CANVAS_HEADER_TEXT,
} from '@/lib/canvasHeaderStyle'
import { cn } from '@/lib/utils'

/**
 * A hand-drawn information mark. Not `lucide-react`: these headers carry no
 * icon-library glyph by rule (see `definitionCard.test.tsx`), and this is the
 * single deliberate exception — a touch affordance, not decoration.
 */
function InfoGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 7.1v3.4" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

/**
 * The lane's name, what a lane IS, and the way into this one's properties.
 *
 * Three readers, three doors. A pointer reader clicks anywhere on the block —
 * the label included — to open the panel, and rests on it to learn what a lane
 * is; the definition opens on a hover of the WHOLE block, not of one word. A
 * keyboard reader tabs to the opener to open the panel and to the ⓘ to read
 * the definition. A touch reader, who has no hover and whose tap is already
 * the panel's, gets the ⓘ — invisible on a device that hovers, drawn only
 * where hover is not.
 *
 * The z-order bug the label used to hide: the name painted above the opener
 * (`z-10`) and swallowed its own click. `pointer-events-none` on the name lets
 * the click fall through to the opener; the block also carries the open so a
 * click that reaches it (a keyboard activation, a test) opens the panel too.
 * The name stops being a distinct target — it is just the word now.
 *
 * Top-left aligned, because a lane label reads down a tall row — the only
 * thing it does differently from the column header it shares a treatment with.
 *
 * NOT used where the label already means something else. In the compare rail's
 * Design mode the label is a *selection* handle — clicking takes every cell in
 * the lane — and a second meaning on the same word would make both ambiguous.
 * There the ⓘ stays a button of its own, beside it (`EntityPropertiesButton`).
 */
export function LaneHeaderAffordance({
  laneId,
  laneName,
  color,
  className,
}: {
  laneId: string
  laneName: string
  /** The lane's own label ink — role-derived, passed by the caller. */
  color?: string
  className?: string
}) {
  const rename = useStructureRename('lane', laneId, laneName)
  const { toggleEntity, selection } = useEntityDetail()
  const detail = useBlueprintCellDetailOptional()
  const boardInScope = useScenarioBoardInScope()
  /*
    TWO facts, and the bug was shipping with only the first.

    `detail.enabled` is the feature flag and the detail view — but it is ONE
    boolean on a provider mounted above the entire canvas, and every scenario
    board stays mounted behind the focused one. So focusing any single scenario
    turned this header live on all of them. `boardInScope` is the missing half:
    this board is the focused/solo scenario, not merely a mounted one.
  */
  const isInteractive = Boolean(detail?.enabled) && boardInScope
  const open = selection?.kind === 'lane' && selection.id === laneId

  /*
    The definition opens on a hover of the whole block, on a short delay, and
    on a tap or keypress of the ⓘ. The block owns the hover (the ⓘ's own is
    off), so the card centres on the block through `anchor` rather than on the
    corner mark. The pointer type gates the timer: a touch "hover" is not one.
  */
  const blockRef = useRef<HTMLDivElement>(null)
  const [defOpen, setDefOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  const armHover = (event: React.PointerEvent) => {
    if (rename.editing || event.pointerType === 'touch') return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(
      () => setDefOpen(true),
      CANVAS_HEADER_HOVER_DELAY,
    )
  }
  const cancelHover = () => {
    clearTimeout(hoverTimer.current)
    setDefOpen(false)
  }

  const nameSpan = (
    <span
      className={cn(
        'min-w-0 flex-1 whitespace-normal break-words',
        CANVAS_HEADER_TEXT,
        CANVAS_HEADER_NAME,
      )}
      style={color ? { color } : undefined}
    >
      {laneName}
    </span>
  )

  // The definition's touch/keyboard door — see `InfoGlyph` and
  // `CANVAS_HEADER_INFO`. Its tap opens the card and stops there: the panel is
  // never opened from here, so a touch reader can read without also opening.
  const info = (
    <EntityDefinitionPopover
      kind="lane"
      side="right"
      open={defOpen}
      onOpenChange={setDefOpen}
      anchor={blockRef}
      openOnHover={false}
      nativeButton
    >
      <button
        type="button"
        data-canvas-header-info=""
        aria-label="What is a lane?"
        onClick={(event) => event.stopPropagation()}
        className={cn(CANVAS_HEADER_INFO, 'absolute right-1 top-1')}
      >
        <InfoGlyph />
      </button>
    </EntityDefinitionPopover>
  )

  // Inert prose, not a disabled button: there is nothing to enable here, so a
  // control that announces itself and refuses is worse than no control. The
  // definition is still on the block, because "what is a lane?" is not a
  // question about which board is in scope.
  if (!isInteractive || laneId === STRUCTURE_PLACEHOLDER_ID) {
    return (
      <div
        ref={blockRef}
        data-blueprint-row-header=""
        onPointerEnter={event=>{ highlightStructure(event.currentTarget,'lane',laneName,true);armHover(event) }}
        onPointerLeave={event=>{ highlightStructure(event.currentTarget,'lane',laneName,false);cancelHover() }}
      onFocusCapture={event=>highlightStructure(event.currentTarget,'lane',laneName,true)}
      onBlurCapture={event=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightStructure(event.currentTarget,'lane',laneName,false)}}
        className={cn(
          'group/lane-header relative flex min-w-0 flex-1 items-start self-stretch text-left',
          CANVAS_HEADER_BOX,
          className,
        )}
      >
        {nameSpan}
        {laneId === STRUCTURE_PLACEHOLDER_ID ? null : info}
      </div>
    )
  }

  const openPanel = (event: React.SyntheticEvent) => {
    // The canvas pans on pointer-down anywhere it does not recognise; opening a
    // panel is neither a pan nor a selection. Close any open definition so the
    // click reads as one action.
    event.stopPropagation()
    setDefOpen(false)
    toggleEntity({ kind: 'lane', id: laneId })
  }

  return (
    <div
      ref={blockRef}
      data-blueprint-row-header=""
      data-open={open ? '' : undefined}
      onClick={rename.editing ? undefined : (event) => rename.click(event, () => openPanel(event))}
      onDoubleClick={(event) => {
        cancelHover()
        rename.begin(event)
      }}
      onPointerEnter={event=>{ highlightStructure(event.currentTarget,'lane',laneName,true);armHover(event) }}
      onPointerLeave={event=>{ highlightStructure(event.currentTarget,'lane',laneName,false);cancelHover() }}
      onFocusCapture={event=>highlightStructure(event.currentTarget,'lane',laneName,true)}
      onBlurCapture={event=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightStructure(event.currentTarget,'lane',laneName,false)}}
      className={cn(
        // No negative margins. They pulled the ink block outside the rail,
        // which clips (`overflow-hidden`) — so the hover surface came back cut
        // off on one edge. The rail's own padding gives the room.
        'group/lane-header flex min-w-0 flex-1 items-start self-stretch text-left',
        CANVAS_HEADER_BOX,
        CANVAS_HEADER_STATE,
        className,
      )}
    >
      {/* The full-block opener. It fills the box, so any click that is not the
          ⓘ opens the panel; the click bubbles to the block, which carries the
          open — so a click that reaches the block (a keyboard activation, a
          click on the label falling through) opens it too. */}
      {rename.editing ? (
        rename.editor
      ) : (
        <>
          <button
            type="button"
            data-lane-header-affordance=""
            data-canvas-header-opener=""
            aria-label={`View details: ${laneName}`}
            aria-pressed={open}
            className={CANVAS_HEADER_OPENER}
          />
          {nameSpan}
        </>
      )}
      {info}
    </div>
  )
}
