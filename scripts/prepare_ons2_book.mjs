import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const ordinal = z.number().int().positive()
const title = z.object({ number: ordinal, label: z.string().min(1), page: ordinal, count: z.number().int().nonnegative() })
const chapter = title.extend({ key: z.string().regex(/^[1-3]-[1-2]-[1-7]$/), sections: z.array(title) })
const part = title.extend({ chapters: z.array(chapter) })
const manifest = z.object({
  version: z.string().regex(/^[a-f0-9]{16}$/), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  count: z.literal(3129), stages: z.array(z.object({ stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), parts: z.array(part) })).length(3),
})
const cell = z.object({ text: z.string(), colSpan: ordinal, rowSpan: ordinal })
const block = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({ kind: z.literal('table'), rows: z.array(z.array(cell)) }),
])
const records = z.array(z.object({
  id: z.string(), no: ordinal, stage: ordinal, part: ordinal, chapter: ordinal, section: ordinal.nullable(),
  chapterKey: z.string(), prompt: z.string().min(1).max(20000), source: z.string(),
  answer: z.enum(['O', 'X']), marker: z.enum(['[○]', '[×]', '[X]']), explanation: z.array(block),
}))
const bounds = [[1, 504], [505, 1859], [1860, 3129]]
const bookTables = [
  ['book_questions', 'no, stage, part, chapter, section, chapter_key'],
  ['question_revisions', 'no, revision, prompt, source, answer, marker, explanation'],
  ['book_outline', 'stage, part, chapter, section, label, printed_page'],
]
const staged = (table) => 'ons_import_' + table

async function checkedRead(schema, path) {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error('정규화 파일이 현재 온스 교재 구조와 일치하지 않습니다.')
  return parsed.data
}

function value(text) {
  if (text.includes('\0')) throw new Error('정규화 파일에 SQLite가 저장할 수 없는 문자가 있습니다.')
  return "'" + text.replaceAll("'", "''") + "'"
}

function outline(stage, part, chapter, section, entry) {
  return `INSERT INTO ${staged('book_outline')} VALUES (${stage}, ${part}, ${chapter}, ${section}, ${value(entry.label)}, ${entry.page});`
}

function ensure(condition) {
  if (!condition) throw new Error('기존 목차와 문항의 번호, 소속 또는 집계가 일치하지 않습니다.')
}

async function prepare(manifestPath) {
  const index = await checkedRead(manifest, manifestPath)
  const statements = bookTables.map(([table, fields]) =>
    `CREATE TABLE ${staged(table)} AS SELECT ${fields} FROM ${table} WHERE 0;`)
  const seen = new Set()
  const headings = new Set()
  const recordRoot = join(dirname(manifestPath), index.version)
  ensure(index.sha256.startsWith(index.version))
  ensure(index.stages.every(({ stage }, position) => stage === position + 1))
  for (const { stage, parts } of index.stages) {
    const [first, last] = bounds[stage - 1]
    for (const bookPart of parts) {
      ensure(bookPart.count === bookPart.chapters.reduce((sum, entry) => sum + entry.count, 0))
      statements.push(outline(stage, bookPart.number, 0, 0, bookPart))
      for (const entry of bookPart.chapters) {
        ensure(entry.key === [stage, bookPart.number, entry.number].join('-') && !headings.has(entry.key))
        headings.add(entry.key)
        statements.push(outline(stage, bookPart.number, entry.number, 0, entry))
        const chapterRecords = await checkedRead(records, join(recordRoot, entry.key + '.json'))
        ensure(chapterRecords.length === entry.count)
        const sectionCounts = new Map()
        for (const row of chapterRecords) {
          ensure(row.stage === stage && row.part === bookPart.number && row.chapter === entry.number && row.chapterKey === entry.key)
          ensure(row.no >= first && row.no <= last && row.id === `pch-ox-${row.no}` && !seen.has(row.no))
          ensure((row.answer === 'O') === (row.marker === '[○]'))
          if (row.section !== null) sectionCounts.set(row.section, (sectionCounts.get(row.section) ?? 0) + 1)
          seen.add(row.no)
          statements.push(
            `INSERT INTO ${staged('book_questions')} VALUES (${row.no}, ${stage}, ${row.part}, ${row.chapter}, ${row.section ?? 'NULL'}, ${value(row.chapterKey)});`,
            `INSERT INTO ${staged('question_revisions')} VALUES (${row.no}, 1, ${value(row.prompt)}, ${value(row.source)}, ${value(row.answer)}, ${value(row.marker)}, ${value(JSON.stringify(row.explanation))});`,
          )
        }
        const sections = new Set()
        for (const section of entry.sections) {
          ensure(!sections.has(section.number) && section.count === (sectionCounts.get(section.number) ?? 0))
          sections.add(section.number)
          statements.push(outline(stage, bookPart.number, entry.number, section.number, section))
        }
        ensure([...sectionCounts.keys()].every((section) => sections.has(section)))
      }
    }
  }
  ensure(seen.size === index.count)
  // The import may execute statements separately. Publish both sides of the
  // deferred foreign key within the same trigger invocation.
  statements.push(
    'CREATE TABLE ons_import_publish (ready INTEGER NOT NULL);',
    `CREATE TRIGGER ons_publish_book AFTER INSERT ON ons_import_publish BEGIN
  SELECT RAISE(ABORT, 'Book tables must be empty') WHERE ${bookTables.map(([table]) => `EXISTS (SELECT 1 FROM ${table})`).join(' OR ')};
  ${bookTables.map(([table, fields]) => `INSERT INTO ${table} (${fields}) SELECT ${fields} FROM ${staged(table)};`).join('\n  ')}
END;`,
    'INSERT INTO ons_import_publish VALUES (1);',
    'DROP TABLE ons_import_publish;',
    ...bookTables.map(([table]) => `DROP TABLE ${staged(table)};`),
  )
  const output = fileURLToPath(new URL('../.ons2/private/normalized-book.sql', import.meta.url))
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, statements.join('\n') + '\n', { flag: 'wx' })
  console.log(`정규화 문항 ${seen.size}개와 편·장·절 목차를 검증했습니다. D1 입력 파일은 .ons2/private/normalized-book.sql입니다.`)
}

if (process.argv.length !== 3) {
  console.error('사용법: node scripts/prepare_ons2_book.mjs <기존 정규화 폴더의 manifest.json>')
  process.exitCode = 1
} else {
  await prepare(resolve(process.argv[2])).catch((error) => {
    console.error(error.code === 'EEXIST' ? '비공개 SQL이 이미 있습니다. 기존 파일을 보관한 뒤 실행하세요.'
      : error.code === 'ENOENT' ? '정규화 manifest 또는 장별 파일을 찾을 수 없습니다.'
        : error instanceof SyntaxError ? '정규화 파일을 JSON으로 읽을 수 없습니다.' : error.message)
    process.exitCode = 1
  })
}
