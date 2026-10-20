import type { SupabaseClient } from '@supabase/supabase-js'

import { toAuthoringError } from '@/lib/authoringErrors'
import { recordChange, type WriteFn } from '@/lib/authoringSession'
import { requireRowsWritten } from '@/lib/optimisticConcurrency'
import type { Database } from '@/types/database'

type Client = SupabaseClient<Database>

/**
 * The one way a spec is written, at every level that has one.
 *
 * GLOSSARY.md says spec is four levels and one word — what a board object is
 * like, as opposed to where it sits — and a panel writes it over a
 * column-scoped grant rather than through an authoring RPC. The same paragraph
 * says scenario, step and path own no spec, and that is still true of the
 * WORD: those three own a summary and a note, not a description of what they
 * are like. It was never true of the WRITE. All nine of these are the same
 * thing to the database and to the person saving — a panel writing its own
 * columns over its own grant, capturing its own inverse — and the six modules
 * that held them re-derived the same six stations, comments included:
 * normalise the values, update the columns, translate the failure, require
 * that a row was written, refresh what the change shows in, and record the
 * inverse. Six copies of a rule is six places for the empty-is-null convention
 * the read path depends on to drift, and six places a new level has to be
 * discovered from rather than declared into.
 *
 * `specMutations` rather than `specWrite`: this is the write path, so it wears
 * the name the write path's two contract guards match by shape —
 * `writeBoundaryContract` asks who may write without recording an inverse, and
 * `writeTranslationContract` asks who may raise a database's own text at a
 * person. A module that executes the only `.from(…).update(…)` for seven
 * tables and sits outside both patterns would be exempt by invisibility rather
 * than by argument, which is the thing those two rules exist to refuse.
 *
 * So the rule lives here once and a level declares what is genuinely its own:
 * its table, the column the write is addressed by, the columns a spec may
 * touch and how each is normalised, what the change makes stale, and the
 * shape of the inverse the ledger carries. `cellFields.ts` declares a cell's
 * columns the same way and for the same reason — the select and the
 * normalizer are functions of the list, so a column added there is added to
 * both in one edit.
 *
 * The stations, in the order they run and the order they must stay in:
 *
 *  1. **A target with nothing in it is refused.** A level addressed by a set
 *     of ids can be handed an empty one — the lane whose rows were deleted
 *     while its panel was open — and an update matching nothing is a write
 *     that reports success having done nothing.
 *  2. **The update**, over the declared columns, addressed by the declared
 *     column: one value with `eq`, a set with `in`.
 *  3. **The failure becomes a sentence** through `toAuthoringError`, which is
 *     where a revoked column grant turns into words a person can act on.
 *  4. **Zero rows is a failure, not a success.** PostgREST answers an update
 *     that matched nothing with a 200 and an empty array. Reverting one would
 *     drop the entry from the ledger having written nothing — see
 *     `requireRowsWritten`, which is also why the query selects.
 *  5. **What the change shows in is refetched.** A level knows what draws it.
 *  6. **The inverse is recorded**, unless the caller is the revert path. A
 *     direct table write is one `call()` never sees, so it logs itself.
 */

/** A table a spec level may live on, as the generated schema names them. */
export type SpecTable = keyof Database['public']['Tables'] & string

/**
 * Which row, or rows: one id, or the set a fan-out lands on. A lane's spec
 * belongs to the label rather than to the row the panel was opened from — the
 * same lane in a four-path scenario is four rows, and writing one of them
 * would leave the lane claiming a different owner depending on which path you
 * were looking at.
 */
export type SpecTarget = string | readonly string[]

/**
 * The argument the inverse carries the previous values under: `update` for a
 * level whose write takes an object, `summary` for the three whose write takes
 * one string. A union rather than a name, because `executeRevert` reads it
 * back and a third spelling would be an undo nothing on the far side consumes.
 */
export type SpecPreviousArg = 'update' | 'summary'

/** The argument names `executeRevert` reads a spec change's target back under. */
export type SpecTargetArg =
  | 'cell_id'
  | 'lane_ids'
  | 'phase_id'
  | 'scenario_id'
  | 'path_id'
  | 'service_id'
  | 'step_id'

export type SpecLevel<Table extends SpecTable, Target extends SpecTarget, Value> = {
  /** The table the spec's columns live on. */
  table: Table
  /**
   * The column the write is addressed by — and the column it selects, which
   * are the same question: which rows did this land on.
   */
  addressedBy: keyof Database['public']['Tables'][Table]['Row'] & string
  /**
   * The level as a person would name it in a sentence about it going missing:
   * "That lane no longer exists". Read out loud on both refusals.
   */
  subject: string
  /**
   * The values as they are stored: trimmed, with the level's own notion of
   * empty. Text is `null` rather than `''` so "not specified" has one
   * representation — the read path hides a section when its field is empty,
   * and two kinds of empty would make that check inconsistent. A list column
   * is `NOT NULL` with `[]` as its default, so an emptied list is the empty
   * list; a jsonb map drops the key it emptied, because an absent key and a
   * blank one are not the same to the read.
   *
   * Typed against the generated Update row for the level's own table, the way
   * a cell field descriptor is typed against the generated cell row: a column
   * the schema does not have is a type error here, and so is a value the
   * column refuses. That guarantee used to come from the literal `.from`, and
   * clearing a cell's value propositions to null rather than to `[]` is the
   * defect it caught; it is kept at the declaration rather than lost to the
   * seam below.
   */
  columns: (value: Value) => Database['public']['Tables'][Table]['Update']
  /** What the change shows in, refetched. */
  invalidate: (target: Target) => void
  /**
   * The name the ledger records, and the name its inverse is performed under.
   * Every one of these is a direct table write dressed as a function name, so
   * `executeRevert` needs a case for it — `revertCoverageContract.test.ts`
   * reads these declarations for exactly that, which is why the name is
   * spelled here as a literal rather than derived from anything.
   */
  fn: WriteFn
  /**
   * The argument the recorded change names its target under. A closed set:
   * `executeRevert` reads each of these back by name, so a spelling no case
   * there knows is an undo that cannot be performed.
   */
  targetArg: SpecTargetArg
  /**
   * The argument the inverse carries the previous values under.
   * `executeRevert` hands the payload straight back, so it has to be the shape
   * the parameter takes — `update_business_model` originally spread a
   * camelCase update flat into its args, which no caller on either side could
   * consume, and the undo did nothing anyone could see.
   */
  previousAs: SpecPreviousArg
}

/**
 * A level's write: `(client, target, value, previous?, options?)`.
 *
 * `previous` is the values being replaced, captured so the change can be
 * reverted; absent means no inverse is owed. It is tested against `undefined`
 * rather than for truth, because an empty previous summary is a real
 * before-state and undoing back to empty is an undo.
 *
 * `record: false` is the revert path calling back in: the write lands and the
 * ledger stays where it was, or an undo would itself be undoable and the
 * stack would never empty.
 */
export type SpecWrite<Target extends SpecTarget, Value> = (
  client: Client,
  target: Target,
  value: Value,
  previous?: Value,
  options?: { record?: boolean },
) => Promise<void>

/**
 * The write a level's declaration makes.
 *
 * Bound rather than called with the declaration at every site, so a level's
 * module goes on exporting the function its panel already imports and no
 * caller learns that there is a shared rule underneath.
 */
export function specWriter<Table extends SpecTable, Target extends SpecTarget, Value>(
  level: SpecLevel<Table, Target, Value>,
): SpecWrite<Target, Value> {
  return async (client, target, value, previous, options = {}) => {
    // One value or a set, read off the target rather than declared: `eq` and
    // `in` are the same question asked of one id or several, and a level that
    // declared which it was could disagree with the target it is handed.
    const addressed = Array.isArray(target) ? (target as readonly string[]) : null
    if (addressed && addressed.length === 0) {
      throw new Error(`That ${level.subject} no longer exists — nothing to save onto.`)
    }

    // The builder cannot follow a table name held in a variable: its payload
    // type is a function of the literal, and a declaration is the one shape
    // that is not one. The same seam `authoringRpc.invoke` takes, for the same
    // reason — and narrower than it looks, because the declaration's `table`,
    // `addressedBy` and `columns` are all typed against the generated schema
    // above. What is erased here is the chain, not the payload.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    const query = (client.from as any)(level.table).update(level.columns(value))
    const { data, error } = await (addressed
      ? query.in(level.addressedBy, addressed)
      : query.eq(level.addressedBy, target)
    ).select(level.addressedBy)
    if (error) throw toAuthoringError(error)
    requireRowsWritten(data, level.subject)

    level.invalidate(target)

    if (options.record !== false) {
      recordChange(
        level.fn,
        { [level.targetArg]: target },
        previous === undefined
          ? undefined
          : {
              fn: level.fn,
              args: { [level.targetArg]: target, [level.previousAs]: previous },
            },
      )
    }
  }
}
