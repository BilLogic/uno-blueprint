import { describe, expect, it } from 'vitest'
import { BLUEPRINT_THEME } from '@/lib/blueprintTheme'
import {
  BLUEPRINT_LANE_ROLES,
  CELL_STEP,
  TOUCHPOINT_TONES,
} from '@/lib/blueprintCellStyle'
import { FOCUS_DIM_HOVER_OPACITY, FOCUS_DIM_OPACITY } from '@/lib/canvasFocusDim'
import { sourceOf as source } from '@/lib/sourceTree'
import {
  PATH_IDENTITY_PERIOD,
  PATH_KIND_COLORS,
  getPathColor,
  getPathDashArray,
} from '@/lib/pathColorTheme'
import {
  chromaCeiling,
  classUsesMatching,
  contrast,
  derivedFillInk,
  dial,
  inSrgbGamut,
  oklch,
  oklchFromSrgb,
  oklchToLinearSrgb,
  palette,
  resolveColor,
  resolveColorValue,
  consumersOf,
  declarations,
  rulesDeclaring,
  sourceDeclarations,
  resolvePaletteToken,
  resolveValue,
  stylesheet,
  type Rgb,
} from '@/lib/tokenModel'

/**
 * The app resolves every colour through `var()`, so nothing in the browser can
 * be measured from here. This suite resolves the same tokens against the
 * stylesheets and measures the pairs the interface actually renders.
 *
 * It replaces a runtime contrast solver that computed ring lightness per cell.
 * The solver only ever saw light mode — it took a hex fill, and dark mode never
 * produced one. Reading the stylesheet checks both themes, which is the part
 * that was missing rather than the part that was expensive.
 *
 * The colour maths, the ramps and the cascade all come from `tokenModel` now.
 * This file used to carry its own resolver — HSL and OKLCH conversions, a
 * `colors.css` reader, a contrast solver, and a dial reader that took the
 * first `--name:` match in one theme file. That last one is the shape retired
 * by the decision that one token model is the single style seam: it could tell
 * you what a file said and never what the cascade produced, which is a
 * different number wherever more than one rule declares a name. The maths
 * below is unchanged; the reader is shared, so widening it widens every rule
 * at once.
 */
const THEMES = { light: palette('light'), dark: palette('dark') }

/** Resolve a `var(--color-family-step)` string against one theme. */
const resolve = resolvePaletteToken

describe('palette', () => {
  it.each(['light', 'dark'] as const)('%s scale parsed', (theme) => {
    // A format change that broke the regex would otherwise make every
    // assertion below pass against an empty map.
    expect(THEMES[theme].size).toBeGreaterThan(180)
  })
})

describe('brand fill', () => {
  /*
   * `--primary` and everything derived from it are authored in OKLCH against
   * the per-theme dials — NOT off the HSL ramps — so this block resolves the
   * declarations on disk and measures what they compute to.
   *
   * Most of what is asserted here is the DERIVATION rather than a particular
   * colour: a fork moves the dials off the template's teal and these same
   * assertions become the guard that its brand fill is still legible. The
   * gamut-headroom one holds at chroma 0 as well, for a fork that turns the
   * accent off.
   */
  const semantic = stylesheet('semantic.css').text

  /*
   * The seam itself: `--primary` is still the three dials and nothing else.
   *
   * Asserted as a SHAPE rather than a value, because the value is what a fork
   * is invited to change. If someone replaces the derivation with a literal,
   * every dial below stops driving anything and the assertions in this block
   * would go on passing against numbers nothing reads.
   */
  it('is still derived from the per-theme dials', () => {
    expect(semantic).toMatch(
      /--primary:\s*oklch\(\s*var\(--primary-lightness\)\s+var\(--primary-chroma\)\s+var\(--primary-hue\)\s*\)/,
    )
  })

  /*
   * The identity seam, held as a shape for the same reason and against a
   * sharper failure. Every brand measurement below reads a colour that is
   * currently identical to `--primary`, so a literal pasted over this
   * derivation — the resolved value of the day, frozen — would satisfy all of
   * them and stop tracking the accent, which is the one thing the derivation
   * is for. The three `var(--brand-*, …)` fallbacks are what make a dial
   * optional, so they are part of the shape rather than detail.
   */
  it('derives the identity fill from the resolved accent, one dial per channel', () => {
    expect(semantic).toMatch(
      /--brand:\s*oklch\(\s*from\s+var\(--primary\)\s+var\(--brand-lightness,\s*l\)\s+var\(--brand-chroma,\s*c\)\s+var\(--brand-hue,\s*h\)\s*\)/,
    )
  })

  /*
   * Every number below comes through the cascade, not off a page.
   *
   * `dial()` asks what wins at the root under a theme, which is a different
   * question from what one file says — and the difference is not academic
   * here. `print.css` declares `--hue`, `--surface` and eleven more dials
   * inside `@media print`, and `themes/light.css` declares most of them under
   * a bare `:root` that matches under dark as well. A reader that took the
   * first match in a file would answer both cases wrong.
   */
  const HUE = dial('--hue', 'light')

  const THEME_DIALS = {
    light: {
      L: dial('--primary-lightness', 'light'),
      C: dial('--primary-chroma', 'light'),
      ringL: dial('--ring-lightness', 'light'),
      surface: dial('--surface', 'light'),
      surfaceHue: dial('--surface-hue', 'light'),
    },
    dark: {
      L: dial('--primary-lightness', 'dark'),
      C: dial('--primary-chroma', 'dark'),
      ringL: dial('--ring-lightness', 'dark'),
      surface: dial('--surface', 'dark'),
      surfaceHue: dial('--surface-hue', 'dark'),
    },
  } as const

  it('runs both themes on one brand hue', () => {
    // A hue that differs between themes is a brand that changes when the
    // lights go out. The dial is mode-invariant by design and both theme
    // files say so in a comment; this is the part that holds them to it.
    expect(dial('--hue', 'dark')).toBe(HUE)
  })

  it('wears one identity in both themes, whatever a fork dials it to', () => {
    /*
     * This used to read `expect(THEME_DIALS.light.C).toBe(0)` four times over,
     * and its own comment conceded the point: "the one assertion that is about
     * the TEMPLATE rather than the mechanism … a fork updates this expectation
     * deliberately". An assertion a fork must edit is an assertion that does
     * not travel, and the greyscale seam is already stated where it belongs —
     * in `themes/light.css`, beside the dials themselves.
     *
     * What replaces it is the claim the number was standing in for. A brand
     * that changes saturation when the lights go out is two brands, exactly as
     * a brand that changes hue is — and the hue half of that is asserted
     * directly above. Held as a relation, it is true of a neutral fork (0 and
     * 0) and of a branded one alike, and it fails for the thing either of
     * them would get wrong.
     *
     * The brand half is now asked of the RESOLVED colour, because brand has no
     * dials of its own to compare: it reads whatever `--primary` computed to,
     * through three fallbacks. Same claim, one level down — a hue that moves
     * when the lights go out is two brands either way, and a fork that sets
     * `--brand-hue` in one theme file and forgets the other lands here.
     * LIGHTNESS is deliberately absent from this pair: a fill has to sit where
     * its canvas lets it read, and the two canvases are a long way apart.
     *
     * CHROMA is held as presence rather than equality. The template's teal is
     * the site's pair, `#00806a` and `#3ecfb0`, and the dark one is the more
     * saturated of the two — a lighter fill on a charcoal canvas carries more
     * chroma before it reads as louder, and sRGB has more room for it there.
     * Equality would force one of the two off the site's colour. What is
     * still two brands is a mode that drops to grey while the other wears a
     * colour, and that is the first thing this holds.
     *
     * The second is the half equality used to catch for free: a fork that
     * sets `--brand-chroma` in one theme file and forgets the other. Brand's
     * chroma either follows the accent's in both modes or leaves it in both;
     * following in one and leaving in the other is the forgotten file.
     */
    expect(THEME_DIALS.dark.C === 0).toBe(THEME_DIALS.light.C === 0)
    const brand = {
      light: resolveColorValue('--brand', 'light'),
      dark: resolveColorValue('--brand', 'dark'),
    }
    const primary = {
      light: resolveColorValue('--primary', 'light'),
      dark: resolveColorValue('--primary', 'dark'),
    }
    expect(brand.dark.c === 0).toBe(brand.light.c === 0)
    const follows = (theme: 'light' | 'dark') =>
      Math.abs(brand[theme].c - primary[theme].c) < 1e-9
    expect(follows('dark')).toBe(follows('light'))
    expect(brand.dark.h).toBeCloseTo(brand.light.h, 6)
  })

  it('declares every chroma dial in both theme files, so none arrives by leak', () => {
    /*
     * The other half of "a brand should never arrive by accident", and the
     * half that is actually a mechanism: `themes/light.css` declares most of
     * its dials under a bare `:root`, which matches under dark as well. A dial
     * written in one file and not the other is inherited by the other mode
     * rather than chosen for it — and `light.css` says so in as many words
     * beside `--surface-hue`: a dial that arrives in the other mode by leak
     * reads the same as one that arrived by mistake.
     *
     * `--chroma` is on this list but NOT on the mode-invariance one above. It
     * tints the canvas rather than the identity, and a dark theme that wants a
     * breath of colour in its greys where the light one wants none is a real
     * choice rather than a drift — it just has to be a written one.
     */
    const themes = {
      light: stylesheet('themes/light.css').text,
      dark: stylesheet('themes/dark.css').text,
    }
    for (const name of ['--chroma', '--primary-chroma']) {
      for (const [theme, text] of Object.entries(themes)) {
        expect(`${theme} declares ${name}`).toBe(
          new RegExp(`^\\s*${name}:`, 'm').test(text)
            ? `${theme} declares ${name}`
            : `${theme} inherits ${name}`,
        )
      }
    }
  })

  it('declares no brand dial anywhere, because a stray one wins in silence', () => {
    /*
     * The failure mode of the whole derivation, and the one it has.
     * `var(--brand-lightness, l)` reaches its fallback only while NOTHING
     * declares that dial, so one leftover declaration takes the channel back
     * off `--primary` with no error, no failed build and nothing on screen to
     * say which line did it. The absence is the mechanism, so the absence is
     * what is held.
     *
     * WHICH declarations can do it is narrower than 'anywhere', and worth
     * stating because the wrong model here would make this rule feel stricter
     * than it is. Substitution happens where `--brand` is declared — the
     * root, and the scopes semantic.css re-derives at — so what reinstates
     * the grey is a declaration that reaches one of those, or a write onto the
     * root element. A dial declared on a descendant's own block changes what
     * that subtree's own `--brand` would resolve to and nothing else, because
     * a custom property is substituted at the element that declares the one
     * reading it, not at the element that inherits the result.
     *
     * BOTH SIDES OF THE SEAM, and this is the half a stylesheet-only rule
     * cannot see. An inline custom property on `documentElement` outranks
     * every stylesheet selector there is, and `lib/brandAccent.ts` writes a
     * dial by exactly that route for `--hue`, so the same three lines of code
     * pointed at a brand dial would beat every declaration in `src/styles`
     * while a CSS-only guard reported nothing. `[--brand-lightness:0.5]` in a
     * class string is the same fact written in Tailwind. The model already
     * unions the two — a stylesheet declaration and a TypeScript one are the
     * same fact to a consumer — so this reads the union and reports each half
     * in its own terms.
     *
     * A deployment separating its identity from the action fill is exactly who
     * will trip this, and it is meant to: the dial belongs in a fork's own
     * theme block, and a fork that sets one updates this list deliberately.
     */
    const dials = ['--brand-lightness', '--brand-chroma', '--brand-hue']
    const declared = [
      ...declarations()
        .filter((entry) => dials.includes(entry.name))
        .map(
          (entry) =>
            `${entry.file}:${entry.line}: ${entry.selector} { ${entry.name} }`,
        ),
      ...sourceDeclarations()
        .filter((entry) => dials.includes(entry.name))
        .map((entry) => `${entry.file}:${entry.line}: ${entry.name} (${entry.via})`),
    ]
    expect(declared).toEqual([])
  })

  it('puts the fill on the far side of the canvas in each theme', () => {
    // Darker than the light canvas and lighter than the dark one. At chroma 0
    // that is the only thing separating fill from canvas, so a neutral fork
    // has to flip with the theme or the fill vanishes; the teal does it too,
    // which is what keeps it reading as a fill rather than a tint.
    expect(THEME_DIALS.light.L).toBeLessThan(THEME_DIALS.light.surface)
    expect(THEME_DIALS.dark.L).toBeGreaterThan(THEME_DIALS.dark.surface)
  })

  it.each(['light', 'dark'] as const)(
    'puts the filled control and the identity on one hue: %s',
    (theme) => {
      // A filled control on a different brand from every other surface in the
      // app is the failure this guards. It used to be asked of a `--brand-*`
      // ramp of HSL literals sitting beside the dial, converted and compared;
      // the ramp is gone, because a stepped family is named for a hue and
      // never for a role, so the question is now asked of the two fills
      // themselves. They agree by construction — both read `--hue` — and this
      // is what holds them to it if one of them is ever given a hue of its
      // own.
      expect(resolveColorValue('--primary', theme).h).toBe(HUE)
      expect(resolveColorValue('--brand', theme).h).toBe(HUE)
    },
  )

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    const { L, C, ringL, surface, surfaceHue } = THEME_DIALS[theme]
    const fill = oklch(L, C, HUE)
    const canvas = oklch(surface, 0, surfaceHue)

    it('resolves to the triple its dials describe', () => {
      // The cascade's own answer, not a restatement of the dials: this is what
      // `--primary` computes to at the root under this theme, and it is the
      // value every measurement below is really about.
      const resolved = resolveValue('--primary', theme)
      expect(resolved).toBe(`oklch( ${L} ${C} ${HUE} )`)
    })

    it('leaves the fill itself un-gamut-mapped', () => {
      // Headroom is why a fork should set chroma as a fraction of the ceiling
      // rather than at it: the browser silently chroma-reduces anything past
      // it, which makes the declared value a lie and freezes the next retune.
      expect(C).toBeLessThan(chromaCeiling(L, HUE) + Number.EPSILON)
      expect(inSrgbGamut(oklchToLinearSrgb(L, C, HUE))).toBe(true)
    })

    it('keeps the identity fill inside sRGB at its own lightness', () => {
      /*
       * The same headroom claim as the fill above, moved off the two deleted
       * dials and onto what `--brand` resolves to. That is where it has to
       * live now — and it is where it bites hardest, because the numbers it
       * reads are exactly the ones a fork changes: set `--brand-chroma` past
       * the ceiling for the lightness brand inherits and the browser
       * chroma-reduces it silently, which makes the declared dial a lie.
       * Unbranded this measures `--primary` twice over, which costs nothing.
       */
      const { l, c, h } = resolveColorValue('--brand', theme)
      expect(c).toBeLessThan(chromaCeiling(l, h) + Number.EPSILON)
      expect(inSrgbGamut(oklchToLinearSrgb(l, c, h))).toBe(true)
    })

    it('keeps the focus ring legible on the canvas', () => {
      // SC 1.4.11. --ring: oklch(from --primary var(--ring-lightness) c*1.3 h).
      // Measure the GAMUT-MAPPED value: c*1.3 can sit over the ceiling once a
      // fork raises the chroma, and this would otherwise pass on a colour no
      // browser draws.
      const ring = oklch(
        ringL,
        Math.min(C * 1.3, chromaCeiling(ringL, HUE)),
        HUE,
      )
      expect(contrast(ring, canvas)).toBeGreaterThanOrEqual(3)
    })

    it('keeps the button hairline distinct from the fill it edges', () => {
      // --primary-border: oklch(from --primary calc(l - 0.12) calc(c*1.25) h).
      // The ×1.25 is often gamut-mapped away, so the edge is carried by the
      // lightness step alone — which means the lightness step has to hold.
      const borderL = L - 0.12
      const border = oklch(
        borderL,
        Math.min(C * 1.25, chromaCeiling(borderL, HUE)),
        HUE,
      )
      // 1.1, not the 1.4 a mid-lightness brand fill can hold: a NEUTRAL
      // fork's fill sits near the end of the lightness range (0.205 light /
      // 0.922 dark), where a −0.12 step has little room left and no chroma to
      // help. The floor is here to catch the edge disappearing entirely, not
      // to demand a separation a neutral fill cannot physically produce.
      expect(contrast(border, fill)).toBeGreaterThan(1.1)
    })
  })
})

/**
 * THE TWO NEUTRAL EDGE TOKENS, HELD APART.
 *
 * `--border` and `--input` are the same formula off `--foreground` at two
 * strengths — 2% + 20% of the contrast dial against 3% + 38% — and the whole
 * value of having two is that a component can ask for the louder one. A badge
 * is where that shows: a tag at 20px carries its edge over its own fill with
 * nothing else to separate it from the chrome, and in light the card it paints
 * and the nav behind it resolve to the same colour, so the edge is the only
 * boundary there is.
 *
 * Which is why the resting `Badge` variant draws `--input` and not the
 * `outline` variant's `--border`. Stated as a COMPARISON rather than two
 * floors, because the failure worth catching is the pair converging: raising
 * `--border` to make a quiet edge visible somewhere would move every quiet
 * edge in the app and silently take the badge's distinctness with it.
 *
 * Measured against `--card`, the surface a badge on this variant paints, and
 * composited because both tokens are translucent — an alpha measured against
 * nothing is a number with no ground under it.
 */
describe('neutral control edges', () => {
  it.each(['light', 'dark'] as const)(
    'draws the control edge louder than the quiet edge in %s',
    (theme) => {
      const card = resolveColor('--card', theme, {
        over: resolveColor('--sidebar', theme),
      })
      const control = contrast(
        resolveColor('--input', theme, { over: card }),
        card,
      )
      const quiet = contrast(
        resolveColor('--border', theme, { over: card }),
        card,
      )

      // A floor as well as the comparison: the comparison alone would still
      // hold if both edges faded together.
      expect(control).toBeGreaterThan(1.3)
      expect(control).toBeGreaterThan(quiet)
    },
  )
})

/**
 * THE OVERVIEW CONTAINER, PINNED TO THE LOOK ITS OWNER CHOSE.
 *
 * The overview nests four layers deep — the viewport ground, the phase frame,
 * a scenario panel on that frame, and the blueprint drawn inside the panel —
 * plus the chrome that reads against them: the frame's and the panel's edges,
 * the label rail, and the two title badges.
 *
 * Deriving those from the elevation ladder was tried and rejected. The
 * arrangement it produced — a frame with no fill in light, panels at card
 * white, every hover one rung out — is a coherent ladder and a worse board,
 * and the owner judged the earlier default, hover and pressed states the best
 * this container has had. So the ladder is not the contract here; that
 * specific look is, and this is where it is written down. A change of mind is
 * a change to this table, not a rule quietly drifting off the look.
 *
 * Resolved through the cascade, not compared as strings, and BOTH sides of
 * every assertion resolve: the expected value is the primitive itself read
 * under the same theme, so retuning a step in `colors.css` moves the pin with
 * the board instead of failing a rule that only ever held a literal. The
 * primitives carry the theme themselves, which is why one declaration covers
 * light and dark and why this block asks the same questions of each.
 */
/**
 * The one `--name` a declaration's or a composed value's `var()` references.
 *
 * Every input is a single-line value — one declaration from the stylesheet
 * model, or one string from `blueprintTheme.ts` — so the pattern is written
 * for one, and a value that arrives wrapped fails loudly here rather than
 * being tidied into a pass.
 */
const referenced = (value: string) => {
  const match = /^var\((--[a-zA-Z0-9-]+)\)$/.exec(value.trim())
  if (!match) throw new Error(`not a single var(): ${value}`)
  return match[1]
}

describe.each(['light', 'dark'] as const)(
  'the overview container: %s',
  (theme) => {
    /** Whitespace collapsed, so a selector reads the same however it wrapped. */
    const flat = (selector: string) => selector.replace(/\s+/g, ' ').trim()

    /**
     * The rule for exactly this selector and property, and the colour it
     * paints. Throws rather than returns nothing when the selector has been
     * renamed: an assertion about a rule that was not found is an assertion
     * about nothing.
     */
    const painted = (property: string, selector: string) => {
      const found = rulesDeclaring(property).filter(
        (rule) => flat(rule.selector) === flat(selector),
      )
      if (found.length !== 1)
        throw new Error(
          `expected one \`${property}\` rule for \`${flat(selector)}\`, found ${found.length}`,
        )
      return resolveColor(referenced(found[0].value), theme)
    }

    const PANEL = '[data-phase-scenario-panel]'
    const FRAME = '[data-canvas-phase-interactive] [data-phase-frame]'
    /** Pointer or keyboard on the panel itself — one rule, both arms. */
    const PANEL_ARMED = `${PANEL}:hover:not([data-canvas-focus-active]), ${PANEL}:focus-within:not([data-canvas-focus-active])`
    /** Pointer or keyboard on the phase band, with no scenario claiming it. */
    const band = (child: string) =>
      `[data-canvas-phase-interactive]:hover:not([data-canvas-focus-active]):not( :has(${PANEL}:hover) ) ${child}, [data-canvas-phase-interactive]:focus-within:not([data-canvas-focus-active]):not( :has(${PANEL}:focus-within) ) ${child}`

    /*
     * THE WHOLE VOCABULARY, AND THE PRIMITIVE EACH NAME IS PINNED TO.
     *
     * Every overview colour is a name now — four layers plus the chrome that
     * reads against them — so this table is the list of what a deployment may
     * retune, and the list of what may not move while it does not.
     */
    const OVERVIEW_NAMES: ReadonlyArray<readonly [string, string, string]> = [
      ['the viewport ground', '--background-blueprint-canvas-ground', '--color-gray-300'],
      ['the phase frame', '--background-blueprint-phase-frame', '--color-slate-700'],
      ['the phase frame armed', '--background-blueprint-phase-frame-hover', '--color-slate-800'],
      ['the phase frame edge', '--border-blueprint-phase-frame', '--color-slate-800'],
      ['the phase frame edge armed', '--border-blueprint-phase-frame-hover', '--color-slate-900'],
      ['the phase badge', '--background-blueprint-phase-badge', '--color-slate-800'],
      ['the phase badge armed', '--background-blueprint-phase-badge-hover', '--color-slate-900'],
      ['the phase badge edge', '--border-blueprint-phase-badge', '--color-slate-800'],
      ['the phase badge edge armed', '--border-blueprint-phase-badge-hover', '--color-slate-900'],
      ['the phase badge ink', '--text-blueprint-phase-badge', '--color-gray-1200'],
      ['the scenario panel', '--background-blueprint-scenario-panel', '--color-slate-500'],
      ['the scenario panel armed', '--background-blueprint-scenario-panel-hover', '--color-slate-600'],
      ['the scenario panel edge', '--border-blueprint-scenario-panel', '--color-slate-700'],
      ['the scenario panel edge armed', '--border-blueprint-scenario-panel-hover', '--color-slate-800'],
      ['the scenario badge', '--background-blueprint-scenario-badge', '--color-gray-800'],
      ['the scenario badge armed', '--background-blueprint-scenario-badge-hover', '--color-gray-900'],
      ['the scenario badge edge', '--border-blueprint-scenario-badge', '--color-gray-800'],
      ['the scenario badge edge armed', '--border-blueprint-scenario-badge-hover', '--color-gray-900'],
      ['the scenario badge ink', '--text-blueprint-scenario-badge', '--color-gray-1200'],
      ['the panel interior', '--background-blueprint-panel-interior', '--canvas'],
      ['the panel interior armed', '--background-blueprint-panel-interior-hover', '--color-slate-300'],
      ['the label rail', '--background-blueprint-label-rail', '--color-slate-500'],
      ['the label rail armed', '--background-blueprint-label-rail-hover', '--color-slate-600'],
      ['the divider band', '--background-blueprint-divider-band', '--color-slate-500'],
      ['the divider band armed', '--background-blueprint-divider-band-hover', '--color-slate-600'],
      ['the panel interior edge', '--border-blueprint-panel-interior', '--color-slate-700'],
      ['the lane divider', '--border-blueprint-lane-divider', '--color-slate-700'],
      ['the phase divider', '--border-blueprint-phase-divider', '--color-slate-800'],
      ['the divider caption ink', '--text-blueprint-divider-caption', '--color-gray-1200'],
      ['the divider badge plate', '--background-blueprint-divider-badge', '--color-slate-1200'],
      ['the cell ink', '--text-blueprint-cell', '--color-slate-1200'],
      ['the header ink', '--text-blueprint-header', '--color-gray-1200'],
      ['the arrow stroke', '--stroke-blueprint-arrow', '--color-gray-900'],
    ]

    it.each(OVERVIEW_NAMES)('pins %s', (_piece, name, pin) => {
      expect(resolveColor(name, theme)).toEqual(resolveColor(pin, theme))
    })

    /*
     * And the chrome, per state. The panel's and the frame's own rules read
     * the layer names above; the rest are the primitives the look was built
     * from, since a badge and an edge are not layers and have no name of
     * their own to retune.
     */
    it.each([
      ['the frame at rest', 'background-color', FRAME, '--color-slate-700'],
      ['the frame edge at rest', 'border-color', FRAME, '--color-slate-800'],
      ['the frame under the band', 'background-color', band('[data-phase-frame]'), '--color-slate-800'],
      ['the frame edge under the band', 'border-color', band('[data-phase-frame]'), '--color-slate-900'],
      ['the panel at rest', 'background-color', PANEL, '--color-slate-500'],
      ['the panel edge at rest', 'border-color', PANEL, '--color-slate-700'],
      ['the panel armed', 'background-color', PANEL_ARMED, '--color-slate-600'],
      ['the panel edge armed', 'border-color', PANEL_ARMED, '--color-slate-800'],
      ['the label rail on an armed panel', '--background-blueprint-panel-label-rail', PANEL_ARMED, '--color-slate-600'],
      ['the panel canvas on an armed panel', '--background-blueprint-panel-canvas', PANEL_ARMED, '--color-slate-300'],
      ['the panel sections on an armed panel', '--background-blueprint-panel-section', PANEL_ARMED, '--color-slate-300'],
      ['the divider bands on an armed panel', '--background-blueprint-panel-divider', PANEL_ARMED, '--color-slate-600'],
      ['the phase badge at rest', 'background-color', '[data-phase-title-badge]', '--color-slate-800'],
      ['the phase badge edge at rest', 'border-color', '[data-phase-title-badge]', '--color-slate-800'],
      ['the phase badge under the band', 'background-color', band('[data-phase-title-badge]'), '--color-slate-900'],
      ['the phase badge edge under the band', 'border-color', band('[data-phase-title-badge]'), '--color-slate-900'],
      ['the scenario badge at rest', 'background-color', '[data-scenario-panel-title-badge]', '--color-gray-800'],
      ['the scenario badge edge at rest', 'border-color', '[data-scenario-panel-title-badge]', '--color-gray-800'],
      ['the scenario badge on an armed panel', 'background-color', `${PANEL}:hover:not([data-canvas-focus-active]) [data-scenario-panel-title-badge], ${PANEL}:focus-within:not([data-canvas-focus-active]) [data-scenario-panel-title-badge]`, '--color-gray-900'],
      ['the scenario badge edge on an armed panel', 'border-color', `${PANEL}:hover:not([data-canvas-focus-active]) [data-scenario-panel-title-badge], ${PANEL}:focus-within:not([data-canvas-focus-active]) [data-scenario-panel-title-badge]`, '--color-gray-900'],
    ])('paints %s', (_what, property, selector, pin) => {
      expect(painted(property, selector)).toEqual(resolveColor(pin, theme))
    })

    /*
     * The pieces the board composes in TypeScript rather than in a selector —
     * a gradient stop, an SVG attribute, an inline style. `blueprintTheme.ts`
     * used to spell a ramp step for each; it names the same pieces now, and
     * this resolves the name it holds back to the step the look was built on.
     */
    it.each([
      ['the label rail', 'labelRail', '--color-slate-500'],
      ['the interior edge', 'canvasBorder', '--color-slate-700'],
      ['the phase divider', 'divider', '--color-slate-800'],
      ['the divider caption', 'dividerLabel', '--color-gray-1200'],
      ['the divider badge plate', 'dividerBadgeBg', '--color-slate-1200'],
      ['the divider band', 'dividerBg', '--color-slate-500'],
      ['the cell ink', 'cellText', '--color-slate-1200'],
      ['the header ink', 'headerText', '--color-gray-1200'],
      ['the lane divider', 'laneDivider', '--color-slate-700'],
      ['the arrow stroke', 'arrow', '--color-gray-900'],
      ['the panel interior', 'canvas', '--canvas'],
      ['the compare section fill', 'sectionFill', '--canvas'],
      ['the viewport ground', 'viewportPad', '--color-gray-300'],
    ] as const)('composes %s in the colour it always was', (_what, key, pin) => {
      expect(resolveColor(referenced(BLUEPRINT_THEME[key]), theme)).toEqual(
        resolveColor(pin, theme),
      )
    })

    /*
     * ONE DECLARATION EACH, AT THE ROOT, WITH THE PAIRS TOGETHER.
     *
     * This is what makes an override work. A custom property inherits, so a
     * deployment retunes a piece by declaring its name on a wrapper around the
     * board — and that declaration only wins if the app's own is at `:root`
     * and nowhere nearer the element. A second declaration further in would
     * sit BELOW the wrapper in the tree and beat it, silently, on exactly the
     * pieces someone was trying to change.
     *
     * The four `--background-blueprint-panel-*` seams are the deliberate
     * exception and are not in this table: the hover rule declaring one on the
     * panel is the mechanism, not a leak.
     */
    it('lets an override on a wrapper win for every piece', () => {
      const elsewhere = OVERVIEW_NAMES
        .map(([, name]) => [
          name,
          declarations().filter((entry) => entry.name === name),
        ] as const)
        .filter(
          ([, found]) =>
            found.length !== 1 ||
            found[0].selector !== ':root' ||
            found[0].file !== 'blueprint.css',
        )
        .map(([name, found]) => `${name}: ${found.length} in ${found.map((e) => `${e.file} ${e.selector}`).join(', ')}`)
      expect(elsewhere).toEqual([])

      // And the other half of an override reaching a piece: whoever paints it
      // names the token, so the inherited value is the one that lands. A rule
      // that had kept its ramp step would satisfy the root check above and
      // ignore the wrapper entirely.
      for (const [piece, name] of OVERVIEW_NAMES)
        expect(consumersOf(name).length, `${piece} (${name})`).toBeGreaterThan(0)
    })

    it('keeps a rest name and its hover next to each other', () => {
      // A pair that drifts apart in the file drifts apart in fact: the next
      // person retunes the one they can see.
      const order = declarations()
        .filter((entry) => entry.file === 'blueprint.css' && entry.selector === ':root')
        .map((entry) => entry.name)
      const hovers = order.filter((name) => name.endsWith('-hover'))
      // A vocabulary with no pairs in it would pass the check below vacuously.
      expect(hovers.length).toBeGreaterThan(0)
      expect(
        hovers.filter(
          (name) =>
            order[order.indexOf(name) - 1] !== name.slice(0, -'-hover'.length),
        ),
      ).toEqual([])
    })

    /*
     * AND NO RAMP STEP LEFT IN A RULE.
     *
     * The table above pins what the names resolve to; this is the half that
     * says the names are what the board reads. A rule or a composed value that
     * still spelled `--color-slate-800` would render the right colour today
     * and ignore every override tomorrow, which is the failure this ticket
     * exists to remove — and it would pass every assertion above.
     */
    it('leaves no ramp step in an overview rule or in the theme module', () => {
      const OVERVIEW = /data-(?:phase-frame|phase-title-badge|phase-scenario-panel|scenario-panel-title-badge|canvas-phase-interactive)/
      const RAMP = /--color-(?:slate|gray)-\d+/g
      const rules = [
        ...stylesheet('blueprint.css').text.matchAll(/([^{}]+)\{([^{}]*)\}/g),
      ].filter(([, selector]) => OVERVIEW.test(selector))
      // An empty match set would make the loop below vacuously green.
      expect(rules.length).toBeGreaterThan(5)
      expect(
        rules
          .filter(([, , body]) => RAMP.test(body))
          .map(([, selector]) => selector.replace(/\s+/g, ' ').trim()),
      ).toEqual([])
      expect(source('lib/blueprintTheme.ts').match(RAMP) ?? []).toEqual([])
    })

    it('leaves every colour above untouched under the focus dim', () => {
      // A phase out of focus fades on opacity alone, on the numbers
      // `canvasFocusDim.ts` owns. That is a later change and a kept one: the
      // dim costs the container no second set of fills, so pinning the fills
      // above pins them dimmed too.
      const dimmed = rulesDeclaring('opacity').filter((rule) =>
        rule.selector.includes('[data-canvas-focus-dimmed]'),
      )
      expect(dimmed.length).toBeGreaterThan(0)
      for (const rule of dimmed)
        expect(rule.value, rule.selector).toMatch(
          /^(?:var\(--focus-dim-(?:hover-)?opacity\)|1)$/,
        )
      const painters = rulesDeclaring('background-color')
        .concat(rulesDeclaring('border-color'))
        .filter((rule) => rule.selector.includes('[data-canvas-focus-dimmed]'))
      expect(painters).toEqual([])
    })
  },
)

describe('blueprint cells', () => {
  /*
   * role → family, read off the `[data-blueprint-lane]` rules rather than
   * retyped beside them.
   *
   * The role half of a hand-typed pair was never read — every assertion below
   * takes the family and ignores the name — so the list could only ever be
   * measured against itself: a lane whose rule was missing from
   * `blueprint.css` went unmeasured while nine contrast checks passed against
   * the families the list still named. Reading the rules measures what is
   * drawn, and `interaction states` below holds the set of them to
   * `BLUEPRINT_LANE_ROLES`.
   */
  const lanes: ReadonlyArray<readonly [string, string]> = [
    ...stylesheet('blueprint.css').text.matchAll(
      /\[data-blueprint-lane='([a-z-]+)'\] \{[^}]*--background-blueprint-cell:\s*var\(--color-([a-z]+)-\d+\)/g,
    ),
  ].map(([, role, family]) => [role, family] as const)

  /**
   * tone → { family, surface, ring, text }, read off the
   * `[data-blueprint-tone]` rules. Steps differ from lanes (400/500/600 vs
   * 500/600/700), so the surface step comes from the rule rather than
   * `CELL_STEP`.
   */
  const tones: ReadonlyArray<{
    tone: string
    family: string
    surface: string
    ring: string
    text: string
  }> = [
    ...stylesheet('blueprint.css').text.matchAll(
      /\[data-blueprint-tone='([a-z]+)'\] \{([^}]+)\}/g,
    ),
  ].map(([, tone, block]) => {
    const surface =
      /--background-blueprint-cell:\s*var\((--color-[a-z]+-\d+)\)/.exec(block)?.[1]
    const ring =
      /--ring-blueprint-cell:\s*var\((--color-[a-z]+-\d+)\)/.exec(block)?.[1]
    const text =
      /--foreground-blueprint-cell:\s*var\((--color-[a-z]+-\d+)\)/.exec(block)?.[1]
    const family = /--color-([a-z]+)-/.exec(surface ?? '')?.[1]
    if (!surface || !ring || !text || !family) {
      throw new Error(`tone rule incomplete: ${tone}`)
    }
    return { tone, family, surface, ring, text }
  })

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    it.each(lanes)('%s: ring reads against its own surface', (_lane, family) => {
      // SC 1.4.11 — the ring is the focus affordance and the slice-member
      // outline. Radix step 8 is specified to be legible on steps 1–5.
      const ring = resolve(`--color-${family}-${CELL_STEP.ring}`, theme)
      const surface = resolve(`--color-${family}-${CELL_STEP.surface}`, theme)
      expect(contrast(ring, surface)).toBeGreaterThanOrEqual(3)
    })

    it.each(lanes)('%s: text reads against its own surface', (_lane, family) => {
      const text = resolve(`--color-${family}-${CELL_STEP.text}`, theme)
      const surface = resolve(`--color-${family}-${CELL_STEP.surface}`, theme)
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(lanes)('%s: hover is distinguishable from rest', (_lane, family) => {
      const rest = resolve(`--color-${family}-${CELL_STEP.surface}`, theme)
      const hover = resolve(`--color-${family}-${CELL_STEP.hover}`, theme)
      expect(contrast(rest, hover)).toBeGreaterThan(1.03)
    })

    it.each(tones)('$tone: ring reads against its own surface', ({ ring, surface }) => {
      expect(contrast(resolve(ring, theme), resolve(surface, theme))).toBeGreaterThanOrEqual(
        3,
      )
    })

    it.each(tones)('$tone: text reads against its own surface', ({ text, surface }) => {
      expect(contrast(resolve(text, theme), resolve(surface, theme))).toBeGreaterThanOrEqual(
        4.5,
      )
    })
  })

  /*
   * Focus-mode dimming is parent opacity over the canvas. The number lives
   * in TypeScript (`canvasFocusDim.ts`); CSS and class strings only read
   * the custom properties. 0.3 over the canvas cannot physically clear
   * SC 1.4.3 — that is why the slice dim raised opacity and compensated
   * with desaturate, and why this surface does not. The canvas contract
   * is 30% rest / 70% hover; we measure that the dimmed card stays
   * distinguishable from the canvas, and that the stylesheet is not a
   * second owner of the number.
   */
  it('takes the dim opacity from TypeScript, not a stylesheet literal', () => {
    expect(FOCUS_DIM_HOVER_OPACITY).toBeGreaterThan(FOCUS_DIM_OPACITY)
    expect(stylesheet('blueprint.css').text).toMatch(
      /opacity:\s*var\(--focus-dim-opacity\)/,
    )
    expect(stylesheet('blueprint.css').text).toMatch(
      /opacity:\s*var\(--focus-dim-hover-opacity\)/,
    )
    expect(source('components/blueprint/ResizableComparePanel.tsx')).toMatch(
      'FOCUS_DIM_REST_CLASS',
    )
    expect(source('components/blueprint/ScenarioBlueprintPanel.tsx')).toMatch(
      'FOCUS_DIM_CLASS',
    )
  })

  /** `fg` at `alpha` composited over `bg`. */
  const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
    bg.map((channel, i) => alpha * fg[i]! + (1 - alpha) * channel) as unknown as Rgb

  const dimmedFills: ReadonlyArray<readonly [string, string]> = [
    ...lanes.map(
      ([role, family]) =>
        [`lane:${role}`, `--color-${family}-${CELL_STEP.surface}`] as const,
    ),
    ...tones.map((t) => [`tone:${t.tone}`, t.surface] as const),
  ]

  describe.each(['light', 'dark'] as const)(
    `%s dimmed @ ${FOCUS_DIM_OPACITY}`,
    (theme) => {
      const canvas = resolveColor('--canvas', theme)

      it.each(dimmedFills)(
        '%s: the dimmed card remains distinguishable from the canvas',
        (_label, surfaceToken) => {
          const painted = over(
            resolve(surfaceToken, theme),
            canvas,
            FOCUS_DIM_OPACITY,
          )
          expect(contrast(painted, canvas)).toBeGreaterThan(1)
        },
      )
    },
  )
})

/*
 * The ink `[data-blueprint-fill]` derives for a fill is mirrored in JS by
 * `derivedFillInk` in `tokenModel`, rather than asserted against one
 * hard-coded ink — a hard-coded ink is exactly what this pairing replaced.
 * `text-white` measured 1.17-2.33:1 in dark mode, and a test that only knew
 * about one value could not have caught it.
 */
describe('path badges', () => {
  const paths = Object.entries(PATH_KIND_COLORS)

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    it.each(paths)('%s pairs with legible derived ink', (_type, token) => {
      const fill = resolve(token, theme)
      expect(contrast(fill, derivedFillInk(fill))).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe.each(['light', 'dark'] as const)('%s open set', (theme) => {
    // The type defaults were measured above, but a variant draws its badge
    // from the open set — four more fills whose derived ink has to hold the
    // same floor.
    const open = [
      ...new Set(
        Array.from({ length: 40 }, (_, i) =>
          getPathColor({ kind: 'variant', name: `Path ${i}` }),
        ),
      ),
    ]
    it.each(open)('%s pairs with legible derived ink', (token) => {
      const fill = resolve(token, theme)
      expect(contrast(fill, derivedFillInk(fill))).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe.each(['light', 'dark'] as const)('%s divider tag', (theme) => {
    // Not a path colour, but the same `[data-blueprint-fill]` rule paints it —
    // and it was the worst of the `text-white` sites at 1.17:1 in dark mode.
    it('pairs with legible derived ink', () => {
      const fill = resolve('--color-slate-1200', theme)
      expect(contrast(fill, derivedFillInk(fill))).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('keeps the open set clear of the two reserved colours', () => {
    /*
     * The reservation is only worth what it costs if a reader never sees the
     * reserved hues used for anything else. Name-independence — that a
     * `happy` or an `exception` answers from its type and never looks at what
     * the path is called — is asserted in `pathColorTheme.test.ts`, where the
     * function lives. What is asserted HERE is the other half, and the half
     * that is about the palette: the set a variant is drawn from does not
     * contain either reserved colour, so nothing that is not a happy path can
     * come out looking like one.
     *
     * Compared by FAMILY rather than by token, because a variant drawn one
     * step off the happy path's green would still read as green. Both sides
     * are read off the module, so a fork that re-hues the whole thing is
     * measured on its own colours rather than on the template's.
     */
    const family = (token: string) => /--color-([a-z]+)-/.exec(token)![1]
    const reserved = new Set(
      (['happy', 'exception'] as const).map((kind) =>
        family(PATH_KIND_COLORS[kind]),
      ),
    )
    const open = new Set(
      Array.from({ length: 40 }, (_, i) =>
        family(getPathColor({ kind: 'variant', name: `Path ${i}` })),
      ),
    )
    expect([...open].filter((f) => reserved.has(f))).toEqual([])
  })

  it('gives every non-happy path a dash off the open set, not a type default', () => {
    // The failure this replaces: every named path fell through to its type's
    // one dash, so colour was the only channel telling them apart
    // (SC 1.4.1). Only `happy` keeps a type dash, because a scenario can only
    // ever hold one of those.
    //
    // Distinctness ACROSS a roster is deliberately not asserted: the open set
    // is finite, so two names can share a slot, and the guarantee on offer is
    // that colour and dash travel together — never that colour separates two
    // paths a dash does not.
    const named = [
      'Set Preferences',
      'Import Preferences',
      'Update Preferences',
    ].map((name) => getPathDashArray({ kind: 'variant', name }))
    expect(new Set(named).size).toBeGreaterThan(1)
    expect(named.every((dash) => dash !== undefined)).toBe(true)
    expect(
      getPathDashArray({ kind: 'happy', name: 'Anything at all' }),
    ).toBeUndefined()
  })

  it('draws one family with several patterns, so the dash carries its own information', () => {
    // Colour and dash index the same slot through lists of DIFFERENT length,
    // so a repeated colour lands on a different dash and the pair stays unique
    // for the lowest common multiple of the two — which, the lengths being
    // coprime, is their product.
    //
    // This used to assert the opposite: one colour, always one dash. That made
    // the second channel redundant with the first, which is the same as having
    // one — two paths sharing a colour shared a dash too and were
    // indistinguishable (SC 1.4.1).
    //
    // Both lengths are MEASURED off the module rather than retyped, so a fifth
    // family or an eighth pattern is caught here instead of quietly halving
    // the number of paths a board can draw apart.
    const sample = Array.from(
      { length: 400 },
      (_, i) => ({ kind: 'variant' as const, name: `Path ${i}` }),
    )
    const colours = new Set(sample.map(getPathColor)).size
    const dashes = new Set(sample.map(getPathDashArray)).size
    expect(colours * dashes).toBe(PATH_IDENTITY_PERIOD)

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
    expect(gcd(colours, dashes)).toBe(1)

    // Coprime lengths are the claim; this is the consequence a reader cares
    // about — one family is drawn with more than one pattern, so the pattern
    // is carrying information the hue does not.
    const perColour = new Map<string, Set<string | undefined>>()
    for (const path of sample) {
      const colour = getPathColor(path)
      const seen = perColour.get(colour) ?? new Set()
      seen.add(getPathDashArray(path))
      perColour.set(colour, seen)
    }
    expect(
      [...perColour.values()].every((patterns) => patterns.size > 1),
    ).toBe(true)
  })
})

/**
 * Board chrome — the ink-on-ground pairs the frame actually renders.
 *
 * These are CROSS-FAMILY pairs: a gray ink on a slate ground. Every other
 * assertion in this file measures a pair whose halves come from the same
 * primitive family, which is the sampling that let the divider caption run at
 * 2.64:1 inside a file that measures contrast a hundred times. A guard picks
 * the region where its property already holds unless something makes it look
 * elsewhere.
 *
 * The floor is 4.5:1 because both of these are text, and small text: the
 * divider caption is an uppercase badge at the bottom of the type scale.
 * Neither is anywhere near the large-text threshold.
 */
describe.each(['light', 'dark'] as const)('board chrome: %s', (theme) => {
  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    [
      'divider caption',
      BLUEPRINT_THEME.dividerLabel,
      BLUEPRINT_THEME.dividerBg,
    ],
    ['label rail header', BLUEPRINT_THEME.headerText, BLUEPRINT_THEME.labelRail],
  ]

  /*
   * Resolved through the cascade rather than read off a step, because both
   * halves are blueprint component names now: the pair is measured where it
   * renders, so a retune of either name is measured too.
   */
  const rendered = (value: string) => resolveColor(referenced(value), theme)

  it.each(pairs)('%s clears AA on its own row', (_name, ink, ground) => {
    expect(
      contrast(rendered(ink), rendered(ground)),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe('lane roles and touchpoint tones stay disjoint', () => {
  const css = stylesheet('blueprint.css').text
  const familiesIn = (attr: string) =>
    new Set(
      [
        ...css.matchAll(
          new RegExp(`\\[data-blueprint-${attr}='[a-z-]+'\\] \\{([^}]*)\\}`, 'g'),
        ),
      ].flatMap(([, body]) =>
        [...body.matchAll(/--color-([a-z]+)-/g)].map(([, f]) => f),
      ),
    )

  it('shares no family, so a touchpoint can never read as its lane', () => {
    const lanes = familiesIn('lane')
    const tones = familiesIn('tone')
    expect(lanes.size).toBeGreaterThan(0)
    expect(tones.size).toBeGreaterThan(0)
    expect([...lanes].filter((f) => tones.has(f))).toEqual([])
  })

  it('keeps the open set off the lane families', () => {
    // A variant is drawn as a line across the lanes it touches. Before the
    // open set moved onto the tone families, most such paths rendered in the
    // hue of a lane they crossed.
    const lanes = familiesIn('lane')
    const pathFamilies = new Set(
      Array.from({ length: 40 }, (_, i) =>
        getPathColor({ kind: 'variant', name: `Path ${i}` }),
      ).map((token) => /--color-([a-z]+)-/.exec(token)![1]),
    )
    expect(pathFamilies.size).toBeGreaterThan(1)
    expect([...pathFamilies].filter((f) => lanes.has(f))).toEqual([])
  })

  /*
   * The claim this file used to make, and the one it can actually hold.
   *
   * The test above was titled "keeps NAMED paths off the lane families" and
   * sampled forty synthetic names all hard-coded to `kind: 'variant'`.
   * `getPathColor` short-circuits every other kind straight to
   * `PATH_KIND_COLORS`, so the sample could only ever produce the open
   * families — the one set that is disjoint from the lanes by construction.
   * `happy` and `exception` were structurally unreachable through it, and
   * `happy` is green against the green `actor` lane.
   *
   * Widening the sample fails, and that failure is the finding. The honest fix
   * is to narrow the claim rather than reshuffle the palette: nine lane
   * families plus seven touchpoint tones is sixteen, and there is no spare
   * hue for green to move to. What CAN be held is that the overlap is exactly
   * ONE, known, and drawn at a weight nothing can confuse with a lane fill.
   *
   * It was two until the open set reserved green and red. `variant` was blue
   * against the blue `evidence` lane, and unlike green it had somewhere to go:
   * a variant reads the open set now, and the type entry it falls back to
   * moved onto that set's first family. One overlap is a fact about a full
   * palette; two was a fact about nobody having looked.
   */
  const KNOWN_LANE_OVERLAP = ['happy']

  it('has exactly one path type sharing a lane family, and names it', () => {
    const lanes = familiesIn('lane')
    const overlapping = Object.entries(PATH_KIND_COLORS)
      .filter(([, token]) => lanes.has(/--color-([a-z]+)-/.exec(token)![1]))
      .map(([type]) => type)
    expect(overlapping).toEqual(KNOWN_LANE_OVERLAP)
  })

  it('draws that overlap at a different weight from the lane it crosses', () => {
    // What makes the one collision survivable: the path is a line at the text
    // step, the lane is a fill six steps lighter. Same family, nothing like
    // the same colour.
    const laneFill = Number(CELL_STEP.surface)
    for (const type of KNOWN_LANE_OVERLAP) {
      const step = Number(
        /--color-[a-z]+-(\d+)/.exec(
          PATH_KIND_COLORS[type as keyof typeof PATH_KIND_COLORS],
        )![1],
      )
      expect(step).toBeGreaterThan(laneFill)
    }
  })

  /*
   * The constraint nobody had written down: the palette is FULL.
   *
   * Nine families to lanes, seven to touchpoint tones, sixteen in all and
   * nothing spare — `partner-action` took the one spare family the count used
   * to hold in reserve. It is invisible until someone tries to add a tenth
   * lane and finds there is nowhere for it to go — and it is the reason the
   * fix above is a narrowed claim rather than a reallocation.
   */
  it('states its own allocation, so a tenth lane fails before it is drawn', () => {
    const lanes = familiesIn('lane')
    const tones = familiesIn('tone')
    expect(lanes.size).toBe(9)
    expect(tones.size).toBe(7)
    expect(new Set([...lanes, ...tones]).size).toBe(16)
  })
})

/*
 * Lanes AND touchpoint tones. The tones used to get set membership and a
 * `size > 0` guard while the lanes got a completeness check plus hover,
 * pressed, ring and text contrast in both themes — and the gap was
 * structural, not incidental: the regex below matched
 * `[data-blueprint-lane=…]` only, so all seven tones were excluded from every
 * contrast assertion in the file. Seven of our sixteen allocated families were
 * exempt from every check. They set the same seven properties from the same
 * ramps and render as cell surfaces exactly the way lanes do; there was never
 * a reason beyond the shape of one regex.
 */
describe.each([
  ['lane', BLUEPRINT_LANE_ROLES],
  ['tone', TOUCHPOINT_TONES],
] as const)('interaction states: %s', (attr, roster) => {
  const css = stylesheet('blueprint.css').text
  /** Every `[data-blueprint-*]` rule, as role → { property: family-step }. */
  const roleRules = [
    ...css.matchAll(
      new RegExp(`\\[data-blueprint-${attr}='([a-z-]+)'\\] \\{([^}]*)\\}`, 'g'),
    ),
  ].map(([, role, body]) => ({
    role,
    props: Object.fromEntries(
      [
        ...body.matchAll(
          /(--[a-z-]+-blueprint-cell[a-z-]*):\s*var\(--color-([a-z]+-\d+)\)/g,
        ),
      ].map(([, prop, token]) => [prop, token]),
    ) as Record<string, string>,
  }))

  // Every property a role must define. Kept in step with the consumers: a
  // token nothing reads does not belong on the list, because then the test is
  // asserting the stylesheet against itself rather than against the app.
  const REQUIRED = [
    '--background-blueprint-cell',
    '--background-blueprint-cell-hover',
    '--background-blueprint-cell-pressed',
    '--ring-blueprint-cell',
    '--foreground-blueprint-cell',
  ]

  it('defines every state on every role', () => {
    // The exported roster is asserted, not merely counted. A count of nine
    // cannot tell nine roles apart from nine typos, and the attribute these
    // selectors match is written by `blueprintLaneAttrs` /
    // `blueprintToneAttrs` from a member of that roster — so a role added to
    // the type without a CSS block, and a selector renamed out of the
    // vocabulary, both fail here rather than rendering an unstyled row.
    expect(roleRules.map(({ role }) => role).sort()).toEqual([...roster].sort())
    for (const { role, props } of roleRules) {
      for (const key of REQUIRED) {
        expect(`${role}:${key}`).toBe(props[key] ? `${role}:${key}` : 'MISSING')
      }
    }
  })

  describe.each(['light', 'dark'] as const)('%s', (theme) => {
    it.each(roleRules.map((r) => [r.role, r] as const))(
      '%s: hover and pressed each move further from rest',
      (_role, { props }) => {
        const at = (key: string) =>
          THEMES[theme].get(props[key]) as [number, number, number]
        const rest = at('--background-blueprint-cell')
        // A state nobody can see is not a state.
        expect(
          contrast(rest, at('--background-blueprint-cell-hover')),
        ).toBeGreaterThan(1.03)
        expect(
          contrast(rest, at('--background-blueprint-cell-pressed')),
        ).toBeGreaterThan(
          contrast(rest, at('--background-blueprint-cell-hover')),
        )
      },
    )

    it.each(roleRules.map((r) => [r.role, r] as const))(
      '%s: text stays legible on the hover and pressed surfaces too',
      (_role, { props }) => {
        const at = (key: string) =>
          THEMES[theme].get(props[key]) as [number, number, number]
        const text = at('--foreground-blueprint-cell')
        expect(
          contrast(text, at('--background-blueprint-cell-hover')),
        ).toBeGreaterThanOrEqual(4.5)
        expect(
          contrast(text, at('--background-blueprint-cell-pressed')),
        ).toBeGreaterThanOrEqual(4.5)
      },
    )
  })
})

/**
 * How far apart two rendered colours are, in the space they are authored in.
 *
 * OKLab is near enough uniform that a Euclidean distance in it is a perceptual
 * one, and unlike a contrast ratio it counts a hue step and a chroma step as
 * separation rather than seeing lightness alone. Both colours are the
 * GAMUT-MAPPED ones: two triples the browser chroma-reduces onto each other
 * are one colour on the screen whatever the dials said.
 */
const perceptualDistance = (a: Rgb, b: Rgb) => {
  const lab = (rgb: Rgb) => {
    const [l, c, h] = oklchFromSrgb(rgb)
    const radians = (h * Math.PI) / 180
    return [l, c * Math.cos(radians), c * Math.sin(radians)] as const
  }
  const [al, aa, ab] = lab(a)
  const [bl, ba, bb] = lab(b)
  return Math.hypot(al - bl, aa - ba, ab - bb)
}

/**
 * One just-noticeable difference, and the floor for 'these are two colours'.
 *
 * A fact about eyes rather than about this palette, which is what lets it
 * travel — no brand is named by it and none can be tuned around it. It is the
 * floor the four status fills are held off both accents by: the neutral
 * template clears it seven times over, and a rebrand that walks a status fill
 * onto the accent lands at zero and fails.
 */
const JUST_NOTICEABLE = 0.02

/**
 * Identity and action are two JOBS, and one colour until a deployment says
 * otherwise.
 *
 * They were two fills, separated by a pair of dials each, and this block
 * measured the separation. The dials are gone, by the decision that an
 * identity with no colour of its own should say so: `--brand` derives from
 * `--primary` per channel, so an unbranded template resolves them to the same
 * colour on purpose, and the split that survives is which SURFACES each word
 * dresses — pinned by the four-jobs guard below.
 *
 * Measured off the cascade rather than recomputed from the dials, so a change
 * to the derivation is visible here rather than mirrored here.
 */
describe.each(['light', 'dark'] as const)('brand fill: %s', (theme) => {
  const brand = resolveColor('--brand', theme)
  const primary = resolveColor('--primary', theme)

  it('is the action fill exactly, while no dial declares otherwise', () => {
    /*
     * The inverse of what stood here, and deliberately so.
     *
     * This asked `perceptualDistance(brand, primary) > JUST_NOTICEABLE` — that
     * the two fills must look DIFFERENT — and that is false by design now: the
     * separation it measured was a mid grey standing beside a near-black
     * control, which is the defect the derivation removed rather than a
     * property worth keeping.
     *
     * Of the two claims left, this is the one that holds on the tree as it
     * ships. Byte-identity is the ADR's headline consequence, and it pairs
     * with the absence guard higher up: that guard names the declaration, in
     * a stylesheet or in source, and this one reports that the colour moved.
     * The pair is only as wide as the guard — a dial arriving from somewhere
     * neither reader sees, a host page's own inline style, would move the
     * colour here with nothing naming the line. The other claim — that a dial
     * which IS set moves brand off primary — cannot be asked here without an
     * override seam the token model does not have, and inventing one would
     * test the invention; it is demonstrated in a browser instead, which is
     * what the ticket's screenshots are.
     *
     * Channel by channel rather than as a distance under a floor, because
     * 'the same colour' has no tolerance to spend: any drift at all means a
     * channel stopped following the accent. A perceptual distance of 0 is the
     * same assertion arithmetically, so it is not also written here.
     */
    expect(resolveColorValue('--brand', theme)).toEqual(
      resolveColorValue('--primary', theme),
    )
  })

  it.each(['warning', 'destructive', 'info', 'success'] as const)(
    'stays clear of the %s signal, so the signal still signals',
    (role) => {
      /*
       * The failure a rebrand introduces and a greyscale template cannot
       * have. Three of the four status hues pull fifteen percent of the way
       * toward the accent for harmony, and `--success-hue` is PINNED rather
       * than pulled for a reason semantic.css states in as many words: with
       * the brand at 177.6 a brand-relative green would collide with
       * `--primary`, and a success state has to stay distinguishable from a
       * brand fill. That reason had nothing holding it — an accent moved onto
       * a category anchor takes the category's fill with it, and a
       * destructive that is the brand fill has lost the channel a fill exists
       * to carry.
       *
       * Both accents, because either one can be the colour a status fill
       * lands on, and the same just-noticeable floor for the same reason it
       * is used above: it names no hue, so no brand can be tuned around it.
       * The neutral template clears it by seven times over and the teal
       * deployment by three at its closest — dark success, which is the pair
       * the pinned hue was pinned for.
       */
      const signal = resolveColor(`--${role}`, theme)
      expect(perceptualDistance(signal, brand)).toBeGreaterThan(JUST_NOTICEABLE)
      expect(perceptualDistance(signal, primary)).toBeGreaterThan(
        JUST_NOTICEABLE,
      )
    },
  )

  /*
   * Ink on a fill, measured on each fill the app paints text on. This is the
   * one home for that measurement, and three assertions collapse into it.
   *
   * Two had lost their subject: one asked that `--brand` be the accent at its
   * two dials, which no longer exist, and one held the brand ink at 3:1 — the
   * floor a fill near L 0.6 can physically hold, a concession to the grey
   * this ticket deleted, and a floor that would now pass on any fill at all.
   * The third had not: `--primary` carried its ink at AAA, asserted beside the
   * primary dials. It is the `--primary` row here now, because two floors for
   * one pair in one file is a rule and a decoration — the weaker can never
   * fail while the stronger passes, and a reader cannot tell which is meant.
   * Folding it also retires the TypeScript re-derivation of the flip that
   * test carried, which is the second-copy shape the token model exists to
   * end.
   *
   * `--brand` holds 4.5:1, the AA floor for the size of label it carries —
   * the default button's and the cover CTA's are both `text-sm`. `--primary`
   * holds 7:1 in dark, where the teal measures 9.15:1, and 4.5:1 in light,
   * where it measures 4.69:1 under its near-white ink: holding 7:1 there would
   * mean darkening it to about L 0.45, off the site's colour. One pair, one
   * floor per theme, stated beside it. The brand-coloured switch is UI-only and
   * would sit at 3:1, but it shares the token with the CTA and a token holds
   * the strictest ground it is painted on, so nothing here is asserted at 3:1.
   * Nothing measured either pair before, which is how a 3.89:1 identity fill
   * shipped.
   *
   * Shaped after the role-tint measurements in `styles/tokens.test.ts`: the
   * pair resolves through the cascade under each theme, and the floor is
   * stated beside the pair it applies to.
   */
  const INK_PAIRS = [
    { fill: '--brand', ink: '--brand-foreground', floor: 4.5 },
    {
      fill: '--primary',
      ink: '--primary-foreground',
      floor: theme === 'dark' ? 7 : 4.5,
    },
  ] as const

  it.each(INK_PAIRS)(
    'carries $ink on $fill at $floor:1',
    ({ fill, ink, floor }) => {
      expect(
        contrast(resolveColor(ink, theme), resolveColor(fill, theme)),
      ).toBeGreaterThanOrEqual(floor)
    },
  )
})

/**
 * WHERE THE BRAND HUE IS ALLOWED TO LAND — four jobs, and no fifth.
 *
 * A deployment turns the accent dials — and, if its identity differs from its
 * action colour, one `--brand-*` dial as well — and its colour appears on the
 * primary CTA, the one prose link the app renders, a switch that is on, and
 * the path selector's selected row. Everything else — selection, focus ring, cell outlines — stays
 * neutral, so the hue reads as identity rather than as emphasis sprayed across
 * the chrome. Until now that rule lived in component comments, which is to say
 * nowhere: a fifth `bg-brand` would have been found by a reader or not at all.
 * This is its one home, and those comments point here.
 *
 * Measured on the SITE, not on the file. Pinning the utility each job spells
 * is what makes the rule move when a job moves: the path selector's brand mark
 * used to be a status dot on the TRIGGER, beside the path-colour dots it had
 * nothing to do with, and a rule that only asked which FILES may carry the hue
 * would have read the same before and after — and would go on reading the same
 * when a fifth mark appears inside one of those four files, which is exactly
 * where a fifth is likeliest to appear.
 */
const BRAND_JOBS = [
  { job: 'the primary CTA', file: 'components/ui/button.tsx', mark: 'bg-brand' },
  {
    job: 'the switch in its on state',
    file: 'components/ui/switch.tsx',
    mark: 'data-checked:bg-brand',
  },
  // `text-brand`, the brand identity colour (which resolves to the fill while
  // a deployment leaves the brand dials unset), not the role ink
  // `text-text-brand`: the mark is an icon, and an icon's contrast bar is
  // lower than text's. The measure is stated once, on the owner-tag check's
  // entry in FILL_INK_MARKS in tokenDiscipline.test.ts.
  {
    job: "the selected row in the path selector's popover",
    file: 'components/editor/PathSelectorMenu.tsx',
    mark: 'text-brand',
  },
  {
    job: 'the prose link',
    file: 'components/cover/CoverSections.tsx',
    mark: 'text-text-brand',
  },
] as const

/** Every brand-coloured utility written in source, as `file:line: utility`. */
const brandUses = () =>
  classUsesMatching(
    /(?:^|:)(?:bg|text|border|ring|fill|stroke|shadow|outline|decoration)-(?:[a-z-]+-)?brand(?:-foreground)?(?:\/\d{1,3})?$/,
  )

/** `file:line` — one job draws one mark, however many utilities spell it. */
const brandSites = () => [
  ...new Set(brandUses().map((use) => use.slice(0, use.lastIndexOf(': ')))),
]

describe('the brand hue reaches four jobs', () => {
  it.each(BRAND_JOBS)('spells $job as $mark in $file', ({ file, mark }) => {
    expect(
      brandUses().filter((use) => use.startsWith(`${file}:`)),
    ).toContainEqual(expect.stringMatching(new RegExp(`: ${mark}(?:/\\d+)?$`)))
  })

  it('draws one mark per job, and no fifth mark anywhere', () => {
    // The count is of SITES, so the CTA's four brand utilities on one class
    // string are the one job they dress, and a second `bg-brand` three lines
    // below it is a fifth job rather than more of the same one.
    const sites = brandSites()
    expect(
      sites,
      `The brand hue has ${BRAND_JOBS.length} jobs and these sites draw it:\n${sites.join('\n')}`,
    ).toHaveLength(BRAND_JOBS.length)
  })
})

/**
 * The role vocabulary, measured on the grounds each name claims.
 *
 * Every one of these is a contrast claim the name itself makes:
 * `--text-{role}` says it is ink on the page, `--text-on-surface-{role}` says
 * it is ink on the role's own tint. A name that says where it sits can be
 * held to it, which is the point of naming the job rather than the position —
 * `--destructive-600` claimed nothing, so nothing could be checked.
 *
 * Both grounds are resolved from the cascade rather than assumed, so a retune
 * of the tint moves the measurement of the ink that sits on it.
 */
const ROLE_NAMES = [
  'primary',
  'brand',
  'warning',
  'destructive',
  'info',
  'success',
  'secondary',
] as const

describe.each(['light', 'dark'] as const)('role ink: %s', (theme) => {
  const page = resolveColor('--background', theme)

  it.each(ROLE_NAMES)('%s reads as ink on the page', (role) => {
    // 4.5:1 — body text, because that is what these are for. The name this
    // replaces at the call site is `text-destructive`, which resolves to the
    // solid fill: a colour tuned for ink to sit ON it, never measured as ink.
    expect(
      contrast(resolveColor(`--text-${role}`, theme), page),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(ROLE_NAMES)('%s reads past muted text, and further on its tint', (role) => {
    // Role ink marks what is on. Measured as distance from the page along the
    // span, it has to outrank muted text or an active label reads fainter
    // than the resting one beside it — which dark did, grey on grey, while
    // role ink sat at a fixed fraction and dark drew muted text further out.
    const from = (name: string) =>
      Math.abs(resolveColorValue(name, theme).l - resolveColorValue('--background', theme).l)
    const muted = from('--muted-foreground')
    const ink = from(`--text-${role}`)
    expect(ink - muted).toBeGreaterThan(0.04)
    expect(from(`--text-on-surface-${role}`)).toBeGreaterThan(ink)
  })

  it.each(ROLE_NAMES)('%s reads as ink on its own tint', (role) => {
    // The ground here is the role's tint, not the page. A status word on a
    // ten-percent wash of itself measures about 2.3:1, which is the defect
    // that made two ink names necessary rather than one.
    const tint = resolveColor(`--surface-${role}`, theme)
    expect(
      contrast(resolveColor(`--text-on-surface-${role}`, theme), tint),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(ROLE_NAMES)('%s tints without becoming a fill', (role) => {
    // A resting tint has to be visible and has to stay a surface. The band is
    // where the hand-composed `bg-{role}/10` and `/15` call sites this name
    // replaces already sat, measured: 1.10 to 1.33 against the page.
    const tint = resolveColor(`--surface-${role}`, theme)
    expect(contrast(tint, page)).toBeGreaterThan(1.05)
    expect(contrast(tint, page)).toBeLessThan(1.5)
  })

  it.each(ROLE_NAMES)('%s washes over a surface rather than replacing it', (role) => {
    // The wash is translucent by construction, which is the whole difference
    // between it and the tint — it is painted over a surface that already
    // exists. Measured as a composite on the page, because that is the only
    // way a translucent colour has a value at all.
    const wash = resolveColor(`--wash-${role}`, theme, { over: page })
    expect(contrast(wash, page)).toBeGreaterThan(1)
    expect(contrast(wash, page)).toBeLessThan(1.5)
  })
})

/**
 * The role edge, and how quiet it stays.
 *
 * Not a 3:1 rule. SC 1.4.11 asks that of a boundary REQUIRED to identify a
 * control or its state, and this is not one — an alert carries its variant in
 * a tinted surface and a filled icon square, and the border can go without the
 * variant becoming unreadable. Held to that floor the edge would read as a
 * rule around the box, several times louder than the neutral hairline drawn
 * beside it.
 *
 * What it is held to instead is the interval the recipe this system follows
 * uses: a role border one step off the surface it edges, which measured across
 * that theme's own four alert variants spans 1.21:1 to 1.34:1 against the
 * surface underneath. Both ends matter. Too little and there is no edge; too
 * much and it stops being one.
 *
 * The ground is the role's own tint, because that is what the edge is a step
 * off. Its distance from the page follows from that and is asserted as a
 * direction rather than a number.
 */
describe.each(['light', 'dark'] as const)('role edge: %s', (theme) => {
  const page = resolveColor('--background', theme)

  it.each(ROLE_NAMES)('%s sits one quiet step off its own tint', (role) => {
    // 1.22 to 1.28 across all fourteen today, inside the band at both ends.
    const ratio = contrast(
      resolveColor(`--border-${role}`, theme),
      resolveColor(`--surface-${role}`, theme),
    )
    expect(ratio).toBeGreaterThanOrEqual(1.2)
    expect(ratio).toBeLessThanOrEqual(1.35)
  })

  it.each(ROLE_NAMES)('%s steps away from the page, not back toward it', (role) => {
    // The direction, which no ratio can carry on its own: contrast is
    // unsigned, so an edge that stepped the wrong way would satisfy the band
    // above while landing between the tint and the canvas. The tint is already
    // a step off the page and the edge is a step further along the same span.
    const tint = resolveColor(`--surface-${role}`, theme)
    expect(
      contrast(resolveColor(`--border-${role}`, theme), page),
    ).toBeGreaterThan(contrast(tint, page))
  })

  it.each(ROLE_NAMES)('%s is solid, so its value does not depend on what is behind it', (role) => {
    // The whole reason the alpha form failed. A translucent border is a
    // different colour on every surface it crosses, and `resolveColor` refuses
    // to measure one without a ground — so this is the assertion, not a
    // separate check of the declaration text.
    expect(() => resolveColor(`--border-${role}`, theme)).not.toThrow()
  })
})
