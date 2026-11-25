const freshnessMs = 15 * 60 * 1000

export async function getAdminAccess(db: D1Database, userId: string, sessionId: string, enabled: boolean) {
  const admin = await db.prepare(`
    SELECT mfa.verified_at AS verifiedAt FROM member_roles role
    LEFT JOIN admin_mfa mfa ON mfa.session_id = ?
    WHERE role.user_id = ? AND role.role = 'admin'
      AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = role.user_id AND suspended_at IS NOT NULL)
  `).bind(sessionId, userId).first<{ verifiedAt: number | null }>()
  if (!admin) return null
  const mfaExpiresAt = enabled && admin.verifiedAt !== null ? admin.verifiedAt + freshnessMs : null
  return { mfaEnabled: enabled, mfaFresh: mfaExpiresAt !== null && mfaExpiresAt > Date.now() }
}

export async function recordAdminMfa(db: D1Database, sessionToken: string) {
  const result = await db.prepare(`
    INSERT INTO admin_mfa (session_id, verified_at)
    SELECT session.id, ? FROM session JOIN member_roles role ON role.user_id = session.userId AND role.role = 'admin'
    JOIN user ON user.id = session.userId AND user.twoFactorEnabled = 1 AND user.emailVerified = 1
    JOIN twoFactor factor ON factor.userId = user.id AND factor.verified = 1
    WHERE session.token = ? AND NOT EXISTS (SELECT 1 FROM member_controls WHERE user_id = user.id AND suspended_at IS NOT NULL)
    ON CONFLICT(session_id) DO UPDATE SET verified_at = excluded.verified_at
  `).bind(Date.now(), sessionToken).run()
  return Boolean(result.meta.changes)
}
