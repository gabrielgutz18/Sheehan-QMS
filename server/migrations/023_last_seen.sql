-- when each account last used the app, so staff on Message developer can see which developers are online: anyone
-- signed in who has used it in the last couple of minutes (an open page keeps fetching, so it keeps them online)
ALTER TABLE users ADD COLUMN last_seen INTEGER;   -- milliseconds since 1970, as Date.now(); NULL until they sign in
