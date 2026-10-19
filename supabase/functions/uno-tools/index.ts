import { createToolServer } from './server.generated.js'

const url = Deno.env.get('SUPABASE_URL')!
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!
Deno.serve(createToolServer({
  url, publishableKey, resourceUrl: `${url}/functions/v1/uno-tools`,
}))
