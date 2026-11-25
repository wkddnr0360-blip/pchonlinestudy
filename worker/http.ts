export function json(data: unknown, status: number, method = 'GET'): Response {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export function privateHeaders(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  return headers
}

export async function readSmallJson(request: Request, limit = 1024): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return null
  const bytes = await readLimitedBody(request, limit)
  if (!bytes) return null
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
  } catch {
    return null
  }
}

export async function readLimitedBody(request: Request, limit: number) {
  if (!request.body || Number(request.headers.get('Content-Length')) > limit) return null
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        return null
      }
      parts.push(value)
    }
    const output = new Uint8Array(size)
    let offset = 0
    for (const part of parts) {
      output.set(part, offset)
      offset += part.byteLength
    }
    return output
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
