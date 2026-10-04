import { Check } from 'lucide-react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { getBlueprintFillStyle } from '@/lib/pathColorTheme'
import { cn } from '@/lib/utils'

/**
 * The two pickers the floating style bars are built from: a colour, and the
 * weight of a line. Both are leaves — they take the value they show, whether
 * they are the chosen one, and what to call when they are picked.
 */

export function ColorSwatch({
  color,
  label,
  selected,
  onSelect,
  empty,
}: {
  color?: string
  label: string
  selected: boolean
  onSelect: () => void
  empty?: boolean
}) {
  /*
   * The check is drawn in the ink `[data-blueprint-fill]` derives from the
   * swatch's own fill, not in a colour picked by a membership test.
   *
   * What was here: `isPaleAnnotationSwatch()` — `color !== ANNOTATION_INK` —
   * choosing a frozen near-black for every swatch but one. The fills are
   * theme-flipping ramp steps, so in dark mode near-black sat on near-black:
   * measured 1.13-1.20:1 on the step-300 fill row and 1.33-1.72:1 on the
   * step-500 sticky row. The one exception was broken in the opposite
   * direction — the Ink swatch took the `text-white` branch, and slate-1200
   * flips to near-white in dark, so it measured 1.17:1, white on white. And
   * light mode failed too, on the step-1100 stroke row: 2.50:1 on violet.
   *
   * A membership test cannot answer "is this pale?" for a value that inverts.
   * A derivation cannot be wrong for its fill, because it is a function of it.
   * `annotationSwatchContrast.test.ts` measures every swatch in both themes.
   */
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onSelect}
        data-blueprint-fill={empty ? undefined : ''}
        className={cn(
          'relative size-6 shrink-0 rounded-full border transition-transform duration-(--motion-micro) ease-spring motion-reduce:transition-none hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          empty
            ? 'swatch-empty-light border-border'
            : 'hairline-border-annotation-plate border-annotation-plate',
          selected && 'scale-110 ring-2 ring-foreground/80 ring-offset-1',
        )}
        style={empty || !color ? undefined : getBlueprintFillStyle(color)}
      >
        {selected ? (
          <Check
            className={cn(
              'absolute inset-0 m-auto size-3 stroke-[2.5]',
              // Empty has no fill to derive from; it keeps the plate's ink.
              empty && 'text-annotation-plate-foreground',
            )}
            aria-hidden
          />
        ) : null}
      </button>
    </IconTooltip>
  )
}

/**
 * The stroke-weight picker, which lives inside a style bar and nowhere else.
 *
 * It used to take a `dark` prop and branch on it — `dark ? 'bg-white' :
 * 'bg-foreground'` — which is a colour decision written in TypeScript, and the
 * wrong language for one: nothing about the weight of a line depends on state
 * a component can compute. The branch had exactly one caller and it always
 * passed `dark`, so the themed arm was unreachable; what the prop actually
 * encoded was "I am drawn on the annotation chrome", which is now said once,
 * in the tokens, and cannot be got wrong at a call site.
 */
export function StrokeWidthSwatch({
  width,
  selected,
  onSelect,
}: {
  width: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <IconTooltip label={`${width}px`}>
      <button
        type="button"
        aria-label={`Outline weight ${width}px`}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected
            ? 'border-(--border-annotation-chrome-selected) bg-(--wash-annotation-chrome-strong)'
            : 'hover:bg-(--wash-annotation-chrome)',
        )}
      >
        <span
          className="block w-3.5 rounded-full bg-(--foreground-annotation-chrome)"
          style={{ height: Math.min(width, 4) }}
          aria-hidden
        />
      </button>
    </IconTooltip>
  )
}
