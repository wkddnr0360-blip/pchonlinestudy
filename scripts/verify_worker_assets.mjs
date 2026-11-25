import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprintedAsset } from '../shared/static-assets.ts'

const client = fileURLToPath(new URL('../.ons2/client/', import.meta.url))
const credential = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\b(?:github_pat_[A-Za-z0-9_]{36,}|gh[pousr]_[A-Za-z0-9]{36,}|GOCSPX-[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,})\b/
const legacyCatalog = /\/book\/[a-f0-9]{16}\/|book\/manifest\.json/
const packedQuestion = /["']?questionIndex["']?\s*:[\s\S]{0,240}["']?answerIndex["']?\s*:/

async function verifyDirectory(directory, prefix = '') {
  let count = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isDirectory() && name === 'assets') {
      count += await verifyDirectory(join(directory, entry.name), 'assets/')
      continue
    }
    if (!entry.isFile() || (!['index.html', 'release.json'].includes(name) && !fingerprintedAsset.test(name))) {
      throw new Error(`Unexpected Workers static asset: ${name}`)
    }
    if (/\.(?:html|js|css)$/.test(name)) {
      const source = await readFile(join(directory, entry.name), 'utf8')
      if (credential.test(source) || legacyCatalog.test(source) || packedQuestion.test(source)) {
        throw new Error(`Blocked credential or legacy question data in Workers static asset: ${name}`)
      }
    }
    count++
  }
  return count
}

const count = await verifyDirectory(client)
const release = JSON.parse(await readFile(join(client, 'release.json'), 'utf8'))
if (Object.keys(release).length !== 2 || !/^[a-f0-9-]{36}$/.test(release.id) || !Number.isSafeInteger(release.builtAt) || release.builtAt <= 0) {
  throw new Error('Invalid Workers release marker.')
}
const index = await readFile(join(client, 'index.html'), 'utf8')
const scripts = [...index.matchAll(/<script\s[^>]*?src="\/([^\"]+)"/g)].map((match) => match[1])
if (!scripts.length || scripts.some((path) => !fingerprintedAsset.test(path) || !path.endsWith('.js'))) {
  throw new Error('The Workers index must reference a fingerprinted same-origin entry script.')
}
await Promise.all(scripts.map((path) => readFile(join(client, path))))
console.log(`Verified ${count} Workers static assets.`)
