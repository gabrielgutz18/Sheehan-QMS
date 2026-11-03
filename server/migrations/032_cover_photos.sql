-- the wide picture a staff member picks for the top of their profile, shown on their Dashboard and to whoever opens
-- their profile on SheeChat; it's a file beside their profile photo

ALTER TABLE users ADD COLUMN cover_photo TEXT;                     -- file name in <data folder>/photos/, or NULL
