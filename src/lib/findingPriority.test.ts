import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  priorityGroup,
  rankFindings,
  ratingLabel,
  type RankableFinding,
} from '@/lib/findingPriority'

/**
 * The audit report's order. The ordering case reads the fixture the skill's
 * own `audit_tools.py rank` is tested against in `run_tests.sh`, so the
 * canvas and the IDE cannot print one ledger in two orders.
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
  it('prints the shared fixture in the order audit_tools.py rank prints it', () => {
    const cases = JSON.parse(
      readFileSync(resolve(process.cwd(), 'scripts/tests/fixtures/finding-priority.json'), 'utf8'),
    ) as {
      findings: Array<RankableFinding & { name: string }>
      expected: Array<[string, string[]]>
    }
    const ranked = rankFindings(cases.findings).map(({ group, findings }) => [
      group,
      findings.map((row) => row.name),
    ])
    expect(ranked).toEqual(cases.expected)
  })

  it('keeps arrival order only where every key ties, check and fingerprint included', () => {
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
