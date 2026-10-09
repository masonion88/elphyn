-- Every write in the app goes through one of these functions.
--
-- They run as their owner (security definer), which skips row level security,
-- so each one checks who is calling and what they are allowed to touch before
-- doing anything. search_path is empty so every name below is schema-qualified
-- and a caller can't shadow a table or function with their own.
--
-- Errors carry a machine-readable `hint` for the app and the tests; the message
-- is what the agent sees.


-- Private helpers (not reachable through the API) ------------------------------

create function private.current_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No credentials, no clearance. Sign in first.' using hint = 'not_signed_in';
  end if;
  return v_uid;
end
$$;
revoke execute on function private.current_uid() from public, anon, authenticated;

-- The caller, who must be signed in and have picked a codename.
create function private.current_agent()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_uid();
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Every agent needs a codename first.' using hint = 'no_codename';
  end if;
  return v_uid;
end
$$;
revoke execute on function private.current_agent() from public, anon, authenticated;

create function private.require_member(p_circle_id uuid, p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.circle_members cm
                 where cm.circle_id = p_circle_id and cm.user_id = p_user_id) then
    raise exception 'That circle is above your clearance.' using hint = 'not_member';
  end if;
end
$$;
revoke execute on function private.require_member(uuid, uuid) from public, anon, authenticated;

create function private.new_join_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select w[1 + floor(random() * cardinality(w))::int] || '-' || (1000 + floor(random() * 9000))::int::text
  from (select array[
    'OTTER', 'PIGEON', 'BADGER', 'FERRET', 'MOOSE', 'LLAMA', 'PANDA', 'KOALA', 'WALRUS', 'BEAVER',
    'GECKO', 'IGUANA', 'LEMUR', 'MARMOT', 'NEWT', 'OSPREY', 'PUFFIN', 'QUOKKA', 'RAVEN', 'SLOTH',
    'TAPIR', 'TOUCAN', 'WOMBAT', 'YAK', 'ZEBRA', 'BISON', 'CAMEL', 'DINGO', 'EGRET', 'FALCON',
    'GOOSE', 'HERON', 'IBIS', 'JACKAL', 'KIWI', 'LYNX', 'MANTIS', 'NARWHAL', 'OKAPI', 'PELICAN',
    'QUAIL', 'RHINO', 'SEAL', 'TURTLE', 'VOLE', 'WEASEL', 'ALPACA', 'BEETLE', 'CRANE', 'DUCK',
    'EMU', 'FOX', 'GOAT', 'HIPPO', 'IMPALA', 'MOLE', 'OWL', 'PONY', 'SQUID', 'TOAD'
  ]::text[] as w) words
$$;
revoke execute on function private.new_join_code() from public, anon, authenticated;

-- Draws a random active mission for p_agent_id to run on p_target_id.
-- Never a mission either of them wrote: the target would recognize their own
-- mission instantly. Exception: in a two-person circle the target's missions are
-- allowed, otherwise custom missions could never be drawn there. Never the agent's.
create function private.pick_mission(p_circle_id uuid, p_agent_id uuid, p_target_id uuid, p_exclude uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deck        text;
  v_pair_circle boolean;
  v_mission_id  uuid;
begin
  select c.deck into v_deck from public.circles c where c.id = p_circle_id;
  v_pair_circle := (select count(*) from public.circle_members cm where cm.circle_id = p_circle_id) = 2;

  select m.id into v_mission_id
  from public.missions m
  where m.active
    and ((m.circle_id is null and m.deck = v_deck) or m.circle_id = p_circle_id)
    and m.author_id is distinct from p_agent_id
    and (v_pair_circle or m.author_id is distinct from p_target_id)
    and m.id <> all (p_exclude)
  order by random()
  limit 1;

  if v_mission_id is null then
    raise exception 'HQ is out of missions for you two. Write some new ones.' using hint = 'deck_empty';
  end if;
  return v_mission_id;
end
$$;
revoke execute on function private.pick_mission(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;


-- Agents and circles -----------------------------------------------------------

create function public.set_display_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.current_uid();
  v_name text := btrim(p_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'Codenames are 1 to 24 characters. Pigeons have limits.' using hint = 'bad_name';
  end if;
  insert into public.profiles (id, display_name) values (v_uid, v_name)
  on conflict (id) do update set display_name = excluded.display_name;
end
$$;
revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

create function public.create_circle(p_name text, p_deck text)
returns public.circles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.current_agent();
  v_name   text := btrim(p_name);
  v_circle public.circles;
begin
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'Circle names are 1 to 40 characters.' using hint = 'bad_circle_name';
  end if;
  if p_deck is null or p_deck not in ('chaos', 'tender') then
    raise exception 'Pick a deck: chaos or tender.' using hint = 'bad_deck';
  end if;

  for attempt in 1..20 loop
    begin
      insert into public.circles (name, deck, join_code, created_by)
      values (v_name, p_deck, private.new_join_code(), v_uid)
      returning * into v_circle;
      exit;
    exception when unique_violation then
      null;  -- join code already taken: roll again
    end;
  end loop;
  if v_circle.id is null then
    raise exception 'HQ couldn''t mint a join code. Try again.' using hint = 'no_join_code';
  end if;

  insert into public.circle_members (circle_id, user_id) values (v_circle.id, v_uid);
  return v_circle;
end
$$;
revoke execute on function public.create_circle(text, text) from public, anon;
grant execute on function public.create_circle(text, text) to authenticated;

-- Forgiving about case, spaces and a missing dash: "otter 4821" works.
-- A wrong code returns null instead of raising, so the miss is recorded for the
-- throttle rather than rolled back.
create function public.join_circle(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.current_agent();
  v_clean     text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_circle_id uuid;
begin
  if (select count(*) from private.join_attempts ja
      where ja.user_id = v_uid and ja.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes. HQ is getting suspicious. Try again in an hour.'
      using hint = 'too_many_codes';
  end if;

  if v_clean ~ '^[A-Z]{3,8}[0-9]{4}$' then
    select c.id into v_circle_id
    from public.circles c
    where c.join_code = left(v_clean, -4) || '-' || right(v_clean, 4);
  end if;

  if v_circle_id is null then
    insert into private.join_attempts (user_id) values (v_uid);
    return null;
  end if;

  insert into public.circle_members (circle_id, user_id) values (v_circle_id, v_uid)
  on conflict do nothing;
  return v_circle_id;
end
$$;
revoke execute on function public.join_circle(text) from public, anon;
grant execute on function public.join_circle(text) to authenticated;

create function public.create_mission(p_circle_id uuid, p_text text, p_tier int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.current_agent();
  v_text       text := btrim(p_text);
  v_mission_id uuid;
begin
  perform private.require_member(p_circle_id, v_uid);
  if v_text is null or char_length(v_text) not between 1 and 280 then
    raise exception 'Missions are 1 to 280 characters. Brevity is a spy virtue.' using hint = 'bad_text';
  end if;
  if p_tier is null or p_tier not between 1 and 3 then
    raise exception 'Tier must be 1, 2 or 3.' using hint = 'bad_tier';
  end if;

  insert into public.missions (circle_id, deck, text, tier, author_id)
  select c.id, c.deck, v_text, p_tier, v_uid from public.circles c where c.id = p_circle_id
  returning id into v_mission_id;
  return v_mission_id;
end
$$;
revoke execute on function public.create_mission(uuid, text, int) from public, anon;
grant execute on function public.create_mission(uuid, text, int) to authenticated;


-- Operations ---------------------------------------------------------------------

-- Returns only the new operation's id. Each agent fetches their own card, which
-- row level security makes the only card they can see.
create function public.start_operation(p_circle_id uuid, p_partner_id uuid, p_call_by timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := private.current_agent();
  v_operation_id uuid;
  v_my_mission   uuid;
  v_their_mission uuid;
begin
  perform private.require_member(p_circle_id, v_uid);
  if p_partner_id is null or p_partner_id = v_uid then
    raise exception 'You can''t run an operation on yourself. We checked.' using hint = 'self_op';
  end if;
  if not exists (select 1 from public.circle_members cm
                 where cm.circle_id = p_circle_id and cm.user_id = p_partner_id) then
    raise exception 'That agent isn''t in this circle.' using hint = 'partner_not_member';
  end if;
  if p_call_by is not null and p_call_by <= now() then
    raise exception 'The call-by date has to be in the future. Time travel is a different department.'
      using hint = 'bad_call_by';
  end if;

  -- One live operation per pair per circle. The lock makes two simultaneous starts take turns.
  perform pg_advisory_xact_lock(hashtextextended(
    p_circle_id::text || least(v_uid, p_partner_id)::text || greatest(v_uid, p_partner_id)::text, 0));
  if exists (select 1 from public.operations o
             where o.circle_id = p_circle_id
               and o.status in ('briefing', 'debrief')
               and ((o.created_by = v_uid and o.partner_id = p_partner_id)
                    or (o.created_by = p_partner_id and o.partner_id = v_uid))) then
    raise exception 'You two already have an operation in progress. Finish that one first.'
      using hint = 'op_live';
  end if;

  v_my_mission    := private.pick_mission(p_circle_id, v_uid, p_partner_id, '{}');
  v_their_mission := private.pick_mission(p_circle_id, p_partner_id, v_uid, array[v_my_mission]);

  insert into public.operations (circle_id, created_by, partner_id, call_by)
  values (p_circle_id, v_uid, p_partner_id, p_call_by)
  returning id into v_operation_id;

  insert into public.assignments (operation_id, agent_id, target_id, mission_id) values
    (v_operation_id, v_uid, p_partner_id, v_my_mission),
    (v_operation_id, p_partner_id, v_uid, v_their_mission);

  return v_operation_id;
end
$$;
revoke execute on function public.start_operation(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.start_operation(uuid, uuid, timestamptz) to authenticated;

-- The veto: one reroll per agent per operation, only before anyone has debriefed.
create function public.reroll_mission(p_operation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := private.current_agent();
  v_operation     public.operations;
  v_card          public.assignments;
  v_their_mission uuid;
begin
  select * into v_card from public.assignments a
  where a.operation_id = p_operation_id and a.agent_id = v_uid;
  if v_card.id is null then
    raise exception 'That operation isn''t yours to touch.' using hint = 'not_your_op';
  end if;

  -- Lock the operation so both agents rerolling at once can't draw the same card.
  select * into v_operation from public.operations o where o.id = p_operation_id for update;
  select * into v_card from public.assignments a where a.id = v_card.id;

  if v_operation.status <> 'briefing' or v_card.submitted_at is not null then
    raise exception 'Too late to veto. The call already happened.' using hint = 'too_late';
  end if;
  if v_card.rerolled then
    raise exception 'You already used your veto. This card is yours, agent.' using hint = 'veto_used';
  end if;

  select a.mission_id into v_their_mission from public.assignments a
  where a.operation_id = p_operation_id and a.agent_id = v_card.target_id;

  update public.assignments
  set mission_id = private.pick_mission(v_operation.circle_id, v_uid, v_card.target_id,
                                        array_remove(array[v_card.mission_id, v_their_mission], null)),
      rerolled = true
  where id = v_card.id;
end
$$;
revoke execute on function public.reroll_mission(uuid) from public, anon;
grant execute on function public.reroll_mission(uuid) to authenticated;

-- Returns the operation's status afterwards: 'debrief' while waiting for the other
-- agent, 'revealed' once both have filed. A late debrief on a went_dark operation
-- still counts: it stays went_dark until the second debrief reveals it.
create function public.submit_debrief(p_operation_id uuid, p_completed boolean, p_accused_decoy boolean, p_accusation text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.current_agent();
  v_status     text;
  v_card       public.assignments;
  v_accusation text := nullif(btrim(p_accusation), '');
begin
  select * into v_card from public.assignments a
  where a.operation_id = p_operation_id and a.agent_id = v_uid;
  if v_card.id is null then
    raise exception 'That operation isn''t yours to touch.' using hint = 'not_your_op';
  end if;

  -- Lock the operation so two simultaneous debriefs can't both miss the reveal.
  select o.status into v_status from public.operations o where o.id = p_operation_id for update;
  select * into v_card from public.assignments a where a.id = v_card.id;

  if v_card.submitted_at is not null or v_status = 'revealed' then
    raise exception 'Your debrief is already filed. No take-backs.' using hint = 'already_filed';
  end if;
  if p_completed is null or p_accused_decoy is null then
    raise exception 'Answer every question in the debrief.' using hint = 'bad_answer';
  end if;
  if p_accused_decoy then
    v_accusation := null;
  elsif v_accusation is null then
    raise exception 'Name their mission, or accuse them of having none.' using hint = 'need_accusation';
  elsif char_length(v_accusation) > 280 then
    raise exception 'Accusations are 280 characters max. Be cutting, not long.' using hint = 'bad_text';
  end if;

  update public.assignments
  set completed = p_completed,
      accused_decoy = p_accused_decoy,
      accusation_text = v_accusation,
      submitted_at = now()
  where id = v_card.id;

  if exists (select 1 from public.assignments a
             where a.operation_id = p_operation_id and a.submitted_at is null) then
    if v_status = 'briefing' then
      update public.operations set status = 'debrief' where id = p_operation_id;
      return 'debrief';
    end if;
    return v_status;
  end if;

  -- Both agents have filed: reveal everything.
  update public.operations set status = 'revealed', revealed_at = now() where id = p_operation_id;

  -- "I think they had no mission" can't catch a real mission, so those verdicts are automatic.
  update public.assignments a
  set caught = false
  where a.operation_id = p_operation_id
    and not a.is_decoy
    and exists (select 1 from public.assignments acc
                where acc.operation_id = p_operation_id
                  and acc.agent_id = a.target_id
                  and acc.accused_decoy);

  return 'revealed';
end
$$;
revoke execute on function public.submit_debrief(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.submit_debrief(uuid, boolean, boolean, text) to authenticated;

-- After the reveal, each agent rules on whether the accusation against them caught
-- their mission. Honor system, and they can change their mind.
create function public.judge_accusation(p_operation_id uuid, p_caught boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := private.current_agent();
  v_card          public.assignments;
  v_status        text;
  v_accused_decoy boolean;
begin
  select * into v_card from public.assignments a
  where a.operation_id = p_operation_id and a.agent_id = v_uid;
  if v_card.id is null then
    raise exception 'That operation isn''t yours to touch.' using hint = 'not_your_op';
  end if;
  select o.status into v_status from public.operations o where o.id = p_operation_id;
  if v_status <> 'revealed' then
    raise exception 'Not yet. Both agents have to debrief before the reveal.' using hint = 'not_revealed';
  end if;
  if p_caught is null then
    raise exception 'Caught or not caught? HQ needs a verdict.' using hint = 'bad_answer';
  end if;

  select acc.accused_decoy into v_accused_decoy from public.assignments acc
  where acc.operation_id = p_operation_id and acc.agent_id = v_card.target_id;
  if v_card.is_decoy or v_accused_decoy then
    raise exception 'They accused you of having no mission, so there''s nothing to judge.'
      using hint = 'nothing_to_judge';
  end if;

  update public.assignments set caught = p_caught where id = v_card.id;
end
$$;
revoke execute on function public.judge_accusation(uuid, boolean) from public, anon;
grant execute on function public.judge_accusation(uuid, boolean) to authenticated;

create function public.write_case_file(p_operation_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.current_agent();
  v_card   public.assignments;
  v_status text;
  v_text   text := btrim(p_text);
begin
  select * into v_card from public.assignments a
  where a.operation_id = p_operation_id and a.agent_id = v_uid;
  if v_card.id is null then
    raise exception 'That operation isn''t yours to touch.' using hint = 'not_your_op';
  end if;
  select o.status into v_status from public.operations o where o.id = p_operation_id;
  if v_status <> 'revealed' then
    raise exception 'Not yet. Both agents have to debrief before the reveal.' using hint = 'not_revealed';
  end if;
  if v_text is null or char_length(v_text) not between 1 and 200 then
    raise exception 'A case file is one line: 1 to 200 characters.' using hint = 'bad_text';
  end if;

  update public.assignments set case_file = v_text where id = v_card.id;
end
$$;
revoke execute on function public.write_case_file(uuid, text) from public, anon;
grant execute on function public.write_case_file(uuid, text) to authenticated;

-- Marks this circle's overdue operations as went_dark. The circle page calls it on
-- load, so the shame is always up to date when anyone looks. Returns how many went dark.
create function public.sweep_went_dark(p_circle_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.current_agent();
  v_count int;
begin
  perform private.require_member(p_circle_id, v_uid);
  update public.operations o
  set status = 'went_dark'
  where o.circle_id = p_circle_id
    and o.status in ('briefing', 'debrief')
    and o.call_by < now();
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke execute on function public.sweep_went_dark(uuid) from public, anon;
grant execute on function public.sweep_went_dark(uuid) to authenticated;
