import { Check, ExternalLink, FileText, ImageIcon } from 'lucide-react'
import { ResourcesList } from '@/components/blueprint/ResourcesList'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Button } from '@/components/ui/button'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useResourceDraftsOptional } from '@/contexts/ResourceDraftsContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { servedUrl } from '@/lib/basePath'
import {
  draftsFromResources,
  groupRows,
  resourceOwners,
  setFeaturedImage,
} from '@/lib/resourceDrafts'
import { touchpointLogos } from '@/lib/resourcePresentation'
import { safeExternalHref } from '@/lib/sliceCells'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

type CellResourcesTabProps = {
  /** Canonical cell id; null for fallback-only cells (read-only then). */
  cellId: string | null
  resources: CellResource[]
  /** The touchpoints placed at the cell, whose logos it inherits. */
  touchpoints?: readonly CellTouchpoint[]
}

/**
 * The logos a cell inherits from its touchpoints: read off the registry at
 * render and never saved as rows of the cell's own, so they cannot be edited,
 * reordered or removed here. In Edit mode each offers the one thing it can
 * be: the cell's featured image — a draft, like every other edit in the tab,
 * written by the panel's Save.
 */
function InheritedLogos({
  touchpoints,
  frame = null,
  savedFrame = frame,
  onSetFeaturedImage,
}: {
  touchpoints: readonly CellTouchpoint[]
  /** The featured image as the draft has it. */
  frame?: string | null
  /** The featured image as the database holds it, to say which choice is unsaved. */
  savedFrame?: string | null
  onSetFeaturedImage?: (url: string) => void
}) {
  const logos = touchpointLogos(touchpoints)
  if (logos.length === 0) return null

  return (
    <ul className="flex flex-col" aria-label="Inherited from this cell's touchpoints">
      {logos.map((logo) => {
        const isFrame = logo.url === frame?.trim()
        const unsaved = isFrame && frame !== savedFrame
        const label = isFrame
          ? `The ${logo.name} logo is the featured image`
          : `Set the ${logo.name} logo as the featured image`
        return (
          <li
            key={logo.url}
            className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
            data-unsaved={unsaved || undefined}
          >
            <img src={servedUrl(logo.url)} alt="" className="size-3 shrink-0 object-contain" />
            <span className="min-w-0 truncate">{logo.name}</span>
            <span className="shrink-0 text-xs opacity-70">logo, from the touchpoint</span>
            {unsaved ? (
              <span className="shrink-0 text-xs text-tertiary-foreground">Unsaved</span>
            ) : null}
            {onSetFeaturedImage ? (
              <IconTooltip label={label}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto"
                  aria-label={label}
                  aria-pressed={isFrame}
                  disabled={isFrame}
                  onClick={() => onSetFeaturedImage(logo.url)}
                >
                  {isFrame ? <Check className="size-3" /> : <ImageIcon className="size-3" />}
                </Button>
              </IconTooltip>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Resources tab: everything the cell points at, grouped by who owns it —
 * This cell, then each touchpoint placed at it.
 *
 * In Edit mode the tab *is* the editor, and the editor is `ResourcesList`
 * over the panel's resource draft. The draft belongs to the panel, not the
 * tab: the tab only edits it, and the panel's one Save writes it, so
 * switching to another tab and back loses nothing, and Cancel discards it
 * along with every other edit on the panel.
 *
 * View mode lists the same groups, without controls.
 *
 * A row nobody linked is a row nobody linked. The tab used to grow a synthetic
 * "Figma" entry for whatever url a vendor-name regex two files away had
 * elected as "the design", which put a link in this list that the cell's own
 * list did not hold and that Save could not have written.
 */
export function CellResourcesTab({
  cellId,
  resources,
  touchpoints = [],
}: CellResourcesTabProps) {
  const { client, canWrite } = useSupabase()
  const mode = useCanvasModeValue()
  const drafts = useResourceDraftsOptional()

  if (mode === 'design' && canWrite && cellId !== null && client !== null && drafts) {
    const { store, owners, defaultOwner, state } = drafts
    return (
      <ResourcesList
        cellId={cellId}
        owners={owners}
        defaultOwner={defaultOwner}
        baseline={state.baseline}
        value={state.drafts}
        onChange={store.edit}
        aside={
          <InheritedLogos
            touchpoints={touchpoints}
            frame={state.drafts.frame}
            savedFrame={state.baseline.frame}
            onSetFeaturedImage={(url) => store.edit((current) => setFeaturedImage(current, url))}
          />
        }
      />
    )
  }

  return <ReadOnlyResources resources={resources} touchpoints={touchpoints} />
}

/**
 * The groups as a reader sees them: each owner that points at anything,
 * headed by its name, its rows as links out. An owner with nothing to list
 * is left out — in View mode an empty heading is a question nobody can
 * answer from here.
 */
function ReadOnlyResources({
  resources,
  touchpoints,
}: {
  resources: CellResource[]
  touchpoints: readonly CellTouchpoint[]
}) {
  const inherited = <InheritedLogos touchpoints={touchpoints} />
  const inheritsAny = touchpointLogos(touchpoints).length > 0

  // No second answer to "what is this called when nobody said": the table
  // refuses a nameless row and the editor mints the host before it saves, so
  // a row that arrives here already has its name.
  const { rows } = draftsFromResources(resources, null)
  const groups = resourceOwners(touchpoints, rows).flatMap((owner) => {
    const listed = groupRows(rows, owner.id).filter((row) => safeExternalHref(row.url))
    return listed.length > 0 ? [{ owner, rows: listed }] : []
  })

  if (groups.length === 0) {
    if (inheritsAny) return inherited
    return (
      <p className="text-xs text-muted-foreground">
        No resources linked to this cell.
      </p>
    )
  }

  return (
    <>
      {groups.map(({ owner, rows: listed }) => (
        <section
          key={owner.id ?? 'cell'}
          className="flex flex-col gap-1"
          aria-label={owner.name}
          data-resource-group={owner.id ?? 'cell'}
        >
          <span className="text-xs font-medium text-muted-foreground">{owner.name}</span>
          <ul className="flex flex-col">
            {listed.map((row) => (
              <li key={row.key} className="border-b border-muted last:border-0">
                <a
                  href={safeExternalHref(row.url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full min-w-0 items-center gap-2 px-2 py-2 text-xs font-normal text-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {row.kind === 'attachment' ? (
                    <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="min-w-0 truncate">{row.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {inherited}
    </>
  )
}
