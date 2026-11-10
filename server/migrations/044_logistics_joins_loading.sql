-- Logistics is one of the loading crew's areas, beside Roofings and Steel, not a department of its own: the people
-- there are on the loading crew, so every Logistics account becomes a loading one and calls its customers from the
-- Loading page (src/data/loadingAreas.js); the area stays "Logistics", so orders, loaded areas and security checks
-- keep it as it was

-- SQLite can't change a CHECK, so users is rebuilt without 'logistics' and its rows copied across, as in 040; foreign
-- keys are off while migrations run (see server/db.js), so dropping the old table leaves sessions, orders, serves,
-- order_edits, order_loads, security_checks, messages, direct_messages and concerns alone

CREATE TABLE users_new (
    id             INTEGER PRIMARY KEY,
    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,                     -- shown in the app, e.g. "Maria Santos"
    role           TEXT    NOT NULL CHECK (role IN ('admin', 'sales', 'loading', 'service', 'chassis', 'hardware', 'security', 'cashier', 'inventory', 'developer')),
    password_hash  TEXT    NOT NULL,                     -- scrypt$<salt>$<hash>, never the password
    created_at     TEXT    NOT NULL,
    disabled_at    TEXT,                                 -- set when the account is switched off; it keeps its history
    first_name     TEXT    NOT NULL DEFAULT '',
    middle_name    TEXT    NOT NULL DEFAULT '',
    surname        TEXT    NOT NULL DEFAULT '',
    employee_id    TEXT,                                 -- NULL until set; unique when set
    department     TEXT    NOT NULL DEFAULT '',          -- e.g. Roofings, Steel or Logistics for loading staff
    photo          TEXT,                                 -- file name in <data folder>/photos/, or NULL
    sales_team     TEXT    NOT NULL DEFAULT '',          -- their own sales team (src/data/teams.js), '' for none
    last_seen      INTEGER,                              -- milliseconds since 1970, as Date.now(); NULL until they sign in
    cover_photo    TEXT,                                 -- file name in <data folder>/photos/, or NULL
    dropped_at     TEXT                                  -- when the account was dropped; NULL for every account still in use
);

INSERT INTO users_new (id, username, name, role, password_hash, created_at, disabled_at,
                       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen, cover_photo, dropped_at)
SELECT id, username, name, CASE role WHEN 'logistics' THEN 'loading' ELSE role END, password_hash, created_at, disabled_at,
       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen, cover_photo, dropped_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX users_employee_id ON users (employee_id COLLATE NOCASE);
