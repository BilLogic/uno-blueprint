#!/usr/bin/env node
/** Bundle the shared tool context for the Edge runtime, refusing browser dependencies. */
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import { viteImportsPlugin } from 'uno-blueprint/vite-imports'
import { sweep } from './sweep.mjs'

export async function buildToolServer() {
  const root = process.cwd()
  const source = sweep({ subject: 'app', root, what: 'the Edge tool server' })
  const forbidden = /(?:node_modules\/(?:react|react-dom|@tanstack\/react-query)\/|\/agent\/(?:sessions|persistenceReadiness)\.ts$)/
  const bundle = await rolldown({
    input: source.locate('src/lib/agent/server/mcp.ts'),
    platform: 'browser',
    resolve: { alias: { '@': dirname(source.locate('src/index.ts')) }, conditionNames: ['browser', 'import', 'default'] },
    transform: { define: { 'import.meta.env': '{}' } },
    plugins: [viteImportsPlugin(), {
      name: 'edge-capabilities',
      moduleParsed(module) {
        if (forbidden.test(module.id)) throw new Error(`The Edge bundle reached a browser capability: ${module.id}`)
      },
      resolveId(source) {
        if (source.startsWith('node:')) throw new Error(`The Edge bundle reached a Node-only capability: ${source}`)
      },
    }],
  })
  const directory = resolve(root, 'supabase/functions/uno-tools')
  mkdirSync(directory, { recursive: true })
  await bundle.write({ file: resolve(directory, 'server.generated.js'), format: 'esm', codeSplitting: false })
  await bundle.close()
  console.log('The tool server bundled for Edge without browser stores, React, or Node built-ins.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildToolServer()
