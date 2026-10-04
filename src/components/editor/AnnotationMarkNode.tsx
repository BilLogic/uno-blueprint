import type { CSSProperties, RefObject } from 'react'
import { cn } from '@/lib/utils'
import {
  annotationTextOnFill,
  type PlacedAnnotation,
  type ShapeAnnotation,
  type StickyAnnotation,
  type TextAnnotation,
} from '@/lib/canvasAnnotations'
import { useFocusTextarea } from '@/hooks/useFocusTextarea'
import { ResizeHandles } from '@/components/editor/CanvasAnnotationResizeHandles'
import { AnnotationStyleBar } from '@/components/editor/AnnotationStyleBar'
import {
  ANNOTATION_MARK_KINDS,
  annotationMarkKind,
} from '@/components/editor/canvasAnnotationKinds'
import { annotationTextBox } from '@/components/editor/canvasAnnotationGeometry'
import type { MovableProps } from '@/components/editor/canvasAnnotationNodeProps'

/**
 * A MARK ON THE BOARD — a shape, a sticky note or bare type.
 *
 * There were three of these, and what they held in common was the whole of
 * the machine: the same root box with the same two data attributes, the same
 * rule for what a press does (stop the event, erase if the eraser is up,
 * ignore a grip or a textarea, select, then drag if dragging is allowed), the
 * same double-click, the same chrome. Only the inside differed — a label
 * fitted to a drawn box, a note that is a textarea all the way through, type
 * that shows its editor until it holds something.
 *
 * So the pointer handler is written once here, and the eraser rule with it.
 * What a kind contributes is its surface — the classes and the box it draws —
 * and its body. Whether a press on the mark's own label opens the editor
 * rather than starting a drag is the kind's too, and comes out of
 * `canvasAnnotationKinds.ts` rather than out of a copy.
 */
export function AnnotationMarkNode({
  annotation,
  zoom,
  onUpdate,
  ...movable
}: MovableProps & {
  annotation: PlacedAnnotation
  zoom: number
  onUpdate: (patch: Partial<PlacedAnnotation>) => void
}) {
  const {
    selected,
    editing,
    canInteract,
    isEraser,
    canDrag,
    onSelect,
    onStartEdit,
    onErase,
    onDragStart,
    onResizeStart,
  } = movable

  const { editOnLabelPress } =
    ANNOTATION_MARK_KINDS[annotationMarkKind(annotation)]
  const showChrome = selected && !isEraser
  const textareaRef = useFocusTextarea(editing)
  const surface = markSurface(annotation, { selected, showChrome })

  return (
    <>
      {showChrome ? (
        <AnnotationStyleBar
          mark={annotation}
          zoom={zoom}
          onChange={onUpdate}
          onDelete={onErase}
        />
      ) : null}
      <div
        data-annotation-id={annotation.id}
        data-annotation-editable=""
        className={cn(
          surface.base,
          canInteract ? 'pointer-events-auto' : 'pointer-events-none',
          surface.chrome,
          canDrag && !editing && 'cursor-grab active:cursor-grabbing',
          surface.extra,
        )}
        style={{ left: annotation.x, top: annotation.y, ...surface.style }}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (isEraser) {
            onErase()
            return
          }
          if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
          if ((e.target as HTMLElement).closest('textarea')) return
          // Click the label to edit without starting a drag.
          if (
            editOnLabelPress &&
            (e.target as HTMLElement).closest('[data-annotation-text]')
          ) {
            onSelect()
            onStartEdit()
            return
          }
          onSelect()
          if (canDrag && !editing) onDragStart(e)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (isEraser) return
          onSelect()
          onStartEdit()
        }}
      >
        <MarkBody
          annotation={annotation}
          editing={editing}
          selected={selected}
          isEraser={isEraser}
          showChrome={showChrome}
          textareaRef={textareaRef}
          onSelect={onSelect}
          onStartEdit={onStartEdit}
          onUpdate={onUpdate}
        />
        {showChrome ? <ResizeHandles onResizeStart={onResizeStart} /> : null}
      </div>
    </>
  )
}

/** The classes and the box a kind of mark draws itself in. */
function markSurface(
  annotation: PlacedAnnotation,
  { selected, showChrome }: { selected: boolean; showChrome: boolean },
): {
  base: string
  chrome: string | false
  extra?: string
  style: CSSProperties
} {
  if (annotation.type === 'sticky') {
    return {
      base: 'absolute box-border rounded-md p-2 shadow-md',
      // The sticky is the one kind that wears a border either way — an
      // unselected note still has to read as a card on the board.
      chrome: showChrome
        ? 'border-2 border-annotation-selected'
        : 'border border-annotation-plate',
      style: {
        width: annotation.width,
        height: annotation.height,
        backgroundColor: annotation.color,
      },
    }
  }

  if (annotation.type === 'text') {
    const { width, height } = annotationTextBox(annotation.fontSize)
    return {
      base: 'absolute min-w-[4rem] box-border',
      chrome:
        showChrome &&
        'border-2 border-annotation-selected bg-(--background-annotation-plate)',
      style: {
        color: annotation.color,
        fontSize: annotation.fontSize,
        width,
        minHeight: height,
      },
    }
  }

  const hasFill = Boolean(annotation.fillColor)
  return {
    base: 'absolute box-border flex flex-col items-center justify-center p-2 transition-[box-shadow,outline-color] ease-arrive motion-reduce:transition-none duration-(--motion-micro)',
    chrome:
      showChrome && 'outline outline-2 outline-offset-0 outline-annotation-selected',
    extra: cn(hasFill && 'shadow-sm', !selected && 'overflow-hidden'),
    style: {
      width: annotation.width,
      height: annotation.height,
      borderStyle: annotation.color ? 'solid' : 'none',
      borderWidth: annotation.color ? annotation.strokeWidth : 0,
      borderColor: annotation.color ?? 'transparent',
      backgroundColor: annotation.fillColor ?? 'transparent',
      borderRadius: annotation.type === 'ellipse' ? '50%' : 8,
      boxShadow: hasFill ? 'var(--shadow-blueprint-annotation-fill)' : undefined,
    },
  }
}

type BodyProps = {
  editing: boolean
  selected: boolean
  isEraser: boolean
  showChrome: boolean
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onSelect: () => void
  onStartEdit: () => void
  onUpdate: (patch: Partial<PlacedAnnotation>) => void
}

/** What sits inside the box — the one thing the three kinds do not share. */
function MarkBody({
  annotation,
  ...body
}: BodyProps & { annotation: PlacedAnnotation }) {
  if (annotation.type === 'sticky') {
    return <StickyBody annotation={annotation} {...body} />
  }
  if (annotation.type === 'text') {
    return <TextBody annotation={annotation} {...body} />
  }
  return <ShapeBody annotation={annotation} {...body} />
}

/** A drawn box's optional label, fitted inside it. */
function ShapeBody({
  annotation,
  editing,
  selected,
  textareaRef,
  onUpdate,
}: BodyProps & { annotation: ShapeAnnotation }) {
  const isEllipse = annotation.type === 'ellipse'
  const textColor = annotationTextOnFill(annotation.fillColor)
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-2">
      {editing ? (
        <textarea
          ref={textareaRef}
          value={annotation.text}
          placeholder="Add text…"
          rows={Math.max(1, annotation.text.split('\n').length)}
          // geometry: type is fitted to the drawn annotation box.
          className={cn(
            'max-h-full w-full resize-none border-0 bg-transparent text-center font-sans leading-snug outline-none placeholder:opacity-40',
            isEllipse && 'px-3',
            'pointer-events-auto cursor-text',
          )}
          style={{ color: textColor, fontSize: 14 }}
          onChange={(e) => onUpdate({ text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          data-annotation-text=""
          // geometry: type is fitted to the drawn annotation box.
          className={cn(
            'pointer-events-auto max-h-full w-full overflow-hidden text-center font-sans text-sm leading-snug whitespace-pre-wrap break-words',
            isEllipse && 'px-3',
            !annotation.text && 'opacity-40',
          )}
          style={{ color: textColor }}
        >
          {annotation.text || (selected ? 'Add text…' : null)}
        </div>
      )}
    </div>
  )
}

/** A sticky note, which is a textarea all the way through. */
function StickyBody({
  annotation,
  editing,
  selected,
  isEraser,
  textareaRef,
  onSelect,
  onStartEdit,
  onUpdate,
}: BodyProps & { annotation: StickyAnnotation }) {
  return (
    <textarea
      ref={textareaRef}
      value={annotation.text}
      placeholder="Sticky note…"
      readOnly={!editing}
      // geometry: type is fitted to the drawn annotation box.
      className={cn(
        'size-full resize-none border-0 font-sans leading-snug text-annotation-plate-foreground outline-none placeholder:text-(--foreground-annotation-chrome-tertiary)',
        editing || selected
          ? 'pointer-events-auto cursor-text'
          : 'pointer-events-none cursor-inherit',
        annotation.bold && 'font-medium',
        annotation.strike && 'line-through',
      )}
      style={{
        backgroundColor: annotation.color,
        fontSize: annotation.fontSize,
      }}
      onChange={(e) => onUpdate({ text: e.target.value })}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (isEraser) return
        onSelect()
        if (!editing) onStartEdit()
      }}
      onFocus={() => {
        if (!editing && !isEraser) onStartEdit()
      }}
    />
  )
}

/** Bare type, which shows its editor until it holds something. */
function TextBody({
  annotation,
  editing,
  isEraser,
  showChrome,
  textareaRef,
  onSelect,
  onStartEdit,
  onUpdate,
}: BodyProps & { annotation: TextAnnotation }) {
  const align = annotation.align ?? 'left'
  const textAlignClass =
    align === 'center'
      ? 'text-center'
      : align === 'right'
        ? 'text-right'
        : 'text-left'

  if (editing || !annotation.text) {
    return (
      <textarea
        ref={textareaRef}
        value={annotation.text}
        placeholder="Type…"
        rows={2}
        // geometry: type is fitted to the drawn annotation box.
        className={cn(
          'w-full resize-none px-2 py-1 font-sans leading-snug outline-none',
          'pointer-events-auto cursor-text',
          textAlignClass,
          annotation.bold && 'font-medium',
          annotation.strike && 'line-through',
          showChrome
            ? 'border-0 bg-transparent text-inherit'
            : 'rounded-md border border-muted bg-card/95 text-foreground shadow-sm focus:border-ring',
        )}
        style={{ fontSize: annotation.fontSize }}
        onChange={(e) => onUpdate({ text: e.target.value })}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (isEraser) return
          onSelect()
          if (!editing) onStartEdit()
        }}
      />
    )
  }

  return (
    <div
      // geometry: type is fitted to the drawn annotation box.
      className={cn(
        'max-w-full px-2 py-1 whitespace-pre-wrap font-sans leading-snug',
        textAlignClass,
        annotation.bold && 'font-medium',
        annotation.strike && 'line-through',
      )}
    >
      {annotation.text}
    </div>
  )
}
