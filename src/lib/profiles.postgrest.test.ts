import { describe, expect, it } from 'vitest'
import { POSTGREST_URL, postgrestClientAs } from '@/test/postgrestDatabase'

/**
 * Profiles over a real database: who a person is to Uno, and whether they may
 * approve. `scripts/run-profiles-over-postgrest.mjs` builds the committed
 * stack and seed, adds login accounts for the placeholder pilot people, runs
 * the pilot profile seed twice, and mints one claim per person. Without those
 * variables every case here is skipped.
 */
const APPROVER_JWT = process.env.PROFILES_APPROVER_JWT ?? ''
const CONTRIBUTOR_JWT = process.env.PROFILES_CONTRIBUTOR_JWT ?? ''
const OWNER_JWT = process.env.PROFILES_OWNER_JWT ?? ''
const live = POSTGREST_URL !== '' && APPROVER_JWT !== '' && CONTRIBUTOR_JWT !== '' && OWNER_JWT !== ''

/** A cell the committed sample seed holds. */
const CELL = 'f0000000-0000-4000-8000-110300010001'

describe.runIf(live)('profiles over PostgREST', () => {
  const approver = () => postgrestClientAs(APPROVER_JWT)
  const contributor = () => postgrestClientAs(CONTRIBUTOR_JWT)

  it('links each seeded person to their login by email, once', async () => {
    const { data, error } = await contributor().rpc('list_profile_stakeholders')
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    const own = await approver().from('profiles').select('display_name, may_approve')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ display_name: 'Consultant first name', may_approve: true }])
    const owner = await postgrestClientAs(OWNER_JWT).from('profiles').select('display_name, may_approve')
    expect(owner.error).toBeNull()
    expect(owner.data).toEqual([{ display_name: 'Owner first name', may_approve: true }])
  })

  it('lets a person read and edit only their own profile', async () => {
    const own = await contributor().from('profiles').select('display_name, may_approve, register')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ display_name: 'Expert first name', may_approve: false, register: 'everyday' }])

    const edited = await contributor().from('profiles').update({ register: 'precise' })
      .not('id', 'is', null).select('register')
    expect(edited.error).toBeNull()
    expect(edited.data).toEqual([{ register: 'precise' }])

    const escalated = await contributor().from('profiles').update({ may_approve: true })
      .not('id', 'is', null)
    expect(escalated.error?.code).toBe('42501')
  })

  it('records a contribution as evidence in the person’s name and a suggestion awaiting approval', async () => {
    const before = await contributor().from('cells').select('content').eq('id', CELL).single()
    const { data, error } = await contributor().rpc('record_contribution', {
      p_cell_id: CELL,
      p_title: 'Told to Uno in conversation',
      p_note: 'Intake now starts with a phone call.',
      p_proposed_content: 'Intake starts with a phone call',
    })
    expect(error).toBeNull()
    const { evidence_id: evidenceId, suggested_change_id: suggestionId } = data as Record<string, string>

    const evidence = await contributor().from('evidence').select('cell_id, contributed_by').eq('id', evidenceId)
    const ownProfile = await contributor().from('profiles').select('id').single()
    expect(evidence.data).toEqual([{ cell_id: CELL, contributed_by: ownProfile.data?.id }])

    const suggestion = await contributor().from('suggested_changes').select('status').eq('id', suggestionId)
    expect(suggestion.data).toEqual([{ status: 'pending' }])

    const after = await contributor().from('cells').select('content, approved_by').eq('id', CELL).single()
    expect(after.data).toEqual({ content: before.data?.content, approved_by: null })
  })

  it('refuses to approve a suggestion or a cell for a person who may not approve', async () => {
    const pending = await contributor().from('suggested_changes').select('id').eq('status', 'pending').single()
    const approve = await contributor().rpc('approve_suggested_change', { p_id: pending.data!.id })
    expect(approve.error?.code).toBe('42501')
    const approval = await contributor().rpc('approve_cell', { p_cell_id: CELL })
    expect(approval.error?.code).toBe('42501')
    const cell = await contributor().from('cells').select('approved_by').eq('id', CELL).single()
    expect(cell.data).toEqual({ approved_by: null })
  })

  it('lets a person who may approve accept the suggestion, which approves the cell', async () => {
    const pending = await approver().from('suggested_changes').select('id').eq('status', 'pending').single()
    const { error } = await approver().rpc('approve_suggested_change', { p_id: pending.data!.id })
    expect(error).toBeNull()
    const ownProfile = await approver().from('profiles').select('id').single()
    const cell = await approver().from('cells').select('content, approved_by').eq('id', CELL).single()
    expect(cell.data).toEqual({ content: 'Intake starts with a phone call', approved_by: ownProfile.data?.id })
    const decided = await approver().from('suggested_changes').select('status, decided_by').eq('id', pending.data!.id)
    expect(decided.data).toEqual([{ status: 'approved', decided_by: ownProfile.data?.id }])
    const account = await approver().from('profiles').select('user_id').single()
    const log = await approver().from('authoring_changes')
      .select('author, author_id, args, revert').eq('fn', 'approve_suggested_change')
    expect(log.error).toBeNull()
    expect(log.data).toHaveLength(1)
    expect(log.data![0]).toMatchObject({
      author: 'human', author_id: account.data?.user_id,
      args: { cell_id: CELL, update: { content: 'Intake starts with a phone call', approved_by: ownProfile.data?.id } },
      revert: { fn: 'update_cell_content', args: { cell_id: CELL, update: { approved_by: null, approved_at: null } } },
    })
  })

  it('only an approver may decline, leaving the cell unchanged', async () => {
    const before = await contributor().from('cells').select('*').eq('id', CELL).single()
    const proposed = await contributor().rpc('record_contribution', {
      p_cell_id: CELL, p_title: 'Another proposal', p_note: '', p_proposed_content: 'Decline this',
    })
    expect(proposed.error).toBeNull()
    const id = (proposed.data as Record<string, string>).suggested_change_id
    const refused = await contributor().rpc('decline_suggested_change', { p_id: id })
    expect(refused.error?.code).toBe('42501')
    expect((await approver().rpc('decline_suggested_change', { p_id: id })).error).toBeNull()
    expect((await approver().from('suggested_changes').select('status').eq('id', id).single()).data)
      .toEqual({ status: 'declined' })
    expect((await contributor().from('cells').select('*').eq('id', CELL).single()).data).toEqual(before.data)
  })
})
