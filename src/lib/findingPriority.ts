/**
 * What to fix first — the audit report's order, in one testable place.
 *
 * Severity says how wrong a finding is. It does not say what to fix first:
 * that takes two more ratings, impact (how much fixing it matters to the
 * service) and effort (how much work the fix takes), and an order built from
 * the pair. The skill's `audit_tools.py rank` prints the same order for the
 * file ledger; the two are held to the same cases, so one ledger never reads
 * in two orders.
 *
 * A finding recorded before the ratings existed carries neither. It is
 * unrated, never guessed at: it falls in Later and sorts after every rated
 * finding there, whatever its severity.
 */

/** Mirrors `audit_findings_impact_check` and `audit_findings_effort_check`. */
export type FindingRating = 'low' | 'medium' | 'high'

export const PRIORITY_GROUPS = ['Do first', 'Plan', 'Quick wins', 'Later'] as const
export type PriorityGroup = (typeof PRIORITY_GROUPS)[number]

const RATINGS: readonly string[] = ['low', 'medium', 'high']
const SEVERITIES: readonly string[] = ['info', 'warn', 'critical']

/** The three columns the order reads. Strings, because rows arrive untyped. */
export type RankableFinding = {
  impact?: string | null
  effort?: string | null
  severity: string
}

function rated(finding: RankableFinding): finding is RankableFinding & {
  impact: FindingRating
  effort: FindingRating
} {
  return RATINGS.includes(finding.impact ?? '') && RATINGS.includes(finding.effort ?? '')
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
  return SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity)
}

/**
 * The four groups, always all four and always in order, each sorted impact
 * desc, effort asc, severity desc. The sort is stable, so findings that tie
 * keep the order they arrived in.
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
