import { Explanation, QuestionSource } from '../ui/QuestionContent'
import { correctOption, type ExamQuestion } from './generate'

export const optionLabels = ['①', '②', '③', '④']

export function examPrompt(question: ExamQuestion) {
  return question.target === 'O' ? '옳은 것을 고르시오.' : '옳지 않은 것을 고르시오.'
}

export function ExamReview({ question, selected }: { question: ExamQuestion; selected: number | null }) {
  const correct = correctOption(question)
  return <div className="exam-review">
    <p className="review-caption">{examPrompt(question)} <strong>내 답 {selected === null ? '미응답' : optionLabels[selected]} · 정답 {optionLabels[correct]}</strong></p>
    {question.options.map((option, index) => <article className="review-option" key={option.id}>
      <div className="review-option-heading"><strong>{optionLabels[index]} 교재 {option.no.toLocaleString('ko-KR')}번</strong>
        {index === correct && <span className="marker true">정답 보기</span>}
      </div>
      <p className="original">{option.prompt}</p>
      <QuestionSource question={option} />
      <Explanation question={option} />
    </article>)}
  </div>
}
