/**
 * The tool server the owner-agent cases run against.
 *
 * An agent host that ran `/ub:init` reaches the business through one remote
 * MCP server, signed in as a person. This opens that connection the way a
 * host does: it signs in through Supabase Auth with the test caller the
 * project smokes already use (`TOOL_SERVER_TEST_EMAIL` /
 * `TOOL_SERVER_TEST_PASSWORD`) and connects to `uno-tools` with the session's
 * JWT, so every read carries that person's identity and row-level security.
 *
 * The OFFER is the server's own `tools/list`, not the app's roster: what the
 * model sees is what a host would see. Reads cross the boundary for real.
 * Writes stay rehearsals, as everywhere in this harness, and the runner does
 * that half: it sends a write to no server, and refuses one it cannot
 * rehearse, which is why `readOnly` is carried through.
 */
import { createClient } from '@supabase/supabase-js'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

/** The settings a tool-server run needs, named so a missing one is said rather than guessed. */
export const TOOL_SERVER_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'TOOL_SERVER_TEST_EMAIL',
  'TOOL_SERVER_TEST_PASSWORD',
]

/**
 * A signed-in MCP connection: `{ endpoint, tools, call(name, args), close() }`.
 * `tools` are provider-neutral `{ name, description, parameters, readOnly }`;
 * `call` answers with the reply's text and throws on an error reply, so the
 * runner records it as a tool error the way it records any other.
 */
export async function connectToolServer(env) {
  const missing = TOOL_SERVER_ENV.filter((name) => !env[name])
  if (missing.length)
    throw new Error(`a tool-server run needs ${missing.join(', ')} (env, .env or .env.local); see .env.example`)
  const endpoint = new URL(`${env.SUPABASE_URL}/functions/v1/uno-tools`)
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await db.auth.signInWithPassword({
    email: env.TOOL_SERVER_TEST_EMAIL,
    password: env.TOOL_SERVER_TEST_PASSWORD,
  })
  // The caller's own error text can carry the address; the sentence is ours.
  if (error || !data.session) throw new Error('the tool-server test caller could not sign in')
  const client = new Client({ name: 'uno-agent-harness', version: '1' })
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    }),
  )
  const { tools } = await client.listTools()
  return {
    endpoint: endpoint.href,
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.inputSchema,
      readOnly: tool.annotations?.readOnlyHint === true,
    })),
    async call(name, args) {
      const reply = await client.callTool({ name, arguments: args })
      const text = (reply.content ?? [])
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n')
      if (reply.isError) throw new Error(text || `${name} failed on the tool server`)
      return text
    },
    async close() {
      await client.close().catch(() => {})
      await db.auth.signOut({ scope: 'local' }).catch(() => {})
    },
  }
}
