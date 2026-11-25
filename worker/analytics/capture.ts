import type { Ox } from '../../src/book/types'

export function captureStudyAttempt(db: D1Database, userId: string, maxStage: number, no: number, revision: number, eventId: string, choice: Ox, now: number, elapsed: number | null) {
  return db.prepare(`
    WITH question AS (
      SELECT q.no, rev.revision, rev.answer, COALESCE(v.statistics_version, rev.revision) AS version
      FROM book_questions q JOIN question_revisions rev ON rev.no = q.no AND rev.revision = q.active_revision
      LEFT JOIN study_statistics_versions v ON v.no = rev.no AND v.revision = rev.revision
      WHERE q.no = ?1 AND q.stage <= ?2 AND rev.revision = ?3
    ), eligible AS (
      SELECT NOT EXISTS (SELECT 1 FROM member_roles WHERE user_id = ?4 AND role = 'admin') AS ok
    )
    INSERT INTO study_attempts (rowid, user_id, event_id, kind, no, choice, revision, is_correct, occurred_at, received_at,
      statistics_version, statistics_first, elapsed_ms)
    SELECT MAX(COALESCE((SELECT MAX(rowid) FROM study_attempts), 0),
        (SELECT cursor FROM study_statistics_job WHERE id = 1)) + 1,
      ?4, ?5, 'study', q.no, ?6, q.revision, q.answer = ?6, ?7, ?7,
      CASE WHEN eligible.ok THEN q.version END,
      CASE WHEN eligible.ok THEN NOT EXISTS (
        SELECT 1 FROM study_attempts prior
        WHERE prior.user_id = ?4 AND prior.kind = 'study' AND prior.no = q.no AND prior.statistics_version = q.version
      ) END,
      CASE WHEN eligible.ok THEN ?8 END
    FROM question q CROSS JOIN eligible WHERE true
    ON CONFLICT(user_id, kind, event_id) DO NOTHING
  `).bind(no, maxStage, revision, userId, eventId, choice, now, elapsed)
}
