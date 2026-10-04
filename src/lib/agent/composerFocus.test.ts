// @vitest-environment jsdom
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ComposerInkedField } from '@/components/editor/agent/ComposerInkedField'
import { focusAgentComposer } from '@/lib/agent/composerFocus'

/**
 * The helper finds the composer by attribute, so the attribute is half the
 * contract and lives in another file. Both halves are pinned here: the
 * behaviour against a hand-built field for the cases a real composer cannot
 * be put in (no composer at all, a textarea that is not one), and the round
 * trip against the real module, which is what says the two halves still meet.
 * Renaming the attribute would otherwise break the phone's "keep typing after
 * a jump" criterion with a green suite.
 */

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

/**
 * Put a composer in the document.
 *
 * @param options.attributed - carry `data-agent-composer`
 * @param options.disabled - render it disabled, as an unkeyed panel does
 * @returns the field
 */
function mountComposer({
  attributed = true,
  disabled = false,
}: { attributed?: boolean; disabled?: boolean } = {}) {
  const field = document.createElement('textarea')
  if (attributed) field.setAttribute('data-agent-composer', '')
  field.disabled = disabled
  document.body.append(field)
  return field
}

describe('focusAgentComposer', () => {
  it('gives the caret to a mounted composer', () => {
    const field = mountComposer()

    expect(focusAgentComposer()).toBe(true)
    expect(document.activeElement).toBe(field)
  })

  it('reports honestly when no composer is mounted', () => {
    expect(focusAgentComposer()).toBe(false)
  })

  it('declines a composer disabled for want of an API key', () => {
    // A caller must not claim the reader can keep typing into a field that
    // takes no typing.
    const field = mountComposer({ disabled: true })

    expect(focusAgentComposer()).toBe(false)
    expect(document.activeElement).not.toBe(field)
  })

  it('ignores a textarea that is not the composer', () => {
    mountComposer({ attributed: false })

    expect(focusAgentComposer()).toBe(false)
  })

  it('lands the caret on the field the composer module actually renders', () => {
    // The contract asserted as behaviour rather than as a string grepped out
    // of a source file. The attribute is the selector's half of a seam whose
    // other half is a component in another tree, so the only honest guard is
    // to render that component and ask for the caret: this goes red for the
    // failure a reader would meet — the phone's jump leaving them with no
    // caret to keep typing at — and stays green through a rename of the file
    // or of the symbol inside it.
    // `createElement` rather than JSX only because this guard sits in the
    // library's tree, where the files are `.ts`.
    render(
      createElement(ComposerInkedField, {
        draft: '',
        onDraftChange: () => {},
        caret: null,
        onCaretPlaced: () => {},
        onSelectionChange: () => {},
        placeholder: 'Message the agent…',
      }),
    )
    const rendered = document.querySelector('textarea')

    expect(focusAgentComposer()).toBe(true)
    expect(document.activeElement).toBe(rendered)
    expect(rendered?.hasAttribute('data-agent-composer')).toBe(true)
  })
})
