-- Every scoring number lives here. The app reads this to show the rules, and the
-- scoring views read it to award points. To change a number later, add a new
-- migration that redefines this one function.

create function public.game_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'tier_points',          jsonb_build_object('1', 1, '2', 2, '3', 3),  -- real mission, completed, not caught
    'catch_points',         1,    -- accuser who catches a real mission
    'author_points',        1,    -- Phase 2: author of a custom mission completed without getting caught
    'decoy_fooled_points',  2,    -- Phase 2: decoy agent, when accused of a real mission
    'decoy_spotted_points', 1,    -- Phase 2: accuser who correctly says "no mission"
    'decoy_rate',           0.2   -- Phase 2: share of assignments that are decoys
  )
$$;
revoke execute on function public.game_rules() from public, anon;
grant execute on function public.game_rules() to authenticated;
