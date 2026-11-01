import type { DependencyKind } from '@/lib/authoringRpc'

/**
 * Dependency rules, checked before the round trip.
 *
 * Mirrors what `set_cell_dependency` raises; `update_cell_dependency` raises
 * the same sentences for an edit in place. The database stays the authority
 * — two people can connect the same cells at once — but a rule you meet by
 * being rejected is a rule you have to guess at first.
 */

export const DEPENDENCY_KINDS: DependencyKind[] = ['leads_to', 'enables']

/**
 * What each kind means, and — the part that matters — whether it draws.
 *
 * Every relationship being an arrow is what makes a blueprint unreadable.
 * Most "this depends on that" facts are not handoffs: they are constraints
 * worth recording and not worth drawing. `enables` is where those go.
 *
 * BOTH READ SOURCE-FIRST AND UPSTREAM-FIRST, which is why the second is
 * `enables` and not `needs`. Makes it HAPPEN versus makes it POSSIBLE:
 *
 *   "Read the sources"                leads to   "Draft the structure"
 *   "generate_sample_blueprint.mjs"   enables    "npm run dev with no .env"
 *
 * `needs` pointed the other way — B comes first, B is required by A — so an
 * edge's direction could not be read without first checking its kind.
 * The migration that replaced `needs` with `enables` turned those edges around
 * rather than renaming them where they lay.
 */
export const DEPENDENCY_KIND_HINTS: Record<DependencyKind, string> = {
  leads_to: 'One step hands off to the next. Draws an arrow.',
  enables: 'Makes the next step possible, without causing it.',
}

/** The stored value IS the label, minus the underscore. */
export const DEPENDENCY_KIND_LABELS: Record<DependencyKind, string> = {
  leads_to: 'Leads to',
  enables: 'Enables',
}

/**
 * The words the dependency editor is made of, held beside the vocabulary they
 * describe rather than inside the components that render them. The add form
 * and the row editor say the same things, so they say them from one place.
 *
 * ONE PROSE FIELD, AND IT IS `note`. It is labelled rather than described by
 * its placeholder, because a placeholder names the box only until somebody
 * types into it. The copy is deliberately wide: "why this edge exists" tells
 * an author their sentence is unwelcome unless it is a justification, and a
 * note on a dependency is whatever is worth recording about it.
 */
export const DEPENDENCY_EDIT_TEXT = {
  noteLabel: 'Note',
  /** Rendered beside the label, never inside the field. */
  noteOptional: '(optional)',
  notePlaceholder: 'Anything worth knowing about this dependency',
  connectTo: 'Connect to',
} as const

export type DraftDependency = {
  sourceCellId: string
  targetCellId: string | null
  kind: DependencyKind
  /**
   * `cell_dependencies.note` — the editor's one prose field, and the one the
   * dependency row reads back. `name` is not drafted here: it is the badge
   * spelling, the column nothing renders, and offering it beside the note
   * would put the same sentence in front of two fields again.
   */
  note: string
}

/** Enough about the other end to check a draft without another read. */
export type DependencyEndpoint = {
  cellId: string
  /** The path the cell sits on. The two ends of a link may differ. */
  pathId: string
  label: string
}

/**
 * Problems worth showing, in the order they should be fixed.
 *
 * There is no path rule here. A link may join any two cells of one service —
 * another path, another scenario — and the one wall left, another service, is
 * the database's to refuse ("Both cells must be in the same service"). The
 * panel offers only cells of the service it has open, so a draft never reaches
 * that refusal from here.
 */
export function validateDraftDependency(
  draft: DraftDependency,
  target: DependencyEndpoint | null,
  existing: Array<{ targetCellId: string; kind: string }>,
): string[] {
  const problems: string[] = []

  if (!draft.targetCellId || !target) {
    problems.push('Pick the cell this one connects to.')
    return problems
  }

  if (draft.targetCellId === draft.sourceCellId) {
    problems.push('A cell cannot depend on itself.')
  }

  if (
    existing.some(
      (entry) =>
        entry.targetCellId === draft.targetCellId && entry.kind === draft.kind,
    )
  ) {
    problems.push('That connection already exists.')
  }

  if (!DEPENDENCY_KINDS.includes(draft.kind)) {
    problems.push('Pick whether this is a handoff or a dependency.')
  }

  return problems
}
