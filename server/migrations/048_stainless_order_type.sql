-- the For Logistics type of order is now Stainless (src/data/purpose.js), with tickets starting ST instead of LS; a
-- ticket's letters are worked out from its types each time it's shown, so the orders already taken are renamed too,
-- or they'd show as FL and drop out of the Logistics area, the Stainless History list and the sheet's Construction &
-- hardware column; no other type has "For Logistics" in its name, so it can be swapped inside a list ("Steel, For
-- Logistics"); the area keeps its name, Logistics, so loaded areas and security checks are left alone, and so are the
-- edits already kept, which say what the order was at the time
UPDATE orders SET purpose = REPLACE(purpose, 'For Logistics', 'Stainless') WHERE purpose LIKE '%For Logistics%';
UPDATE order_invoices SET type = 'Stainless' WHERE type = 'For Logistics';
