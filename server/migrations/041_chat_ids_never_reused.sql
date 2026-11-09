-- a message's number is never used twice, even after every message is erased (npm run clear:messages): browsers keep a
-- chat picture for a year by its message's number, so a reused one would show a new message with an erased picture, and
-- a tab only pops up a message numbered higher than the last it showed

-- SQLite can't add AUTOINCREMENT to a table, so both are rebuilt and their rows copied across, same numbers; nothing
-- points at these two tables

CREATE TABLE messages_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- whose conversation it is
    sender_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- the staff member, or the developer answering
    body        TEXT    NOT NULL,
    sent_at     TEXT    NOT NULL,
    read_at     TEXT,                                                      -- when the other side opened it; NULL until then
    image       TEXT,                                                      -- file name in <data folder>/chat-images/, or NULL for a text message
    kind        TEXT    NOT NULL DEFAULT 'text',                           -- 'text', 'report' or 'status'
    concern_id  INTEGER REFERENCES concerns (id) ON DELETE SET NULL
);

INSERT INTO messages_new (id, staff_id, sender_id, body, sent_at, read_at, image, kind, concern_id)
SELECT id, staff_id, sender_id, body, sent_at, read_at, image, kind, concern_id
FROM messages;

DROP TABLE messages;
ALTER TABLE messages_new RENAME TO messages;

CREATE INDEX messages_staff ON messages (staff_id, id);

CREATE TABLE direct_messages_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body          TEXT    NOT NULL,                     -- '' for a picture with no caption
    image         TEXT,                                 -- file name in <data folder>/chat-images/, or NULL for text
    sent_at       TEXT    NOT NULL,
    read_at       TEXT                                  -- when the recipient opened it; NULL until then
);

INSERT INTO direct_messages_new (id, sender_id, recipient_id, body, image, sent_at, read_at)
SELECT id, sender_id, recipient_id, body, image, sent_at, read_at
FROM direct_messages;

DROP TABLE direct_messages;
ALTER TABLE direct_messages_new RENAME TO direct_messages;

CREATE INDEX direct_messages_pair ON direct_messages (sender_id, recipient_id, id);
CREATE INDEX direct_messages_unread ON direct_messages (recipient_id, read_at);
