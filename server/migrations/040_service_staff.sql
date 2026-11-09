-- Service: the TBA department (Tire, Battery) is called Service now; it works as before, like Loading and Hardware:
-- sales hands a customer over, and one who bought a Tire or Battery is called to Service from the Service page
-- (src/data/loadingAreas.js); only the department is renamed, a "TBA priority" order ("**"), the TBA column of the
-- Order sheet and the TBA sales team keep their names

-- SQLite can't change a CHECK, so users is rebuilt with the new list and its rows copied across, as in 031; foreign
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
    department     TEXT    NOT NULL DEFAULT '',          -- e.g. Roofings or Steel for loading staff
    photo          TEXT,                                 -- file name in <data folder>/photos/, or NULL
    sales_team     TEXT    NOT NULL DEFAULT '',          -- their own sales team (src/data/teams.js), '' for none
    last_seen      INTEGER,                              -- milliseconds since 1970, as Date.now(); NULL until they sign in
    cover_photo    TEXT                                  -- file name in <data folder>/photos/, or NULL
);

-- every TBA account becomes a Service account, with its sign-ins and history
INSERT INTO users_new (id, username, name, role, password_hash, created_at, disabled_at,
                       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen, cover_photo)
SELECT id, username, name, CASE role WHEN 'tba' THEN 'service' ELSE role END, password_hash, created_at, disabled_at,
       first_name, middle_name, surname, employee_id, department, photo, sales_team, last_seen, cover_photo
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX users_employee_id ON users (employee_id COLLATE NOCASE);

-- the area keeps up with the department's new name, so a customer at TBA right now, what TBA has loaded and a guard's
-- send-back to TBA all still count as that area's
UPDATE orders SET loading_area = 'Service' WHERE loading_area = 'TBA';
UPDATE order_loads SET area = 'Service' WHERE area = 'TBA';
UPDATE security_checks SET returned_to = 'Service' WHERE returned_to = 'TBA';
