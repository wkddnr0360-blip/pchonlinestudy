export function json(data: unknown, status: number, method = 'GET'): Response {
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

export function privateHeaders(response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  return headers
}

export async function readSmallJson(request: Request): Promise<unknown> {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' || !request.body) return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(text + decoder.decode())
      bytes += value.byteLength
      if (bytes > 1024) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}
