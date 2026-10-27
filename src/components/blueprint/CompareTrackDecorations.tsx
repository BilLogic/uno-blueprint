import { Fragment } from 'react'
import { STRUCTURE_PLACEHOLDER_ID } from '@/lib/structureDraftPreview'
import { StepHeaderAffordance } from '@/components/blueprint/StepHeaderAffordance'
import type { CompareGridTrack } from '@/lib/compareGridTracks'

/**
 * The chrome that belongs to the compare column AXIS rather than to any one
 * path: the step-name header row. Both compare canvases (stacked bands,
 * merged grid) draw the same axis, so they draw it with the same component.
 * (Pleats and the divergent-column tint were retired 2026-08-17.)
 */

/** Step names above the canvas. */
export function CompareStepHeaderRow({
  tracks,
  pathId,
}: {
  pathId?: string
  tracks: readonly CompareGridTrack[]
}) {
  return (
    <>
      {tracks.map((track, trackIndex) =>
        track.seamSize !== undefined ? (
          <div
            key={track.key}
            aria-hidden
            data-structure-seam-track="step"
            style={{ gridColumn: trackIndex + 2, gridRow: 1 }}
          />
        ) : (
          <Fragment key={track.key}>
            {Object.values(track.stepIdByPath).includes(
              STRUCTURE_PLACEHOLDER_ID,
            ) ? (
              <div
                aria-hidden
                data-structure-insert-zone="step"
                className="pointer-events-none z-50"
                style={{ gridColumn: trackIndex + 2, gridRow: '1 / -1' }}
              />
            ) : null}
            <StepHeaderAffordance
              // The selected path owns the click context, even when another
              // path inserted this canonical track into the lookup first.
              stepIndex={trackIndex}
              pathId={pathId}
              stepId={
                (pathId ? track.stepIdByPath[pathId] : undefined) ??
                Object.values(track.stepIdByPath)[0] ??
                ''
              }
              name={track.label}
              // `relative z-1`: when a path frame extends up to wrap this
              // row (single-path stacked, merged), the frame's opaque fill is
              // an absolutely-positioned later sibling — without a stacking
              // order the labels paint UNDER it and the header "vanishes".
              // `self-stretch`, not `self-end`: the target is the whole header
              // block. The label still sits at the bottom of it — the button
              // aligns its own content — so it reads where it always did.
              className="z-1 self-stretch"
              style={{ gridColumn: trackIndex + 2, gridRow: 1 }}
            />
          </Fragment>
        ),
      )}
    </>
  )
}
