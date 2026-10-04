import { describe, expect, it } from 'vitest'
import { sourceOf } from '@/lib/sourceTree'

const field = sourceOf('components/editor/SlideImagesField.tsx')

const presentation = sourceOf('components/editor/SlicePresentation.tsx')

describe('a slide shows a set of images', () => {
  it('labels the row Images, never Strip', () => {
    expect(field).toContain('Images\n')
    expect(field).not.toMatch(/\bStrip\b/)
  })

  it('sizes tiles as w-16 shrink-0', () => {
    expect(field).toContain('w-16 shrink-0')
  })

  it('ticks and unticks rather than choosing one member', () => {
    expect(field).toContain('aria-pressed={on}')
    expect(field).toContain('toggleCell(')
  })

  it('expands via ZoomableImage with siblings', () => {
    expect(field).toContain('ZoomableImage')
    expect(field).toContain('siblings={siblings}')
  })

  it('does not offer remove on cell frames', () => {
    expect(field).toContain('Remove this image')
    expect(field).not.toContain('Remove this frame')
  })

  it('lets an upload join the set on a unique path', () => {
    expect(field).toContain('joinUpload(publicUrl)')
    expect(field).toContain('illustrationPath(sliceId, itemId, file.type)')
    expect(field).toContain('upsert: false')
    expect(field).toContain("cacheControl: '31536000'")
    expect(field).toContain('isRenderableImageSrc(publicUrl)')
  })

  it('never truncates presentation at 3', () => {
    expect(presentation).toContain('imagesThisSlideShows')
    expect(presentation).not.toContain('.slice(0, 3)')
  })

  it('ticks from the same resolver the untouched view uses', () => {
    expect(field).toContain('framesOfCitedCells')
    expect(field).toContain('imagesThisSlideShows')
  })
})

const mutations = sourceOf('lib/sliceMutations.ts')

describe('replacing slides keeps the authored image set', () => {
  it('carries members from the prior row instead of forcing untouched', () => {
    expect(mutations).toContain('imageSetCarriedOntoReplacedSlide')
    expect(mutations).not.toMatch(/shows_all_images:\s*true/)
  })

  it('leaves uploads of dropped slides, because the inverse still names them', () => {
    const start = mutations.indexOf('export async function replaceSlides')
    const end = mutations.indexOf('export async function duplicateSlice')
    const replaceFn = mutations.slice(start, end)
    expect(replaceFn).toContain('.insert(planned.map')
    expect(replaceFn).not.toContain('removeSlideUploadObjects')
  })
})

const revert = sourceOf('lib/revertChange.ts')

describe('restoring slides keeps captured upload URLs', () => {
  it('writes image_url verbatim and only deletes folders the inverse does not restore', () => {
    const restoreFn = revert.slice(revert.indexOf("case 'restore_slides'"))
    expect(restoreFn).toContain('image_url: member.image_url ?? null')
    expect(restoreFn).toContain('image_url: member.image_url')
    const droppedAt = restoreFn.indexOf('for (const slide of dropped)')
    const storageAt = restoreFn.indexOf('removeSlideUploadObjects')
    expect(droppedAt).toBeGreaterThan(-1)
    expect(storageAt).toBeGreaterThan(droppedAt)
  })
})
