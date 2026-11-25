import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import { createTestHarness } from 'wrangler'
import { captureStudyAttempt } from '../worker/analytics/capture.ts'
import { seedSyntheticBook } from '../tests/ons2-book-fixture.mjs'

const concurrent = 100
const harness = createTestHarness({ workers: [{ configPath: './cloudflare/wrangler.local.jsonc' }] })
const source = await readFile(new URL('../worker/services/study.ts', import.meta.url), 'utf8')
const rateLimit = source.match(/INSERT INTO study_rate_limits[\s\S]*?RETURNING hits/)[0]
const original = source.match(/INSERT INTO study_attempts[\s\S]*?ON CONFLICT\(user_id, kind, event_id\) DO NOTHING/)[0]
const uid = (i) => 'benchmark-' + i
const event = (i, label) => label + '-' + i
const average = (values) => values.reduce((sum, item) => sum + item, 0) / values.length
const addMetric = (results, key) => results.reduce((sum, { meta }) => sum + meta[key], 0)

try {
  await harness.listen()
  const worker = harness.getWorker()
  await worker.applyD1Migrations('DB')
  const { DB } = await worker.getEnv()
  await seedSyntheticBook(DB)
  for (let i = 0; i < concurrent; i += 25) {
    await DB.batch(Array.from({ length: 25 }, (_, j) => DB.prepare(
      'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)',
    ).bind(uid(i + j), 'Benchmark member', uid(i + j) + '@example.test')))
  }
  for (const action of ['question', 'answer']) {
    for (let i = 0; i < concurrent; i += 25) {
      await DB.batch(Array.from({ length: 25 }, (_, j) => DB.prepare(rateLimit).bind(uid(i + j), action, 1, 60)))
    }
  }
  const now = Date.now()
  async function load(label, capture) {
    const measured = await Promise.allSettled(Array.from({ length: concurrent }, async (_, i) => {
      const started = performance.now()
      const no = i % 12 + 1
      const results = await DB.batch([
        DB.prepare(rateLimit).bind(uid(i), 'question', 1, 60),
        DB.prepare(rateLimit).bind(uid(i), 'answer', 1, 60),
        capture ? captureStudyAttempt(DB, uid(i), 1, no, 1, event(i, label), 'O', now, 1200)
          : DB.prepare(original).bind(uid(i), event(i, label), 'O', 'O', now, now, no, 1, 1),
      ])
      return { ms: performance.now() - started, reads: addMetric(results, 'rows_read'), writes: addMetric(results, 'rows_written') }
    }))
    const values = measured.filter(({ status }) => status === 'fulfilled').map(({ value }) => value)
    const latencies = values.map(({ ms }) => ms).sort((a, b) => a - b)
    const result = { label, concurrent, errors: concurrent - values.length, meanMs: Math.round(average(latencies)),
      p95Ms: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1]),
      readsPerAnswer: average(values.map(({ reads }) => reads)), writesPerAnswer: average(values.map(({ writes }) => writes)) }
    console.log(JSON.stringify(result))
    assert.equal(result.errors, 0, measured.find(({ status }) => status === 'rejected')?.reason?.message)
    return result
  }
  const originalCost = await load('original-sql', false)
  const captureCost = await load('analytics-capture-sql', true)
  assert.equal(captureCost.writesPerAnswer, originalCost.writesPerAnswer)
  const trigger = { cron: '*/5 * * * *', scheduledTime: new Date(now) }
  assert.equal((await worker.scheduled(trigger)).outcome, 'ok')
  assert.equal((await worker.scheduled(trigger)).outcome, 'ok')
  const sum = 'SELECT SUM(first_correct + first_wrong) AS samples FROM study_statistics'
  assert.equal(await DB.prepare(sum).first('samples'), concurrent)
  const lookup = 'SELECT first_correct, first_wrong FROM study_statistics WHERE no = 1 AND statistics_version = 1'
  const native = await DB.prepare(lookup).all()
  const db = drizzle(DB)
  const ormQuery = db.get(sql`SELECT first_correct, first_wrong FROM study_statistics WHERE no = ${1} AND statistics_version = ${1}`)
  assert.deepEqual(await ormQuery, native.results[0])
  const state = await DB.prepare('SELECT reads, writes, cursor FROM study_statistics_job WHERE id = 1').first()
  console.log(JSON.stringify({ label: 'rollup-and-drizzle-equivalence', state, localDbBytes: native.meta.size_after }))
  const volumes = [10_000, 30_000, 90_000, 150_000, 300_000]
  console.table(volumes.map((answers) => ({
    dailyAnswers: answers, minimumHttpRequests: answers * 2,
    projectedD1ReadsForMeasuredQueries: Math.round(answers * captureCost.readsPerAnswer),
    projectedD1Writes: Math.round(answers * captureCost.writesPerAnswer),
    includingStatisticsWriteBudget: Math.round(answers * captureCost.writesPerAnswer + 10_000),
  })))
} finally {
  await harness.close()
}
