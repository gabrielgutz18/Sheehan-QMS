-- a priority order: sales staff mark it on Customer order, and its ticket shows with a "*" in front, "* RS 01"
ALTER TABLE orders ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;   -- 1 for a priority order, 0 otherwise
