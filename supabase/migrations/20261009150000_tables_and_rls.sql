-- Pigeon Ops: tables, grants and row level security.
--
-- House rule: browsers may only SELECT. Every write goes through a function in
-- 20261009150300_functions.sql. Each object's revokes and grants sit right
-- next to the object, so nothing depends on a later migration to be locked down.

create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;  -- only so policies can call private.my_circle_ids()


-- Agents -------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  created_at   timestamptz not null default now()
);
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
alter table public.profiles enable row level security;


-- Circles --------------------------------------------------------------------

create table public.circles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  deck       text not null check (deck in ('chaos', 'tender')),
  join_code  text not null unique check (join_code ~ '^[A-Z]{3,8}-[0-9]{4}$'),  -- OTTER-4821
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
revoke all on table public.circles from anon, authenticated;
grant select on table public.circles to authenticated;
alter table public.circles enable row level security;

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id   uuid not null references public.profiles (id),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index circle_members_user_id_idx on public.circle_members (user_id);
revoke all on table public.circle_members from anon, authenticated;
grant select on table public.circle_members to authenticated;
alter table public.circle_members enable row level security;


-- Missions -------------------------------------------------------------------

create table public.missions (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid references public.circles (id) on delete cascade,  -- null = built-in
  deck       text not null check (deck in ('chaos', 'tender')),
  text       text not null check (char_length(btrim(text)) between 1 and 280),
  tier       smallint not null check (tier between 1 and 3),           -- 1 easy, 2 spicy, 3 legendary
  author_id  uuid references public.profiles (id),                     -- null = built-in
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  check ((circle_id is null) = (author_id is null))
);
-- Lets supabase/seed/decks.sql upsert built-ins by their wording.
create unique index missions_builtin_key on public.missions (deck, text) where circle_id is null;
create index missions_circle_id_idx on public.missions (circle_id);
create index missions_author_id_idx on public.missions (author_id);
revoke all on table public.missions from anon, authenticated;
grant select on table public.missions to authenticated;
alter table public.missions enable row level security;


-- Operations and cards -------------------------------------------------------

create table public.operations (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles (id) on delete cascade,
  created_by  uuid not null references public.profiles (id),  -- agent #1
  partner_id  uuid not null references public.profiles (id),  -- agent #2
  status      text not null default 'briefing'
              check (status in ('briefing', 'debrief', 'revealed', 'went_dark')),
  call_by     timestamptz,                                    -- end of the chosen day, starter's timezone
  created_at  timestamptz not null default now(),
  revealed_at timestamptz,
  check (created_by <> partner_id),
  check ((status = 'revealed') = (revealed_at is not null))
);
create index operations_circle_id_status_idx on public.operations (circle_id, status);
revoke all on table public.operations from anon, authenticated;
grant select on table public.operations to authenticated;
alter table public.operations enable row level security;

create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  operation_id    uuid not null references public.operations (id) on delete cascade,
  agent_id        uuid not null references public.profiles (id),
  target_id       uuid not null references public.profiles (id),
  mission_id      uuid references public.missions (id),  -- null iff decoy
  is_decoy        boolean not null default false,        -- always false until Phase 2
  rerolled        boolean not null default false,
  completed       boolean,                               -- set at debrief
  accusation_text text check (char_length(btrim(accusation_text)) between 1 and 280),
  accused_decoy   boolean,                               -- true = "I think they had no mission"
  submitted_at    timestamptz,
  caught          boolean,                               -- judged by this agent after the reveal
  case_file       text check (char_length(btrim(case_file)) between 1 and 200),
  unique (operation_id, agent_id),
  check (agent_id <> target_id),
  check (is_decoy = (mission_id is null)),
  check (submitted_at is null or (completed is not null and accused_decoy is not null
                                  and accused_decoy = (accusation_text is null)))
);
create index assignments_agent_id_idx on public.assignments (agent_id);
create index assignments_mission_id_idx on public.assignments (mission_id);
revoke all on table public.assignments from anon, authenticated;
grant select on table public.assignments to authenticated;
alter table public.assignments enable row level security;


-- Wrong join codes, for the 10-per-hour throttle. Only functions touch this.
create table private.join_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_idx on private.join_attempts (user_id, attempted_at);
revoke all on table private.join_attempts from public, anon, authenticated;
alter table private.join_attempts enable row level security;  -- and no policies: nobody gets in


-- Policies -------------------------------------------------------------------

-- Runs as its owner so policies can read circle_members without recursing into
-- circle_members' own policy.
create function private.my_circle_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.circle_id from public.circle_members cm where cm.user_id = (select auth.uid())
$$;
revoke execute on function private.my_circle_ids() from public, anon;
grant execute on function private.my_circle_ids() to authenticated;

create policy "you and your circlemates"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select cm.user_id from public.circle_members cm
              where cm.circle_id in (select private.my_circle_ids()))
  );

create policy "your circles"
  on public.circles for select to authenticated
  using (id in (select private.my_circle_ids()));

create policy "your circles' rosters"
  on public.circle_members for select to authenticated
  using (circle_id in (select private.my_circle_ids()));

create policy "your circles' operations"
  on public.operations for select to authenticated
  using (circle_id in (select private.my_circle_ids()));

-- The heart of the game: before the reveal you see only your own card.
create policy "your card, or revealed cards in your circles"
  on public.assignments for select to authenticated
  using (
    agent_id = (select auth.uid())
    or operation_id in (select o.id from public.operations o
                        where o.status = 'revealed'
                          and o.circle_id in (select private.my_circle_ids()))
  );

-- The subquery on assignments is itself filtered by the policy above, so you can
-- read a mission only if you wrote it or it's on a card you're allowed to see.
create policy "missions you wrote or can see on a card"
  on public.missions for select to authenticated
  using (
    author_id = (select auth.uid())
    or id in (select a.mission_id from public.assignments a)
  );
