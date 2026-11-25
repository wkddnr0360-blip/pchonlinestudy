import { ArrowRight, BookOpen, ChevronDown } from 'lucide-react'
import type { Stage } from '../../book/types'
import type { StudyCatalog, StudyIndexEntry } from '../../../shared/study'

export interface OutlineScope { part: number; chapter?: number; section?: number }

export function inOutline(item: StudyIndexEntry, scope: OutlineScope | null) {
  return !scope || (item.part === scope.part
    && (scope.chapter === undefined || item.chapter === scope.chapter)
    && (scope.section === undefined || item.section === scope.section))
}

export function StudyOutline({ stage, catalog, onSelect }: {
  stage: Stage; catalog: StudyCatalog;
  onSelect: (scope: OutlineScope, title: string, opener: HTMLButtonElement) => void
}) {
  const numbers = catalog.questions.filter((item) => item.stage === stage)
  const labels = catalog.outline.filter((item) => item.stage === stage)
  const heading = (part: number, chapter = 0, section = 0) =>
    labels.find((item) => item.part === part && item.chapter === chapter && item.section === section)
  const parts = [...new Set(numbers.map((item) => item.part))].sort((a, b) => a - b)

  function item(scope: OutlineScope, name: string, title: string, count?: number, page?: number | null) {
    return <button type="button" className="study-outline-item" aria-haspopup="dialog" title={page ? `교재 p.${page}` : undefined}
      onClick={(event) => onSelect(scope, title, event.currentTarget)}>
      <span>{name}</span>{count !== undefined && <small>{count.toLocaleString('ko-KR')}문항</small>}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  }

  return <section className="study-outline" aria-labelledby="study-outline-title">
    <h2 id="study-outline-title">교재 목차</h2>
    {!parts.length && <p className="study-muted">이 단계의 목차를 준비하고 있습니다.</p>}
    {parts.map((part) => {
      const partItems = numbers.filter((question) => question.part === part)
      const chapters = [...new Set(partItems.map((question) => question.chapter))].sort((a, b) => a - b)
      const partLabel = heading(part)?.label ?? `제${part}편`
      return <details className="study-outline-part" key={part} open>
        <summary>
          <BookOpen size={23} aria-hidden="true" /><strong>{partLabel}</strong>
          <small>{partItems.length.toLocaleString('ko-KR')}문항</small><ChevronDown size={18} aria-hidden="true" />
        </summary>
        <div className="study-outline-rows">
        {item({ part }, '편 전체 풀기', partLabel)}
        {chapters.map((chapter) => {
          const chapterItems = partItems.filter((question) => question.chapter === chapter)
          const chapterHeading = heading(part, chapter)
          const chapterLabel = chapterHeading?.label ?? `제${chapter}장`
          const sections = [...new Set(chapterItems.flatMap(({ section }) => section === null ? [] : [section]))].sort((a, b) => a - b)
          return <div className="study-outline-chapter" key={chapter}>
            {item({ part, chapter }, chapterLabel, chapterLabel, chapterItems.length, chapterHeading?.printedPage)}
            {!!sections.length && <ul>{sections.map((section) => {
              const sectionHeading = heading(part, chapter, section)
              const sectionLabel = sectionHeading?.label ?? `제${section}절`
              return <li key={section}>{item({ part, chapter, section }, sectionLabel, sectionLabel,
                chapterItems.filter((question) => question.section === section).length, sectionHeading?.printedPage)}</li>
            })}</ul>}
          </div>
        })}
        </div>
      </details>
    })}
  </section>
}
