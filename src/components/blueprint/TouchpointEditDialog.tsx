import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { OptionSelect } from '@/components/blueprint/OptionSelect'
import { Field, PANEL_TEXTAREA_CLASS } from '@/components/blueprint/panelShell'
import { useSupabase } from '@/contexts/SupabaseProvider'
import {
  useTouchpointEntry,
  type TouchpointEntryRead,
} from '@/hooks/useRegistryTouchpoints'
import { uploadTouchpointIcon } from '@/lib/attachmentUpload'
import { servedUrl } from '@/lib/basePath'
import { validateResourceUrl } from '@/lib/resourceUrl'
import { TOUCHPOINT_KIND_OPTIONS } from '@/lib/touchpointKind'
import {
  updateTouchpoint,
  type TouchpointEntry,
  type TouchpointUpdate,
} from '@/lib/touchpointMutations'
import { errorMessage } from '@/lib/utils'

/** The image types `uploadTouchpointIcon` takes, offered to the file picker up front. */
const ICON_ACCEPT = 'image/png,image/jpeg,image/webp'

/**
 * The registry entry behind a placement, edited whole, over the cell panel.
 *
 * A modal and not more fields in the panel, because what it edits is a
 * different thing at a different reach. The panel is one cell and one
 * placement; this is the touchpoint itself, which every step that uses it
 * draws. So it opens on its own surface, says how far a change goes before
 * anything is typed, and saves with its own button — the panel's Save never
 * writes the registry, and this Save never writes the panel.
 *
 * It does not touch the panel's form, with one exception it cannot avoid: a
 * rename rewrites the name in every cell that lists it, this one included,
 * and the panel holds a copy of this cell's text. Whether that copy can be
 * moved is the panel's question, so it arrives as `renameRefusal` — null when
 * a rename may go ahead, else why it may not — and the result goes back
 * through `onSaved` for the panel to follow.
 */
export function TouchpointEditDialog({
  touchpointId,
  open,
  onOpenChange,
  renameRefusal,
  onSaved,
}: {
  touchpointId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  renameRefusal: string | null
  onSaved: (result: TouchpointUpdate) => void
}) {
  // Read only while open: the entry's summary and URL are not on the board,
  // and nobody pays for them until they ask to edit them.
  const entry = useTouchpointEntry(open ? touchpointId : null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Read by the panel's dismiss paths (`panelEditorBusy`): Escape here
        // closes this, and must not close the panel underneath.
        data-panel-dialog=""
        className="max-h-[calc(100dvh-2rem)] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Edit touchpoint</DialogTitle>
        </DialogHeader>
        {entry.status === 'ready' && entry.data ? (
          <TouchpointEditForm
            // The popup unmounts when it closes, so every opening is a fresh
            // form seeded from the row as the cache holds it now — never the
            // values a cancelled session left in state.
            key={entry.data.id}
            entry={entry.data}
            renameRefusal={renameRefusal}
            onCancel={() => onOpenChange(false)}
            onSaved={(result) => {
              onSaved(result)
              onOpenChange(false)
            }}
          />
        ) : (
          <p className="px-6 py-4 text-sm text-muted-foreground" role="status">
            {entry.status === 'loading'
              ? 'Loading the touchpoint…'
              : entry.status === 'error'
                ? `The touchpoint could not be read: ${entry.message}`
                : 'That touchpoint no longer exists.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The form's fields, held as text so an input is never handed a null. */
type Draft = {
  name: string
  kind: string
  summary: string
  url: string
  iconUrl: string | null
}

function draftFrom(entry: TouchpointEntryRead): Draft {
  return {
    name: entry.name,
    kind: entry.kind,
    summary: entry.summary ?? '',
    url: entry.url ?? '',
    iconUrl: entry.iconUrl,
  }
}

/**
 * A draft as the write stores it: trimmed, and blank prose as null.
 *
 * What "changed" is measured on. A trailing space added to the name is not an
 * edit — `update_touchpoint` would store the same row and report nothing
 * changed — so it must not light up Save either.
 */
function stored(draft: Draft): TouchpointEntry {
  return {
    name: draft.name.trim(),
    kind: draft.kind.trim(),
    summary: draft.summary.trim() || null,
    url: draft.url.trim() || null,
    iconUrl: draft.iconUrl?.trim() || null,
  }
}

function sameEntry(a: TouchpointEntry, b: TouchpointEntry): boolean {
  return (
    a.name === b.name &&
    a.kind === b.kind &&
    a.summary === b.summary &&
    a.url === b.url &&
    a.iconUrl === b.iconUrl
  )
}

/** A link as the write would take it, or why it would not. */
type LinkCheck = { url: string | null; problem: string | null }

/**
 * One of the entry's two links, checked by the rule a resource link meets.
 *
 * Only a value that differs from what the dialog opened with is checked. An
 * entry written before the rule — an http link, a seeded icon path — has to
 * stay editable in its other fields, and saving it does not rewrite what it
 * already holds; `update_touchpoint` makes the same exception. Empty is not a
 * problem either: it is how the field is cleared.
 */
function checkLink(value: string | null, opened: string | null): LinkCheck {
  if (value === null || value === opened) return { url: value, problem: null }
  const result = validateResourceUrl(value)
  return result.ok
    ? { url: result.url, problem: null }
    : { url: value, problem: result.problem }
}

/** "all 4 steps", or the one step there is — never "all 1 steps". */
function reachSentence(count: number, name: string): string {
  return count === 1
    ? `Changes apply at the one step that uses ${name}.`
    : `Changes apply at all ${count} steps that use ${name}.`
}

function TouchpointEditForm({
  entry,
  renameRefusal,
  onCancel,
  onSaved,
}: {
  entry: TouchpointEntryRead
  renameRefusal: string | null
  onCancel: () => void
  onSaved: (result: TouchpointUpdate) => void
}) {
  const { client } = useSupabase()
  // What the dialog opened with, frozen for the same reason the panel freezes
  // its baseline: a refetch mid-edit must not quietly redefine "unchanged".
  const [opened] = useState(() => draftFrom(entry))
  const [draft, setDraft] = useState(opened)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const before = stored(opened)
  const typed = stored(draft)
  // The URL is saved as the validator spells it, so a bare `figma.com/…` is
  // stored with its https. The icon is never typed — it is an upload's URL or
  // nothing — so it is checked, and saved as it came.
  const link = checkLink(typed.url, before.url)
  const icon = checkLink(typed.iconUrl, before.iconUrl)
  const next: TouchpointEntry = { ...typed, url: link.url }
  const changed = !sameEntry(next, before)
  const renaming = next.name !== before.name
  // A rename the panel cannot follow is refused before it is sent. The other
  // four fields reach no cell's text, so they save whatever the panel holds.
  const refused = renaming ? renameRefusal : null
  const canSave =
    client !== null &&
    changed &&
    !refused &&
    !link.problem &&
    !icon.problem &&
    next.name !== '' &&
    !busy &&
    !uploading

  const handleSave = async () => {
    if (!client || !canSave) return
    setBusy(true)
    setError(null)
    try {
      const result = await updateTouchpoint(client, entry.id, next)
      onSaved(result)
    } catch (saveError) {
      setError(errorMessage(saveError))
      setBusy(false)
    }
  }

  const handleUpload = async (file: File | undefined) => {
    if (!client || !file) return
    setUploading(true)
    setError(null)
    try {
      // Only the object is written now. The URL reaches the registry with
      // the rest of the entry, on Save, so an abandoned upload changes no row.
      const uploaded = await uploadTouchpointIcon(client, { touchpointId: entry.id, file })
      set('iconUrl', uploaded.url)
    } catch (uploadError) {
      setError(errorMessage(uploadError))
    } finally {
      setUploading(false)
      // The same file chosen twice is still a choice.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <div
        className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 py-4"
        data-touchpoint-edit-fields=""
      >
        {/* The reach, before any field: what this dialog is for is the
            difference between it and the panel underneath. */}
        <DialogDescription>
          {reachSentence(entry.placements, entry.name)}
        </DialogDescription>
        <Field label="Name" required>
          <Input
            aria-label="Name"
            value={draft.name}
            autoFocus
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        {refused ? <p className="text-xs text-destructive">{refused}</p> : null}
        <Field label="Kind">
          <OptionSelect
            aria-label="Kind"
            value={draft.kind}
            options={TOUCHPOINT_KIND_OPTIONS}
            onChange={(value) => set('kind', value)}
          />
        </Field>
        <Field label="Summary">
          <textarea
            aria-label="Summary"
            value={draft.summary}
            rows={3}
            onChange={(event) => set('summary', event.target.value)}
            className={PANEL_TEXTAREA_CLASS}
          />
        </Field>
        <Field label="URL">
          <Input
            aria-label="URL"
            type="url"
            inputMode="url"
            value={draft.url}
            placeholder="https://"
            onChange={(event) => set('url', event.target.value)}
          />
        </Field>
        {link.problem ? <p className="text-xs text-destructive">{link.problem}</p> : null}
        <Field label="Icon">
          <div className="flex flex-wrap items-center gap-2">
            {draft.iconUrl ? (
              <img
                // A seeded icon can be a root-relative path into `public/`,
                // which under a base path is served from under the prefix.
                src={servedUrl(draft.iconUrl)}
                alt="The touchpoint’s icon"
                className="size-8 shrink-0 rounded-md border border-border object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">No icon</span>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ICON_ACCEPT}
              className="sr-only"
              aria-label="Icon file"
              tabIndex={-1}
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading || busy}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? 'Uploading…' : 'Upload icon'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!draft.iconUrl || uploading || busy}
              onClick={() => set('iconUrl', null)}
            >
              Clear icon
            </Button>
          </div>
        </Field>
        {icon.problem ? <p className="text-xs text-destructive">{icon.problem}</p> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!canSave} onClick={handleSave}>
          {busy ? 'Saving…' : 'Save touchpoint'}
        </Button>
      </DialogFooter>
    </>
  )
}
