// =====================================================================
// Grove · grove-core.js  (browser ESM — for the STATIC dashboard)
// The home dashboard has no build step, so this is plain browser ESM and
// pulls supabase-js from a CDN. The React apps use src/core.js instead;
// the two share the same shape but can't share a file (no bundler here).
//
// The anon key is NOT a secret — Cloudflare Access gates this page, and
// every other Grove app already ships the anon key in its public bundle.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://ceomcgjbizynplactgiq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlb21jZ2piaXp5bnBsYWN0Z2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzE5MTcsImV4cCI6MjA5NTA0NzkxN30.ythvg4w8UKPM5AvWDAGM1UA5_JBmNSfrk3f62MVbvrA'

export const core =
  SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith('REPLACE')
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'core' } })
    : null

// ---------------------------------------------------------------------
// THEME — shared across the suite via core.prefs; localStorage is only a
// per-device cache for flash-free paint. NOTE: the *instant* paint is done
// by a tiny synchronous <script> in each page's <head>; this module just
// reconciles afterward.
// ---------------------------------------------------------------------
const THEME_CACHE_KEY = 'grove_theme'

export function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('theme-dark', 'theme-light')
  if (theme === 'dark') root.classList.add('theme-dark')
  if (theme === 'light') root.classList.add('theme-light')
  try { localStorage.setItem(THEME_CACHE_KEY, theme) } catch { /* private mode */ }
}

export function cachedTheme() {
  try { return localStorage.getItem(THEME_CACHE_KEY) || 'auto' } catch { return 'auto' }
}

export async function loadTheme(personId) {
  if (!core || !personId) { applyTheme(cachedTheme()); return cachedTheme() }
  const { data } = await core
    .from('prefs').select('value')
    .eq('person_id', personId).eq('key', 'theme').maybeSingle()
  const theme = data?.value ?? cachedTheme()
  applyTheme(theme)
  return theme
}

export async function setTheme(personId, theme) {
  applyTheme(theme)
  if (!core || !personId) return
  await core.from('prefs').upsert(
    { person_id: personId, key: 'theme', value: theme, updated_at: new Date().toISOString() },
    { onConflict: 'person_id,key' },
  )
}

// ---------------------------------------------------------------------
// PEOPLE
// ---------------------------------------------------------------------
export async function getPeople() {
  if (!core) return []
  const { data, error } = await core.from('people').select('*').order('sort_order')
  if (error) throw error
  return data ?? []
}
export async function updatePerson(id, fields) {
  if (!core) return
  await core.from('people').update(fields).eq('id', id)
}
export async function addPerson(sortOrder) {
  if (!core) return null
  const { data } = await core.from('people')
    .insert({ name: 'New member', color: '#9B82BE', sort_order: sortOrder })
    .select().single()
  return data ?? null
}
export async function removePerson(id) {
  if (!core) return
  await core.from('people').delete().eq('id', id)
}

// ---------------------------------------------------------------------
// APPS (registry that drives the dashboard grid)
// ---------------------------------------------------------------------
export async function getApps({ onlyEnabled = false } = {}) {
  if (!core) return []
  let q = core.from('apps').select('*').order('sort_order')
  if (onlyEnabled) q = q.eq('enabled', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
export async function updateApp(id, fields) {
  if (!core) return
  await core.from('apps').update(fields).eq('id', id)
}
// Persist a new ordering given an array of app ids in display order.
export async function saveAppOrder(orderedIds) {
  if (!core) return
  await Promise.all(orderedIds.map((id, i) =>
    core.from('apps').update({ sort_order: i }).eq('id', id)))
}

// ---------------------------------------------------------------------
// WHOAMI — Cloudflare Access email → person (memoized). /api/whoami is a
// tiny edge function; in local dev there's no Cloudflare header so we fall
// back to the first person.
// ---------------------------------------------------------------------
let _mePromise = null
export function whoami() {
  if (_mePromise) return _mePromise
  _mePromise = (async () => {
    let email = null
    try {
      const res = await fetch('/api/whoami')
      if (res.ok) email = (await res.json()).email ?? null
    } catch { /* not deployed / local dev */ }
    const people = await getPeople().catch(() => [])
    const me =
      (email && people.find(p => p.email?.toLowerCase() === email.toLowerCase())) ||
      people[0] || null
    return { email, person: me, people }
  })()
  return _mePromise
}
