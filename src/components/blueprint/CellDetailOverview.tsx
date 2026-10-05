import { CellContentSection } from '@/components/blueprint/CellContentSection'
import { CellOverviewSpec } from '@/components/blueprint/CellOverviewSpec'
import { CellPanelEditor } from '@/components/blueprint/CellPanelEditor'
import { Field, PanelIdentity, PanelKindBadge } from '@/components/blueprint/panelShell'
import { FeaturedButtons } from '@/components/blueprint/FeaturedResources'
import { ZoomableImage } from '@/components/blueprint/ZoomableImage'
import {
  TOUCHPOINT_ROLE_DEFINITION,
  TOUCHPOINT_ROLE_LABEL,
} from '@/lib/touchpointRole'
import { servedUrl } from '@/lib/basePath'
import { shouldUseTouchpointCellContent } from '@/lib/blueprintLayout'
import { isBlueprintStepStoryboardPlaceholder } from '@/lib/blueprintStoryboardPlaceholder'
import { useTouchpointToneResolver } from '@/hooks/useTouchpointToneResolver'
import { PANEL_TERMS } from '@/lib/panelTerms'
import type { CellOverviewFacts } from '@/components/blueprint/cellDetailFacts'
import type { BlueprintCellSelection } from '@/types/blueprintCellDetail'
import type { ReactNode } from 'react'

/** Fixed panel and illustration frame so every row/step uses the same size. */
const CELL_DETAIL_PICTURE_FRAME_CLASS =
  'relative aspect-[4/3] w-full max-w-full shrink-0 overflow-hidden rounded-lg bg-muted/20'
const CELL_DETAIL_PICTURE_CLASS =
  'absolute inset-0 h-full w-full object-contain object-center'
const CELL_DETAIL_LOGO_CLASS =
  'size-32 shrink-0 rounded-lg bg-muted/20 p-2 object-contain object-center'

/**
 * The top of the details surface: the picture, who this cell is, and either
 * the form over its fields or the read-only rows of them.
 *
 * Everything here is a READING of the facts — which sentence is the title,
 * whether the touchpoint's name repeats it, whether a summary would be the
 * same words twice. The facts themselves are resolved once from the selected
 * cell and arrive as this reader's own narrow set; nothing below re-derives
 * one, and nothing below can reach a fact it was not given.
 */
export function CellDetailOverview({
  facts,
  selection,
  laneBadge,
  editingCell,
  onDone,
}: {
  facts: CellOverviewFacts
  selection: BlueprintCellSelection
  laneBadge: ReactNode
  editingCell: boolean
  onDone: () => void
}) {
  const {
    cellId,
    frame,
    touchpoints,
    lane: selectedLane,
    placement,
    touchpointDetail,
    featured,
  } = facts
  /*
    The touchpoint badge's colour. A resolver rather than a value because the
    label it is about is worked out below, from the placement and the lane.
  */
  const resolveTouchpointTone = useTouchpointToneResolver()
  const cellContent =
    selection.paths[0]?.content.trim() ||
    selection.techItem ||
    ''
  const detailBodyText = touchpointDetail?.text ?? cellContent
  const isTechLane = Boolean(
    selectedLane && shouldUseTouchpointCellContent(selectedLane),
  )
  /*
    The touchpoint's name, where there IS one to name.

    `isTechLane` alone was the test, and it is right for the general case: on
    an actor lane a cell's content is a sentence, and naming it "the
    touchpoint" would be the label join a placement row exists to unwind. But
    it is wrong for a cell that carries a real placement on a lane that does
    not draw touchpoints — a document or a recording attached to a support
    row — which had its summary rendered while the name it belongs to was
    suppressed.

    A row id is what tells the two apart: only a real `cell_touchpoints` row
    has one. So the field appears wherever the placement is real, which is
    also what gives the role badge below a reader on those cells — a control
    an author can set and nobody can see is the shape this panel exists to
    avoid, and it would have been reintroduced here.
  */
  const hasRealPlacement = Boolean(placement?.id)
  const techDetailLabel =
    isTechLane || hasRealPlacement ? (touchpointDetail?.name ?? null) : null
  const detailSummaryText =
    techDetailLabel && detailBodyText.trim() === techDetailLabel
      ? ''
      : detailBodyText
  // The featured image is the frame: what is stored is what shows.
  const storedFrame = frame?.trim() || null
  const featuredImage =
    storedFrame && !isBlueprintStepStoryboardPlaceholder(storedFrame)
      ? storedFrame
      : null
  // A logo when it IS the registry icon of a touchpoint placed here — a string
  // on the registry row, not a tool name matched against a table in code.
  const frameIsLogo = touchpoints.some(
    (placement) => placement.iconUrl?.trim() === featuredImage,
  )
  // No `&& !isStoryboardLane` term: a storyboard cell never reaches this
  // component — the panel renders the storyboard stack instead of it.
  const showImages = Boolean(featuredImage)
  // Widened from "is a touchpoint lane" to "names a touchpoint at all", so a
  // real placement on a lane that draws no touchpoints still shows its name
  // — see `hasRealPlacement`.
  const showTouchpoint = Boolean(techDetailLabel)

  // Panel v2 header: title is the cell content snippet; the lane appears as
  // one role-colored badge (colored by lane_role, never by name).
  const cellTitleText =
    cellContent.split('\n')[0]?.trim() || selection.laneName

  /*
    One image: the frame, which is the cell's featured image. Nothing else
    leads — not a featured attachment, not a logo row beside it. A frame that
    IS a placed touchpoint's registry icon is drawn at the logo size and stays
    inert: there is nothing inside a brand mark to read closer, and making one
    open a viewer spends the signal a real picture depends on.
  */
  const imageBlock = showImages && featuredImage ? (
    <div className="flex w-full flex-col items-center gap-3">
      {frameIsLogo ? (
        <img src={servedUrl(featuredImage)} alt="" className={CELL_DETAIL_LOGO_CLASS} />
      ) : (
        <div className={CELL_DETAIL_PICTURE_FRAME_CLASS}>
          <ZoomableImage
            src={featuredImage}
            alt={cellTitleText}
            triggerLabel={`Expand: ${cellTitleText}`}
            triggerClassName="absolute inset-0 block cursor-pointer"
          >
            <img src={servedUrl(featuredImage)} alt="" className={CELL_DETAIL_PICTURE_CLASS} />
          </ZoomableImage>
        </div>
      )}
    </div>
  ) : null

  // A touchpoint that says exactly what the title says is the title twice —
  // one of them yields. The touchpoint keeps its own identity; the plain-text
  // title only renders when it adds words the touchpoint does not have. Same
  // rule for the summary paragraph: a cell with no authored summary falls back
  // to its own content, and printing the title again as "summary" is the
  // same word twice pretending to be two facts.
  const titleRepeatsTouchpoint =
    showTouchpoint && techDetailLabel?.trim() === cellTitleText.trim()
  const summaryRepeatsTitle =
    detailSummaryText.trim() === cellTitleText.trim() ||
    detailSummaryText.trim() === cellContent.trim()

  /* The LANE badge leads, on a touchpoint cell as on every other kind. It is
     the row the reader clicked in, and the tool badge beside it is one of
     possibly several things that row holds — so the tool reading first made a
     touchpoint cell the only cell whose identity block started somewhere
     other than its lane. */
  const identityBadges = (
    <div className="flex min-w-0 flex-wrap items-center gap-2">{laneBadge}</div>
  )

  /*
    The touchpoint, as a LABELLED field rather than a second badge beside the
    lane.

    Two badges in a row read as two facts of the same kind — "this row, and
    also this row" — when they are a lane and the tool used in it. Naming the
    field says which is which, and it matches how Owner already presents a
    value: label above, value below. The definition rides the label's own
    hint popover, the affordance every other field label uses.

    Not while editing a real placement: the editor's touchpoint block opens
    with the same field, and one name shown twice reads as two touchpoints.
  */
  const touchpointField = showTouchpoint && !(editingCell && hasRealPlacement) ? (
    <Field label="Touchpoint" hint={PANEL_TERMS.touchpoint}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <PanelKindBadge
          label={techDetailLabel!}
          tone={resolveTouchpointTone(techDetailLabel!)}
          title={techDetailLabel!}
        />
        {/*
          ROLE, beside the name it qualifies, and ONLY when somebody set it.

          Nothing renders for the unmarked case — no badge, no dash, no
          "Unmarked". Most placements will never be marked, and a grey badge
          on all of them would put a judgement on screen that nobody made,
          which is the specific misreading the column has to avoid. Absence is
          the honest rendering of "not judged", and it is what tells the
          unmarked case apart from a placement someone deliberately called
          peripheral.

          Nor while EDITING: the form below carries the same fact as a
          control, and a badge beside a select for one value is two mechanisms
          for one fact.
        */}
        {!editingCell && touchpointDetail?.role ? (
          <PanelKindBadge
            label={TOUCHPOINT_ROLE_LABEL[touchpointDetail.role]}
            title={TOUCHPOINT_ROLE_LABEL[touchpointDetail.role]}
            description={TOUCHPOINT_ROLE_DEFINITION[touchpointDetail.role]}
          />
        ) : null}
      </div>
    </Field>
  ) : null

  return (
    <>
      {imageBlock}
      {!editingCell && featured.buttons.length > 0 ? (
        <FeaturedButtons buttons={featured.buttons} className="px-1" />
      ) : null}
      {/*
        Identity, then prose — one group, tight spacing.

        A touchpoint cell used to STACK a round tool badge above a differently
        sized lane badge, and the summary then floated away from both behind a
        `-mt-3` correction. Two badges naming two things about one cell belong
        side by side at one size, and the sentence about the cell belongs
        directly under the name of it.
      */}
      <div className="flex min-w-0 flex-col gap-2">
        {/* In edit mode the form's CONTENT field *is* the title; repeating it
            above the field would be the same word twice on one screen. */}
        {editingCell ? (
          identityBadges
        ) : (
          <PanelIdentity
            badge={identityBadges}
            // Empty when the touchpoint field below already carries it.
            title={titleRepeatsTouchpoint ? '' : cellTitleText}
            meta={
              selection.paths.length > 1
                ? `${selection.paths.length} paths`
                : ''
            }
          />
        )}
        {touchpointField}
        {/* LABELLED, like every other panel's summary. This was the one place
            in five panels where a field's read-only rendering skipped the
            label and printed bare prose, which is why "Summary" appeared on
            some things and not others. The editor shows the same text inside
            its own Summary field. */}
        {!editingCell && detailSummaryText.trim() && !summaryRepeatsTitle ? (
          <Field label="Summary" hint="What the detail fields add up to.">
            <p className="whitespace-pre-wrap text-sm font-normal text-foreground">
              {detailSummaryText.trim()}
            </p>
          </Field>
        ) : null}
      </div>
      {editingCell ? (
        <CellPanelEditor
          cellId={cellId}
          // The placement the reader clicked, so its detail fields join the
          // cell's form under one Save rather than arriving as a second
          // editor with a second Save button.
          placement={placement}
          // Never seed the field with the title wearing a summary's
          // clothes — only prose that actually says more than the cell text.
          fallbackSummary={
            summaryRepeatsTitle ? '' : detailSummaryText.trim()
          }
          onDone={onDone}
        />
      ) : (
        <>
          {/* Basic info (text, summary, owners) first; the function/form/
              value spec is a deeper layer of the same cell and reads below it. */}
          <CellContentSection cellId={cellId} />
          <CellOverviewSpec cellId={cellId} />
        </>
      )}
    </>
  )
}
