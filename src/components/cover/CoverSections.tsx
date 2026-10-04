import { useState } from 'react'
import type { ReactNode } from 'react'
import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import { CoverCommandCopy } from '@/components/cover/CoverCommandCopy'
import { CoverFigure } from '@/components/cover/CoverFigure'
import { renderInline } from '@/components/cover/coverInline'
import type {
  CoverFigure as CoverFigureModel,
  CoverGuideLink,
  CoverPortraitImage,
  CoverSection,
} from '@/components/cover/coverModel'
import { COVER_MEASURE } from '@/components/cover/coverMeasure'
import { servedUrl } from '@/lib/basePath'
import { cn } from '@/lib/utils'

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-lg font-medium tracking-tight text-foreground sm:text-xl">
      {children}
    </h3>
  )
}

function Paragraph({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-foreground sm:text-base">
      {children}
    </p>
  )
}

/**
 * One layout for every section on the page: prose first, figure below it at
 * full width. No side-by-side variant — a page that mixes the two reads as
 * two designs, and the wide figures were the only ones that ever qualified.
 *
 * An absent figure is the ordinary empty-slot case: the prose renders alone,
 * with nothing standing in for the missing plate.
 */
/**
 * Image beside text — a logomark or a framed illustration next to a
 * heading. `badge` and `framed` are the two treatments the deployments that
 * carry this section actually use; see CoverPortraitImage for why they
 * differ.
 */
function Portrait({
  image,
  heading,
  children,
}: {
  image: CoverPortraitImage
  heading?: string
  children: ReactNode
}) {
  /*
    Stacked, not side by side — side-by-side rows were tried twice and
    dropped both times, since a row split the section's width unevenly
    against every other block on the page, reading as its own small layout
    system rather than a continuation of the page's.

    Title, then the image, then the text. The heading now renders on its
    own, ahead of the image, rather than sharing a wrapper with the
    paragraphs that follow it — a portrait names what it is before it shows
    it, the same order a labeled photo reads in print.
  */
  const picture = (
    <img
      src={servedUrl(image.src)}
      alt={image.alt}
      loading="lazy"
      decoding="async"
      /*
        One size for both variants — this used to be size-16/20 for
        `badge` against size-32/40 for `framed`, so a logomark and an
        illustration sat on the same tab at twice the scale of each other
        with no reason a reader could see for the difference. `badge` and
        `framed` still mean different TREATMENTS (no border vs bordered
        white card, cover vs contain) — that distinction is real, since one
        asset reads on any ground and the other was authored for its own
        light one. Size was never part of what the two names meant; it was
        just left unset per variant and drifted.
      */
      className={cn(
        'size-20 shrink-0 object-cover sm:size-24',
        image.size === 'badge'
          ? 'rounded-xl'
          : 'rounded-xl border border-border bg-white object-contain p-1',
      )}
    />
  )

  return (
    <div className={cn('flex flex-col gap-4', COVER_MEASURE)}>
      {heading ? <SectionHeading>{heading}</SectionHeading> : null}
      {/*
        The `framed` illustration opens; the `badge` logomark does not.

        The variants are not two looks for one kind of picture — see
        `CoverPortraitImage`, where `framed` is "an illustration authored for
        its own light ground" and `badge` is "a logomark or icon". An
        illustration is content, and at 80px on the page it is exactly the
        kind of picture this viewer exists for. A logomark is iconography,
        and opening a brand mark fullscreen is the same mistake the
        touchpoint logos are deliberately spared: it teaches the reader that
        the openable affordance is decoration rather than a promise there is
        more to see.
      */}
      {image.size === 'framed' ? (
        <ZoomableImage
          src={image.src}
          alt={image.alt}
          triggerLabel={`Expand: ${image.alt}`}
          // `w-fit`, because a button in a flex column stretches and the
          // image it wraps does not — without it the hit target runs the
          // width of the measure with 80px of picture at one end of it.
          triggerClassName="w-fit cursor-pointer"
        >
          {picture}
        </ZoomableImage>
      ) : (
        picture
      )}
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  )
}

function FigureStack({
  figure,
  eager,
  children,
}: {
  figure?: CoverFigureModel
  eager?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className={cn('flex min-w-0 flex-col gap-2', COVER_MEASURE)}>
        {children}
      </div>
      {figure ? <CoverFigure figure={figure} eager={eager} /> : null}
    </div>
  )
}

/**
 * A defs list is a two-column table, not a loose run of pairs: a header row
 * on a muted ground, bordered rows, and the term column carrying the weight.
 * Every colour is a token, so both themes follow the same rules.
 *
 * One type rung below the page's prose (`text-sm`, not `text-sm sm:text-base`).
 * A table is denser than a paragraph — two columns, a header row, five-plus
 * data rows in view at once — and running it at paragraph size read heavier
 * than the prose around it despite carrying less per row. The display floor
 * is `sm`, so the step below the desktop `base` prose is the floor rather
 * than a caption rung.
 */
function DefsTable({
  columns,
  items,
}: {
  columns: { term: string; definition: string }
  items: { term: string; definition: string }[]
}) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-border',
        COVER_MEASURE,
      )}
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th
              scope="col"
              className="border-b border-border px-4 py-2 font-medium text-foreground"
            >
              {columns.term}
            </th>
            <th
              scope="col"
              className="border-b border-border px-4 py-2 font-medium text-foreground"
            >
              {columns.definition}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.term}
              className={cn(index > 0 && 'border-t border-border')}
            >
              <th
                scope="row"
                className="w-44 px-4 py-3 align-top font-medium text-foreground"
              >
                {item.term}
              </th>
              <td className="px-4 py-3 align-top text-foreground">
                {renderInline(item.definition)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The guide link — inline text, never a button row.
 *
 * It reads the brand's own ink, because a link IS one of the four jobs the
 * brand hue has (they are pinned in `palette.test.ts`) and this is the only
 * prose link the app renders. `--text-brand` is role ink on a neutral ground,
 * measured against the page at 4.5:1, so a deployment's hue arrives here
 * legible and the template — whose brand chroma is zero — still draws grey.
 */
function GuideLink({ link, repoUrl }: { link: CoverGuideLink; repoUrl: string }) {
  const href = `${repoUrl.replace(/\/+$/, '')}/blob/main/${link.docPath}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-text-brand underline underline-offset-4 transition-colors motion-reduce:transition-none duration-(--motion-structural) ease-arrive hover:text-foreground sm:text-base"
    >
      {link.label}
    </a>
  )
}

/** One skill's title, summary, and illustration — nothing else. Shared
 * by the tabbed group below and by any lone `skill` section that is not
 * grouped into one (schema completeness; the content this repo ships always
 * groups them). */
function SkillPanel({
  section,
  commandCopy,
  eager,
}: {
  section: Extract<CoverSection, { kind: 'skill' }>
  commandCopy: { copyLabel: string; copiedLabel: string }
  eager: boolean
}) {
  /*
    Title, summary, illustration — then the copy action, below the
    figure rather than riding on the title. The copy control used to double as the
    heading, which put a click-to-copy control at the top of the panel
    where a reader's eye lands first, ahead of any reason to copy it: you
    do not know you want the command until you have read what it does and
    seen the diagram. The plain-text heading now answers "what is this",
    and the button at the bottom answers "take it with you" once the panel
    has made its case.
  */
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-lg font-medium tracking-tight text-foreground">
        {section.command}
      </h3>
      <Paragraph>{renderInline(section.summary)}</Paragraph>
      {section.figure ? (
        <CoverFigure figure={section.figure} eager={eager} />
      ) : null}
      <div>
        <CoverCommandCopy
          command={section.command}
          copyLabel={commandCopy.copyLabel}
          copiedLabel={commandCopy.copiedLabel}
        />
      </div>
    </div>
  )
}

/**
 * The four skills as a secondary navigation, not a stacked list.
 *
 * Deliberately NOT styled like `CoverTabStrip` — an underlined row reading
 * as a second, competing set of top-level tabs would make the page look
 * like it has two navigation systems fighting for the same rank. This is a
 * segmented control instead: a segmented row on a recessed track, which reads as
 * "a control that belongs to the section below it" rather than "another way
 * to leave this page."
 */
function SkillTabs({
  sections,
  commandCopy,
  eagerFirst,
}: {
  sections: Extract<CoverSection, { kind: 'skill' }>[]
  commandCopy: { copyLabel: string; copiedLabel: string }
  eagerFirst: boolean
}) {
  const [active, setActive] = useState(0)
  const current = sections[Math.min(active, sections.length - 1)]
  if (!current) return null

  return (
    <section className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Skills"
        className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1"
      >
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={cn(
              'rounded-full px-4 py-2 font-mono text-sm transition-colors motion-reduce:transition-none duration-(--motion-structural) ease-arrive',
              index === active
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {section.command}
          </button>
        ))}
      </div>
      <SkillPanel
        section={current}
        commandCopy={commandCopy}
        eager={eagerFirst && active === 0}
      />
    </section>
  )
}

export function CoverSections({
  intro,
  sections,
  link,
  repoUrl,
  commandCopy,
  eagerFigures = false,
}: {
  intro?: string
  sections: CoverSection[]
  link?: CoverGuideLink
  repoUrl?: string
  commandCopy: { copyLabel: string; copiedLabel: string }
  /** The visible-on-load tab decodes its first figure eagerly. */
  eagerFigures?: boolean
}) {
  let figuresSeen = 0

  /*
    Skills are grouped and rendered once, via the tab control below, rather
    than stacked in place — four named things in a row read better as one
    switcher than as four sections of equal weight. Everything else keeps
    its original order and rendering; only the skill sections leave the
    stack.
  */
  const otherSections = sections.filter((section) => section.kind !== 'skill')
  const skillSections = sections.filter(
    (section): section is Extract<CoverSection, { kind: 'skill' }> =>
      section.kind === 'skill',
  )

  return (
    <div className="flex flex-col gap-10">
      {intro ? (
        <p
          className={cn(
            'text-sm text-foreground sm:text-base',
            COVER_MEASURE,
          )}
        >
          {renderInline(intro)}
        </p>
      ) : null}

      {otherSections.map((section) => {
        // Portraits are never the eager figure: they are small and never
        // the first thing on a tab in practice, so `in` alone (no read of
        // `.image`) keeps this a plain existence check, same as `.figure`.
        const hasImage = ('figure' in section && section.figure) || 'image' in section
        const eager = eagerFigures && hasImage ? figuresSeen++ === 0 : false

        switch (section.kind) {
          case 'prose':
            return (
              <section key={section.id} className="flex flex-col gap-2">
                <FigureStack figure={section.figure} eager={eager}>
                  {section.heading ? (
                    <SectionHeading>{section.heading}</SectionHeading>
                  ) : null}
                  {section.paragraphs.map((paragraph, index) => (
                    <Paragraph key={index}>{renderInline(paragraph)}</Paragraph>
                  ))}
                </FigureStack>
              </section>
            )
          case 'figure':
            return (
              <section key={section.id} className="flex flex-col gap-4">
                {section.heading ? (
                  <SectionHeading>{section.heading}</SectionHeading>
                ) : null}
                <CoverFigure figure={section.figure} eager={eager} />
              </section>
            )
          case 'defs':
            return (
              <section key={section.id} className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                  <div
                    className={cn('flex min-w-0 flex-col gap-2', COVER_MEASURE)}
                  >
                    {section.heading ? (
                      <SectionHeading>{section.heading}</SectionHeading>
                    ) : null}
                    {section.intro ? (
                      <Paragraph>{renderInline(section.intro)}</Paragraph>
                    ) : null}
                  </div>
                  <DefsTable columns={section.columns} items={section.items} />
                </div>
                {section.figure ? (
                  <CoverFigure figure={section.figure} eager={eager} />
                ) : null}
              </section>
            )
          case 'portrait':
            return (
              <section key={section.id}>
                <Portrait image={section.image} heading={section.heading}>
                  {section.paragraphs.map((paragraph, index) => (
                    <Paragraph key={index}>{renderInline(paragraph)}</Paragraph>
                  ))}
                </Portrait>
              </section>
            )
          // No `case 'skill'` here: `otherSections` above is filtered to
          // exclude it, and TS proves the exclusion, so a skill section
          // never reaches this switch. It always renders through
          // `SkillTabs` below instead.
        }
      })}

      {skillSections.length > 0 ? (
        <SkillTabs
          sections={skillSections}
          commandCopy={commandCopy}
          eagerFirst={eagerFigures && figuresSeen === 0}
        />
      ) : null}

      {link && repoUrl ? <GuideLink link={link} repoUrl={repoUrl} /> : null}
    </div>
  )
}
