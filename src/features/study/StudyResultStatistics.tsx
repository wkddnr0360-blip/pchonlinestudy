import { ChartNoAxesColumnIncreasing } from 'lucide-react'
import type { StudyStatistics } from '../../../shared/study-statistics'

const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function StudyResultStatistics({ statistics }: { statistics: StudyStatistics }) {
  const { sample, firstAccuracy, wrongRate, difficulty, mine, delayed, calculatedAt } = statistics
  return <section className="study-result-statistics" aria-label="기본 OX 풀이 통계">
    <h2><ChartNoAxesColumnIncreasing size={18} aria-hidden="true" /> 풀이 통계</h2>
    {statistics.paused ? <p role="status">통계 반영이 지연되고 있습니다.</p> : sample === null && <p role="status">통계 수집 중</p>}
    {!statistics.paused && <dl>
      {sample !== null && <>
        <div><dt>최초 정답률</dt><dd>{firstAccuracy}%</dd></div>
        <div><dt>전체 오답률</dt><dd>{wrongRate}%</dd></div>
        <div><dt>최초 풀이 인원</dt><dd>{sample}명</dd></div>
        {difficulty && <div><dt>난이도</dt><dd>{difficulty}</dd></div>}
      </>}
      <div><dt>내 정답률</dt><dd>{mine.accuracy === null ? '집계 대기' : `${mine.accuracy}%`}</dd></div>
      <div><dt>내 오답</dt><dd>{mine.wrong}회</dd></div>
    </dl>}
    {(calculatedAt || delayed) && <p>{calculatedAt ? time.format(calculatedAt) + ' 집계' : '첫 집계 대기'}{delayed && calculatedAt && !statistics.paused ? ' · 새 풀이 반영 중' : ''}</p>}
  </section>
}
