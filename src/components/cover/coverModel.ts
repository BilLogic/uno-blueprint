/**
 * The cover page's content model.
 *
 * Types only — no strings live here. The renderers in this directory are
 * skinned entirely by a `CoverContent` object supplied by the deployment
 * (`src/content/coverContent.ts` in this repo). That split is what lets a
 * fork change every label, figure, and link without touching a component.
 */

/** One figure on its plate. Dimensions come from the SVG's viewBox so the
 * page reserves the right box before the image decodes. */
export type CoverFigure = {
  /**
   * Where the image is. Never a filename the component knows about — the
   * content module owns the whole of it.
   *
   * TWO KINDS OF VALUE GO HERE, and which one is right follows from who drew
   * the picture. A diagram of the blueprint model is this package's, and
   * `packageCoverFigures` hands one over already filled in: its `src` is a
   * module the bundler resolved, so it travels with the application into
   * whatever output is being built. Anything a deployment drew is the
   * deployment's, and its `src` is a path that deployment serves — from its
   * own public directory, or imported the same way out of its own source.
   *
   * A path only resolves in a tree that holds the file. A deployment naming
   * `/cover/something.svg` is naming a file in ITS public directory; nothing
   * is copied out of this package's, and a request with nothing behind it is
   * answered by the single-page fallback with a success and a page of HTML.
   */
  src: string
  /**
   * The same drawing in the dark palette, where one has been drawn. The cover
   * shows it while the app is dark and switches with the toggle. Absent, the
   * light file stands in for both themes, which is how a figure looks before
   * its dark file exists.
   */
  srcDark?: string
  /** What the figure shows, not what it is called. */
  alt: string
  width: number
  height: number
}

/**
 * Every section's figure is optional, and an absent one is a first-class
 * state rather than a defect: a section whose figure has not been authored
 * yet renders prose-only. No placeholder box, no broken `src` — the copy for
 * those sections is written to stand on its own, and dropping the figure in
 * later is a one-line edit to this deployment's content module.
 */

/** A quiet inline link out to the repository's guide. Rendered only when the
 * deployment has configured a `repoUrl`; there is no button form. */
export type CoverGuideLink = {
  label: string
  /** Repo-relative, resolved against the deployment's `repoUrl`. Which
   * documents a deployment has is its own business, so no path here. */
  docPath: string
}

/**
 * A small figure beside text — a logomark, an avatar, a portrait. The
 * distinct type from `CoverFigure` matters: that one is a wide diagram
 * plate, sized from its own viewBox and rendered at `COVER_MEASURE`. This
 * one is a fixed, small square meant to sit next to a heading, and blowing
 * it up to the page measure would blur a logomark or let a character
 * illustration dominate a page otherwise made of technical diagrams.
 */
export type CoverPortraitImage = {
  src: string
  alt: string
  /** Same box size, two treatments. `badge` — no border, no white ground:
   * for a logomark or icon that already reads on any background. `framed` —
   * a border and a white card behind it: for an illustration authored for
   * its own light ground, the same convention `CoverFigure` uses for full
   * diagrams. */
  size: 'badge' | 'framed'
}

export type CoverSection =
  | {
      kind: 'prose'
      id: string
      heading?: string
      /** Paragraphs may carry `**bold**`, `*italic*`, and `` `code` `` runs. */
      paragraphs: string[]
      figure?: CoverFigure
    }
  | {
      kind: 'figure'
      id: string
      heading?: string
      figure: CoverFigure
    }
  | {
      kind: 'defs'
      id: string
      heading?: string
      intro?: string
      /** Header row for the definition table. Both cells are copy. */
      columns: { term: string; definition: string }
      items: { term: string; definition: string }[]
      figure?: CoverFigure
    }
  | {
      kind: 'portrait'
      id: string
      heading?: string
      /** Paragraphs may carry `**bold**`, `*italic*`, and `` `code` `` runs. */
      paragraphs: string[]
      image: CoverPortraitImage
    }
  | {
      kind: 'skill'
      id: string
      /** The invocation, e.g. `/ub:map`. Rendered as a click-to-copy control and
       * doubling as the panel's title. */
      command: string
      /** What the skill does AND what it leaves behind, as one paragraph.
       * This used to be two fields — `purpose` and a separate `produces`
       * line below the figure — which put a skill's output on its own
       * visual rung underneath the illustration instead of reading as part
       * of what the skill is. One field, one sentence the author folds the
       * output into. */
      summary: string
      figure?: CoverFigure
    }

/**
 * One service's cover page — the copy shown when that service is the active
 * one. A deployment supplies one per service it holds; the active-service
 * choice — this tab's selector, or the URL slug — picks which page renders.
 */
export type CoverServicePage = {
  /**
   * The service this page belongs to, matched to a roster row by its route
   * slug (`lib/serviceSlug`). Case-insensitive at the join, the way routing
   * resolves a slug.
   */
  slug: string
  sections: CoverSection[]
}

/**
 * The deployment's services index — the body of the services tab.
 * It is one page per service rather than a single fixed set of sections: the
 * active service picks its own page.
 *
 * With more than one service the tab heads its page with the selector and its
 * strip label reads `pluralLabel` ("Services") instead of the tab's singular
 * `label` ("The service"). With exactly one service neither the selector nor
 * the plural appears — the tab renders that sole page as its singular self,
 * byte-for-byte what it was before multi-service.
 */
export type CoverServicesIndex = {
  pluralLabel: string
  /** One page per service, in roster order. */
  pages: CoverServicePage[]
}

/** One orienting sentence, a guide link, and the tab's own identity — the
 * fields both kinds of tab share. */
type CoverTabBase = {
  value: string
  label: string
  /** One orienting sentence above the tab's first section. */
  intro?: string
  /** Appended after the last section, when `repoUrl` is set. */
  link?: CoverGuideLink
}

/** An ordinary content tab — a fixed set of sections, the same for everyone. */
export type CoverContentTab = CoverTabBase & {
  sections: CoverSection[]
}

/**
 * The services tab — its body is a page per service (`services.pages`), not a
 * fixed `sections` list. Exactly one tab is this kind; every other is a
 * `CoverContentTab`.
 */
export type CoverServicesTab = CoverTabBase & {
  services: CoverServicesIndex
}

export type CoverTab = CoverContentTab | CoverServicesTab

/** Every section a tab renders across all its states — a content tab's own
 * sections, or every per-service page's sections for the services tab. */
export function coverTabSections(tab: CoverTab): CoverSection[] {
  return 'services' in tab
    ? tab.services.pages.flatMap((page) => page.sections)
    : tab.sections
}

export type CoverContent = {
  /** Falls back to `ORG_NAME` when absent — the usual case. */
  title?: string
  lede: string
  /** The page's only button. */
  primaryCtaLabel: string
  /** Repository host root; guide links are dropped when it is absent. */
  repoUrl?: string
  /** Labels for the click-to-copy command control. */
  commandCopy: { copyLabel: string; copiedLabel: string }
  /** Degraded-state sentences the surrounding app may show. */
  states: { noSlices: string }
  tabs: CoverTab[]
}

/**
 * Every image actually referenced in a content tree, in reading order —
 * wide figures and portrait images alike, since both resolve to a `src` on
 * disk and the asset-existence tests want to walk both without caring which
 * kind they are. Sections with no image slot filled contribute nothing.
 */
export function coverFigures(
  content: CoverContent,
): Array<Pick<CoverFigure, 'src' | 'srcDark' | 'alt'>> {
  const images: Array<Pick<CoverFigure, 'src' | 'srcDark' | 'alt'>> = []
  for (const tab of content.tabs) {
    for (const section of coverTabSections(tab)) {
      if ('figure' in section && section.figure) images.push(section.figure)
      if ('image' in section && section.image) images.push(section.image)
    }
  }
  return images
}
