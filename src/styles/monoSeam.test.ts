import { test } from 'vitest'
import assert from 'node:assert/strict'
import { declarationsIn } from '@/lib/tokenModel'

/**
 * The mono stack has two override seams: `--app-font-mono`, and the
 * deprecated `--font-source-code-pro` an embedder may still set. This
 * resolves the declared `--font-mono` the way a browser substitutes `var()`
 * — a defined variable replaces the whole call, an undefined one takes its
 * fallback arm — and reads which face lands first.
 */
function substitute(value: string, defined: Record<string, string>): string {
  const at = value.indexOf('var(')
  if (at === -1) return value
  let depth = 0
  let end = at + 4
  for (; end < value.length; end += 1) {
    if (value[end] === '(') depth += 1
    if (value[end] === ')') {
      if (depth === 0) break
      depth -= 1
    }
  }
  const inner = value.slice(at + 4, end)
  const comma = inner.indexOf(',')
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
  const fallback = comma === -1 ? '' : inner.slice(comma + 1).trim()
  const replacement =
    name in defined ? defined[name] : substitute(fallback, defined)
  return substitute(
    value.slice(0, at) + replacement + value.slice(end + 1),
    defined,
  )
}

const fontMono = declarationsIn('theme.css').find(
  (entry) => entry.name === '--font-mono',
)
const firstFace = (defined: Record<string, string>) =>
  substitute(fontMono?.value ?? '', defined).split(',')[0].trim()

test('the mono stack defaults to Ubuntu Sans Mono and ends generic', () => {
  assert.ok(fontMono, 'theme.css should declare --font-mono')
  assert.equal(firstFace({}), "'Ubuntu Sans Mono Variable'")
  assert.match(fontMono.value, /monospace$/)
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
