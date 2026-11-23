import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CloudUpload, FolderOpen, HardDrive, RotateCcw } from 'lucide-react'
import { ErrorNotice } from '../ui/Controls'
import { backupFileName } from './autoBackup'
import { readBackup, type Backup } from './backup'
import { chooseBackupFolder, supportsBackupFolder } from './backupFolder'
import { db, type BackupTarget } from './db'
import { createRecordId } from './recordId'

export function AutoBackupSettings({ onRestore }: { onRestore: (backup: Backup) => void }) {
  const target = useLiveQuery(() => db.backupTargets.get('primary'))
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('at').reverse().primaryKeys(), [], [])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const folderAvailable = supportsBackupFolder()

  async function select(destination: BackupTarget['destination'] | 'off') {
    if (destination === 'device' && target?.destination === 'device') return
    setError('')
    setPending(true)
    try {
      if (destination === 'off') {
        await db.backupTargets.delete('primary')
      } else {
        const folder = destination === 'folder' ? await chooseBackupFolder() : undefined
        if (destination === 'folder' && !folder) return
        await db.backupTargets.put({ key: 'primary', id: createRecordId(), destination, folder })
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('자동 백업 위치를 설정하지 못했습니다.')
    } finally { setPending(false) }
  }

  async function openSnapshot(at: number) {
    setError('')
    try {
      const snapshot = await db.snapshots.get(at)
      if (!snapshot) throw new Error('Snapshot not found')
      onRestore(readBackup(JSON.parse(snapshot.json)))
    } catch { setError('이 자동 백업 기록을 열지 못했습니다.') }
  }

  return <section className="surface settings-card">
    <h2><CloudUpload size={21} /> 자동 백업</h2>
    <p className="settings-help">앱을 사용하는 동안 학습 기록이 바뀌면 선택한 위치에 자동으로 저장해요.</p>
    <div className="button-row destination-picker" aria-label="자동 백업 위치" role="group">
      <button className="button secondary" type="button" aria-pressed={!target} disabled={pending}
        onClick={() => void select('off')}>꺼짐</button>
      <button className="button secondary" type="button" aria-pressed={target?.destination === 'device'} disabled={pending}
        onClick={() => void select('device')}><HardDrive size={17} /> 이 기기 보관함</button>
      {folderAvailable && <button className="button secondary" type="button" aria-pressed={target?.destination === 'folder'} disabled={pending}
        onClick={() => void select('folder')}><FolderOpen size={17} /> 폴더 선택</button>}
    </div>
    {target && <div className="backup-location" aria-live="polite">
      <strong>{target.destination === 'device' ? '이 기기 보관함' : target.folder?.name}</strong>
      {target.destination === 'folder' && <small>{backupFileName(target)}</small>}
      {target.problem === 'permission'
        ? <p>폴더 쓰기 권한이 필요해요. 폴더를 다시 선택해 주세요.</p>
        : target.problem === 'write'
          ? <p>저장하지 못했어요. 저장 공간이나 연결 상태를 확인해 주세요.</p>
          : <p>{target.lastSavedAt ? '최근 저장 ' + new Date(target.lastSavedAt).toLocaleString('ko-KR') : '첫 백업 대기 중'}</p>}
    </div>}
    <p className="settings-help">기기 보관함은 최근 3개 기록을 저장해요. 브라우저의 사이트 데이터를 지우면 함께 삭제돼요.</p>
    {!folderAvailable && <p className="settings-help">이 브라우저는 폴더 자동 저장을 지원하지 않아요. 외부에 보관하려면 백업 파일을 다운로드해 주세요.</p>}
    {snapshots.length > 0 && <ul className="snapshot-list" aria-label="기기에 저장된 자동 백업">
      {snapshots.map((at) => <li key={at}>
        <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleString('ko-KR')}</time>
        <button className="button secondary" type="button" onClick={() => void openSnapshot(at)}><RotateCcw size={15} /> 복원</button>
      </li>)}
    </ul>}
    {error && <ErrorNotice message={error} />}
  </section>
}
