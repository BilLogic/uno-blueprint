/** Shared caller login and safe reporting for search operator commands. */
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const credentials = /Bearer\s+\S+|AIza[\w-]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+/
export const hasSearchCredentials = text => credentials.test(text)
export const redactSearchCredentials = text => String(text).replace(new RegExp(credentials.source, 'g'), '[redacted]')

export async function withSearchProject(what, command, action) {
  let dotenv = {}
  try { dotenv = parseEnv(readFileSync('.env', 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') return { what, findings: [`Could not read .env. Run ${command}.`] }
  }
  const env = { ...dotenv, ...process.env }
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TOOL_SERVER_TEST_EMAIL', 'TOOL_SERVER_TEST_PASSWORD'].filter(name => !env[name])
  if (missing.length) return { what, unverified: `Set ${missing.join(', ')}; see .env.example. Run ${command}.` }
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  try {
    const { data, error } = await db.auth.signInWithPassword({ email: env.TOOL_SERVER_TEST_EMAIL, password: env.TOOL_SERVER_TEST_PASSWORD })
    if (error || !data.session) throw new Error()
    return await action({ db, url: env.SUPABASE_URL, publishableKey: env.SUPABASE_ANON_KEY, jwt: data.session.access_token })
  } catch {
    return { what, findings: [`Search project request failed. Credentials and business replies withheld. Run ${command}.`] }
  } finally { await db.auth.signOut({ scope: 'local' }) }
}
