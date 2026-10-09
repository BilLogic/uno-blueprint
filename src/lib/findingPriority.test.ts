import { describe, expect, it } from 'vitest'
import {
  priorityGroup,
  rankFindings,
  ratingLabel,
  type RankableFinding,
} from '@/lib/findingPriority'

/**
 * The audit report's order, held to the same cases the skill's own
 * `audit_tools.py rank` is tested against, so the canvas and the IDE cannot
 * print one ledger in two orders.
 */
const finding = (
  name: string,
  impact: string | null,
  effort: string | null,
  severity = 'warn',
): RankableFinding & { name: string } => ({ name, impact, effort, severity })

describe('priorityGroup', () => {
  it('puts high impact for low effort first', () => {
    expect(priorityGroup(finding('a', 'high', 'low'))).toBe('Do first')
  })
  it('plans high impact that takes more work', () => {
    expect(priorityGroup(finding('a', 'high', 'medium'))).toBe('Plan')
    expect(priorityGroup(finding('a', 'high', 'high'))).toBe('Plan')
  })
  it('calls lesser impact for low effort a quick win', () => {
    expect(priorityGroup(finding('a', 'medium', 'low'))).toBe('Quick wins')
    expect(priorityGroup(finding('a', 'low', 'low'))).toBe('Quick wins')
  })
  it('leaves everything else, unrated rows included, for later', () => {
    expect(priorityGroup(finding('a', 'medium', 'medium'))).toBe('Later')
    expect(priorityGroup(finding('a', 'low', 'high'))).toBe('Later')
    expect(priorityGroup(finding('a', null, null))).toBe('Later')
    expect(priorityGroup(finding('a', 'high', null))).toBe('Later')
  })
})

describe('rankFindings', () => {
  it('orders the four groups, and impact desc, effort asc, severity desc within each', () => {
    const rows = [
      finding('unrated', null, null, 'critical'),
      finding('later-low-high', 'low', 'high'),
      finding('later-medium-medium', 'medium', 'medium'),
      finding('quick-low', 'low', 'low', 'critical'),
      finding('quick-medium', 'medium', 'low', 'info'),
      finding('plan-high-high', 'high', 'high', 'critical'),
      finding('plan-high-medium', 'high', 'medium'),
      finding('do-info', 'high', 'low', 'info'),
      finding('do-critical', 'high', 'low', 'critical'),
    ]
    const ranked = rankFindings(rows).map(({ group, findings }) => [
      group,
      findings.map((row) => row.name),
    ])
    expect(ranked).toEqual([
      ['Do first', ['do-critical', 'do-info']],
      ['Plan', ['plan-high-medium', 'plan-high-high']],
      ['Quick wins', ['quick-medium', 'quick-low']],
      ['Later', ['later-medium-medium', 'later-low-high', 'unrated']],
    ])
  })

  it('keeps arrival order between findings that tie', () => {
    const rows = [finding('first', 'low', 'low'), finding('second', 'low', 'low')]
    expect(rankFindings(rows)[2].findings.map((row) => row.name)).toEqual(['first', 'second'])
  })
})

describe('ratingLabel', () => {
  it('names both ratings, or says the finding is unrated', () => {
    expect(ratingLabel(finding('a', 'high', 'low'))).toBe('impact high · effort low')
    expect(ratingLabel(finding('a', null, null))).toBe('unrated')
    expect(ratingLabel(finding('a', 'high', null))).toBe('unrated')
  })
})
