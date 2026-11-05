-- edits typed in the Google sheet: a team, runner or receiver typed there comes back to the order and is kept as an edit
-- like any other, but Google doesn't reliably say who typed it, so user_id can now be empty; empty means it came from
-- the Google sheet, and the order shows "Edited by Google sheet"

-- SQLite can't drop a NOT NULL, so order_edits is rebuilt and its rows copied across; nothing points at this table

CREATE TABLE order_edits_new (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users (id),           -- who saved it; NULL when it was typed in the Google sheet
    sales_team  TEXT NOT NULL DEFAULT '',                -- their sales team when they saved it; '' for none
    changes     TEXT NOT NULL,                           -- what changed, as a JSON list, e.g. ["runner","receiver"]
    edited_at   TEXT NOT NULL                            -- ISO 8601
);

INSERT INTO order_edits_new (id, order_id, user_id, sales_team, changes, edited_at)
    SELECT id, order_id, user_id, sales_team, changes, edited_at FROM order_edits;

DROP TABLE order_edits;
ALTER TABLE order_edits_new RENAME TO order_edits;

CREATE INDEX order_edits_order ON order_edits (order_id, id);
