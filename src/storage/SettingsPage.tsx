import { useState, type ChangeEvent } from 'react'
import { Download, Smartphone, Upload } from 'lucide-react'
import { FeedbackSettings } from '../feedback/FeedbackSettings'
import { ErrorNotice, Modal, ParagraphHeading } from '../ui/Controls'
import { AutoBackupSettings } from './AutoBackupSettings'
import { exportBackup, readBackup, restoreBackup, type Backup } from './backup'

export default function SettingsPage() {
  const [backup, setBackup] = useState<Backup>()
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function download() {
    setError('')
    try {
      const data = await exportBackup()
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      const element = document.createElement('a')
      element.href = url
      element.download = '박철한-온스-학습기록-' + new Date().toISOString().slice(0, 10) + '.json'
      document.body.append(element)
      element.click()
      element.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError('백업을 만들지 못했습니다.') }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setStatus('')
    setError('')
    try { setBackup(readBackup(JSON.parse(await file.text()))) }
    catch (err) { setError(err instanceof SyntaxError ? '올바른 JSON 백업 파일을 선택해 주세요.' : (err as Error).message) }
  }

  async function restore() {
    if (!backup) return
    setBusy(true)
    try {
      await restoreBackup(backup)
      setBackup(undefined)
      setStatus('학습 기록을 복원했습니다.')
    } catch {
      setBackup(undefined)
      setError('백업을 복원하지 못했습니다. 현재 기록을 유지했습니다.')
    } finally { setBusy(false) }
  }

  return <div className="narrow-page">
    <ParagraphHeading title="학습 기록 설정" description="학습 기록은 이 브라우저에 저장돼요." />
    <FeedbackSettings />
    <AutoBackupSettings onRestore={(data) => { setError(""); setStatus(""); setBackup(data) }} />
    <section className="surface settings-card">
      <h2>학습 기록 백업</h2>
      <div className="button-row">
        <button className="button secondary" onClick={() => void download()}><Download size={18} /> 백업 다운로드</button>
        <label className="button secondary file-control">
          <Upload size={18} /> 백업 파일 열기
          <input aria-label="백업 파일 열기" type="file" accept=".json,application/json" onChange={(event) => void upload(event)} />
        </label>
      </div>
      {status && <p role="status">{status}</p>}
      {error && <ErrorNotice message={error} />}
    </section>
    <section className="surface settings-card">
      <h2><Smartphone size={21} /> 아이폰 홈 화면에 추가</h2>
      <p>Safari에서 공유 버튼을 누르고 ‘홈 화면에 추가’를 선택하세요.</p>
    </section>
    {backup && <Modal title="이 백업으로 복원할까요?" close={() => { if (!busy) setBackup(undefined) }}>
      <p className="dialog-description">현재 기기의 기록을 백업 파일의 기록으로 바꿉니다.</p>
      <p className="dialog-description">OX 답안 {backup.attempts.length.toLocaleString('ko-KR')}개 · 시험 {backup.exams.length.toLocaleString('ko-KR')}회</p>
      <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={() => setBackup(undefined)}>취소</button>
        <button className="button primary" disabled={busy} onClick={() => void restore()}>복원하기</button>
      </div>
    </Modal>}
  </div>
}
