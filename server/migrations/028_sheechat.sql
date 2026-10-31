-- SheeChat: staff chatting one another, one conversation per pair of people; every role but the developers (they
-- answer staff on the Chat page, in messages); a picture is sent as its own message, as in the developer chat
CREATE TABLE direct_messages (
    id            INTEGER PRIMARY KEY,
    sender_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body          TEXT    NOT NULL,                     -- '' for a picture with no caption
    image         TEXT,                                 -- file name in <data folder>/chat-images/, or NULL for text
    sent_at       TEXT    NOT NULL,
    read_at       TEXT                                  -- when the recipient opened it; NULL until then
);

-- one pair's conversation in order, either way round, and what each person hasn't read yet
CREATE INDEX direct_messages_pair ON direct_messages (sender_id, recipient_id, id);
CREATE INDEX direct_messages_unread ON direct_messages (recipient_id, read_at);
