ALTER TABLE user ADD COLUMN twoFactorEnabled INTEGER NOT NULL DEFAULT 0 CHECK (twoFactorEnabled IN (0, 1));

CREATE TABLE twoFactor (
  id TEXT PRIMARY KEY NOT NULL,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0, 1)),
  failedVerificationCount INTEGER NOT NULL DEFAULT 0,
  lockedUntil DATE
);
CREATE INDEX two_factor_secret_idx ON twoFactor(secret);

CREATE TABLE member_roles (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role = 'admin'),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE admin_mfa (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  verified_at INTEGER NOT NULL
);

ALTER TABLE purchase_requests ADD COLUMN review_note TEXT;
ALTER TABLE purchase_requests ADD COLUMN last_code_id TEXT;
ALTER TABLE access_codes ADD COLUMN revoked_by TEXT REFERENCES user(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX one_open_purchase ON purchase_requests(user_id, campaign_id) WHERE status IN ('pending', 'approved');

CREATE TRIGGER audit_purchase_review AFTER UPDATE OF status ON purchase_requests
WHEN OLD.status = 'pending' AND NEW.status <> 'pending'
BEGIN
  INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (
    'purchase-reviewed:' || NEW.id, NEW.reviewed_by, 'purchase_' || NEW.status, NEW.id, NEW.reviewed_at
  );
END;

CREATE TRIGGER audit_ticket_revocation AFTER UPDATE OF revoked_at ON access_codes
WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
BEGIN
  INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (
    'revoked:' || NEW.id, NEW.revoked_by, 'purchase_ticket_revoked', NEW.id, NEW.revoked_at
  );
END;

CREATE TRIGGER audit_photo_purge AFTER UPDATE OF photo_key ON purchase_requests
WHEN OLD.photo_key IS NOT NULL AND NEW.photo_key IS NULL
BEGIN
  INSERT INTO audit_events (id, action, target_id, occurred_at) VALUES (
    'purged:' || NEW.id, 'purchase_photo_purged', NEW.id, CAST(unixepoch('subsec') * 1000 AS INTEGER)
  );
END;
