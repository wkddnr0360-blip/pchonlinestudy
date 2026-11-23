import { expect, test } from 'vitest'
import worker from '../cloudflare/worker.mjs'

const origin = 'https://wkddnr0360-blip.github.io'
const env = { ALLOWED_ORIGIN: origin, BOOK_VERSION: '3f81c1c4298504cd' }
const url = 'https://example.workers.dev'

test('premium book endpoints never serve data without a signed-in session', async () => {
  const response = await worker.fetch(new Request(url + '/book/3f81c1c4298504cd/2-1-1', {
    headers: { Origin: origin },
  }), env)
  expect(response.status).toBe(401)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

test('admin code issuance cannot be called without an admin secret', async () => {
  const response = await worker.fetch(new Request(url + '/admin/codes', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 100 }),
  }), env)
  expect(response.status).toBe(403)
})

test('CORS only allows the app origin', async () => {
  const valid = await worker.fetch(new Request(url + '/auth/me', {
    method: 'OPTIONS', headers: { Origin: origin },
  }), env)
  expect(valid.status).toBe(204)
  expect(valid.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  const rejected = await worker.fetch(new Request(url + '/auth/me', {
    method: 'OPTIONS', headers: { Origin: 'https://evil.example' },
  }), env)
  expect(rejected.status).toBe(403)
  expect(rejected.headers.get('Access-Control-Allow-Origin')).toBeNull()
})
