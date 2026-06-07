// =====================================================================
// Grove · core.js
// Shared client + helpers for the `core` schema (people, prefs, apps).
// COPY THIS FILE VERBATIM into every app — do not fork it
// (NEW-APP-BUILD-SPEC §9: drifted shared code is a known mistake).
//
// Your app's own supabase.js still points at the app's own schema.
// This pins a second client to `core` so reading shared config never
// disturbs your default-schema queries.
// =====================================================================

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const core = createClient(url, key, { db: { schema: 'core' } })

// ---------------------------------------------------------------------
// THEME — the one genuinely cross-app preference.
// Subdomains don't share localStorage, so the source of truth is
// core.prefs; localStorage is only a per-device cache for flash-free
// first paint. Call applyTheme() as early as possible (before render),
// then reconcile from the DB once whoami resolves.
// ---------------------------------------------------------------------
const THEME_CACHE_KEY = 'grove_theme' // shared cache key name across apps

// Apply a theme to <html>. 'auto' clears the manual override so the
// prefers-color-scheme media query takes back over.
export function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-light')
  if (theme === 'dark') root.classList.add('theme-dark')
  if (theme === 'light') root.classList.add('theme-light')
  try { localStorage.setItem(THEME_CACHE_KEY, theme) } catch { /* private mode */ }
}

// Read the cached theme for instant paint. Use this in main.jsx before
// React mounts; reconcile with loadTheme() afterward.
export function cachedTheme() {
  try { return localStorage.getItem(THEME_CACHE_KEY) || 'auto' } catch { return 'auto' }
}

// Load the person's stored theme from core.prefs and apply it.
export async function loadTheme(personId) {
  if (!personId) return cachedTheme()
  const { data } = await core
    .from('prefs')
    .select('value')
    .eq('person_id', personId)
    .eq('key', 'theme')
    .maybeSingle()
  const theme = data?.value ?? cachedTheme()
  applyTheme(theme)
  return theme
}

// Persist + apply a theme choice for a person.
export async function setTheme(personId, theme) {
  applyTheme(theme)
  if (!personId) return
  await core.from('prefs').upsert(
    { person_id: personId, key: 'theme', value: theme, updated_at: new Date().toISOString() },
    { onConflict: 'person_id,key' },
  )
}

// Generic pref getter/setter for everything beyond theme.
export async function getPref(personId, key, fallback = null) {
  if (!personId) return fallback
  const { data } = await core
    .from('prefs').select('value')
    .eq('person_id', personId).eq('key', key).maybeSingle()
  return data?.value ?? fallback
}

export async function setPref(personId, key, value) {
  if (!personId) return
  await core.from('prefs').upsert(
    { person_id: personId, key, value, updated_at: new Date().toISOString() },
    { onConflict: 'person_id,key' },
  )
}

// ---------------------------------------------------------------------
// PEOPLE
// ---------------------------------------------------------------------
export async function getPeople() {
  const { data, error } = await core
    .from('people').select('*').order('sort_order')
  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------
// APPS (registry that drives the dashboard grid)
// onlyEnabled=true for the dashboard; false in Settings to manage all.
// ---------------------------------------------------------------------
export async function getApps({ onlyEnabled = false } = {}) {
  let q = core.from('apps').select('*').order('sort_order')
  if (onlyEnabled) q = q.eq('enabled', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ---------------------------------------------------------------------
// WHOAMI — identify the current household member.
// Cloudflare Access injects the authenticated email as a request header,
// which a static SPA can't read. /api/whoami (a tiny Vercel function)
// surfaces it; we map it to a person row. Result is memoized.
// ---------------------------------------------------------------------
let _mePromise = null
export function whoami() {
  if (_mePromise) return _mePromise
  _mePromise = (async () => {
    let email = null
    try {
      const res = await fetch('/api/whoami')
      if (res.ok) email = (await res.json()).email ?? null
    } catch { /* function not deployed / local dev — fall through */ }

    const people = await getPeople().catch(() => [])
    const me =
      (email && people.find(p => p.email?.toLowerCase() === email.toLowerCase())) ||
      people[0] || // single-user / local-dev fallback
      null
    return { email, person: me, people }
  })()
  return _mePromise
}
