-- Elphyn, Phase A: voice recordings.
--
-- Recordings live in the private `voice` bucket at {circle_id}/{user_id}/{uuid}.{ext}.
-- You can upload only into your own folder inside your own circle. You can play
-- your own recordings, plus any recording attached to a row you're already allowed
-- to see, so a sealed note keeps its recording sealed too. Playback uses short-lived
-- signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', false, 10485760,
        array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg',
              'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav']);


-- Spike table: voice checks between the two of you. Phase B drops it.
create table public.voice_checks (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles (id) on delete cascade,
  from_id     uuid not null references public.profiles (id),
  path        text not null unique,
  mime        text not null check (char_length(mime) <= 80),
  duration_ms int check (duration_ms between 0 and 3600000),
  created_at  timestamptz not null default now()
);
revoke all on table public.voice_checks from anon, authenticated;
grant select on table public.voice_checks to authenticated;
alter table public.voice_checks enable row level security;

create policy "your circle's voice checks"
  on public.voice_checks for select to authenticated
  using (circle_id in (select private.my_circle_ids()));


-- Every recording a row refers to, filtered by the caller's own row level security.
-- Phase B extends this to notes, letters, answers and hypotheticals.
create view private.voice_paths with (security_invoker = true) as
  select vc.path from public.voice_checks vc;
revoke all on table private.voice_paths from public, anon, authenticated;
grant select on table private.voice_paths to authenticated;

-- Whether anything refers to a recording, ignoring row level security. Used to stop
-- deleting a recording that's in use, and to find orphans for cleanup.
create function private.voice_path_in_use(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.voice_checks vc where vc.path = p_path)
$$;
revoke execute on function private.voice_path_in_use(text) from public, anon;
grant execute on function private.voice_path_in_use(text) to authenticated;

-- A path the caller may attach: their own folder in their own circle, a uuid file
-- name with an audio extension, already uploaded by them.
create function private.check_my_voice_path(p_circle_id uuid, p_uid uuid, p_path text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_path is null
     or p_path !~ ('^' || p_circle_id::text || '/' || p_uid::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp4|aac|mp3|webm|ogg|wav)$')
     or not exists (select 1 from storage.objects o
                    where o.bucket_id = 'voice' and o.name = p_path and o.owner_id = p_uid::text) then
    raise exception 'That recording didn''t upload. Try again.' using hint = 'bad_voice_path';
  end if;
end
$$;
revoke execute on function private.check_my_voice_path(uuid, uuid, text) from public, anon, authenticated;


create policy "voice: upload only into your own folder in your circle"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice'
    and (storage.foldername(name))[1] in (select c::text from private.my_circle_ids() c)
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

create policy "voice: hear your own, and theirs once you're allowed to"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice'
    and ((storage.foldername(name))[2] = (select auth.uid())::text
         or name in (select v.path from private.voice_paths v))
  );

create policy "voice: delete your own recordings that nothing uses"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not private.voice_path_in_use(name)
  );


create function public.add_voice_check(p_circle_id uuid, p_path text, p_mime text, p_duration_ms int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_member_profile();
  v_id      uuid;
  v_partner uuid;
  v_name    text;
begin
  if not exists (select 1 from public.circle_members m where m.circle_id = p_circle_id and m.user_id = v_uid) then
    raise exception 'That isn''t your couple.' using hint = 'not_member';
  end if;
  perform private.check_my_voice_path(p_circle_id, v_uid, p_path);

  insert into public.voice_checks (circle_id, from_id, path, mime, duration_ms)
  values (p_circle_id, v_uid, p_path, left(coalesce(p_mime, 'audio/mp4'), 80), p_duration_ms)
  returning id into v_id;

  v_partner := private.partner_in(p_circle_id, v_uid);
  if v_partner is not null then
    select p.display_name into v_name from public.profiles p where p.id = v_uid;
    perform private.enqueue(v_partner, 'test', 'Elphyn', v_name || ' sent a voice check.', '/settings/voice');
  end if;
  return v_id;
end
$$;
revoke execute on function public.add_voice_check(uuid, text, text, int) from public, anon;
grant execute on function public.add_voice_check(uuid, text, text, int) to authenticated;

-- For the daily cleanup (secret key only): recordings older than a day that nothing
-- refers to. The cleanup deletes them through the Storage API, not with SQL.
create function public.voice_orphans()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(o.name), '{}') from storage.objects o
  where o.bucket_id = 'voice' and o.created_at < now() - interval '1 day'
    and not private.voice_path_in_use(o.name)
$$;
revoke execute on function public.voice_orphans() from public, anon, authenticated;
grant execute on function public.voice_orphans() to service_role;
