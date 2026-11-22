import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getChapter } from '../book/catalog'
import type { BookIndex, Ox, Question } from '../book/types'
import { ExamReview, examPrompt, optionLabels } from '../exam/ExamReview'
import { correctOption, type ExamQuestion } from '../exam/generate'
import { playReward } from '../feedback/audio'
import { useFeedbackPreferences } from '../feedback/preferences'
import { db, type ReviewItem } from '../storage/db'
import { ErrorNotice, Loading } from '../ui/Controls'
import { OxButtons } from '../ui/OxButtons'
import { Explanation, QuestionSource } from '../ui/QuestionContent'

function ExamRetry({ examQuestion }: { examQuestion: ExamQuestion }) {
  const [selected, setSelected] = useState<number>()
  const { fun, reward } = useFeedbackPreferences()
  return selected === undefined ? <>
    <h3>{examPrompt(examQuestion)}</h3>
    <div className="exam-options" role="group" aria-label="다시 풀기 보기">
      {examQuestion.options.map((option, index) => <button className="exam-option" type="button"
        key={option.id} onClick={() => {
          setSelected(index)
          if (fun && correctOption(examQuestion) === index) playReward(reward)
        }}>
        <strong>{optionLabels[index]}</strong><span className="original">{option.prompt}</span>
      </button>)}
    </div>
  </> : <ExamReview question={examQuestion} selected={selected} />
}

function ExamDetail({ item }: { item: ReviewItem }) {
  const exam = useLiveQuery(() => db.exams.get(item.examId!), [item.examId], null)
  if (exam === null) return <Loading />
  const question = exam?.questions[item.examPosition ?? -1]
  return question ? <ExamRetry examQuestion={question} /> : <ErrorNotice message="모의고사 문제를 찾을 수 없습니다." />
}

function OxDetail({ book, item }: { book: BookIndex; item: ReviewItem }) {
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

export function ReviewDetail({ book, item }: { book: BookIndex; item: ReviewItem }) {
  return item.type === 'exam' ? <ExamDetail item={item} /> : <OxDetail book={book} item={item} />
}
