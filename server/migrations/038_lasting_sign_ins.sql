-- a sign-in now lasts until Sign out, or a week without using the app, and never more than 30 days from signing in
-- created_at: when they signed in (ms since 1970), for the 30-day limit; expires is now the week's end, pushed back
-- as the app is used
-- the sign-ins open now were all made to last 8 hours, so they started 8 hours before they end
ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
UPDATE sessions SET created_at = expires - 8 * 60 * 60 * 1000;
