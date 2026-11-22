import { readFileSync, readdirSync } from 'node:fs'
import type { BookIndex, Question } from '../src/book/types'

const base = new URL('../public/book/', import.meta.url)
export const book = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8')) as BookIndex
const folder = new URL(book.version + '/', base)

export const questions: Question[] = readdirSync(folder)
  .flatMap((name) => JSON.parse(readFileSync(new URL(name, folder), 'utf8')) as Question[])
  .sort((a, b) => a.no - b.no)

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
