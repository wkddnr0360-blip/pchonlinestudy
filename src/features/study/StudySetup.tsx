import * as Dialog from '@radix-ui/react-dialog'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { ArrowLeft, ArrowRight, Hash, ListOrdered, Play, RotateCcw, Shuffle, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import type { StudyCatalog } from '../../../shared/study'
import { stagePresentation } from '../../app/stages'
import type { Stage } from '../../book/types'
import { selectNumberRange, shuffle } from '../../study/selection'
import { StageArtwork } from './StageArtwork'
import { inOutline, StudyOutline, type OutlineScope } from './StudyOutline'

const methods = [
  { value: 'order', label: '순서대로', icon: ListOrdered },
  { value: 'random', label: '랜덤', icon: Shuffle },
  { value: 'range', label: '번호 지정', icon: Hash },
] as const
type Mode = typeof methods[number]['value']

export function StudySetup({ stage, catalog, busy, error, resumeNo, onResume, onOpen, recommendations, onRecommend, onPractice }: {
  stage: Stage; catalog: StudyCatalog; busy: boolean; error: string; resumeNo?: number;
  onResume: () => void; onOpen: (numbers: number[]) => void; recommendations?: number[];
  onRecommend: (mode: 'personal' | 'common') => void; onPractice: (numbers: number[]) => void
}) {
  const [scope, setScope] = useState<OutlineScope | null>(null)
  const [scopeLabel, setScopeLabel] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<Mode>('order')
  const [size, setSize] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [allOrdered, setAllOrdered] = useState(false)
  const [rangeError, setRangeError] = useState('')
  const { name } = stagePresentation(stage)
  const entries = catalog.questions.filter((item) => item.stage === stage)
  const numbers = entries.filter((item) => inOutline(item, scope)).map(({ no }) => no)
  const low = numbers[0]
  const high = numbers.at(-1)
  const defaultCount = Math.min(10, numbers.length)
  const orderedCount = allOrdered ? numbers.length : defaultCount
  const firstNumber = Number(first || low)
  const lastNumber = Number(last || numbers[defaultCount - 1])

  function selection(next: OutlineScope | null, label: string, trigger: HTMLButtonElement) {
    setScopeLabel(label)
    opener.current = trigger
    setScope(next)
    setFirst('')
    setLast('')
    setSize('')
    setAllOrdered(false)
    setRangeError('')
    setMode('order')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!numbers.length || busy) return
    setRangeError('')
    try {
      const selected = mode === 'range' ? selectNumberRange(numbers, firstNumber, lastNumber)
        : mode === 'random' ? shuffle(numbers).slice(0, Number(size || defaultCount)) : numbers.slice(0, orderedCount)
      onOpen(selected)
    } catch { setRangeError('선택한 목차 안에서 시작 번호와 끝 번호를 확인해 주세요.') }
  }

  return <main className="study-page ons-container" data-stage={stage}>
    <a className="study-back" href="/#levels"><ArrowLeft size={20} aria-hidden="true" /> 단계별 학습</a>
    <header className="study-level">
      <div><span className="ons-stage-no">{stage}단계</span><h1>{name}</h1><p>{entries.length.toLocaleString('ko-KR')}문항</p>
        {!!entries.length && <button type="button" className="ons-button" aria-haspopup="dialog"
          onClick={(event) => selection(null, `${stage}단계 전체`, event.currentTarget)}><Play size={17} aria-hidden="true" /> 전체 풀기</button>}
      </div>
      <StageArtwork stage={stage} className="study-level-art" />
    </header>
    {resumeNo !== undefined && <button className="study-resume" type="button" onClick={onResume}>
      <RotateCcw size={19} aria-hidden="true" /> {resumeNo}번 이어 풀기 <ArrowRight size={18} aria-hidden="true" />
    </button>}
    {error && !scopeLabel && <p className="study-error" role="alert">{error}</p>}
    {catalog.recommendationsAvailable && <section className="study-panel study-recommendation" aria-label="맞춤 복습">
      <div><h2>맞춤 복습</h2><p>내 오답이나 기본 OX에서 오답이 많은 문항을 복습합니다.</p></div>
      <div className="study-quick">
        <button type="button" className="study-secondary" disabled={busy} onClick={() => onRecommend('personal')}>내 오답</button>
        <button type="button" className="study-secondary" disabled={busy} onClick={() => onRecommend('common')}>오답 빈출</button>
        {recommendations && (recommendations.length > 0
          ? <button type="button" className="study-secondary" disabled={busy} onClick={() => onPractice(recommendations)}>
          <RotateCcw size={17} aria-hidden="true" />{recommendations.length}문제 다시 풀기</button>
          : <p role="status">지금 복습할 문항이 없습니다.</p>)}
      </div>
    </section>}
    <StudyOutline stage={stage} catalog={catalog} onSelect={selection} />
    <Dialog.Root open={scopeLabel !== null} onOpenChange={(open) => { if (!open && !busy) setScopeLabel(null) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ons-stage-overlay" />
        <Dialog.Content className="ons-stage-dialog study-picker" data-stage={stage} onCloseAutoFocus={(event) => {
          if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus() }
        }}>
          <Dialog.Close asChild><button type="button" className="ons-icon-button ons-stage-dialog-close" aria-label="학습 방식 닫기" disabled={busy}><X size={21} aria-hidden="true" /></button></Dialog.Close>
          <Dialog.Title>학습 방식</Dialog.Title>
          <Dialog.Description>{scopeLabel} · {numbers.length.toLocaleString('ko-KR')}문항</Dialog.Description>
        <form onSubmit={submit}>
          <RadioGroup.Root className="study-mode" aria-label="학습 방식" value={mode} disabled={busy || !numbers.length}
            onValueChange={(value) => { setMode(value as Mode); setRangeError('') }}>
            {methods.map(({ value, label, icon: Icon }) => <RadioGroup.Item key={value} value={value}>
              <Icon size={19} aria-hidden="true" />{label}
            </RadioGroup.Item>)}
          </RadioGroup.Root>
          {mode === 'random' && !!numbers.length && <label className="study-field">문제 수
            <input type="number" inputMode="numeric" min={1} max={numbers.length} value={size} placeholder={String(defaultCount)}
              onChange={(event) => setSize(event.currentTarget.value)} disabled={busy} />
          </label>}
          {mode === 'range' && !!numbers.length && <>
            <div className="study-fields">
              <label className="study-field">시작 번호<input type="number" inputMode="numeric" min={low} max={high} value={first} placeholder={String(low)} onChange={(event) => setFirst(event.currentTarget.value)} disabled={busy} /></label>
              <label className="study-field">끝 번호<input type="number" inputMode="numeric" min={low} max={high} value={last} placeholder={String(numbers[defaultCount - 1])} onChange={(event) => setLast(event.currentTarget.value)} disabled={busy} /></label>
            </div>
            <div className="study-quick" role="group" aria-label="시작 번호부터 빠른 범위 지정">
              {[1, 10, 20, 30, 50].map((count) => <button type="button" className="study-secondary" disabled={busy} key={count} onClick={() => {
                const available = numbers.filter((no) => no >= firstNumber)
                if (available.length) setLast(String(available[Math.min(count, available.length) - 1]))
              }}>{count}문제</button>)}
            </div>
          </>}
          {numbers.length ? <><div className="study-picker-summary">
            <p className="study-muted" aria-live="polite">선택 범위 {numbers.length.toLocaleString('ko-KR')}문항{mode === 'order' && ` · ${orderedCount}문제 출제`}</p>
            {mode === 'order' && numbers.length > defaultCount &&
              <button type="button" className="study-secondary" aria-pressed={allOrdered} onClick={() => setAllOrdered(!allOrdered)}>전체 출제</button>}
          </div>
            <button className="ons-button" disabled={busy}><Play size={18} aria-hidden="true" />문제 풀기</button></>
            : <p className="study-muted">이 단계의 학습 자료를 준비하고 있습니다.</p>}
          {(rangeError || error) && <p className="study-error" role="alert">{rangeError || error}</p>}
        </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </main>
}
