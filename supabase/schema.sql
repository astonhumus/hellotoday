-- NOTE: contributors.sql replaces the security section of this file. Do not re-run this file after running contributors.sql.
-- Run once in Supabase: SQL Editor > New query > paste > Run. Then run seed.sql.
-- Safe to re-run.

create extension if not exists pg_trgm;

-- ───────── Reference data ─────────
create table if not exists public.states (
  id         text primary key,                 -- 'manipur'
  name       text not null,                    -- must match india-states.json
  center_lat double precision not null,
  center_lng double precision not null,
  zoom       int not null default 8
);

create table if not exists public.categories (
  id    text primary key,                      -- 'tourist-site', 'picnic', 'snacks', 'hotel', 'resort'
  label text not null,
  color text not null,
  icon  text not null,
  sort  int not null default 0
);

-- ───────── Places ─────────
create table if not exists public.places (
  id          text primary key,
  state_id    text not null references public.states(id) on update cascade,
  category_id text not null references public.categories(id) on update cascade,
  name        text not null check (length(name) between 1 and 120),
  district    text,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  description text,
  phone       text,
  website     text check (website is null or website ~* '^https?://'),
  approx      boolean not null default false,   -- location is approximate
  visited     date,                             -- set once you have been there
  notes       text,                             -- personal tips
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Filters used by the app: state, category, district, visited, text search.
create index if not exists places_state_cat_idx on public.places (state_id, category_id);
create index if not exists places_district_idx  on public.places (state_id, district);
create index if not exists places_visited_idx   on public.places (visited) where visited is not null;
create index if not exists places_search_idx    on public.places
  using gin ((coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(district,'') || ' ' || coalesce(notes,'')) gin_trgm_ops);

-- ───────── Songs (lyrics only: no audio or video) ─────────
create table if not exists public.songs (
  id         text primary key,
  title      text not null check (length(title) between 1 and 120),
  artist     text,                              -- filter
  language   text,                              -- filter: 'Manipuri (Meiteilon)', 'English', 'Hindi', ...
  lyrics     text not null,
  credit     text,                              -- source / permission note
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists songs_language_idx on public.songs (language);
create index if not exists songs_artist_idx   on public.songs (artist);
create index if not exists songs_search_idx   on public.songs
  using gin ((coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' || coalesce(language,'')) gin_trgm_ops);

-- Option lists for the filter chips/dropdowns, with counts.
create or replace view public.song_languages with (security_invoker = true) as
  select language, count(*)::int as songs from public.songs where language is not null group by language order by language;
create or replace view public.song_artists with (security_invoker = true) as
  select artist, count(*)::int as songs from public.songs where artist is not null group by artist order by artist;
create or replace view public.place_districts with (security_invoker = true) as
  select state_id, district, count(*)::int as places from public.places where district is not null group by state_id, district order by district;

-- Keep updated_at fresh.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists places_touch on public.places;
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before update on public.songs for each row execute function public.touch_updated_at();

-- ───────── Checklist catalog edits (admin adds/edits/removes trip items) ─────────
-- Small overlay on public/data/checklist.json: rows with deleted=false are added/edited items,
-- rows with deleted=true hide a built-in item. kind is always 'checklist'.
create table if not exists public.items (
  kind       text not null,
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (kind, id)
);

-- ───────── Security: everyone reads, only listed admins write ─────────
-- (Fill public.admins with admin-only.sql after this file.)
create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
grant execute on function public.is_admin() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['states','categories','places','songs','items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "read all" on public.%I for select using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ───────── Privileges (newer Supabase projects do not grant these automatically) ─────────
grant usage on schema public to anon, authenticated;
grant select on public.states, public.categories, public.places, public.songs, public.items,
                public.song_languages, public.song_artists, public.place_districts to anon, authenticated;
grant insert, update, delete on public.states, public.categories, public.places, public.songs, public.items to authenticated;
