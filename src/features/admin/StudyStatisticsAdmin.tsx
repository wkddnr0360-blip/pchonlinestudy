import { ChevronLeft, ChevronRight, Filter, Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { accuracy, difficultyLabels, type StatisticsAdminPage } from '../../../shared/study-statistics'

const path = '/api/v1/admin/study-statistics'
const filterNames = [['stage', '단계'], ['part', '편'], ['chapter', '장'], ['section', '절'], ['version', '통계 버전']] as const
const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const percent = (value: number | null) => value === null ? '—' : `${value}%`

export function StudyStatisticsAdmin() {
  const [data, setData] = useState<StatisticsAdminPage>()
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams(query)
    params.set('page', String(page))
    setLoading(true)
    setError('')
    fetch(`${path}?${params}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (response.status === 404) throw new Error('이 환경의 문항 분석은 준비 중입니다.')
      if (response.status === 403) throw new Error('관리자 인증을 다시 진행해 주세요.')
      if (!response.ok) throw new Error('문항 분석을 불러오지 못했습니다.')
      setData(await response.json())
    }).catch((failure: Error) => {
      if (!controller.signal.aborted) setError(failure.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, query, refresh])

  async function saveDifficulty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget).getAll('boundary').map(Number)
    setError('')
    setSaved(false)
    setLoading(true)
    try {
      const response = await fetch(path + '/difficulty', {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundaries: values }),
      })
      if (!response.ok) throw new Error(response.status === 400 ? '난이도 기준은 100 이하에서 높은 순으로 입력해 주세요.' : '설정을 저장하지 못했습니다.')
      setSaved(true)
      setRefresh((value) => value + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '설정을 저장하지 못했습니다.')
    } finally { setLoading(false) }
  }

  const budget = data?.budget
  const account = budget?.accountWrites == null ? null : Math.max((budget.accountReads ?? 0) / 5_000_000, budget.accountWrites / 100_000, (budget.accountRequests ?? 0) / 100_000)
  return <div className="ons-statistics-admin">
    {error && <p className="ons-error" role="alert">{error}</p>}
    {loading && !data && <p role="status">문항 분석을 불러오는 중입니다.</p>}
    {budget && data && <>
      <section className="ons-statistics-summary" aria-label="집계 현황">
        <div><strong>{data.totals.attempts.toLocaleString('ko-KR')}</strong><span>선택 범위 누적 풀이</span></div>
        <div><strong>{percent(accuracy(data.totals.firstCorrect, data.totals.firstCorrect + data.totals.firstWrong))}</strong><span>최초 정답률</span></div>
        <div><strong>{percent(accuracy(data.totals.repeatCorrect, data.totals.repeatCorrect + data.totals.repeatWrong))}</strong><span>반복 정답률</span></div>
      </section>
      <section className="ons-statistics-budget" aria-label="통계 작업 예산">
        <p>{budget.status === 'metrics_unavailable' ? '계정 사용량을 확인할 수 없어 집계 대기 중입니다.'
          : budget.status === 'paused' ? '일일 예산에 도달해 집계를 일시 중지했습니다.'
          : budget.status === 'delayed' ? '대기 중인 풀이를 순차 반영하고 있습니다.'
          : budget.calculatedAt ? `최근 집계 ${time.format(budget.calculatedAt)}` : '첫 집계를 기다리고 있습니다.'}</p>
        <p>통계 예약 읽기 {budget.reads.toLocaleString('ko-KR')} / 250,000행 · 쓰기 {budget.writes.toLocaleString('ko-KR')} / 10,000행</p>
        {account !== null && <p>{account >= 0.7 ? '사용량 주의 · ' : ''}계정 최대 한도 비율 {(account * 100).toFixed(1)}%{budget.observedAt ? ` · ${time.format(budget.observedAt)} 확인` : ''}</p>}
        {data.qualityPaused && <p>문항 품질 진단은 사용량을 확인한 뒤 반영합니다.</p>}
      </section>
    </>}
    <form className="ons-admin-form ons-statistics-fields" aria-label="문항 분석 필터" onSubmit={(event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const params = new URLSearchParams()
      for (const [key, value] of fields) if (value) params.set(key, String(value))
      setPage(1)
      setQuery(params.toString())
    }}>
      {filterNames.map(([name, label]) => <label key={name}>{label}<input name={name} type="number" min={1} max={name === 'stage' ? 3 : 9999} /></label>)}
      <label className="ons-statistics-flag"><input name="flagged" type="checkbox" value="1" />검토 대상</label>
      <button type="submit" className="ons-button" disabled={loading}><Filter size={17} aria-hidden="true" />적용</button>
    </form>
    {data && (
      data.items.length ? <div className="ons-statistics-table" tabIndex={0} role="region" aria-label="문항 분석 결과">
        <table className="ons-admin-table">
          <thead><tr>{['문항', '통계 버전', '최초 응시', '최초', '반복', 'O / X', '평균 시간', '난이도', '검토 사유'].map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{data.items.map((item) => <tr key={`${item.no}:${item.version}`}>
            <th scope="row">{item.no}번 <small>{item.stage}단계 {item.part}편 {item.chapter}장{item.section ? ` ${item.section}절` : ''}</small></th>
            <td>{item.version}</td><td>{item.sample}명<small>전체 {item.total}회</small></td>
            <td>{percent(item.firstAccuracy)}</td><td>{percent(item.repeatAccuracy)}</td>
            <td>{item.selectedO === null ? '—' : `${item.selectedO}% / ${Number((100 - item.selectedO).toFixed(1))}%`}</td>
            <td>{item.meanSeconds === null ? '—' : `${item.meanSeconds}초`}</td>
            <td>{item.difficulty ?? '표본 수집 중'}</td><td>{item.flags.join(', ') || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p role="status">선택한 범위에 집계된 문항이 없습니다.</p>
    )}
    {data && (page > 1 || data.next) && <nav className="ons-admin-pagination" aria-label="문항 분석 페이지">
      <button type="button" className="ons-icon-button" disabled={page === 1 || loading} onClick={() => setPage(page - 1)} aria-label="이전 페이지"><ChevronLeft aria-hidden="true" /></button>
      <span>{page}페이지</span>
      <button type="button" className="ons-icon-button" disabled={!data.next || loading || page >= 200} onClick={() => setPage(page + 1)} aria-label="다음 페이지"><ChevronRight aria-hidden="true" /></button>
    </nav>}
    {data && <details className="ons-statistics-settings">
      <summary>난이도 기준 설정</summary>
      <form className="ons-admin-form ons-statistics-fields" key={data.boundaries.join(',')} onSubmit={saveDifficulty}>
        {data.boundaries.map((value, i) => <label key={difficultyLabels[i]}>{difficultyLabels[i]} 하한(%)
          <input name="boundary" type="number" min={1} max={100} defaultValue={value} required /></label>)}
        <button type="submit" className="ons-button" disabled={loading}><Save size={17} aria-hidden="true" />저장</button>
      </form>
      {saved && <p role="status">난이도 기준을 저장했습니다.</p>}
    </details>}
  </div>
}
