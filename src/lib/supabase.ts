import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const PLACEHOLDER_KEY = 'your-anon-key'
const PLACEHOLDER_URL_FRAGMENT = 'YOUR_PROJECT'

export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabaseAnonKey) return false
  if (supabaseAnonKey === PLACEHOLDER_KEY) return false
  if (supabaseUrl.includes(PLACEHOLDER_URL_FRAGMENT)) return false
  return true
}

/**
 * Local authoring key, dev server only.
 *
 * The deployed app is read-only to the PUBLIC by design: every write policy
 * is `to authenticated`, and a browser visitor is anon. It does carry a
 * sign-in — a password form and a magic link, in its settings — so an
 * account somebody has already made, and given the editing tier, writes from
 * the deployed site. The magic link is sent with account creation off, so it
 * cannot mint one.
 *
 * This key is the other way in, for people who already hold this project's
 * database credentials — us — working against `npm run dev`.
 *
 * Three guards, because a service key in a browser bundle is full database
 * access to anyone who loads the page:
 *
 * 1. `import.meta.env.DEV` — a production build takes the anon path even if
 *    the variable is somehow present at build time.
 * 2. The variable lives in `.env.local`, which `.gitignore` covers via
 *    `.env.*`. It must never be set in Netlify's environment.
 * 3. The provider surfaces a visible badge while it is in use, so nobody
 *    edits the live database believing they are a viewer.
 */
const devAuthoringKey = import.meta.env.DEV
  ? import.meta.env.VITE_SUPABASE_DEV_SERVICE_KEY
  : undefined

/**
 * True when this session can write — dev server, with a *real* authoring key.
 *
 * A placeholder is worse than nothing here, and it fails in the least
 * obvious way available: the key is used for every request, not just writes,
 * so `<your-service-key>` left in `.env.local` turns the whole app into
 * "Invalid API key" — phases, scenarios, cells, all of it — with no hint that
 * the cause is one unsubstituted line in a file. Treating an obvious
 * placeholder as absent degrades to the read-only path instead, which works.
 */
export function hasDevAuthoringKey(): boolean {
  if (!import.meta.env.DEV || !devAuthoringKey) return false
  return !looksLikePlaceholder(devAuthoringKey)
}

/**
 * `<paste-me>`, `your-key-here`, or something far too short to be any real
 * key. The floor is 20, not 40: Supabase's newer `sb_secret_…` keys can sit
 * near 40 characters, and classifying a real key as a placeholder silently
 * downgrades every request to the anon key — reads return nothing, no error
 * anywhere, and the app just looks like loading broke.
 */
function looksLikePlaceholder(key: string): boolean {
  const value = key.trim()
  if (value.length < 20) return true
  if (value.startsWith('<') || value.endsWith('>')) return true
  return /^(your|paste|replace|todo)[-_]/i.test(value)
}

/**
 * Show the authoring UI on the dev server *without* an authoring key.
 *
 * Grants nothing. RLS and the function grants are the authority and neither of
 * them reads this flag — holding only the anon key, a write still comes back
 * `permission denied for function upsert_cell`, which is the revoke working.
 *
 * It exists because the Edit surfaces became invisible to their own designer:
 * hiding them when `canWrite` is false is right for a deployed visitor and
 * wrong for someone building them, and the alternative — pasting a
 * service-role key into a bundle to look at a toolbar — is a far worse trade.
 * A flag that over-promises costs one clear error message; a key in a bundle
 * costs the database.
 */
const devAuthoringUi = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_AUTHORING_UI
  : undefined

export function hasDevAuthoringUi(): boolean {
  return Boolean(import.meta.env.DEV && devAuthoringUi === 'true')
}

/**
 * Dev sign-in: a real authenticated session, which is what the write
 * policies were written for — no service key anywhere near a browser bundle.
 *
 * The pair lives in `.env.local` (gitignored) and is read only on the dev
 * server. RLS treats the session like any signed-in user: writes allowed by
 * policy, nothing bypassed. A production build ignores both variables.
 */
export function devLoginCredentials(): { email: string; password: string } | null {
  if (!import.meta.env.DEV) return null
  const email = import.meta.env.VITE_SUPABASE_DEV_EMAIL
  const password = import.meta.env.VITE_SUPABASE_DEV_PASSWORD
  if (!email || !password) return null
  return { email, password }
}

export function createSupabaseClient({ publicOnly = false }: { publicOnly?: boolean } = {}): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null
  }

  const useDevKey = !publicOnly && hasDevAuthoringKey()
  const key = useDevKey ? devAuthoringKey! : supabaseAnonKey

  return createClient<Database>(supabaseUrl, key, {
    auth: {
      // A service key must not be persisted or refreshed as if it were a
      // user session — it is not one, and storing it widens where it lands.
      persistSession: !useDevKey,
      autoRefreshToken: !useDevKey,
    },
  })
}
