-- Seed data for local development

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
  ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-111111111111', 'Consumer Math', 2, 'fall', 2026),
  ('22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-111111111111', 'Math 2', 3, 'fall', 2026);

-- Starter students
insert into public.students (id, user_id, classroom_id, student_id, name)
values
  ('33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 1, 'Bob Burger'),
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 2, 'Jo Junior'),
  ('33333333-3333-3333-3333-000000000003', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 3, 'Addie'),
  ('33333333-3333-3333-3333-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 4, 'Freddie'),
  ('33333333-3333-3333-3333-000000000005', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 5, 'Teddy'),
  ('33333333-3333-3333-3333-000000000006', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 6, 'Spongebob Squarepants'),
  ('33333333-3333-3333-3333-000000000007', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 7, 'Patrick Star'),
  ('33333333-3333-3333-3333-000000000008', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 8, 'Squidward Tentacles'),
  ('33333333-3333-3333-3333-000000000009', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 9, 'Casey Schneider'),
  ('33333333-3333-3333-3333-000000000999', '11111111-1111-1111-1111-111111111111', null, 999, 'Unassigned Student');
