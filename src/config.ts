/**
 * Template-level configuration.
 *
 * ORG_NAME is the workspace/product name shown in app chrome (sidebar
 * wordmark, breadcrumbs). Change it when instantiating the template for an
 * organization; the browser tab title lives in index.html.
 */
export const ORG_NAME = 'Uno Blueprint'

/**
 * The brand block a deployment writes its own values into.
 *
 * This module is already the file an instantiation edits — `ORG_NAME` is here
 * for exactly that reason — so it is also where the accent belongs. The
 * alternative was editing `deploymentConfig.ts`, a module whose other three
 * hundred lines an adopter has no quarrel with; a fork should be the small
 * file that exists to be forked.
 *
 * `accent` is the colour an installation is branded on, written the way a
 * deployer knows it: a CSS hex. `lib/brandAccent.ts` is its reader and its
 * header says exactly how far the value reaches.
 */
export type Brand = {
  /** CSS hex, `#RGB` or `#RRGGBB`. Omit to keep the theme files' own hue. */
  accent?: string
}

/**
 * The template's own brand: no accent, deliberately.
 *
 * Omitting the field is a real value here rather than a hole waiting to be
 * filled. The template's teal lives in `styles/themes/light.css` and
 * `dark.css` — `--hue: 175` with the primary dials beside it — and an accent
 * written here would be read for its hue and written onto the root inline,
 * where it outranks every stylesheet selector, a deployment's theme file
 * included. Leaving it unset keeps the stylesheet the one place the brand is
 * said.
 *
 * A deployment built on this template writes its own hex into this constant
 * and layers a theme file whose chroma dials are raised at that hue; the two
 * belong together, and `lib/brandAccent.ts` carries why the accent alone moves
 * so little.
 */
export const BRAND: Brand = {}
