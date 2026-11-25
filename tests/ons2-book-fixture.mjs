export function syntheticQuestion(no) {
  const stage = no <= 24 ? 1 : no <= 64 ? 2 : 3
  const part = no <= 40 ? 1 : 2
  const total = no * 2
  const shown = total + no % 2
  return {
    id: `pch-ox-${no}`, no, stage, part, revision: 1,
    prompt: `검증용 지문 ${no}번에서 ${no} 더하기 ${no}의 결과는 ${shown}이다.`,
    source: '검증용 합성 문제', answer: shown === total ? 'O' : 'X', marker: shown === total ? '[○]' : '[×]',
    explanation: [{ kind: 'text', text: `합성 지문에서 두 수의 합은 ${total}입니다.` }],
  }
}

export async function seedSyntheticBook(db) {
  for (let first = 1; first <= 120; first += 20) {
    const statements = []
    for (let no = first; no < first + 20; no++) {
      const { stage, part, prompt, source, answer, marker, explanation } = syntheticQuestion(no)
      statements.push(db.prepare(`
        INSERT INTO book_questions (no, stage, part, chapter, section, chapter_key)
        VALUES (?, ?, ?, 1, 1, ?)
      `).bind(no, stage, part, `synthetic-${part}`))
      statements.push(db.prepare(`
        INSERT INTO question_revisions (no, revision, prompt, source, answer, marker, explanation)
        VALUES (?, 1, ?, ?, ?, ?, ?)
      `).bind(no, prompt, source, answer, marker, JSON.stringify(explanation)))
    }
    await db.batch(statements)
  }
}
