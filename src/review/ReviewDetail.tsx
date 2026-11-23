import { useEffect, useState } from 'react'
import { getChapter } from '../book/catalog'
import type { BookIndex, Ox, Question } from '../book/types'
import { playReward } from '../feedback/audio'
import { useFeedbackPreferences } from '../feedback/preferences'
import type { ReviewItem } from '../storage/db'
import { ErrorNotice, Loading } from '../ui/Controls'
import { OxButtons } from '../ui/OxButtons'
import { Explanation, QuestionSource } from '../ui/QuestionContent'

export function ReviewDetail({ book, item }: { book: BookIndex; item: ReviewItem }) {
  const [question, setQuestion] = useState<Question>()
  const [selected, setSelected] = useState<Ox>()
  const { fun, reward } = useFeedbackPreferences()
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    getChapter(book, item.chapterKey).then((rows) => {
      if (!active) return
      const result = rows.find((row) => row.no === item.no)
      if (result) setQuestion(result)
      else setError(true)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [book, item.no, item.chapterKey])
  if (error) return <ErrorNotice message="교재 문제를 불러오지 못했습니다." />
  if (!question) return <Loading />
  return <>
    <h3 className="original review-prompt">{question.prompt}</h3>
    <QuestionSource question={question} />
    <OxButtons selected={selected} onAnswer={(answer) => {
      setSelected(answer)
      if (fun && answer === question.answer) playReward(reward)
    }} />
    {selected && <Explanation question={question} />}
  </>
}
