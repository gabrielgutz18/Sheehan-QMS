-- Cashier: a fifth kind of staff account, for the cashier, whose one job is how each order is paid: they change its
-- payment status (Vale, COD, Terms, Paid, ... from src/data/paymentStatus.js) once the customer pays, with none of an
-- admin's, a sales counter's, the loading crew's or the guards' rights

-- SQLite can't change a CHECK, so users is rebuilt with the new list and its rows copied across, as in 018; foreign
-- keys are off while migrations run (see server/db.js), so dropping the old table leaves sessions, orders, serves,
-- order_edits, order_loads and security_checks alone

CREATE TABLE users_new (
    id             INTEGER PRIMARY KEY,
    username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,                     -- shown in the app, e.g. "Maria Santos"
    role           TEXT    NOT NULL CHECK (role IN ('admin', 'sales', 'loading', 'security', 'cashier')),
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
