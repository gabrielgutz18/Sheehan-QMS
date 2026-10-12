-- profile details each staff member keeps up to date on My account
-- users.name stays the name shown around the app ("Maria Santos"): first name + surname, rebuilt on every save

ALTER TABLE users ADD COLUMN first_name  TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN middle_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN surname     TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN employee_id TEXT;                     -- NULL until set; unique when set
ALTER TABLE users ADD COLUMN department  TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN photo       TEXT;                     -- file name in <data folder>/photos/, or NULL

-- existing accounts: split the name at the first space, so "Maria Dela Cruz" → "Maria" + "Dela Cruz"
UPDATE users SET
    first_name = CASE WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
    surname    = CASE WHEN instr(trim(name), ' ') > 0 THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) ELSE '' END;

-- NULLs don't clash, so any number of accounts can be without an employee ID
CREATE UNIQUE INDEX users_employee_id ON users (employee_id COLLATE NOCASE);
