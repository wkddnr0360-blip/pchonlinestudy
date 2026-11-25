export function syntheticQuestion(no) {
  const stage = no <= 24 ? 1 : no <= 64 ? 2 : 3
  const part = no <= 40 && (no <= 12 || no > 24) ? 1 : 2
  const chapter = 1
  const section = no <= 12 || no > 24 ? 1 : no <= 18 ? 2 : 3
  const total = no * 2
  const shown = total + no % 2
  return {
    id: `pch-ox-${no}`, no, stage, part, chapter, section, revision: 1,
    prompt: `검증용 지문 ${no}번에서 ${no} 더하기 ${no}의 결과는 ${shown}이다.`,
    source: '검증용 합성 문제', answer: shown === total ? 'O' : 'X', marker: shown === total ? '[○]' : '[×]',
    explanation: [{ kind: 'text', text: `합성 지문에서 두 수의 합은 ${total}입니다.` }],
  }
}

export function syntheticOutline(questions) {
  const labels = new Map()
  for (const { stage, part, chapter, section } of questions) {
    for (const [chapterNo, sectionNo, label] of [
      [0, 0, `제${part}편 합성 목차`],
      [chapter, 0, `제${chapter}장 기본 개념`],
      [chapter, section, ['제1절 개념 확인', '제2절 적용 연습', '제3절 복습'][section - 1]],
    ]) {
      labels.set([stage, part, chapterNo, sectionNo].join('-'), { stage, part, chapter: chapterNo, section: sectionNo, label, printedPage: null })
    }
  }
  return [...labels.values()]
}

export async function seedSyntheticBook(db) {
  for (let first = 1; first <= 120; first += 20) {
    const statements = []
    for (let no = first; no < first + 20; no++) {
      const { stage, part, chapter, section, prompt, source, answer, marker, explanation } = syntheticQuestion(no)
      statements.push(db.prepare(`
        INSERT INTO book_questions (no, stage, part, chapter, section, chapter_key)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(no, stage, part, chapter, section, `synthetic-${part}`))
      statements.push(db.prepare(`
        INSERT INTO question_revisions (no, revision, prompt, source, answer, marker, explanation)
        VALUES (?, 1, ?, ?, ?, ?, ?)
      `).bind(no, prompt, source, answer, marker, JSON.stringify(explanation)))
    }
    await db.batch(statements)
  }
  const outline = syntheticOutline(Array.from({ length: 120 }, (_, index) => syntheticQuestion(index + 1)))
  await db.batch(outline.map(({ stage, part, chapter, section, label }) => db.prepare(
    'INSERT INTO book_outline (stage, part, chapter, section, label) VALUES (?, ?, ?, ?, ?)',
  ).bind(stage, part, chapter, section, label)))
}
