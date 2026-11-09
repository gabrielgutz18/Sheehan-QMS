-- dropping an account (Accounts, admins and developers): the person is gone from every list and can't sign in, their
-- username is free again and their photos and details are erased, but the row stays with just their name, as tickets,
-- points, edits, loaded areas and security checks all point at it and still say who did the work; chats keep the
-- conversation and show "Deleted account" instead of the name
ALTER TABLE users ADD COLUMN dropped_at TEXT;   -- when the account was dropped; NULL for every account still in use
