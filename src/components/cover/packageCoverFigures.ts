import blueprintAnatomy from '../../../docs/assets/blueprint-anatomy.svg'
import cellAnatomy from '../../../docs/assets/cell-anatomy.svg'
import dataModelHierarchy from '../../../docs/assets/data-model-hierarchy.svg'
import fourWaysIn from '../../../docs/assets/four-ways-in.svg'
import ubAudit from '../../../docs/assets/ub-audit.svg'
import ubMap from '../../../docs/assets/ub-map.svg'
import ubSlice from '../../../docs/assets/ub-slice.svg'
import ubWhatif from '../../../docs/assets/ub-whatif.svg'
import skillArchitecture from '../../../docs/assets/skill-architecture.svg'
import sliceConcept from '../../../docs/assets/slice-concept.svg'
import slicingModel from '../../../docs/assets/slicing-model.svg'
import whenToUse from '../../../docs/assets/when-to-use.svg'
import whenToUseDark from '../../../docs/assets/when-to-use.dark.svg'
import whyNow from '../../../docs/assets/why-now.svg'
import whyNowDark from '../../../docs/assets/why-now.dark.svg'
import type { CoverFigure } from '@/components/cover/coverModel'

/**
 * The diagrams this package draws of its own model, ready to place on a
 * cover.
 *
 * WHO AUTHORED A FIGURE IS WHO SUPPLIES IT. These thirteen are about the
 * blueprint model itself — a numbered user, a numbered step, frontstage and
 * backstage, what a slice selects out of a path. They explain this package,
 * they are the same drawing whichever service is being blueprinted, and a
 * deployment that had to supply them would be supplying somebody else's
 * explanation of somebody else's model. So the package brings them, and a
 * deployment gets them by depending on it. Everything else on a cover — its own
 * screenshots, its logomark, its portraits — is its own to serve, and
 * `deploymentConfig` states that split where a deployment meets it.
 *
 * THEY ARRIVE AS IMPORTS, which is the part that makes them arrive at all.
 * A figure named as `/cover/why-now.svg` is a URL, and a URL is served by
 * whatever tree holds that file in its `public/`. This repository's own build
 * step puts them there; a deployment runs no step of this repository's, so
 * every one of those requests fell through to the single-page fallback and
 * came back 200 with a page of HTML in it — a broken-image box for the
 * reader, a success in the network tab, and nothing anywhere to fail. An
 * import has none of that slack. The bundler resolves it or the build stops,
 * it emits the file into whatever output the deployment builds, and the
 * figure is carried by the same graph that carries the module naming it.
 *
 * The specifier is relative, and deliberately: it resolves inside this
 * package wherever the package is — linked into a deployment, hoisted to the
 * top of its tree, or nested under another dependency. Nothing in a
 * deployment's build configuration is asked to know about any of this, which
 * is the constraint that had defeated the three fixes before it: those three
 * files are held byte-identical by a deployment, so a fix that lives in them
 * is a fix that cannot be applied there.
 *
 * `docs/assets/` stays the one home. A figure is authored there, this module
 * is what the application reads it through, and the copy into `public/cover/`
 * that this repository's build still makes is for the bundled sample
 * blueprint, whose storyboard frames are database values and cannot be
 * imports.
 *
 * A figure with a dark file carries it as `srcDark`, imported the same way
 * and named `<figure>.dark.svg` beside its light file. Figures without one
 * yet show the light file in both themes.
 *
 * Dimensions are each SVG's own `viewBox`, so a page reserves the right box
 * before the image decodes. Alt text describes the drawing, because the
 * drawing is this package's; a deployment that wants its own words keeps the
 * figure and overrides the one field.
 */
export const packageCoverFigures = {
  blueprintAnatomy: {
    src: blueprintAnatomy,
    alt: 'Inside one path — lanes, steps, cells, dependencies, and the derived divider lines',
    width: 880,
    height: 544,
  },
  cellAnatomy: {
    src: cellAnatomy,
    alt: 'Inside one cell — placement, ownership, function, evidence, dependencies, and the slices that quote it',
    width: 880,
    height: 730,
  },
  dataModelHierarchy: {
    src: dataModelHierarchy,
    alt: 'How a blueprint is organized — service to phase to scenario to path',
    width: 880,
    height: 634,
  },
  fourWaysIn: {
    src: fourWaysIn,
    alt: 'Ways into the blueprint — the app, the in-app agent, agentic tools, and a Slack bot you could build — over one shared context layer',
    width: 880,
    height: 334,
  },
  ubAudit: {
    src: ubAudit,
    alt: 'How ub:audit runs its check roster and records findings for triage',
    width: 880,
    height: 292,
  },
  ubMap: {
    src: ubMap,
    alt: 'How ub:map turns documents, sessions, or a foreign diagram into a validated blueprint',
    width: 880,
    height: 292,
  },
  ubSlice: {
    src: ubSlice,
    alt: 'How ub:slice selects and orders cells into a stakeholder view',
    width: 880,
    height: 292,
  },
  ubWhatif: {
    src: ubWhatif,
    alt: 'How ub:whatif traces a proposed change downstream on a copy',
    width: 880,
    height: 292,
  },
  skillArchitecture: {
    src: skillArchitecture,
    alt: 'The four skills, the resources each owns, the shared references they link, and the agents they spawn',
    width: 880,
    height: 548,
  },
  sliceConcept: {
    src: sliceConcept,
    alt: 'One path becoming a presentation — the cells a slice quotes, ordered into slides',
    width: 880,
    height: 364,
  },
  slicingModel: {
    src: slicingModel,
    alt: 'The five slice types and what each one selects out of a path',
    width: 880,
    height: 214,
  },
  whenToUse: {
    src: whenToUse,
    srcDark: whenToUseDark,
    alt: 'Four ways teams use one blueprint — onboarding reads all of it, stakeholder alignment takes one lane as a slice, decision evaluation traces a change to the cells that depend on it, context management flags the cells that no longer hold, in amber',
    width: 880,
    height: 376,
  },
  whyNow: {
    src: whyNow,
    srcDark: whyNowDark,
    alt: 'A blueprint read at a few workshops a year drifts out of date; one read every week, by people and agents, stays true',
    width: 880,
    height: 392,
  },
} satisfies Record<string, CoverFigure>

/** The figures above, keyed the way this package names them. */
export type PackageCoverFigureName = keyof typeof packageCoverFigures
