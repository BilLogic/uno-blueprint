import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { withOAuthProtectedResource, withSupabase } from '@supabase/server'
import type { SupabaseEnv } from '@supabase/server'
import { createServerToolContext } from '@/lib/agent/tools/serverContext'
import { findToolDefinition } from '@/lib/agent/tools/definitions'
import { SCOPE_ALL } from '@/lib/agent/tools/serviceScope'
import type { Database } from '@/types/database'
import { z } from 'zod'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { toolSpec } from '@/lib/agent/tools/definition'

/** Used by the migration generator and its drift test, never a hand-maintained roster. */
export function serverWriteContracts() {
  return Object.fromEntries(TOOL_DEFINITIONS.filter(tool => tool.surface === 'write')
    .map(tool => [tool.name, toolSpec(tool).parameters]))
}

export function createToolServer(options: {
  url: string
  publishableKey: string
  resourceUrl: string
  jwks?: SupabaseEnv['jwks']
  fetch?: typeof fetch
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
    })
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'uno-blueprint', version: '1.0.0' })
      for (const spec of context.roster) {
        const definition = findToolDefinition(spec.name)!
        server.registerTool(spec.name, {
          description: spec.description,
          inputSchema: definition.surface === 'write' ? definition.args.extend({
            service_id: z.string().uuid().optional().describe('Service to create under; copy its id from list_blueprint.'),
            confirmed: z.boolean().optional().describe('True only after the person explicitly confirmed this change; otherwise record a proposal.'),
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
