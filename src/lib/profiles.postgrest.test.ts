import { describe, expect, it } from 'vitest'
import { POSTGREST_URL, postgrestClientAs } from '@/test/postgrestDatabase'

/**
 * Profiles over a real database: who a person is to Uno, and whether they may
 * confirm. `scripts/run-profiles-over-postgrest.mjs` builds the committed
 * stack and seed, adds login accounts for the placeholder pilot people, runs
 * the pilot profile seed twice, and mints one claim per person. Without those
 * variables every case here is skipped.
 */
const CONFIRMER_JWT = process.env.PROFILES_CONFIRMER_JWT ?? ''
const CONTRIBUTOR_JWT = process.env.PROFILES_CONTRIBUTOR_JWT ?? ''
const OWNER_JWT = process.env.PROFILES_OWNER_JWT ?? ''
const live = POSTGREST_URL !== '' && CONFIRMER_JWT !== '' && CONTRIBUTOR_JWT !== '' && OWNER_JWT !== ''

/** A cell the committed sample seed holds. */
const CELL = 'f0000000-0000-4000-8000-110300010001'

describe.runIf(live)('profiles over PostgREST', () => {
  const confirmer = () => postgrestClientAs(CONFIRMER_JWT)
  const contributor = () => postgrestClientAs(CONTRIBUTOR_JWT)

  it('links each seeded person to their login by email, once', async () => {
    const { data, error } = await contributor().rpc('list_profile_stakeholders')
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    const own = await confirmer().from('profiles').select('display_name, may_confirm')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ display_name: 'Consultant first name', may_confirm: true }])
    const owner = await postgrestClientAs(OWNER_JWT).from('profiles').select('display_name, may_confirm')
    expect(owner.error).toBeNull()
    expect(owner.data).toEqual([{ display_name: 'Owner first name', may_confirm: true }])
  })

  it('lets a person read and edit only their own profile', async () => {
    const own = await contributor().from('profiles').select('display_name, may_confirm, register')
    expect(own.error).toBeNull()
    expect(own.data).toEqual([{ display_name: 'Expert first name', may_confirm: false, register: 'everyday' }])

    const edited = await contributor().from('profiles').update({ register: 'precise' })
      .not('id', 'is', null).select('register')
    expect(edited.error).toBeNull()
    expect(edited.data).toEqual([{ register: 'precise' }])

    const escalated = await contributor().from('profiles').update({ may_confirm: true })
      .not('id', 'is', null)
    expect(escalated.error?.code).toBe('42501')
  })

  it('records a contribution as evidence in the person’s name and a suggestion awaiting confirmation', async () => {
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

    const after = await contributor().from('cells').select('content, confirmed_by').eq('id', CELL).single()
    expect(after.data).toEqual({ content: before.data?.content, confirmed_by: null })
  })

  it('refuses approval and confirmation to a person who may not confirm', async () => {
    const pending = await contributor().from('suggested_changes').select('id').eq('status', 'pending').single()
    const approve = await contributor().rpc('approve_suggested_change', { p_id: pending.data!.id })
    expect(approve.error?.code).toBe('42501')
    const confirm = await contributor().rpc('confirm_cell', { p_cell_id: CELL })
    expect(confirm.error?.code).toBe('42501')
    const cell = await contributor().from('cells').select('confirmed_by').eq('id', CELL).single()
    expect(cell.data).toEqual({ confirmed_by: null })
  })

  it('lets a person who may confirm approve the suggestion, which owner-confirms the cell', async () => {
    const pending = await confirmer().from('suggested_changes').select('id').eq('status', 'pending').single()
    const { error } = await confirmer().rpc('approve_suggested_change', { p_id: pending.data!.id })
    expect(error).toBeNull()
    const ownProfile = await confirmer().from('profiles').select('id').single()
    const cell = await confirmer().from('cells').select('content, confirmed_by').eq('id', CELL).single()
    expect(cell.data).toEqual({ content: 'Intake starts with a phone call', confirmed_by: ownProfile.data?.id })
    const decided = await confirmer().from('suggested_changes').select('status, decided_by').eq('id', pending.data!.id)
    expect(decided.data).toEqual([{ status: 'approved', decided_by: ownProfile.data?.id }])
    const account = await confirmer().from('profiles').select('user_id').single()
    const log = await confirmer().from('authoring_changes')
      .select('author, author_id, args, revert').eq('fn', 'update_cell_content')
    expect(log.error).toBeNull()
    expect(log.data).toHaveLength(1)
    expect(log.data![0]).toMatchObject({
      author: 'human', author_id: account.data?.user_id,
      args: { cell_id: CELL, update: { content: 'Intake starts with a phone call', confirmed_by: ownProfile.data?.id } },
      revert: { fn: 'update_cell_content', args: { cell_id: CELL, update: { confirmed_by: null, confirmed_at: null } } },
    })
  })

  it('only a confirmer may decline, leaving the cell unchanged', async () => {
    const before = await contributor().from('cells').select('*').eq('id', CELL).single()
    const proposed = await contributor().rpc('record_contribution', {
      p_cell_id: CELL, p_title: 'Another proposal', p_note: '', p_proposed_content: 'Decline this',
    })
    expect(proposed.error).toBeNull()
    const id = (proposed.data as Record<string, string>).suggested_change_id
    const refused = await contributor().rpc('decline_suggested_change', { p_id: id })
    expect(refused.error?.code).toBe('42501')
    expect((await confirmer().rpc('decline_suggested_change', { p_id: id })).error).toBeNull()
    expect((await confirmer().from('suggested_changes').select('status').eq('id', id).single()).data)
      .toEqual({ status: 'declined' })
    expect((await contributor().from('cells').select('*').eq('id', CELL).single()).data).toEqual(before.data)
  })
})
