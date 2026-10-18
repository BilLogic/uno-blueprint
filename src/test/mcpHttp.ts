import { createServer } from 'node:http'

/** A real HTTP listener around the same Fetch handler deployed at the Edge. */
export async function openMcpHttp(handler: (request: Request) => Promise<Response>) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const url = `http://127.0.0.1:${(server.address() as {port: number}).port}`
    const headers = new Headers()
    for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, String(value))
    const result = await handler(new Request(url + request.url, {
      method: request.method, headers,
      body: request.method === 'POST' ? Buffer.concat(chunks) : undefined,
    }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as {port: number}).port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}
