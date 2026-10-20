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

  ('chaos',  1, $$Get them to call you "brochacho."$$),
  ('chaos',  1, $$Get them to rate your aura out of 10.$$),
  ('chaos',  1, $$Get them to say "that's ragebait."$$),
  ('chaos',  1, $$Get them to bring up Brawl Stars before you do.$$),
  ('chaos',  1, $$Get them to say "one more game."$$),
  ('chaos',  2, $$Get them to invent a brand-new nickname in the brotato chip family.$$),
  ('chaos',  2, $$Get them to say you lost aura.$$),
  ('chaos',  2, $$Get them to explain what "aura" actually means.$$),
  ('chaos',  2, $$Get them to call something "tuff" that isn't tough at all.$$),
  ('chaos',  2, $$Get them to call an inanimate object "twin."$$),
  ('chaos',  2, $$Get them to call themselves a bum.$$),
  ('chaos',  2, $$Get them to say "smashing" sincerely.$$),
  ('chaos',  2, $$Get them to say "you can't be serious."$$),
  ('chaos',  2, $$Get them to say "it depends how you define it."$$),
  ('chaos',  2, $$Get them to name-drop a philosopher.$$),
  ('chaos',  2, $$Get them to propose one new law.$$),
  ('chaos',  2, $$Get them to say "I yield my time."$$),
  ('chaos',  2, $$Get them to roast you using only food words.$$),
  ('chaos',  2, $$Get them to retell a Brawl Stars moment from back in class.$$),
  ('chaos',  2, $$Get them to defend Brawl Stars vs. Smash for one full minute.$$),
  ('chaos',  2, $$Convince them you've secretly been grinding Brawl Stars every night.$$),
  ('chaos',  3, $$Get them to call themselves "sonion ring."$$),
  ('chaos',  3, $$Get them to award you +1000 aura for something completely mundane.$$),
  ('chaos',  3, $$Get them to change their mind about anything and admit it out loud.$$),
  ('chaos',  3, $$Get them to argue both sides of the same debate in one call.$$),
  ('chaos',  3, $$Get them to give a 30-second campaign speech for an animal you pick.$$),
  ('chaos',  3, $$Get them to play one game of Brawl Stars with you before the call ends.$$),

  ('tender', 1, $$Make them laugh within the first 60 seconds.$$),
  ('tender', 1, $$Get them to share an elephant fact.$$),
  ('tender', 1, $$Get them to make a chicken noise.$$),
  ('tender', 1, $$Get them to name a bird that isn't a pigeon, crow, or seagull.$$),
  ('tender', 1, $$Plan a fake date where you're your animals: a turtle and a chicken.$$),
  ('tender', 2, $$Answer their next hypothetical with a number, a name, and an exact time.$$),
  ('tender', 2, $$Ask them a hypothetical before they can ask you one.$$),
  ('tender', 2, $$Get them to answer one of your hypotheticals more specifically than you would.$$),
  ('tender', 2, $$Get them to decide whether they're more chicken or elephant today, with three reasons.$$),
  ('tender', 2, $$Get them to rule whether you're more turtle or dog today, with three reasons.$$),
  ('tender', 2, $$Get them to do an elephant impression.$$),
  ('tender', 2, $$Get them to say one thing they're proud of this week.$$),
  ('tender', 2, $$Get them to compliment themselves without adding "I guess."$$),
  ('tender', 2, $$Give them a compliment so specific they ask how you noticed.$$),
  ('tender', 3, $$Get them to find a real bird outside and describe it to you.$$),
  ('tender', 3, $$Be a turtle for the whole call: everything slow. Don't break until they ask.$$),
  ('tender', 3, $$Get them to do a chicken walk on camera.$$),
  ('tender', 3, $$Read them three lines of something you wrote.$$)

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
