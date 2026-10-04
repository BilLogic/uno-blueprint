import blueprintAnatomy from '../../../docs/assets/blueprint-anatomy.svg'
import blueprintAnatomyDark from '../../../docs/assets/blueprint-anatomy.dark.svg'
import cellAnatomy from '../../../docs/assets/cell-anatomy.svg'
import cellAnatomyDark from '../../../docs/assets/cell-anatomy.dark.svg'
import dataModelHierarchy from '../../../docs/assets/data-model-hierarchy.svg'
import dataModelHierarchyDark from '../../../docs/assets/data-model-hierarchy.dark.svg'
import fourWaysIn from '../../../docs/assets/four-ways-in.svg'
import fourWaysInDark from '../../../docs/assets/four-ways-in.dark.svg'
import ubAudit from '../../../docs/assets/ub-audit.svg'
import ubAuditDark from '../../../docs/assets/ub-audit.dark.svg'
import ubMap from '../../../docs/assets/ub-map.svg'
import ubMapDark from '../../../docs/assets/ub-map.dark.svg'
import ubSlice from '../../../docs/assets/ub-slice.svg'
import ubSliceDark from '../../../docs/assets/ub-slice.dark.svg'
import ubWhatif from '../../../docs/assets/ub-whatif.svg'
import ubWhatifDark from '../../../docs/assets/ub-whatif.dark.svg'
import skillArchitecture from '../../../docs/assets/skill-architecture.svg'
import skillArchitectureDark from '../../../docs/assets/skill-architecture.dark.svg'
import sliceConcept from '../../../docs/assets/slice-concept.svg'
import sliceConceptDark from '../../../docs/assets/slice-concept.dark.svg'
import slicingModel from '../../../docs/assets/slicing-model.svg'
import slicingModelDark from '../../../docs/assets/slicing-model.dark.svg'
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
    srcDark: blueprintAnatomyDark,
    alt: 'Inside one path — lanes as rows, steps as columns, a cell where they cross, leads-to arrows from cell to cell, and the lines of interaction, visibility and internal interaction falling between the lanes',
    width: 880,
    height: 408,
  },
  cellAnatomy: {
    src: cellAnatomy,
    srcDark: cellAnatomyDark,
    alt: 'One cell on the board opened into its record — where it sits and its lane, what it does, owner and perceived owner, function, form and value proposition, then its evidence, resources, dependencies and the slices that cite it',
    width: 880,
    height: 580,
  },
  dataModelHierarchy: {
    src: dataModelHierarchy,
    srcDark: dataModelHierarchyDark,
    alt: 'How a blueprint is organized — a service holds phases in order, and a phase may loop back; a phase holds scenarios; a scenario holds paths side by side; a path is a grid of lanes and steps',
    width: 880,
    height: 595,
  },
  fourWaysIn: {
    src: fourWaysIn,
    srcDark: fourWaysInDark,
    alt: 'Four ways into one shared context — the app, the in-app agent and agentic tools read and write it; a Slack bot you build, dashed because the template does not ship it, only reads',
    width: 880,
    height: 324,
  },
  ubAudit: {
    src: ubAudit,
    srcDark: ubAuditDark,
    alt: 'ub:audit flags cells without changing the blueprint — a step with no cell, two cells competing for one channel, a recorded owner and a perceived owner that differ — and records each as a finding for you to triage',
    width: 880,
    height: 300,
  },
  ubMap: {
    src: ubMap,
    srcDark: ubMapDark,
    alt: 'ub:map reads what you already have — interview notes, support tickets, a journey map — and places what it finds into cells, held as a draft until you sign it off',
    width: 880,
    height: 300,
  },
  ubSlice: {
    src: ubSlice,
    srcDark: ubSliceDark,
    alt: 'ub:slice takes one cut of the blueprint — a journey, step, lane, cell or custom set; here one lane — and orders it into slides that each cite the cell they show',
    width: 880,
    height: 276,
  },
  ubWhatif: {
    src: ubWhatif,
    srcDark: ubWhatifDark,
    alt: 'ub:whatif traces a proposed change on a copy, to the cells it reaches and an assumption it breaks; the blueprint changes only after you accept, through ub:map',
    width: 880,
    height: 348,
  },
  skillArchitecture: {
    src: skillArchitecture,
    srcDark: skillArchitectureDark,
    alt: 'The four skills against the shared references and the agents — each skill has its own references, links only the shared references its task needs, and hands its reading to its own fresh-context agents',
    width: 880,
    height: 670,
  },
  sliceConcept: {
    src: sliceConcept,
    srcDark: sliceConceptDark,
    alt: 'A slice citing cells — numbered cells stay where they are on the path, and four ordered slides point at them',
    width: 880,
    height: 312,
  },
  slicingModel: {
    src: slicingModel,
    srcDark: slicingModelDark,
    alt: 'The five slice types as shapes cut from one grid — journey, one actor and what they touch; step, every lane at one moment; lane, one row at every step; cell, one cell in full; custom, whatever the question needs',
    width: 880,
    height: 260,
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
    alt: 'A blueprint checked at a quarterly, twice-yearly or yearly review drifts out of date between reviews; one checked almost daily, by people and agents, stays true',
    width: 880,
    height: 392,
  },
} satisfies Record<string, CoverFigure>

/** The figures above, keyed the way this package names them. */
export type PackageCoverFigureName = keyof typeof packageCoverFigures
