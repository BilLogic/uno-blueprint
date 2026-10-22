import { useCallback } from 'react'
import { queryKeys } from '@/lib/queryKeys'
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery'
import { Input } from '@/components/ui/input'
import { Field } from './panelShell'

/** Frames belong to the actors' cells, never to the storyboard's own row. */
export function DraftStoryboardFields({
  pathId,
  frames,
  onChange,
}: {
  pathId: string
  frames: Array<{ laneId: string; url: string }>
  onChange: (frames: Array<{ laneId: string; url: string }>) => void
}) {
  const fallback = useCallback(() => [], [])
  const result = useSupabaseQuery(
    queryKeys.draftStoryboardLanes.of(pathId),
    async (client, signal) => {
      const { data, error } = await client
        .from('lanes')
        .select('id, name, lane_role')
        .eq('path_id', pathId)
        .order('position')
        .abortSignal(signal)
      if (error) throw error
      return (data ?? []).filter(
        (lane) =>
          ![
            'storyboard',
            'frontstage_touchpoints',
            'backstage_touchpoints',
          ].includes(lane.lane_role ?? ''),
      )
    },
    fallback,
  )
  return (
    <Field
      label="Storyboard"
      hint="Optional image URLs, one per actor at this moment."
    >
      {result.status === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          The storyboard actors could not be loaded.
        </p>
      ) : null}
      {result.status === 'ready'
        ? result.data.map((lane) => (
            <label
              key={lane.id}
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              {lane.name}
              <Input
                aria-label={`Storyboard for ${lane.name}`}
                type="url"
                placeholder="https://…"
                value={
                  frames.find((frame) => frame.laneId === lane.id)?.url ?? ''
                }
                onChange={(event) =>
                  onChange(
                    [
                      ...frames.filter((frame) => frame.laneId !== lane.id),
                      { laneId: lane.id, url: event.target.value },
                    ].filter((frame) => frame.url.trim()),
                  )
                }
              />
            </label>
          ))
        : null}
    </Field>
  )
}
