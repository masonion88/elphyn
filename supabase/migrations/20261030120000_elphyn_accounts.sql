-- Elphyn, Phase A: permanent accounts, profiles, notification settings, couple circles.
--
-- House rules carry over from Pigeon Ops: browsers only SELECT, every write is a
-- security-definer function that checks its caller, and each object's grants sit
-- next to it. One more rule for Elphyn: anonymous users also get the
-- `authenticated` role, so "signed in" isn't enough. Every Elphyn function starts
-- with private.require_permanent(), which refuses anonymous sessions.


-- The caller, who must be signed in with a permanent (non-anonymous) account.
-- Checks both the session's claim and the account itself.
create function private.require_permanent()
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
    raise exception 'Sign in first.' using hint = 'not_signed_in';
  end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false)
     or (select u.is_anonymous from auth.users u where u.id = v_uid) is not false then
    raise exception 'Elphyn needs a real account. Sign in with your email.' using hint = 'not_permanent';
  end if;
  return v_uid;
end
$$;
revoke execute on function private.require_permanent() from public, anon, authenticated;

-- A permanent caller who has also set up a profile.
create function private.require_member_profile()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permanent();
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Tell Elphyn your name first.' using hint = 'no_profile';
  end if;
  return v_uid;
end
$$;
revoke execute on function private.require_member_profile() from public, anon, authenticated;


-- Profiles: what your partner sees ------------------------------------------------

alter table public.profiles
  add column home_animal text check (char_length(btrim(home_animal)) between 1 and 24),
  add column timezone    text not null default 'America/New_York';


-- Notification settings: only you can see these ----------------------------------

-- Every notification type Elphyn can send. Switches and the outbox accept only these.
create function private.notification_types()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['partner_joined', 'test', 'bid', 'jar', 'letter', 'letter_unlock',
               'moment', 'moment_answered', 'hypothetical', 'hypothetical_answered', 'countdown']
$$;
revoke execute on function private.notification_types() from public, anon, authenticated;

create table public.notification_prefs (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  quiet_start    time not null default '00:00',
  quiet_end      time not null default '08:00',    -- equal start and end means no quiet hours
  disabled_types text[] not null default '{}',     -- every type is on unless listed here
  read_receipts  boolean not null default false,
  updated_at     timestamptz not null default now()
);
revoke all on table public.notification_prefs from anon, authenticated;
grant select on table public.notification_prefs to authenticated;
alter table public.notification_prefs enable row level security;

create policy "your own notification settings"
  on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));


-- Couple circles: exactly two people, and one couple per person -------------------

alter table public.circles
  add column kind text not null default 'crew' check (kind in ('crew', 'couple')),
  alter column join_code drop not null,
  -- Crew circles keep their OTTER-4821 codes. Couples join only with a single-use invite.
  add constraint circles_join_code_by_kind check ((kind = 'crew') = (join_code is not null));

create function private.enforce_couple_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.circle_members m
             where m.circle_id = new.circle_id and m.user_id = new.user_id) then
    return new;  -- already a member: the caller's ON CONFLICT handles it
  end if;
  -- Lock the circle so two people joining at the same moment take turns.
  perform 1 from public.circles c where c.id = new.circle_id for update;
  if (select c.kind from public.circles c where c.id = new.circle_id) = 'couple' then
    if (select count(*) from public.circle_members m where m.circle_id = new.circle_id) >= 2 then
      raise exception 'This pair is already complete.' using hint = 'couple_full';
    end if;
    if exists (select 1 from public.circle_members m join public.circles c on c.id = m.circle_id
               where m.user_id = new.user_id and c.kind = 'couple') then
      raise exception 'You''re already half of a pair.' using hint = 'already_paired';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function private.enforce_couple_size() from public, anon, authenticated;

create trigger circle_members_couple_size
  before insert on public.circle_members
  for each row execute function private.enforce_couple_size();

-- The caller's couple circle, or null.
create function private.my_couple()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.circles c
  join public.circle_members m on m.circle_id = c.id
  where c.kind = 'couple' and m.user_id = (select auth.uid())
  limit 1
$$;
revoke execute on function private.my_couple() from public, anon, authenticated;

-- The other person in a couple circle, or null while it has one member.
create function private.partner_in(p_circle_id uuid, p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id from public.circle_members m
  where m.circle_id = p_circle_id and m.user_id <> p_user_id
  limit 1
$$;
revoke execute on function private.partner_in(uuid, uuid) from public, anon, authenticated;


-- Writes ----------------------------------------------------------------------------

create function public.update_profile(p_display_name text, p_home_animal text, p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_permanent();
  v_name   text := btrim(p_display_name);
  v_animal text := nullif(btrim(p_home_animal), '');
begin
  if v_name is null or char_length(v_name) not between 1 and 24 then
    raise exception 'Names are 1 to 24 characters.' using hint = 'bad_name';
  end if;
  if v_animal is not null and char_length(v_animal) > 24 then
    raise exception 'Pick a shorter animal.' using hint = 'bad_animal';
  end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone) then
    raise exception 'That time zone doesn''t exist.' using hint = 'bad_timezone';
  end if;

  insert into public.profiles (id, display_name, home_animal, timezone)
  values (v_uid, v_name, v_animal, p_timezone)
  on conflict (id) do update
    set display_name = excluded.display_name,
        home_animal = excluded.home_animal,
        timezone = excluded.timezone;

  insert into public.notification_prefs (user_id) values (v_uid) on conflict do nothing;
end
$$;
revoke execute on function public.update_profile(text, text, text) from public, anon;
grant execute on function public.update_profile(text, text, text) to authenticated;

create function public.set_notification_prefs(
  p_quiet_start time, p_quiet_end time, p_disabled_types text[], p_read_receipts boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member_profile();
begin
  if p_quiet_start is null or p_quiet_end is null or p_read_receipts is null then
    raise exception 'Every setting needs a value.' using hint = 'bad_prefs';
  end if;
  if not (coalesce(p_disabled_types, '{}') <@ private.notification_types()) then
    raise exception 'Unknown notification type.' using hint = 'bad_prefs';
  end if;

  insert into public.notification_prefs (user_id, quiet_start, quiet_end, disabled_types, read_receipts, updated_at)
  values (v_uid, p_quiet_start, p_quiet_end, coalesce(p_disabled_types, '{}'), p_read_receipts, now())
  on conflict (user_id) do update
    set quiet_start = excluded.quiet_start,
        quiet_end = excluded.quiet_end,
        disabled_types = excluded.disabled_types,
        read_receipts = excluded.read_receipts,
        updated_at = excluded.updated_at;
end
$$;
revoke execute on function public.set_notification_prefs(time, time, text[], boolean) from public, anon;
grant execute on function public.set_notification_prefs(time, time, text[], boolean) to authenticated;
