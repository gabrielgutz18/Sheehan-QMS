-- which of the loading crew's areas a loading account works in, Roofings, Steel or Logistics (src/data/loadingAreas.js),
-- set by an admin on Accounts so the crew can be seen grouped by area; '' for none yet, and for every account that
-- isn't loading staff; it never limits what they can call: the crew is still one shared line
ALTER TABLE users ADD COLUMN loading_area TEXT NOT NULL DEFAULT '';
