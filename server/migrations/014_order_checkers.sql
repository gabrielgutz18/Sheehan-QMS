-- the checkers on Customer order: a 1st and a 2nd checker for each column of src/data/checkers.js (Roofing,
-- Construction, ...), kept as JSON with only the columns that have a name, e.g. {"Roofing":["Pedro",""]}; '' while
-- none is filled in, and the printed ticket then has blank lines to write them on by hand
-- the columns aren't CHECKed: their list is in src/data/checkers.js, so adding one needs no new migration

ALTER TABLE orders ADD COLUMN checkers TEXT NOT NULL DEFAULT '';
