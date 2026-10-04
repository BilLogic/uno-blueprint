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
            'Service blueprints have always been worth having and have always gone stale. They were strategic artifacts (commissioned, workshopped, opened a few times a year) because reading one took facilitation and context you had to rebuild every time. The map decayed quietly, and nothing in the week depended on it enough to force a correction.',
            'This project makes one bet: put the blueprint in a structure an agent can query, and the cost of reading it collapses. Interpretation stops being the expensive part, so the map gets consulted in ordinary work rather than at offsites. Because something now depends on it daily, keeping it accurate has a practical reason rather than a virtuous one.',
          ],
          figure: packageCoverFigures.whyNow,
        },
        {
          kind: 'defs',
          id: 'overview-when',
          heading: 'How teams use it',
          intro:
            'Teams can use the blueprint in different ways and adopt each use case as it becomes relevant.',
          columns: { term: 'Use', definition: 'What the blueprint gives you' },
          items: [
            {
              term: 'Onboarding',
              definition:
                'Give someone new a complete view of the service before they take ownership of one part of it.',
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
                'The audit names what is missing, in conflict, or unowned, so the map can be corrected rather than left to drift.',
            },
          ],
          figure: packageCoverFigures.whenToUse,
        },
        {
          kind: 'prose',
          id: 'overview-where',
          heading: 'Where you reach it from',
          paragraphs: [
            'The template ships three ways to access the same blueprint. The app is where people read, compare, and present. The in-app agent drafts changes in place, using the same write path the interface uses; it asks you to sign in and bring your own model key. Agentic tools reach the same rows from an IDE or a terminal, where the skills run.',
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
            'A **service** is organized into **phases**, and phases can loop back to earlier ones to model repeat visits or renewals without duplicating the journey. Each phase contains **scenarios** that represent the different situations an actor might be in, and each scenario contains **paths** that show the different ways that situation can unfold, including the expected path and variations where something changes or goes wrong. Each path is shown as a grid.',
          ],
          figure: packageCoverFigures.dataModelHierarchy,
        },
        {
          kind: 'prose',
          id: 'blueprints-path',
          heading: 'Inside one path',
          paragraphs: [
            'Each path is a grid. Lanes are rows, with one actor per lane, and steps are columns, moving from left to right over time. A **cell** is where a lane and step meet, showing what that actor does at that moment. Arrows show **dependencies** between cells.',
            'The **line of interaction**, **line of visibility**, and **line of internal interaction** are generated from the roles of the lanes, so they always stay aligned with the actors they separate. Steps are defined at the scenario level, and each path uses the relevant steps in its own order, making different paths easier to compare precisely.',
          ],
          figure: packageCoverFigures.blueprintAnatomy,
        },
        {
          kind: 'prose',
          id: 'blueprints-cell',
          heading: 'Inside one cell',
          paragraphs: [
            "A cell captures one actor's action at one step, along with the context around it. It shows where the action sits in the blueprint, what happens, what form it takes, and the value it creates. It also records both who **owns** the action and who the customer believes owns it, since those are not always the same.",
            'Each cell can also include supporting **evidence**, linked resources, and **dependencies**: what leads to the action, what it leads to, what enables it, and what it enables. It also shows which slices reference that cell, so you can see which views would be affected if it changed.',
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
            'A blueprint is complete by design, but that can make it too much for one audience or question. A **slice** is a focused view built from an ordered set of cells, with its own title and caption.',
            'Slices reference the original cells instead of copying them. That means they stay connected to the source, so when the blueprint changes, the slice does not become an outdated snapshot.',
            'A slice opens in its own tab beside the blueprint, making it easy to move between the focused view and the full service. In presentation mode, it can also be viewed slide by slide. Both the slice and individual presentation slides can be linked directly, so you can share exactly what you are looking at.',
          ],
          figure: packageCoverFigures.sliceConcept,
        },
        {
          kind: 'defs',
          id: 'slices-types',
          heading: 'Five ways to slice',
          columns: { term: 'Type', definition: 'What it selects' },
          items: [
            {
              term: 'journey',
              definition: 'One actor, and the cells in other lanes that theirs connect to.',
            },
            {
              term: 'step',
              definition: 'One moment, across every lane at that step.',
            },
            { term: 'lane', definition: 'One lane, across every step of the path.' },
            { term: 'cell', definition: 'One cell in full.' },
            {
              term: 'custom',
              definition: 'A view built around a question the other four shapes do not already name.',
            },
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
            'Four Claude Code skills help maintain the blueprint without relying on someone to keep it updated by hand. Each skill has its own playbooks, scripts, and references, and each ends with a clear validation step, such as a validator check, sign-off, or matching read-back.',
            'More intensive analysis runs in fresh-context agents that return a summary rather than carrying all of the source material forward. This helps catch issues the original drafting context may be too anchored on.',
          ],
          figure: packageCoverFigures.skillArchitecture,
        },
        {
          kind: 'skill',
          id: 'skills-map',
          command: '/ub:map',
          summary:
            'Builds a blueprint from what you already have (such as existing documents, a working session, or another service diagram). Each scenario is reviewed and signed off before the finished blueprint is imported into the workspace.',
          figure: packageCoverFigures.ubMap,
        },
        {
          kind: 'skill',
          id: 'skills-audit',
          command: '/ub:audit',
          summary:
            'Checks the blueprint for anything missing, conflicting, or unowned. It produces findings for review, but does not make changes to the blueprint itself.',
          figure: packageCoverFigures.ubAudit,
        },
        {
          kind: 'skill',
          id: 'skills-whatif',
          command: '/ub:whatif',
          summary:
            'Traces a proposed change through the dependency graph before it is made. It shows which cells would be affected and which assumptions might break, working from a copy rather than the live blueprint.',
          figure: packageCoverFigures.ubWhatif,
        },
        {
          kind: 'skill',
          id: 'skills-slice',
          command: '/ub:slice',
          summary:
            'Creates a focused view of the blueprint for a specific stakeholder or question. Each slice continues to reference the original cells it came from.',
          figure: packageCoverFigures.ubSlice,
        },
        {
          kind: 'prose',
          id: 'skills-outro',
          paragraphs: [
            'These skills run where you write code, not on this page. Install the repository as a plugin and ask for what you need.',
          ],
        },
      ],
      link: { label: 'Learn more →', docPath: 'docs/guide/03-the-plugin.md' },
    },
  ],
}
