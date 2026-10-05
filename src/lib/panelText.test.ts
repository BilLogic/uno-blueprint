import { describe, expect, it } from 'vitest'
import { classListHas, classLists } from '@/lib/classList'
import { sourceFiles } from '@/lib/tokenModel'

/**
 * Former `PANEL_TEXT` class lists, now written inline. Title and value
 * sit on `sm`; label and meta sit on `xs`. Weight and colour separate
 * the four jobs. There is no semantic type-role layer: a call site writes
 * the whole style where it stands, so a reader sees it without opening
 * another file.
 */
const FORMER_PANEL_TEXT = {
  title: 'min-w-0 text-sm font-semibold text-foreground',
  meta: 'text-xs font-normal text-muted-foreground',
  sectionLabel: 'text-xs font-medium text-muted-foreground',
  // Full ink, not the `/80` this inherited. The four panel roles are
  // separated by size and weight, with colour telling label and meta
  // (muted) apart from title and value (full) — an opacity between the
  // content rung and the caption rung was never one of the four.
  value: 'text-sm font-normal text-foreground',
} as const

type PanelRole = keyof typeof FORMER_PANEL_TEXT

/**
 * Per-file counts of `PANEL_TEXT.*` JSX sites on origin/main, taken after
 * the last batch that moved one. The retirement of the panel role layer
 * cites 28; the tree holds 19. The test enumerates those 19 so a
 * coincidental `text-xs font-medium text-muted-foreground` elsewhere
 * cannot satisfy a missing call site.
 *
 * A count follows the class list when a file stops writing it. The draft
 * and empty surfaces each wrote the panel title on their own drawer header;
 * both headers are the shell's one header now, so the two sites are the
 * shell's single heading. The list itself is `PANEL_HEADING_CLASS`, which
 * this reader resolves across files — a site writing the constant is a site
 * writing the classes, which is why the differences surface still counts as
 * a writer of the title it shows beside the surface switcher.
 */
const FORMER_SITE_COUNTS: Readonly<
  Record<string, Partial<Record<PanelRole, number>>>
> = {
  // The cell panel's four sites moved with the split of its body: its three
  // titles were each the heading of one drawer surface, and its value is the
  // summary paragraph in the overview. Two of the three headings are the
  // shared header's now; the differences surface keeps a site of its own
  // because its heading is a span beside the surface switcher rather than
  // the drawer title — the same class list, named rather than retyped.
  'components/blueprint/CellDetailDifferencesSurface.tsx': { title: 1 },
  'components/blueprint/CellDetailOverview.tsx': { value: 1 },
  'components/blueprint/CellContentSection.tsx': {
    sectionLabel: 1,
    value: 1,
  },
  // The editor's section label was the touchpoint block's heading, which went
  // when the block's own Touchpoint field took over saying whose it is.
  'components/blueprint/CellPanelEditor.tsx': { meta: 1 },
  'components/blueprint/LanePanel.tsx': { value: 1 },
  'components/blueprint/PanelSectionLabel.tsx': { sectionLabel: 1 },
  'components/blueprint/ResourcesList.tsx': { sectionLabel: 1 },
  'components/blueprint/StakeholderSelect.tsx': { meta: 3, value: 1 },
  'components/blueprint/StepPanel.tsx': { meta: 1, value: 1 },
  'components/blueprint/panelShell.tsx': {
    // The identity block's name, and the header's heading.
    title: 2,
    meta: 2,
    sectionLabel: 1,
  },
}

describe('the former PANEL_TEXT call sites', () => {
  it('still write the classes the constant resolved to', { timeout: 20_000 }, () => {
    const sites = classLists()
    let total = 0
    for (const [file, roles] of Object.entries(FORMER_SITE_COUNTS)) {
      for (const [role, expected] of Object.entries(roles) as [
        PanelRole,
        number,
      ][]) {
        const count = sites.filter(
          (site) =>
            site.file === file &&
            classListHas(site.classes, FORMER_PANEL_TEXT[role]),
        ).length
        expect(count, `${file} ${role}`).toBe(expected)
        total += expected
      }
    }
    expect(total).toBe(19)
  })

  it('and the tree names no PANEL_TEXT identifier', () => {
    const hits = sourceFiles().filter((file) => /\bPANEL_TEXT\b/.test(file.code))
    expect(
      hits.map((file) => file.file),
      'PANEL_TEXT remains in the tree',
    ).toEqual([])
  })
})
