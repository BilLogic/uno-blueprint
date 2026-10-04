import { describe, expect, it } from 'vitest'
import { BRAND } from '@/config'
import {
  BRAND_ACCENT_DIAL,
  applyBrandAccent,
  brandAccentHue,
  type StyleTarget,
} from '@/lib/brandAccent'
import { chromaCeiling, contrast, dial, oklch, type Theme } from '@/lib/tokenModel'

/**
 * The reader for `brand.accent`, and the one thing this template needs it to
 * do: nothing.
 *
 * `BRAND` here carries no accent — the template's teal is said in its theme
 * files, not here — and `templateDefaultConfig` passes that
 * absence
 * straight through. The assertion below is what makes that provable rather
 * than argued: the dial the theme files declare is never written, so a
 * standalone build paints exactly what its stylesheet says. It is the guard on
 * `config.ts` too, since the day somebody fills `BRAND.accent` in for a
 * template that still ships grey, this fails and says so.
 *
 * The accents measured further down are arbitrary colours, not any
 * installation's own: what is asserted is the arithmetic and the write, and a
 * real brand's hex in a shared file would read as data rather than a fixture.
 */

/** A root element that only remembers what was set on it. */
function fakeRoot(): StyleTarget & { written: Record<string, string> } {
  const written: Record<string, string> = {}
  return {
    written,
    style: {
      setProperty: (property: string, value: string) => {
        written[property] = value
      },
    } as StyleTarget['style'],
  }
}

describe('applyBrandAccent', () => {
  it('writes nothing for this template, whether the brand is passed or defaulted', () => {
    expect(BRAND.accent).toBeUndefined()

    const defaulted = fakeRoot()
    expect(applyBrandAccent(defaulted)).toBeUndefined()
    expect(defaulted.written).toEqual({})

    // The shape `DeploymentConfigProvider` passes: a block built from the
    // resolved config, whose accent field is present and undefined.
    const passed = fakeRoot()
    expect(applyBrandAccent(passed, { accent: BRAND.accent })).toBeUndefined()
    expect(passed.written).toEqual({})
  })

  it('writes an accent onto the dial as its own hue', () => {
    const root = fakeRoot()
    expect(applyBrandAccent(root, { accent: '#2E8B57' })).toBe(154.9)
    expect(root.written).toEqual({ [BRAND_ACCENT_DIAL]: '154.9' })
  })

  it('reads a three-digit hex, and throws on one it cannot read', () => {
    expect(brandAccentHue('#3C9')).toBe(165.4)
    expect(() => brandAccentHue('seafoam')).toThrow(/not a hex colour/)
  })
})

/**
 * THE SEAM, SWEPT.
 *
 * Everything above is about the reader. This is about what the reader's output
 * reaches: `--primary` and the three colours `semantic.css` derives from it,
 * measured at every hue an accent can name rather than at the one this
 * template happens to ship.
 *
 * The distinction that makes the sweep worth running: the DIALS belong to a
 * deployment's own theme file, and the DERIVATIONS belong to this template.
 * `palette.test.ts` measures the derivations at the dials standing here, which
 * is the right question for the template's own chrome and the wrong one for an
 * adopter — this template ships one teal, and a wheel swept against its
 * dials would measure one fork's tuning thirty-six times. So the sweep supplies the chroma an adopter's own
 * theme file supplies, and asks whether the arithmetic in `semantic.css` holds
 * across the range of accents that arithmetic promises to serve.
 *
 * It promises in prose today. `brandAccent.ts` and `semantic.css` both state
 * the flip's worst case as a measured number; nothing had measured it since.
 */

/** Thirty-six accents around the wheel, entering through the reader. */
const WHEEL = Array.from({ length: 36 }, (_, step) => step * 10)

/**
 * A hex at a given hue, so the sweep goes in the way a deployment's does.
 *
 * Drawn at four fifths of the sRGB ceiling rather than at it: a fork should
 * dial chroma as a fraction of the ceiling, because a browser silently
 * chroma-reduces anything past it and the declared value becomes a lie.
 */
function accentAt(hue: number, lightness = 0.7): string {
  const rgb = oklch(lightness, chromaCeiling(lightness, hue) * 0.8, hue)
  const hex = rgb
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
  return `#${hex}`
}

/**
 * The four colours `semantic.css` derives from a fill, at the sRGB ceiling the
 * browser would map them to.
 *
 * Measuring the REQUESTED chroma instead would pass the suite on colours no
 * browser renders, which is the note `palette.test.ts` carries beside the same
 * arithmetic.
 */
function derivations(fillL: number, hue: number, theme: Theme) {
  const fillC = chromaCeiling(fillL, hue) * 0.8
  const ringL = dial('--ring-lightness', theme)
  const borderL = fillL - 0.12
  const surface = dial('--surface', theme)
  return {
    // --primary
    fill: oklch(fillL, fillC, hue),
    // --primary-foreground: the hard flip. The ×100 makes the clamp a step
    // function — a fill under L 0.62 takes the near-white ceiling, one above
    // takes the dark floor — and the trace of the fill's own chroma keeps a
    // branded fill's ink off flat grey.
    ink: oklch(
      Math.min(0.985, Math.max(0.205, (0.62 - fillL) * 100)),
      fillC * 0.08,
      hue,
    ),
    // --ring
    ring: oklch(ringL, Math.min(fillC * 1.3, chromaCeiling(ringL, hue)), hue),
    // --primary-border
    border: oklch(
      borderL,
      Math.min(fillC * 1.25, chromaCeiling(borderL, hue)),
      hue,
    ),
    // --background, on a theme that tints its surfaces with the brand.
    canvas: oklch(surface, 0.005 * 0.5, hue),
  }
}

/** The fills a branded deployment plausibly authors, either side of the flip. */
const BRANDED_LIGHTNESSES = [0.3, 0.45, 0.55, 0.6, 0.65, 0.75, 0.85]

describe('an accent this template has not authored', () => {
  it('round-trips every hue on the wheel through the reader', () => {
    // The reader rounds to the precision the theme files author at, so the
    // sweep's inputs are the values a stylesheet could actually carry — and a
    // hue that failed to survive the hex round trip would silently move every
    // measurement below onto a different colour. Compared on the wheel rather
    // than on the number line — 0° comes back as 359.8, which is the same
    // colour and a 359.8 difference — and to a degree rather than a tenth,
    // because a hex is eight bits a channel and cannot carry finer than that.
    for (const hue of WHEEL) {
      const round = brandAccentHue(accentAt(hue))
      const apart = Math.abs(((round - hue + 540) % 360) - 180)
      expect(apart, `${hue}° came back as ${round}°`).toBeLessThan(1)
    }
  })

  it.each(['light', 'dark'] as const)(
    'carries legible ink on its fill at every hue, in %s',
    (theme) => {
      // The claim `semantic.css` makes in prose: the flip holds above 3.43:1
      // across the whole accent range, which clears the 3:1 floor for a
      // control's own label at large text and fails 4.5:1 near the flip. A
      // fixed dark ink, the alternative that comment rejects, falls to 1.11:1
      // on a dark brand — black text on a black button, failing silently.
      for (const hue of WHEEL) {
        const accent = brandAccentHue(accentAt(hue))
        for (const fillL of BRANDED_LIGHTNESSES) {
          const { fill, ink } = derivations(fillL, accent, theme)
          expect(
            contrast(fill, ink),
            `ink on fill at ${hue}° L${fillL} ${theme}`,
          ).toBeGreaterThanOrEqual(3)
        }
      }
    },
  )

  it('is worst at the flip and recovers either side of it', () => {
    // Stated as the shape rather than as a pinned number, so a retune of the
    // 0.62 threshold moves this assertion with it instead of past it. The
    // measured floor is 3.44:1, a hair over the 3.43 the comment cites.
    const worst = (fillL: number) =>
      Math.min(
        ...WHEEL.map((hue) => {
          const { fill, ink } = derivations(fillL, brandAccentHue(accentAt(hue)), 'light')
          return contrast(fill, ink)
        }),
      )
    expect(worst(0.6)).toBeLessThan(worst(0.45))
    expect(worst(0.6)).toBeLessThan(worst(0.85))
    expect(worst(0.6)).toBeGreaterThan(3.43)
  })

  it.each(['light', 'dark'] as const)(
    'keeps the focus ring off the canvas at every hue, in %s',
    (theme) => {
      // SC 1.4.11: the ring is a non-text affordance, and a deployment that
      // tints its surfaces with its own brand puts the ring and the canvas on
      // ONE hue — the arrangement where a ring is likeliest to sink into it.
      for (const hue of WHEEL) {
        const accent = brandAccentHue(accentAt(hue))
        const { ring, canvas } = derivations(0.55, accent, theme)
        expect(
          contrast(ring, canvas),
          `ring on canvas at ${hue}° ${theme}`,
        ).toBeGreaterThanOrEqual(3)
      }
    },
  )

  it('keeps the hairline visible on the fill it edges, at every hue', () => {
    // The −0.12 lightness step carries the edge; the ×1.25 chroma is usually
    // mapped away. Swept over the mid-range only: at the extremes a −0.12 step
    // has no room left, which is why the template's own neutral fill is held
    // to a lower floor where it is measured.
    for (const hue of WHEEL) {
      const accent = brandAccentHue(accentAt(hue))
      for (const fillL of [0.45, 0.55, 0.65, 0.75]) {
        const { border, fill } = derivations(fillL, accent, 'light')
        expect(
          contrast(border, fill),
          `hairline on fill at ${hue}° L${fillL}`,
        ).toBeGreaterThan(1.2)
      }
    }
  })
})
