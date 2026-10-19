#!/usr/bin/env node
/** Bundle the shared tool context for the Edge runtime, refusing browser dependencies. */
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { rolldown } from 'rolldown'
import { viteImportsPlugin } from 'uno-blueprint/vite-imports'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'

/** Judge the emitted graph, including re-exports and literal dynamic imports. */
export function edgeImportFindings(output) {
  return output.flatMap(chunk => chunk.type !== 'chunk' ? [] :
    [...new Set([...chunk.imports, ...chunk.dynamicImports])].map(specifier => {
      const offset = chunk.code.search(new RegExp(`["']${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`))
      const line = chunk.code.slice(0, Math.max(0, offset)).split('\n').length
      return `supabase/functions/uno-tools/${chunk.fileName}:${line}: The Edge bundle must be self-contained; unresolved import ${JSON.stringify(specifier)}.`
    }))
}

export async function buildToolServer() {
  let bundle
  const modules = new Set()
  try {
    const root = process.cwd()
    const source = sweep({ subject: 'app', root, what: 'the Edge tool server' })
    const forbidden = /(?:node_modules\/(?:react|react-dom|@tanstack\/react-query)\/|\/agent\/(?:sessions|persistenceReadiness)\.ts$)/
    bundle = await rolldown({
      input: source.locate('src/lib/agent/server/mcp.ts'),
      platform: 'browser',
      onLog(level, log, defaultHandler) {
        if (log.code === 'UNRESOLVED_IMPORT') defaultHandler('error', log)
        else defaultHandler(level, log)
      },
      resolve: { alias: { '@': dirname(source.locate('src/index.ts')) }, conditionNames: ['browser', 'import', 'default'] },
      transform: { define: { 'import.meta.env': '{}' } },
      plugins: [viteImportsPlugin(), {
        name: 'edge-capabilities',
        moduleParsed(module) {
          modules.add(module.id)
          if (forbidden.test(module.id)) throw new Error(`The Edge bundle reached a browser capability: ${module.id}`)
        },
        resolveId(source) {
          if (source.startsWith('node:')) throw new Error(`The Edge bundle reached a Node-only capability: ${source}`)
        },
      }],
    })
    const directory = resolve(root, 'supabase/functions/uno-tools')
    const options = { file: resolve(directory, 'server.generated.js'), format: 'esm', codeSplitting: false }
    const { output } = await bundle.generate(options)
    const findings = edgeImportFindings(output)
    if (findings.length) return {
      what: 'the Edge tool server', findings,
      closing: 'Run `npm ci && npm run build:tool-server`.',
    }
    mkdirSync(directory, { recursive: true })
    await bundle.write(options)
    return {
      what: 'the Edge tool server', count: modules.size,
      line: 'The tool server bundled for Edge without external imports, browser stores, React, or Node built-ins.',
    }
  } catch (error) {
    return {
      what: 'the Edge tool server', findings: [String(error)],
      closing: 'Run `npm ci && npm run build:tool-server`.',
    }
  } finally {
    await bundle?.close()
  }
}
whenRun(import.meta.url, buildToolServer)
