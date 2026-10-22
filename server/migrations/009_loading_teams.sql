-- Loading teams: each loading account belongs to one crew (Roofings, Steel, ... from src/data/teams.js), and an
-- order can go to several (orders.team is now a list, "Roofings, Steel"); each crew calls the customer from its own
-- Loading page, one at a time, and marks its part done
-- no CHECK on the team names: their list is in src/data, so adding one needs no new migration

ALTER TABLE users ADD COLUMN team TEXT;                                -- loading accounts only; NULL until an admin sets it

ALTER TABLE orders ADD COLUMN serving_team TEXT;                       -- the crew serving the customer now, or NULL
ALTER TABLE orders ADD COLUMN teams_done   TEXT NOT NULL DEFAULT '';   -- the crews that have finished, "Roofings, Steel"
