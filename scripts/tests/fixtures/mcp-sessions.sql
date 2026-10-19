-- Private conversations for the MCP boundary test, only in its scratch DB.
insert into public.agent_sessions (id, created_by, title) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'First private session'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002', 'Second private session');
insert into public.agent_messages (session_id, seq, kind, payload) values
  ('d0000000-0000-4000-8000-000000000001', 0, 'user', '{"kind":"user","text":"The first private fact."}'),
  ('d0000000-0000-4000-8000-000000000002', 0, 'user', '{"kind":"user","text":"The second private fact."}');
