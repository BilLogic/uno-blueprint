import { specWriter, type SpecLevel } from '@/lib/specMutations'
import { normalizeValueProps, type ValueProp } from '@/lib/valueProps'
import { invalidateCellBoard, invalidateQueries } from '@/lib/queryClient'
import { queryKeys } from '@/lib/queryKeys'

export type CellSpecUpdate = {
  function: string
  form: string
  valueProps: ValueProp[]
}

/**
 * The cell's spec columns, as a level of the one spec write.
 *
 * These are the only cell columns the app may write: `function`, `form`, and
 * `value_props` carry a column-level grant precisely so the panel can edit
 * them without opening the blueprint's structural content to the same path.
 * Content, lane, step and path stay the import pipeline's business.
 *
 * `value_props` is `NOT NULL` with `[]` as its default, so an emptied list is
 * written as the empty list. It used to be written as null, which the column
 * refuses — a bug the generated types now spell out.
 */
const CELL_SPEC: SpecLevel<'cells', string, CellSpecUpdate> = {
  table: 'cells',
  addressedBy: 'id',
  subject: 'cell',
  columns: (update) => ({
    function: update.function.trim() || null,
    form: update.form.trim() || null,
    value_props: normalizeValueProps(update.valueProps),
  }),
  // The grid draws the spec's presence, and the audiences are read off it.
  invalidate: (cellId) => {
    invalidateCellBoard(cellId)
    invalidateQueries(queryKeys.valueAudiences)
  },
  fn: 'update_cell_spec',
  targetArg: 'cell_id',
  previousAs: 'update',
}

/** Write the cell's spec columns. */
export const updateCellSpec = specWriter(CELL_SPEC)
