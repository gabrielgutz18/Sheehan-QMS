-- staff accounts with roles, and who served each customer

-- admins run everything; sales staff serve customers from their counter
-- the admin from .env is created (or its password updated) here at every start, so it can always sign in
CREATE TABLE users (
    id             INTEGER PRIMARY KEY,
    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,                     -- shown in the app, e.g. "Maria Santos"
    role           TEXT    NOT NULL CHECK (role IN ('admin', 'sales')),
    password_hash  TEXT    NOT NULL,                     -- scrypt$<salt>$<hash>, never the password
    created_at     TEXT    NOT NULL,
    disabled_at    TEXT                                  -- set when the account is switched off; it keeps its history
);

-- sign-ins now point at an account, so a disabled account or a changed role takes effect straight away
-- (everyone signs in again once)
DROP TABLE sessions;
CREATE TABLE sessions (
    sid_hash  TEXT    PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires   INTEGER NOT NULL
);

-- the staff member who called the ticket, i.e. who is serving it now
ALTER TABLE orders ADD COLUMN served_by INTEGER REFERENCES users (id);

-- one point per customer served: added when a ticket is marked Done, for the staff member serving it,
-- and taken back if the ticket is reopened that same visit; a restored ticket's earlier points stay
CREATE TABLE serves (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users (id),
    queue_date  TEXT    NOT NULL,                        -- the visit (the ticket's day) the point is for
    served_at   TEXT    NOT NULL,                        -- ISO 8601
    UNIQUE (order_id, queue_date)
);

CREATE INDEX serves_by_user ON serves (user_id, served_at);
