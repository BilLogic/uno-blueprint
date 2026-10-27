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
}: {
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
              // A canonical column can carry a different step id per path; they
              // are the same MOMENT, and the summary is stored once per step, so
              // the first is the one to open.
              stepIndex={trackIndex}
              pathId={Object.keys(track.stepIdByPath)[0]}
              stepId={Object.values(track.stepIdByPath)[0] ?? ''}
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
