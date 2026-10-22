-- Several invoices on one ticket: sales can add as many invoice numbers as the customer has, each with the type of
-- order it's for (one of the ticket's types, from src/data/purpose.js), e.g. 43355521 for Roofings, 5566 for Steel
-- each ticket's one invoice number moves here, typed with its type of order when it has only one ('' otherwise)

CREATE TABLE order_invoices (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    position   INTEGER NOT NULL,                     -- keeps the order they were added in
    invoice_no TEXT    NOT NULL,
    type       TEXT    NOT NULL DEFAULT ''           -- e.g. Roofings; '' on an older ticket with several types
);

CREATE INDEX order_invoices_by_order ON order_invoices (order_id);

INSERT INTO order_invoices (order_id, position, invoice_no, type)
    SELECT id, 0, invoice_no, CASE WHEN instr(purpose, ',') = 0 THEN purpose ELSE '' END
    FROM orders WHERE invoice_no != '';

ALTER TABLE orders DROP COLUMN invoice_no;
