import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
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
  await harness.update({ workers: [{ ...workerConfig, vars: { APP_ORIGIN: baseURL, AUTH_EMAIL_MODE: 'fixtures' } }] })
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
