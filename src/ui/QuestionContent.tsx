import type { Question } from '../book/types'

export function QuestionSource({ question }: { question: Question }) {
  return <div className="source-line"><span>기출 출처</span><span className="original">{question.source}</span></div>
}

export function Explanation({ question }: { question: Question }) {
  return <section className="explanation" aria-label="정답 및 해설">
    <div className="explanation-heading">
      <span>정답 및 해설</span>
      <strong className={question.answer === 'O' ? 'marker true' : 'marker false'}>{question.marker}</strong>
    </div>
    {question.explanation.map((block, index) => block.kind === 'text'
      ? <p className="original" key={index}>{block.text}</p>
      : <div className="table-scroll" key={index}><table><tbody>{block.rows.map((row, rowIndex) =>
        <tr key={rowIndex}>{row.map((cell, cellIndex) =>
          <td className="original" key={cellIndex} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>{cell.text}</td>,
        )}</tr>,
      )}</tbody></table></div>)}
  </section>
}
