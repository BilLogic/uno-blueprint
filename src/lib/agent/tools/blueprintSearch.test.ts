import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { searchBlueprint } from '@/lib/agent/tools/search'
import { CANONICAL_LANE_ROLES } from '@/lib/laneRoles'
import { PATH_KINDS } from '@/lib/versionValidation'

/*
 * WHAT THE TOOL DOES, seen from the two edges it touches: what it sends to the
 * provider's embedding endpoint (stubbed `fetch`) and what it sends to the
 * database (a fake client that records RPC calls). Not its internals.
 *
 * The cases that matter most are the ones where the meaning arm does not run,
 * because those are the ones that can lie. A person whose key hit a rate limit
 * must still get the words arm, and the text they get back must not claim a
 * meaning search happened — an answer that says "nothing matched by meaning"
 * when no vector was ever computed is how a mapped moment gets reported as an
 * unmapped one.
 */

const KEY = 'a-persons-own-key'
/** The width GOOGLE_INDEX names; a shorter one is a configuration fault. */
const VECTOR = Array.from({ length: 768 }, (_, i) => (i % 11) / 11)
const GOOGLE_INDEX = {
  provider: 'google' as const,
  model: 'gemini-embedding-001',
  dimensions: 768,
}

type RpcCall = { name: string; args: Record<string, unknown> }

const ROW = {
  kind: 'cell',
  id: 'cell-1',
  snippet: 'Tutor waits for the room to open',
  description: null,
  lane: 'Tutor',
  step: 'Join',
  scenario: 'Warm-Up',
  phase: 'Onboarding',
  path: 'Happy',
  matched_by: 'meaning',
  total_matched: 3,
}

function fakeClient(
  answers: Array<{ data: unknown; error: { message: string } | null }>,
): { client: SupabaseClient<Database>; calls: RpcCall[] } {
  const calls: RpcCall[] = []
  let index = 0
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      const answer = answers[Math.min(index, answers.length - 1)]
      index += 1
      return Promise.resolve(answer)
    },
  } as unknown as SupabaseClient<Database>
  return { client, calls }
}

function stubEmbed(vector: number[] | 'fail' = VECTOR): { count: () => number } {
  let count = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      count += 1
      if (vector === 'fail')
        return { ok: false, status: 429, json: async () => ({}) } as unknown as Response
      return {
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: vector } }),
      } as unknown as Response
    }),
  )
  return { count: () => count }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchBlueprint with a matching index', () => {
  it('embeds the question, then names the vector and its model to the database', async () => {
    stubEmbed()
    const { client, calls } = fakeClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(client, {
      query: 'where do tutors get stuck',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('search_blueprint')
    // pgvector's own text form, which JSON.stringify already produces.
    expect(calls[0].args.query_embedding).toBe(JSON.stringify(VECTOR))
    expect(calls[0].args.embed_model).toBe('gemini-embedding-001')
    expect(calls[0].args.q).toBe('where do tutors get stuck')
    expect(text).toContain('words and meaning')
    expect(text).toContain('cell-1')
    expect(text).toContain('[meaning]')
  })

  it('reports the corpus-wide total, so a top-k answer is not read as the whole set', async () => {
    stubEmbed()
    const { client } = fakeClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('1 shown of 3 matching')
  })

  it('passes the caller’s filters and clamps the limit', async () => {
    stubEmbed()
    const { client, calls } = fakeClient([{ data: [], error: null }])
    await searchBlueprint(client, {
      query: 'q',
      granularity: ['cell', 'path'],
      phase: 'Onboarding',
      scenario: 'Warm-Up',
      pathKind: PATH_KINDS[0],
      laneRole: CANONICAL_LANE_ROLES[0],
      limit: 5000,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(calls[0].args).toMatchObject({
      granularity: ['cell', 'path'],
      filter_phase: 'Onboarding',
      filter_scenario: 'Warm-Up',
      filter_path_kind: PATH_KINDS[0],
      filter_lane_role: CANONICAL_LANE_ROLES[0],
      match_count: 100,
    })
  })

  it('never lets the key reach the database call or the answer', async () => {
    stubEmbed()
    const { client, calls } = fakeClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(JSON.stringify(calls)).not.toContain(KEY)
    expect(text).not.toContain(KEY)
  })
})

describe('searchBlueprint with no index to embed against', () => {
  it('searches words only, and does not call an embedding endpoint at all', async () => {
    const embed = stubEmbed()
    const { client, calls } = fakeClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(client, { query: 'q', meaning: null })
    expect(embed.count()).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0].args.query_embedding).toBeUndefined()
    expect(calls[0].args.embed_model).toBeUndefined()
    expect(text).toContain('words only')
  })

  it('says what a zero-row words-only search does and does not prove', async () => {
    const { client } = fakeClient([{ data: [], error: null }])
    const text = await searchBlueprint(client, {
      query: 'stuck tutors',
      meaning: null,
    })
    expect(text).toContain('WORDS ONLY')
    expect(text).toContain('no meaning matching ran')
    expect(text).toContain('no row USES those words')
  })

  it('says something different when both arms ran and found nothing', async () => {
    stubEmbed()
    const { client } = fakeClient([{ data: [], error: null }])
    const text = await searchBlueprint(client, {
      query: 'stuck tutors',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('by words or by meaning')
    // Still told not to conclude coverage from silence — the difference is
    // that here the silence covers other wordings too.
    expect(text).toContain('not "the blueprint does not cover this"')
  })
})

/**
 * A client that records which requests were handed the run's abort signal.
 *
 * Pressing Stop has to reach a call that is WAITING, not just the gap
 * between calls: a ranked search over a large board is the slowest read the
 * agent makes. A signal that only guards the loop leaves that request
 * running after the person asked it to stop, so what is asserted is that the
 * signal arrived at the request itself.
 */
function signalRecordingClient(phases: Array<{ name: string; service_id: string }>): {
  client: SupabaseClient<Database>
  signalled: string[]
} {
  const signalled: string[] = []
  const client = {
    rpc: (name: string) => {
      const answer = { data: [{ ...ROW, phase: 'Onboarding' }], error: null }
      return {
        abortSignal: (signal: AbortSignal) => {
          signalled.push(`${name}:${signal instanceof AbortSignal}`)
          return Promise.resolve(answer)
        },
        then: (onF: (v: unknown) => unknown) => Promise.resolve(answer).then(onF),
      }
    },
    from: (table: string) => {
      const answer = { data: phases, error: null }
      const builder = {
        select: () => builder,
        abortSignal: (signal: AbortSignal) => {
          signalled.push(`${table}:${signal instanceof AbortSignal}`)
          return Promise.resolve(answer)
        },
        then: (onF: (v: unknown) => unknown) => Promise.resolve(answer).then(onF),
      }
      return builder
    },
  } as unknown as SupabaseClient<Database>
  return { client, signalled }
}

describe('searchBlueprint under a service scope', () => {
  /** A client whose phases table places each phase name in one service. */
  function scopedClient(
    phases: Array<{ name: string; service_id: string }>,
    answer: { data: unknown; error: { message: string } | null },
  ): { client: SupabaseClient<Database>; calls: RpcCall[] } {
    const calls: RpcCall[] = []
    const client = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return Promise.resolve(answer)
      },
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          then: (onF: (v: unknown) => unknown) =>
            Promise.resolve({ data: phases, error: null }).then(onF),
        }
        return builder
      },
    } as unknown as SupabaseClient<Database>
    return { client, calls }
  }

  const SCOPE = {
    kind: 'service' as const,
    serviceId: 'svc-1',
    serviceName: 'Tutoring',
  }

  it('keeps only the scoped service’s rows', async () => {
    stubEmbed()
    const outside = { ...ROW, id: 'cell-2', phase: 'Billing' }
    const { client } = scopedClient(
      [
        { name: 'Onboarding', service_id: 'svc-1' },
        { name: 'Billing', service_id: 'svc-2' },
      ],
      { data: [ROW, outside], error: null },
    )
    const text = await searchBlueprint(client, {
      query: 'q',
      scope: SCOPE,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('cell-1')
    expect(text).not.toContain('cell-2')
  })

  it('keeps the function’s own total, and says the rows shown are this service’s', async () => {
    // The function clipped at match_count BEFORE the scope filter ran, so
    // retotalling to the kept count would report a clipped top-k as the whole
    // matching set — the one number the header exists for.
    stubEmbed()
    const { client } = scopedClient([{ name: 'Onboarding', service_id: 'svc-1' }], {
      data: [ROW],
      error: null,
    })
    const text = await searchBlueprint(client, {
      query: 'q',
      scope: SCOPE,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain(
      '1 shown, in Tutoring, from the top 1 of 3 matching across the deployment',
    )
  })

  it('does not call rows that matched elsewhere an empty blueprint', async () => {
    stubEmbed()
    const { client } = scopedClient(
      [
        { name: 'Onboarding', service_id: 'svc-1' },
        { name: 'Billing', service_id: 'svc-2' },
      ],
      { data: [{ ...ROW, phase: 'Billing' }], error: null },
    )
    const text = await searchBlueprint(client, {
      query: 'late fee',
      scope: SCOPE,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    // NOT "none of them are in Tutoring": the function ranked and clipped
    // before the scope filter ran, so all this knows is where the top of the
    // list landed. Claiming the service holds nothing — and offering
    // service:"all" as the only remedy — would send the caller away from the
    // rows they were asking for.
    expect(text).toContain('The top 1 of 3 rows matching')
    expect(text).toContain('came back in other services, none in Tutoring')
    expect(text).toContain('not about Tutoring')
    expect(text).toContain('raise limit')
    expect(text).not.toContain('no row USES those words')
  })

  it('refuses to place a phase name two services share, and says how many', async () => {
    // Placing by name alone would hand this service another service's row,
    // which is the one thing a scoped read must never do.
    stubEmbed()
    const { client } = scopedClient(
      [
        { name: 'Intake', service_id: 'svc-1' },
        { name: 'Intake', service_id: 'svc-2' },
      ],
      { data: [{ ...ROW, phase: 'Intake' }], error: null },
    )
    const text = await searchBlueprint(client, {
      query: 'q',
      scope: SCOPE,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('more than one service uses')
    expect(text).not.toContain('cell-1')
    // A row nobody could place is not a row somewhere else. Both services own
    // a phase called Intake, so this row may well be Tutoring's — saying it
    // came back elsewhere would state the one thing this cannot know.
    expect(text).not.toContain('in other services')
    expect(text).toContain('not known to be outside it')
  })

  it('counts a row with no phase apart from one in another service', async () => {
    // A missing breadcrumb is a fault in the deployment's function, not a
    // fact about its data — reporting it as "in another service" would send
    // someone looking where there is nothing to find.
    stubEmbed()
    const { client } = scopedClient([{ name: 'Onboarding', service_id: 'svc-1' }], {
      data: [{ ...ROW, phase: null }],
      error: null,
    })
    const text = await searchBlueprint(client, {
      query: 'q',
      scope: SCOPE,
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('carrying no phase at all')
    expect(text).not.toContain('in other services')
    expect(text).toContain('not known to be outside it')
    expect(text).not.toContain('more than one service uses')
  })

  it('passes every row through when the scope is the whole deployment', async () => {
    stubEmbed()
    const { client } = fakeClient([
      { data: [ROW, { ...ROW, id: 'cell-2', phase: 'Billing' }], error: null },
    ])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(text).toContain('cell-1')
    expect(text).toContain('cell-2')
    expect(text).toContain('2 shown of 3 matching')
  })
})

describe('searchBlueprint when the meaning arm cannot run', () => {
  it('falls back to exactly one words-and-structure call on a failed embed', async () => {
    stubEmbed('fail')
    const { client, calls } = fakeClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].args.query_embedding).toBeUndefined()
    expect(text).toContain('words only')
  })

  it('retries once, without the vector, when the database refuses the model', async () => {
    stubEmbed()
    const { client, calls } = fakeClient([
      { data: null, error: { message: 'embedding model mismatch' } },
      { data: [ROW], error: null },
    ])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(calls).toHaveLength(2)
    expect(calls[0].args.embed_model).toBe('gemini-embedding-001')
    expect(calls[1].args.embed_model).toBeUndefined()
    expect(text).toContain('words only')
    expect(text).toContain('cell-1')
  })

  it('falls back when the database refuses the vector’s WIDTH, not just its model', async () => {
    // A deployment can list a size its index column does not hold: the
    // provider returns a correct-by-request vector, and nothing in the browser
    // can know. pgvector names the two widths, which is a configuration slip,
    // not a broken search.
    stubEmbed()
    const { client, calls } = fakeClient([
      { data: null, error: { message: 'different vector dimensions 768 and 1536' } },
      { data: [ROW], error: null },
    ])
    const text = await searchBlueprint(client, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(calls).toHaveLength(2)
    expect(calls[1].args.embed_model).toBeUndefined()
    expect(text).toContain('words only')
  })

  it('surfaces any other database error instead of reporting an empty blueprint', async () => {
    stubEmbed()
    const { client, calls } = fakeClient([
      { data: null, error: { message: 'permission denied for function search_blueprint' } },
    ])
    await expect(
      searchBlueprint(client, {
        query: 'q',
        meaning: { index: GOOGLE_INDEX, apiKey: KEY },
      }),
    ).rejects.toThrow(/permission denied/)
    expect(calls).toHaveLength(1)
  })

  it('does not retry a mismatch that arrives on a words-only run', async () => {
    // No vector was sent, so a mismatch cannot be about one — retrying the
    // same call would just ask the same question twice.
    const { client, calls } = fakeClient([
      { data: null, error: { message: 'embedding model mismatch' } },
    ])
    await expect(
      searchBlueprint(client, { query: 'q', meaning: null }),
    ).rejects.toThrow(/embedding model mismatch/)
    expect(calls).toHaveLength(1)
  })
})

/*
 * supabase-js's `rpc` is a METHOD: it reaches the request builder through
 * `this.rest`. The arrow-function fakes above never touch `this`, so a call
 * that drops the receiver passes them all and fails on every real client. This
 * fake is shaped like the real one — a class whose `rpc` reads an instance
 * field — so a detached call throws here exactly as it does in a browser.
 */
class ReceiverReadingClient {
  readonly calls: RpcCall[] = []
  private readonly rest: {
    call: (
      name: string,
      args: Record<string, unknown>,
    ) => { abortSignal: (signal: AbortSignal) => Promise<unknown> } & PromiseLike<unknown>
  }

  constructor(answers: Array<{ data: unknown; error: { message: string } | null }>) {
    let index = 0
    this.rest = {
      call: (name, args) => {
        this.calls.push({ name, args })
        const answer = answers[Math.min(index, answers.length - 1)]
        index += 1
        return {
          abortSignal: () => Promise.resolve(answer),
          then: (onF, onR) => Promise.resolve(answer).then(onF, onR),
        }
      },
    }
  }

  rpc(name: string, args: Record<string, unknown>) {
    return this.rest.call(name, args)
  }
}

describe('searchBlueprint calls rpc as a method of its client', () => {
  it('keeps the client as the receiver on the first call', async () => {
    const fake = new ReceiverReadingClient([{ data: [ROW], error: null }])
    const text = await searchBlueprint(fake as unknown as SupabaseClient<Database>, {
      query: 'q',
    })
    expect(fake.calls).toHaveLength(1)
    expect(text).toContain('cell-1')
  })

  it('keeps the client as the receiver on the retry without the vector', async () => {
    stubEmbed()
    const fake = new ReceiverReadingClient([
      { data: null, error: { message: 'embedding model mismatch' } },
      { data: [ROW], error: null },
    ])
    const text = await searchBlueprint(fake as unknown as SupabaseClient<Database>, {
      query: 'q',
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
      signal: new AbortController().signal,
    })
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1].args.embed_model).toBeUndefined()
    expect(text).toContain('cell-1')
  })
})

describe('searchBlueprint argument guards', () => {
  it('refuses a rung outside the vocabulary before anything is embedded or read', async () => {
    const embed = stubEmbed()
    const { client, calls } = fakeClient([{ data: [], error: null }])
    await expect(
      searchBlueprint(client, {
        query: 'q',
        granularity: ['cells'],
        meaning: { index: GOOGLE_INDEX, apiKey: KEY },
      }),
    ).rejects.toThrow(/Unknown granularity: cells/)
    expect(embed.count()).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('refuses a path kind and a lane role outside their vocabularies', async () => {
    const { client, calls } = fakeClient([{ data: [], error: null }])
    await expect(
      searchBlueprint(client, { query: 'q', pathKind: 'unhappy', meaning: null }),
    ).rejects.toThrow(/Unknown path kind: unhappy/)
    await expect(
      searchBlueprint(client, { query: 'q', laneRole: 'middlestage', meaning: null }),
    ).rejects.toThrow(/Unknown lane role: middlestage/)
    expect(calls).toHaveLength(0)
  })

  it('asks for at least one row, whatever the caller sent', async () => {
    // `limit: 0` is a number, so it survives the dispatcher; asking the
    // function for nothing comes back as "no row uses those words".
    const { client, calls } = fakeClient([{ data: [ROW], error: null }])
    await searchBlueprint(client, { query: 'q', limit: 0, meaning: null })
    await searchBlueprint(client, { query: 'q', limit: -5, meaning: null })
    expect(calls[0].args.match_count).toBe(1)
    expect(calls[1].args.match_count).toBe(1)
  })
})

describe('stop reaches the requests, not only the gaps between them', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hands the signal to the search call and to the ownership read', async () => {
    stubEmbed()
    const { client, signalled } = signalRecordingClient([
      { name: 'Onboarding', service_id: 'svc-1' },
    ])
    const controller = new AbortController()
    await searchBlueprint(client, {
      query: 'q',
      scope: { kind: 'service', serviceId: 'svc-1', serviceName: 'Tutoring' },
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
      signal: controller.signal,
    })
    expect(signalled).toEqual(['search_blueprint:true', 'phases:true'])
  })

  it('works unchanged when there is no signal to hand down', async () => {
    // The dispatcher may call without one, and a client builder that has no
    // `abortSignal` must not be reached in that case.
    stubEmbed()
    const { client, signalled } = signalRecordingClient([
      { name: 'Onboarding', service_id: 'svc-1' },
    ])
    const text = await searchBlueprint(client, {
      query: 'q',
      scope: { kind: 'service', serviceId: 'svc-1', serviceName: 'Tutoring' },
      meaning: { index: GOOGLE_INDEX, apiKey: KEY },
    })
    expect(signalled).toEqual([])
    expect(text).toContain('cell-1')
  })
})
