import { useEffect } from 'react'
import Dexie, { type ObservabilitySet } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

const backupTables = ['studies', 'attempts', 'exams', 'reviews', 'settings', 'challengeScores']
const prefixes = backupTables.map((table) => 'idb://' + db.name + '/' + table + '/')

export function AutoBackupRunner() {
  const selection = useLiveQuery(async () => (await db.backupTargets.get('primary'))?.id)

  useEffect(() => {
    if (!selection) return
    let timer: number | undefined

    function flush() {
      window.clearTimeout(timer)
      timer = undefined
      void import('./autoBackup').then(({ saveAutomaticBackup }) => saveAutomaticBackup()).catch(() => undefined)
    }

    function schedule() {
      timer ??= window.setTimeout(flush, 900)
    }

    function onMutation(parts: ObservabilitySet) {
      if (Object.keys(parts).some((part) => prefixes.some((prefix) => part.startsWith(prefix)))) schedule()
    }

    function onVisibilityChange() {
      if (timer !== undefined || document.visibilityState === 'visible') flush()
    }

    schedule()
    Dexie.on('storagemutated', onMutation)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearTimeout(timer)
      Dexie.on.storagemutated.unsubscribe(onMutation)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [selection])

  return null
}
