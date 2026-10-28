-- Adds the 18 Manipuri songs (titles only, lyrics empty). Run once in SQL Editor. Safe to re-run.
-- Add each song's lyrics later in the app: sign in > Songs > open a song > Edit.

-- 1) Make SQL-editor changes count as the owner's. Without this the approval rules would see these inserts as an
--    unapproved contributor's and hide the songs until reviewed. Visitors and contributors are unaffected: they
--    always have a user id, and visitors cannot write at all.
create or replace function public.enforce_submission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- the SQL editor / service role: trusted
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

-- 2) The songs (language: Manipuri (Meiteilon), status: approved)
insert into public.songs (id, title, artist, language, lyrics, credit, status) values
  ('mensinba-ngamdraba',        'Mensinba ngamdraba',        null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('mitsum-laiwa',              'Mitsum laiwa',              null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('koithumlaba-khonjel',       'Koithumlaba khonjel',       null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('segaira-thamoigi',          'Segaira thamoigi',          null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('tamna-tamna',               'Tamna Tamna',               null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('lapthokhro',                'Lapthokhro',                null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('eibu-nungshiba-tambiriba',  'Eibu nungshiba tambiriba',  null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('nongma-lakke',              'Nongma lakke',              null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('kari-haiu-haibage',         'Kari haiu haibage',         'Raju Nong',  'Manipuri (Meiteilon)', '', null, 'approved'),
  ('khajaigi-dimple',           'Khajaigi Dimple',           null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('ngarang-eigi-manglan',      'Ngarang Eigi Manglan',      null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('mitchina-toina-yenglakpa',  'Mitchina Toina yenglakpa',  null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('cheklagum',                 'Cheklagum',                 null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('chingi-leirang',            'Chingi leirang',            null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('lamna-tamnaraga',           'Lamna tamnaraga',           null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('matam-chuppada',            'Matam chuppada',            null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('leishak-leichu-henbi',      'Leishak leichu henbi',      null,         'Manipuri (Meiteilon)', '', null, 'approved'),
  ('ho-nongdamba',              'Ho Nongdamba',              null,         'Manipuri (Meiteilon)', '', null, 'approved')
on conflict (id) do nothing;

-- Check: should show Manipuri (Meiteilon) = 18, and the original Scots / English song = 1
select language, count(*) as songs, count(*) filter (where status = 'approved') as live from public.songs group by language order by language;
