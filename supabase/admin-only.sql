-- Run once in SQL Editor. Only users listed in public.admins may change data, even if other accounts exist.
-- 1) EDIT THE EMAIL BELOW to your admin login, then run the whole file.

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;   -- no policies and no grants: not readable or writable from the app
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
grant execute on function public.is_admin() to anon, authenticated;

insert into public.admins (user_id)
  select id from auth.users where email = 'CHANGE-ME@example.com'
  on conflict do nothing;

-- Replace the "any signed-in user" write policy with "admins only".
do $$
declare t text;
begin
  foreach t in array array['states','categories','places','songs','items'] loop
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Check: should list exactly your admin account.
select u.email from public.admins a join auth.users u on u.id = a.user_id;
