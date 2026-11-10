-- Security fixes found in the audit. Run once in SQL Editor, AFTER schema.sql, contributors.sql and hardening.sql
-- (and after add-manipuri-songs.sql if you use it). Safe to re-run.
--
--  1. Edit proposals are validated when they are made, and each person may have only a few waiting
--  2. Each contributor may have only a limited number of places / songs waiting for review
--  3. The "trusted" rule in enforce_submission only applies to the SQL editor / service role, never to the public API
--  4. Phone numbers: digits and phone punctuation only (existing rows are not re-checked)
--
-- Also check in Supabase > Authentication > Providers/Sign-in: "Allow new users to sign up" should be OFF,
-- and turn on CAPTCHA (Attack Protection) together with VITE_TURNSTILE_SITE_KEY.

-- ───────── 1. Validated, limited edit proposals ─────────
create or replace function public.propose_revision(p_kind text, p_target text, p_data jsonb, p_base timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare ok boolean; waiting int;
begin
  if not public.is_contributor() then raise exception 'Only approved contributors can propose changes.'; end if;
  if p_kind not in ('place', 'song') then raise exception 'Unknown kind.'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Invalid proposal.'; end if;
  if pg_column_size(p_data) > 60000 then raise exception 'That proposal is too large.'; end if;

  -- The item must exist and be live.
  if p_kind = 'place' then select exists (select 1 from public.places where id = p_target and status = 'approved') into ok;
  else select exists (select 1 from public.songs where id = p_target and status = 'approved') into ok; end if;
  if not ok then raise exception 'That item does not exist or is not live.'; end if;

  -- Same size limits as the tables themselves, checked now instead of when the admin approves.
  if p_kind = 'place' then
    if length(coalesce(p_data->>'name', '')) not between 1 and 120 or length(coalesce(p_data->>'district', '')) > 60
       or length(coalesce(p_data->>'description', '')) > 1000 or length(coalesce(p_data->>'notes', '')) > 2000
       or length(coalesce(p_data->>'phone', '')) > 40 or length(coalesce(p_data->>'website', '')) > 300
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

-- ───────── 2 + 3. Submission rules ─────────
create or replace function public.enforce_submission() returns trigger language plpgsql security definer set search_path = public as $$
declare waiting int;
begin
  -- No signed-in user AND not the public API (anon / authenticated roles): the SQL editor or service role. Trusted.
  if auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated') then return new; end if;
  if public.is_admin() then
    if tg_op = 'INSERT' then new.owner_id := coalesce(new.owner_id, auth.uid()); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.review_note := null;
    if not public.can_autoapprove() then
      execute format('select count(*) from public.%I where owner_id = $1 and status = ''pending''', tg_table_name) into waiting using auth.uid();
      if waiting >= 50 then raise exception 'You already have 50 submissions waiting for review. Wait for the admin to review them.'; end if;
    end if;
  else
    new.owner_id := old.owner_id;
    new.review_note := old.review_note;
  end if;
  new.status := case when public.can_autoapprove() then 'approved' else 'pending' end;
  return new;
end $$;

-- ───────── 4. Phone format ─────────
alter table public.places drop constraint if exists places_phone_format;
alter table public.places add constraint places_phone_format check (phone is null or phone ~ '^[0-9+()./ -]*$') not valid;
