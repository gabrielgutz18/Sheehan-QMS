-- the Order sheet works like a spreadsheet: staff can add columns of their own, and type over a cell the system works out
-- by itself (who assisted, loading's times, who double checked); both are kept here, apart from the order's own details

-- a column added on the Order sheet or in the Google sheet; key is its name in capitals, how the two find each other;
-- a removed one keeps its cells and stays off the sheet, so the Google sheet can't bring it back, until it's added again
CREATE TABLE sheet_columns (
    id          INTEGER PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,   -- "c:PLATE NO"
    name        TEXT NOT NULL,          -- as first typed: "Plate no"
    created_at  TEXT NOT NULL,
    removed_at  TEXT
);

-- what's typed in one order's cell: cell is a column's key above, or assistedBy, loadingTimeIn, loadingTimeOut or
-- doubleCheckedBy, which then show in place of what the system worked out, and never change the order's real path; a
-- cleared cell has no row
CREATE TABLE sheet_cells (
    order_id  INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    cell      TEXT NOT NULL,
    value     TEXT NOT NULL,
    PRIMARY KEY (order_id, cell)
);
