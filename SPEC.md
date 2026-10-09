# Pigeon Ops — spec (v1)

> Working title. In WWI, homing pigeons carried secret messages across the front. This app does the same for long-distance friends: it hands out secret missions to run on each other during calls.

## Who it's for

Four real people, not "users":
- Me (Mason, Cornell) and my two best friends (UC Berkeley, UC Irvine). We're chaotic together in person. Distance kills *initiation*: nobody starts the call.
- Me and my girlfriend (SoCal). We're more sentimental. The app's job there is *inspiration*: giving us permission and prompts to be whimsical together.

Build for these people first. Don't generalize.

## The core loop

1. **Circle.** Someone creates a circle (e.g. "the boys", "us two") and picks a deck: `chaos` or `tender`. Others join with a short, human-friendly join code (e.g. `OTTER-4821`).
2. **Operation.** Someone in the circle starts an operation between two members, with an optional "call by" date.
3. **Briefing.** Each of the two agents secretly gets one mission card. Only they can see it. The mission is something to pull off *on the other person* during their next call (FaceTime happens outside the app).
4. **The call.** Happens on FaceTime. The app does nothing here.
5. **Debrief.** After the call, each agent privately submits: (a) did I complete my mission? (b) my accusation: what I think the other person's mission was, or "I think they had no mission."
6. **Reveal.** When both have submitted, both cards and both accusations are revealed together. Each agent judges whether the accusation against them actually caught their mission. Points are awarded.
7. **Case file.** Each agent writes one line about how they pulled it off (or how they got caught). This goes into the circle's archive.

## Features in v1

### Core (Phase 1)
- **Identity without accounts:** Supabase anonymous sign-ins. A friend opens the link, picks a display name, and is in. No email, no password.
- **Circles:** create, join by code, list my circles. A user can be in several circles (friends circle and couple circle).
- **Decks:** built-in starter missions for `chaos` and `tender` (see bottom), plus **custom missions** written by circle members. Missions have a tier: 1 = easy, 2 = spicy, 3 = legendary.
- **Operations:** start an operation with one other member (pairs only in v1). The server picks each agent's mission at random from the circle's deck (built-in + custom). Never assign an agent a mission they authored.
- **Veto:** each agent may reroll their mission once per operation.
- **Mission card:** private, tap-and-hold to reveal, can be hidden again ("burn after reading" feel).
- **Debrief → reveal → scoring** as described above.
- **Leaderboard** per circle.
- **"Went dark":** if a "call by" date passes with no debrief, mark the operation as `went_dark` and show it on the circle page. This is light shame, not a penalty in v1.

### Deep features (Phase 2)
- **Decoys (bluffs):** about 1 in 5 assignments (constant, configurable) is a decoy. The card says something like: *"DECOY. You have no mission. Act suspicious anyway. If they accuse you of a mission, you win."* The other agent can't tell the difference.
- **Author credit:** when a custom mission is completed without getting caught, its author scores too, and the reveal shows who wrote it ("this mission was brought to you by ___").
- **Case files archive:** a per-circle archive of every revealed operation: mission text, agent, target, outcome, author credit, the case-file line, and the date. This is the memory of the friendship, so make it beautiful.

### Scoring (put all numbers in one constants file)
- Real mission, completed, not caught → agent gets the tier value (1/2/3).
- Real mission, caught → the accuser gets +1; the agent gets 0.
- Custom mission completed and not caught → author gets +1 (if author ≠ agent).
- Decoy, and the other agent accused a real mission → decoy agent gets +2.
- Decoy, and the other agent guessed "no mission" → accuser gets +1.
- Not completed → 0. Everything is honor system.

## Data model (sketch — refine it, but keep it this small)

- `profiles` — `id` (= `auth.uid()`), `display_name`, `created_at`
- `circles` — `id`, `name`, `deck` (`chaos` | `tender`), `join_code` (unique), `created_by`, `created_at`
- `circle_members` — `circle_id`, `user_id`, `joined_at`
- `missions` — `id`, `circle_id` (null = built-in), `deck`, `text`, `tier`, `author_id` (null = built-in), `active`, `created_at`
- `operations` — `id`, `circle_id`, `created_by`, `status` (`briefing` | `debrief` | `revealed` | `went_dark`), `call_by` (nullable), `created_at`, `revealed_at`
- `assignments` — `id`, `operation_id`, `agent_id`, `target_id`, `mission_id` (null if decoy), `is_decoy`, `rerolled`, `completed`, `accusation_text`, `accused_decoy` (bool), `submitted_at`, `caught` (judged by the agent at reveal), `case_file`
- Points: compute from `assignments` (a SQL view or function). No separate ledger table.

## Security requirements (non-negotiable)

Secrecy *is* the game. If anyone can peek, the app is broken.

- Row Level Security on **every** table.
- Users can only read circles, members, operations, and leaderboards for circles they belong to.
- Joining a circle by code goes through a Postgres function (security definer), since non-members can't read circles.
- **Mission picking, rerolls, and decoy rolls happen server-side** in Postgres functions, never in the client.
- Before an operation is `revealed`:
  - A user can read the mission text of an assignment **only if they are that assignment's agent**.
  - A user cannot read the other agent's `completed`, accusation, or decoy status.
- After `revealed`, both agents (and circle members) can read everything for that operation.
- Users can read the text of custom missions they authored. They cannot browse other people's custom missions.
- Only the publishable key goes in the frontend. Never put the secret or service-role key in client code or in git. `.env.local` must be gitignored.
- **Acceptance test:** with two test users in one operation, try to read the other agent's mission and accusation before reveal using the client library directly. It must fail. Show me this test passing.

Known limitation (accept for v1): an anonymous user who clears their browser data or switches phones becomes a new agent. Test whether identity survives between Safari and the iOS "Add to Home Screen" version; tell me what you find. Linking an email to make accounts permanent goes in IDEAS.md for later.

## Tech

- Vite + React + TypeScript, Tailwind for styling. Mobile-first: this lives in phone browsers.
- Supabase (free tier): Postgres, anonymous auth, RLS. Schema as SQL migration files in the repo.
- Polling every few seconds is fine for "waiting for the other agent to debrief." Realtime is optional.
- Deploy to Vercel (Hobby, free) from a GitHub repo. Make sure refreshing or deep-linking any route works (SPA rewrites).
- Add a web app manifest and icon so it can be added to the home screen. No push notifications in v1.

## Design direction

- **Theme:** spy pigeons. The voice is dead-serious spy-movie copy about absurd things. Example: *"Agent. Your target: UCI. Objective: make them say 'pineapple.' This message will not self-destruct, but act like it will."*
- **Mascot:** an original pigeon in a tiny trench coat, drawn as simple SVG. It shows up on empty states, the reveal, and the leaderboard.
- **Feel:** warm, chunky, playful, human. Rounded shapes, big tap targets, bold colors, small delightful animations (a "CLASSIFIED" stamp, a card flip on reveal, confetti or feathers when a mission goes uncaught). It should not look like a generic SaaS dashboard.
- **Deck themes:**
  - `chaos` circles get the classified-dossier look.
  - `tender` circles get a softer "field notes" variant: same app, gentler palette, animal doodles.
- Copy matters as much as code. Make every empty state, button, and error message funny or warm.

## Content rules for missions

These are baked into the seed decks, and shown as guidance on the "write a mission" screen:
- Stupid, never dangerous. No fire, no trespassing, nothing illegal, nothing involving cars or heights.
- Nothing that targets someone's real insecurities. It's ragebait between people who love each other.
- Every mission must be doable on a FaceTime call (or on a call plus a short walk).

## Starter decks (placeholders — Mason will rewrite these in his own words)

Keep these in **one plain, easy-to-edit file** that seeds the database, so I can rewrite them without touching code.

**chaos**
1. (1) Get them to say "pineapple" without asking them to.
2. (1) Use the word "moist" three times without getting called out.
3. (1) Get them to show you the inside of their fridge.
4. (2) Narrate 30 seconds of the call like a nature documentary. Don't explain.
5. (2) Convince them you've picked up a hobby that doesn't exist. Hold it for three minutes.
6. (2) Agree with everything they say for five minutes, with growing enthusiasm.
7. (2) Get them to rank three random animals by who'd win a fight.
8. (2) Get them to sing any song, even one line.
9. (3) Steer the conversation to medieval history and keep it there for two minutes.
10. (3) Make them say "I love pigeons."

**tender**
1. (1) Find out the last thing that made them laugh out loud.
2. (1) Name three specific things they did this month that you noticed.
3. (1) Plan a fake future date together in absurd detail.
4. (2) Get them to tell you a childhood memory you've never heard.
5. (2) Get them to teach you something they're good at.
6. (2) Ask what animal they are today, then be that animal's sidekick for the rest of the call.
7. (2) Make them feel like the main character for five minutes without saying that's what you're doing.
8. (3) Be an otter for the whole call. Don't break character until they ask why.
9. (3) Get them to walk into a grocery store with you on FaceTime and find the item that is most like them.

## How to work with me (Claude Code)

1. **Check the docs first.** Read the current official docs for Supabase anonymous sign-ins, RLS, supabase-js, Supabase migrations, and deploying a Vite SPA to Vercel. Don't rely on memory for APIs or config. Library versions and key formats have changed recently.
2. **Plan first.** Before writing code, show me the plan, the final schema, and the RLS policies, and wait for my OK.
3. **Work in phases** and ship each one:
   - **Phase 0:** setup (repo, Supabase project, env vars, schema and RLS, the secrecy acceptance test).
   - **Phase 1:** the core loop, deployed to Vercel and playable by two real phones.
   - **Phase 2:** decoys, author credit, case files archive.
   - **Phase 3:** polish (animations, mascot, manifest, copy pass).
   - After each phase: run it, test it, commit, deploy, and give me the URL plus a 3-line summary of what changed.
4. **Walk me through dashboard steps.** When I need to do something by hand (create the Supabase project, enable anonymous sign-ins, connect Vercel to GitHub), give me numbered plain-English steps.
5. **Ask before:**
   - adding dependencies beyond the stack above,
   - anything that could cost money (nothing should),
   - changing the core loop.
6. **Stay in scope.** Don't build features not in this spec. Put ideas in `IDEAS.md` instead. Already in there for later:
   - collateral (penalty for dodging a call),
   - "same moment, different cities" synchronized dares (needs push),
   - group calls (3+ agents),
   - in-person mode for breaks,
   - linking an email to an anonymous account,
   - CAPTCHA on sign-in if abuse ever appears.
