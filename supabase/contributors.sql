-- Contributors with moderation. Run once in SQL Editor (after schema.sql, seed.sql and admin-only.sql).
-- Do NOT re-run schema.sql afterwards: it would reset the policies created here.
--
-- Roles (table public.members):
--   admin        full control, always auto-approved
--   contributor  submits places/songs; goes live after admin approval, unless auto_approve = true
-- 1) If you already ran admin-only.sql your admin is carried over. Otherwise edit the email below.

create table if not exists public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'contributor' check (role in ('admin', 'contributor')),
  auto_approve boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.members enable row level security;       -- no policies, no grants: only the functions below touch it
revoke all on public.members from anon, authenticated;

do $$ begin
  if to_regclass('public.admins') is not null then
    insert into public.members (user_id, role, auto_approve) select user_id, 'admin', true from public.admins on conflict do nothing;
  end if;
end $$;
insert into public.members (user_id, role, auto_approve)
  select id, 'admin', true from auth.users where email = 'YOUR-ADMIN-EMAIL@example.com' on conflict do nothing;

-- ───────── Who is who ─────────
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where user_id = auth.uid() and role = 'admin') $$;
create or replace function public.is_contributor() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where user_id = auth.uid()) $$;
create or replace function public.can_autoapprove() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.members where user_id = auth.uid() and (role = 'admin' or auto_approve)) $$;
create or replace function public.my_role() returns jsonb language sql stable security definer set search_path = public as
$$ select to_jsonb(m) - 'user_id' - 'created_at' from public.members m where user_id = auth.uid() $$;
grant execute on function public.is_admin(), public.is_contributor(), public.can_autoapprove(), public.my_role() to anon, authenticated;

drop table if exists public.admins;   -- replaced by members

-- ───────── Moderation columns on places and songs ─────────
alter table public.places add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));
alter table public.places add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.places add column if not exists review_note text;
alter table public.songs  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));
alter table public.songs  add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.songs  add column if not exists review_note text;
create index if not exists places_status_idx on public.places (status) where status <> 'approved';
create index if not exists songs_status_idx  on public.songs (status)  where status <> 'approved';

-- Server-side rules a contributor cannot bypass: owner is themselves; status is decided here, not by the client.
create or replace function public.enforce_submission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    if tg_op = 'INSERT' then new.owner_id := coalesce(new.owner_id, auth.uid()); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.review_note := null;
  else
    new.owner_id := old.owner_id;
    new.review_note := old.review_note;
  end if;
  new.status := case when public.can_autoapprove() then 'approved' else 'pending' end;
  return new;
end $$;
drop trigger if exists places_submission on public.places;
create trigger places_submission before insert or update on public.places for each row execute function public.enforce_submission();
drop trigger if exists songs_submission on public.songs;
create trigger songs_submission before insert or update on public.songs for each row execute function public.enforce_submission();

-- Proposed edits to approved items by contributors who are not auto-approved.
create table if not exists public.revisions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('place', 'song')),
  target_id   text not null,
  data        jsonb not null,                    -- the full proposed row, same shape as the table
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at  timestamptz not null default now()
);
create index if not exists revisions_status_idx on public.revisions (status);

-- ───────── Row security ─────────
do $$
declare t text;
begin
  foreach t in array array['places', 'songs'] loop
    execute format('drop policy if exists "read all" on public.%I', t);
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('drop policy if exists "read approved or own" on public.%I', t);
    execute format('drop policy if exists "contributor insert" on public.%I', t);
    execute format('drop policy if exists "contributor update" on public.%I', t);
    execute format('drop policy if exists "contributor delete" on public.%I', t);
    execute format('create policy "read approved or own" on public.%I for select using (status = ''approved'' or owner_id = auth.uid() or public.is_admin())', t);
    execute format('create policy "contributor insert" on public.%I for insert to authenticated with check (public.is_contributor())', t);
    execute format('create policy "contributor update" on public.%I for update to authenticated
      using (public.is_admin() or (public.is_contributor() and (public.can_autoapprove() or (owner_id = auth.uid() and status in (''pending'', ''rejected'')))))
      with check (public.is_admin() or (public.is_contributor() and (public.can_autoapprove() or owner_id = auth.uid())))', t);
    execute format('create policy "contributor delete" on public.%I for delete to authenticated
      using (public.is_admin() or (public.is_contributor() and owner_id = auth.uid() and status <> ''approved''))', t);
  end loop;
end $$;

alter table public.revisions enable row level security;
drop policy if exists "own or admin read" on public.revisions;
drop policy if exists "contributor propose" on public.revisions;
drop policy if exists "admin manage" on public.revisions;
create policy "own or admin read" on public.revisions for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy "contributor propose" on public.revisions for insert to authenticated
  with check (public.is_contributor() and owner_id = auth.uid() and status = 'pending');
create policy "admin manage" on public.revisions for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.revisions to authenticated;

-- ───────── Admin actions ─────────
create or replace function public.approve_revision(rev uuid) returns void language plpgsql security definer set search_path = public as $$
declare r public.revisions;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into r from public.revisions where id = rev and status = 'pending';
  if not found then raise exception 'revision not found or already reviewed'; end if;
  if r.kind = 'place' then
    update public.places p set name = x.name, category_id = x.category_id, district = x.district, lat = x.lat, lng = x.lng,
      description = x.description, phone = x.phone, website = x.website, approx = coalesce(x.approx, false), visited = x.visited, notes = x.notes
      from jsonb_populate_record(null::public.places, r.data) x where p.id = r.target_id;
  else
    update public.songs s set title = x.title, artist = x.artist, language = x.language, lyrics = x.lyrics, credit = x.credit
      from jsonb_populate_record(null::public.songs, r.data) x where s.id = r.target_id;
  end if;
  update public.revisions set status = 'approved' where id = rev;
end $$;

create or replace function public.list_members() returns table (user_id uuid, email text, role text, auto_approve boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query select m.user_id, u.email::text, m.role, m.auto_approve from public.members m join auth.users u on u.id = m.user_id order by m.role, u.email;
end $$;

-- The person must already exist under Authentication > Users (create them there; sign-ups stay off).
create or replace function public.add_member(p_email text, p_role text default 'contributor', p_auto boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No such user. Create them in Supabase > Authentication > Users first.'; end if;
  insert into public.members (user_id, role, auto_approve) values (uid, p_role, p_auto)
    on conflict (user_id) do update set role = excluded.role, auto_approve = excluded.auto_approve;
end $$;

create or replace function public.set_member(p_user uuid, p_role text, p_auto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own access.'; end if;
  update public.members set role = p_role, auto_approve = p_auto where user_id = p_user;
end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot remove yourself.'; end if;
  delete from public.members where user_id = p_user;
end $$;

revoke execute on function public.approve_revision(uuid), public.list_members(), public.add_member(text, text, boolean),
  public.set_member(uuid, text, boolean), public.remove_member(uuid) from public, anon;
grant execute on function public.approve_revision(uuid), public.list_members(), public.add_member(text, text, boolean),
  public.set_member(uuid, text, boolean), public.remove_member(uuid) to authenticated;

-- Check: should list your admin account.
select u.email, m.role, m.auto_approve from public.members m join auth.users u on u.id = m.user_id;
