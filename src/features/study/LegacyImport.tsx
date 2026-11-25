import { useState } from 'react'
import { FolderOpen, Import } from 'lucide-react'
import { legacyBatchSize, legacyEventId, type LegacyAttempt, type StudyCatalog } from '../../../shared/study'
import { studyError, studyRequest } from './api'

function projectAttempts(rows: unknown[]): LegacyAttempt[] {
  const selected: LegacyAttempt[] = []
  const ids = new Set<string>()
  const now = Date.now()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const { id, no, answer, at } = row as Record<string, unknown>
    if (typeof id !== 'string' || !legacyEventId.test(id) || ids.has(id) || typeof no !== 'number'
      || !Number.isSafeInteger(no) || no < 1 || (answer !== 'O' && answer !== 'X') || typeof at !== 'number'
      || !Number.isSafeInteger(at) || at <= 0 || at > now) continue
    ids.add(id)
    selected.push({ eventId: id, no, choice: answer, at })
  }
  return selected
}

export function LegacyImport({ account }: { account: { id: string; email: string } }) {
  const [candidate, setCandidate] = useState<LegacyAttempt[] | null>(null)
  const [allowed, setAllowed] = useState<ReadonlySet<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function preview(file?: File) {
    setCandidate(null)
    setNote('')
    setBusy(true)
    try {
      const { questions } = await studyRequest<StudyCatalog>('/study/catalog')
      setAllowed(new Set(questions.map(({ no }) => no)))
      if (file) {
        if (file.size > 40 * 1024 * 1024) throw new Error('백업 파일은 40MB까지 열 수 있습니다.')
        const value = JSON.parse(await file.text())
        if (value?.format !== 'police-constitution-ox' || value.schemaVersion !== 1 || !Array.isArray(value.attempts)) {
          throw new Error('온스의 기존 백업 파일을 선택해 주세요.')
        }
        setCandidate(projectAttempts(value.attempts))
      } else {
        const { db } = await import('../../storage/db')
        setCandidate(projectAttempts(await db.attempts.toArray()))
      }
    } catch (error) {
      setNote(error instanceof SyntaxError ? '백업 파일을 읽을 수 없습니다.'
        : error instanceof Error && error.message.includes('백업') ? error.message : studyError(error))
    } finally { setBusy(false) }
  }

  const eligible = candidate?.filter(({ no }) => allowed.has(no)) ?? []

  async function transfer() {
    if (!eligible.length || busy) return
    setBusy(true)
    let imported = 0
    let skipped = 0
    try {
      for (let index = 0; index < eligible.length; index += legacyBatchSize) {
        setNote(`${eligible.length.toLocaleString('ko-KR')}개 중 ${index.toLocaleString('ko-KR')}개를 확인했습니다.`)
        const batch = await studyRequest<{ imported: number; skipped: number }>('/study/import', {
          body: { accountId: account.id, attempts: eligible.slice(index, index + legacyBatchSize) },
        })
        imported += batch.imported
        skipped += batch.skipped
      }
      setCandidate(null)
      setNote(`기존 OX 기록 ${imported}개를 가져왔습니다.${skipped ? ` 이미 등록되었거나 현재 이용할 수 있는 범위를 벗어난 기록 ${skipped}개를 건너뛰었습니다.` : ''}`)
    } catch (error) {
      setNote(`${imported ? `${imported}개를 저장했습니다. ` : ''}${studyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return <details className="ons-legacy-import">
    <summary><Import size={20} aria-hidden="true" />기존 OX 진도 가져오기</summary>
    <p>이 주소의 브라우저 기록이나 이전 사이트에서 내려받은 온스 백업을 선택하세요. 이관하는 항목은 문제 번호, 내 답, 풀이 시각입니다.</p>
    <div className="ons-legacy-actions">
      <button type="button" className="ons-legacy-action" disabled={busy} onClick={() => void preview()}>이 브라우저에서 찾기</button>
      <label className="ons-legacy-action ons-legacy-file"><FolderOpen size={17} aria-hidden="true" /> 온스 백업 JSON 선택<input type="file" accept=".json,application/json" disabled={busy}
        onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void preview(file); event.currentTarget.value = '' }} /></label>
    </div>
    {candidate && <div className="ons-legacy-confirm">
      <p>{candidate.length ? <>유효한 기록 {candidate.length}개 중 {eligible.length}개를 <strong>{account.email}</strong>에 가져올 수 있습니다.</>
        : '가져올 OX 기록이 없습니다.'}</p>
      <button type="button" className="ons-button" disabled={busy || !eligible.length} onClick={() => void transfer()}>이 계정으로 가져오기</button>
    </div>}
    <p role="status">{note}</p>
  </details>
}
