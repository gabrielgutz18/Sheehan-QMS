-- what a developer (the IT department) does, e.g. "Web developer" or "Network and systems", typed on My account and
-- shown on their profile, so staff know who to ask; '' for none yet, and for every account that isn't a developer
ALTER TABLE users ADD COLUMN specialization TEXT NOT NULL DEFAULT '';
