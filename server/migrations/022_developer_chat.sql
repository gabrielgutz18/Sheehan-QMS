-- Developer: a seventh kind of staff account, for the team that builds the app; when something doesn't go well, any
-- staff member writes to them from Message developer, and they answer on the Chat page; they also have the Order
-- status board and Accounts, and nothing else

-- SQLite can't change a CHECK, so users is rebuilt with the new list and its rows copied across, as in 021; foreign
-- keys are off while migrations run (see server/db.js), so dropping the old table leaves sessions, orders, serves,
-- order_edits, order_loads and security_checks alone

CREATE TABLE users_new (
    id             INTEGER PRIMARY KEY,
    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,                     -- shown in the app, e.g. "Maria Santos"
    role           TEXT    NOT NULL CHECK (role IN ('admin', 'sales', 'loading', 'hardware', 'security', 'cashier', 'developer')),
    password_hash  TEXT    NOT NULL,                     -- scrypt$<salt>$<hash>, never the password
    created_at     TEXT    NOT NULL,
    disabled_at    TEXT,                                 -- set when the account is switched off; it keeps its history
    first_name     TEXT    NOT NULL DEFAULT '',
    middle_name    TEXT    NOT NULL DEFAULT '',
    surname        TEXT    NOT NULL DEFAULT '',
    employee_id    TEXT,                                 -- NULL until set; unique when set
    department     TEXT    NOT NULL DEFAULT '',          -- e.g. Roofings or Steel for loading staff
    photo          TEXT,                                 -- file name in <data folder>/photos/, or NULL
    sales_team     TEXT    NOT NULL DEFAULT ''           -- their own sales team (src/data/teams.js), '' for none
);

INSERT INTO users_new (id, username, name, role, password_hash, created_at, disabled_at,
                       first_name, middle_name, surname, employee_id, department, photo, sales_team)
SELECT id, username, name, role, password_hash, created_at, disabled_at,
       first_name, middle_name, surname, employee_id, department, photo, sales_team
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX users_employee_id ON users (employee_id COLLATE NOCASE);

-- one conversation per staff member with the developers: what they wrote and each developer's answer, oldest first
CREATE TABLE messages (
    id         INTEGER PRIMARY KEY,
    staff_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- whose conversation it is
    sender_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- the staff member, or the developer answering
    body       TEXT    NOT NULL,
    sent_at    TEXT    NOT NULL,
    read_at    TEXT                                                       -- when the other side opened it; NULL until then
);

CREATE INDEX messages_staff ON messages (staff_id, id);
