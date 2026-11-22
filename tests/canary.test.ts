import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { groupReviews, reviewChapters } from '../src/review/reviewOrder'
import { saveAutomaticBackup } from '../src/storage/autoBackup'
import { readBackup } from '../src/storage/backup'
import { db, type ReviewItem } from '../src/storage/db'
import { book, questions } from './fixtures'

afterEach(async () => {
  vi.useRealTimers()
  for (const table of db.tables) await table.clear()
})

function missed(no: number, at: number): ReviewItem {
  const question = questions[no - 1]
  return { id: question.id, type: 'ox', no, stage: question.stage, chapterKey: question.chapterKey, at, resolved: false }
}

test('review uses levels and chapter order, then original problem number within a chapter', () => {
  const groups = groupReviews([missed(1860, 9), missed(22, 7), missed(2, 5), missed(1, 3), missed(505, 1)], reviewChapters(book))
  expect(groups.map((group) => [group.stage, group.label])).toEqual([
    [1, '제1장 헌법의 개념과 헌법학'],
    [1, '제2장 대한민국헌법 총설'],
    [2, '제1장 헌법의 개념과 헌법학'],
    [3, '제1장 헌법의 개념과 헌법학'],
  ])
  expect(groups.map((group) => group.items.map(({ no }) => no))).toEqual([[1, 2], [22], [505], [1860]])
})

test('device auto-backup keeps three distinct snapshots and excludes device-only settings', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await db.backupTargets.add({ key: 'primary', id: crypto.randomUUID(), destination: 'device' })
  for (let index = 1; index <= 4; index++) {
    vi.setSystemTime(index * 1000)
    await db.settings.put({ key: 'feedback', value: String(index) })
    await saveAutomaticBackup()
  }
  vi.setSystemTime(5000)
  await saveAutomaticBackup()
  const snapshots = await db.snapshots.toArray()
  expect(snapshots.map((snapshot) => snapshot.at)).toEqual([2000, 3000, 4000])
  const parsed = JSON.parse(snapshots[2].json)
  expect(readBackup(parsed).settings).toEqual([{ key: 'feedback', value: '4' }])
  expect(parsed).not.toHaveProperty('backupTargets')
  expect(parsed).not.toHaveProperty('snapshots')
})
