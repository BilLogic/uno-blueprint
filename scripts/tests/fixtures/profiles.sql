-- Test setup for the profile live test, on top of the committed sample seed.
-- Login accounts for the three placeholder people in
-- supabase/pilot/profiles.example.json, as a person would create them in the
-- Supabase dashboard; the pilot seed then links profiles to them by email.
-- Synthetic people only.
insert into auth.users (id, email) values
  ('c0000000-0000-4000-8000-000000000001', 'consultant@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'Owner@Example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'expert@example.test');
