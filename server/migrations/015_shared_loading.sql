-- One shared loading line: Roofings and Steel are departments of the company, not teams, so handing a customer over
-- to loading is just a step: every loading account sees and calls every customer sales has handed over, and no
-- account or order is on a loading crew any more
-- an order's team is now the sales team that served the customer (GIGA, MEGA, ... from src/data/teams.js), picked on
-- Customer order; it stays theirs after the hand-over

-- 1 while the loading crew is serving the customer, 0 otherwise (a sales counter can still call them back)
ALTER TABLE orders ADD COLUMN at_loading INTEGER NOT NULL DEFAULT 0;
UPDATE orders SET at_loading = 1 WHERE status = 'serving' AND serving_team IS NOT NULL;

-- a customer finished at one crew and waiting for the next is now simply waiting for loading
ALTER TABLE orders DROP COLUMN serving_team;
ALTER TABLE orders DROP COLUMN teams_done;
ALTER TABLE users DROP COLUMN team;

-- Roofings and Steel come off the orders that went to them, leaving any sales team: "Roofings, GIGA" → "GIGA"
UPDATE orders
SET team = trim(replace(replace(', ' || team || ', ', ', Roofings, ', ', '), ', Steel, ', ', '), ', ')
WHERE team != '';
