import { Field, PANEL_TEXTAREA_CLASS } from '@/components/blueprint/panelShell'
import { cn } from '@/lib/utils'

/**
 * A multi-line spec field.
 *
 * A bare `<textarea>` with the cell panel's exact treatment, NOT
 * `input-group.tsx`: the inventory reserves that for the composer, where the
 * group owns the border and the single focus ring.
 */
export function PanelTextareaField({
  label,
  hint,
  value,
  rows = 3,
  disabled,
  placeholder,
  onChange,
}: {
  label: string
  hint: string
  value: string
  rows?: number
  disabled: boolean
  placeholder?: string
  onChange: (next: string) => void
}) {
  return (
    <Field label={label} hint={hint}>
      {disabled ? (
        // Read-only takes the cell panel's value treatment — `text-sm
        // text-foreground`, the same step CellContentSection and
        // CellOverviewSpec render every authored value at. A disabled
        // textarea reads as a broken input; prose reads as prose.
        <p className="text-sm whitespace-pre-wrap text-foreground">
          {value || (
            <span className="text-muted-foreground">Not specified.</span>
          )}
        </p>
      ) : (
        <textarea
          aria-label={label}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          /*
            The shared treatment, plus ONE deliberate deviation: `ring-inset`,
            because this field lives inside an accordion panel whose
            `overflow-hidden` drives its height animation. An outset ring
            paints outside the border box and gets sheared by the clip — the
            same fault the lane header had, and the same fix. The cell panel's
            drawer does not clip, which is why it keeps the outset ring.
          */
          className={cn(PANEL_TEXTAREA_CLASS, 'focus-visible:ring-inset')}
        />
      )}
    </Field>
  )
}
