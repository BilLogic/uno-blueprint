import { defineConfig } from '@playwright/test'
import { loadEnv } from 'vite'

const baseURL = process.env.CANVAS_AUTHORING_URL ?? 'http://127.0.0.1:5186'
const target = new URL(baseURL)
if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port === '5173') {
  throw new Error('Canvas authoring checks require a dedicated local canvas port.')
}
const api = loadEnv('development', process.cwd(), 'VITE_SUPABASE_').VITE_SUPABASE_URL
if (!api || !['127.0.0.1', 'localhost'].includes(new URL(api).hostname)) {
  throw new Error('Canvas authoring checks require a local Supabase API in the dev environment.')
}
export default defineConfig({
  testDir: '.',
  testMatch: 'canvas-authoring.spec.ts',
  workers: 1,
  timeout: 60_000,
  outputDir: '../render-walk-output/authoring',
  reporter: [['list'], ['json', { outputFile: '../render-walk-output/authoring-results.json' }]],
  use: { baseURL, channel: 'chrome', viewport: { width: 1600, height: 1000 } },
})
