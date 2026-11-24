-- PULSE Starter Groups Seed (idempotent)
insert into public.groups (id, name, kind, group_dance_ids)
values
  ('mcgill-friday-night-crew', 'McGill Friday Night Crew', 'friends', array['dance4']),
  ('montreal-dancers', 'Montreal Dancers', 'city', array['dance4']),
  ('hip-hop-choreo', 'Hip-Hop Choreo', 'dance_type', array['dance4'])
on conflict (id) do nothing;
