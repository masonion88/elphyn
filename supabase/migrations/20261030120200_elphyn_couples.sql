-- Elphyn, Phase A: couple circles and invites.
--
-- One person creates the couple and gets a single-use invite code: 20 random
-- characters (about 100 bits), valid for 7 days, stored only as a hash. The partner
-- types or pastes it inside the installed app. Wrong codes are capped per person per
-- hour, and a wrong, used or expired code all get the same answer.

create table private.couple_invites (
  code_hash  bytea primary key,   -- sha256 of the normalized code; the code itself is shown once
  circle_id  uuid not null references public.circles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  used_by    uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index couple_invites_circle_idx on private.couple_invites (circle_id);
revoke all on table private.couple_invites from public, anon, authenticated;
alter table private.couple_invites enable row level security;  -- and no policies

-- Crockford base32: no I, L, O or U, so codes survive being read aloud or retyped.
create function private.invite_alphabet()
returns text
language sql
immutable
set search_path = ''
as $$ select '0123456789ABCDEFGHJKMNPQRSTVWXYZ' $$;
revoke execute on function private.invite_alphabet() from public, anon, authenticated;

-- Uppercase, drop spaces and dashes, and read I/L as 1 and O as 0.
create function private.normalize_invite(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'ILO', '110')
$$;
revoke execute on function private.normalize_invite(text) from public, anon, authenticated;


create function public.create_couple_circle(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_member_profile();
  v_name      text := coalesce(nullif(btrim(p_name), ''), 'Us');
  v_circle_id uuid;
begin
  if private.my_couple() is not null then
    raise exception 'You''re already half of a pair.' using hint = 'already_paired';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Pick a shorter name for the two of you.' using hint = 'bad_circle_name';
  end if;
  insert into public.circles (name, deck, kind, join_code, created_by)
  values (v_name, 'tender', 'couple', null, v_uid)
  returning id into v_circle_id;
  insert into public.circle_members (circle_id, user_id) values (v_circle_id, v_uid);
  return v_circle_id;
end
$$;
revoke execute on function public.create_couple_circle(text) from public, anon;
grant execute on function public.create_couple_circle(text) to authenticated;

-- Returns the new code, formatted XXXX-XXXX-XXXX-XXXX-XXXX. It's shown once: only its
-- hash is stored. Making a new invite cancels any earlier one for this couple.
create function public.create_couple_invite(p_circle_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_member_profile();
  v_alphabet text := private.invite_alphabet();
  v_bytes    bytea := extensions.gen_random_bytes(20);
  v_code     text := '';
begin
  if not exists (select 1 from public.circles c join public.circle_members m on m.circle_id = c.id
                 where c.id = p_circle_id and c.kind = 'couple' and m.user_id = v_uid) then
    raise exception 'That isn''t your couple.' using hint = 'not_member';
  end if;
  if (select count(*) from public.circle_members m where m.circle_id = p_circle_id) >= 2 then
    raise exception 'Your pair is already complete.' using hint = 'couple_full';
  end if;

  -- 256 is a multiple of 32, so taking each random byte mod 32 is unbiased.
  for i in 0..19 loop
    v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
  end loop;

  update private.couple_invites set revoked_at = now()
  where circle_id = p_circle_id and used_at is null and revoked_at is null;
  insert into private.couple_invites (code_hash, circle_id, created_by)
  values (sha256(convert_to(v_code, 'UTF8')), p_circle_id, v_uid);

  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4)
         || '-' || substr(v_code, 13, 4) || '-' || substr(v_code, 17, 4);
end
$$;
revoke execute on function public.create_couple_invite(uuid) from public, anon;
grant execute on function public.create_couple_invite(uuid) to authenticated;

-- Returns the couple's id, or null for a wrong, used or expired code. Returning
-- instead of raising means the miss is recorded for the throttle, not rolled back.
create function public.accept_couple_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_member_profile();
  v_code   text := private.normalize_invite(p_code);
  v_invite private.couple_invites;
  v_name   text;
begin
  if (select count(*) from private.join_attempts ja
      where ja.user_id = v_uid and ja.attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many wrong codes. Try again in an hour.' using hint = 'too_many_codes';
  end if;

  if v_code ~ '^[0-9A-HJKMNP-TV-Z]{20}$' then
    select * into v_invite from private.couple_invites ci
    where ci.code_hash = sha256(convert_to(v_code, 'UTF8'))
      and ci.used_at is null and ci.revoked_at is null and ci.expires_at > now()
    for update;
  end if;

  if v_invite.code_hash is null then
    insert into private.join_attempts (user_id) values (v_uid);
    return null;
  end if;
  if v_invite.created_by = v_uid then
    raise exception 'That''s your own invite. Send it to your partner.' using hint = 'own_invite';
  end if;

  -- The couple_size trigger refuses a third person or someone already paired.
  insert into public.circle_members (circle_id, user_id) values (v_invite.circle_id, v_uid);
  update private.couple_invites set used_at = now(), used_by = v_uid where code_hash = v_invite.code_hash;

  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  perform private.enqueue(v_invite.created_by, 'partner_joined', 'Elphyn',
                          v_name || ' just joined Elphyn.', '/');
  return v_invite.circle_id;
end
$$;
revoke execute on function public.accept_couple_invite(text) from public, anon;
grant execute on function public.accept_couple_invite(text) to authenticated;
