import { useState } from 'react'
import {
  Circle,
  Eraser,
  MousePointer2,
  Pencil,
  Square,
  StickyNote,
  Trash2,
  Type,
  SquarePen,
  Eye,
  Hand,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  useCanvasAnnotations,
  useCanvasAnnotationTool,
} from '@/contexts/canvasAnnotationContext'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { AnnotationCaptureMenu } from '@/components/editor/AnnotationCaptureMenu'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/editor/SegmentedControl'
import { ToolFamilyMenu, type FamilyTool } from '@/components/editor/ToolFamilyMenu'
import { CanvasDesignTools } from '@/components/editor/CanvasDesignTools'
import { useCanvasMode, type CanvasMode } from '@/contexts/canvasModeContext'
import { useMobileShell } from '@/hooks/useMobileShell'
import {
  ANNOTATION_PEN_STROKE_WIDTHS,
  ANNOTATION_PAPER,
  ANNOTATION_PEN_SWATCHES,
  type CanvasAnnotationTool,
  annotationSwatchName,
} from '@/lib/canvasAnnotations'
import { cn } from '@/lib/utils'

type ToolDef = {
  id: CanvasAnnotationTool
  label: string
  icon: typeof Pencil
}

const DRAW_FAMILY: FamilyTool[] = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
]

const SHAPE_FAMILY: FamilyTool[] = [
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
]

const CONTENT_FAMILY: FamilyTool[] = [
  { id: 'text', label: 'Text', icon: Type },
  { id: 'sticky', label: 'Sticky note', icon: StickyNote },
]

const DRAW_SUBPANEL_TOOLS: ToolDef[] = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
]

function ToolButton({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
  className,
}: ToolDef & {
  active: boolean
  onSelect: (id: CanvasAnnotationTool) => void
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={label}
            aria-pressed={active}
            onClick={() => onSelect(id)}
            className={cn(
              'pointer-events-auto size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground',
              active && 'bg-muted text-foreground',
              className,
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </Button>
        }
      />
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border/80" aria-hidden />
}

function StrokeWeightButton({
  width,
  selected,
  onSelect,
}: {
  width: number
  selected: boolean
  onSelect: () => void
}) {
  const label = width <= 6 ? 'Thin' : 'Thick'
  const previewWidth = width <= 6 ? 1.5 : 4.5
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={selected}
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
            }}
            className={cn(
              'pointer-events-auto flex size-7 items-center justify-center rounded-md transition-colors',
              selected
                ? 'bg-primary/15 text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <svg viewBox="0 0 20 12" className="h-3.5 w-4" aria-hidden>
              <path
                d="M1 8.5 C4 2.5, 7 10.5, 10 5.5 S16 9, 19 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={previewWidth}
                strokeLinecap="round"
              />
            </svg>
          </button>
        }
      />
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function DrawSubpanel() {
  const {
    tool,
    setTool,
    penColor,
    setPenColor,
    penStrokeWidth,
    setPenStrokeWidth,
  } = useCanvasAnnotationTool()

  const penActive = tool === 'pen'
  const penOptionsDisabled = !penActive

  return (
    <div
      data-annotation-toolbar=""
      role="toolbar"
      aria-label="Pen and eraser options"
      className="pointer-events-none flex items-center gap-1 rounded-lg border border-muted bg-card px-2 py-1 shadow-md"
    >
      {DRAW_SUBPANEL_TOOLS.map((item) => (
        <ToolButton
          key={item.id}
          {...item}
          active={tool === item.id}
          onSelect={setTool}
          className={cn(
            tool === item.id &&
              'bg-primary/15 text-foreground hover:bg-primary/15 hover:text-foreground',
          )}
        />
      ))}

      <ToolbarDivider />
      <div
        role="group"
        aria-label="Stroke weight"
        aria-disabled={penOptionsDisabled}
        className={cn(
          'pointer-events-auto flex items-center gap-1',
          penOptionsDisabled && 'pointer-events-none opacity-35',
        )}
      >
        {ANNOTATION_PEN_STROKE_WIDTHS.map((width) => (
          <StrokeWeightButton
            key={width}
            width={width}
            selected={penStrokeWidth === width}
            onSelect={() => setPenStrokeWidth(width)}
          />
        ))}
      </div>

      <ToolbarDivider />
      <div
        role="group"
        aria-label="Pen color"
        aria-disabled={penOptionsDisabled}
        className={cn(
          'pointer-events-auto flex items-center gap-1 px-1',
          penOptionsDisabled && 'pointer-events-none opacity-35',
        )}
      >
        {ANNOTATION_PEN_SWATCHES.map((swatch) => (
          <IconTooltip key={swatch} label={annotationSwatchName(swatch)}>
            <button
              type="button"
              aria-label={`Pen color ${annotationSwatchName(swatch)}`}
              aria-pressed={penColor.toUpperCase() === swatch.toUpperCase()}
              disabled={penOptionsDisabled}
              onClick={() => setPenColor(swatch)}
              className={cn(
                'tap-target-24 size-4 shrink-0 rounded-full border border-annotation-plate transition-transform hover:scale-110',
                penColor.toUpperCase() === swatch.toUpperCase() &&
                  !penOptionsDisabled &&
                  'ring-2 ring-primary ring-offset-1',
                swatch === ANNOTATION_PAPER && 'border-border',
              )}
              style={{ backgroundColor: swatch }}
            />
          </IconTooltip>
        ))}
      </div>
    </div>
  )
}

/** Floating tool palette for the annotation layer — tool, stroke weight, colour, clear. */
export function CanvasAnnotationToolbar() {
  const { tool, setTool } = useCanvasAnnotationTool()
  const { annotations, clearAnnotations } = useCanvasAnnotations()
  // The mobile shell is view-only for every tier — Edit is absent there,
  // same treatment as a session that cannot write.
  const mobileShell = useMobileShell()

  // The family menus remember their own face, so the toolbar no longer has to
  // track "which draw tool was last used" on their behalf.

  /**
   * Which family menu is open — at most one, and never at the same time as the
   * pen's options row.
   *
   * Both grow upward out of the same edge of the same bar, so they landed on
   * top of each other: the pen options showing colour and weight, and a menu
   * listing Pen and Eraser, overlapping in a stack where neither could be read.
   * Holding the open menu here rather than inside each menu is what makes the
   * rule expressible at all — a menu can close its siblings, but it cannot know
   * about a panel it does not own.
   */
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const familyProps = (label: string) => ({
    open: openFamily === label,
    onOpenChange: (next: boolean) =>
      setOpenFamily(next ? label : (current) => (current === label ? null : current)),
  })

  const canvasMode = useCanvasMode()
  const designing = canvasMode?.mode === 'design'
  // The pen's colour/width panel belongs to the pen, not to the bar — it
  // shows whenever a drawing tool is live, and drawing only exists in View.
  const drawActive = tool === 'pen' || tool === 'eraser'
  const showSubpanel = drawActive && !designing && openFamily === null

  // No annotation tools on the phone at all (decided 2026-08-17): the mobile
  // shell is a view-only reading surface, and a floating tool palette was a
  // second bottom bar competing with the agent bar for the thumb zone.
  if (mobileShell) return null

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      {showSubpanel ? <DrawSubpanel /> : null}

      <div
        data-annotation-toolbar=""
        className="flex items-center gap-1 rounded-lg border border-muted bg-card/95 px-2 py-1 shadow-md backdrop-blur-sm"
      >
        {/* Select holds the first slot in both modes — the one tool that means
            "do nothing special" should never move under the cursor. */}
        <ToolButton
          id="select"
          label={designing ? 'Select' : 'Select / pan'}
          icon={MousePointer2}
          active={tool === 'select'}
          onSelect={setTool}
        />

        {/*
          Edit needs its own pan tool; View does not. In View a drag on empty
          canvas already pans, because there is nothing else it could mean. In
          Edit that same drag is a marquee, which left the camera reachable
          only by trackpad or an undiscoverable space-drag — and a slice may
          gather cells from blueprints that are nowhere near each other, so
          crossing the canvas is part of the ordinary job, not an edge case.
        */}
        {designing ? (
          <ToolButton
            id="hand"
            label="Hand — drag to pan"
            icon={Hand}
            active={tool === 'hand'}
            onSelect={setTool}
          />
        ) : null}

        {designing ? (
          <CanvasDesignTools />
        ) : (
          <>
            <ToolbarDivider />

            {/* Three families rather than six squares. The bar reads as
                "draw / shapes / content" instead of a row of near-identical
                icons that has to be scanned before anything can be clicked. */}
            <ToolFamilyMenu
              label="Draw"
              tools={DRAW_FAMILY}
              active={tool}
              onSelect={setTool}
              {...familyProps('Draw')}
            />
            <ToolFamilyMenu
              label="Shapes"
              tools={SHAPE_FAMILY}
              active={tool}
              onSelect={setTool}
              {...familyProps('Shapes')}
            />
            <ToolFamilyMenu
              label="Content"
              tools={CONTENT_FAMILY}
              active={tool}
              onSelect={setTool}
              {...familyProps('Content')}
            />

            <ToolbarDivider />

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Clear annotations"
                    disabled={annotations.length === 0}
                    onClick={clearAnnotations}
                    className="pointer-events-auto size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                }
              />
              <TooltipContent side="top" className="text-xs">
                Clear annotations
              </TooltipContent>
            </Tooltip>

            <AnnotationCaptureMenu />
          </>
        )}

        {/* Edit is not a tool, so it sits after a divider at the far end
            rather than in the tool run — and it is absent, never disabled,
            for sessions that cannot write, and on the mobile shell, where
            every session is view-only. */}
        {canvasMode?.available && !mobileShell ? (
          <>
            <ToolbarDivider />
            <CanvasModeSwitch
              mode={canvasMode.mode}
              onChange={canvasMode.setMode}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

/**
 * View ⇄ Edit.
 *
 * Two segments rather than one on/off button, because these are two *modes*
 * and not a capability with a switch: each owns its own tool run, and the
 * question a reader has is "which one am I in", which a single button can only
 * answer by naming the other one.
 *
 * Icons only, and the active half carries a solid fill rather than a shade of
 * grey — at the far end of the bar this is the control that has to read
 * without being looked for. The words moved into tooltips on a delay: two
 * always-on labels cost more width than the whole tool run beside them, and an
 * eye against a pencil is not a distinction that needs spelling out every time
 * it is looked at.
 */
function CanvasModeSwitch({
  mode,
  onChange,
}: {
  mode: CanvasMode
  onChange: (mode: CanvasMode) => void
}) {
  const segments = [
    { value: 'view' as const, label: 'View', icon: Eye },
    { value: 'design' as const, label: 'Edit', icon: SquarePen },
  ]

  return (
    // Long enough that the labels do not flash past while crossing the bar,
    // short enough to arrive before the question is abandoned. Scoped to this
    // group: everything else in the bar keeps the instant tooltips, because
    // there the icon alone is usually enough.
    <TooltipProvider delay={500}>
    {/*
      A track holding two squares, not two loose buttons: the inset well and
      the shared gutter are what say "these two are one control and one of them
      is on". Without the track the active square reads as a button that
      happens to be coloured. SegmentedControl carries the track and the
      raised-square treatment; the notes that shaped it (the literal tint, the
      Figma-style raised white square with the brand colour in the icon) live
      with the component.
    */}
    <SegmentedControl
      aria-label="Canvas mode"
      value={mode}
      onValueChange={onChange}
      className="pointer-events-auto"
    >
      {segments.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger
            render={
              <SegmentedControlItem
                value={value}
                aria-label={label}
                // Square icon-only slots, Figma's bottom bar exactly — and a
                // hairline ring on the raised square so it holds its edge
                // against the toolbar's busier neighbours.
                className="size-6 p-0 aria-pressed:ring-1 aria-pressed:ring-border-annotation-plate"
              >
                <Icon className="size-3.5" aria-hidden />
              </SegmentedControlItem>
            }
          />
          <TooltipContent side="top" className="text-xs">
            {/* The mode's name first, because that is what the icon stands
                for and the reason the tooltip was waited for. */}
            <span className="font-medium">{label}</span>
            {/* Caption ink, not contrast ink: the tooltip sits on the page
                surface now, and `text-contrast` is the page's own lightness —
                it was legible only against the inverted slab this replaced. */}
            <span className="text-muted-foreground">
              {value === 'view'
                ? 'Read, navigate and mark up'
                : 'Author — cells become selectable'}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </SegmentedControl>
    </TooltipProvider>
  )
}
