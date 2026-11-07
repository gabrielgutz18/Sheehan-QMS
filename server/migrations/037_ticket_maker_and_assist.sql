-- who made each ticket, and who is helping its customer while that person is away from their counter
-- created_by: the staff member signed in when the ticket was taken (Customer order, or a new row on the Order sheet);
-- NULL for the kiosk, a row typed in the Google sheet and every ticket from before this. Only they (or an admin) hand
-- the customer over, and a ticket with no maker can be handed over by anyone in sales, as before
-- assisted_by: another sales staff member who pressed Assist on My counter; cleared with Stop assisting, and kept
-- after the hand-over so the Order sheet's Assisted by shows them
ALTER TABLE orders ADD COLUMN created_by INTEGER REFERENCES users (id);
ALTER TABLE orders ADD COLUMN assisted_by INTEGER REFERENCES users (id);
