import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { uploadAttachment, type UploadedAttachment } from '@/lib/attachmentUpload'
import { servedUrl } from '@/lib/basePath'
import { createResourceDraftStore } from '@/lib/resourceDraftStore'
import {
  addResource,
  draftsFromResources,
  planResourceSave,
  resourceChangeCount,
  resourcesFromDrafts,
  setFeaturedImage,
} from '@/lib/resourceDrafts'
import { attachmentMedium, touchpointLogos } from '@/lib/resourcePresentation'
import { errorMessage } from '@/lib/utils'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

export type FeaturedImageDraft = {
  frame: string | null
  savedFrame: string | null
  choose: (url: string | null) => void
}

export type FeaturedImageFieldProps = {
  cellId: string
  /** Focus the first picture choice once the enclosing editor is ready. */
  autoFocus?: boolean
  frame: string | null
  savedFrame: string | null
  resources: readonly CellResource[]
  touchpoints?: readonly CellTouchpoint[]
  onChange: (url: string | null) => void
  /** Stage the uploaded attachment in the host's draft; no resource row is written here. */
  onUploaded?: (attachment: UploadedAttachment) => void
  /** Lets the host hold its Save while the bucket write is pending. */
  onUploadingChange?: (uploading: boolean) => void
  /** Embed the same choice in an existing list without adding another Save. */
  children?: (draft: FeaturedImageDraft) => ReactNode
}

/** A controlled picture choice. Its host owns the draft and when it is written. */
export function FeaturedImageField({
  cellId,
  autoFocus = false,
  frame,
  savedFrame,
  resources,
  touchpoints = [],
  onChange,
  onUploaded,
  onUploadingChange,
  children,
}: FeaturedImageFieldProps) {
  const { client, canWrite } = useSupabase()
  const [uploading, setUploading] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const field = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (autoFocus) field.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [autoFocus])
  const fileInput = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const upload = async (file: File) => {
    if (!client || !canWrite || uploading || !onUploaded) return
    if (!file.type.startsWith('image/')) {
      setProblem('Choose an image file.')
      return
    }
    setUploading(true)
    onUploadingChange?.(true)
    setProblem(null)
    try {
      const attachment = await uploadAttachment(client, { cellId, file })
      if (!alive.current) return
      onUploaded(attachment)
      onChange(attachment.url)
    } catch (error) {
      if (alive.current) setProblem(errorMessage(error))
    } finally {
      if (alive.current) setUploading(false)
      onUploadingChange?.(false)
    }
  }
  const choose = (url: string | null) => onChange(url?.trim() || null)
  const draft = { frame, savedFrame, choose }
  if (children) return children(draft)
  const pictures = resources.filter(
    (row) => row.kind === 'attachment' && row.url && attachmentMedium(row.url) === 'image',
  )
  const choices = new Map<string, string>()
  for (const row of pictures) choices.set(row.url!, row.name)
  for (const logo of touchpointLogos(touchpoints)) choices.set(logo.url, `${logo.name} logo`)
  if (savedFrame && !choices.has(savedFrame)) choices.set(savedFrame, 'saved image')
  return (
    <div ref={field} className="flex flex-col gap-2" role="group" aria-label="Featured image">
      {frame ? (
        <>
          <img src={servedUrl(frame)} alt="Featured image" className="max-h-48 object-contain" />
          <Button type="button" variant="ghost" onClick={() => choose(null)}>
            Remove featured image
          </Button>
        </>
      ) : null}
      {Array.from(choices, ([url, name]) => (
        <Button
          key={url}
          type="button"
          variant="outline"
          aria-pressed={url === frame}
          disabled={url === frame}
          onClick={() => choose(url)}
        >
          {`Set ${name} as the featured image`}
        </Button>
      ))}
      {onUploaded ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload featured image"
            className="sr-only"
            tabIndex={-1}
            disabled={uploading || !client || !canWrite}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading || !client || !canWrite}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload an image'}
          </Button>
        </>
      ) : null}
      {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}

/** Standalone draft and writer. Embedded hosts use FeaturedImageField and their one Save. */
export type FeaturedImageControlProps = {
  cellId: string
  frame: string | null
  resources: readonly CellResource[]
  touchpoints?: readonly CellTouchpoint[]
  onSaved?: (frame: string | null) => void
  onCancel?: () => void
}

export function FeaturedImageControl(props: FeaturedImageControlProps) {
  return <StandaloneFeaturedImage key={props.cellId} {...props} />
}

function StandaloneFeaturedImage({
  cellId,
  frame,
  resources,
  touchpoints = [],
  onSaved,
  onCancel,
}: FeaturedImageControlProps) {
  const { client, canWrite } = useSupabase()
  const [store, setStore] = useState(() => createResourceDraftStore(draftsFromResources(resources, frame)))
  const [revision, setRevision] = useState(0)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const changed = resourceChangeCount(planResourceSave(state.baseline, state.drafts)) > 0
  const save = async () => {
    if (!client || !canWrite || busy || uploading) return
    setBusy(true)
    setProblem(null)
    try {
      await store.save(client, { cellId })
      if (alive.current) onSaved?.(store.getSnapshot().drafts.frame)
    } catch (error) {
      if (alive.current) setProblem(errorMessage(error))
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <fieldset disabled={busy || !client || !canWrite} className="flex flex-col gap-2">
        <FeaturedImageField
          key={revision}
          cellId={cellId}
          frame={state.drafts.frame}
          savedFrame={state.baseline.frame}
          resources={resourcesFromDrafts(state.drafts)}
          touchpoints={touchpoints}
          onChange={(url) => store.edit((draft) => setFeaturedImage(draft, url ?? ''))}
          onUploadingChange={setUploading}
          onUploaded={(attachment) => store.edit((draft) => addResource(draft, {
            key: `new:${attachment.objectKey}`,
            owner: null,
            kind: 'attachment',
            name: attachment.name,
            url: attachment.url,
          }))}
        />
        <div className="flex gap-2">
          <Button type="button" disabled={!changed || uploading} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={uploading}
            onClick={() => {
              setStore(createResourceDraftStore(state.baseline))
              setRevision((current) => current + 1)
              setProblem(null)
              onCancel?.()
            }}
          >
            Cancel
          </Button>
        </div>
      </fieldset>
      {problem ? <p role="alert" className="text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}
