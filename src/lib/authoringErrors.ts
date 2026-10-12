import type { PostgrestError } from '@supabase/supabase-js'

import { reconcileSessionAfterDenial } from '@/lib/sessionReconcile'

/**
 * An authoring failure, already phrased for a person.
 *
 * `message` is what the UI shows. `raw` is the database's own text, which
 * never reaches a person's eye unasked: the trigger messages are precise and
 * correct ("cells.step_id must be linked to cells.path_id in path_steps") and
 * mean nothing to someone drawing a blueprint. It goes to the console, and to
 * the agent: the loop hands it to the model beside the sentence, because the
 * model cannot read the console and retries blind without the cause. The
 * transcript row's expandable detail shows that same answer, so a person
 * reading the turn back sees what the model saw; its summary stays `message`.
 */
export class AuthoringError extends Error {
  readonly raw: string

  constructor(message: string, raw: string) {
    super(message)
    this.name = 'AuthoringError'
    this.raw = raw
  }
}

/**
 * Database text the app must never show, mapped to what actually went wrong.
 *
 * Matching is by substring rather than by SQLSTATE because these are raised
 * by `raise exception`, which yields P0001 for all of them — the code carries
 * no information, only the text does.
 *
 * The RPCs that hold the app's authoring operations deliberately raise
 * sentences ("A blueprint needs a name"), so they are absent here and pass
 * through untouched. Only the older structural triggers, and Postgres's own
 * constraint machinery, need translating.
 */
const DENIAL_PERMISSION = 'permission denied'
const DENIAL_RLS = 'violates row-level security'

const TRANSLATIONS: Array<{ match: string; message: string }> = [
  {
    match: 'cells.step_id must be linked',
    message:
      'That step is not part of this version yet. Add the step to the version before putting a cell in it.',
  },
  {
    match: 'cells.path_id must match lanes.path_id',
    message: 'That lane belongs to a different version of this journey.',
  },
  {
    match: 'cells: lane_id does not exist',
    message: 'That lane no longer exists — it may have been deleted in another tab.',
  },
  {
    match: 'path_steps_path_column_unique',
    message: 'Two steps ended up in the same position. Reload and try the move again.',
  },
  {
    // The decision that a lane's position is unique within its path is what
    // makes this reachable. Its predecessor matched
    // `lanes_path_row_unique`, a name nothing has ever carried — the object on
    // those two columns was `lanes_path_row_idx`, a plain non-unique index —
    // so the branch was dead text and an author who put two lanes in one slot
    // met no refusal at all. Deferred, so this text can only appear when a
    // reorder SETTLED on two lanes in one slot, never mid-move.
    match: 'lanes_path_position_unique',
    message: 'Two lanes ended up in the same position. Reload and try the move again.',
  },
  {
    // A findings fingerprint collision is neither a name nor a position: it is
    // a reopen racing a twin that is already open, which the partial unique
    // index over open fingerprints refuses by design. Match it before the
    // generic sentence, or the author is told to rename something they never
    // named.
    match: 'findings_open_fingerprint',
    message: 'That finding is already open — reload to see the one that exists.',
  },
  {
    match: 'duplicate key value',
    message: 'Something with that name or position already exists here.',
  },
  {
    match: 'violates foreign key constraint',
    message: 'Something this refers to no longer exists — reload and try again.',
  },
  {
    match: DENIAL_PERMISSION,
    message:
      'This session cannot write. Authoring needs the dev server with a local authoring key.',
  },
  {
    match: DENIAL_RLS,
    message:
      'This session cannot write. Authoring needs the dev server with a local authoring key.',
  },
]

/**
 * Does this failure mean the database refused on AUTHORIZATION grounds, as
 * opposed to refusing the data?
 *
 * The two strings live in constants so this predicate and the translation
 * table above cannot drift apart. They already had to agree; nothing enforced
 * it.
 */
export function isAuthorizationDenial(error: PostgrestError | Error): boolean {
  const haystack = rawTextOf(error).toLowerCase()
  return (
    haystack.includes(DENIAL_PERMISSION) || haystack.includes(DENIAL_RLS)
  )
}

/** Last resort. Never shows database text. */
const FALLBACK = 'That change could not be saved. The details are in the console.'

/**
 * Turn a PostgREST error into something worth showing.
 *
 * Everything the app raises deliberately is a sentence already; anything else
 * is either translated or replaced. The raw text always survives on `.raw` so
 * the console keeps the diagnosable version.
 */
export function toAuthoringError(error: PostgrestError | Error): AuthoringError {
  const raw = rawTextOf(error)

  /*
    THE ONE SIDE EFFECT IN THIS FILE, and it is here because this is the only
    funnel every failed write passes through. There is no single place those
    failures are CAUGHT — each call site raises and the surface above it
    renders — so a translation function is the one seam they share. Putting
    the reconcile at each call site would be dozens of edits that drift, and
    putting it behind a react-query `MutationCache` would cover nothing,
    because the app has no `useMutation` anywhere.

    "Every failed write" is a claim, so it is checked rather than asserted:
    `writeTranslationContract.test.ts` walks the write-owning modules and fails
    on any `throw new Error(error.message)`. A module that forwards the
    database's own text is two failures at once — the thing `AuthoringError.raw`
    exists to prevent, and a refused write for which no reconcile can ever
    fire.

    It is safe to sit on a translation path: fire-and-forget, guarded against
    bursts, and a no-op until `SupabaseProvider` registers a reconciler. See
    `sessionReconcile.ts` for why a denial is the right trigger.
  */
  if (isAuthorizationDenial(error)) reconcileSessionAfterDenial()

  const haystack = raw.toLowerCase()
  for (const { match, message } of TRANSLATIONS) {
    if (haystack.includes(match.toLowerCase())) return new AuthoringError(message, raw)
  }

  // Sentences the RPCs raise on purpose: capitalised, spaced, no identifier
  // punctuation. Anything shaped like `relation "x" does not exist` fails this
  // and takes the fallback.
  if (isHumanSentence(error.message)) {
    return new AuthoringError(error.message, raw)
  }

  return new AuthoringError(FALLBACK, raw)
}

function isHumanSentence(message: string): boolean {
  if (!message) return false
  if (message.length > 160) return false
  if (/[_"]|\b[a-z]+\.[a-z_]+\b/.test(message)) return false
  return /^[A-Z]/.test(message) && message.includes(' ')
}

/** The database's own text, joined: message, details, hint. */
function rawTextOf(error: PostgrestError | Error): string {
  return [
    error.message,
    'details' in error ? error.details : null,
    'hint' in error ? error.hint : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' — ')
}
