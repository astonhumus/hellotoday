-- Security and robustness fixes. Run once in SQL Editor, after contributors.sql. Safe to re-run.
--
--  1. Size limits on every text field (stops one account filling the free database)
--  2. Hides contributors' internal user IDs from the public
--  3. Edit proposals: one pending proposal per person per item, and approval refuses to overwrite
--     an item that was changed after the proposal was made

-- ───────── 1. Size limits ─────────
alter table public.places drop constraint if exists places_limits;
alter table public.places add constraint places_limits check (
  length(coalesce(district, '')) <= 60 and length(coalesce(description, '')) <= 1000 and length(coalesce(notes, '')) <= 2000 and
  length(coalesce(phone, '')) <= 40 and length(coalesce(website, '')) <= 300 and length(coalesce(review_note, '')) <= 300);

alter table public.songs drop constraint if exists songs_limits;
alter table public.songs add constraint songs_limits check (
  length(coalesce(artist, '')) <= 80 and length(coalesce(language, '')) <= 40 and length(lyrics) <= 20000 and
  length(coalesce(credit, '')) <= 300 and length(coalesce(review_note, '')) <= 300);

alter table public.items drop constraint if exists items_limits;
alter table public.items add constraint items_limits check (data is null or pg_column_size(data) <= 5000);

alter table public.revisions drop constraint if exists revisions_limits;
alter table public.revisions add constraint revisions_limits check (pg_column_size(data) <= 60000 and length(coalesce(review_note, '')) <= 300);

-- ───────── 2. Hide owner_id from the public ─────────
-- Everyone can still read places and songs, just not who submitted them. Signed-in users keep full access.
-- If anything on the public site stops loading after this, undo with:
--   grant select on public.places, public.songs to anon;
revoke select on public.places, public.songs from anon;
grant select (id, state_id, category_id, name, district, lat, lng, description, phone, website, approx, visited, notes, status, review_note, created_at, updated_at)
  on public.places to anon;
grant select (id, title, artist, language, lyrics, credit, status, review_note, created_at, updated_at)
  on public.songs to anon;

-- ───────── 3. Edit proposals ─────────
alter table public.revisions add column if not exists base_updated_at timestamptz;   -- the item's updated_at when the proposal was made

-- Only the function below may create proposals (it replaces the person's earlier pending proposal for the same item).
drop policy if exists "contributor propose" on public.revisions;
revoke insert on public.revisions from authenticated;
create unique index if not exists revisions_one_pending on public.revisions (owner_id, kind, target_id) where status = 'pending';

create or replace function public.propose_revision(p_kind text, p_target text, p_data jsonb, p_base timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_contributor() then raise exception 'Only approved contributors can propose changes.'; end if;
  if p_kind not in ('place', 'song') then raise exception 'Unknown kind.'; end if;
  if pg_column_size(p_data) > 60000 then raise exception 'That proposal is too large.'; end if;
  delete from public.revisions where owner_id = auth.uid() and kind = p_kind and target_id = p_target and status = 'pending';
  insert into public.revisions (kind, target_id, data, owner_id, base_updated_at) values (p_kind, p_target, p_data, auth.uid(), p_base);
end $$;
revoke execute on function public.propose_revision(text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.propose_revision(text, text, jsonb, timestamptz) to authenticated;

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
      description = x.description, phone = x.phone, website = x.website, approx = coalesce(x.approx, false), visited = x.visited, notes = x.notes
      from jsonb_populate_record(null::public.places, r.data) x where p.id = r.target_id;
  else
    update public.songs s set title = x.title, artist = x.artist, language = x.language, lyrics = x.lyrics, credit = x.credit
      from jsonb_populate_record(null::public.songs, r.data) x where s.id = r.target_id;
  end if;
  update public.revisions set status = 'approved' where id = rev;
end $$;

-- ───────── Checks (read the results) ─────────
-- Lists what the public may read. owner_id must NOT appear:
select table_name, string_agg(column_name, ', ' order by column_name) as columns_anon_can_read
from information_schema.column_privileges
where grantee = 'anon' and table_schema = 'public' and table_name in ('places', 'songs') and privilege_type = 'SELECT'
group by table_name;
