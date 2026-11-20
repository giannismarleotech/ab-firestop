-- Run once in the Cloudflare D1 console, or with `wrangler d1 execute`.
-- This database contains CMS content, revisions, sessions and daily counters.
-- Uploaded photo bytes and their metadata live in the private MEDIA R2 bucket.
CREATE TABLE IF NOT EXISTS ab_records (
    key TEXT PRIMARY KEY NOT NULL,
    data TEXT NOT NULL CHECK (json_valid(data)),
    metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
    etag TEXT NOT NULL,
    expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS ab_records_expiry ON ab_records(expires_at)
    WHERE expires_at IS NOT NULL;
