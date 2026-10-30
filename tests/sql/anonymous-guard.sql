-- Proves every Elphyn function refuses an anonymous session.
--
-- Anonymous sign-ins are off in production, so this creates a real anonymous
-- account inside a single statement, switches to the `authenticated` role with that
-- account's claims, and calls every function in schema public except the parked
-- Pigeon Ops ones. The statement always ends by raising an exception, so everything
-- it did is rolled back. The exception message carries the results as JSON, which
-- tests/elphyn.test.ts reads. Run it with:
--   npx supabase db query --linked -f tests/sql/anonymous-guard.sql
do $$
declare
  v_anon    uuid := gen_random_uuid();
  -- Parked Pigeon Ops functions: the friends' game never required permanent accounts.
  v_crew    text[] := array['set_display_name', 'create_circle', 'join_circle', 'create_mission', 'start_operation',
                            'reroll_mission', 'submit_debrief', 'judge_accusation', 'write_case_file',
                            'sweep_went_dark', 'game_rules'];
  v_fn      record;
  v_hint    text;
  v_state   text;
  v_results jsonb := '[]'::jsonb;
begin
  insert into auth.users (id, aud, role, is_anonymous) values (v_anon, 'authenticated', 'authenticated', true);
  insert into public.profiles (id, display_name, home_animal) values (v_anon, 'Anonymous test', 'otter');

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_anon, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  set local role authenticated;

  for v_fn in
    select p.proname,
           coalesce((select string_agg(format('null::%s', format_type(a.t, null)), ', ' order by a.ord)
                     from unnest(p.proargtypes::oid[]) with ordinality as a(t, ord)), '') as args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and not (p.proname = any (v_crew))
    order by p.proname
  loop
    begin
      execute format('select public.%I(%s)', v_fn.proname, v_fn.args);
      v_results := v_results || jsonb_build_object('fn', v_fn.proname, 'outcome', 'ALLOWED');
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint, v_state = returned_sqlstate;
      v_results := v_results || jsonb_build_object('fn', v_fn.proname, 'outcome', coalesce(nullif(v_hint, ''), v_state));
    end;
  end loop;

  raise exception 'ANON_GUARD_RESULT %', v_results::text;
end
$$;
