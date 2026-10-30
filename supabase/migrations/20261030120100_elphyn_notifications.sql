-- Elphyn, Phase A: push notifications.
--
-- Flow: an event calls private.enqueue(), which writes a row to private.outbox
-- (switches and quiet hours applied) and kicks the sender. The sender is a Vercel
-- function (api/dispatch.ts): pg_net POSTs to it with a shared secret from Vault,
-- it claims due rows through dispatch_claim(), sends with web-push and reports back
-- through dispatch_finish(). A pg_cron tick every minute retries and delivers held
-- notifications. Notification text is built only from fixed templates, names and
-- unsealed fields, never from sealed content.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;


-- Devices -------------------------------------------------------------------------

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Only real push services, so the sender can never be pointed at an arbitrary URL.
  endpoint   text not null unique check (endpoint ~
    '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/'),
  p256dh     text not null check (char_length(p256dh) between 40 and 200),
  auth       text not null check (char_length(auth) between 10 and 100),
  device     text check (char_length(device) <= 80),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures   int not null default 0
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
revoke all on table public.push_subscriptions from anon, authenticated;
grant select on table public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;

create policy "your own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));


-- Outbox: not exposed to the API at all ------------------------------------------

create table private.outbox (
  id            bigint generated always as identity primary key,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  type          text not null,
  title         text not null check (char_length(title) between 1 and 120),
  body          text not null check (char_length(body) between 1 and 240),
  navigate      text not null check (navigate ~ '^/[A-Za-z0-9/_?=&.-]*$'),  -- in-app path only
  bundle_key    text,                -- due rows sharing a key go out as one notification
  dedupe_key    text unique,         -- e.g. a countdown milestone fires once
  deliver_after timestamptz not null default now(),  -- already pushed past quiet hours
  lease_until   timestamptz,         -- set when the sender claims a row; a crashed send retries after it lapses
  attempts      int not null default 0,
  sent_at       timestamptz,
  failed_at     timestamptz,         -- gave up after 5 attempts
  last_error    text,
  created_at    timestamptz not null default now(),
  check (type = any (private.notification_types()))
);
create index outbox_pending_idx on private.outbox (deliver_after) where sent_at is null and failed_at is null;
revoke all on table private.outbox from public, anon, authenticated;
alter table private.outbox enable row level security;  -- and no policies

-- When a notification may be delivered: p_at, or the end of the recipient's quiet
-- hours if p_at falls inside them, in the recipient's own time zone.
create function private.after_quiet_hours(p_user_id uuid, p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_start time := '00:00';
  v_end   time := '08:00';
  v_local timestamp;
begin
  select p.timezone into v_tz from public.profiles p where p.id = p_user_id;
  v_tz := coalesce(v_tz, 'America/New_York');
  select np.quiet_start, np.quiet_end into v_start, v_end
  from public.notification_prefs np where np.user_id = p_user_id;
  if v_start is null then v_start := '00:00'; v_end := '08:00'; end if;
  if v_start = v_end then return p_at; end if;

  v_local := p_at at time zone v_tz;
  if v_start < v_end then
    if v_local::time >= v_start and v_local::time < v_end then
      return (v_local::date + v_end) at time zone v_tz;
    end if;
  else  -- wraps midnight, e.g. 23:00 to 07:00
    if v_local::time >= v_start then
      return (v_local::date + 1 + v_end) at time zone v_tz;
    elsif v_local::time < v_end then
      return (v_local::date + v_end) at time zone v_tz;
    end if;
  end if;
  return p_at;
end
$$;
revoke execute on function private.after_quiet_hours(uuid, timestamptz) from public, anon, authenticated;

-- Pokes the sender if anything is due. pg_net sends after the transaction commits.
-- Does nothing until the Vault secrets elphyn_dispatch_url and elphyn_dispatch_secret exist.
create function private.kick_dispatch()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from private.outbox o
                 where o.sent_at is null and o.failed_at is null and o.attempts < 5
                   and o.deliver_after <= now() and (o.lease_until is null or o.lease_until < now())) then
    return;
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'elphyn_dispatch_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'elphyn_dispatch_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000
  );
end
$$;
revoke execute on function private.kick_dispatch() from public, anon, authenticated;

-- The only way anything gets into the outbox. Respects the recipient's switches.
create function private.enqueue(
  p_recipient_id uuid,
  p_type         text,
  p_title        text,
  p_body         text,
  p_navigate     text,
  p_bundle_key   text default null,
  p_dedupe_key   text default null,
  p_at           timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deliver timestamptz;
begin
  if exists (select 1 from public.notification_prefs np
             where np.user_id = p_recipient_id and p_type = any (np.disabled_types)) then
    return;
  end if;
  v_deliver := private.after_quiet_hours(p_recipient_id, p_at);
  insert into private.outbox (recipient_id, type, title, body, navigate, bundle_key, dedupe_key, deliver_after)
  values (p_recipient_id, p_type, p_title, p_body, p_navigate, p_bundle_key, p_dedupe_key, v_deliver)
  on conflict (dedupe_key) do nothing;
  if v_deliver <= now() then
    perform private.kick_dispatch();
  end if;
end
$$;
revoke execute on function private.enqueue(uuid, text, text, text, text, text, text, timestamptz) from public, anon, authenticated;

-- Body text when several notifications go out as one.
create function private.bundle_body(p_type text, p_count bigint, p_first_body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'test' then p_count || ' test notifications from Elphyn.'
    when 'jar'  then p_count || ' things landed in your jar.'
    when 'bid'  then p_first_body
    else p_count || ' new things in Elphyn.'
  end
$$;
revoke execute on function private.bundle_body(text, bigint, text) from public, anon, authenticated;


-- Device writes ---------------------------------------------------------------------

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_member_profile();
begin
  if p_endpoint is null or p_endpoint !~
     '^https://([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)/' then
    raise exception 'That isn''t a push service Elphyn knows.' using hint = 'bad_endpoint';
  end if;
  -- A device that switches accounts moves to the new account.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_device, 80))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        device = excluded.device, failures = 0;
  -- Keep at most 10 devices per person; drop the oldest.
  delete from public.push_subscriptions s
  where s.user_id = v_uid
    and s.id not in (select s2.id from public.push_subscriptions s2 where s2.user_id = v_uid
                     order by s2.created_at desc limit 10);
end
$$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_permanent();
begin
  delete from public.push_subscriptions s where s.endpoint = p_endpoint and s.user_id = v_uid;
end
$$;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Spike helper: send yourself (or your partner) 1 to 5 test notifications.
-- Several at once go out as one bundled notification.
create function public.send_test_push(p_to_partner boolean default false, p_count int default 1)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := private.require_member_profile();
  v_name      text;
  v_recipient uuid := v_uid;
  v_couple    uuid;
  v_tag       text := to_char(clock_timestamp(), 'HH24MISS');
begin
  if p_count is null or p_count not between 1 and 5 then
    raise exception 'Send between 1 and 5 tests.' using hint = 'bad_count';
  end if;
  if p_to_partner then
    v_couple := private.my_couple();
    v_recipient := private.partner_in(v_couple, v_uid);
    if v_recipient is null then
      raise exception 'You don''t have a partner in Elphyn yet.' using hint = 'no_partner';
    end if;
  end if;
  select p.display_name into v_name from public.profiles p where p.id = v_uid;
  for i in 1..p_count loop
    perform private.enqueue(
      v_recipient, 'test', 'Elphyn',
      case when p_to_partner then v_name || ' sent you a test from Elphyn.'
           else 'Test from Elphyn. If you can read this, push works.' end,
      '/settings/notifications?test=' || v_tag,
      case when p_count > 1 then 'test-burst:' || v_recipient || ':' || v_tag end);
  end loop;
end
$$;
revoke execute on function public.send_test_push(boolean, int) from public, anon;
grant execute on function public.send_test_push(boolean, int) to authenticated;


-- The sender's side: callable only with the secret key (service_role) ------------

-- Claims up to p_limit due rows for two minutes, groups bundles, and returns each
-- group with the recipient's devices.
create function public.dispatch_claim(p_limit int default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with due as (
    select o.id from private.outbox o
    where o.sent_at is null and o.failed_at is null and o.attempts < 5
      and o.deliver_after <= now() and (o.lease_until is null or o.lease_until < now())
    order by o.id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), claimed as (
    update private.outbox o
    set lease_until = now() + interval '2 minutes', attempts = o.attempts + 1
    from due where o.id = due.id
    returning o.*
  ), groups as (
    select c.recipient_id,
           array_agg(c.id order by c.id) as ids,
           count(*) as n,
           min(c.type) as type,
           (array_agg(c.title order by c.id))[1] as title,
           (array_agg(c.body order by c.id))[1] as body,
           (array_agg(c.navigate order by c.id desc))[1] as navigate
    from claimed c
    group by c.recipient_id, coalesce(c.bundle_key, 'id:' || c.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ids', g.ids,
    'type', g.type,
    'title', g.title,
    'body', case when g.n > 1 then private.bundle_body(g.type, g.n, g.body) else g.body end,
    'navigate', g.navigate,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from public.push_subscriptions s where s.user_id = g.recipient_id), '[]'::jsonb)
  )), '[]'::jsonb)
  into v_result
  from groups g;
  return v_result;
end
$$;
revoke execute on function public.dispatch_claim(int) from public, anon, authenticated;
grant execute on function public.dispatch_claim(int) to service_role;

-- p_results: [{ "ids": [..], "outcomes": [{ "endpoint": "...", "status": 201 }, ...] }, ...]
-- A group counts as sent if any device accepted it, or if the person has no devices.
-- Otherwise it backs off (2, 4, 8, 16 minutes) and gives up after 5 attempts.
-- Devices that answer 404 or 410 are gone and get deleted.
create function public.dispatch_finish(p_results jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group    jsonb;
  v_outcome  jsonb;
  v_ids      bigint[];
  v_ok       boolean;
  v_status   int;
  v_errors   text;
begin
  for v_group in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    v_ids := array(select jsonb_array_elements_text(v_group -> 'ids')::bigint);
    v_ok := jsonb_array_length(coalesce(v_group -> 'outcomes', '[]'::jsonb)) = 0;
    v_errors := null;

    for v_outcome in select * from jsonb_array_elements(coalesce(v_group -> 'outcomes', '[]'::jsonb)) loop
      v_status := coalesce((v_outcome ->> 'status')::int, 0);
      if v_status between 200 and 299 then
        v_ok := true;
        update public.push_subscriptions set last_ok_at = now(), failures = 0
        where endpoint = v_outcome ->> 'endpoint';
      elsif v_status in (404, 410) then
        delete from public.push_subscriptions where endpoint = v_outcome ->> 'endpoint';
      else
        update public.push_subscriptions set failures = failures + 1
        where endpoint = v_outcome ->> 'endpoint';
        v_errors := concat_ws('; ', v_errors, v_status || ' ' || left(coalesce(v_outcome ->> 'error', ''), 80));
      end if;
    end loop;

    if v_ok then
      update private.outbox
      set sent_at = now(), lease_until = null,
          last_error = case when jsonb_array_length(coalesce(v_group -> 'outcomes', '[]'::jsonb)) = 0
                            then 'no devices' end
      where id = any (v_ids);
    else
      update private.outbox
      set lease_until = null,
          last_error = left(coalesce(v_errors, 'every device refused'), 500),
          deliver_after = now() + make_interval(mins => power(2, attempts)::int),
          failed_at = case when attempts >= 5 then now() end
      where id = any (v_ids);
    end if;
  end loop;
end
$$;
revoke execute on function public.dispatch_finish(jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_finish(jsonb) to service_role;


-- Keep-alive --------------------------------------------------------------------------

-- A once-a-day Vercel cron calls this with the secret key, so a quiet week doesn't
-- pause the free project. Records each ping so we can see it ran.
create table private.keepalive_pings (
  day       date primary key,
  pinged_at timestamptz not null default now()
);
revoke all on table private.keepalive_pings from public, anon, authenticated;
alter table private.keepalive_pings enable row level security;

create function public.keepalive()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.keepalive_pings (day) values (current_date)
  on conflict (day) do update set pinged_at = now();
  return jsonb_build_object('ok', true, 'at', now(), 'profiles', (select count(*) from public.profiles));
end
$$;
revoke execute on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to service_role;


-- The minute tick ---------------------------------------------------------------------

create function private.tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A row whose last lease lapsed after its fifth attempt has failed for good.
  update private.outbox
  set failed_at = now(), last_error = coalesce(last_error, 'no answer from the sender')
  where sent_at is null and failed_at is null and attempts >= 5
    and (lease_until is null or lease_until < now());
  -- Keep 30 days of history.
  delete from private.outbox where coalesce(sent_at, failed_at) < now() - interval '30 days';
  delete from private.keepalive_pings where day < current_date - 30;
  perform private.kick_dispatch();
end
$$;
revoke execute on function private.tick() from public, anon, authenticated;

select cron.schedule('elphyn-tick', '* * * * *', 'select private.tick()');
