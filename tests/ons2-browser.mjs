import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { chromium, devices, webkit } from '@playwright/test'
import { createTestHarness } from 'wrangler'

const workerConfig = {
  configPath: './cloudflare/wrangler.local.jsonc',
  secrets: {
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
    GOOGLE_CLIENT_ID: 'synthetic-ons2.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: randomBytes(32).toString('base64url'),
  },
}
const harness = createTestHarness({ workers: [workerConfig] })
let browser
let baseURL

before(async () => {
  const server = await harness.listen()
  baseURL = server.url.origin
  await harness.update({ workers: [{ ...workerConfig, vars: {
    APP_ORIGIN: baseURL, AUTH_EMAIL_MODE: 'fixtures', LEGACY_PAGES_CACHE_MIGRATION: '1',
  } }] })
  await harness.getWorker().applyD1Migrations('DB')
  browser = await chromium.launch()
  await mkdir('.ons2/qa', { recursive: true })
})

after(async () => {
  await browser?.close()
  await harness.close()
})

beforeEach(async () => {
  const env = await harness.getWorker().getEnv()
  await env.DB.prepare('DELETE FROM auth_rate_limits').run()
})

for (const width of [320, 390, 768, 1280]) {
  test(`account navigation and keyboard focus at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    try {
      await page.goto(baseURL)
      await page.getByRole('link', { name: '로그인 및 회원가입' }).click()
      await page.getByRole('heading', { name: '로그인', exact: true }).waitFor()
      const email = page.getByRole('textbox', { name: '이메일' })
      const google = page.getByRole('button', { name: 'Google로 로그인' })
      await google.waitFor()
      await google.locator('img').evaluate((image) => image.decode())
      const character = page.locator('.ons-account-teacher')
      const assetUrl = await character.evaluate((element) => getComputedStyle(element).backgroundImage.slice(5, -2))
      assert.match(assetUrl, /\/assets\/teacher-[\w-]+\.webp$/)
      assert.equal((await page.request.get(assetUrl)).status(), 200)
      await email.focus()
      await page.keyboard.press('Tab')
      const password = page.getByLabel('비밀번호', { exact: true })
      assert.equal(await password.evaluate((field) => field === document.activeElement), true)
      await password.fill('Synthetic screen test password!')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Space')
      assert.equal(await password.getAttribute('type'), 'text')
      await page.getByRole('button', { name: '비밀번호 숨기기' }).click()
      assert.equal(await password.getAttribute('type'), 'password')
      assert.equal(await password.inputValue(), 'Synthetic screen test password!')
      await password.clear()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await password.blur()
      await page.mouse.move(0, 0)
      await page.screenshot({ path: `.ons2/qa/account-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '회원가입', exact: true }).click()
      await page.getByRole('heading', { name: '회원가입', exact: true }).waitFor()
      assert.match(await character.getAttribute('class'), /teacher-2/)
      if (width === 390) await page.screenshot({ path: '.ons2/qa/signup-390.png', animations: 'disabled' })
      await page.getByRole('textbox', { name: '표시 이름' }).fill('합성 브라우저 회원')
      await page.getByRole('textbox', { name: '이메일' }).fill(`browser${width}@example.test`)
      await page.getByLabel('비밀번호', { exact: true }).fill('Synthetic browser password!')
      await page.getByRole('button', { name: '회원가입', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '인증 링크' }).waitFor()
    } finally {
      await page.close()
    }
  })
}

test('the account design uses the verified pose when a member has a textbook entitlement', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    await page.route('**/api/v1/session', (route) => route.fulfill({ json: {
      user: { name: '합성 테스트 회원', email: 'verified@example.test' },
      access: { bookVerified: true, expiresAt: Date.parse('2027-03-14T15:00:00Z') },
    } }))
    await page.goto(baseURL + '/account')
    await page.getByRole('heading', { name: '내 계정', exact: true }).waitFor()
    assert.match(await page.locator('.ons-account-teacher').getAttribute('class'), /teacher-3/)
    assert.equal(await page.getByText('교재 인증 이용권 · 2027년 3월 14일까지').count(), 1)
    await page.screenshot({ path: '.ons2/qa/verified-account-1280.png', animations: 'disabled' })
  } finally {
    await page.close()
  }
})

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`a new ticket stamps and unlocks the account with ${reducedMotion} motion`, async () => {
    const page = await browser.newPage({ viewport: { width: 880, height: 800 }, reducedMotion })
    try {
      const user = { name: '합성 티켓 회원', email: 'ticket@example.test' }
      await page.route('**/api/v1/session', (route) => route.fulfill({ json: { user, access: { bookVerified: false, expiresAt: null } } }))
      await page.route('**/api/v1/purchase', (route) => route.fulfill({ json: { purchase: {
        id: 'synthetic-request', cafeNickname: '합성 회원', status: 'approved', submittedAt: 1, reviewedAt: 2, reviewNote: null,
      } } }))
      await page.route('**/api/v1/book-access/redeem', (route) => route.fulfill({ json: {
        access: { bookVerified: true, expiresAt: Date.parse('2027-03-14T15:00:00Z') }, consumedNow: true,
      } }))
      await page.goto(baseURL + '/account')
      const code = page.getByRole('textbox', { name: '티켓 코드' })
      await code.fill('ABCD1234-ABCD1234-ABCD1234-ABCD1234')
      const initial = await page.locator('.ons-ticket-art').evaluate((canvas) => canvas.toDataURL())
      await page.getByRole('button', { name: '티켓 사용' }).click()
      const used = page.getByRole('status').filter({ hasText: '황금 티켓 사용 완료' })
      await used.waitFor()
      const art = used.locator('canvas')
      if (reducedMotion === 'no-preference') {
        await page.waitForFunction(() => {
          const frame = Number(document.querySelector('.ons-ticket-used canvas')?.dataset.frame)
          return frame > 0 && frame < 7
        })
      } else {
        assert.equal(await art.getAttribute('data-frame'), '7')
      }
      await page.locator('.ons-ticket-used canvas[data-frame="7"]').waitFor()
      assert.notEqual(await art.evaluate((canvas) => canvas.toDataURL()), initial)
      assert.equal(await code.count(), 0)
      if (reducedMotion === 'no-preference') await page.screenshot({ path: '.ons2/qa/golden-ticket.png', animations: 'disabled' })
    } finally {
      await page.close()
    }
  })
}

test('the admin screen reveals a newly issued ticket once and shows its status', async () => {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  try {
    const now = Date.now()
    const row = { id: 'synthetic-approved', cafeNickname: '검토된 합성 회원', status: 'approved', submittedAt: now, reviewedAt: now, reviewNote: null, hasPhoto: false, ticket: null }
    const ticket = { id: 'synthetic-ticket', issuedAt: now, expiresAt: now + 172800000, redeemedAt: null, revokedAt: null }
    const code = 'ABCD1234-ABCD1234-ABCD1234-ABCD1234'
    await page.route('**/api/v1/session', (route) => route.fulfill({ json: { admin: { mfaEnabled: true, mfaFresh: true } } }))
    await page.route('**/api/v1/admin/purchases?page=*', (route) => route.fulfill({ json: { purchases: [row], hasNext: false } }))
    await page.route(`**/api/v1/admin/purchases/${row.id}/ticket`, async (route) => {
      assert.deepEqual(route.request().postDataJSON(), { expectedTicketId: null })
      row.ticket = ticket
      await route.fulfill({ status: 201, json: { code, ticket } })
    })
    page.once('dialog', (dialog) => dialog.accept())
    await page.goto(baseURL + '/admin')
    await page.getByRole('button', { name: '1회용 티켓 발급' }).click()
    await page.getByText(code, { exact: true }).waitFor()
    await page.getByRole('button', { name: '티켓 코드 닫기' }).click()
    assert.equal(await page.getByText(code, { exact: true }).count(), 0)
    await page.getByText(/최근 티켓 · 발급됨/).waitFor()
    await page.screenshot({ path: '.ons2/qa/purchase-admin.png', animations: 'disabled' })
  } finally {
    await page.close()
  }
})

test('login and password recovery are usable in iPhone-sized WebKit', async () => {
  const safari = await webkit.launch()
  try {
    const page = await safari.newPage(devices['iPhone 13'])
    await page.goto(baseURL + '/account')
    await page.getByRole('button', { name: 'Google로 로그인' }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const login = page.getByRole('button', { name: '로그인', exact: true })
    assert.equal(await login.evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight), true)
    await page.screenshot({ path: '.ons2/qa/account-iphone-webkit.png', animations: 'disabled' })
    await page.getByRole('button', { name: '비밀번호 찾기' }).click()
    await page.getByRole('heading', { name: '비밀번호 찾기', exact: true }).waitFor()
    assert.equal(await page.getByRole('textbox', { name: '이메일' }).isVisible(), true)
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).count(), 0)
  } finally {
    await safari.close()
  }
})

test('a cached Pages tab can open Workers and retire its old shell without clearing progress', async () => {
  const oldBuild = '11111111-1111-1111-1111-111111111111'
  const oldWorker = `/sw-${oldBuild}.js`
  const oldHtml = '<!doctype html><meta charset="utf-8"><h1>이전 온스 화면</h1><a href="/?ons-retry=1">다시 열기</a>'
  const cachedWorker = `
    const shellCache = 'ons-${oldBuild}-precache-v2-' + self.registration.scope;
    self.addEventListener('install', (event) => event.waitUntil((async () => {
      const cache = await caches.open(shellCache);
      await cache.put(self.registration.scope, new Response(${JSON.stringify(oldHtml)}, {headers: {'Content-Type':'text/html; charset=utf-8'}}));
    })()));
    self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', (event) => {
      if (event.request.mode === 'navigate' && !new URL(event.request.url).searchParams.has('ons-retry')) {
        event.respondWith(caches.match(self.registration.scope, { cacheName: shellCache }));
      }
    });
  `
  let workersLive = false
  const proxy = createServer(async (request, response) => {
    if (!workersLive) {
      if (request.url === oldWorker) {
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(cachedWorker)
      } else {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(oldHtml)
      }
      return
    }
    try {
      const current = await harness.fetch(baseURL + request.url)
      response.writeHead(current.status, Object.fromEntries(current.headers)).end(Buffer.from(await current.arrayBuffer()))
    } catch {
      response.writeHead(500).end()
    }
  })

  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${proxy.address().port}`
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(origin)
    await page.evaluate(async (workerUrl) => {
      await navigator.serviceWorker.register(workerUrl, { updateViaCache: 'none' })
      await navigator.serviceWorker.ready
      await caches.open('police-ox-book')
      await caches.open('unrelated-fixture-cache')
      await new Promise((resolve, reject) => {
        const database = indexedDB.open('ons-progress-fixture', 1)
        database.onupgradeneeded = () => database.result.createObjectStore('progress').put(23, 'completed')
        database.onsuccess = () => { database.result.close(); resolve() }
        database.onerror = () => reject(database.error)
      })
    }, oldWorker)
    await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated')

    workersLive = true
    await page.reload()
    await page.getByRole('heading', { name: '이전 온스 화면' }).waitFor()

    const retryPage = await context.newPage()
    await retryPage.goto(origin + '/?ons-retry=1')
    await retryPage.getByRole('link', { name: '로그인 및 회원가입' }).waitFor()
    await retryPage.close()

    await page.evaluate(async () => {
      const release = await fetch('/release.json?check=1', { cache: 'no-store' })
      if (release.headers.get('cache-control') !== 'private, no-store') throw new Error('Release marker can be cached')
      const { id, builtAt } = await release.json()
      await navigator.serviceWorker.register(`/sw-${id}.js?build=${id}&builtAt=${builtAt}`, { updateViaCache: 'none' })
    })
    await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))
    assert.equal(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname), oldWorker)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    })
    await page.waitForFunction(async () => !await navigator.serviceWorker.getRegistration())
    await page.goto(origin)
    await page.getByRole('link', { name: '로그인 및 회원가입' }).waitFor()

    const preserved = await page.evaluate(async () => ({
      cacheNames: await caches.keys(),
      progress: await new Promise((resolve, reject) => {
        const database = indexedDB.open('ons-progress-fixture', 1)
        database.onsuccess = () => {
          const read = database.result.transaction('progress').objectStore('progress').get('completed')
          read.onsuccess = () => { database.result.close(); resolve(read.result) }
          read.onerror = () => reject(read.error)
        }
        database.onerror = () => reject(database.error)
      }),
    }))
    assert.deepEqual(preserved, { cacheNames: ['unrelated-fixture-cache'], progress: 23 })
  } finally {
    await context.close()
    await new Promise((resolve) => proxy.close(resolve))
  }
})
