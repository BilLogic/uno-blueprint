#!/usr/bin/env node
/** Bundle the shared tool context for the Edge runtime, refusing browser dependencies. */
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { rolldown } from 'rolldown'
import { viteImportsPlugin } from 'uno-blueprint/vite-imports'
import { sweep } from './sweep.mjs'
import { whenRun } from './verdict.mjs'

const FUNCTION_DIRECTORY = 'supabase/functions/uno-tools'
const SUBJECT = 'the Edge tool server'
const RERUN = 'Run `npm run build:tool-server`.'

/** Judge the emitted graph, including re-exports and literal dynamic imports. */
export function edgeImportFindings(output) {
  return output.flatMap(chunk => chunk.type !== 'chunk' ? [] :
    [...new Set([...chunk.imports, ...chunk.dynamicImports])].map(specifier =>
      `Unwritten Edge bundle ${JSON.stringify(chunk.fileName)} is not self-contained: external import ${JSON.stringify(specifier)}.`))
}

export async function buildToolServer({ root = process.cwd() } = {}) {
  let bundle
  let unresolvedImport = false
  const modules = new Set()
  try {
    const source = sweep({ subject: 'app', root, what: SUBJECT })
    const forbidden = /(?:node_modules\/(?:react|react-dom|@tanstack\/react-query)\/|\/agent\/(?:sessions|persistenceReadiness)\.ts$)/
    bundle = await rolldown({
      input: source.locate('src/lib/agent/server/mcp.ts'),
      platform: 'browser',
      onLog(level, log, defaultHandler) {
        if (log.code === 'UNRESOLVED_IMPORT') {
          unresolvedImport = true
          defaultHandler('error', log)
        } else defaultHandler(level, log)
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
    const directory = resolve(root, FUNCTION_DIRECTORY)
    const options = { file: resolve(directory, 'server.generated.js'), format: 'esm', codeSplitting: false }
    const { output } = await bundle.generate(options)
    const findings = edgeImportFindings(output)
    if (findings.length) return {
      what: SUBJECT, findings, closing: RERUN,
    }
    mkdirSync(directory, { recursive: true })
    await bundle.write(options)
    return {
      what: SUBJECT, count: modules.size,
      line: 'The tool server bundled for Edge without external imports, browser stores, React, or Node built-ins.',
    }
  } catch (error) {
    return {
      what: SUBJECT, findings: [String(error)],
      closing: unresolvedImport ? 'Run `npm ci && npm run build:tool-server`.' : RERUN,
    }
  } finally {
    await bundle?.close()
  }
}
whenRun(import.meta.url, buildToolServer)
