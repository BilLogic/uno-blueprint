/**
 * Dev-only situation catalog page — the visual half of the parity net.
 *
 * Renders every situation (S1–S10 from the plan, plus S11's co-traveller
 * corridor) across the three view modes, drawing the arrows the engine
 * produces so each case can be eyeballed as Direction-B slices land. It shares
 * its fixtures and its geometry
 * with the golden-snapshot test (`arrowSituationCatalog.ts`), so what you see
 * here is exactly what the parity gate freezes.
 *
 * Mounted only by `main.tsx` under `import.meta.env.DEV` at `/proto/arrows`;
 * the guard is statically false in a production build, so this module and its
 * catalog never reach real users.
 */

import { useMemo } from 'react'
import {
  ARROW_SITUATIONS,
  ARROW_VIEW_MODES,
  boardForMode,
  computeSituationSegments,
  materialize,
  type ArrowViewMode,
  type BoardSpec,
  type SituationSpec,
} from './arrowSituationCatalog'

const ARROW_COLOR = '#2563eb'

function SituationBoard({
  board,
  markerId,
}: {
  board: BoardSpec
  markerId: string
}) {
  const material = useMemo(() => materialize(board), [board])
  const segments = useMemo(() => computeSituationSegments(board), [board])

  const width = material.rootBox.width
  const height = material.rootBox.height

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        flex: '0 0 auto',
        background:
          'repeating-linear-gradient(0deg,#fafafa,#fafafa 23px,#f0f0f0 24px),' +
          'repeating-linear-gradient(90deg,#fafafa,#fafafa 23px,#f0f0f0 24px)',
        border: '1px solid #e2e2e2',
        borderRadius: 6,
      }}
    >
      {material.elements.map((el) => {
        const isCell = 'data-blueprint-cell' in el.attrs
        const isRow = 'data-blueprint-row' in el.attrs
        const isCorridor = 'data-blueprint-wrap-corridor' in el.attrs
        const isGap = 'data-step-gap' in el.attrs
        const isMergeAlt = el.key.endsWith('--merge-alt')
        return (
          <div
            key={el.key}
            style={{
              position: 'absolute',
              left: el.box.left,
              top: el.box.top,
              width: el.box.width,
              height: el.box.height,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              ...(isRow
                ? { outline: '1px dashed rgba(150,150,150,0.4)' }
                : {}),
              ...(isGap
                ? { background: 'rgba(59,130,246,0.05)' }
                : {}),
              ...(isCorridor
                ? {
                    border: '1px dashed rgba(217,119,6,0.5)',
                    background: 'rgba(217,119,6,0.06)',
                  }
                : {}),
              ...(isCell
                ? {
                    border: `1px solid ${isMergeAlt ? '#c4b5fd' : '#94a3b8'}`,
                    background: isMergeAlt
                      ? 'rgba(196,181,253,0.18)'
                      : '#ffffff',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: '#475569',
                  }
                : {}),
            }}
          >
            {isCell ? el.attrs['data-blueprint-cell'] : null}
          </div>
        )
      })}

      <svg
        width={width}
        height={height}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}
        aria-hidden
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="1"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={ARROW_COLOR} />
          </marker>
        </defs>
        {segments.map((segment) => (
          <path
            key={segment.id}
            d={segment.d}
            fill="none"
            stroke={ARROW_COLOR}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={
              segment.showMarker === false ? undefined : `url(#${markerId})`
            }
          />
        ))}
      </svg>
    </div>
  )
}

function ModeColumn({
  situation,
  mode,
}: {
  situation: SituationSpec
  mode: ArrowViewMode
}) {
  const reason = situation.unsupported?.[mode]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#334155',
        }}
      >
        {mode}
      </div>
      {reason ? (
        <div
          style={{
            width: 320,
            padding: '12px 14px',
            fontSize: 12,
            color: '#64748b',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: 6,
          }}
        >
          not applicable — {reason}
        </div>
      ) : (
        <div style={{ maxWidth: 640, maxHeight: 340, overflow: 'auto' }}>
          <SituationBoard
            board={boardForMode(situation.base(), mode)}
            markerId={`arrow-${situation.id}-${mode}`}
          />
        </div>
      )}
    </div>
  )
}

function SituationSection({ situation }: { situation: SituationSpec }) {
  return (
    <section
      style={{
        padding: '20px 0',
        borderTop: '1px solid #e2e8f0',
      }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>
        <span style={{ color: '#2563eb', fontWeight: 700 }}>{situation.id}</span>
        {'  '}
        {situation.title}
      </h2>
      <dl
        style={{
          margin: '0 0 14px',
          fontSize: 12,
          color: '#475569',
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          columnGap: 10,
          rowGap: 2,
          maxWidth: 760,
        }}
      >
        <dt style={{ fontWeight: 600 }}>today</dt>
        <dd style={{ margin: 0 }}>{situation.today}</dd>
        <dt style={{ fontWeight: 600 }}>contract</dt>
        <dd style={{ margin: 0 }}>{situation.contract}</dd>
        <dt style={{ fontWeight: 600 }}>fixture</dt>
        <dd style={{ margin: 0 }}>{situation.note}</dd>
      </dl>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {ARROW_VIEW_MODES.map((mode) => (
          <ModeColumn key={mode} situation={situation} mode={mode} />
        ))}
      </div>
    </section>
  )
}

export function ArrowSituationCatalogPage() {
  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: '32px 24px 80px',
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        color: '#0f172a',
      }}
    >
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>
          Arrow routing — situation catalog
        </h1>
        <p style={{ fontSize: 13, color: '#475569', margin: 0, maxWidth: 820 }}>
          The trigger-line plan&rsquo;s S1–S10 catalog, plus S11&rsquo;s
          co-traveller corridor, drawn with the current arrow engine.
          This is the record the Direction-B parity gate diffs against.
          Dev-only route — it ships nothing to production.
        </p>
      </header>
      {ARROW_SITUATIONS.map((situation) => (
        <SituationSection key={situation.id} situation={situation} />
      ))}
    </main>
  )
}
