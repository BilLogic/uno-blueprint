import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * The one trigger every select in a panel wears — `OwnerTagSelect` and
 * `OptionSelect` alike. Status sat between Owner and Perceived owner as a
 * native `<select>`: the browser drew its own chevron, its own focus
 * ring and its own line box, so three controls in one column read as two
 * designs, and `h-7 w-fit text-xs` clipped "Live — in use today" along the
 * bottom and re-sized the row every time the value changed. One class, in
 * one place, is what makes "these match" a fact rather than a coincidence.
 *
 * Full width. A control whose width follows its value moves under the
 * pointer that just changed it; a control the width of its column does not.
 */
export const PANEL_SELECT_TRIGGER_CLASS =
  'flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 text-left text-sm outline-none transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:border-control-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

export type SelectOption<V extends string> = {
  value: V
  label: string
  /**
   * What the name means, in the words the rest of the app already uses for
   * it. Optional: a vocabulary whose names explain themselves (touchpoint
   * roles) passes none, and the option is then a single line.
   */
  meaning?: string
}

/**
 * A fixed vocabulary, as a select.
 *
 * `StatusSelect` and `RoleSelect` were two copies of one native
 * `<select>`; this is the control they were both trying to be. Base UI's
 * `Select` keeps what the native element gave for free — keyboard, touch,
 * typeahead, a real listbox — and draws the trigger the way the panel's
 * other selects are drawn.
 *
 * An option is the NAME and, under it in caption grey, what the name means.
 * It used to be one string with the two glued together behind an em dash
 * ("Live — in use today"), which made the meaning a second authored sentence
 * beside the one the badge's hover already showed. Two nodes let the meaning
 * come from the module that owns it, and let it wrap: the popup is the
 * trigger's width, and a sentence has more to say than a line box holds.
 *
 * The trigger keeps the name alone. It is one line, `h-8` and clamped, so a
 * meaning there would be a truncated meaning; the list and the badge's hover
 * are where a reader learns the word.
 */
export function OptionSelect<V extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: {
  value: V
  onChange: (next: V) => void
  options: ReadonlyArray<SelectOption<V>>
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== null && next !== value) onChange(next as V)
      }}
      // Labels by value, so the trigger can name its value before the list
      // has ever been opened (Base UI otherwise learns labels from mounted
      // items).
      items={options.map((option) => ({ value: option.value, label: option.label }))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(PANEL_SELECT_TRIGGER_CLASS, className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span>{option.label}</span>
              {option.meaning ? (
                <span className="text-xs whitespace-normal text-tertiary-foreground">
                  {option.meaning}
                </span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
