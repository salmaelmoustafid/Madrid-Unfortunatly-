# Madrid, unfortunately. — Static website

This edition uses plain HTML, CSS and JavaScript. There is no Vite, React, npm install or build step.

## Preview locally

1. Extract the ZIP.
2. Open `index.html` in a browser. The map uses Leaflet and OpenStreetMap tiles, so an internet connection is needed for the map.
3. Login codes for the prototype:
   - Alisha: `GATORADE`
   - Eva: `MOUNTAINDEW`

## Deploy to Netlify

1. Create a new GitHub repository or use the existing `Madrid-Unfortunatly-` repository.
2. Upload the **contents** of this folder (not the ZIP file and not an extra enclosing folder) to the repository root.
3. In Netlify, choose **Add new site → Import an existing project** and connect that GitHub repository.
4. Set the publish directory to `.`. Leave the build command blank.
5. Deploy.

## Current functionality

- Five sections: Map, Bucket List, Side Quests, Scrapbook, Character Room.
- Madrid map with predefined locations, planned/completed/custom pin key, add-pin action.
- Draggable/minimisable floating panels on the map: adventure status, quick actions, latest memories and map key.
- Bucket list filters, add-adventure form, museum quick-add, completion flow (Alisha / Eva / Both).
- Quick Actions random side-quest generator; accepted quests are added to the completed Side Quests log.
- Scrapbook photo uploads, captions and Alisha/Eva/Both filters.
- Character profiles and achievement tracking.
- Browser-local persistence using localStorage. Login session lasts for the browser tab.

## Important limitations before sharing publicly

This is a functional front-end prototype, not yet a secure multi-user production app:

- The access codes are checked in browser JavaScript. Anyone who inspects the source can see them. Do not treat this as secure authentication.
- Adventures, quests and memories are stored in the current browser only. They do not sync between Alisha's and Eva's devices yet.
- Photos are stored as browser-local data. Clearing browser data can remove them, and large photo collections can exceed browser storage limits.
- The map and fonts/assets load from public CDNs / OpenStreetMap, so an internet connection is required for those external resources.

## Next production step: Supabase

To share data and photos across devices, configure Supabase Auth, a database and a private/public storage bucket with Row Level Security. Do not put a Supabase `service_role` key in this website. Only a publishable/anon key may be used in browser code, with correct RLS policies. For a proper two-player shared experience, the authentication design should be set up before enabling shared writes.


## Supabase player login (configured)

The entrance now uses Supabase Auth password sign-in while keeping the email field hidden from players. The player selects a character and enters only their access code. Supabase persists the session on that device; logging out clears it.

For the first two players, create Auth users in Supabase Dashboard → Authentication → Users → Add user:

- Alisha internal login email: `alisha@madrid-unfortunately.invalid`
- Eva internal login email: `eva@madrid-unfortunately.invalid`

Use a strong, unique password for each account; that password is the secret code the player enters on the website. Confirm the user in the dashboard if prompted. These are internal account identifiers only; players never enter or see these email addresses. Do not use the old demo codes.

The Supabase URL and publishable key are in `supabase-config.js`. The publishable key is designed for browser use. Never put a secret/service_role key in website files.

**Current integration stage:** Supabase authentication is connected. The existing adventure, quest and scrapbook content still uses browser-local storage. Shared database reads/writes and private photo uploads require the next step: authenticated Row Level Security policies and app data-layer integration.


## Shared map and adventure sync — Version 8

1. In Supabase SQL Editor, run `supabase/map-and-adventure-policies.sql`.
2. This policy set authorizes only the two internal player emails currently configured in `app.js`.
3. The website now loads and syncs `adventures`, `side_quests`, and `map_pins` through Supabase. It seeds the existing browser's initial adventure list only when the remote adventure table is empty.
4. Custom map pins are saved to Supabase. The predefined Madrid landmarks remain static map reference points.
5. Realtime subscriptions refresh the shared list when either player makes changes.

The scrapbook, profile pictures, and current activity are still local-only in this version; they are next integration tasks. Do not deploy publicly until you have run the SQL and tested both player accounts.


## Version 9 packaging repair

The HTML entry point (`index.html`) is included in this package and loads the Supabase JS SDK,
`supabase-config.js`, and `app.js` in the correct order. Keep all files and the `assets` folder
together when uploading to GitHub/Netlify. Do not open index.html from inside the ZIP; extract first.


## Completion comments (Version 10)

Run `supabase/completion-comments-migration.sql` once in Supabase SQL Editor.
It adds optional comment fields to adventure and side-quest completion records.
The website suggests a short task-specific sarcastic comment, which the player can edit
before saving. Comments are included in shared database sync.


## Version 12 updates
- Lighter CARTO/OSM map tiles and in-map address/place search.
- Preset map markers show place details only; no permission-error add-to-bucket action.
- Museum list is informational and no longer clickable.
- Character sprites are rendered as animated sprite sheets.
- Softer pastel overrides and white Bucket List, Side Quests and Scrapbook surfaces.
- Character profile photos are resized and saved locally in this browser. They persist after refresh on this device; cross-device photo sharing requires a later Supabase Storage integration.
- Expanded the random side-quest pool.


## Version 13 hotfix
- Fixed blank map caused by the CARTO basemap endpoint requiring an API key.
- Restored public OpenStreetMap tiles (no API key required) and retained a brighter, softer visual treatment.


## Version 14 visual updates
- Top banner changed to soft pink.
- Left navigation rail changed to white.
- Quick Actions and Map Key windows now use white backgrounds with high-contrast text and distinct pastel title bars.
- Reduced the dominance of purple across the desktop UI.
- Added standalone transparent character image assets (`assets/alisha-character.png` and `assets/eva-character.png`) and switched map characters to those images instead of attempting to animate the full sprite sheets.
