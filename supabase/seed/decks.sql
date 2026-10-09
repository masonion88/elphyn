-- ============================================================================
--  THE DECKS. Rewrite these in your own words, then run:  npm run db:seed
-- ============================================================================
--
--  One mission per line:   ('deck', tier, $$mission text$$),
--    deck: chaos or tender
--    tier: 1 = easy, 2 = spicy, 3 = legendary
--    The text sits between $$ and $$, so quotes and apostrophes need no escaping.
--    Every line ends with a comma, except the very last one.
--
--  Rewording a mission retires the old wording and adds the new one. Old case
--  files keep the wording they were played with. Deleting a line retires it.
--
--  The rules (the "write a mission" screen shows these too):
--    - Stupid, never dangerous. No fire, no trespassing, nothing illegal,
--      nothing involving cars or heights.
--    - Nothing that targets someone's real insecurities. It's ragebait between
--      people who love each other.
--    - Doable on a FaceTime call (or a call plus a short walk).
-- ============================================================================

with deck_file (deck, tier, text) as (values

  ('chaos',  1, $$Get them to say "pineapple" without asking them to.$$),
  ('chaos',  1, $$Use the word "moist" three times without getting called out.$$),
  ('chaos',  1, $$Get them to show you the inside of their fridge.$$),
  ('chaos',  2, $$Narrate 30 seconds of the call like a nature documentary. Don't explain.$$),
  ('chaos',  2, $$Convince them you've picked up a hobby that doesn't exist. Hold it for three minutes.$$),
  ('chaos',  2, $$Agree with everything they say for five minutes, with growing enthusiasm.$$),
  ('chaos',  2, $$Get them to rank three random animals by who'd win a fight.$$),
  ('chaos',  2, $$Get them to sing any song, even one line.$$),
  ('chaos',  3, $$Steer the conversation to medieval history and keep it there for two minutes.$$),
  ('chaos',  3, $$Make them say "I love pigeons."$$),

  ('tender', 1, $$Find out the last thing that made them laugh out loud.$$),
  ('tender', 1, $$Name three specific things they did this month that you noticed.$$),
  ('tender', 1, $$Plan a fake future date together in absurd detail.$$),
  ('tender', 2, $$Get them to tell you a childhood memory you've never heard.$$),
  ('tender', 2, $$Get them to teach you something they're good at.$$),
  ('tender', 2, $$Ask what animal they are today, then be that animal's sidekick for the rest of the call.$$),
  ('tender', 2, $$Make them feel like the main character for five minutes without saying that's what you're doing.$$),
  ('tender', 3, $$Be an otter for the whole call. Don't break character until they ask why.$$),
  ('tender', 3, $$Get them to walk into a grocery store with you on FaceTime and find the item that is most like them.$$)

),
-- ---- Nothing to edit below this line ----------------------------------------
cleaned as (
  select d.deck, d.tier::smallint as tier, btrim(d.text) as text from deck_file d
),
retired as (
  update public.missions m
  set active = false
  where m.circle_id is null
    and m.active
    and (m.deck, m.text) not in (select c.deck, c.text from cleaned c)
  returning m.id
)
insert into public.missions (deck, tier, text)
select c.deck, c.tier, c.text from cleaned c
on conflict (deck, text) where circle_id is null
do update set tier = excluded.tier, active = true;
