-- every time a department's crew recalls a customer whose area was already done, e.g. they went home with the wrong
-- receipt or the wrong order: who recalled them, to which area, why and when; kept for good, like the security checks,
-- and the area's earlier load is taken off so it's loaded again (src/admin/components/orders/departmentLine.jsx)
CREATE TABLE order_recalls (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    area        TEXT    NOT NULL,                        -- the area they're called back to, e.g. Roofings
    user_id     INTEGER NOT NULL REFERENCES users (id),  -- who pressed Recall
    reason      TEXT    NOT NULL,                        -- e.g. Wrong receipt
    recalled_at TEXT    NOT NULL                         -- ISO 8601
);

CREATE INDEX order_recalls_by_order ON order_recalls (order_id);
