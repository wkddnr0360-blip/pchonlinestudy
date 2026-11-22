type DirectoryPicker = (options: { mode: 'readwrite'; id: string }) => Promise<FileSystemDirectoryHandle>

function getPicker() {
  return (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
}

export function supportsBackupFolder() {
  return typeof getPicker() === 'function'
}

export async function chooseBackupFolder() {
  return getPicker()?.call(window, { mode: 'readwrite', id: 'pchonlinestudy-backup' })
}

export async function hasFolderPermission(folder: FileSystemDirectoryHandle) {
  const handle = folder as FileSystemDirectoryHandle & {
    queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  return handle.queryPermission
    ? await handle.queryPermission({ mode: 'readwrite' }) === 'granted'
    : true
}

export async function writeBackupFile(folder: FileSystemDirectoryHandle, name: string, json: string) {
  const file = await folder.getFileHandle(name, { create: true })
  const writer = await file.createWritable()
  try {
    await writer.write(json)
    await writer.close()
  } catch (error) {
    await writer.abort().catch(() => undefined)
    throw error
  }
}
