import { describe, expect, it } from 'vitest'
import { sourceOf } from '@/lib/sourceTree'
import { declarationsIn } from '@/lib/tokenModel'

/**
 * The two-scope `--font-weight-normal` knob. The mechanism is taken from the
 * reference and the 450 that came with it declined: Inter reads light at 400,
 * Ubuntu Sans holds its colour at 400 down to 12px, so both type scopes stay at
 * 400.
 */

const THEME = sourceOf('styles/theme.css')
const MONO_SELECTOR = '.font-mono, code, kbd, pre, samp'

describe('the working-weight knob', () => {
  it('declares --font-weight-normal once per scope, both at 400', () => {
    const sans = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-normal' &&
        entry.selector.includes('@theme'),
    )
    const mono = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-normal' &&
        entry.selector.includes('.font-mono'),
    )
    expect(sans).toHaveLength(1)
    expect(mono).toHaveLength(1)
    expect(sans[0]?.value).toBe('400')
    expect(mono[0]?.value).toBe('400')
    expect(mono[0]?.selector).toBe(MONO_SELECTOR)
  })

  it('declares --font-weight-medium once per scope, both at 500', () => {
    const sans = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-medium' &&
        entry.selector.includes('@theme'),
    )
    const mono = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-medium' &&
        entry.selector.includes('.font-mono'),
    )
    expect(sans).toHaveLength(1)
    expect(mono).toHaveLength(1)
    expect(sans[0]?.value).toBe('500')
    expect(mono[0]?.value).toBe('500')
    expect(mono[0]?.selector).toBe(MONO_SELECTOR)
  })

  it('declares --font-weight-heading once per scope, both at 500', () => {
    const sans = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-heading' &&
        entry.selector.includes('@theme'),
    )
    const mono = declarationsIn('theme.css').filter(
      (entry) =>
        entry.name === '--font-weight-heading' &&
        entry.selector.includes('.font-mono'),
    )
    expect(sans).toHaveLength(1)
    expect(mono).toHaveLength(1)
    expect(sans[0]?.value).toBe('500')
    expect(mono[0]?.value).toBe('500')
    expect(mono[0]?.selector).toBe(MONO_SELECTOR)
  })

  it('records the Inter reasoning as a comment naming the type-ladder decision', () => {
    const at = THEME.indexOf('--font-weight-normal:')
    expect(at).toBeGreaterThan(-1)
    const comment = THEME.slice(0, at).match(/\/\*[\s\S]*?\*\/\s*$/)?.[0]
    expect(comment, 'a comment immediately above the sans knob').toBeDefined()
    expect(comment).toMatch(/the decision that a rung owns size and leading/)
    expect(comment).toMatch(/Inter/)
    expect(comment).toMatch(/Ubuntu Sans/)
    expect(comment).toMatch(/450/)
  })
})
