import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('@supabase/supabase-js') })

it('consent authentication uses the public key even when the board has a dev authoring key', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
  vi.stubEnv('VITE_SUPABASE_DEV_SERVICE_KEY', 'dev-authoring-key')
  const createClient = vi.fn()
  vi.doMock('@supabase/supabase-js', () => ({ createClient }))
  const { createSupabaseClient } = await import('./supabase')
  createSupabaseClient({ publicOnly: true })
  expect(createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-key', {
    auth: { persistSession: true, autoRefreshToken: true },
  })
})
