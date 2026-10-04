import { test } from 'vitest'
import assert from 'node:assert/strict'
import { resolveValue } from '@/lib/tokenModel'

/**
 * The mono stack has two override seams: `--app-font-mono`, and the
 * deprecated `--font-source-code-pro` an embedder may still set. Each case
 * asks the token model what `--font-mono` resolves to with the given seams
 * filled, the way an embedding app's own `:root` would fill them, and reads
 * which face lands first.
 *
 * `--font-mono` is declared in theme.css's `@theme inline` block, which the
 * model does not count as the root on its own; Tailwind emits the key at
 * `:root`, so the block is named as the scope the reading applies in.
 */
const THEME = ['@theme inline'] as const
const resolveMono = (defined: Record<string, string> = {}) =>
  resolveValue('--font-mono', 'light', 'screen', THEME, defined)
const firstFace = (defined: Record<string, string> = {}) =>
  resolveMono(defined)?.split(',')[0].trim()

test('the mono stack defaults to Ubuntu Sans Mono and ends generic', () => {
  assert.equal(firstFace(), "'Ubuntu Sans Mono Variable'")
  assert.match(resolveMono() ?? '', /monospace$/)
})

test('--app-font-mono overrides the mono face', () => {
  assert.equal(
    firstFace({ '--app-font-mono': "'Embedder Mono'" }),
    "'Embedder Mono'",
  )
})

test('the deprecated --font-source-code-pro still overrides it', () => {
  assert.equal(
    firstFace({ '--font-source-code-pro': "'Legacy Mono'" }),
    "'Legacy Mono'",
  )
})

test('--app-font-mono wins when both are set', () => {
  assert.equal(
    firstFace({
      '--app-font-mono': "'New Mono'",
      '--font-source-code-pro': "'Old Mono'",
    }),
    "'New Mono'",
  )
})
