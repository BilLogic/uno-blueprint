import { asEntityStatus, DEFAULT_ENTITY_STATUS, type EntityStatus } from '@/lib/entityStatus'
import { normalizeValueProps, parseValueProps, type ValueProp } from '@/lib/valueProps'
import type { BlueprintCell } from '@/types/blueprint'
import type { Database, Json } from '@/types/database'

/**
 * The Cell field list: one descriptor per column the board reads for a cell.
 *
 * A cell's columns were named in five places that had to agree by hand — the
 * board select, the normalizer's raw shape, the normalizer's mapping, the
 * panel's fields and the agent's arguments — and the first three were held
 * together by a test that compared the select STRING to the normalizer
 * SOURCE, because a type could not see that a column named in one was
 * dropped from the other. This list is the one place; the select and the
 * normalizer are functions of it, so a column added here is selected and
 * mapped in the same edit, and a column left out is left out of both.
 *
 * The keys are typed against the generated cell row, so a descriptor for a
 * column the schema does not have is a type error, and against the
 * normalized cell, so every field the list names has somewhere to land.
 *
 * What is derived from the list: the cells block of the board select, the
 * normalized cell, the panel's form state and rendered fields, the
 * read-only panel's rows, the one save's routing (`cellSave.ts`), the
 * interface map's cell rows and the panel write surface's cell columns. The
 * agent's argument schema is the next derivation; the descriptors already
 * carry the argument name it will read.
 */

export type CellRow = Database['public']['Tables']['cells']['Row']

/** A column the board reads for a cell: on the generated row AND on the normalized cell. */
export type CellFieldKey = keyof CellRow & keyof BlueprintCell

/**
 * Where a field sits in the cell's anatomy. Structure is where the cell is —
 * its lane, step and place in the slot — and moves only through an
 * authoring RPC. Content is what the cell says and who it belongs to. Spec
 * is what the cell is like. The glossary's Spec entry is the source for the
 * last two; structure is the word it uses for the first.
 */
export type CellFieldGroup = 'structure' | 'content' | 'spec'

/**
 * The write path a field takes. `rpc` is an authoring RPC (structure moves
 * that way, and so does the frame, through `set_cell_featured_image`);
 * `content` and `spec` are the two direct-write mutations, each over its
 * own column grants and each capturing its own inverse for the ledger. The
 * route is the mutation, not the grant statement: `owner` and
 * `perceived_owner` were granted alongside the spec columns and are written
 * by the content mutation, because to a person they are what the cell says
 * about itself. `null` is a field nothing writes after the row exists.
 */
export type CellWriteRoute = 'rpc' | 'content' | 'spec' | null

export type CellFieldDescriptor<K extends CellFieldKey = CellFieldKey> = {
  /** The column, spelled as the schema spells it. */
  key: K
  /** The word a person sees above the field. */
  label: string
  /** The sentence under it. */
  hint: string
  group: CellFieldGroup
  writeRoute: CellWriteRoute
  /**
   * Whether every raw cell carries the column. The board query selects them
   * all, but the no-database fallback and the hand-written fixtures carry
   * only what they need, so the raw shape makes the rest optional.
   */
  required: boolean
  /**
   * The name the agent's cell-writing tools take the field under, where the
   * agent may set it — always the column's own name, which the type says,
   * so the argument schema derived from this list cannot advertise one
   * spelling and read another. Absent means the agent has no argument for
   * the field.
   */
  agentArg?: K
  /**
   * The sentence the agent reads for that argument, where it needs more
   * than the panel's hint says — how to fill it, what to look up first.
   * Absent, the argument carries the hint itself: one sentence about the
   * field, read by a person above the control and by a model in the schema.
   */
  agentHint?: string
  /**
   * `canvas` where the canvas length budget applies to the text — the rung
   * is per lane, decided by `cellBudgetKindForLane`, and this only says the
   * guidance is read for the field at all.
   */
  budget?: 'canvas'
  /**
   * How the raw column becomes the normalized value. Absent means the value
   * passes through with `null` for an absent column, which is what most
   * fields want; the exceptions narrow (`status`), default (`position`) or
   * retype (`value_props`).
   */
  normalize?: (value: CellRow[K] | null | undefined) => BlueprintCell[K]
  /**
   * The control the panel edits the field with, where a person may edit it
   * from the panel. A field with no `editor` is not in the form — structure
   * moves on the board, the frame through its own affordance — and is not a
   * row of the interface map either, because no panel says its label.
   */
  editor?: CellEditor
  /**
   * Why the label and the column name differ, where they do. The interface
   * map (`references/interface-schema-map.md`) prints it beside the row, and
   * requires it: a divergence with no reason written down is the defect that
   * map exists to end.
   */
  because?: string
}

/** How the panel edits one field. */
export type CellEditor =
  | { control: 'input' }
  | { control: 'textarea'; rows: number }
  | { control: 'status' }
  /** `row`: fields naming the same row share one in the form, side by side. */
  | { control: 'ownerTag'; row: 'owners' }
  | { control: 'valueProps' }

export type AnyCellField = { [K in CellFieldKey]: CellFieldDescriptor<K> }[CellFieldKey]

/**
 * The list, in the order the select names them. `as const` keeps each key
 * and `required` flag literal so the raw shape can tell a required column
 * from an optional one; `satisfies` checks each descriptor against its own
 * column and types each `normalize` against it.
 */
export const CELL_FIELDS = [
  {
    key: 'id',
    label: 'Id',
    hint: 'The cell, to everything that points at it.',
    group: 'structure',
    writeRoute: null,
    required: true,
  },
  {
    key: 'lane_id',
    label: 'Lane',
    hint: 'Whose row the moment is on.',
    group: 'structure',
    writeRoute: 'rpc',
    required: true,
    agentArg: 'lane_id',
    agentHint: 'Lane id from get_blueprint',
  },
  {
    key: 'step_id',
    label: 'Step',
    hint: 'Which moment of the journey this is.',
    group: 'structure',
    writeRoute: 'rpc',
    required: true,
    agentArg: 'step_id',
    agentHint: 'Step id (from get_blueprint)',
  },
  {
    key: 'position',
    label: 'Position',
    hint: 'The order inside the slot, where a lane holds more than one cell at a step.',
    group: 'structure',
    writeRoute: 'rpc',
    required: false,
    // Sorted on by every slot. Without the default a slot holding more than
    // one cell compares undefined to undefined and renders in whatever order
    // the database returned.
    normalize: (value) => value ?? 0,
  },
  {
    key: 'content',
    label: 'Content',
    hint: 'What this cell says on the grid.',
    group: 'content',
    writeRoute: 'content',
    required: true,
    agentArg: 'content',
    agentHint:
      'The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: "Dispatcher confirms the address and books a crew". Bad: "Scheduling module".',
    budget: 'canvas',
    editor: { control: 'input' },
  },
  {
    key: 'frame',
    label: 'Featured image',
    hint: 'The one picture this cell leads with.',
    group: 'content',
    writeRoute: 'rpc',
    required: false,
  },
  {
    key: 'summary',
    label: 'Summary',
    hint: 'The tl;dr — what the detailed fields below add up to.',
    group: 'content',
    writeRoute: 'content',
    required: false,
    agentArg: 'summary',
    agentHint: 'The tl;dr — never a copy of the text',
    editor: { control: 'textarea', rows: 3 },
  },
  {
    key: 'status',
    label: 'Status',
    hint: 'How far along the thing this cell describes is, from proposed to live to on its way out.',
    group: 'content',
    writeRoute: 'content',
    required: false,
    // Narrowed rather than passed through: the column is plain text under a
    // check constraint, and a value the renderer has no treatment for reads
    // as shipped rather than as an unrecognised marker.
    normalize: (value) => asEntityStatus(value),
    editor: { control: 'status' },
  },
  {
    key: 'function',
    label: 'Function',
    hint: 'What this cell has to accomplish.',
    group: 'spec',
    writeRoute: 'spec',
    required: false,
    agentArg: 'function',
    editor: { control: 'textarea', rows: 2 },
  },
  {
    key: 'form',
    label: 'Form',
    hint: 'How it comes across.',
    group: 'spec',
    writeRoute: 'spec',
    required: false,
    agentArg: 'form',
    editor: { control: 'textarea', rows: 2 },
  },
  {
    key: 'value_props',
    label: 'Value proposition',
    hint: 'Who gets what from it.',
    group: 'spec',
    writeRoute: 'spec',
    required: false,
    agentArg: 'value_props',
    agentHint: 'Full replacement list of {for, value} — who gets what from it',
    // The column is jsonb; the cell type names the shape the panel renders.
    // Absent rather than empty, so "unset" and "set to nothing" stay apart.
    normalize: (value) => (value ?? undefined) as BlueprintCell['value_props'],
    editor: { control: 'valueProps' },
    because:
      '`props` abbreviates this exact phrase and no other. A label is read once and a name is typed daily, so the panel spells out what the schema shortens.',
  },
  {
    key: 'owner',
    label: 'Owner',
    hint: 'The team accountable for this moment.',
    group: 'content',
    writeRoute: 'content',
    required: false,
    agentArg: 'owner',
    agentHint: 'Owner tag — the team accountable (an existing tag; see list_owner_tags)',
    editor: { control: 'ownerTag', row: 'owners' },
  },
  {
    key: 'perceived_owner',
    label: 'Perceived owner',
    hint: 'Who the person on the other side thinks they are dealing with. A gap between the two is a finding.',
    group: 'content',
    writeRoute: 'content',
    required: false,
    agentArg: 'perceived_owner',
    agentHint: 'Perceived-owner tag — who the person on the other side thinks they are dealing with (an existing tag; see list_owner_tags)',
    editor: { control: 'ownerTag', row: 'owners' },
  },
] as const satisfies readonly AnyCellField[]

export type CellField = (typeof CELL_FIELDS)[number]

type RequiredKey = Extract<CellField, { required: true }>['key']
type OptionalKey = Exclude<CellField['key'], RequiredKey>

/**
 * A cell as the board query returns it: every column the list names, the
 * required ones present and the rest optional and nullable, because the
 * fallback and the fixtures carry only what they need. The normalizer's
 * raw cell is this plus the embedded relations, which have descriptors of
 * their own.
 */
export type RawCellColumns = Pick<CellRow, RequiredKey> & {
  [K in OptionalKey]?: CellRow[K] | null
}

/** The normalized values of every field the list names. */
export type CellFieldValues = { [K in CellField['key']]: BlueprintCell[K] }

/**
 * PostgREST reads a reserved word as a keyword unless it is quoted; the
 * one such column a cell has is `function`. Quoting only the reserved word
 * keeps the select readable, and the scripts that walk select strings see
 * the same spelling they always did.
 */
const RESERVED_IN_SELECT = new Set<string>(['function'])

function selectSpelling(key: string): string {
  return RESERVED_IN_SELECT.has(key) ? `"${key}"` : key
}

/**
 * The columns of the board select's cells block, from the list. Takes the
 * list so a test can hand it a different one and watch the select move.
 */
export function cellSelectColumns(fields: readonly AnyCellField[] = CELL_FIELDS): string {
  return fields.map((descriptor) => selectSpelling(descriptor.key)).join(',\n    ')
}

/** The cells block's columns as the board select carries them. */
export const CELL_SELECT_COLUMNS = cellSelectColumns()

/**
 * The normalized field values of one raw cell, from the list: each field's
 * own `normalize` where it has one, otherwise the column with `null` for an
 * absent value. Takes the list for the same reason `cellSelectColumns` does.
 */
export function cellFieldsFromRow(
  row: RawCellColumns,
  fields: readonly AnyCellField[] = CELL_FIELDS,
): CellFieldValues {
  // Erased on purpose. Each descriptor's `normalize` is typed against its
  // own column, and the list is a union of them; TypeScript cannot carry
  // that correlation through a loop (the key that picks the column and the
  // function that reads it are the same union member, but the checker sees
  // two independent unions). The correlation is checked where the list is
  // written — `satisfies` types every `normalize` against its key — so this
  // reads each field untyped and hands back the shape the list promises.
  const values: Record<string, unknown> = {}
  for (const descriptor of fields) {
    const raw = (row as Record<string, unknown>)[descriptor.key]
    values[descriptor.key] = descriptor.normalize
      ? (descriptor.normalize as (value: unknown) => unknown)(raw)
      : (raw ?? null)
  }
  return values as CellFieldValues
}

/* ------------------------------------------------------------- the form */

/** A descriptor the panel edits: one with an `editor`. */
export type EditableCellField = Extract<CellField, { editor: CellEditor }>
export type CellEditKey = EditableCellField['key']

/**
 * The editable fields, in the order the panel shows them: what the cell
 * says and who it belongs to first, then what it is like. Within a group
 * the list's order holds, which puts the owner pair after status and the
 * value propositions last.
 */
export const EDITABLE_CELL_FIELDS: readonly EditableCellField[] = (
  ['content', 'spec'] as const
).flatMap((group) =>
  CELL_FIELDS.filter(
    (descriptor): descriptor is EditableCellField =>
      'editor' in descriptor && descriptor.group === group,
  ),
)

/**
 * The value a field holds while it is being edited: text for the text
 * controls, the status value for the status control, and the parsed list
 * for the value propositions. Empty text means "not specified"; the write
 * stores it as null.
 */
export type CellEditValue<K extends CellEditKey> = K extends 'status'
  ? EntityStatus
  : K extends 'value_props'
    ? ValueProp[]
    : string

/** The form's state for a cell: every editable field, keyed by column. */
export type CellEdits = { [K in CellEditKey]: CellEditValue<K> }

/**
 * The edits a cell starts from — its columns as the board holds them, in
 * the form's shape — or, for a cell that does not exist yet, the empty form
 * with the status column's own default, so a cell created without touching
 * the control reads the same as one the importer wrote.
 */
export function cellEditsFromCell(cell: BlueprintCell | null): CellEdits {
  const edits: Record<string, unknown> = {}
  for (const descriptor of EDITABLE_CELL_FIELDS) {
    const value = cell?.[descriptor.key]
    switch (descriptor.editor.control) {
      case 'status':
        edits[descriptor.key] = value ?? DEFAULT_ENTITY_STATUS
        break
      case 'valueProps':
        edits[descriptor.key] = parseValueProps((value ?? null) as Json | null)
        break
      default:
        edits[descriptor.key] = value ?? ''
    }
  }
  return edits as CellEdits
}

/**
 * Whether two edits of one field are the same value — as the write would
 * store them: text is compared trimmed, because the mutations trim before
 * writing and a change of surrounding whitespace would be a write that
 * changes nothing; the list is compared by value, normalised the way the
 * spec write normalises it, so a blank added row or a trimmed space is not
 * an edit either.
 */
export function sameCellEdit<K extends CellEditKey>(
  key: K,
  left: CellEditValue<K>,
  right: CellEditValue<K>,
): boolean {
  if (key === 'value_props') {
    return (
      JSON.stringify(normalizeValueProps(left as ValueProp[])) ===
      JSON.stringify(normalizeValueProps(right as ValueProp[]))
    )
  }
  return typeof left === 'string' && typeof right === 'string'
    ? left.trim() === right.trim()
    : left === right
}

/** The editable fields whose value differs between two edits. */
export function changedCellFields(after: CellEdits, before: CellEdits): EditableCellField[] {
  return EDITABLE_CELL_FIELDS.filter(
    (descriptor) => !sameCellEdit(descriptor.key, after[descriptor.key], before[descriptor.key]),
  )
}
