import { PathLabelBadge } from '@/components/blueprint/PathLabelBadge'
import { PathKindBadge } from '@/components/blueprint/PathKindBadge'
import {
  getPathKindSectionBorderStyle,
  shouldShowPathKindBadge,
} from '@/lib/pathKindTheme'
import {
  blueprintPanelLabelRailColor,
  blueprintPanelSectionFillColor,
} from '@/lib/blueprintTheme'
import {
  COMPARE_PATH_SECTION_H_INSET,
  COMPARE_PATH_SECTION_TOP_INSET,
  COMPARE_PATH_SECTION_BOTTOM_INSET,
  COMPARE_STEP_HEADER_HEIGHT,
  COMPARE_LABEL_TRACK_WIDTH,
} from '@/lib/sideBySideCompareLayout'
import { LANE_COLUMN_WIDTH, STEP_COLUMN_GAP } from '@/lib/blueprintLayout'
import type { BlueprintData } from '@/types/blueprint'

/** Uniform inset for single-path service blueprint section frames. */
export const SERVICE_PATH_SECTION_INSET = 8
/**
 * The service grid's rail carries its own full-height divider, so the frame
 * starts where the step columns start rather than insetting back over it.
 * Without this the outline sat 8px INSIDE the rail, giving that view two
 * vertical lines 8px apart describing one edge.
 */
export const SERVICE_PATH_SECTION_LEFT_INSET = 0

type ComparePathSectionFrameProps = {
  blueprint: BlueprintData
  compact?: boolean
  /**
   * Extends the frame upward (px) so it also wraps the step-header row — step
   * names are facts about the path's columns and belong INSIDE the path frame.
   * The header row itself stays bare labels: no container of its own.
   */
  extraTopInset?: number
  /** When false, only the colored path outline is rendered (service blueprint). */
  showTitle?: boolean
  /**
   * Overview mode: prefer a path-type badge for generic names (Happy Path, etc.).
   * Named paths (Set Goals, …) always show their title.
   */
  showPathKindBadge?: boolean
  /** Compare uses extra top inset for the title badge; service uses uniform inset. */
  variant?: 'compare' | 'service'
  /** Row-axis labels sit outside the path boundary in every arrangement. */
  excludeLabelRail?: boolean
}

/** Figma-style section: path-type outline, grouped fill, optional title on the top edge. */
export function ComparePathSectionFrame({
  blueprint,
  compact,
  showTitle = true,
  showPathKindBadge = false,
  variant = 'compare',
  extraTopInset = 0,
  excludeLabelRail = false,
}: ComparePathSectionFrameProps) {
  const { path } = blueprint
  const pathBorder = getPathKindSectionBorderStyle(path.kind, path)
  const { borderColor, borderStyle, borderWidth } = pathBorder
  const sectionFill = blueprintPanelSectionFillColor()
  const useTypeBadge = showPathKindBadge && shouldShowPathKindBadge(path)
  const labelAxisOffset = excludeLabelRail
    ? variant === 'service'
      ? LANE_COLUMN_WIDTH
      : COMPARE_LABEL_TRACK_WIDTH + STEP_COLUMN_GAP
    : 0

  const inset =
    variant === 'compare'
      ? {
          top: -COMPARE_PATH_SECTION_TOP_INSET - extraTopInset,
          left: labelAxisOffset - COMPARE_PATH_SECTION_H_INSET,
          right: -COMPARE_PATH_SECTION_H_INSET,
          bottom: -COMPARE_PATH_SECTION_BOTTOM_INSET,
        }
      : {
          top: -SERVICE_PATH_SECTION_INSET,
          left: labelAxisOffset - SERVICE_PATH_SECTION_LEFT_INSET,
          right: -SERVICE_PATH_SECTION_INSET,
          bottom: -SERVICE_PATH_SECTION_INSET,
        }

  const titleTop =
    variant === 'compare'
      ? -COMPARE_PATH_SECTION_TOP_INSET - extraTopInset
      : -SERVICE_PATH_SECTION_INSET
  const titleLeft =
    variant === 'compare'
      ? labelAxisOffset - COMPARE_PATH_SECTION_H_INSET + 10
      : labelAxisOffset - SERVICE_PATH_SECTION_LEFT_INSET + 10

  return (
    <>
      <div
        aria-hidden
        data-structure-content-frame=""
        className="pointer-events-none absolute rounded-xl"
        style={{
          ...inset,
          borderWidth,
          borderStyle,
          borderColor,
          backgroundColor: sectionFill,
        }}
      />
      {extraTopInset > 0 ? (
        // The wrapped step-header row gets a light band — the horizontal
        // counterpart of the lane-label rail, one tint lighter so the two
        // axes read as related but distinct. Offset 3px inside the frame
        // edges so it never paints over the frame's border.
        //
        // Both axes at once: the band's left edge is taken from `inset.left`
        // rather than from the inset constant, so when the frame starts after
        // the label track the band starts there too. Written as a bare
        // `-COMPARE_PATH_SECTION_H_INSET + 3` it painted the header tint
        // straight across the lane-label rail.
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-t-[9px]"
          style={{
            top: inset.top + 3,
            left: inset.left + 3,
            right: inset.right + 3,
            height: COMPARE_STEP_HEADER_HEIGHT - 3,
            backgroundColor: `color-mix(in oklab, ${blueprintPanelLabelRailColor()} 45%, transparent)`,
          }}
        />
      ) : null}
      {showTitle ? (
        useTypeBadge ? (
          <PathKindBadge
            pathKind={path.kind}
            summary={path.summary}
            compact={compact}
            className="pointer-events-auto absolute z-50 max-w-[calc(100%-12px)]"
            style={{
              top: titleTop,
              left: titleLeft,
              transform: 'translateY(-50%)',
            }}
          />
        ) : (
          <PathLabelBadge
            name={path.name}
            summary={path.summary}
            pathKind={path.kind}
            compact={compact}
            className="pointer-events-auto absolute z-50 max-w-[calc(100%-12px)]"
            style={{
              top: titleTop,
              left: titleLeft,
              transform: 'translateY(-50%)',
            }}
          />
        )
      ) : null}
    </>
  )
}
