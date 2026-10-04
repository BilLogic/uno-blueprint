import { useState } from 'react'
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
import { DeleteSliceDialog } from '@/components/editor/TabStrip'
import { NavRow, NavSection } from '@/components/editor/SidebarNav'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { duplicateSlice, updateSliceMetaFromSeed } from '@/lib/sliceMutations'
import { isSliceKind } from '@/lib/sliceValidation'
import { errorMessage } from '@/lib/utils'
import { reportWriteFailure } from '@/lib/writeFailures'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useViewState } from '@/contexts/viewStateStore'
import { useSlices, type SliceListEntry } from '@/hooks/useSlices'
import { useActiveServiceId } from '@/contexts/activeService'

/** Sidebar group order — unknown types fall into Custom. */
const SLICE_TYPE_GROUPS = ['journey', 'step', 'lane', 'cell', 'custom'] as const

/** The group's heading, in sentence case — the string carries its case. */
const SLICE_GROUP_TITLE: Record<(typeof SLICE_TYPE_GROUPS)[number], string> = {
  journey: 'Journey',
  step: 'Step',
  lane: 'Lane',
  cell: 'Cell',
  custom: 'Custom',
}

type SliceTypeGroup = (typeof SLICE_TYPE_GROUPS)[number]

function sliceKindGroup(sliceKind: string): SliceTypeGroup {
  const type = sliceKind.toLowerCase()
  return SLICE_TYPE_GROUPS.find((group) => group === type) ?? 'custom'
}

function SliceRow({
  slice,
  isActive,
  isOpenInactive,
  onOpen,
  onPresent,
  onDelete,
  onRename,
  onDuplicate,
  canWrite,
}: {
  slice: SliceListEntry
  /** This slice's tab is the active one. */
  isActive: boolean
  /** This slice has an open tab that is not the active one. */
  isOpenInactive: boolean
  onOpen: () => void
  onPresent: () => void
  onDelete: () => void
  onRename: () => void
  onDuplicate: () => void
  canWrite: boolean
}) {
  // Same row component, states and indent as the Phases tree: the active tab
  // gets the selected fill + rail, an open-but-inactive tab gets the marker
  // dot, everything else is plain.
  const row = (
    <NavRow
      label={slice.title}
      icon="◇"
      size="sm"
      onSelect={onOpen}
      selected={isActive}
      ancestor={isOpenInactive}
    />
  )

  return (
    <ContextMenu>
      {/* A plain wrapper takes the trigger's props: NavRow renders two
          sibling buttons, so there is no single element to merge them onto. */}
      <ContextMenuTrigger className="block w-full">{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <ExternalLink className="size-3.5" />
          Open in new tab
        </ContextMenuItem>
        <ContextMenuItem onClick={onPresent}>
          <Play className="size-3.5" />
          Present
        </ContextMenuItem>
        {canWrite ? (
          <>
            <ContextMenuItem onClick={onRename}>
              <Pencil className="size-3.5" />
              Rename…
            </ContextMenuItem>
            <ContextMenuItem onClick={onDuplicate}>
              <Copy className="size-3.5" />
              Duplicate
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete slice…
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * Slices sidebar mode — the service's slices grouped by `kind` into
 * accordion sections (JOURNEY / STEP / LANE / CELL / CUSTOM; only non-empty
 * groups render, all open by default). Click (or the context menu) opens the
 * slice tab; writers can delete from the context menu.
 */
export function SlicesSidebarSection() {
  const slices = useSlices(useActiveServiceId())
  const { openTab, tabs, activeKey } = useViewState()
  const { client, canWrite } = useSupabase()
  // Edit mode only, like every other authoring affordance in this sidebar.
  const mode = useCanvasModeValue()
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<SliceListEntry | null>(null)
  // Tracked as the *collapsed* set rather than the open one: a group the
  // user never touched stays open even when it first appears (slices load
  // late, new types get created), while an explicit collapse survives the
  // list changing under it. The old `key={groups.join('|')}` remount reset
  // every group whenever a slice was created or deleted.
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )

  const rows: SliceListEntry[] =
    slices.status === 'ready'
      ? slices.data
      : slices.status === 'error'
        ? (slices.fallback ?? [])
        : []

  const groups = SLICE_TYPE_GROUPS.map((type) => ({
    type,
    slices: rows.filter((slice) => sliceKindGroup(slice.kind) === type),
  })).filter((group) => group.slices.length > 0)

  if (groups.length === 0) {
    return (
      // Teaching tone, matching the agent panel's empty states: say what a
      // slice is and the two real routes to one (the Edit-mode Make slice
      // flow in CanvasDesignTools, or the agent's /ub:slice skill).
      <p className="px-3 py-2 text-xs text-tertiary-foreground">
        No slices yet — a slice is a stakeholder view cut from the blueprint.
        In Edit mode, pick cells and press Make slice, or ask the agent with
        /ub:slice.
      </p>
    )
  }

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <NavSection
          key={group.type}
          title={SLICE_GROUP_TITLE[group.type]}
          open={!collapsedGroups.has(group.type)}
          onOpenChange={(open) =>
            setCollapsedGroups((collapsed) => {
              const next = new Set(collapsed)
              if (open) next.delete(group.type)
              else next.add(group.type)
              return next
            })
          }
        >
          <ul className="flex flex-col gap-1">
            {group.slices.map((slice) => (
              <li key={slice.id}>
                <SliceRow
                  slice={slice}
                  isActive={
                    activeKey === `slice:${slice.id}` ||
                    activeKey === `present:${slice.id}`
                  }
                  isOpenInactive={
                    activeKey !== `slice:${slice.id}` &&
                    activeKey !== `present:${slice.id}` &&
                    tabs.some((tab) => tab.sliceId === slice.id)
                  }
                  canWrite={canWrite && mode === 'design'}
                  onOpen={() => openTab({ kind: 'slice', sliceId: slice.id })}
                  onPresent={() =>
                    openTab({ kind: 'present', sliceId: slice.id })
                  }
                  onDelete={() =>
                    setDeleteTarget({ id: slice.id, title: slice.title })
                  }
                  onRename={() => setRenameTarget(slice)}
                  onDuplicate={() => {
                    if (!client) return
                    void duplicateSlice(client, slice.id)
                      .then((copy) => {
                        openTab({ kind: 'slice', sliceId: copy.id })
                      })
                      .catch((duplicateError) => {
                        reportWriteFailure(
                          `“${slice.title}” was not duplicated`,
                          duplicateError,
                        )
                      })
                  }}
                />
              </li>
            ))}
          </ul>
        </NavSection>
      ))}
      <DeleteSliceDialog
        slice={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      />
      <RenameSliceDialog
        slice={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null)
        }}
      />
    </div>
  )
}

/**
 * Rename a slice — title and subtitle, the two fields creating one asks for.
 *
 * Exported for `sliceRenameGuard.test.tsx`, which drives the save rather than
 * reading it: the guard below has been wrong in both directions, and neither
 * wrong version looked any different from this one.
 *
 * The whole form — not just the two fields on screen — is frozen at the moment
 * it opens, and `updateSliceMetaFromSeed` guards on that seed: it reads the
 * row back at submit and refuses when the meta has moved since. So a rename
 * typed over a slice someone else has since changed fails rather than silently
 * overwriting them, and a rename over a row that merely got a newer stamp
 * still lands. Guarding on the stamp alone could only ever have one of those
 * two, whichever stamp it picked.
 *
 * That seed is also why the whole meta goes back — type, actor and origin are
 * re-sent as the user last saw them rather than dropped, which is what the
 * comparison just promised they still are.
 */
export function RenameSliceDialog({
  slice,
  open,
  onOpenChange,
}: {
  slice: SliceListEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { client } = useSupabase()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed on every open, cleared on close — keying on slice.id kept a
  // cancelled edit's junk alive for the same slice, one Enter from saving.
  // The row is held rather than a `seeded` flag: it is what the save compares
  // against, so the two can never disagree about which open it belongs to.
  const [seed, setSeed] = useState<SliceListEntry | null>(null)
  if (open && slice && !seed) {
    setSeed(slice)
    setTitle(slice.title)
    setSummary(slice.summary ?? '')
    setError(null)
  }
  if (!open && seed) setSeed(null)

  const save = async () => {
    if (!client || !seed || busy || !title.trim()) return
    setBusy(true)
    setError(null)
    let outcome
    try {
      outcome = await updateSliceMetaFromSeed(client, seed.id, seed, {
        title,
        summary,
        sliceKind: isSliceKind(seed.kind) ? seed.kind : 'custom',
        actor: seed.actor ?? '',
        authorship: seed.authorship ?? 'human',
      })
    } catch (renameError) {
      setBusy(false)
      setError(errorMessage(renameError))
      return
    }
    setBusy(false)
    if (outcome.status === 'ok') {
      onOpenChange(false)
      return
    }
    // `readWriteOutcome` throws on a real error, so the only other outcome is
    // a row that moved — edited elsewhere, or gone.
    setError('This slice changed somewhere else. Reopen it and try again.')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename slice</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-6">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">Title</span>
            <Input
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save()
              }}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Subtitle{' '}
              <span className="font-normal text-muted-foreground">
                · optional
              </span>
            </span>
            <Input
              value={summary}
              placeholder="What this slice shows, and who it is for"
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
          {error ? (
            <Alert variant="warning">
              <AlertTriangle className="size-3.5" aria-hidden />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !title.trim()}
            onClick={save}
          >
            {busy ? 'Renaming…' : 'Rename'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
