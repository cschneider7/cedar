-- Seed data for local development, run automatically by `supabase start`
-- and `supabase db reset`. Never applied to the remote project.

-- Dev user matching SUPABASE_AUTH_TEST_EMAIL/SUPABASE_AUTH_TEST_PASSWORD in
-- .env.example, so the seeded classrooms/students below are immediately
-- visible after signing in locally. The extra token columns are set to ''
-- rather than left NULL, matching GoTrue's expectations for those fields.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'devtest@example.com',
  crypt('jailbreak-coastland-plug4', gen_salt('bf')),
  now(),
  now(),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{}'
) on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"devtest@example.com"}',
  'email',
  now(),
  now()
) on conflict (provider_id, provider) do nothing;

-- Starter classrooms
insert into public.classrooms (id, user_id, subject, period, term_season, term_year)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Algebra I', 1, 'fall', 2026),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'World History', 3, 'fall', 2026)
on conflict (id) do nothing;

-- Starter students
insert into public.students (id, user_id, classroom_id, student_id, name)
values
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 1, 'Ava Thompson'),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 2, 'Noah Martinez'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 3, 'Mia Chen'),
  ('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', null, 4, 'Liam Patel')
on conflict (id) do nothing;
