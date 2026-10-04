import { BRAND, type Brand } from '@/config'
import { hexToRgb, oklchFromSrgb } from '@/lib/oklch'

/**
 * The reader for `brand.accent`.
 *
 * The seam offered the field and nothing read it, which is worse than not
 * offering it: a deployment could set an accent and watch nothing happen. This
 * module closes that by writing the accent's own hue onto the root element as
 * `--hue` — the one dial `styles/themes/*.css` call "the single knob" — before
 * the first paint. An inline custom property on `documentElement` outranks
 * every stylesheet selector, so it wins under `:root`, under `.dark`, and
 * under the print override too.
 *
 * ── WHAT THE ACCENT ACTUALLY MOVES, AND WHY THAT DEPENDS ON THE STYLESHEET ──
 *
 * `--hue` feeds `--primary-hue` and `--surface-hue`, and from there the filled
 * control, its hairline, its ink, the focus ring, the sidebar selection chrome
 * derived from the ring, and — through the harmony pull in `semantic.css` —
 * the status hues, which lean a fraction of the way toward the brand.
 *
 * Every one of those except the last is multiplied by a CHROMA. The template's
 * own stylesheet ships the surfaces at `--chroma: 0` and the filled control at
 * a teal chroma, so against it an accent rotates the filled control, the
 * identity fill (which derives from it) and the ring onto the accent's hue at
 * the teal's lightness and chroma, while the canvas stays grey. It also moves
 * the statuses: warning, destructive and info rotate 15% of the distance from
 * `--brand-hue-reference`. A deployment whose stylesheet sets
 * `--primary-chroma: 0` gets only that status drift, with the brand still
 * grey.
 *
 * That is not a defect in this module, it is the contract the theme files
 * already state: "`--hue` must stay the OKLCH hue of that ramp". An accent is a
 * DIAL ON A RAMP, not a paint job, and rebranding is this field plus the ramp
 * beside it. A deployment that mounts this package imports the template's
 * `styles.css` and then layers its own theme file over it — its `--chroma`,
 * its `--primary-chroma`, and a `--brand-*` dial if its identity differs from
 * its action colour — and `brand.accent` is the hue all of that is drawn at.
 * Set the field alone and the only visible effect
 * is the status drift above, which is why this is said here and in
 * `deploymentConfig.ts` rather than left to be discovered.
 *
 * Only the HUE is taken. An accent's own lightness and chroma are deliberately
 * ignored: `--primary-lightness` and `--primary-chroma` are a tuning decision
 * the theme files own, not a brand fact, and reading them off a hex would
 * override tuning a deployment never asked to change.
 */

/** The dial an accent is read as. */
export const BRAND_ACCENT_DIAL = '--hue'

/**
 * The precision `themes/*.css` author the dial at, one decimal place. Rounding
 * to it is what makes reading an accent that already matches the sheet a
 * provable no-op rather than a sub-degree nudge.
 */
const DIAL_PRECISION = 10

/** The minimum of an element this module needs, so a test can pass a fake. */
export type StyleTarget = { style: Pick<CSSStyleDeclaration, 'setProperty'> }

/**
 * The `--hue` an accent implies.
 *
 * Throws on a value it cannot read. A deployment's accent is authored code that
 * the type-check and the suite both see before a browser does, so a malformed
 * hex is a bug to hear about rather than a field to quietly ignore — quietly
 * ignoring the field is the whole of what this module is about.
 */
export function brandAccentHue(accent: string): number {
  const [, , hue] = oklchFromSrgb(hexToRgb(accent))
  return Math.round(hue * DIAL_PRECISION) / DIAL_PRECISION
}

/**
 * Write a deployment's accent onto the root, and report the hue written.
 *
 * Returns `undefined` and writes nothing when the brand block sets no accent,
 * which leaves the theme files' own dial standing — the standalone template's
 * case, and the case of any deployment that brands through its stylesheet
 * alone.
 *
 * It takes the whole brand block rather than the accent string, so that "no
 * accent" is a block without the field. A defaulted `accent?: string`
 * parameter cannot express it: passing `undefined` explicitly would fall
 * through to the default and paint the template's own dial, which is the same
 * class of silently-wrong as the unread field this replaces.
 *
 * The BLOCK does default, to `BRAND` — the installation's own, from
 * `config.ts` — so a caller holding no config can ask for the accent this
 * build is branded on: a host's bootstrap, running before React exists, is the
 * case. That default is not the trap above, because it is reached only by
 * omitting the argument. A block that carries the field as `undefined` still
 * means no accent, and still writes nothing.
 */
export function applyBrandAccent(
  root: StyleTarget,
  brand: Brand = BRAND,
): number | undefined {
  if (brand.accent === undefined) return undefined
  const hue = brandAccentHue(brand.accent)
  root.style.setProperty(BRAND_ACCENT_DIAL, String(hue))
  return hue
}
