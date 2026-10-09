-- Points are computed from assignments; there is no ledger table.
-- security_invoker makes both views run under the caller's row level security,
-- so they can only ever count cards the caller is allowed to see.

-- One row per award. Phase 1 rules; Phase 2 redefines this view to add decoy
-- and author-credit rows.
create view public.assignment_points with (security_invoker = true) as
  -- Real mission, completed, not caught: the agent gets the tier value.
  select o.circle_id,
         o.id       as operation_id,
         a.agent_id as user_id,
         (public.game_rules() -> 'tier_points' ->> m.tier::text)::int as points,
         'mission'  as reason
  from public.assignments a
  join public.operations o on o.id = a.operation_id
  join public.missions   m on m.id = a.mission_id
  where o.status = 'revealed' and not a.is_decoy and a.completed and a.caught = false
  union all
  -- Real mission, caught: the accuser (the mission's target) gets the catch bonus.
  select o.circle_id,
         o.id,
         a.target_id,
         (public.game_rules() ->> 'catch_points')::int,
         'catch'
  from public.assignments a
  join public.operations o on o.id = a.operation_id
  where o.status = 'revealed' and not a.is_decoy and a.caught;
revoke all on table public.assignment_points from anon, authenticated;
grant select on table public.assignment_points to authenticated;

create view public.leaderboard with (security_invoker = true) as
  select cm.circle_id,
         cm.user_id,
         coalesce(sum(p.points), 0)::int as points
  from public.circle_members cm
  left join public.assignment_points p
    on p.circle_id = cm.circle_id and p.user_id = cm.user_id
  group by cm.circle_id, cm.user_id;
revoke all on table public.leaderboard from anon, authenticated;
grant select on table public.leaderboard to authenticated;
