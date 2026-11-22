import { db } from '../storage/db'
import { Modal } from '../ui/Controls'

export const patchVersion = '1.0.0'

export function markNotesRead() {
  return db.settings.put({ key: 'patchRead', value: patchVersion })
}

export function PatchNotes({ close }: { close: () => void }) {
  return <Modal title="패치노트" close={close}>
    <article className="patch-entry">
      <span className="tag">v{patchVersion}</span>
      <h3>경찰헌법 OX 첫 버전</h3>
      <ul>
        <li>교재 전 3,129문항을 세 단계로 학습할 수 있어요.</li>
        <li>20문항 모의고사에서 시간을 설정하고 실전처럼 풀 수 있어요.</li>
        <li>오답을 다시 풀고 학습 기록을 파일로 백업할 수 있어요.</li>
      </ul>
    </article>
  </Modal>
}
