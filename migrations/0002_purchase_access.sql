CREATE TABLE member_controls (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  suspended_at INTEGER
);

CREATE TABLE book_campaigns (
  id TEXT PRIMARY KEY NOT NULL,
  ends_at INTEGER NOT NULL
);

-- 2027-03-15 00:00 KST, exclusive.
INSERT INTO book_campaigns (id, ends_at) VALUES ('ons-season-5', 1805036400000);

CREATE TABLE purchase_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES book_campaigns(id),
  cafe_nickname TEXT NOT NULL CHECK (length(cafe_nickname) BETWEEN 1 AND 60),
  photo_key TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'resubmit')),
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  CHECK ((status = 'pending') = (reviewed_at IS NULL)),
  UNIQUE (id, user_id, campaign_id)
);
CREATE INDEX purchase_user_idx ON purchase_requests(user_id, campaign_id, submitted_at);

CREATE TABLE access_codes (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  revoked_at INTEGER,
  redeemed_at INTEGER,
  FOREIGN KEY (request_id, user_id, campaign_id) REFERENCES purchase_requests(id, user_id, campaign_id) ON DELETE CASCADE
);
CREATE INDEX access_codes_request_idx ON access_codes(request_id);

CREATE TABLE entitlements (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES book_campaigns(id),
  code_id TEXT NOT NULL UNIQUE REFERENCES access_codes(id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, campaign_id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  occurred_at INTEGER NOT NULL
);

CREATE TRIGGER grant_on_code_redemption
AFTER UPDATE OF redeemed_at ON access_codes
WHEN OLD.redeemed_at IS NULL AND NEW.redeemed_at IS NOT NULL
BEGIN
  INSERT INTO entitlements (user_id, campaign_id, code_id, granted_at) VALUES (
    NEW.user_id, NEW.campaign_id, NEW.id, NEW.redeemed_at
  ) ON CONFLICT(user_id, campaign_id) DO UPDATE SET
    code_id = excluded.code_id, granted_at = excluded.granted_at, revoked_at = NULL
  WHERE entitlements.revoked_at IS NOT NULL;
  INSERT INTO audit_events (id, actor_user_id, action, target_id, occurred_at) VALUES (
    'code-redeemed:' || NEW.id, NEW.user_id, 'code_redeemed', NEW.id, NEW.redeemed_at
  );
END;
