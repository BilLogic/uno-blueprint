import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseClient,
  devLoginCredentials,
  hasDevAuthoringKey,
  hasDevAuthoringUi,
  isSupabaseConfigured,
} from '../lib/supabase'
import {
  setAuthoringLogWriter,
  supabaseAuthoringLogWriter,
} from '../lib/authoringLog'
import { readTier, type Tier } from '../lib/identity'
import { sessionRefresher, setSessionReconciler } from '../lib/sessionReconcile'
import type { Database } from '../types/database'
import { hasKey, useAgentSettings } from '../lib/agent/settings'
import {
  applyDevSimulation,
  useDevSimulation,
  type DevSimulation,
} from '../lib/devPortal'

type SupabaseContextValue = {
  client: SupabaseClient<Database> | null
  configured: boolean
  session: Session | null
  isLoading: boolean
  /**
   * Visibility hint for mutation UI (hidden — never disabled — when false).
   * RLS is the authority; this only reflects whether this session has any
   * chance of a write succeeding: a signed-in user, or a dev server holding
   * the local authoring key. A deployed visitor is neither.
   */
  canWrite: boolean
  /** Writing with the local authoring key rather than as a signed-in user. */
  isDevAuthoring: boolean
  /**
   * Showing the authoring UI on a dev server that cannot actually write.
   * Distinct from `isDevAuthoring`, and the two must never share a badge: one
   * means "your writes reach the live database", the other means "they will
   * not". Getting those the wrong way round is the expensive mistake.
   */
  isEditPreview: boolean
  /**
   * May this session open the agent and hold its keys? IDENTITY, and
   * deliberately never tier: any signed-in session, plus the no-database
   * trial.
   *
   * Every other gate in this file narrows as the tier narrows, so a reader
   * who has learned that the tier decides authoring will read this one as an
   * oversight and "fix" it. It is a decision. The agent is a READING tool:
   * someone who cannot edit a blueprint still needs to ask questions of it,
   * and the key is theirs — pasted into their own browser, spending their own
   * quota. Tier gates writing, not asking.
   *
   * The write half of that same line is `canAgentWrite` below, which is
   * `canWrite` and therefore tier-sensitive. A regular creator configures the
   * agent and asks it anything; the agent it talks to holds no write tools.
   * Both halves are pinned by one test, so adding a tier check here fails
   * naming this decision rather than restating the assertion.
   */
  canAgent: boolean
  /**
   * Would the database let this client read a table outside the public
   * surface? Restricted tables — `business_models`, `evidence` and
   * `evidence_counts`, `authoring_changes` and `trash`, `audit_findings`, and
   * the agent transcripts — revoke SELECT from `anon` and name
   * `authenticated` in their policy, so a request for one is refused for
   * every signed-out reader on every load.
   *
   * A read gated on this is not sent when it cannot succeed. The alternative
   * is sending it and swallowing the refusal as ordinary, which swallows a
   * genuine outage along with it.
   */
  canReadPrivate: boolean
  /**
   * Does the agent get WRITE tools this send? `canWrite` minus the
   * no-database trial, where there is no database to write to and the write
   * specs are never registered.
   */
  canAgentWrite: boolean
  /**
   * No Supabase configured, but the user has an agent key: the panel opens
   * read-only against the bundled sample blueprint.
   */
  isSampleTrial: boolean
  /** Developer-portal tier simulation — client-side UI gating only. */
  devSimulation: DevSimulation
  /**
   * The write flag before the developer-portal simulation.
   *
   * Published for one reason: it is how the simulation's contract is
   * asserted — that with the simulation off, `canWrite` is the real
   * session's answer, and that the simulation moves `canWrite` and
   * `canAgentWrite` and nothing else. `devPortal.test.tsx` is its only
   * reader, and a test is not a surface.
   *
   * No component reads it, including the portal itself, which needs only
   * `devSimulation` to know it is on. Never a gate — a surface asks
   * `canWrite`, which is the one question it may ask of the session.
   */
  realCanWrite: boolean
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null)

type SupabaseProviderProps = {
  children: ReactNode
}

/*
 * Module singleton, not useMemo: StrictMode's double render re-runs memo
 * initializers, and two GoTrueClients on one storage key is undefined
 * behavior (and a console warning on every load). One client per page is
 * the actual contract — same reasoning as lib/queryClient.ts.
 */
const sharedClient = createSupabaseClient()

/*
 * The durable change log's writer, installed here for the same reason the
 * client is a module singleton: `recordChange` is a plain function with no
 * component and no client around it, and there is exactly one client per page.
 * Null in no-DB mode, where the append is simply not attempted and the
 * in-memory change list still works.
 */
setAuthoringLogWriter(
  sharedClient ? supabaseAuthoringLogWriter(sharedClient) : null,
)

export function SupabaseProvider({ children }: SupabaseProviderProps) {
  const configured = isSupabaseConfigured()
  const client = sharedClient
  const [session, setSession] = useState<Session | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(configured)

  useEffect(() => {
    if (!client) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot resolution of the initial loading gate when Supabase is unconfigured; the async auth sync below is the real work
      setIsSessionLoading(false)
      return
    }

    let mounted = true

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setIsSessionLoading(false)
      // The tier is read server-side out of the access token this client
      // presents, so a token minted before a role change carries the old
      // answer until it is refreshed. One refresh per boot keeps long-lived
      // sessions current (onAuthStateChange delivers the new session, and
      // the tier is asked again for it).
      if (data.session) void client.auth.refreshSession()
    })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setIsSessionLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [client])

  /*
    Dev sign-in. A real session through the front door: `signInWithPassword`
    against a dev account, so RLS sees `authenticated` exactly as it would
    for any user. This is the sanctioned alternative to the service key —
    the key bypasses policy; this obeys it.

    Runs once per boot, only in DEV, only when the pair is configured, and
    only when no session already exists (a persisted session from the last
    boot wins). Failure downgrades to read-only and logs — same behavior as
    having no credentials at all.
  */
  useEffect(() => {
    if (!client || isSessionLoading || session) return
    const credentials = devLoginCredentials()
    if (!credentials) return
    let cancelled = false
    void client.auth
      .signInWithPassword(credentials)
      .then(({ error }) => {
        if (!cancelled && error) {
          console.error('[dev-login] sign-in failed:', error.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [client, isSessionLoading, session])

  /*
    Reconcile the tier when the database says the tier is wrong.

    The tier below is asked of the database and HELD, keyed on the access token
    this client presents. That makes it right for as long as the token is, and
    stale for the window between a server-side demotion and the next refresh —
    during which the reader is offered editing affordances the database will
    refuse. A refused write is the one reliable signal that the held answer is
    out of date, so `toAuthoringError` reports it here and this refreshes,
    which mints a new token, lands it through `onAuthStateChange` above, and
    re-asks the tier for it.
  */
  useEffect(() => {
    if (!client) return
    // `sessionRefresher`, not an inline `await refreshSession()`: that call
    // resolves on failure, and the reason is written where the function is.
    setSessionReconciler(sessionRefresher(client))
    return () => setSessionReconciler(null)
  }, [client])

  const isDevAuthoring = hasDevAuthoringKey()
  // Only ever true on a dev server, and never while anything can actually
  // write — a session that saves for real is not a preview of one, and the
  // "nothing saves" banner lying over working saves would be worse than either
  // state alone.
  const isEditPreview =
    hasDevAuthoringUi() && !isDevAuthoring && session === null

  /*
   * The service-account tier, asked rather than inferred.
   *
   * The seam is a database function — `is_service_account()` — that every
   * write RPC asserts in its own body and every restrictive write policy
   * ANDs with. An OPTIONAL recipe replaces the permissive default with a
   * read of the session's role claim, and a client that inferred the tier
   * from that claim's presence would be guessing which of the two databases
   * it is talking to. So it calls the function instead; see `lib/identity`
   * for what each answer means.
   *
   * The ask is keyed on the ACCESS TOKEN, because the answer is computed
   * server-side from the token this client presents: the same account on a
   * token minted before an admin stamped it gets the old answer. It is HELD
   * against the user id, so the boot refresh (a new token for the same
   * account, seconds in) updates the answer without blanking it — a refresh
   * is not a tier change, and flickering the editing UI for one would be a
   * lie told twice.
   *
   * UX gate only — the RESTRICTIVE policies and RPC guards are the wall.
   */
  const userId = session?.user.id ?? null
  const accessToken = session?.access_token ?? null
  const [tierAnswer, setTierAnswer] = useState<{
    userId: string
    tier: Tier
  } | null>(null)

  useEffect(() => {
    if (!client || userId === null || accessToken === null) return
    let cancelled = false
    void readTier(client).then((tier) => {
      if (!cancelled) setTierAnswer({ userId, tier })
    })
    return () => {
      cancelled = true
    }
  }, [client, userId, accessToken])

  // An answer belongs to the account it was asked about, so signing out — or
  // signing in as somebody else — retires it without waiting for a round trip.
  const answeredTier = tierAnswer?.userId === userId ? tierAnswer.tier : null
  // Local, not published. `canWrite` below is the only question a surface
  // asks of the session, and it is derived from this tier rather than beside
  // it, so there is no second answer to gate on by mistake.
  const isServiceAccount = answeredTier === 'service' || isDevAuthoring

  /*
   * Boot is not over until the tier is known. A signed-in session pays one
   * round trip for it; a deployed visitor pays none, having no session to
   * ask about. The alternative is to render an answer and then correct it,
   * which shows an editor a read-only board or a viewer a save button.
   */
  const isLoading =
    isSessionLoading || (userId !== null && answeredTier === null)

  const realCanWrite = configured && (isServiceAccount || isEditPreview)

  /*
   * No-database trial. With nothing configured, the canvas already renders
   * the bundled sample blueprint — the agent used to be the one surface that
   * simply did not exist there, even though its read tools can answer from
   * that same sample (the eval harness runs exactly that way). A provider key
   * is the whole entry condition; the panel opens read-only.
   */
  const agentSettings = useAgentSettings()
  const isSampleTrial = !configured && hasKey(agentSettings)

  /*
   * Developer portal. Client-side ONLY: it moves what the UI believes about
   * this session's tier and touches no policy. RLS and the RPC grants are
   * unchanged and remain the authority — see lib/devPortal.ts.
   */
  const devSimulation = useDevSimulation()
  const canWrite = applyDevSimulation(devSimulation, realCanWrite)

  const value = useMemo(
    () => ({
      client,
      configured,
      session,
      isLoading,
      canWrite,
      realCanWrite,
      canAgentWrite: canWrite && !isSampleTrial,
      isDevAuthoring,
      isEditPreview,
      // Identity, not tier — on purpose, and the field's own doc says why.
      canAgent:
        isSampleTrial || (configured && (session !== null || isDevAuthoring)),
      canReadPrivate: configured && (session !== null || isDevAuthoring),
      isSampleTrial,
      devSimulation,
    }),
    [
      client,
      configured,
      session,
      isLoading,
      canWrite,
      realCanWrite,
      isDevAuthoring,
      isEditPreview,
      isSampleTrial,
      devSimulation,
    ],
  )

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase(): SupabaseContextValue {
  const context = useContext(SupabaseContext)
  if (!context) {
    throw new Error('useSupabase must be used within SupabaseProvider')
  }
  return context
}
