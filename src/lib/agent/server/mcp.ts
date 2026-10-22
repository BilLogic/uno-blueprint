import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { SupabaseEnv } from '@supabase/server'
import { createServerToolContext } from '@/lib/agent/tools/serverContext'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { SCOPE_ALL } from '@/lib/agent/tools/serviceScope'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { CONFIRMATION_DESCRIPTION, toolContractSpec, type ToolContext } from '@/lib/agent/tools/definition'
export { SERVICE_REQUIRED } from '@/lib/agent/tools/serviceRefusal'
export { serverSearchConfig } from '@/lib/agent/server/searchConfig'

/** Used by the migration generator and its drift test, never a hand-maintained roster. */
export function serverWriteContracts() {
  return Object.fromEntries(TOOL_DEFINITIONS.filter(tool => tool.surface === 'write')
    .map(tool => [tool.name, toolContractSpec(tool).parameters]))
}

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
      allowWrites: true,
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
          description: spec.description,
          inputSchema: definition.surface === 'write' ? definition.args.extend({
            service_id: z.string().uuid().optional().describe('Service to create under; copy its id from list_services or list_blueprint.'),
            confirmed: z.boolean().optional().describe(CONFIRMATION_DESCRIPTION),
          }).passthrough() : definition.args,
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
