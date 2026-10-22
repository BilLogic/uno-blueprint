import { toAuthoringError } from '@/lib/authoringErrors'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { renameLane, renameStep } from '@/lib/authoringRpc'

export function StructureRenameEditor({
  kind,
  id,
  name,
  onDone,
}: {
  kind: 'lane' | 'step'
  id: string
  name: string
  onDone: () => void
}) {
  const { client, canWrite } = useSupabase()
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!client || !canWrite || !draft.trim() || busy) return
    if (draft.trim() === name) {
      onDone()
      return
    }
    setBusy(true)
    try {
      if (kind === 'step')
        await renameStep(client, {
          stepId: id,
          name: draft.trim(),
          previousName: name,
        })
      else
        await renameLane(client, {
          laneId: id,
          name: draft.trim(),
          previousName: name,
        })
      onDone()
    } catch (cause) {
      setError(toAuthoringError(cause instanceof Error ? cause : new Error('Unknown write failure')).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="min-w-0"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Input
        autoFocus
        aria-label={`Rename ${kind}`}
        value={draft}
        disabled={busy}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            void save()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
