import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { chromium, devices, expect, webkit } from '@playwright/test'
import { createTestHarness } from 'wrangler'
import { registrationTermsVersion } from '../shared/registration.ts'
import { seedSyntheticBook } from './ons2-book-fixture.mjs'

const workerConfig = {
  configPath: './cloudflare/wrangler.local.jsonc',
  secrets: {
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'),
    GOOGLE_CLIENT_ID: 'synthetic-ons2.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: randomBytes(32).toString('base64url'),
    KAKAO_CLIENT_ID: 'synthetic-kakao-rest-key',
    KAKAO_CLIENT_SECRET: randomBytes(32).toString('base64url'),
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
  await seedSyntheticBook((await harness.getWorker().getEnv()).DB)
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

test('the mobile social login shows Kakao and Google and starts Kakao without email', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.route('**/api/v1/auth-methods', (route) => route.fulfill({ json: { kakao: true, google: true, email: false, username: true } }))
    await page.route('https://kauth.kakao.com/oauth/authorize?**', (route) => route.fulfill({ body: 'Synthetic Kakao sign-in' }))
    await page.goto(baseURL + '/account')
    const kakao = page.getByRole('button', { name: '카카오 로그인' })
    await expect(kakao).toBeVisible()
    const google = page.getByRole('button', { name: 'Google로 로그인' })
    await expect(google).toBeVisible()
    assert.ok((await google.boundingBox()).y < (await kakao.boundingBox()).y)
    await expect(page.getByRole('button', { name: '아이디로 로그인' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '이메일' })).toHaveCount(0)
    await kakao.locator('img').evaluate((image) => image.decode())
    await page.screenshot({ path: '.ons2/qa/kakao-sign-in-390.png', animations: 'disabled' })
    await kakao.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('https://kauth.kakao.com/oauth/authorize?**')
    const redirect = new URL(page.url())
    assert.equal(redirect.searchParams.get('redirect_uri'), baseURL + '/api/v1/auth/callback/kakao')
    assert.equal(redirect.searchParams.get('scope'), 'profile_nickname')
  } finally {
    await page.close()
  }
})

async function confirmSignup(page) {
  await page.getByRole('checkbox', { name: /만 14세 이상/ }).check()
  await page.getByRole('checkbox', { name: /이용약관에 동의/ }).check()
}

test('new social accounts see signup confirmation and the linked terms draft', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.route('https://accounts.google.com/**', (route) => route.fulfill({ body: 'Synthetic Google sign-in' }))
    await page.goto(baseURL + '/account?study=2&error=signup_disabled')
    await expect(page.getByRole('heading', { name: '간편 회원가입' })).toBeVisible()
    await page.getByRole('button', { name: 'Google로 가입' }).click()
    assert.ok(page.url().startsWith(baseURL))
    const [terms] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: '이용약관 보기' }).click(),
    ])
    await expect(terms.getByRole('heading', { name: '온스 서비스 이용약관' })).toBeVisible()
    await expect(terms.getByText(/스테이징 검토용 초안/)).toBeVisible()
    await terms.close()
    await confirmSignup(page)
    await page.getByRole('button', { name: 'Google로 가입' }).click()
    await page.waitForURL('https://accounts.google.com/**')
  } finally { await page.close() }
})

test('mobile username signup, compact account, member settings and withdrawal', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.route('**/api/v1/auth-methods', (route) => route.fulfill({ json: { kakao: true, google: true, email: false, username: true } }))
    await page.goto(baseURL + '/account')
    await page.getByRole('button', { name: '아이디로 로그인' }).click()
    await page.getByRole('button', { name: '아이디로 회원가입' }).click()
    await page.locator('input[name="username"]').fill('ons-browser-member')
    await page.locator('input[name="password"]').fill('A synthetic browser test password!')
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('A synthetic browser test password!')
    await page.getByLabel('닉네임', { exact: true }).fill('합성 아이디 회원')
    await page.getByRole('button', { name: '아이디로 가입', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: /만 14세 이상/ }).evaluate((input) => input.validity.valueMissing), true)
    const privacy = await page.request.get(baseURL + '/privacy')
    assert.equal(privacy.status(), 200)
    await confirmSignup(page)
    await page.screenshot({ path: '.ons2/qa/username-signup-390.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: '아이디로 가입', exact: true }).click()
    await expect(page.getByText('가입했습니다. 새 아이디로 로그인해 주세요.')).toBeVisible()
    await page.locator('input[name="username"]').fill('ONS-BROWSER-MEMBER')
    await page.locator('input[name="password"]').fill('A synthetic browser test password!')
    await page.getByRole('button', { name: '아이디로 로그인', exact: true }).click()
    await expect(page.getByRole('heading', { name: '내 계정' })).toBeVisible()
    await expect(page.getByRole('region', { name: '이용 상태' })).toBeVisible()
    const purchase = page.getByRole('button', { name: '교재 구매 인증', exact: true })
    await expect(purchase).toBeVisible()
    await expect(page.getByRole('button', { name: '교재 인증 티켓', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '카페 닉네임' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: '티켓 코드' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '계정 관리' })).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true)
    await page.screenshot({ path: '.ons2/qa/account-sections-390.png', fullPage: true, animations: 'disabled' })
    await purchase.click()
    await expect(page.getByRole('dialog', { name: '교재 구매 인증' }).getByLabel('카페 닉네임')).toBeVisible()
    await page.screenshot({ path: '.ons2/qa/purchase-sheet-390.png', animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(purchase).toBeFocused()
    await page.getByRole('button', { name: '회원 정보 수정' }).click()
    const profile = page.getByRole('dialog', { name: '회원 정보 수정' })
    await profile.getByLabel('닉네임').fill('수정한 학습자')
    await profile.getByRole('button', { name: '닉네임 저장' }).click()
    await expect(profile.getByRole('status')).toHaveText('닉네임을 저장했습니다.')
    await profile.getByText('비밀번호 변경', { exact: true }).click()
    await expect(profile.getByLabel('현재 비밀번호')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('region', { name: '이용 상태' })).toContainText('수정한 학습자')
    await page.getByRole('button', { name: '회원탈퇴', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '회원탈퇴' })
    await expect(dialog.getByRole('button', { name: '탈퇴 확정' })).toBeDisabled()
    await dialog.getByRole('textbox').fill('회원탈퇴')
    await dialog.getByRole('button', { name: '탈퇴 확정' }).click()
    await expect(page.getByText('회원탈퇴를 완료했습니다.')).toBeVisible()
  } finally {
    await page.close()
  }
})

test('a mobile learner signs up, solves an OX question and opens the verified exam', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 850 } })
  try {
    const email = 'study-browser@example.test'
    const password = 'Synthetic study browser password!'
    const headers = { Origin: baseURL }
    const env = await harness.getWorker().getEnv()
    await page.goto(baseURL + '/account')
    await page.getByRole('button', { name: '회원가입', exact: true }).click()
    await page.getByRole('textbox', { name: '표시 이름' }).fill('합성 학습 회원')
    await page.getByRole('textbox', { name: '이메일' }).fill(email)
    await page.getByLabel('비밀번호', { exact: true }).fill(password)
    await confirmSignup(page)
    await page.getByRole('button', { name: '회원가입', exact: true }).click()
    await page.getByRole('link', { name: '테스트 메일 링크 열기' }).click()
    await page.getByRole('heading', { name: '로그인', exact: true }).waitFor()
    await page.getByRole('textbox', { name: '이메일' }).fill(email)
    await page.getByLabel('비밀번호', { exact: true }).fill(password)
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect(page.getByRole('heading', { name: '내 계정', exact: true })).toBeVisible()

    await page.goto(baseURL + '/study?stage=2')
    await expect(page.getByRole('link', { name: '교재 인증', exact: true })).toBeVisible()
    await page.goto(baseURL + '/study?stage=1')
    await expect(page.getByRole('heading', { name: '교재 목차' })).toBeVisible()
    await expect(page.getByText('제2편 합성 목차')).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: '학습 방식' })).toHaveCount(0)
    await page.screenshot({ path: '.ons2/qa/study-outline-320.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: /제1절 개념 확인/ }).click()
    await expect(page.getByRole('dialog', { name: '학습 방식' })).toBeVisible()
    await expect(page.getByText(/선택 범위 12문항/)).toBeVisible()
    await page.getByRole('radio', { name: '순서대로' }).focus()
    await page.keyboard.down('ArrowRight')
    await expect(page.getByRole('radio', { name: '랜덤' })).toBeFocused()
    await expect(page.getByRole('radio', { name: '랜덤' })).toBeChecked()
    await page.keyboard.up('ArrowRight')
    await page.keyboard.down('ArrowRight')
    await expect(page.getByRole('radio', { name: '번호 지정' })).toBeChecked()
    await page.keyboard.up('ArrowRight')
    await page.screenshot({ path: '.ons2/qa/study-setup-320.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('spinbutton', { name: '시작 번호', exact: true }).fill('2')
    await page.getByRole('button', { name: '1문제', exact: true }).click()
    await expect(page.getByLabel('끝 번호')).toHaveValue('2')
    await page.getByLabel('끝 번호').fill('3')
    await page.getByRole('button', { name: '문제 풀기' }).click()
    const question = page.getByRole('heading', { name: '교재 2번' })
    await expect(question).toBeFocused()
    await expect(page.getByText('답을 고르면 해설이 열려요.')).toBeVisible()
    await expect(page.getByRole('button', { name: '이전 문제' })).toBeDisabled()
    await expect(page.getByRole('region', { name: '정답 및 해설' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '기본 OX 풀이 통계' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '문제 고르기' })).toHaveCount(0)
    await page.screenshot({ path: '.ons2/qa/study-question-320.png', animations: 'disabled' })
    await page.setViewportSize({ width: 1280, height: 820 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: '.ons2/qa/study-question-1280.png', animations: 'disabled' })
    await page.setViewportSize({ width: 320, height: 850 })
    await page.getByRole('button', { name: 'X 틀리다', exact: true }).click()
    await expect(page.getByText('내 답 X · 정답 O')).toBeVisible()
    await expect(page.getByRole('button', { name: 'X 틀리다', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('region', { name: '기본 OX 풀이 통계' })).toContainText('통계 수집 중')
    await page.getByRole('button', { name: '다음 문제' }).click()
    await expect(page.getByRole('heading', { name: '교재 3번' })).toBeVisible()
    await expect(page.getByText('답을 고르면 해설이 열려요.')).toBeVisible()
    await page.getByRole('button', { name: '이전 문제' }).click()
    await expect(question).toBeFocused()
    await expect(page.getByText('내 답 X · 정답 O')).toBeVisible()
    await page.getByRole('button', { name: '다음 문제' }).click()
    await page.getByRole('button', { name: '학습 마치기' }).click()
    await page.getByRole('link', { name: '오답노트', exact: true }).click()
    await expect(page.getByRole('button', { name: '1단계 교재 2번' })).toBeVisible()
    await page.getByRole('link', { name: '내 계정', exact: true }).click()
    await expect(page.getByText(email, { exact: true })).toBeVisible()
    await expect(page.getByText('기존 OX 진도 가져오기', { exact: true })).toHaveCount(0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)

    const user = (await (await page.request.get(baseURL + '/api/v1/session')).json()).user
    const requestId = randomUUID()
    const codeId = randomUUID()
    const code = randomBytes(16).toString('hex').toUpperCase()
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO purchase_requests (id, user_id, campaign_id, cafe_nickname, status, submitted_at, reviewed_at) VALUES (?, ?, 'ons-season-5', '합성 시험', 'approved', ?, ?)").bind(requestId, user.id, now, now),
      env.DB.prepare("INSERT INTO access_codes (id, request_id, user_id, campaign_id, code_hash, issued_at, expires_at) VALUES (?, ?, ?, 'ons-season-5', ?, ?, ?)").bind(codeId, requestId, user.id, createHash('sha256').update(code).digest('hex'), now, now + 60_000),
    ])
    assert.equal((await page.request.post(baseURL + '/api/v1/book-access/redeem', { data: { code }, headers })).status(), 200)
    await page.goto(baseURL)
    await expect(page.getByRole('progressbar', { name: '전체 학습 진도' })).toHaveAttribute('value', '1')
    await expect(page.getByRole('link', { name: '최근 학습' })).toHaveAttribute('href', '/study?stage=1')
    await expect(page.getByRole('link', { name: /3단계 고득점 도전/ })).toBeVisible()
    await page.getByRole('link', { name: /실전 모의고사/ }).click()
    await expect(page.getByLabel('제한 시간 (분)')).toHaveValue('20')
    await page.getByRole('button', { name: '시험 시작' }).click()
    const options = page.getByRole('group', { name: '보기' }).getByRole('button')
    await expect(options).toHaveCount(4)
    await expect(page.getByRole('timer', { name: '남은 시간' })).toBeVisible()
    await options.first().click()
    await expect(options.first()).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: '.ons2/qa/exam-320.png', fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: '시험 제출', exact: true }).click()
    await page.getByRole('button', { name: '제출하고 결과 보기' }).click()
    await expect(page.getByText(/교재 \d+번 · 출처 및 해설/)).toHaveCount(4)
  } finally { await page.close() }
})

for (const width of [320, 390, 701, 768, 1080, 1280]) {
  test(`account navigation and keyboard focus at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 800 } })
    try {
      await page.goto(baseURL)
      await page.getByRole('heading', { name: /헌법의 핵심은/ }).waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const positions = await page.locator('.ons-stage-card').evaluateAll((cards) => cards.map((card) => {
        const top = card.getBoundingClientRect().top
        return ['.ons-stage-no', '.ons-stage-card-copy strong', '.ons-stage-status'].map((selector) =>
          Math.round(card.querySelector(selector).getBoundingClientRect().top - top))
      }))
      assert.deepEqual(positions, [positions[0], positions[0], positions[0]])
      const descriptionGaps = await page.locator('.ons-stage-card').evaluateAll((cards) => cards.map((card) => {
        const description = document.createRange()
        description.selectNodeContents(card.querySelector('.ons-stage-card-description'))
        const textRight = Math.max(...Array.from(description.getClientRects(), (line) => line.right))
        return card.closest('.ons-stage-tile').querySelector('.ons-stage-scene').getBoundingClientRect().left - textRight
      }))
      assert.ok(descriptionGaps.every((gap) => gap >= 8), `Description to artwork gaps: ${descriptionGaps.join(', ')}`)
      if ([390, 1080, 1280].includes(width)) {
        await page.screenshot({ path: `.ons2/qa/home-${width}.png`, animations: 'disabled', fullPage: width === 1280 })
      }
      if (width === 390) {
        const levels = page.getByRole('region', { name: '단계별 학습' })
        for (const name of ['1단계 철한쌤 웃음 모션', '2단계 철한쌤 활짝 웃는 응원 모션', '3단계 철한쌤 불꽃 응원 모션']) {
          const mascot = levels.getByRole('button', { name, exact: true })
          await mascot.click()
          await expect(mascot.locator('.ons-stage-teacher')).toHaveAttribute('data-reaction', 'true')
          assert.equal(await page.getByRole('dialog').count(), 0)
        }
        const locked = page.getByRole('button', { name: /2단계 실전 감각/ })
        await locked.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog', { name: '2단계 실전 감각' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(locked).toBeFocused()
        await page.getByRole('button', { name: '패치노트 · 새 소식' }).click()
        await expect(page.getByRole('dialog', { name: '패치노트' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: '패치노트', exact: true })).toBeFocused()
      }
      await page.getByRole('link', { name: '내 계정', exact: true }).click()
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
      await confirmSignup(page)
      await page.getByRole('button', { name: '회원가입', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '인증 링크' }).waitFor()
    } finally {
      await page.close()
    }
  })
}

for (const engine of [chromium, webkit]) {
  test(`large photos are compressed in ${engine.name()} before saving to D1`, async () => {
    const instance = engine === chromium ? browser : await engine.launch()
    const page = await instance.newPage({ viewport: { width: 390, height: 844 } })
    try {
      const email = `purchase-${engine.name()}@example.test`
      const password = 'Synthetic photo upload password!'
      const headers = { Origin: baseURL }
      const created = await page.request.post(baseURL + '/api/v1/auth/sign-up/email', {
        headers, data: { email, password, name: '합성 사진 회원', callbackURL: baseURL + '/account',
          ageConfirmed: true, termsAccepted: true, termsVersion: registrationTermsVersion },
      })
      assert.equal(created.status(), 200)
      const { DB } = await harness.getWorker().getEnv()
      const verification = await DB.prepare("SELECT url FROM local_mail_fixtures WHERE kind = 'verify' AND email = ?").bind(email).first('url')
      assert.equal((await harness.fetch(verification, { redirect: 'manual' })).status, 302)
      const signedIn = await page.request.post(baseURL + '/api/v1/auth/sign-in/email', { headers, data: { email, password } })
      assert.equal(signedIn.status(), 200)

      await page.goto(baseURL + '/account')
      await page.getByRole('button', { name: '교재 구매 인증', exact: true }).click()
      const image = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 1800
        canvas.height = 1400
        const ctx = canvas.getContext('2d')
        const pixels = ctx.createImageData(canvas.width, canvas.height)
        let state = 17
        for (let i = 0; i < pixels.data.length; i += 4) {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0
          pixels.data[i] = state >>> 24
          pixels.data[i + 1] = (state >>> 16) & 255
          pixels.data[i + 2] = (state >>> 8) & 255
          pixels.data[i + 3] = 255
        }
        ctx.putImageData(pixels, 0, 0)
        return canvas.toDataURL('image/png').split(',')[1]
      })
      const buffer = Buffer.from(image, 'base64')
      assert.ok(buffer.length > 512 * 1024)
      const nickname = `합성 사진 ${engine.name()}`
      await page.getByLabel('카페 닉네임').fill(nickname)
      await page.getByLabel('교재 사진').setInputFiles({ name: 'camera-sized.png', mimeType: 'image/png', buffer })
      const [submitted] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/purchase' && response.request().method() === 'POST'),
        page.getByRole('button', { name: '구매 인증 신청' }).click(),
      ])
      assert.equal(submitted.status(), 201, await submitted.text())
      await expect(page.getByRole('status').filter({ hasText: '검토 대기' })).toBeVisible()
      const photo = await DB.prepare(`SELECT length(jpeg) AS size, hex(substr(jpeg, 1, 2)) AS magic
        FROM purchase_request_photos JOIN purchase_requests ON purchase_id = id WHERE cafe_nickname = ?`).bind(nickname).first()
      assert.equal(photo.magic, 'FFD8')
      assert.ok(photo.size > 0 && photo.size <= 512 * 1024)
    } finally {
      await page.close()
      if (engine !== chromium) await instance.close()
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
      await page.getByRole('button', { name: '교재 인증 티켓', exact: true }).click()
      const code = page.getByRole('textbox', { name: '티켓 코드' })
      await code.fill('ABCD1234-ABCD1234-ABCD1234-ABCD1234')
      const initial = await page.locator('.ons-ticket-art').evaluate((canvas) => canvas.toDataURL())
      if (reducedMotion === 'no-preference') await page.evaluate(() => {
        const snapshots = new Map()
        const observer = new MutationObserver(() => {
          const canvas = document.querySelector('.ons-ticket-used canvas')
          if (canvas?.dataset.frame) snapshots.set(Number(canvas.dataset.frame), canvas.toDataURL())
          if (snapshots.has(11)) observer.disconnect()
        })
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-frame'] })
        window.onsTicketPreviewFrames = snapshots
      })
      await page.getByRole('button', { name: '티켓 사용' }).click()
      const used = page.getByRole('status').filter({ hasText: '황금 티켓 사용 완료' })
      await used.waitFor()
      const art = used.locator('canvas')
      if (reducedMotion === 'no-preference') {
        await page.waitForFunction(() => {
          const frame = Number(document.querySelector('.ons-ticket-used canvas')?.dataset.frame)
          return frame > 0 && frame < 11
        })
      } else {
        assert.equal(await art.getAttribute('data-frame'), '11')
      }
      await page.locator('.ons-ticket-used canvas[data-frame="11"]').waitFor()
      assert.notEqual(await art.evaluate((canvas) => canvas.toDataURL()), initial)
      assert.equal(await code.count(), 0)
      if (reducedMotion === 'no-preference') {
        await page.screenshot({ path: '.ons2/qa/golden-ticket.png', animations: 'disabled' })
        const frames = await page.evaluate(() => [...window.onsTicketPreviewFrames.entries()])
        assert.equal(frames.length, 12)
        await mkdir('.ons2/qa/ticket-frames', { recursive: true })
        await Promise.all(frames.map(([frame, png]) => writeFile(
          `.ons2/qa/ticket-frames/${String(frame).padStart(2, '0')}.png`, Buffer.from(png.split(',')[1], 'base64'),
        )))
      }
    } finally {
      await page.close()
    }
  })
}

test('the admin screen reveals a newly issued ticket once and shows its status', async () => {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  try {
    const now = Date.now()
    const row = { id: 'synthetic-approved', cafeNickname: '라일락노트', status: 'approved', submittedAt: now, reviewedAt: now, reviewNote: null, hasPhoto: true, ticket: null }
    const ticket = { id: 'synthetic-ticket', issuedAt: now, expiresAt: now + 172800000, redeemedAt: null, revokedAt: null }
    const code = 'ABCD1234-ABCD1234-ABCD1234-ABCD1234'
    const entries = [
      { ...row, id: 'synthetic-pending', cafeNickname: '헌법책첫회독', status: 'pending' },
      { ...row, id: 'synthetic-pending-2', cafeNickname: '한걸음더', status: 'pending' },
      row,
      { ...row, id: 'synthetic-used', cafeNickname: '하루한문제', ticket: { ...ticket, redeemedAt: now } },
      { ...row, id: 'synthetic-resubmit', cafeNickname: '정리하는수험생', status: 'resubmit' },
    ]
    await page.route('**/api/v1/session', (route) => route.fulfill({ json: { user: { name: '합성 관리자' }, admin: { mfaEnabled: true, mfaFresh: true } } }))
    await page.route('**/api/v1/admin/purchases?*', (route) => {
      const params = new URL(route.request().url()).searchParams
      const purchases = entries.filter((entry) => (params.get('status') === 'all' || entry.status === params.get('status'))
        && entry.cafeNickname.includes(params.get('q') ?? ''))
      return route.fulfill({ json: { purchases, hasNext: false, total: purchases.length,
        summary: { total: entries.length, pending: 2, approved: 2, redeemed: 1 } } })
    })
    await page.route(`**/api/v1/admin/purchases/${row.id}`, (route) => route.fulfill({ json: { purchase: row } }))
    await page.route(`**/api/v1/admin/purchases/${row.id}/ticket`, async (route) => {
      assert.deepEqual(route.request().postDataJSON(), { expectedTicketId: null })
      row.ticket = ticket
      await route.fulfill({ status: 201, json: { code, ticket } })
    })
    await page.goto(baseURL + '/admin')
    await page.getByRole('button', { name: '라일락노트 검토 상세' }).waitFor()
    await page.screenshot({ path: '.ons2/qa/purchase-admin.png', animations: 'disabled' })
    await page.getByRole('button', { name: /검토 대기\s*2/ }).click()
    await page.getByText('총 2건').waitFor()
    const search = page.getByRole('searchbox', { name: '카페 닉네임 검색' })
    await search.fill('헌법')
    await search.press('Enter')
    await page.getByText('총 1건').waitFor()
    await page.getByRole('combobox', { name: '신청 상태 필터' }).selectOption('all')
    await search.fill('라일락')
    await search.press('Enter')

    const opener = page.getByRole('button', { name: '라일락노트 검토 상세' })
    await opener.click()
    const drawer = page.getByRole('dialog', { name: '라일락노트' })
    await drawer.getByRole('button', { name: '1회용 티켓 발급' }).click()
    await drawer.getByRole('button', { name: '확인', exact: true }).click()
    await drawer.getByText(code, { exact: true }).waitFor()
    await page.screenshot({ path: '.ons2/qa/purchase-admin-detail.png', animations: 'disabled' })
    await drawer.getByRole('button', { name: '티켓 코드 닫기' }).click()
    assert.equal(await page.getByText(code, { exact: true }).count(), 0)
    await drawer.getByText('발급됨', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    await expect(opener).toBeFocused()
    await page.setViewportSize({ width: 390, height: 800 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: '.ons2/qa/purchase-admin-mobile.png', animations: 'disabled' })
    await page.setViewportSize({ width: 320, height: 780 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  } finally {
    await page.close()
  }
})

test('the mobile analytics dashboard exposes budget delays and contains wide tables', async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 750 } })
  try {
    await page.route('**/api/v1/session', (route) => route.fulfill({ json: {
      user: { name: '합성 관리자' }, admin: { mfaEnabled: true, mfaFresh: true },
    } }))
    await page.route('**/api/v1/admin/study-statistics?*', (route) => route.fulfill({ json: {
      items: [{ no: 1, stage: 1, part: 1, chapter: 1, section: null, version: 1, sample: 30,
        total: 40, firstAccuracy: 10, repeatAccuracy: 60, selectedO: 60, meanSeconds: 5, difficulty: '매우 어려움', flags: [] }],
      next: false, totals: { attempts: 40, firstCorrect: 3, firstWrong: 27, repeatCorrect: 6, repeatWrong: 4 },
      boundaries: [90, 75, 50, 30], qualityPaused: true,
      budget: { status: 'paused', calculatedAt: 1, observedAt: 1, reads: 250000, writes: 10000,
        accountReads: 200000, accountWrites: 98000, accountRequests: 20000 },
    } }))
    await page.goto(baseURL + '/admin?view=statistics')
    await expect(page.getByRole('heading', { name: '문항 분석', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '통계 작업 예산' })).toContainText('일시 중지')
    const result = page.getByRole('region', { name: '문항 분석 결과' })
    await expect(result.getByRole('table')).toBeVisible()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await result.evaluate((element) => element.scrollWidth > element.clientWidth), true)
    await page.screenshot({ path: '.ons2/qa/study-statistics-admin-320.png', fullPage: true })
  } finally { await page.close() }
})

test('login and password recovery are usable in iPhone-sized WebKit', async () => {
  const safari = await webkit.launch()
  try {
    const page = await safari.newPage(devices['iPhone 13'])
    await page.goto(baseURL + '/account')
    await page.getByRole('button', { name: 'Google로 로그인' }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const login = page.getByRole('button', { name: '로그인', exact: true })
    await page.screenshot({ path: '.ons2/qa/account-iphone-webkit.png', animations: 'disabled' })
    const { bottom, height } = await login.evaluate((button) => ({ bottom: button.getBoundingClientRect().bottom, height: innerHeight }))
    assert.ok(bottom <= height, `Email submit button ends at ${bottom}px in a ${height}px viewport`)
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
    await retryPage.getByRole('link', { name: '내 계정', exact: true }).waitFor()
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
    await page.getByRole('link', { name: '내 계정', exact: true }).waitFor()

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
