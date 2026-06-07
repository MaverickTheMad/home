-- =====================================================================
-- Grove · core schema
-- Shared, cross-app config for the reilly.live suite.
-- Run in the reilly-home Supabase SQL editor.
-- After running: Settings → API → Exposed schemas → add `core`.
-- =====================================================================

create schema if not exists core;
set search_path to core;

-- ---------------------------------------------------------------------
-- people — household members, first-class across every app
-- email matches the address Cloudflare Access gates on, so /api/whoami
-- can map the authenticated request back to a person.
-- ---------------------------------------------------------------------
create table if not exists people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,                 -- Cloudflare Access identity
  color       text not null default '#4FA06F',
  is_admin    boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- prefs — per-person key/value settings (theme today, more later)
-- value is jsonb so a pref can be a string, bool, or small object
-- without a migration. e.g. ('theme' -> "dark"), ('landing' -> "ledger")
-- ---------------------------------------------------------------------
create table if not exists prefs (
  person_id   uuid not null references people(id) on delete cascade,
  key         text not null,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (person_id, key)
);

-- ---------------------------------------------------------------------
-- apps — the registry that drives the home-dashboard grid.
-- Disabling a row hides its tile; sort_order orders the grid.
-- ---------------------------------------------------------------------
create table if not exists apps (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,        -- 'journal', 'pantry', ...
  name         text not null,               -- "Ren's Journal"
  subdomain    text not null,               -- 'ren.reilly.live'
  accent_name  text,                        -- "Berry"
  accent_hex   text,                         -- '#D06A82'
  icon         text,                         -- lucide icon name
  description  text,
  sort_order   int not null default 0,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- API access (REQUIRED — without this the apps see nothing)
-- ---------------------------------------------------------------------
grant usage on schema core to anon, authenticated;
grant all on all tables in schema core to anon, authenticated;
grant all on all sequences in schema core to anon, authenticated;
alter default privileges in schema core
  grant all on tables to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS — permissive anon policy. Real protection is Cloudflare Access
-- in front of the subdomain, not the database (suite convention).
-- ---------------------------------------------------------------------
alter table people enable row level security;
alter table prefs  enable row level security;
alter table apps   enable row level security;

create policy anon_all on people for all to anon using (true) with check (true);
create policy anon_all on prefs  for all to anon using (true) with check (true);
create policy anon_all on apps   for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------
-- Seed — the two of you + the five known apps.
-- Replace the emails with the real Cloudflare Access addresses.
-- ---------------------------------------------------------------------
insert into people (name, email, color, is_admin, sort_order) values
  ('Mav', 'mav@example.com', '#6F86C2', true,  0),
  ('Ren', 'ren@example.com', '#D06A82', false, 1)
on conflict (email) do nothing;

insert into apps (slug, name, subdomain, accent_name, accent_hex, icon, description, sort_order) values
  ('journal',  'Ren''s Journal', 'ren.reilly.live',      'Berry', '#D06A82', 'notebook-pen',   'Cycle & symptom tracker', 0),
  ('quest',    'Quest Log',      'mav.reilly.live',      'Plum',  '#A877B8', 'shield',         'Personal quest log',      1),
  ('pantry',   'Meal Hub',       'shopping.reilly.live', 'Clay',  '#CB7A4F', 'shopping-basket','Meal planning & list',    2),
  ('ledger',   'Ledger',         'budget.reilly.live',   'Dusk',  '#6F86C2', 'wallet',         'Household budget',         3),
  ('pets',     'Pets',           'pets.reilly.live',     'Honey', '#D8A24F', 'paw-print',      'Pet care log',             4),
  ('media',    'Media',          'media.reilly.live',    'Tide',  '#4CA39B', 'clapperboard',   'Media shelf',              5),
  ('calendar', 'Calendar',       'almanac.reilly.live',  'Fern',  '#79B45F', 'calendar',       'Shared calendar',          6),
  ('workout',  'Workout',        'fitness.reilly.live',  'Green', '#4FA06F', 'dumbbell',       'Workout tracker',          7)
on conflict (slug) do nothing;
