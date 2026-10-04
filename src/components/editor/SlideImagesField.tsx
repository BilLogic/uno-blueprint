import { useRef, useState } from 'react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Button } from '@/components/ui/button'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useSliceBlueprint } from '@/hooks/useSliceBlueprint'
import {
  ALLOWED_ILLUSTRATION_TYPES,
  ILLUSTRATION_BUCKET,
  checkIllustrationFile,
  illustrationPath,
} from '@/lib/illustrationUpload'
import {
  replaceSlideImageSet,
  type SlideImageMemberInput,
} from '@/lib/sliceMutations'
import { servedUrl } from '@/lib/basePath'
import { isRenderableImageSrc } from '@/lib/sliceCells'
import { framesOfCitedCells, imagesThisSlideShows } from '@/lib/slideImages'
import { cn, errorMessage } from '@/lib/utils'
import type { Slide } from '@/types/database'

/**
 * Reindex members to a dense 0..n-1 sequence.
 *
 * @param {Array<{ cell_id: string | null; image_url: string | null }>} members
 * @returns {SlideImageMemberInput[]} Members with sequential positions.
 */
function withPositions(
  members: Array<{ cell_id: string | null; image_url: string | null }>,
): SlideImageMemberInput[] {
  return members.map((member, position) => ({
    position,
    cell_id: member.cell_id,
    image_url: member.image_url,
  }))
}

/**
 * The image set for one saved slide.
 *
 * Tiles are the cited cells' frames plus any `image_url` members already on
 * the row. The first tick or untick writes an explicit set
 * (`shows_all_images` false). Cell frames cannot be removed from the slide
 * here — only unticked. An upload joins the same set as an `image_url`
 * member and is the only tile that can be removed. This list is the slide's
 * images, not a step's frames across lanes.
 *
 * Only offered on a saved slide, because members are keyed by `slides.id`.
 */
export function SlideImagesField({
  sliceId,
  itemId,
  saved,
}: {
  sliceId: string
  /** `slides.id`. Absent means the slide has never been saved. */
  itemId: string | undefined
  /** The SAVED row, or null for a slide that has never been written. */
  saved: Slide | null
}) {
  const { client, canWrite } = useSupabase()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { blueprint, items } = useSliceBlueprint(sliceId)

  if (!client || !canWrite) return null
  if (!itemId) return null

  const slide = items.find((item) => item.id === itemId) ?? saved
  const citedFrames = framesOfCitedCells(blueprint, slide?.cell_ids ?? [])
  const shown = slide
    ? imagesThisSlideShows(blueprint, slide)
    : citedFrames.map(({ src, cellId }) => ({ src, cellId, imageUrl: null }))

  const urlMembers = [...(slide?.slide_images ?? [])]
    .filter((row) => row.image_url)
    .sort((left, right) => left.position - right.position)

  const showingAll = slide?.shows_all_images ?? true
  const selectedCellIds = showingAll
    ? new Set(shown.map((image) => image.cellId).filter((id): id is string => Boolean(id)))
    : new Set(
        (slide?.slide_images ?? [])
          .map((row) => row.cell_id)
          .filter((cellId): cellId is string => Boolean(cellId)),
      )
  const selectedUrls = showingAll
    ? new Set<string>()
    : new Set(
        (slide?.slide_images ?? [])
          .map((row) => row.image_url)
          .filter((url): url is string => Boolean(url)),
      )

  const siblings = shown
    .filter((image) => image.src.length > 0)
    .map((image) => ({ src: image.src, alt: '' }))

  /**
   * Persist an explicit image set. Every editor gesture leaves the slide
   * authored rather than returning it to the untouched default.
   */
  const writeExplicit = async (
    ordered: Array<{ cell_id: string | null; image_url: string | null }>,
  ) => {
    setBusy(true)
    setProblem(null)
    try {
      await replaceSlideImageSet(client, itemId, {
        showsAllImages: false,
        members: withPositions(ordered),
      })
    } catch (writeError) {
      console.error('[slide-images] write failed:', errorMessage(writeError))
      setProblem(errorMessage(writeError))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Current explicit members in display order, used as the base when toggling.
   */
  const explicitOrder = (): Array<{ cell_id: string | null; image_url: string | null }> => {
    if (!showingAll) {
      return [...(slide?.slide_images ?? [])]
        .sort((left, right) => left.position - right.position)
        .map((row) => ({ cell_id: row.cell_id, image_url: row.image_url }))
    }
    return shown.map((image) => ({
      cell_id: image.cellId,
      image_url: image.imageUrl,
    }))
  }

  const toggleCell = (cellId: string) => {
    const current = explicitOrder()
    const on = selectedCellIds.has(cellId)
    const next = on
      ? current.filter((member) => member.cell_id !== cellId)
      : [...current, { cell_id: cellId, image_url: null }]
    void writeExplicit(next)
  }

  const toggleUrl = (url: string) => {
    const current = explicitOrder()
    const on = selectedUrls.has(url)
    const next = on
      ? current.filter((member) => member.image_url !== url)
      : [...current, { cell_id: null, image_url: url }]
    void writeExplicit(next)
  }

  /**
   * Add an uploaded image as the next member. An untouched slide first
   * materialises its cited frames so the upload joins them rather than
   * replacing them.
   *
   * @param {string} url - Public URL of the uploaded object.
   */
  const joinUpload = async (url: string) => {
    await writeExplicit([...explicitOrder(), { cell_id: null, image_url: url }])
  }

  /**
   * Drop an upload from the set. The file is left in the bucket, matching
   * the helper: a copied slide can still point at it.
   *
   * @param {string} url - The `image_url` member to drop.
   */
  const removeUpload = (url: string) => {
    void writeExplicit(explicitOrder().filter((member) => member.image_url !== url))
  }

  const handleFile = async (file: File) => {
    const check = checkIllustrationFile(file)
    if (!check.ok) {
      setProblem(check.problem)
      return
    }

    setBusy(true)
    setProblem(null)
    let stage: 'upload' | 'row' = 'upload'
    try {
      const path = illustrationPath(sliceId, itemId, file.type)
      const upload = await client.storage
        .from(ILLUSTRATION_BUCKET)
        // A year: the path is unique per upload and never overwritten.
        .upload(path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' })
      if (upload.error) throw new Error(upload.error.message)

      const {
        data: { publicUrl },
      } = client.storage.from(ILLUSTRATION_BUCKET).getPublicUrl(path)
      if (!isRenderableImageSrc(publicUrl)) {
        throw new Error('That image URL cannot be shown.')
      }

      stage = 'row'
      await joinUpload(publicUrl)
    } catch (uploadError) {
      const message = errorMessage(uploadError)
      console.error(`[slide-images] ${stage} failed:`, message)
      if (stage === 'row') {
        setProblem(message)
      } else {
        setProblem(
          /mime|content type/i.test(message)
            ? 'Storage refused that format. Until the authoring migration runs, only PNG is accepted.'
            : 'That image could not be saved. The details are in the console.',
        )
      }
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>
          Images
        </Eyebrow>
        <span className="text-xs text-muted-foreground">
          {showingAll
            ? citedFrames.length > 0
              ? 'showing all cited frames'
              : 'no frames'
            : `showing ${selectedCellIds.size + selectedUrls.size}`}
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {citedFrames.map((frame) => {
          const on = selectedCellIds.has(frame.cellId)
          return (
            <div key={frame.cellId} className="relative w-16 shrink-0">
              <ZoomableImage
                src={frame.src}
                alt=""
                triggerLabel="Enlarge frame"
                siblings={siblings}
                siblingIndex={Math.max(
                  0,
                  siblings.findIndex((sibling) => sibling.src === frame.src),
                )}
                triggerClassName={cn(
                  'w-16 shrink-0 overflow-hidden rounded-md border',
                  on ? 'border-ring' : 'border-border opacity-45',
                )}
              >
                <img src={servedUrl(frame.src)} alt="" className="aspect-[4/3] w-full object-cover" />
              </ZoomableImage>
              <IconTooltip
                label={on ? 'Included in this slide’s images' : 'Add this frame to the slide'}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={on ? 'Untick this frame' : 'Tick this frame'}
                  onClick={() => toggleCell(frame.cellId)}
                  className={cn(
                    // geometry: the tick sits in a size-4 box; the rung's
                    // line box would overflow it.
                    'absolute right-0.5 bottom-0.5 size-4 rounded-md border bg-background/90 text-xs leading-none',
                    on ? 'border-ring' : 'border-border',
                  )}
                >
                  {on ? '✓' : ''}
                </button>
              </IconTooltip>
            </div>
          )
        })}

        {urlMembers.map((row) => {
          const src = row.image_url ?? ''
          if (!src) return null
          const on = selectedUrls.has(src)
          return (
            <div key={src} className="relative w-16 shrink-0">
              <ZoomableImage
                src={src}
                alt=""
                triggerLabel="Enlarge image"
                siblings={siblings}
                siblingIndex={Math.max(
                  0,
                  siblings.findIndex((sibling) => sibling.src === src),
                )}
                triggerClassName={cn(
                  'w-16 shrink-0 overflow-hidden rounded-md border',
                  on ? 'border-ring' : 'border-border opacity-45',
                )}
              >
                <img src={servedUrl(src)} alt="" className="aspect-[4/3] w-full object-cover" />
              </ZoomableImage>
              <IconTooltip
                label={on ? 'Included in this slide’s images' : 'Add this image to the slide'}
              >
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={on ? 'Untick this image' : 'Tick this image'}
                  onClick={() => toggleUrl(src)}
                  className={cn(
                    // geometry: the tick sits in a size-4 box; the rung's
                    // line box would overflow it.
                    'absolute right-0.5 bottom-0.5 size-4 rounded-md border bg-background/90 text-xs leading-none',
                    on ? 'border-ring' : 'border-border',
                  )}
                >
                  {on ? '✓' : ''}
                </button>
              </IconTooltip>
              <IconTooltip label="Remove this image from the slide">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={busy}
                  aria-label="Remove this image"
                  className="absolute top-0.5 right-0.5 size-4 bg-background/80 text-muted-foreground hover:text-destructive"
                  onClick={() => removeUpload(src)}
                >
                  <X className="size-2.5" aria-hidden />
                </Button>
              </IconTooltip>
            </div>
          )
        })}

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_ILLUSTRATION_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void handleFile(file)
          }}
        />
        <IconTooltip label="Upload an image for this slide">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            aria-label="Upload an image"
            className="aspect-[4/3] w-16 shrink-0 rounded-md border border-border border-dashed text-muted-foreground"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-3" aria-hidden />
            )}
          </Button>
        </IconTooltip>
      </div>

      <p className="text-xs text-muted-foreground">
        {showingAll
          ? citedFrames.length > 0
            ? 'The slide shows every cited cell’s frame, and will pick up newly cited cells.'
            : 'These cells carry no frames. The slide shows its title alone.'
          : selectedCellIds.size + selectedUrls.size === 0
            ? 'This slide shows no images.'
            : 'This slide shows exactly the images ticked here.'}
      </p>

      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}
