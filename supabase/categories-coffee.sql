-- Run once in SQL Editor. Adds the "Coffee Shops" place category and switches category icons to the app's icon names.
insert into public.categories (id, label, color, icon, sort) values
  ('tourist-site', 'Tourist sites', '#c2410c', 'landmark', 0),
  ('picnic', 'Picnic spots', '#1f7a5a', 'tree-pine', 1),
  ('snacks', 'Snack spots', '#be185d', 'utensils', 2),
  ('hotel', 'Hotels', '#7c3aed', 'bed-double', 3),
  ('resort', 'Resorts', '#0369a1', 'tree-palm', 4),
  ('coffee', 'Coffee Shops', '#92400e', 'coffee', 5)
on conflict (id) do update set icon = excluded.icon;
