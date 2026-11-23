import { publicPreview } from '../book/publicPreview'
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
      <h3>{publicPreview ? "임시 공개판" : "무한회독 챌린지 업데이트"}</h3>
      <ul>
        <li>모의고사 오답을 교재 번호 하나로 모아요.</li>
        <li>{publicPreview ? "1단계 OX와 1단계 지문으로 구성한 실전 모의고사를 열었어요." : "2·3단계 지문으로 도트 서재에서 기록에 도전해요."}</li>
        <li>터치음과 정답음을 새로 만들었어요.</li>
      </ul>
    </article>
  </Modal>
}
