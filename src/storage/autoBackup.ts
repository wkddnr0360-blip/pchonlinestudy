import { exportBackup, type Backup } from './backup'
import { hasFolderPermission, writeBackupFile } from './backupFolder'
import { db, type BackupTarget } from './db'

const snapshotsToKeep = 3
const lockName = db.name + '-automatic-backup'

export function backupFileName(target: BackupTarget) {
  return '박철한-온스-자동백업-' + target.id.split('-')[0] + '.json'
}

async function updateTarget(target: BackupTarget, changes: Partial<BackupTarget>) {
  return db.transaction('rw', db.backupTargets, async () => {
    if ((await db.backupTargets.get('primary'))?.id === target.id) {
      await db.backupTargets.update('primary', changes)
    }
  })
}

async function hashBackup(backup: Backup) {
  const contents = new TextEncoder().encode(JSON.stringify({ ...backup, exportedAt: 0 }))
  const hash = crypto.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', contents))
    : (await import('@noble/hashes/sha2.js')).sha256(contents)
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function saveToDevice(target: BackupTarget, backup: Backup, digest: string, json: string) {
  return db.transaction('rw', db.backupTargets, db.snapshots, async () => {
    const current = await db.backupTargets.get('primary')
    if (current?.id !== target.id || (current.lastSavedAt ?? -1) >= backup.exportedAt) return
    await db.snapshots.put({ at: backup.exportedAt, json })
    const oldSnapshots = await db.snapshots.orderBy('at').reverse().offset(snapshotsToKeep).primaryKeys()
    await db.snapshots.bulkDelete(oldSnapshots)
    await db.backupTargets.update('primary', { digest, lastSavedAt: backup.exportedAt, problem: undefined })
  })
}

async function save() {
  const target = await db.backupTargets.get('primary')
  if (!target) return
  try {
    if (target.destination === 'folder' && (!target.folder || !await hasFolderPermission(target.folder))) {
      if (target.problem !== 'permission') await updateTarget(target, { problem: 'permission' })
      return
    }
    const backup = await exportBackup()
    const digest = await hashBackup(backup)
    if (digest === target.digest && !target.problem) return
    const json = JSON.stringify(backup)
    if (target.destination === 'device') {
      await saveToDevice(target, backup, digest, json)
    } else if (target.folder && (await db.backupTargets.get('primary'))?.id === target.id) {
      await writeBackupFile(target.folder, backupFileName(target), json)
      await updateTarget(target, { lastSavedAt: backup.exportedAt, digest, problem: undefined })
    }
  } catch (error) {
    const needsPermission = error instanceof DOMException && error.name === 'NotAllowedError'
    const problem = needsPermission ? 'permission' : 'write'
    if (target.problem !== problem) await updateTarget(target, { problem })
  }
}

export async function saveAutomaticBackup() {
  if (navigator.locks) await navigator.locks.request(lockName, save)
  else await save()
}
