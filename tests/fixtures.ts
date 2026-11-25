import { readFileSync, readdirSync } from 'node:fs'
import type { BookIndex, Question } from '../src/book/types'
import { createSyntheticBook } from './synthetic-book'

function readAuthorizedLegacyBook() {
  const base = new URL('../public/book/', import.meta.url)
  const book = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8')) as BookIndex
  const folder = new URL(book.version + '/', base)
  const questions = readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(readFileSync(new URL(name, folder), 'utf8')) as Question[])
    .sort((a, b) => a.no - b.no)
  return { book, questions }
}

export const { book, questions } = process.env.ONS_LEGACY_BOOK === '1'
  ? readAuthorizedLegacyBook()
  : createSyntheticBook()

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
