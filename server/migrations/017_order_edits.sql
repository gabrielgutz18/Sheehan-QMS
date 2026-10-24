-- Edited by: only signed-in admin and sales staff can change an order's details on Customer order, and every save that
-- changes something is kept: who saved it, their sales team at the time, when, and which details changed; the order
-- shows the latest one, "Edited by Gabriel Gutierrez · GIGA · 12:54 PM"

-- each staff member's own sales team (GIGA, MEGA, ... from src/data/teams.js), set by an admin on Accounts; '' for none
-- (the loading crews' old users.team, dropped in 015, was something else)
ALTER TABLE users ADD COLUMN sales_team TEXT NOT NULL DEFAULT '';

CREATE TABLE order_edits (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users (id),  -- who saved it
    sales_team  TEXT NOT NULL DEFAULT '',                -- their sales team when they saved it; '' for none
    changes     TEXT NOT NULL,                           -- what changed, as a JSON list, e.g. ["runner","receiver"]
    edited_at   TEXT NOT NULL                            -- ISO 8601
);

CREATE INDEX order_edits_order ON order_edits (order_id, id);
