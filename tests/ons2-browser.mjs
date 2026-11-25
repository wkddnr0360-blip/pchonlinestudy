import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import { createTestHarness } from 'wrangler'

const workerConfig = {
  configPath: './cloudflare/wrangler.local.jsonc',
  secrets: { BETTER_AUTH_SECRET: randomBytes(32).toString('base64url') },
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

for (const width of [320, 1280]) {
  test(`account navigation and keyboard focus at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    try {
      await page.goto(baseURL)
      await page.getByRole('link', { name: '로그인 및 회원가입' }).click()
      await page.getByRole('heading', { name: '로그인', exact: true }).waitFor()
      const email = page.getByRole('textbox', { name: '이메일' })
      await email.focus()
      await page.keyboard.press('Tab')
      assert.equal(await page.getByLabel('비밀번호', { exact: true }).evaluate((field) => field === document.activeElement), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: `.ons2/qa/account-${width}.png`, animations: 'disabled' })
      await page.getByRole('button', { name: '회원가입', exact: true }).click()
      await page.getByRole('heading', { name: '회원가입', exact: true }).waitFor()
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
