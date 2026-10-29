import { useCellPick } from '@/contexts/cellPickContext'
import { clickOpensDetail } from '@/lib/cellPickGrammar'
import { StructureDragGrip } from './StructureDragGrip'
import { highlightStructure } from './structureHighlight'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
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
 * The step column header: the name, what a step IS, and the way into it.
 *
 * Same treatment as the lane's row header — same size, weight, radius, padding,
 * states and the same three doors: a click anywhere opens the panel, a hover of
 * the whole block surfaces the definition, and a touch ⓘ reveals it where hover
 * cannot. Centred rather than top-left, because that is what a column label is.
 * See `LaneHeaderAffordance` for the z-order fix the label used to hide.
 *
 * The ⓘ is positioned rather than laid out: an icon in the flex row shifts the
 * label off the column's centre by half its width. Out of flow, the label
 * stays centred over the cells it names and the mark sits at the box's edge.
 */
export function StepHeaderAffordance({
  stepId, stepIndex,
  name,
  className,
  style,
}: {
  stepId: string
  stepIndex?: number
  name: string
  className?: string
  style?: React.CSSProperties
}) {
  const pick = useCellPick()
  const rename = useStructureRename('step', stepId, name)
  const { toggleEntity, openEntity, selection } = useEntityDetail()
  const detail = useBlueprintCellDetailOptional()
  const boardInScope = useScenarioBoardInScope()
  /*
    Both halves, exactly as the lane header takes them — see the long note
    there. The provider flag alone left 125 step headers live across every
    mounted board; the board's own scope is what says this is the board the
    reader is looking at.
  */
  const isInteractive = Boolean(detail?.enabled) && boardInScope
  const open = selection?.kind === 'step' && selection.id === stepId

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

  const label = (
    <span
      className={cn(
        'min-w-0 truncate text-center text-muted-foreground',
        CANVAS_HEADER_TEXT,
        CANVAS_HEADER_NAME,
      )}
    >
      {name}
    </span>
  )

  // The definition's touch/keyboard door — see `InfoGlyph` and
  // `CANVAS_HEADER_INFO`. Its tap opens the card and never the panel.
  const info = (
    <EntityDefinitionPopover
      kind="step"
      side="top"
      open={defOpen}
      onOpenChange={setDefOpen}
      anchor={blockRef}
      openOnHover={false}
      nativeButton
    >
      <button
        type="button"
        data-canvas-header-info=""
        aria-label="What is a step?"
        onClick={(event) => event.stopPropagation()}
        className={cn(
          CANVAS_HEADER_INFO,
          'absolute right-3 top-1/2 -translate-y-1/2',
        )}
      >
        <InfoGlyph />
      </button>
    </EntityDefinitionPopover>
  )

  // Inert prose, not a disabled button — see LaneHeaderAffordance. The
  // definition rides on the block whether the panel is reachable or not.
  if (!isInteractive || stepId === STRUCTURE_PLACEHOLDER_ID) {
    return (
      <div
        ref={blockRef}
        role={stepId === STRUCTURE_PLACEHOLDER_ID ? 'status' : undefined}
        aria-label={stepId === STRUCTURE_PLACEHOLDER_ID ? 'New step position' : undefined}
        data-blueprint-column-header=""
        data-step-index={stepIndex}
        data-structure-placeholder={stepId === STRUCTURE_PLACEHOLDER_ID ? '' : undefined}
        style={style}
        onPointerEnter={event=>{ highlightStructure(event.currentTarget,'step',stepIndex ?? 0,true);armHover(event) }}
        onPointerLeave={event=>{ highlightStructure(event.currentTarget,'step',stepIndex ?? 0,false);cancelHover() }}
      onFocusCapture={event=>highlightStructure(event.currentTarget,'step',stepIndex ?? 0,true)}
      onBlurCapture={event=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightStructure(event.currentTarget,'step',stepIndex ?? 0,false)}}
        className={cn(
          'group/step-header relative flex h-full min-w-0 items-center justify-center',
          CANVAS_HEADER_BOX,
          'px-8',
          className,
        )}
      >
        {label}
        {stepId === STRUCTURE_PLACEHOLDER_ID ? null : info}
      </div>
    )
  }

  const openPanel = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    if (pick?.plainClick && !clickOpensDetail(event)) return
    setDefOpen(false)
    if (clickOpensDetail(event)) openEntity({ kind: 'step', id: stepId })
    else toggleEntity({ kind: 'step', id: stepId })
  }

  return (
    <div
      ref={blockRef}
      data-blueprint-column-header=""
      data-step-index={stepIndex}
      data-open={open ? '' : undefined}
      style={style}
      onClick={rename.editing ? undefined : (event) => rename.click(event, () => openPanel(event))}
      onDoubleClick={(event) => {
        cancelHover()
        rename.begin(event)
      }}
      onPointerEnter={event=>{ highlightStructure(event.currentTarget,'step',stepIndex ?? 0,true);armHover(event) }}
      onPointerLeave={event=>{ highlightStructure(event.currentTarget,'step',stepIndex ?? 0,false);cancelHover() }}
      onFocusCapture={event=>highlightStructure(event.currentTarget,'step',stepIndex ?? 0,true)}
      onBlurCapture={event=>{if (!event.currentTarget.contains(event.relatedTarget as Node)) highlightStructure(event.currentTarget,'step',stepIndex ?? 0,false)}}
      className={cn(
        'group/step-header relative flex h-full min-w-0 items-center justify-center',
        CANVAS_HEADER_BOX,
        'px-8',
        CANVAS_HEADER_STATE,
        className,
      )}
    >
      {/* The full-block opener — any click that is not the ⓘ opens the panel;
          the block carries the open, so a click reaching it opens it too. */}
      {rename.editing ? (
        rename.editor
      ) : (
        <>
          <button
            type="button"
            data-structure-reorder="step"
            data-structure-id={stepId}
            data-step-header-affordance=""
            data-canvas-header-opener=""
            aria-label={`View details: ${name}`}
            aria-pressed={open}
            className={CANVAS_HEADER_OPENER}
          ><StructureDragGrip /></button>
          {label}
        </>
      )}
      {info}
    </div>
  )
}
