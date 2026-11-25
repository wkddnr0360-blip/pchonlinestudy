import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'

const tables = ['study_statistics', 'study_statistics_job', 'study_statistics_settings', 'study_statistics_versions']
const paths = [new URL('../migrations/', import.meta.url), new URL('../.ons2/drizzle-preview/', import.meta.url)]
const databases = [new DatabaseSync(':memory:'), new DatabaseSync(':memory:')]
try {
  for (const [i, directory] of paths.entries()) {
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) databases[i].exec(await readFile(new URL(file, directory), 'utf8'))
  }
  for (const table of tables) {
    const columns = (db) => db.prepare(`PRAGMA table_info(${table})`).all().map(({ name, type, notnull, dflt_value, pk }) =>
      ({ name, type, nullable: !notnull && !(pk && type === 'INTEGER' && name === 'id'), default: dflt_value, pk }))
    const foreignKeys = (db) => db.prepare(`PRAGMA foreign_key_list(${table})`).all()
      .map(({ table: target, from, to, on_update, on_delete }) => [target, from, to, on_update, on_delete].join('|')).sort()
    assert.deepEqual(columns(databases[1]), columns(databases[0]), table)
    assert.deepEqual(foreignKeys(databases[1]), foreignKeys(databases[0]), table + ' foreign keys')
  }
  assert.deepEqual(databases[0].prepare('PRAGMA foreign_key_check').all(), [])
  console.log(`Checked Wrangler and Drizzle column and foreign-key parity for ${tables.length} analytics tables.`)
} finally {
  for (const db of databases) db.close()
}
