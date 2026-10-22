// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { StepHeaderAffordance } from './StepHeaderAffordance'
import { ScenarioTitleBadge } from './ScenarioTitleBadge'
import { buildCompareModel } from '@/lib/compareSlots'
import { buildCompareGridTracks } from '@/lib/compareGridTracks'
import { CompareStepHeaderRow } from './CompareTrackDecorations'
import type { BlueprintData } from '@/types/blueprint'
import { EntityDetailProvider } from '@/contexts/EntityDetailContext'

afterEach(cleanup)
const summary = 'The person chooses how to receive support.'

it.each(['step', 'phase'] as const)('%s header reveals its summary on keyboard focus', async kind => {
  render(<EntityDetailProvider>{kind === 'step'
    ? <StepHeaderAffordance stepId="step" name="Arrival" summary={summary} />
    : <ScenarioTitleBadge tone="phase" name="Arrival" summary={summary} />}</EntityDetailProvider>)
  const trigger = document.querySelector<HTMLElement>(kind === 'step' ? '[data-blueprint-column-header]' : '[data-phase-title-badge]')!
  expect(trigger.tabIndex).toBe(0)
  act(() => trigger.focus())
  expect(document.activeElement).toBe(trigger)
  expect(within(await screen.findByRole('dialog')).getByText(summary)).not.toBeNull()
})

it.each(['step', 'phase'] as const)('%s header reveals its summary on hover', async kind => {
  render(<EntityDetailProvider>{kind === 'step'
    ? <StepHeaderAffordance stepId="step" name="Arrival" summary={summary} />
    : <ScenarioTitleBadge tone="phase" name="Arrival" summary={summary} />}</EntityDetailProvider>)
  const trigger = document.querySelector<HTMLElement>(kind === 'step' ? '[data-blueprint-column-header]' : '[data-phase-title-badge]')!
  const pointer = new MouseEvent('pointerover', { bubbles: true })
  Object.defineProperty(pointer, 'pointerType', { value: 'mouse' })
  fireEvent(trigger, pointer)
  fireEvent.mouseEnter(trigger)
  fireEvent.mouseMove(trigger)
  expect(within(await screen.findByRole('dialog', {}, { timeout: 1800 })).getByText(summary)).not.toBeNull()
})

it('a shared column keeps its step summary when paths are compared', async () => {
  const board: BlueprintData = {
    path: { id: 'path', name: 'Happy', summary: null, note: null, kind: 'happy', status: 'live' },
    steps: [{ id: 'step', name: 'Arrival', summary, position: 0 }], lanes: [], cells: [], dependencies: [],
  }
  const other = { ...board, path: { ...board.path, id: 'other', name: 'Other', kind: 'variant' as const } }
  const tracks = buildCompareGridTracks(buildCompareModel([board, other]), [board, other])
  render(<EntityDetailProvider><CompareStepHeaderRow tracks={tracks} /></EntityDetailProvider>)
  const header = document.querySelector<HTMLElement>('[data-blueprint-column-header]')!
  act(() => header.focus())
  expect(within(await screen.findByRole('dialog')).getByText(summary)).not.toBeNull()
})


it.each(['step', 'phase'] as const)('%s pointer focus does not open its definition before click', kind => {
  render(<EntityDetailProvider>{kind === 'step'
    ? <StepHeaderAffordance stepId="step" name="Arrival" summary={summary} />
    : <ScenarioTitleBadge tone="phase" name="Arrival" summary={summary} />}</EntityDetailProvider>)
  const trigger = document.querySelector<HTMLElement>(kind === 'step' ? '[data-blueprint-column-header]' : '[data-phase-title-badge]')!
  fireEvent.pointerDown(trigger)
  act(() => trigger.focus())
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('a step header has one keyboard door', () => {
  const { container } = render(<EntityDetailProvider><StepHeaderAffordance stepId="step" name="Arrival" summary={summary} /></EntityDetailProvider>)
  const header = container.querySelector<HTMLElement>('[data-blueprint-column-header]')!
  const stops = [header, ...header.querySelectorAll<HTMLElement>('button, [tabindex]')].filter(node => node.tabIndex >= 0)
  expect(stops).toHaveLength(1)
})
