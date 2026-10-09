/**
 * What to fix first — the audit report's order, in one testable place.
 *
 * Severity says how wrong a finding is. It does not say what to fix first:
 * that takes two more ratings, impact (how much fixing it matters to the
 * service) and effort (how much work the fix takes), and an order built from
 * the pair. The skill's `audit_tools.py rank` prints the same order for the
 * file ledger. Both are held to one fixture,
 * `scripts/tests/fixtures/finding-priority.json`, read by this module's test
 * and by `run_tests.sh`, so one ledger never reads in two orders.
 *
 * A finding recorded before the ratings existed carries neither. It is
 * unrated, never guessed at: it falls in Later and sorts after every rated
 * finding there, whatever its severity.
 */

/**
 * The rating set, once. Mirrors `audit_findings_impact_check` and
 * `audit_findings_effort_check`; the tool's argument enum and the type below
 * are read off it.
 */
export const RATINGS = ['low', 'medium', 'high'] as const
export type FindingRating = (typeof RATINGS)[number]

export const PRIORITY_GROUPS = ['Do first', 'Plan', 'Quick wins', 'Later'] as const
export type PriorityGroup = (typeof PRIORITY_GROUPS)[number]

const SEVERITIES: readonly string[] = ['info', 'warn', 'critical']

/**
 * The columns the order reads. Strings, because rows arrive untyped.
 * `check_key` and `fingerprint` only break full ties, as they do in
 * `audit_tools.py`.
 */
export type RankableFinding = {
  impact?: string | null
  effort?: string | null
  severity: string
  check_key?: string | null
  fingerprint?: string | null
}

function isRating(value: string | null | undefined): value is FindingRating {
  return (RATINGS as readonly string[]).includes(value ?? '')
}

function rated(finding: RankableFinding): finding is RankableFinding & {
  impact: FindingRating
  effort: FindingRating
} {
  return isRating(finding.impact) && isRating(finding.effort)
}

/**
 * Do first: high impact, low effort. Plan: high impact, more effort. Quick
 * wins: lesser impact, low effort. Later: everything else.
 */
export function priorityGroup(finding: RankableFinding): PriorityGroup {
  if (!rated(finding)) return 'Later'
  if (finding.impact === 'high') return finding.effort === 'low' ? 'Do first' : 'Plan'
  return finding.effort === 'low' ? 'Quick wins' : 'Later'
}

/** Code-point order, as Python compares strings — not the locale's. */
function byText(a: string | null | undefined, b: string | null | undefined): number {
  const left = a ?? ''
  const right = b ?? ''
  return left < right ? -1 : left > right ? 1 : 0
}

function compare(a: RankableFinding, b: RankableFinding): number {
  const aRated = rated(a)
  const bRated = rated(b)
  if (aRated !== bRated) return aRated ? -1 : 1
  if (aRated && bRated) {
    const impact = RATINGS.indexOf(b.impact) - RATINGS.indexOf(a.impact)
    if (impact !== 0) return impact
    const effort = RATINGS.indexOf(a.effort) - RATINGS.indexOf(b.effort)
    if (effort !== 0) return effort
  }
  const severity = SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity)
  if (severity !== 0) return severity
  return byText(a.check_key, b.check_key) || byText(a.fingerprint, b.fingerprint)
}

/**
 * The four groups, always all four and always in order, each sorted impact
 * desc, effort asc, severity desc, then check_key and fingerprint so a full
 * tie lands where the skill's script puts it.
 */
export function rankFindings<T extends RankableFinding>(
  findings: readonly T[],
): Array<{ group: PriorityGroup; findings: T[] }> {
  return PRIORITY_GROUPS.map((group) => ({
    group,
    findings: findings.filter((finding) => priorityGroup(finding) === group).sort(compare),
  }))
}

/** `impact high · effort low`, or `unrated` when either rating is missing. */
export function ratingLabel(finding: RankableFinding): string {
  return rated(finding) ? `impact ${finding.impact} · effort ${finding.effort}` : 'unrated'
}
