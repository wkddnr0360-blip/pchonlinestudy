import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createTestHarness } from 'wrangler'

const harness = createTestHarness({
  workers: [
    { configPath: './cloudflare/wrangler.local.jsonc' },
    { configPath: './cloudflare/wrangler.mcp.local.jsonc' },
  ],
})

before(async () => { await harness.listen() })
after(async () => { await harness.close() })

test('the shell and its scripts load through the Worker', async () => {
  const shell = await harness.fetch('/')
  assert.equal(shell.status, 200)
  assert.equal(shell.headers.get('Cache-Control'), 'no-store')
  assert.match(shell.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  const html = await shell.text()
  assert.match(html, /박철한 온스 2\.0/)
  const [, source] = html.match(/src="(\/assets\/[^"]+\.js)"/)
  const script = await harness.fetch(source)
  assert.equal(script.status, 200)
  assert.match(script.headers.get('Content-Type'), /javascript/)
  await script.arrayBuffer()
})

test('legacy files, private objects and unknown API paths cannot fall through to assets', async () => {
  for (const path of ['/book/manifest.json', '/book/0123456789abcdef/2-1-1.json', '/%62ook/manifest.json', '/sw.js', '/api/v1/questions', '/assets/missing-abcdef12.js']) {
    const response = await harness.fetch(path)
    assert.equal(response.status, 404, path)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store', path)
    assert.deepEqual(await response.json(), { error: 'not_found' }, path)
  }
  const response = await harness.fetch('/api/v1/session')
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'login_required' })
})

test('local D1, private R2 and the separate MCP KV have runtime bindings', async () => {
  const app = await harness.getWorker('pch-ons2-local').getEnv()
  assert.equal((await app.DB.prepare('SELECT 1 AS ready').first()).ready, 1)
  await app.PRIVATE_FILES.put('verification/synthetic.txt', '合成')
  assert.equal(await (await app.PRIVATE_FILES.get('verification/synthetic.txt')).text(), '合成')
  assert.equal((await harness.fetch('/verification/synthetic.txt')).status, 404)

  const mcp = harness.getWorker('pch-ons2-mcp-local')
  const mcpEnv = await mcp.getEnv()
  await mcpEnv.OAUTH_KV.put('synthetic-test', 'ready')
  assert.equal(await mcpEnv.OAUTH_KV.get('synthetic-test'), 'ready')
  const health = await mcpEnv.APP.fetch('https://app.invalid/api/v1/health')
  assert.deepEqual(await health.json(), { ok: true })
  const closed = await mcp.fetch('https://mcp.invalid/mcp', { method: 'POST' })
  assert.equal(closed.status, 503)
  assert.deepEqual(await closed.json(), { error: 'mcp_unavailable' })
})
