-- pictures in the developer chat: a staff member or a developer pastes or attaches one, and it's sent as its own
-- message (its body '', or the caption when there's one)
ALTER TABLE messages ADD COLUMN image TEXT;   -- file name in <data folder>/chat-images/, or NULL for a text message
