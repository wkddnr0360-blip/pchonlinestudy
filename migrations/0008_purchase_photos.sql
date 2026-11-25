CREATE TABLE purchase_request_photos (
  purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  jpeg BLOB NOT NULL CHECK (length(jpeg) BETWEEN 4 AND 524288)
) STRICT;

CREATE TRIGGER audit_purchase_photo_delete AFTER DELETE ON purchase_request_photos
WHEN EXISTS (SELECT 1 FROM purchase_requests WHERE id = OLD.purchase_id)
BEGIN
  INSERT INTO audit_events (id, action, target_id, occurred_at) VALUES (
    'purged:' || OLD.purchase_id, 'purchase_photo_purged', OLD.purchase_id,
    CAST(unixepoch('subsec') * 1000 AS INTEGER)
  );
END;
