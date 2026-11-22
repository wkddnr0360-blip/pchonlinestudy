import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Info } from 'lucide-react'
import { db } from '../storage/db'
import { APP_VERSION, RELEASE_CHANNEL, RELEASE_NUMBER } from './release'

export function ReleaseBanner() {
  const seen = useLiveQuery(async () => (await db.settings.get('releaseSeen'))?.value ?? '', [], null)
  const [dismissed, setDismissed] = useState(false)
  if (seen === null || seen === APP_VERSION || dismissed) return null
  return <aside className="release-notice" aria-label="버전 안내">
    <Info size={18} />
    <div><strong>{RELEASE_CHANNEL} {RELEASE_NUMBER}</strong><span>테스트 버전에서 새 기능을 먼저 써보세요.</span></div>
    <button className="button secondary" onClick={() => {
      setDismissed(true)
      void db.settings.put({ key: 'releaseSeen', value: APP_VERSION }).catch(() => undefined)
    }}>확인</button>
  </aside>
}
