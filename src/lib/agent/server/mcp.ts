import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { SupabaseEnv } from '@supabase/server'
import { createServerToolContext } from '@/lib/agent/tools/serverContext'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { SCOPE_ALL } from '@/lib/agent/tools/serviceScope'
import type { Database } from '@/types/database'
import type { ToolContext } from '@/lib/agent/tools/definition'
export { serverSearchConfig } from '@/lib/agent/server/searchConfig'

export function createToolServer(options: {
  url: string
  publishableKey: string
  resourceUrl: string
  jwks?: SupabaseEnv['jwks']
  fetch?: typeof fetch
  search?: NonNullable<ToolContext['meaning']>
}) {
  return withOAuthProtectedResource({
    resourceServer: options.resourceUrl,
    authorizationServer: `${options.url}/auth/v1`,
  }, withSupabase<Database>({
    auth: 'user', audience: 'authenticated',
    env: {
      url: options.url, publishableKeys: { default: options.publishableKey },
      secretKeys: {}, jwks: options.jwks ?? new URL(`${options.url}/auth/v1/.well-known/jwks.json`),
    },
  }, async request => {
    const context = createServerToolContext({
      url: options.url, publishableKey: options.publishableKey,
      jwt: request.headers.get('Authorization')!.replace(/^Bearer\s+/i, ''),
      sessionId: crypto.randomUUID(), scope: SCOPE_ALL, signal: request.signal, fetch: options.fetch,
      search: options.search,
    })
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'uno-blueprint', version: '1.0.0' })
      for (const resource of context.resources) {
        server.registerResource(resource.name, resource.uri, { mimeType: 'text/markdown' }, async uri => ({
          contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await resource.read() }],
        }))
      }
      for (const spec of context.roster) {
        const definition = findToolDefinition(spec.name)!
        server.registerTool(spec.name, {
          description: spec.description, inputSchema: definition.args,
          annotations: { readOnlyHint: definition.surface === 'read' },
        }, async args => {
          try {
            return { content: [{ type: 'text', text: await context.call(spec.name, args) }] }
          } catch (error) {
            return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'The tool could not complete this call.' }] }
          }
        })
      }
      return server
    })
    return handler.fetch(request)
  }))
}
