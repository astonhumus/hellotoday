-- Featured places: the ones an admin or contributor chooses to show on the home page (nothing is featured automatically).
-- Run once in the SQL Editor, AFTER address.sql. Safe to re-run.
-- Until this is run the app still works: the home page then shows no featured places, and the choice isn't stored.

alter table public.places add column if not exists featured boolean not null default false;
grant select (featured) on public.places to anon;
create index if not exists places_featured_idx on public.places (state_id) where featured;

-- Edit proposals carry the address and the featured choice too; approval copies them.
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
      photo = x.photo, hours = x.hours, fee = x.fee, season = x.season, address = x.address,
      featured = coalesce(x.featured, p.featured),
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
