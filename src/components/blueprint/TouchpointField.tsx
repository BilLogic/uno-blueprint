import type { ReactNode } from 'react'
import { Field, PanelKindBadge } from '@/components/blueprint/panelShell'
import { useTouchpointToneResolver } from '@/hooks/useTouchpointToneResolver'
import { PANEL_TERMS } from '@/lib/panelTerms'

/**
 * The touchpoint, as a LABELLED field: "Touchpoint" above, the name as a
 * badge in its cell-face colour below, with the definition on the label's
 * hint popover like every other field.
 *
 * One field for both of the panel's postures. The read-only overview shows it
 * with the role badge `beside` the name; the editor's touchpoint block opens
 * with it, and a name-only placement's registry card goes `below`. Which of
 * the two shows it at a given moment is the overview's call — it steps aside
 * while the editor's block is on screen, so one name never shows twice.
 */
export function TouchpointField({
  name,
  beside,
  below,
}: {
  name: string
  /** Sits in the badge row, after the name. */
  beside?: ReactNode
  /** Sits under the badge row, inside the field. */
  below?: ReactNode
}) {
  const resolveTouchpointTone = useTouchpointToneResolver()
  return (
    <Field label="Touchpoint" hint={PANEL_TERMS.touchpoint}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PanelKindBadge label={name} tone={resolveTouchpointTone(name)} title={name} />
        {beside}
      </div>
      {below}
    </Field>
  )
}
