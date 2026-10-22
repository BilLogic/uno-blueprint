import { createCellSearchIndexer, serverSearchConfig } from './server.generated.js'

Deno.serve(createCellSearchIndexer({
  url: Deno.env.get('SUPABASE_URL')!,
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  search: serverSearchConfig(name => Deno.env.get(name)),
}))
