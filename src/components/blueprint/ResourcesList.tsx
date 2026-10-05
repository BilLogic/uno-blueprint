import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Reorder, useDragControls } from 'framer-motion'
import {
  ArrowRightLeft,
  Check,
  FileText,
  GripVertical,
  ImageIcon,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Star,
  StarOff,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { OptionSelect } from '@/components/blueprint/OptionSelect'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { uploadAttachment } from '@/lib/attachmentUpload'
import { hostOf } from '@/lib/cellResources'
import {
  addResource,
  featureResource,
  groupRows,
  moveResource,
  removeResource,
  renameResource,
  reorderGroup,
  retagResource,
  setFeaturedImage,
  unsavedResourceKeys,
  type DraftResource,
  type ResourceDrafts,
  type ResourceOwner,
  type ResourceOwnerId,
} from '@/lib/resourceDrafts'
import { attachmentMedium, linkPresentation } from '@/lib/resourcePresentation'
import { validateResourceUrl } from '@/lib/resourceUrl'
import { ROW_REVEAL_CLASS } from '@/lib/rowReveal'
import { cn, errorMessage } from '@/lib/utils'

/**
 * The one file the list is carrying, and which of its four states it is in.
 *
 * Idle is the absence of this. `failed` is the third state; the fourth —
 * landed — is this going back to null with an ordinary row in the list, which
 * is the point: a landed upload leaves nothing behind to look at.
 */
type PendingUpload = {
  file: File
  owner: ResourceOwnerId
  failed: boolean
}

/** What an upload will call the row, before the upload has answered. */
function nameOfFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, '') || 'Attachment'
}

/** The select's value for an owner: a placement's id, or the cell's sentinel. */
const CELL_OWNER = 'cell'
const ownerValue = (owner: ResourceOwnerId) => owner ?? CELL_OWNER
const ownerFrom = (value: string): ResourceOwnerId => (value === CELL_OWNER ? null : value)

/** A key for a row that has not been written yet. Never an id: the database mints those. */
let minted = 0
const mintKey = (seed: string) => `new:${seed}:${(minted += 1)}`

/**
 * One row of the list: what it is, and everything it offers.
 *
 * Its own component because the drag handle needs `useDragControls`, which is
 * a hook and so cannot live inside a `.map`, and because the rename lives here
 * — an inline edit is one row's business and no one else's.
 */
function ResourceListRow({
  row,
  first,
  last,
  unsaved,
  frame,
  elsewhere,
  onMove,
  onRename,
  onRemove,
  onFeature,
  onSetFeaturedImage,
  onRetag,
}: {
  row: DraftResource
  first: boolean
  last: boolean
  /** Whether this row differs from what the database holds. */
  unsaved: boolean
  /** The cell's featured image as the draft has it, to say which picture already is it. */
  frame: string | null
  /** The owners this row could be moved to. */
  elsewhere: readonly ResourceOwner[]
  /** Move this row one place up (-1) or down (1). */
  onMove: (by: -1 | 1) => void
  onRename: (name: string) => void
  onRemove: () => void
  onFeature: (featured: boolean) => void
  onSetFeaturedImage: () => void
  onRetag: (owner: ResourceOwnerId) => void
}) {
  const controls = useDragControls()
  /** The rename, while it is open: the text so far. Closed is null. */
  const [renaming, setRenaming] = useState<string | null>(null)

  const commit = () => {
    const typed = renaming?.trim()
    if (typed) onRename(typed)
    setRenaming(null)
  }

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded-md px-1 py-1 text-xs',
        row.kind === 'link' && row.featured && 'bg-muted/40',
      )}
      data-resource-row=""
      data-unsaved={unsaved || undefined}
    >
      <IconTooltip label="Drag to reorder, or press the up and down arrow keys">
        <button
          type="button"
          aria-label={`Reorder ${row.name}`}
          className={cn(
            ROW_REVEAL_CLASS,
            'flex shrink-0 cursor-grab touch-none items-center text-muted-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing',
          )}
          onPointerDown={(event) => controls.start(event)}
          onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
            // `Reorder.Item` is pointer-only, so the order stays reachable
            // here: the arrows move the focused row, and focus rides with it
            // because the row keeps its React key across the move.
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
            event.preventDefault()
            if (event.key === 'ArrowUp' && first) return
            if (event.key === 'ArrowDown' && last) return
            onMove(event.key === 'ArrowUp' ? -1 : 1)
          }}
        >
          <GripVertical className="size-3" />
        </button>
      </IconTooltip>
      {row.kind === 'attachment' ? (
        <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <Link2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      )}
      {renaming === null ? (
        // The name is text, not a second door into the rename. The menu item
        // is the only way in, on purpose: the row is already a drag target,
        // so a click on the name would be a second meaning for one gesture,
        // and it is the door that would have to change the moment an "open"
        // affordance lands on this row.
        //
        // The URL rides along twice, because `title` alone reaches only a
        // pointer: it is a hover tooltip for a mouse and a visually hidden
        // suffix for a screen reader, which reads "name, then where it goes".
        <span className="min-w-0 flex-1 truncate" title={row.url}>
          {row.name}
          <span className="sr-only">{`, ${row.url}`}</span>
        </span>
      ) : (
        <Input
          autoFocus
          value={renaming}
          aria-label={`Rename ${row.name}`}
          className="h-6 min-w-0 flex-1 text-xs"
          onChange={(event) => setRenaming(event.target.value)}
          // Two exits, and blur is not one of them. The menu that opened this
          // is the only way in, and it hands focus back to its own trigger as
          // it closes — so the blur that arrives first is the menu leaving and
          // not the reader finishing, and a rename that settled itself on
          // whatever took focus next would commit on the way in.
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              // Escape leaves the name it had — which, until somebody renames
              // it, is the default the row was minted with: the link's host or
              // the file's own name. Nobody is ever required to type one.
              setRenaming(null)
            }
          }}
        />
      )}
      {unsaved ? (
        // Words, not a dot: the count beside Save says how many, and this
        // says which — a colour alone would say it only to some readers.
        <span className="shrink-0 text-xs text-tertiary-foreground">Unsaved</span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${row.name}`}
            >
              <MoreHorizontal className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {/* A picture becomes the cell's featured image, which is its frame;
              a link is featured as a button. An attachment carries no
              featured meaning of its own. */}
          {row.kind === 'attachment' && attachmentMedium(row.url) === 'image' ? (
            row.url === frame ? (
              <DropdownMenuItem disabled>
                <Check className="size-3.5" aria-hidden />
                Featured image
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onSetFeaturedImage}>
                <ImageIcon className="size-3.5" aria-hidden />
                Set as featured image
              </DropdownMenuItem>
            )
          ) : null}
          {row.kind === 'link' && !row.featured ? (
            <DropdownMenuItem onClick={() => onFeature(true)}>
              <Star className="size-3.5" aria-hidden />
              Set as button
            </DropdownMenuItem>
          ) : null}
          {row.kind === 'link' && row.featured ? (
            <DropdownMenuItem onClick={() => onFeature(false)}>
              <StarOff className="size-3.5" aria-hidden />
              Unset
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setRenaming(row.name)}>
            <Pencil className="size-3.5" aria-hidden />
            Rename…
          </DropdownMenuItem>
          {elsewhere.map((owner) => (
            <DropdownMenuItem key={ownerValue(owner.id)} onClick={() => onRetag(owner.id)}>
              <ArrowRightLeft className="size-3.5" aria-hidden />
              {`Move to ${owner.name}`}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={onRemove}>
            <X className="size-3.5" aria-hidden />
            Remove from the list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Reorder.Item>
  )
}

/**
 * Everything a cell points at, as one list grouped by owner: This cell, then
 * each touchpoint placed at it.
 *
 * The list is a draft. Nothing here writes a row — not an add, a rename, a
 * reorder, a featured flag, a featured image or a move to another owner —
 * because the panel has one Save, and a second button for half of what is on
 * screen is the arrangement the panel's form was built to end. Every edit is
 * handed up as a change to the draft; the panel's Save writes it, its count
 * says how much is waiting, and Cancel throws it away. A row that differs
 * from what the database holds says so.
 *
 * The one thing that happens at once is the file itself: a chosen file goes
 * to the bucket on pick — the row carries the object's URL, so there is no
 * row to draft until the upload has answered — and only its row waits for
 * Save. It is visible the whole way: the row is on screen, dimmed, while the
 * bucket is being written, and stays as a `Retry` if the write is refused.
 *
 * An add picks its owner beside the paste field, defaulting to the
 * touchpoint the panel was opened on. A row moves to another owner from its
 * menu: that is a removal from one list and an add to the other, so the row
 * gets a new id when it is written and its featured flag resets.
 *
 * Reorder is a drag on the handle at the start of the row — `Reorder` from
 * `framer-motion` — within the row's own group, with the arrow keys on that
 * same handle as its keyboard half, because a pointer gesture on its own
 * would put the order out of reach. The rename has one door, the menu item;
 * Enter commits and Escape leaves the name that was standing. Nobody is ever
 * required to type a name: a link arrives as its host and a file as its own.
 */
export function ResourcesList({
  cellId,
  owners,
  defaultOwner,
  baseline,
  value,
  onChange,
  aside,
}: {
  /** The cell a chosen file is filed under; null means no file can join. */
  cellId: string | null
  /** The groups, in order. The first is the cell's own. */
  owners: readonly ResourceOwner[]
  /** Where an add goes until the author picks another owner. */
  defaultOwner: ResourceOwnerId
  /** What the database holds, to mark what differs from it. */
  baseline: ResourceDrafts
  /** The draft. */
  value: ResourceDrafts
  /** Hand an edit up to whoever holds the draft. */
  onChange: (change: (drafts: ResourceDrafts) => ResourceDrafts) => void
  /** Rows this list shows but does not hold, under the groups. */
  aside?: ReactNode
}) {
  const { client } = useSupabase()
  const [pasted, setPasted] = useState('')
  const [addTo, setAddTo] = useState<ResourceOwnerId>(defaultOwner)
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const uploading = pending !== null && !pending.failed
  const pasteProblem = pasted.trim() ? validateResourceUrl(pasted) : null
  const unsaved = unsavedResourceKeys(baseline, value)
  // An owner that left the cell takes its option with it; the add falls back
  // to the cell rather than drafting a row into a list nobody can see.
  const target = owners.some((owner) => owner.id === addTo) ? addTo : null

  const add = () => {
    const checked = validateResourceUrl(pasted)
    if (!checked.ok) {
      setError(checked.problem)
      return
    }
    setError(null)
    onChange((drafts) =>
      addResource(drafts, {
        key: mintKey(checked.url),
        owner: target,
        kind: 'link',
        name: hostOf(checked.url),
        url: checked.url,
      }),
    )
    setPasted('')
  }

  const upload = async (file: File, owner: ResourceOwnerId) => {
    if (!client || !cellId || uploading) return
    setPending({ file, owner, failed: false })
    setError(null)
    try {
      const uploaded = await uploadAttachment(client, { cellId, file })
      onChange((drafts) =>
        addResource(drafts, {
          key: mintKey(uploaded.objectKey),
          owner,
          kind: 'attachment',
          name: uploaded.name,
          url: uploaded.url,
        }),
      )
      setPending(null)
    } catch (uploadError) {
      setError(errorMessage(uploadError))
      setPending({ file, owner, failed: true })
    }
  }

  const featuredRows = value.rows.filter((row) => row.featured && row.kind === 'link')

  return (
    <div className="flex flex-col gap-2" data-resources-list="">
      {featuredRows.length > 0 ? (
        // No drag handle here, deliberately. The buttons follow the main list's
        // order, so this block has no order of its own to change — a handle
        // would offer a move that does nothing.
        <ul className="flex flex-col gap-1" aria-label="Featured">
          {featuredRows.map((row) => (
            <li
              key={row.key}
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
              data-featured-row=""
            >
              <Link2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {linkPresentation(row.url).label}
                <span className="text-muted-foreground"> · {row.name}</span>
              </span>
              <IconTooltip label="Unset — keep it in the list, stop leading with it">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unset ${row.name}`}
                  onClick={() => onChange((drafts) => featureResource(drafts, row.key, false))}
                >
                  <StarOff className="size-3" />
                </Button>
              </IconTooltip>
            </li>
          ))}
        </ul>
      ) : null}

      {owners.map((owner) => {
            const rows = groupRows(value.rows, owner.id)
            const elsewhere = owners.filter((other) => other.id !== owner.id)
            return (
              <section
                key={ownerValue(owner.id)}
                className="flex flex-col gap-1"
                aria-label={owner.name}
                data-resource-group={ownerValue(owner.id)}
              >
                <span className="text-xs font-medium text-muted-foreground">{owner.name}</span>
                {rows.length === 0 ? (
                  <p className="px-1 text-xs text-tertiary-foreground">Nothing here yet.</p>
                ) : (
                  <Reorder.Group
                    as="ul"
                    axis="y"
                    values={rows}
                    onReorder={(next: DraftResource[]) =>
                      onChange((drafts) =>
                        reorderGroup(drafts, owner.id, next.map((row) => row.key)),
                      )
                    }
                    className="flex flex-col gap-1"
                  >
                    {rows.map((row, index) => (
                      <ResourceListRow
                        key={row.key}
                        row={row}
                        first={index === 0}
                        last={index === rows.length - 1}
                        unsaved={unsaved.has(row.key)}
                        frame={value.frame}
                        elsewhere={elsewhere}
                        onMove={(by) => onChange((drafts) => moveResource(drafts, row.key, by))}
                        onRename={(name) =>
                          onChange((drafts) => renameResource(drafts, row.key, name))
                        }
                        onRemove={() => onChange((drafts) => removeResource(drafts, row.key))}
                        onFeature={(featured) =>
                          onChange((drafts) => featureResource(drafts, row.key, featured))
                        }
                        onSetFeaturedImage={() =>
                          onChange((drafts) => setFeaturedImage(drafts, row.url))
                        }
                        onRetag={(next) =>
                          onChange((drafts) =>
                            retagResource(drafts, row.key, next, mintKey(row.url)),
                          )
                        }
                      />
                    ))}
                  </Reorder.Group>
                )}
              </section>
            )
          })}

      {aside}

      {pending ? (
        <div
          className={cn(
            'flex flex-col gap-1 rounded-md px-1 py-1 text-xs',
            !pending.failed && 'opacity-60',
          )}
          data-upload-row=""
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{nameOfFile(pending.file)}</span>
            {pending.failed ? (
              <>
                <span className="shrink-0 text-xs text-destructive">
                  The file did not upload.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void upload(pending.file, pending.owner)}
                >
                  Retry
                </Button>
              </>
            ) : (
              <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            )}
          </div>
          {pending.failed ? null : (
            // Indeterminate on purpose: the bucket reports no progress, so a
            // filling bar would be a number the upload does not have.
            <Skeleton
              role="progressbar"
              aria-label={`Uploading ${nameOfFile(pending.file)}`}
              className="h-0.5 w-full rounded-full"
            />
          )}
        </div>
      ) : null}

      {owners.length > 1 ? (
        <OptionSelect
          value={ownerValue(target)}
          onChange={(next) => setAddTo(ownerFrom(next))}
          options={owners.map((owner) => ({ value: ownerValue(owner.id), label: owner.name }))}
          aria-label="Add to"
          className="h-7 text-xs"
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          value={pasted}
          placeholder="Paste a link…"
          aria-label="Paste a link"
          className="h-7 flex-1 text-xs"
          aria-invalid={pasteProblem?.ok === false || undefined}
          onChange={(event) => setPasted(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pasted.trim()}
          onClick={add}
        >
          Add
        </Button>
      </div>
      {pasteProblem && !pasteProblem.ok ? (
        <p className="text-xs text-destructive">{pasteProblem.problem}</p>
      ) : null}
      {cellId ? (
        <>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            aria-label="Upload a file"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void upload(file, target)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start px-2 text-muted-foreground hover:text-foreground"
            disabled={uploading || !client}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="size-3" />
            {uploading ? 'Uploading…' : 'Upload a file'}
          </Button>
        </>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
