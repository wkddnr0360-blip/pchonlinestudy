import { useState } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ExamSession } from '../storage/db'
import { Teacher } from '../ui/Teacher'
import { ExamReview } from './ExamReview'
import { correctOption } from './generate'

export function ExamResults({ exam }: { exam: ExamSession }) {
  const [expanded, setExpanded] = useState<number>()
  const score = exam.questions.filter((question, index) => correctOption(question) === exam.responses[index]).length
  const skipped = exam.responses.filter((choice) => choice === null).length
  return <>
    <section className="stage-banner blue result-banner">
      <div><span className="tag">모의고사 결과</span><h1>{score * 5}점</h1>
        <p>정답 {score} · 오답 {exam.questions.length - score - skipped} · 미응답 {skipped}</p>
        <Link className="button primary" to="/review">오답노트 <ArrowRight size={17} /></Link>
      </div>
      <Teacher stage={3} className={'banner-teacher ' + (score >= 15 ? 'win-motion' : 'encourage-motion')} />
    </section>
    <section className="topic-section">
      <div className="section-heading"><h2>문항별 해설</h2></div>
      {exam.questions.map((question, index) => {
        const right = correctOption(question) === exam.responses[index]
        return <article key={index} className="result-entry">
          <button className="topic-row" aria-expanded={expanded === index}
            onClick={() => setExpanded(expanded === index ? undefined : index)}>
            <strong>{index + 1}번</strong>
            <span className={right ? 'marker true' : 'marker false'}>{right ? '정답' : exam.responses[index] === null ? '미응답' : '오답'}</span>
            <ChevronDown size={18} />
          </button>
          {expanded === index && <ExamReview question={question} selected={exam.responses[index]} />}
        </article>
      })}
    </section>
  </>
}
