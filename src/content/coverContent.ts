import type { CoverContent } from '@/components/cover/coverModel'
import { packageCoverFigures } from '@/components/cover/packageCoverFigures'

/**
 * The template's cover-page content — every user-facing string on the
 * landing view lives here, not in the components. A deployment replaces
 * this module (labels, copy, figures, links) without touching a renderer.
 *
 * Every figure on this page is one of the package's own model diagrams, taken
 * whole from `packageCoverFigures` — they explain the blueprint model rather
 * than any one service, they arrive with the package, and a deployment that
 * keeps a section gets its figure without supplying a file. A deployment
 * supplying its own writes the figure out here instead, or spreads one of
 * these and overrides the field it wants.
 *
 * A section's `figure` is optional and an absent one is a first-class state:
 * the section renders prose-only, with no placeholder standing in for it.
 *
 * Where a figure exists it is the authored truth and the copy follows it —
 * the terms, their order, and the count all read off the drawing.
 *
 * Voice: matches `docs/guide/` — declarative, present tense, terms bolded on
 * first definition, no marketing adjectives. The audience is a developer
 * deciding whether to adopt this, so the copy explains and does not sell:
 * no proof-by-adjective, no emotional framing, no claim the page cannot
 * show. Edit it as prose when it needs editing — but keep the four tabs in
 * one voice, which is the thing that breaks first when they are touched
 * one at a time.
 */
export const coverContent: CoverContent = {
  // `title` omitted on purpose: the header falls back to ORG_NAME, which is
  // the template default "Uno Blueprint".
  lede: 'A structured map of how this service is delivered — every phase, every scenario, every path variant, down to what one actor does at one moment. It is data, not a diagram: agents read it, slices are cut from it, and changes are traced through it before anyone commits.',
  primaryCtaLabel: 'Open the blueprint',
  repoUrl: 'https://github.com/BilLogic/uno-blueprint',
  commandCopy: { copyLabel: 'Copy', copiedLabel: 'Copied' },
  states: {
    noSlices: 'No slices in this workspace yet — `/ub:slice` cuts the first one.',
  },
  tabs: [
    {
      value: 'overview',
      label: 'Overview',
      sections: [
        {
          kind: 'prose',
          id: 'overview-why',
          heading: 'Why a blueprint that stays true',
          paragraphs: [
            'Service blueprints have always been worth having and have always gone stale. They were strategic artifacts — commissioned, workshopped, opened at a quarterly or yearly review — because reading one took facilitation and context you had to rebuild every time. The map decayed quietly, and nothing in the week depended on it enough to force a correction.',
            'This project makes one bet: put the blueprint in a structure an agent can query, and the cost of reading it collapses. Interpretation stops being the expensive part, so the map gets consulted in ordinary work rather than at reviews — and because something now depends on it daily, keeping it accurate has a practical reason rather than a virtuous one.',
          ],
          figure: packageCoverFigures.whyNow,
        },
        {
          kind: 'defs',
          id: 'overview-when',
          heading: 'How teams use it',
          intro:
            'Four uses where the blueprint is the shortest path to an answer. They are alternatives, not a sequence — most teams start with one and grow into the rest.',
          columns: { term: 'Use', definition: 'What the blueprint gives you' },
          items: [
            {
              term: 'Onboarding',
              definition:
                'Someone new reads the whole service — every lane, every phase — before they own any part of it.',
            },
            {
              term: 'Stakeholder alignment',
              definition:
                'Each audience is given the one view that concerns them, cut from the same source, so no two rooms are reading different versions.',
            },
            {
              term: 'Decision evaluation',
              definition:
                'A proposed change is traced through the dependency graph first, so what it would break is known before anyone commits to it.',
            },
            {
              term: 'Context management',
              definition:
                'The audit roster names what has stopped holding since the service last moved, so the map is corrected rather than abandoned by degrees.',
            },
          ],
          figure: packageCoverFigures.whenToUse,
        },
        {
          kind: 'prose',
          id: 'overview-where',
          heading: 'Where you reach it from',
          paragraphs: [
            'The template ships three ways to work the same blueprint. The app is where people read, compare, and present. The in-app agent drafts changes in place, using the same write path the interface uses; it asks you to sign in and bring your own model key. Agentic tools reach the same rows from an IDE or a terminal — that is where the four skills run.',
            'All three sit on one shared context layer, so what any surface reads is what the others wrote. Who may do what follows from the account a surface signs in with, not from which surface it is.',
            'The fourth, dashed, is a pattern rather than a component: nothing here is a Slack bot. A chat surface over the blueprint can read what a deployment publishes, holding only the publishable key, and answer with links back to the exact cell. What it has to honour is the read-consumer section of the adapter contract, in `references/adapter-contract.md`.',
          ],
          figure: packageCoverFigures.fourWaysIn,
        },
      ],
      link: {
        label: 'Learn more →',
        docPath: 'docs/guide/02-using-it-in-practice.md',
      },
    },
    {
      value: 'blueprints',
      label: 'Blueprints',
      sections: [
        {
          kind: 'prose',
          id: 'blueprints-organized',
          heading: 'How a blueprint is organized',
          paragraphs: [
            'A **service** holds ordered **phases**, and a phase may loop back to an earlier one — which is how renewals and repeat visits are modeled without duplicating the journey. A phase holds **scenarios**: the distinct situations someone can be in. A scenario holds **paths** — variants of that same situation, the one that goes well and the ones where something does not.',
            'Every path is a grid. That is the next level down.',
          ],
          figure: packageCoverFigures.dataModelHierarchy,
        },
        {
          kind: 'prose',
          id: 'blueprints-path',
          heading: 'Inside one path',
          paragraphs: [
            'Lanes are rows, one actor each. Steps are columns, time running left to right. A **cell** is the intersection — what that actor does at that moment. Arrows are **dependencies**: one cell setting another in motion.',
            "The divider lines — **line of interaction**, **line of visibility**, **line of internal interaction** — are derived from the lanes' roles rather than drawn on top of them, so they cannot drift out of agreement with the lanes they separate. Steps are canonical per scenario and each path includes a subset in its own order, which is what makes comparing two paths exact rather than approximate.",
          ],
          figure: packageCoverFigures.blueprintAnatomy,
        },
        {
          kind: 'prose',
          id: 'blueprints-cell',
          heading: 'Inside one cell',
          paragraphs: [
            "A cell is one actor's action at one step, plus the record around it. It carries where it sits in the hierarchy, what it does, what form it takes, and what it is worth. It carries who **owns** it and who the customer *thinks* owns it — two fields, because the interesting case is when they differ.",
            'It also carries the **evidence** it rests on, the resources it points at, its **dependencies** — what leads to it, what it leads to, what enables it, what it enables — and the slices that quote it.',
            'That last one runs both ways: open a cell and you can see which views would change if you edited it.',
          ],
          figure: packageCoverFigures.cellAnatomy,
        },
      ],
      link: {
        label: 'Learn more →',
        docPath: 'docs/guide/01-the-blueprint-model.md',
      },
    },
    {
      value: 'slices',
      label: 'Slices',
      sections: [
        {
          kind: 'prose',
          id: 'slices-intro',
          heading: 'A view taken out of the blueprint',
          paragraphs: [
            'A blueprint is complete by design, which makes it the wrong thing to put in front of any one person. A **slice** is a standing view cut from it: an ordered set of cells with a title and a caption, built for one audience and one question.',
            'A slice quotes cells rather than copying them — it keeps naming its sources. That is the difference between a view and a snapshot: when the cells move, the slice does not go on asserting the old thing.',
            'It opens as its own tab beside the blueprint, so a reader can move between the view and the board it came from, and in presentation mode it runs slide by slide, for when the audience is a room rather than a person. Both states are addressable — a slice link carries its id, a presented one carries the slide — so you can send someone exactly what you are looking at.',
          ],
          figure: packageCoverFigures.sliceConcept,
        },
        {
          kind: 'defs',
          id: 'slices-types',
          heading: 'Five ways to slice',
          columns: { term: 'Type', definition: 'What it selects' },
          items: [
            { term: 'journey', definition: "One actor's path, end to end." },
            {
              term: 'step',
              definition: 'One step top to bottom — every lane at that moment.',
            },
            { term: 'lane', definition: 'One actor across the whole journey.' },
            { term: 'cell', definition: 'One cell in full.' },
            { term: 'custom', definition: 'Whatever the question needs.' },
          ],
          figure: packageCoverFigures.slicingModel,
        },
      ],
      link: {
        label: 'Learn more →',
        docPath: 'docs/guide/01-the-blueprint-model.md',
      },
    },
    {
      value: 'skills',
      label: 'Skills',
      sections: [
        {
          kind: 'prose',
          id: 'skills-set',
          heading: 'The skill set',
          paragraphs: [
            'The blueprint is maintained by four Claude Code skills rather than by hand. Each carries its own playbooks and scripts and links only the shared references its task needs, and each ends at a deterministic gate — a validator exit, a sign-off, a read-back that matches — rather than at "looks done".',
            'The heavy reading happens in fresh-context agents that return a summary instead of their raw material. That is deliberate: a context that never saw the drafting catches what the drafting context is anchored on.',
          ],
          figure: packageCoverFigures.skillArchitecture,
        },
        {
          kind: 'skill',
          id: 'skills-map',
          command: '/ub:map',
          summary:
            "Builds a blueprint from what you already have — documents, a working session, or someone else's diagram — and produces a validated blueprint file, signed off scenario by scenario and imported into the workspace.",
          figure: packageCoverFigures.ubMap,
        },
        {
          kind: 'skill',
          id: 'skills-audit',
          command: '/ub:audit',
          summary:
            'Runs the check roster to find what is missing, conflicting, or unowned, and produces findings for triage — the audit writes no changes of its own.',
          figure: packageCoverFigures.ubAudit,
        },
        {
          kind: 'skill',
          id: 'skills-whatif',
          command: '/ub:whatif',
          summary:
            'Traces a proposed change through the dependency graph before anyone commits, producing the cells it would reach and the assumptions it would break — worked on a copy, never the live blueprint.',
          figure: packageCoverFigures.ubWhatif,
        },
        {
          kind: 'skill',
          id: 'skills-slice',
          command: '/ub:slice',
          summary:
            'Cuts the view one stakeholder needs out of the whole, producing one slice per view that still cites the cells it quotes.',
          figure: packageCoverFigures.ubSlice,
        },
        {
          kind: 'prose',
          id: 'skills-outro',
          paragraphs: [
            'These run where you write code, not in this page — install the repo as a plugin and ask for what you want.',
          ],
        },
      ],
      link: { label: 'Learn more →', docPath: 'docs/guide/03-the-plugin.md' },
    },
  ],
}
