# Grove dashboard — core + Settings

The dashboard is a static site (no build step), so the core integration is
plain browser ESM. What changed and what you need to do:

## Files
- `public/grove-core.js` — Supabase (via CDN) + helpers, shared by both pages.
- `public/settings.html` — the Settings page (Appearance / Household / Apps / About).
- `public/index.html` — now renders the tile grid from the registry and links to Settings (gear, top-right).
- `api/whoami.js` — edge function returning the Cloudflare Access email.
- `db/01-core-schema.sql` — the shared `core` schema + seed (run once in reilly-home).

## One-time setup
1. **Run the schema.** Paste `db/01-core-schema.sql` into the reilly-home SQL editor → Run.
2. **Expose it.** Supabase → Settings → API → Exposed schemas → add `core`.
3. **Fix the seed emails.** `core.people` → set Mav's & Ren's real Cloudflare Access emails.
4. **Add the anon key.** In `public/grove-core.js`, replace `REPLACE_WITH_ANON_PUBLIC_KEY`
   with the reilly-home **anon public** key (never service_role). It's safe in the
   page — Cloudflare Access gates the site, and every other app already ships it.
5. Push to `main`; Vercel deploys, and `/api/whoami` goes live with it.

## How the grid works now
Tile artwork (icon SVG + dark backdrop) lives in `index.html`'s `APP_META`,
keyed by the registry **slug**. The registry (`core.apps`) controls show/hide,
order, name, subdomain, and accent. So Settings → Apps edits take effect on the
home grid, while the hand-tuned icons stay in code.

The grid paints instantly from `APP_META`, then overlays the registry once it
loads. If Supabase is unreachable, you simply get all eight default tiles — the
front door never goes blank.

## Notes
- Slugs must match between `core.apps` and `APP_META`: journal, quest, pantry,
  ledger, pets, media, calendar, workout.
- The dormant `api/verify-pin.js` was left untouched.
- Theme: a tiny synchronous script in each page's `<head>` applies the cached
  theme before paint; `grove-core.js` reconciles it from `core.prefs` after load.
