import type { BookIndex } from '../book/types'
import type { ReviewItem } from '../storage/db'

export function reviewChapters(book: BookIndex) {
  return book.stages.flatMap((stage) => stage.parts.flatMap((part) => part.chapters.map((chapter) => ({
    key: chapter.key, stage: stage.stage, part: part.label, label: chapter.label,
  }))))
}

type ReviewChapter = ReturnType<typeof reviewChapters>[number]

export function groupReviews(rows: ReviewItem[], chapters: ReviewChapter[]) {
  const itemsByChapter = new Map<string, ReviewItem[]>()
  const ordered = [...rows].sort((a, b) => a.no - b.no || b.at - a.at)
  for (const item of ordered) {
    const items = itemsByChapter.get(item.chapterKey)
    if (items) items.push(item)
    else itemsByChapter.set(item.chapterKey, [item])
  }
  const groups = chapters.flatMap((chapter) => {
    const items = itemsByChapter.get(chapter.key)
    itemsByChapter.delete(chapter.key)
    return items ? [{ ...chapter, items }] : []
  })
  for (const [key, items] of itemsByChapter) {
    groups.push({ key, stage: items[0].stage, part: '', label: '목차 미확인', items })
  }
  return groups
}
