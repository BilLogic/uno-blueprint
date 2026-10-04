import {
  classListHas,
  classListOf,
  classLists,
  type ClassListInput,
  type ClassListSite,
} from '@/lib/classList'
import { declarationsIn } from '@/lib/tokenModel'

/**
 * Monospace stays in three registers, and the guard knows the two ladders.
 *
 * Family is not "text a machine produced." A `font-mono` call site belongs
 * to exactly one of the three jobs named below, and the guard holds the tree
 * there. The scan is the class-list reader — a token present in
 * any order, including split across `cn()` arguments. Size is evaluated
 * against the ladder of the scope the site renders in: `text-sm` is 13px
 * in prose and 14px inside `.font-mono`.
 *
 * This module classifies. The test file is the assertion.
 */

/** The three jobs monospace does in this tree. */
export type MonoRegister = 1 | 2 | 3

/**
 * A named surface the guard knows about, with the reason it is listed.
 *
 * The house pattern from `VENDORED_FONT_SIZE_LITERALS`: a named entry per
 * surface, a reason, and an assertion that the entry is still needed so a
 * stale carve-out fails rather than rotting.
 */
export type NamedSurface = {
  /** Path relative to `src`, as `classLists()` reports it. */
  file: string
  /** Why this surface is in this list. */
  because: string
}

/**
 * Register 1 — code, identifiers and stored values.
 *
 * Text the system produced or stores, shown as itself: error payloads,
 * tool names, model ids, API keys, inline/fenced code, a stored enum
 * rendered as the value it is.
 */
export const REGISTER_1: readonly NamedSurface[] = [
  {
    file: 'components/EditorErrorBoundary.tsx',
    because: 'error payload shown as the stored text it is',
  },
  {
    file: 'components/editor/agent/TranscriptRow.tsx',
    because: 'tool names, arguments and result blocks',
  },
  {
    file: 'components/editor/agent/AgentChatView.tsx',
    because: 'the recognized /command, in the composer and in its menu',
  },
  {
    file: 'components/editor/AgentProviderFields.tsx',
    because: 'provider model ids and the API key field',
  },
  {
    file: 'components/editor/DeleteStructureDialog.tsx',
    because: 'the name typed to confirm a destructive action',
  },
  {
    file: 'components/editor/AgentMarkdown.tsx',
    because: 'inline and fenced code in agent prose',
  },
  {
    file: 'components/cover/coverInline.tsx',
    because: 'inline code in cover prose',
  },
  {
    file: 'components/cover/CoverCommandCopy.tsx',
    because: 'a command offered for copying',
  },
  {
    file: 'components/blueprint/CellInSlicesFooter.tsx',
    because: 'a stored slice.kind rendered as the value it is',
  },
  {
    file: 'components/editor/SliceHeaderBand.tsx',
    because: 'a stored slice.kind rendered as the value it is',
  },
]

/**
 * Register 2 — aligned numerals.
 *
 * Digits that sit in a column, a badge or a sequence, always beside
 * `tabular-nums`. Digit alignment, not a claim the text is machine-generated.
 */
export const REGISTER_2: readonly NamedSurface[] = [
  {
    file: 'components/blueprint/BlueprintCellButton.tsx',
    because: 'sequence badge on a cell',
  },
  {
    file: 'components/editor/PhaseMenubarHeader.tsx',
    because: 'count in the phase header',
  },
  {
    file: 'components/blueprint/CompareDifferencesSurface.tsx',
    because: 'counts and verdict marks on the compare surface',
  },
  {
    file: 'components/editor/SlicePresentation.tsx',
    because: 'slide numbers in the filmstrip and the slide counter',
  },
  {
    file: 'components/editor/SliceSlideComposer.tsx',
    because: 'cited-cell order — a ruler column of digits',
  },
]

/**
 * Register 3 — eyebrow and wordmark.
 *
 * Display headings and marks, where mono is a deliberate display
 * choice rather than an identifier or a numeral column.
 */
export const REGISTER_3: readonly NamedSurface[] = [
  {
    file: 'components/cover/CoverSections.tsx',
    because: 'cover section heading and skill navigation',
  },
]

/**
 * `tabular-nums` without `font-mono`.
 *
 * Register 2 is the pairing: the two travel together, and a numeral that
 * takes only one of them needs a reason. Each entry is asserted still to
 * match, so a site that gains `font-mono` (or drops `tabular-nums`) loses
 * its carve-out instead of leaving a dead exemption behind.
 */
export const TABULAR_WITHOUT_MONO: readonly NamedSurface[] = [
  {
    file: 'components/ui/sidebar.tsx',
    because:
      'upstream shadcn sidebar badge count (components.json — the CLI owns this file)',
  },
  {
    file: 'components/editor/SessionChangesSheet.tsx',
    because:
      'change count beside the word Changes in a button, not a numeral column',
  },
  {
    file: 'components/editor/DeleteStructureDialog.tsx',
    because:
      'impact figures in a consequence card, sized as a heading, not a digit column',
  },
  {
    file: 'components/editor/CanvasDesignTools.tsx',
    because: 'picked-cell count on a prose button, not a numeral column',
  },
  {
    file: 'components/editor/agent/ChangeCount.tsx',
    because: 'session change count next to an icon, not a numeral column',
  },
  {
    file: 'components/blueprint/ZoomableImage.tsx',
    because: 'n of m viewer chrome in the surrounding sans, not a digit column',
  },
]

const NINE_RUNGS = [
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
] as const

/**
 * True iff this class list writes `font-mono`.
 *
 * @param classes - a class list as the reader yields it
 */
function isMonospace(classes: ClassListInput): boolean {
  return classListHas(classes, 'font-mono')
}

/**
 * True iff this class list writes `tabular-nums`.
 *
 * @param classes - a class list as the reader yields it
 */
function hasTabularNums(classes: ClassListInput): boolean {
  return classListHas(classes, 'tabular-nums')
}

/**
 * True iff this class list writes a tracking utility.
 *
 * Register 3 is the only register that may pair with tracking. Presence is
 * the signal, not the particular rung (`tracking-tight` and
 * `tracking-[0.2em]` are the same pairing).
 *
 * @param classes - a class list as the reader yields it
 */
function hasTracking(classes: ClassListInput): boolean {
  return classListOf(classes).some((token) =>
    /^(?:[\w-]+:)*tracking-/.test(token),
  )
}

/**
 * Registers this class list signals by itself, not via the roster.
 *
 * Register 2 is `tabular-nums`. Register 3 is tracking. Register 1 is the
 * residual — `font-mono` with neither signal — and is not returned here,
 * so a list that signals both 2 and 3 is the dual-register case the guard
 * fails, and a list that signals neither is legal on register 1 or 3.
 *
 * @param classes - a class list as the reader yields it
 */
export function signalledRegisters(classes: ClassListInput): MonoRegister[] {
  const registers: MonoRegister[] = []
  if (hasTabularNums(classes)) registers.push(2)
  if (hasTracking(classes)) registers.push(3)
  return registers
}

/**
 * Registers the roster lists this file under.
 *
 * A file in none is an undeclared `font-mono`. A file in two is the other
 * half of "exactly one". Pairing (tabular-nums, tracking) is checked against
 * this list, not against the signals, so a register-3 heading may omit
 * tracking and a register-2 badge may not.
 *
 * @param file - path relative to `src`
 */
export function rosteredRegisters(file: string): MonoRegister[] {
  const registers: MonoRegister[] = []
  if (REGISTER_1.some((entry) => entry.file === file)) registers.push(1)
  if (REGISTER_2.some((entry) => entry.file === file)) registers.push(2)
  if (REGISTER_3.some((entry) => entry.file === file)) registers.push(3)
  return registers
}

/**
 * Pairing failures for a class list declared under `register`.
 *
 * Register 2 without `tabular-nums` fails. Tracking on register 1 or 2
 * fails. `tabular-nums` outside register 2 fails. Two signals at once fail
 * even when the roster named only one — that is the slide-number case.
 *
 * @param classes - a class list as the reader yields it
 * @param register - the register the roster named for this site
 */
export function pairingViolations(
  classes: ClassListInput,
  register: MonoRegister,
): string[] {
  const violations: string[] = []
  if (register === 2 && !hasTabularNums(classes)) {
    violations.push('register 2 without tabular-nums')
  }
  if ((register === 1 || register === 2) && hasTracking(classes)) {
    violations.push(`tracking on register ${register}`)
  }
  if (register !== 2 && hasTabularNums(classes)) {
    violations.push('tabular-nums outside register 2')
  }
  if (signalledRegisters(classes).length > 1) {
    violations.push('two registers')
  }
  return violations
}

/**
 * The tree's class lists, walked once.
 *
 * `classLists()` is a full parse of every `src` file. The guard asks it
 * from several tests, and a second walk under a loaded suite is how those
 * tests miss a 5s budget. `sourceFiles` already caches; this is the same
 * seam one step along.
 */
let cachedLists: ClassListSite[] | undefined

/**
 * @returns every class list in the tree
 */
function allClassLists(): ClassListSite[] {
  cachedLists ??= classLists()
  return cachedLists
}

/**
 * Every class list in the tree that writes `font-mono`.
 */
export function fontMonoSites(): ClassListSite[] {
  return allClassLists().filter((site) => isMonospace(site.classes))
}

/**
 * Every class list in the tree that writes `tabular-nums` without `font-mono`.
 */
export function tabularWithoutMonoSites(): ClassListSite[] {
  return allClassLists().filter(
    (site) => hasTabularNums(site.classes) && !isMonospace(site.classes),
  )
}

/**
 * Roster entries whose `file` no longer appears among `sites`.
 *
 * @param entries - a named list (a register, or the tabular-nums allowlist)
 * @param sites - the matching class lists currently in the tree
 */
export function staleNamed(
  entries: readonly NamedSurface[],
  sites: readonly ClassListSite[],
): string[] {
  const files = new Set(sites.map((site) => site.file))
  return entries
    .filter((entry) => !files.has(entry.file))
    .map((entry) => entry.file)
}

/**
 * The declared size of `rung` on `scope`'s ladder.
 *
 * The nine running-text rungs are declared twice: sans on `@theme`, mono
 * sizes on `.font-mono, code, kbd, pre, samp`. Nothing below `xs` exists
 * in either scope. Looking up `sm` against the sans column yields 13px,
 * which is on no mono rung — that is the trap. Looking it up against the
 * mono column yields 14px.
 *
 * @param rung - a type-scale name (`sm`, `xs`, …)
 * @param scope - which face's ladder to read
 */
export function rungSize(rung: string, scope: 'sans' | 'mono'): string | undefined {
  const name = `--text-${rung}`
  const needle =
    scope === 'mono' && (NINE_RUNGS as readonly string[]).includes(rung)
      ? '.font-mono'
      : '@theme'
  return declarationsIn('theme.css').find(
    (entry) => entry.name === name && entry.selector.includes(needle),
  )?.value
}
