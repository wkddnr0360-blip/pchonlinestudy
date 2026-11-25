CREATE INDEX purchase_campaign_queue_idx ON purchase_requests(campaign_id, status, submitted_at DESC, id DESC);
