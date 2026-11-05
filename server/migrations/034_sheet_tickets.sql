-- tickets made in the Google sheet: a row typed there with CREATE TICKET ticked becomes an order; sheet_key is the mark
-- the Apps Script gave that row, so if the answer back to the sheet gets lost and the row is sent again, it finds the
-- ticket it already made instead of making a second one; NULL for every ticket taken in the app

ALTER TABLE orders ADD COLUMN sheet_key TEXT;

CREATE UNIQUE INDEX orders_sheet_key ON orders (sheet_key) WHERE sheet_key IS NOT NULL;
