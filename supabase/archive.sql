-- Closing / archiving places. Run once in SQL Editor, AFTER schema.sql, contributors.sql, hardening.sql and fixes.sql. Safe to re-run.
-- Run this BEFORE deploying the matching app version: the app asks for the new columns.
--
--  closure = null          open (normal)
--  closure = 'temporary'   temporarily closed: still listed and on the map, with a "temporarily closed" notice
--  closure = 'permanent'   permanently closed = archived: hidden from the public (lists, map, search, share pages);
--                          admins and approved contributors still see it and can reopen it
-- Who may change it follows the normal rules: admins and trusted contributors directly, other contributors as an edit proposal.

alter table public.places add column if not exists closure text check (closure in ('temporary', 'permanent'));
alter table public.places add column if not exists closure_note text;     -- the reason, e.g. "flood damage, reopens in March"
alter table public.places add column if not exists closed_on date;        -- when it was closed (set by the app)
alter table public.places drop constraint if exists places_closure_limits;
alter table public.places add constraint places_closure_limits check (length(coalesce(closure_note, '')) <= 300);
create index if not exists places_closure_idx on public.places (closure) where closure is not null;

-- The public may read the new columns (anon only has column-level access, see hardening.sql).
grant select (closure, closure_note, closed_on) on public.places to anon;

-- Permanently closed places are visible only to admins and approved contributors (and the owner).
drop policy if exists "read approved or own" on public.places;
create policy "read approved or own" on public.places for select using (
  (status = 'approved' and (closure is distinct from 'permanent' or public.is_contributor()))
  or owner_id = auth.uid() or public.is_admin());

-- Edit proposals may carry the closure fields; approval copies them too.
create or replace function public.approve_revision(rev uuid) returns void language plpgsql security definer set search_path = public as $$
declare r public.revisions; current_stamp timestamptz;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into r from public.revisions where id = rev and status = 'pending';
  if not found then raise exception 'revision not found or already reviewed'; end if;

  if r.kind = 'place' then select updated_at into current_stamp from public.places where id = r.target_id;
  else select updated_at into current_stamp from public.songs where id = r.target_id; end if;
  if current_stamp is null then raise exception 'The original item no longer exists.'; end if;
  if r.base_updated_at is not null and current_stamp > r.base_updated_at then
    raise exception 'This item was changed after the proposal was made. Reject it and ask the contributor to edit again.';
  end if;

  if r.kind = 'place' then
    update public.places p set name = x.name, category_id = x.category_id, district = x.district, lat = x.lat, lng = x.lng,
      description = x.description, phone = x.phone, website = x.website, approx = coalesce(x.approx, false), visited = x.visited, notes = x.notes,
      -- only when the proposal is about closing / reopening: an ordinary edit leaves the closure as it is
      closure = case when r.data ? 'closure' then x.closure else p.closure end,
      closure_note = case when r.data ? 'closure' then x.closure_note else p.closure_note end,
      closed_on = case when r.data ? 'closure' then x.closed_on else p.closed_on end
      from jsonb_populate_record(null::public.places, r.data) x where p.id = r.target_id;
  else
    update public.songs s set title = x.title, artist = x.artist, language = x.language, lyrics = x.lyrics, credit = x.credit
      from jsonb_populate_record(null::public.songs, r.data) x where s.id = r.target_id;
  end if;
  update public.revisions set status = 'approved' where id = rev;
end $$;
revoke execute on function public.approve_revision(uuid) from public, anon;
grant execute on function public.approve_revision(uuid) to authenticated;

create or replace function public.propose_revision(p_kind text, p_target text, p_data jsonb, p_base timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare ok boolean; waiting int;
begin
  if not public.is_contributor() then raise exception 'Only approved contributors can propose changes.'; end if;
  if p_kind not in ('place', 'song') then raise exception 'Unknown kind.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid proposal.'; end if;
  if pg_column_size(p_data) > 60000 then raise exception 'That proposal is too large.'; end if;

  -- A temporarily or permanently closed item may still be edited, e.g. to reopen it.
  if p_kind = 'place' then select exists (select 1 from public.places where id = p_target and status = 'approved') into ok;
  else select exists (select 1 from public.songs where id = p_target and status = 'approved') into ok; end if;
  if not ok then raise exception 'That item does not exist or is not live.'; end if;

  if p_kind = 'place' then
    if length(coalesce(p_data->>'name', '')) not between 1 and 120 or length(coalesce(p_data->>'district', '')) > 60
       or length(coalesce(p_data->>'description', '')) > 1000 or length(coalesce(p_data->>'notes', '')) > 2000
       or length(coalesce(p_data->>'phone', '')) > 40 or length(coalesce(p_data->>'website', '')) > 300
       or length(coalesce(p_data->>'closure_note', '')) > 300
       or coalesce(p_data->>'closure', 'open') not in ('open', 'temporary', 'permanent')
       or (coalesce(p_data->>'website', '') <> '' and p_data->>'website' !~* '^https?://') then
      raise exception 'One of the values is too long or not allowed.';
    end if;
  else
    if length(coalesce(p_data->>'title', '')) not between 1 and 120 or length(coalesce(p_data->>'artist', '')) > 80
       or length(coalesce(p_data->>'language', '')) > 40 or length(coalesce(p_data->>'lyrics', '')) > 20000
       or length(coalesce(p_data->>'credit', '')) > 300 then
      raise exception 'One of the values is too long or not allowed.';
    end if;
  end if;

  delete from public.revisions where owner_id = auth.uid() and kind = p_kind and target_id = p_target and status = 'pending';
  select count(*) into waiting from public.revisions where owner_id = auth.uid() and status = 'pending';
  if waiting >= 20 and not public.is_admin() then raise exception 'You already have 20 proposals waiting. Wait for the admin to review them.'; end if;
  insert into public.revisions (kind, target_id, data, owner_id, base_updated_at) values (p_kind, p_target, p_data, auth.uid(), p_base);
end $$;
revoke execute on function public.propose_revision(text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.propose_revision(text, text, jsonb, timestamptz) to authenticated;

-- Region counts: include places that have no district too (they were left out, so a region could show one place fewer).
create or replace view public.place_districts with (security_invoker = true) as
  select state_id, district, count(*)::int as places from public.places group by state_id, district order by district;
grant select on public.place_districts to anon, authenticated;
