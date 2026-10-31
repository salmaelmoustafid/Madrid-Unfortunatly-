# Madrid, unfortunately. — V23 Mobile-ready complete website

This package contains the complete website, based on the V22 character-assets release, with a mobile responsive CSS layer and mobile map gestures added. Existing desktop styling and application features are retained.

## Deploy to GitHub / Netlify

Upload the contents of this folder to the root of your GitHub repository, keeping the `assets/` and `supabase/` folders. Do not upload the ZIP itself.

Required root files: `index.html`, `styles.css`, `app.js`, `supabase-config.js`, and `netlify.toml`.

On mobile, one-finger movement is left to normal page scrolling. Two-finger movement pans the map and pinch gestures zoom it. Desktop map dragging remains enabled.

The mobile gestures should still be tested on a physical phone after deployment.
