import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Check, ExternalLink, FileText, ImageIcon } from 'lucide-react'
import {
  ResourcesList,
  type ResourceListDraft,
} from '@/components/blueprint/ResourcesList'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Button } from '@/components/ui/button'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { setCellFeaturedImage } from '@/lib/authoringRpc'
import { servedUrl } from '@/lib/basePath'
import { updateCellResources } from '@/lib/cellContentMutations'
import { setFeaturedResource } from '@/lib/placementResourceMutations'
import { touchpointLogos } from '@/lib/resourcePresentation'
import { safeExternalHref } from '@/lib/sliceCells'
import { errorMessage } from '@/lib/utils'
import type { Database } from '@/types/database'
import type { CellResource, CellTouchpoint } from '@/types/blueprint'

type ResourceRow = {
  id: string
  name: string
  url: string
  kind: CellResource['kind']
}

type CellResourcesTabProps = {
  /** Canonical cell id; null for fallback-only cells (read-only then). */
  cellId: string | null
  resources: CellResource[]
  /** The touchpoints placed at the cell, whose logos it inherits. */
  touchpoints?: readonly CellTouchpoint[]
  /** The cell's frame, which is its featured image. */
  frame?: string | null
}

/**
 * The rows the cell's list edits: its own, with a url. A placement's are read
 * here and edited from the touchpoint.
 */
function ownRows(resources: CellResource[]): CellResource[] {
  return resources.filter(
    (resource) => !resource.placementId && resource.url?.trim(),
  )
}

/** A placement's resources, as the editor lists them without controls. */
function placementRows(resources: CellResource[]): CellResource[] {
  return resources.filter(
    (resource) => resource.placementId !== null && resource.url?.trim(),
  )
}

/**
 * The logos a cell inherits from its touchpoints: read off the registry at
 * render and never saved as rows of the cell's own, so they cannot be edited,
 * reordered or removed here. In Edit mode each offers the one thing it can
 * be: the cell's featured image, which writes the frame.
 */
function InheritedLogos({
  touchpoints,
  frame = null,
  onSetFeaturedImage,
}: {
  touchpoints: readonly CellTouchpoint[]
  frame?: string | null
  onSetFeaturedImage?: (url: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const logos = touchpointLogos(touchpoints)
  if (logos.length === 0) return null

  const choose = async (url: string) => {
    if (!onSetFeaturedImage || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await onSetFeaturedImage(url)
    } catch (writeError) {
      setProblem(errorMessage(writeError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ul className="flex flex-col" aria-label="Inherited from this cell's touchpoints">
        {logos.map((logo) => {
          const isFrame = logo.url === frame?.trim()
          const label = isFrame
            ? `The ${logo.name} logo is the featured image`
            : `Set the ${logo.name} logo as the featured image`
          return (
            <li
              key={logo.url}
              className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
            >
              <img src={servedUrl(logo.url)} alt="" className="size-3 shrink-0 object-contain" />
              <span className="min-w-0 truncate">{logo.name}</span>
              <span className="shrink-0 text-xs opacity-70">logo, from the touchpoint</span>
              {onSetFeaturedImage ? (
                <IconTooltip label={label}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={label}
                    aria-pressed={isFrame}
                    disabled={isFrame || busy}
                    onClick={() => void choose(logo.url)}
                  >
                    {isFrame ? <Check className="size-3" /> : <ImageIcon className="size-3" />}
                  </Button>
                </IconTooltip>
              ) : null}
            </li>
          )
        })}
      </ul>
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </>
  )
}

/**
 * Resources tab: the cell's `resources` rows.
 *
 * In Edit mode the tab *is* the editor, and the editor is `ResourcesList` —
 * the same list a touchpoint's resources are edited in, handed this cell's
 * two writes instead of a placement's. A cell owns a preview and buttons the
 * way a placement does: the partial unique index already indexes a cell-owned
 * preview, `set_featured_resource` scopes its clear to the placement-less
 * owner, and `sync_cell_resources` never writes `featured` — so the two-tempo
 * write model arrives here with nothing added to the schema.
 *
 * A placement's rows arrive in the same list now that every resource knows its
 * own cell, a placement's included — the cell reads everything it points at,
 * through its touchpoints too — and are listed here without controls: the
 * touchpoint's own editor is where they change.
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
  frame = null,
}: CellResourcesTabProps) {
  const { client, canWrite } = useSupabase()
  const mode = useCanvasModeValue()

  if (mode === 'design' && canWrite && cellId !== null && client !== null) {
    return (
      <CellResourcesEditor
        key={cellId}
        cellId={cellId}
        client={client}
        resources={resources}
        touchpoints={touchpoints}
        frame={frame}
      />
    )
  }

  const inherited = <InheritedLogos touchpoints={touchpoints} />
  const inheritsAny = touchpointLogos(touchpoints).length > 0

  // No second answer to "what is this called when nobody said": the table
  // refuses a nameless row and the editor mints the host before it saves, so
  // a row that arrives here already has its name.
  const rows: ResourceRow[] = resources.flatMap((resource, index) => {
    const url = resource.url?.trim()
    if (!url) return []
    return [{ id: resource.id ?? `resource-${index}`, name: resource.name, url, kind: resource.kind }]
  })

  if (rows.length === 0) {
    if (inheritsAny) return inherited
    return (
      <p className="text-xs text-muted-foreground">
        No resources linked to this cell.
      </p>
    )
  }

  return (
    <>
      <ul className="flex flex-col">
        {rows.filter((row) => safeExternalHref(row.url)).map((row) => (
          <li key={row.id} className="border-b border-muted last:border-0">
            <a
              href={safeExternalHref(row.url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full min-w-0 items-center gap-2 px-2 py-2 text-xs font-normal text-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              {row.kind === 'attachment' ? (
                <FileText
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              ) : (
                <ExternalLink
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <span className="min-w-0 truncate">{row.name}</span>
            </a>
          </li>
        ))}
      </ul>
      {inherited}
    </>
  )
}

/**
 * The cell's own list, and the two writes that make it the cell's.
 *
 * `sync_cell_resources` refuses a placement's ids, so the list is handed the
 * cell's own rows only; a placement's are listed beside them, unedited,
 * because the touchpoint's own editor is where they change.
 */
function CellResourcesEditor({
  cellId,
  client,
  resources: stored,
  touchpoints,
  frame,
}: {
  cellId: string
  client: SupabaseClient<Database>
  resources: CellResource[]
  touchpoints: readonly CellTouchpoint[]
  frame: string | null
}) {
  const fromPlacements = placementRows(stored)
  const inheritsAny = touchpointLogos(touchpoints).length > 0

  const save = async (rows: ResourceListDraft[]) => {
    await updateCellResources(
      client,
      cellId,
      stored,
      rows.map((row) => ({
        id: row.id ?? null,
        kind: row.kind === 'attachment' ? 'attachment' : 'link',
        name: row.name,
        url: row.url,
      })),
    )
  }

  const feature = async (resourceId: string, featured: boolean) => {
    await setFeaturedResource(client, { id: resourceId, placementId: null, cellId }, featured)
  }

  const setFeaturedImage = async (url: string) => {
    await setCellFeaturedImage(client, { cellId, imageUrl: url })
  }

  return (
    <ResourcesList
      cellId={cellId}
      resources={ownRows(stored)}
      empty={
        fromPlacements.length === 0 && !inheritsAny
          ? 'No resources linked to this cell yet.'
          : null
      }
      aside={
        <>
          {fromPlacements.length > 0 ? (
            // Listed, not edited: these rows belong to a touchpoint placed here,
            // and the touchpoint's own editor is where they change.
            <ul className="flex flex-col" aria-label="From this cell's touchpoints">
              {fromPlacements.map((resource) => (
                <li
                  key={resource.id ?? resource.url}
                  className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
                >
                  <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
                  <span className="min-w-0 truncate">{resource.name}</span>
                  <span className="shrink-0 text-xs opacity-70">
                    from a touchpoint
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <InheritedLogos
            touchpoints={touchpoints}
            frame={frame}
            onSetFeaturedImage={setFeaturedImage}
          />
        </>
      }
      onSave={save}
      onFeature={feature}
      frame={frame}
      onSetFeaturedImage={setFeaturedImage}
    />
  )
}
