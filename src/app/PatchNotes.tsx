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
      <h3>HTTPS 접속 지원</h3>
      <ul>
        <li>HTTP 주소로 접속해도 HTTPS로 자동 전환돼요.</li>
        <li>이전 배포 페이지가 남아 있을 때 앱을 다시 열 수 있게 고쳤어요.</li>
      </ul>
    </article>
  </Modal>
}
