import { Fragment, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Circle,
  Square,
  Strikethrough,
  Trash2,
} from 'lucide-react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import {
  ANNOTATION_DEFAULT_STROKE,
  ANNOTATION_FILL_SWATCHES,
  ANNOTATION_FONT_SIZES,
  ANNOTATION_STROKE_SWATCHES,
  ANNOTATION_STROKE_WIDTHS,
  annotationFontSizeLabel,
  annotationSwatchName,
  type PlacedAnnotation,
  type ShapeAnnotation,
  type StickyAnnotation,
  type TextAnnotation,
} from '@/lib/canvasAnnotations'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  AnnotationStyleBarFrame,
  AnnotationBarDivider,
  AnnotationBarTooltip,
} from '@/components/editor/CanvasAnnotationBarChrome'
import {
  ANNOTATION_BAR_ICON_BUTTON_CLASS,
  ANNOTATION_BAR_ITEM_CLASS,
  ANNOTATION_BAR_MENU_CLASS,
  ANNOTATION_BAR_TRIGGER_CLASS,
} from '@/components/editor/canvasAnnotationChromeStyles'
import {
  ColorSwatch,
  StrokeWidthSwatch,
} from '@/components/editor/CanvasAnnotationSwatches'
import { annotationMarkBox } from '@/components/editor/canvasAnnotationGeometry'
import {
  annotationBarControls,
  annotationMarkKind,
  type AnnotationBarControl,
} from '@/components/editor/canvasAnnotationKinds'
import { cn } from '@/lib/utils'

/**
 * THE FLOATING STYLE BAR, FOR EVERY KIND OF MARK.
 *
 * One bar, drawing the controls the selected mark's row of
 * `canvasAnnotationKinds.ts` declares. There were three of these — a shape
 * bar, a sticky bar and a text bar — and the sticky bar was the text bar
 * without its alignment control: the same size popover to the character, a
 * colour popover differing only in which swatches it offers, the same
 * bold-and-strikethrough pair, the same delete button under a different noun.
 * Fixing an aria label or a divider meant finding two or three files, and the
 * 692 lines of bar had no test that could go red on behaviour.
 *
 * Each control below is written once and takes only what it draws. The table
 * says which of them a kind offers, and in what grouping — a rule is drawn
 * between groups and nothing between the members of one — so a fourth kind of
 * mark adds a row rather than a file.
 */

/** What a control does when it is used: patch the mark it was drawn for. */
type ChangeStyle = (patch: Partial<PlacedAnnotation>) => void

export function AnnotationStyleBar({
  mark,
  zoom,
  onChange,
  onDelete,
}: {
  mark: PlacedAnnotation
  zoom: number
  onChange: ChangeStyle
  onDelete: () => void
}) {
  const box = annotationMarkBox(mark)
  const controls = annotationBarControls(annotationMarkKind(mark))

  return (
    <AnnotationStyleBarFrame x={box.x} y={box.y} width={box.width} zoom={zoom}>
      {controls.map((group, index) => (
        // A group is a grouping, not a box: the plate is one flex row, and a
        // wrapper around two of its children would space them differently
        // from the rest. So the rule between groups is drawn here, and
        // nothing at all is drawn between the members of one.
        <Fragment key={group.map((control) => control.id).join('+')}>
          {index > 0 ? <AnnotationBarDivider /> : null}
          {group.map((control) => (
            <Control
              key={control.id}
              control={control}
              mark={mark}
              onChange={onChange}
              onDelete={onDelete}
            />
          ))}
        </Fragment>
      ))}
    </AnnotationStyleBarFrame>
  )
}

/** The one place a control id becomes a control. */
function Control({
  control,
  mark,
  onChange,
  onDelete,
}: {
  control: AnnotationBarControl
  mark: PlacedAnnotation
  onChange: ChangeStyle
  onDelete: () => void
}) {
  // Narrowed once, here, rather than in every control: the table already
  // guarantees the pairing — no kind but the shape offers `fill` — and this is
  // where that guarantee meets the type system.
  const shape: ShapeAnnotation | null =
    mark.type === 'rect' || mark.type === 'ellipse' ? mark : null
  const typed: StickyAnnotation | TextAnnotation | null =
    mark.type === 'sticky' || mark.type === 'text' ? mark : null
  const textual: TextAnnotation | null = mark.type === 'text' ? mark : null

  switch (control.id) {
    case 'shapeType':
      return shape ? <ShapeTypeControl shape={shape} onChange={onChange} /> : null
    case 'fill':
      return shape ? <FillControl shape={shape} onChange={onChange} /> : null
    case 'stroke':
      return shape ? <StrokeControl shape={shape} onChange={onChange} /> : null
    case 'color':
      return typed ? (
        <ColorControl
          color={typed.color}
          swatches={control.swatches}
          swatchLabel={control.swatchLabel}
          onChange={onChange}
        />
      ) : null
    case 'fontSize':
      return typed ? (
        <FontSizeControl fontSize={typed.fontSize} onChange={onChange} />
      ) : null
    case 'bold':
      return typed ? (
        <ToggleControl
          label="Bold"
          Icon={Bold}
          pressed={Boolean(typed.bold)}
          onToggle={() => onChange({ bold: !typed.bold })}
        />
      ) : null
    case 'strike':
      return typed ? (
        <ToggleControl
          label="Strikethrough"
          Icon={Strikethrough}
          pressed={Boolean(typed.strike)}
          onToggle={() => onChange({ strike: !typed.strike })}
        />
      ) : null
    case 'align':
      return textual ? (
        <AlignControl align={textual.align ?? 'left'} onChange={onChange} />
      ) : null
    case 'delete':
      return <DeleteControl label={control.label} onDelete={onDelete} />
  }
}

/** Rectangle or ellipse — the only control that changes what a mark IS. */
function ShapeTypeControl({
  shape,
  onChange,
}: {
  shape: ShapeAnnotation
  onChange: ChangeStyle
}) {
  const ShapeIcon = shape.type === 'ellipse' ? Circle : Square
  return (
    <DropdownMenu>
      <AnnotationBarTooltip label="Shape">
        <DropdownMenuTrigger
          aria-label="Shape"
          className={ANNOTATION_BAR_TRIGGER_CLASS}
        >
          <ShapeIcon className="size-4" strokeWidth={2} aria-hidden />
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </DropdownMenuTrigger>
      </AnnotationBarTooltip>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className={cn('min-w-36', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
      >
        <DropdownMenuItem
          onClick={() => onChange({ type: 'rect' })}
          className={ANNOTATION_BAR_ITEM_CLASS}
        >
          <Square className="size-4" aria-hidden />
          Rectangle
          {shape.type === 'rect' ? (
            <Check className="ml-auto size-3.5" aria-hidden />
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onChange({ type: 'ellipse' })}
          className={ANNOTATION_BAR_ITEM_CLASS}
        >
          <Circle className="size-4" aria-hidden />
          Ellipse
          {shape.type === 'ellipse' ? (
            <Check className="ml-auto size-3.5" aria-hidden />
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A shape's fill, which may be nothing at all. */
function FillControl({
  shape,
  onChange,
}: {
  shape: ShapeAnnotation
  onChange: ChangeStyle
}) {
  const [open, setOpen] = useState(false)
  const preview = shape.fillColor
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <AnnotationBarTooltip label="Fill">
        <PopoverTrigger aria-label="Fill" className={ANNOTATION_BAR_TRIGGER_CLASS}>
          <span
            className={cn(
              'size-4 rounded-full border border-(--border-annotation-chrome)',
              !preview && 'swatch-empty-dark',
            )}
            style={preview ? { backgroundColor: preview } : undefined}
            aria-hidden
          />
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </PopoverTrigger>
      </AnnotationBarTooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn('w-auto min-w-0 p-2', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
        onMouseDown={(e) => e.preventDefault()}
      >
        <Eyebrow className="mb-2 block text-(--foreground-annotation-chrome-tertiary)">
          Fill
        </Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <ColorSwatch
            empty
            label="No fill"
            selected={shape.fillColor === null}
            onSelect={() => {
              onChange({ fillColor: null })
              setOpen(false)
            }}
          />
          {ANNOTATION_FILL_SWATCHES.map((swatch) => (
            <ColorSwatch
              key={swatch}
              color={swatch}
              label={`Fill ${annotationSwatchName(swatch)}`}
              selected={shape.fillColor === swatch}
              onSelect={() => {
                onChange({ fillColor: swatch })
                setOpen(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * A shape's outline: its colour and, only once it has one, its weight. The
 * weights are hidden rather than disabled when there is no stroke, because
 * there is nothing for a weight to apply to.
 */
function StrokeControl({
  shape,
  onChange,
}: {
  shape: ShapeAnnotation
  onChange: ChangeStyle
}) {
  const [open, setOpen] = useState(false)
  const preview = shape.color
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <AnnotationBarTooltip label="Line style">
        <PopoverTrigger
          aria-label="Line style"
          className={ANNOTATION_BAR_TRIGGER_CLASS}
        >
          <span
            className="flex size-4 flex-col items-center justify-center gap-[2.5px]"
            aria-hidden
          >
            <span
              className="block h-px w-3.5 rounded-full"
              style={{ backgroundColor: preview ?? 'var(--color-gray-700)' }}
            />
            <span
              className="block h-[2px] w-3.5 rounded-full"
              style={{ backgroundColor: preview ?? 'var(--color-gray-700)' }}
            />
            <span
              className="block h-[3px] w-3.5 rounded-full"
              style={{ backgroundColor: preview ?? 'var(--color-gray-700)' }}
            />
          </span>
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </PopoverTrigger>
      </AnnotationBarTooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn('w-auto min-w-0 p-2', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <Eyebrow className="text-(--foreground-annotation-chrome-tertiary)">
            Stroke
          </Eyebrow>
          {shape.color ? (
            <div className="flex items-center gap-1">
              {ANNOTATION_STROKE_WIDTHS.map((width) => (
                <StrokeWidthSwatch
                  key={width}
                  width={width}
                  selected={shape.strokeWidth === width}
                  onSelect={() => onChange({ strokeWidth: width })}
                />
              ))}
            </div>
          ) : (
            <span className="text-xs text-(--foreground-annotation-chrome-tertiary)">
              None
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColorSwatch
            empty
            label="No stroke"
            selected={shape.color === null}
            onSelect={() => {
              onChange({ color: null })
              setOpen(false)
            }}
          />
          {ANNOTATION_STROKE_SWATCHES.map((swatch) => (
            <ColorSwatch
              key={swatch}
              color={swatch}
              label={`Stroke ${annotationSwatchName(swatch)}`}
              selected={shape.color === swatch}
              onSelect={() => {
                onChange({
                  color: swatch,
                  strokeWidth:
                    shape.strokeWidth > 0
                      ? shape.strokeWidth
                      : ANNOTATION_DEFAULT_STROKE,
                })
                setOpen(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The ink of a mark that is made of type. The swatch set is the kind's. */
function ColorControl({
  color,
  swatches,
  swatchLabel,
  onChange,
}: {
  color: string
  swatches: readonly string[]
  swatchLabel: string
  onChange: ChangeStyle
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <AnnotationBarTooltip label="Color">
        <PopoverTrigger
          aria-label="Color"
          className={ANNOTATION_BAR_TRIGGER_CLASS}
        >
          <span
            className="size-4 rounded-full border border-(--border-annotation-chrome)"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </PopoverTrigger>
      </AnnotationBarTooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn('w-auto min-w-0 p-2', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
        onMouseDown={(e) => e.preventDefault()}
      >
        <Eyebrow className="mb-2 block text-(--foreground-annotation-chrome-tertiary)">
          Color
        </Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          {swatches.map((swatch) => (
            <ColorSwatch
              key={swatch}
              color={swatch}
              label={`${swatchLabel} ${annotationSwatchName(swatch)}`}
              selected={color.toUpperCase() === swatch.toUpperCase()}
              onSelect={() => {
                onChange({ color: swatch })
                setOpen(false)
              }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The size rungs, named rather than numbered — "Small", not "14". */
function FontSizeControl({
  fontSize,
  onChange,
}: {
  fontSize: number
  onChange: ChangeStyle
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <AnnotationBarTooltip label="Text size">
        <PopoverTrigger
          aria-label="Text size"
          className={cn(ANNOTATION_BAR_TRIGGER_CLASS, 'min-w-[4.75rem]')}
        >
          <span className="text-sm font-medium tracking-tight">
            {annotationFontSizeLabel(fontSize)}
          </span>
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </PopoverTrigger>
      </AnnotationBarTooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn('w-auto min-w-36 p-1', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
        onMouseDown={(e) => e.preventDefault()}
      >
        {ANNOTATION_FONT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => {
              onChange({ fontSize: size })
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm text-(--foreground-annotation-chrome) transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-(--wash-annotation-chrome)',
              fontSize === size && 'bg-(--wash-annotation-chrome)',
            )}
          >
            {annotationFontSizeLabel(size)}
            {fontSize === size ? (
              <Check className="size-3.5 opacity-90" aria-hidden />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** Bold and strikethrough: the same slot, pressed or not. */
function ToggleControl({
  label,
  Icon,
  pressed,
  onToggle,
}: {
  label: string
  Icon: typeof Bold
  pressed: boolean
  onToggle: () => void
}) {
  return (
    <AnnotationBarTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onToggle}
        className={cn(
          ANNOTATION_BAR_TRIGGER_CLASS,
          pressed && 'bg-(--wash-annotation-chrome-strong)',
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </button>
    </AnnotationBarTooltip>
  )
}

const TEXT_ALIGN_OPTIONS = [
  { id: 'left' as const, label: 'Left', Icon: AlignLeft },
  { id: 'center' as const, label: 'Center', Icon: AlignCenter },
  { id: 'right' as const, label: 'Right', Icon: AlignRight },
]

/** Which edge the type is set against. Only the text mark offers it. */
function AlignControl({
  align,
  onChange,
}: {
  align: 'left' | 'center' | 'right'
  onChange: ChangeStyle
}) {
  const [open, setOpen] = useState(false)
  const AlignIcon =
    TEXT_ALIGN_OPTIONS.find((option) => option.id === align)?.Icon ?? AlignLeft
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <AnnotationBarTooltip label="Alignment">
        <PopoverTrigger
          aria-label="Alignment"
          className={ANNOTATION_BAR_TRIGGER_CLASS}
        >
          <AlignIcon className="size-3.5" aria-hidden />
          <ChevronDown className="size-3 opacity-80" aria-hidden />
        </PopoverTrigger>
      </AnnotationBarTooltip>
      <PopoverContent
        align="center"
        side="top"
        sideOffset={8}
        className={cn('w-auto min-w-32 p-1', ANNOTATION_BAR_MENU_CLASS)}
        data-annotation-chrome=""
        onMouseDown={(e) => e.preventDefault()}
      >
        {TEXT_ALIGN_OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onChange({ align: id })
              setOpen(false)
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-(--foreground-annotation-chrome) transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-(--wash-annotation-chrome)',
              align === id && 'bg-(--wash-annotation-chrome)',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
            {align === id ? (
              <Check className="ml-auto size-3.5 opacity-90" aria-hidden />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/** The last slot of every bar. The noun is the kind's. */
function DeleteControl({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => void
}) {
  return (
    <AnnotationBarTooltip label="Delete">
      <button
        type="button"
        aria-label={label}
        onClick={onDelete}
        className={ANNOTATION_BAR_ICON_BUTTON_CLASS}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>
    </AnnotationBarTooltip>
  )
}
