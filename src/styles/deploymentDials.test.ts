import { describe, expect, it, vi } from 'vitest'

/**
 * A deployment's own dials beat the template's default brand.
 *
 * The template ships a teal accent, and a deployment that brands itself does
 * so by importing the package's stylesheets and then a theme file of its own,
 * declaring the same dials under the same `:root, .light` and `.dark`
 * selectors. Equal specificity, so source order decides, and the deployment's
 * file comes last. This holds that: the sheet below is laid over the package's
 * after every import the entry makes, which is where a deployment's file sits,
 * and what `--primary` and `--brand` resolve to has to be the deployment's.
 *
 * It mocks the source tree rather than reading a real deployment, so it lives
 * in a file of its own: every other rule in `tokens.test.ts` measures the
 * template exactly as it ships.
 */
const DEPLOYMENT_SHEET = 'deployment-brand.css'

const DEPLOYMENT_DIALS = `
:root,
.light {
  --hue: 280;
  --primary-lightness: 0.45;
  --primary-chroma: 0.12;
}
.dark {
  --hue: 280;
  --primary-lightness: 0.72;
  --primary-chroma: 0.1;
  --brand-lightness: 0.6;
}
`

vi.mock('@/lib/sourceTree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sourceTree')>()
  const path = `styles/${DEPLOYMENT_SHEET}`
  const entry = 'styles/tailwind.config.css'
  return {
    ...actual,
    filesOn: (
      ...args: Parameters<typeof actual.filesOn>
    ): ReturnType<typeof actual.filesOn> => {
      const files = actual.filesOn(...args)
      const [surface, where] = args
      if (surface !== 'styles' || (where && !where(path))) return files
      return [...files, { file: path, text: DEPLOYMENT_DIALS }]
    },
    sourceOf: (file: string) => {
      if (file === path) return DEPLOYMENT_DIALS
      const text = actual.sourceOf(file)
      return file === entry
        ? `${text}\n@import './${DEPLOYMENT_SHEET}';\n`
        : text
    },
  }
})

const { resolveColorValue, stylesheets } = await import('@/lib/tokenModel')

describe("a deployment's own dials", () => {
  it('sit last in the cascade, where a deployment imports them', () => {
    const imported = stylesheets().filter((sheet) =>
      Number.isFinite(sheet.order),
    )
    expect(imported.at(-1)?.file).toBe(DEPLOYMENT_SHEET)
  })

  it.each([
    ['light', 0.45, 0.12],
    ['dark', 0.72, 0.1],
  ] as const)(
    'win the filled control over the default teal under %s',
    (theme, l, c) => {
      const primary = resolveColorValue('--primary', theme)
      expect(primary.l).toBeCloseTo(l, 5)
      expect(primary.c).toBeCloseTo(c, 5)
      expect(primary.h).toBeCloseTo(280, 5)
    },
  )

  it('carry the identity with the accent where no brand dial is set', () => {
    const brand = resolveColorValue('--brand', 'light')
    expect(brand.l).toBeCloseTo(0.45, 5)
    expect(brand.h).toBeCloseTo(280, 5)
  })

  it('take a brand dial off the accent on its channel alone', () => {
    const brand = resolveColorValue('--brand', 'dark')
    expect(brand.l).toBeCloseTo(0.6, 5)
    expect(brand.c).toBeCloseTo(0.1, 5)
    expect(brand.h).toBeCloseTo(280, 5)
  })
})
