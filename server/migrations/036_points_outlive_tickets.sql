-- a staff member's points outlive the tickets they were for: purging deleted tickets (Orders & history → Deleted →
-- Purge) frees the database without taking points off anyone's total, so serves.order_id becomes NULL when its
-- ticket is purged, in place of the point going with it

-- SQLite can't change a foreign key, so serves is rebuilt and its rows copied across, as in 031; foreign keys are off
-- while migrations run (see server/db.js), and nothing points at serves
CREATE TABLE serves_new (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER REFERENCES orders (id) ON DELETE SET NULL,  -- NULL once the ticket is purged
    user_id     INTEGER NOT NULL REFERENCES users (id),
    queue_date  TEXT    NOT NULL,                        -- the visit (the ticket's day) the point is for
    served_at   TEXT    NOT NULL,                        -- ISO 8601
    UNIQUE (order_id, queue_date)
);

INSERT INTO serves_new (id, order_id, user_id, queue_date, served_at)
SELECT id, order_id, user_id, queue_date, served_at FROM serves;

DROP TABLE serves;
ALTER TABLE serves_new RENAME TO serves;

CREATE INDEX serves_by_user ON serves (user_id, served_at);
