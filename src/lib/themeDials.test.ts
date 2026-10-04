import { describe, expect, it } from 'vitest'
import {
  declarations,
  declarationsIn,
  namesIn,
  resolveValue,
  winningDeclaration,
} from '@/lib/tokenModel'

/**
 * The dials, and the rule that keeps the two themes honest.
 *
 * `themes/light.css` declares its block on `:root, .light`, and `:root` matches
 * a root element carrying the dark class — which is where the theme provider
 * puts it. `:root` and `.dark` both carry specificity (0,1,0), and light
 * imports before dark, so a dial light declares and dark OMITS does not fall
 * back to a default further up: it silently becomes dark's value too, and dark
 * runs on a number no file of its own ever named.
 *
 * That is not a hypothetical. `--surface-hue` sat in exactly that state, with a
 * comment in `themes/dark.css` asserting the opposite, and every dark surface
 * rendered at light's warm grey until somebody resolved the cascade instead of
 * reading the comment. The comment is what made it invisible.
 *
 * The structural alternative — scoping light to `.light` alone — is not what
 * this template does: `index.html` ships no theme class, so the first paint
 * before the provider mounts would have no dials at all. Light stays the
 * `:root` default, and this file is what makes that safe: a dial light
 * declares is a dial dark declares.
 */

const LIGHT = 'themes/light.css'
const DARK = 'themes/dark.css'
const PRINT = 'print.css'

/**
 * Dials light may declare alone, because they are mode-invariant and reaching
 * dark through the leak is the intended behaviour rather than an accident.
 *
 * Empty on purpose, and not decoration: the assertion below re-derives every
 * listed name under both themes and fails if it is not actually invariant, so
 * a wrong exemption is caught rather than trusted. The template's own
 * invariant dials are on `AUTHORED_IN_BOTH` instead, which is what a
 * mode-invariant dial looks like once parity rather than a leak carries it.
 */
const MODE_INVARIANT_IN_LIGHT: string[] = []

/**
 * The dials this theme authors at one value for both modes.
 *
 * They are inputs, not derivations, so `semantic.css` is the wrong home for
 * them however invariant they are — that file is the derivation layer, and a
 * literal sitting in it is the only thing that would keep it from being
 * byte-identical in a deployment that adopts it.
 *
 * Both files, same value, is the mechanism and not merely tidiness. A
 * mode-invariant value written into `themes/light.css` alone reaches dark
 * through the bare `:root` at the head of that file's selector list — the
 * identical leak that ran every dark surface at light's warm grey, silently,
 * under a comment claiming otherwise. Written into both, there is nothing for
 * the leak to carry, and the assertions below make the two impossible to
 * drift apart.
 */
const AUTHORED_IN_BOTH = [
  '--radius',
  // The brand seam: the hue an adopter rebrands on, the surface tint it is
  // read against, and how much of that tint reaches a surface at all.
  '--hue',
  '--surface-hue',
  '--chroma',
  // No brand dial: the identity fill follows `--primary` channel by channel,
  // so it has no input of its own to author in either file. A fork that gives
  // the identity a colour authors the dial it sets in BOTH files for the
  // reason above, and adds it here.
]

/**
 * Dials that are per-theme on purpose, and therefore NOT on the list above.
 *
 * Listed rather than merely omitted, so that a dial dropped from
 * `AUTHORED_IN_BOTH` by accident does not look the same as one kept out of it
 * on purpose — and so the print override, which has to take a per-theme dial
 * back, has a roster to check.
 */
const AUTHORED_PER_THEME = [
  '--surface',
  '--contrast',
  '--foreground-lightness',
  '--primary-lightness',
  '--ring-lightness',
  '--role-edge-step',
  '--border-alpha-resting',
  '--border-alpha-hover',
  '--border-alpha-hot',
]

/** What one theme file declares a name as, or `ABSENT`. */
const valueIn = (file: string, name: string) =>
  declarationsIn(file).find((entry) => entry.name === name)?.value ?? 'ABSENT'

/**
 * Dials `print.css` need not restate.
 *
 * Every dial whose dark value differs from its light one has to be, because
 * print's block overrides `.dark` at the same scope and a dial it skips keeps
 * dark's value on white paper. Empty here, which is the answer that needs no
 * argument; the assertion states the property rather than the list, so a dial
 * that stops being invariant asks for its restatement on its own.
 */
const NOT_PRINTED: string[] = []

/**
 * Dials print restates at its own value, on purpose.
 *
 * Paper is not a screen: light's near-white surface leaves a raised plate
 * nowhere to go once it clips at the page, so print sits the canvas a shade
 * lower and shortens the elevation step to match. Listed rather than allowed
 * silently, so the next divergence has to be argued for.
 */
const PRINT_DIVERGES = ['--surface', '--elevation-step']

describe('theme dials', () => {
  it('reads both theme files', () => {
    // A selector or format change that broke the parser would otherwise make
    // every assertion below pass against an empty set.
    expect(declarationsIn(LIGHT).length).toBeGreaterThan(15)
    expect(declarationsIn(DARK).length).toBeGreaterThan(15)
  })

  it('declares in dark every dial it declares in light', () => {
    const leaked = [...namesIn(LIGHT)]
      .filter((name) => !namesIn(DARK).has(name))
      .filter((name) => !MODE_INVARIANT_IN_LIGHT.includes(name))
      .sort()
    expect(leaked).toEqual([])
  })

  it('holds each exemption to being genuinely mode-invariant', () => {
    for (const name of MODE_INVARIANT_IN_LIGHT) {
      expect(resolveValue(name, 'light')).toBe(resolveValue(name, 'dark'))
    }
  })

  it('backs every dark-only dial with a default outside the theme files', () => {
    // The other direction is safe — `.dark` does not match a light root — but
    // only if something declares the light value. `--field-alpha` is the live
    // case: it has a light value in `semantic.css` and is dug deeper in dark,
    // where the shallower one disappears on a dark plate.
    const darkOnly = [...namesIn(DARK)].filter(
      (name) => !namesIn(LIGHT).has(name),
    )
    /**
     * `@theme` is not a selector `winningDeclaration` treats as applying on
     * light, so elevation tokens declared in the plain theme block look
     * absent there. They still have a light default — the theme file.
     */
    const homes = darkOnly.map((name) => {
      const winning = winningDeclaration(name, 'light')?.file
      const inTheme = declarationsIn('theme.css').some(
        (entry) => entry.name === name,
      )
      const file = winning ?? (inTheme ? 'theme.css' : 'NOTHING')
      return `${name} <- ${file}`
    })
    const allowed = new Set(['semantic.css', 'theme.css'])
    const missing = homes.filter((home) => {
      const file = home.split(' <- ')[1]
      return !file || !allowed.has(file)
    })
    expect(missing).toEqual([])
  })

  it('declares every mode-invariant dial in both theme files, at one value', () => {
    const absent = AUTHORED_IN_BOTH.filter(
      (name) => valueIn(LIGHT, name) === 'ABSENT',
    )
    expect(absent).toEqual([])
    // Compared as a whole list rather than dial by dial so a failure names the
    // one that drifted, and without pinning the numbers — a rebrand is allowed
    // to move them, together.
    const declared = AUTHORED_IN_BOTH.map(
      (name) => `${name}: ${valueIn(LIGHT, name)} / ${valueIn(DARK, name)}`,
    )
    expect(declared).toEqual(
      AUTHORED_IN_BOTH.map(
        (name) => `${name}: ${valueIn(LIGHT, name)} / ${valueIn(LIGHT, name)}`,
      ),
    )
  })

  it('holds each per-theme dial to actually differing between the two', () => {
    // The mirror of the exemption check above. A dial listed here that both
    // themes answer identically belongs on `AUTHORED_IN_BOTH` instead, and
    // `print.css` would then be restating a value it has no reason to.
    for (const name of AUTHORED_PER_THEME) {
      expect(valueIn(LIGHT, name), name).not.toBe('ABSENT')
      expect(valueIn(DARK, name), name).not.toBe('ABSENT')
      expect(resolveValue(name, 'light'), name).not.toBe(
        resolveValue(name, 'dark'),
      )
    }
  })

  it('declares the mode-invariant dials nowhere else', () => {
    // A copy left behind in `semantic.css` would be unreachable rather than a
    // fallback: light's block opens on `:root` and imports after it. And
    // `print.css` must not restate them either — print exists to override a
    // dark value with the light one, and there is no dark value here to
    // override.
    const strays = declarations()
      .filter((entry) => AUTHORED_IN_BOTH.includes(entry.name))
      .filter((entry) => entry.file !== LIGHT && entry.file !== DARK)
      .map((entry) => `${entry.file}:${entry.line} ${entry.name}`)
    expect(strays).toEqual([])
  })
})

describe('the print override', () => {
  /*
    `print.css` forces the light dials under `@media print` so a dark-mode page
    still prints dark-on-white. Its own header says it must restate the full
    dial set the light theme declares — and the first version did not, so a
    status badge printed from dark mode drew its tint at dark's near-black.

    The ramps in `colors.css` do not need this, because their dark block is
    already scoped to `@media screen`. The theme files' dials are not.
  */
  it('restates every dial whose dark value differs from its light one', () => {
    const missing = [...namesIn(LIGHT)]
      .filter((name) => !namesIn(PRINT).has(name))
      .filter((name) => !NOT_PRINTED.includes(name))
      // A dial both themes declare identically has nothing for print to
      // override: whichever theme is on the root, the value on paper is
      // already light's. Stated as the property rather than as a growing
      // exemption list, so the day one of them stops being invariant this asks
      // for the restatement on its own.
      .filter(
        (name) => resolveValue(name, 'light') !== resolveValue(name, 'dark'),
      )
      .sort()
    expect(missing).toEqual([])
  })

  it("restates them at the light theme's own values", () => {
    const light = new Map(
      declarationsIn(LIGHT).map((entry) => [entry.name, entry.value]),
    )
    const drifted = declarationsIn(PRINT)
      .filter((entry) => light.has(entry.name))
      .filter((entry) => !PRINT_DIVERGES.includes(entry.name))
      .filter((entry) => entry.value !== light.get(entry.name))
      .map(
        (entry) =>
          `${entry.name}: ${entry.value} (light: ${light.get(entry.name)})`,
      )
    expect(drifted).toEqual([])
  })
})

describe('what the dials resolve to', () => {
  // The assertion that would have caught the surface-hue defect: what the
  // cascade actually produces at the root, not what a declaration says in
  // isolation.

  it('runs both themes on one brand hue', () => {
    expect(resolveValue('--hue', 'dark')).toBe(resolveValue('--hue', 'light'))
  })

  it('runs both themes on one surface tint', () => {
    // The dial that spent months answering light's warm grey in dark, under a
    // comment in `themes/dark.css` claiming it answered the brand hue. It is
    // invariant here because `--chroma` is 0 and every surface is an exact
    // grey whatever the hue says; a fork that tints its surfaces turns both.
    expect(resolveValue('--surface-hue', 'dark')).toBe(
      resolveValue('--surface-hue', 'light'),
    )
    expect(winningDeclaration('--surface-hue', 'dark')?.file).toBe(DARK)
  })

  it('leaves no root declaration that cannot win under either theme', () => {
    /*
      The combination a dial's home cannot be: declared in a shared root block
      AND in both theme files.

      `themes/light.css` opens on `:root, .light` and imports after the shared
      blocks, so for any name both themes declare, the shared declaration loses
      under light (to light) and under dark (to dark). It is not a fallback;
      nothing can ever read it. `--surface-hue` sat on a shared root block in
      exactly that state, saying the thing `themes/dark.css` only claimed in a
      comment — and the fix that corrected the comment left the declaration
      behind it standing, which was the same claim in a different font.

      Stated over every root-scoped declaration in the sheet tree rather than
      over a list of dial names, because the shape is not specific to dials and
      a list would sample where the property already holds.
    */
    const ROOT_SELECTORS = new Set([
      ':root',
      '.light',
      '.dark',
      ':root.light',
      ':root.dark',
      'html.light',
      'html.dark',
    ])
    const unreachable = declarations()
      .filter((entry) =>
        entry.selector
          .split(',')
          .some((part) => ROOT_SELECTORS.has(part.trim())),
      )
      // `print.css` is a separate cascade; the block above holds it.
      .filter(
        (entry) =>
          !entry.context.some(
            (rule) => /^@media\b/.test(rule) && /\bprint\b/.test(rule),
          ),
      )
      .filter(
        (entry) =>
          !entry.context.some(
            (rule) => rule && !/^@(media|supports|layer)\b/.test(rule),
          ),
      )
      .filter(
        (entry) =>
          winningDeclaration(entry.name, 'light') !== entry &&
          winningDeclaration(entry.name, 'dark') !== entry,
      )
      .map((entry) => `${entry.file}:${entry.line} ${entry.name}`)
    expect(unreachable).toEqual([])
  })

  it('carries the radius dial into dark by parity, not by the `:root` leak', () => {
    // A corner does not flip with the theme, so `--radius` is the same value in
    // both files — and writing it in both is exactly what makes that safe.
    // Written in `themes/light.css` alone it would still reach dark, through
    // the bare `:root` at the head of that file's selector list; dark would be
    // running a value it never declared, which is the shape the surface-hue
    // defect had.
    expect(namesIn(LIGHT).has('--radius')).toBe(true)
    expect(namesIn(DARK).has('--radius')).toBe(true)
    expect(winningDeclaration('--radius', 'light')?.file).toBe(LIGHT)
    expect(winningDeclaration('--radius', 'dark')?.file).toBe(DARK)
    expect(resolveValue('--radius', 'dark')).toBe(
      resolveValue('--radius', 'light'),
    )
  })
})
