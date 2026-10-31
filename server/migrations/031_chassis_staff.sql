-- Chassis: a tenth kind of staff account, for the Chassis department, which is its own department now rather than part
-- of TBA; it works like TBA and Hardware: sales hands a customer over, and one who bought a Chassis is called to
-- Chassis from the Chassis page (src/data/loadingAreas.js); one who bought from other departments too goes to each in turn

-- SQLite can't change a CHECK, so users is rebuilt with the new list and its rows copied across, as in 029; foreign
-- keys are off while migrations run (see server/db.js), so dropping the old table leaves sessions, orders, serves,
-- order_edits, order_loads, security_checks, messages and direct_messages alone

CREATE TABLE users_new (
    id             INTEGER PRIMARY KEY,
    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,                     -- shown in the app, e.g. "Maria Santos"
    role           TEXT    NOT NULL CHECK (role IN ('admin', 'sales', 'loading', 'tba', 'chassis', 'hardware', 'security', 'cashier', 'inventory', 'developer')),
    password_hash  TEXT    NOT NULL,                     -- scrypt$<salt>$<hash>, never the password
    created_at     TEXT    NOT NULL,
    disabled_at    TEXT,                                 -- set when the account is switched off; it keeps its history
    first_name     TEXT    NOT NULL DEFAULT '',
    middle_name    TEXT    NOT NULL DEFAULT '',
    surname        TEXT    NOT NULL DEFAULT '',
    employee_id    TEXT,                                 -- NULL until set; unique when set
    department     TEXT    NOT NULL DEFAULT '',          -- e.g. Roofings or Steel for loading staff
    photo          TEXT,                                 -- file name in <data folder>/photos/, or NULL
    sales_team     TEXT    NOT NULL DEFAULT '',          -- their own sales team (src/data/teams.js), '' for none
    last_seen      INTEGER                               -- milliseconds since 1970, as Date.now(); NULL until they sign in
);

INSERT INTO users_new (id, username, name, role, password_hash, created_at, disabled_at,
                       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen)
SELECT id, username, name, role, password_hash, created_at, disabled_at,
       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX users_employee_id ON users (employee_id COLLATE NOCASE);
