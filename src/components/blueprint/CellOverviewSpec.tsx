import type { ReactNode } from 'react'
import { useBlueprintCell } from '@/hooks/useBlueprintCell'
import { EDITABLE_CELL_FIELDS, type EditableCellField } from '@/lib/cellFields'
import { parseValueProps } from '@/lib/valueProps'
import type { Json } from '@/types/database'

/**
 * One spec block: its label, and what is under it.
 *
 * `children` rather than only `text` because the value propositions are a
 * list and the other two are prose, and the LABEL is the part that has to be
 * identical — it is the word a reader takes to an engineer, so all three go
 * through one component rather than one of them hand-rolling its own heading.
 */
function SpecSection({
  title,
  text,
  children,
}: {
  title: string
  text?: string
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      {text !== undefined ? (
        <p className="text-sm whitespace-pre-wrap text-foreground">{text}</p>
      ) : null}
      {children}
    </section>
  )
}

type CellOverviewSpecProps = {
  /** Canonical (resolved) cell id; null when the cell is fallback-only. */
  cellId: string | null
}

/** The spec group of the cell field list, in its order: function, form, value proposition. */
const SPEC_FIELDS: readonly EditableCellField[] = EDITABLE_CELL_FIELDS.filter(
  (field) => field.group === 'spec',
)

/**
 * The spec block in the panel's inline overview, read-only: the spec-group
 * fields of the cell field list, each under the descriptor's label. Sections
 * render only when authored, from the board already in memory; a cell with
 * no spec renders nothing at all.
 *
 * Editing lives in `CellPanelEditor` — the panel's one form, one Save.
 */
export function CellOverviewSpec({ cellId }: CellOverviewSpecProps) {
  const spec = useBlueprintCell(cellId)

  if (!cellId) return null
  // No in-flight state to render around. The block used to hold ~250 ms for a
  // query of its own, so that it did not grow and then collapse on every cell
  // switch; the board carries the spec columns now, and this renders in the
  // same commit as the panel around it.
  // Read by control, not by key: the value-props control holds the jsonb
  // list and the text controls hold text. The checker cannot carry that
  // correlation from the descriptor to the cell's field, so each branch
  // names the type the list types it as.
  const sections = SPEC_FIELDS.flatMap((field) => {
    if (field.editor.control === 'valueProps') {
      const valueProps = parseValueProps((spec?.[field.key] ?? null) as Json | null)
      if (valueProps.length === 0) return []
      return [
        <SpecSection key={field.key} title={field.label}>
          <ul className="flex flex-col gap-1">
            {valueProps.map((entry, index) => (
              <li key={index} className="text-sm text-foreground">
                <span className="font-medium text-foreground">{entry.for}</span>
                {entry.for && entry.value ? ' — ' : ''}
                {entry.value}
              </li>
            ))}
          </ul>
        </SpecSection>,
      ]
    }
    const text = ((spec?.[field.key] ?? '') as string).trim()
    if (!text) return []
    return [<SpecSection key={field.key} title={field.label} text={text} />]
  })
  if (sections.length === 0) return null

  return (
    <div className="flex flex-col gap-3 animate-in ease-arrive motion-reduce:animate-none fade-in duration-(--motion-fade)">
      {sections}
    </div>
  )
}
