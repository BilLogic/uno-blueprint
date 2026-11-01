import { useCallback } from 'react'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Whether the recovery archive exists in this database.
 *
 * The plan's ordering rule is that no delete affordance ships before its
 * archive does, and this is what makes that rule true at runtime rather than
 * only in the tests. The app is deployed against more than one database — a
 * schema that has not had the authoring migration applied has no recovery
 * archive at all, and a delete there would destroy imported blueprint content
 * with nothing behind it.
 *
 * The subject is `public.trash`. It is a VIEW, over the deletions in
 * `public.authoring_changes`, rather than the `deleted_structure` table it
 * replaced — one log for every authoring write, with the recovery list as a
 * filter on it. The probe is unchanged in everything except the relation it
 * names, because a view answers the only question this hook asks in exactly
 * the same way a table did.
 *
 * The probe is a read, not a catalog lookup: PostgREST answers for the schema
 * it is actually serving, which is the thing that matters. An empty result
 * means the table is there and holds nothing, which is availability; only an
 * error means it is absent. Row-level security can hide the rows but not the
 * relation, so a policy that returns nothing still reads as available — which
 * is right, because the RPCs write through `security definer` regardless.
 *
 * No-DB mode answers `false` through the fallback. There is nothing to delete
 * from and nowhere to put it back.
 *
 * A signed-out reader is not asked about at all. The recovery list is the
 * edit log's, which `anon` may not read, so the probe would be refused on
 * every load — and that reader has nothing to delete. `canReadPrivate` gates
 * it the way it gates every other signed-in-only read.
 */
export function useArchiveAvailable(): boolean {
  const { canReadPrivate } = useSupabase()
  const fallback = useCallback(() => false, [])
  const result = useSupabaseQuery<boolean>(
    canReadPrivate ? queryKeys.archiveAvailable : null,
    async (client, signal) => {
      // Cast for the same reason `authoringRpc` casts `rpc`: the generated
      // `Database` type is regenerated from whichever schema was linked last,
      // and this hook exists precisely to answer the case where the table is
      // not in that schema. Typing the probe against the types would make the
      // question unaskable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
      const { error } = await (client.from as any)('trash')
        .select('id')
        .limit(1)
        .abortSignal(signal)
      return !error
    },
    fallback,
  )
  return result.status === 'ready' ? result.data : false
}
