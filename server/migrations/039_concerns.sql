-- concern reports: what a staff member sent through the guided chat on Message developer, and where it stands
CREATE TABLE concerns (
    id           INTEGER PRIMARY KEY,
    staff_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- who reported it
    kind         TEXT    NOT NULL CHECK (kind IN ('bug', 'concern', 'feature')),
    area         TEXT    NOT NULL,             -- bug: the page; concern: the topic key; feature: the department
    details      TEXT    NOT NULL,             -- what happened, or what they'd like
    extra        TEXT    NOT NULL DEFAULT '',  -- feature: how it would help; '' otherwise
    impact       TEXT    NOT NULL,             -- bug/concern: blocking, slow, minor; feature: high, medium, low
    status       TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'declined')),
    status_note  TEXT    NOT NULL DEFAULT '',  -- the developer's note with the last change
    status_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,  -- the developer who made the last change
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
);
CREATE INDEX concerns_status ON concerns (status, id);
CREATE INDEX concerns_staff ON concerns (staff_id, id);

-- a message in the developer chat can be a report card or a status change, linked to its report; no CHECK on kind,
-- so a later kind won't mean rebuilding the table (the server only writes these three)
ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';   -- 'text', 'report' or 'status'
ALTER TABLE messages ADD COLUMN concern_id INTEGER REFERENCES concerns (id) ON DELETE SET NULL;
