import { useCallback } from 'react'
import { useSupabaseQuery, type QueryResult } from '@/hooks/useSupabaseQuery'
import type { Evidence } from '@/types/database'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Evidence rows for one cell, newest first. Evidence is for signed-in
 * readers: an excerpt can hold interview content, so `anon` holds no SELECT
 * on it and the Evidence tab does not mount this for a signed-out reader.
 * Mount with the Evidence tab open; the evidence writes refetch it for the
 * cell they touched.
 */
export function useEvidence(cellId: string): QueryResult<Evidence[]> {
  const fallback = useCallback(() => null, [])

  return useSupabaseQuery<Evidence[]>(
    queryKeys.evidence.of(cellId),
    async (client, signal) => {
      const { data, error } = await client
        .from('evidence')
        .select('*')
        .eq('cell_id', cellId)
        .order('created_at', { ascending: false })
        .abortSignal(signal)
      if (error) throw new Error(error.message)
      return data ?? []
    },
    fallback,
  )
}
