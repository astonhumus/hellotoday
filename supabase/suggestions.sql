-- Public "Suggest a place / report a problem" messages. Run once in the SQL Editor, AFTER schema.sql and contributors.sql. Safe to re-run.
-- Anyone (no sign-in) may SEND one; only admins can read, mark as done or delete them.

create table if not exists public.suggestions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('place', 'problem', 'other')),
  about      text check (length(about) <= 200),
  message    text not null check (length(message) between 5 and 1000),
  contact    text check (length(contact) <= 120),
  region     text check (length(region) <= 80),
  page       text check (length(page) <= 300),
  status     text not null default 'new' check (status in ('new', 'done'))
);
create index if not exists suggestions_status_idx on public.suggestions (status, created_at);

alter table public.suggestions enable row level security;

drop policy if exists "anyone may send" on public.suggestions;
create policy "anyone may send" on public.suggestions for insert to anon, authenticated with check (status = 'new');
drop policy if exists "admins read" on public.suggestions;
create policy "admins read" on public.suggestions for select to authenticated using (public.is_admin());
drop policy if exists "admins update" on public.suggestions;
create policy "admins update" on public.suggestions for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete" on public.suggestions;
create policy "admins delete" on public.suggestions for delete to authenticated using (public.is_admin());

revoke all on public.suggestions from anon, authenticated;
grant insert (kind, about, message, contact, region, page) on public.suggestions to anon, authenticated;
grant select, update, delete on public.suggestions to authenticated;
