import { db } from '../storage/db'
import { Modal } from '../ui/Controls'

import { APP_VERSION, RELEASE_CHANNEL, RELEASE_NUMBER } from './release'

export function markNotesRead() {
  return db.settings.put({ key: 'patchRead', value: APP_VERSION })
}

export function PatchNotes({ close }: { close: () => void }) {
  return <Modal title="패치노트" close={close}>
    <article className="patch-entry">
      <span className="tag">{RELEASE_CHANNEL} {RELEASE_NUMBER}</span>
      <h3>박철한 온스 테스트 업데이트</h3>
      <ul>
        <li>오답을 교재 목차 순서로 묶었어요.</li>
        <li>철한쌤을 터치하면 단계별 모션이 나와요.</li>
        <li>설정에서 자동 백업 위치와 정답 효과음을 고를 수 있어요.</li>
      </ul>
    </article>
  </Modal>
}
