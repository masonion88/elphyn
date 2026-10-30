# Elphyn: build plan

> Pigeon Ops + Zoo for Two, merged and renamed. A two-person app for Mason (Cornell, Ithaca, Eastern time) and Claire (USC, Los Angeles, Pacific time). Both on iPhone.
>
> Put this file and `elphyn-seed-content.json` in the root of the existing `pigeon-ops` repo. Claude Code: read the whole file before planning anything.

---

## 0. Decisions already made

- **Format:** installable web app (home-screen icon plus push notifications on iPhone, installable on Windows from Edge or Chrome). No native app for now.
- **Stack:** the Pigeon Ops Phase 0 stack, unchanged. Vite + React + TypeScript + Tailwind; Supabase (Postgres, Row Level Security, security-definer functions for every write); Vercel Hobby; private GitHub repo.
- **Name:**
  - The home-screen label is **Elphyn**, Claire's chosen name. It's short enough to fit on the home screen.
  - The mascot and app icon are a **Turtlephant**, an original drawing of a turtle-shelled baby elephant. That's him plus her in one creature.
  - If Claire wants to name anything inside the app, let her.
- **The friends' game is parked, not deleted.** The circle and mission engine stays general (a circle's kind is `crew` or `couple`), so Pigeon Ops can come back later on the same backend. Nothing is built for the friends' version in this plan.
- **Cost: $0.** Vercel Hobby, Supabase Free, Google sign-in, and the optional Scriptable widget are all free.

---

## 1. Design principles (every feature has to trace back to one)

| # | Principle | Evidence | What it becomes |
|---|---|---|---|
| 1 | **Voice carries more than text.** | 68 girls aged 8–12 were put through a stressful task, then talked to their mothers in person or by phone, messaged them, or had no contact. Talking lowered cortisol and raised oxytocin. Messaging looked like no contact. (Seltzer et al., *Evolution and Human Behavior*.) Caveat: mothers and daughters, not couples. | Voice is a first-class option on every note, answer, and letter. |
| 2 | **Small bids, turned toward.** | In Gottman's newlywed study, followed up six years later, couples still married had turned toward each other's bids 86% of the time; couples who divorced, 33%. | One-tap "thinking of you" / good morning / goodnight, and one tap to send one back. |
| 3 | **Celebrate each other's good news.** | Sharing good news, and having a partner respond enthusiastically, is linked to higher relationship well-being: intimacy and daily satisfaction (Gable et al., 2004, *JPSP*). | A "good news" flow that makes an enthusiastic reply easy. |
| 4 | **Everyday gratitude.** | Expressed gratitude boosts relationship connection, with effects visible the next day: a "booster shot" (Algoe, Gable & Maisel, 2010, *Personal Relationships*). | The jar: thank-you and proud-of-you notes. |
| 5 | **New things together.** | Couples who do more exciting activities together feel less bored and rate their relationships higher (Aron et al., 2000, *JPSP*). | Secret missions on calls, same-moment dares, staged feature reveals. |
| 6 | **Distance can deepen disclosure.** | Long-distance couples make more adaptive self-disclosures and idealize more, and both build intimacy (Jiang & Hancock, 2013, *Journal of Communication*). | Hypotheticals (her ritual), same-moment questions. |
| 7 | **A balanced diet, not one "love language."** | A 2024 review found no support for matching love languages; people benefit from all forms of love. The authors suggest a "balanced diet" (Impett, Park & Muise, *Current Directions in Psychological Science*). | Many channels: words, voice, play, gifts, plans, mail. No love-language quiz. |
| 8 | **Wonder lives offline** (Mason's rule). | n/a | Everything points at a call, something in the mail, or the reunion. |

**Hard rules:**
- **The app never writes love for them.** No AI-generated messages, answers, letters or missions in the product. Claude can help build the app; it doesn't speak in it.
- **No streaks, no guilt mechanics, no scoring love.** Missions keep their game score because they're a game. Nothing else gets scored.
- **Sealed means sealed on the server.** Anything hidden from someone (unopened notes and letters, a partner's answer before you give yours, an active mission) must be unreadable through the client library, not just hidden in the UI. This is the same bar as the Pigeon Ops secrecy test.
- **Claire controls her notifications:** quiet hours in her time zone and an on/off switch per type. Read receipts are optional and off by default.
- **Release features to Claire in stages, not all at once.** Each new section unlocks with a sealed note from Mason ("a new room opened"). It avoids overwhelming her, and the novelty is itself a feature (principle 5).

---

## 2. What carries over

**From Pigeon Ops (Phase 0 is live):**
- The schema: `profiles`, `circles`, `circle_members`, `missions`, `operations`, `assignments`.
- Anonymous auth.
- RLS everywhere, with every write going through a security-definer function that checks the caller. Grants are revoked and re-granted in the same migration that creates each object.
- The secrecy test suite (19 of 19 passing).
- The Vercel deploy and human-friendly join codes.
- The 18-card tender deck Mason reviewed.

**From the Zoo for Two prototype** (a Claude artifact Claire never used, so there's no data to migrate):
- Feature designs for daily animals and moods, same-moment questions, hypotheticals, the jar, sealed letters, missions with case files, and the reunion countdown with both clocks.
- Content is in `elphyn-seed-content.json`. Everything there marked *placeholder* was written by Claude. Mason rewrites or cuts it before Claire sees it. The hypotheticals deck is a backup for when neither of them has one, never a replacement for hers.

**Known operational facts from Phase 0:**
- Commits must be authored as `itsmasonlai@gmail.com`, or Vercel Hobby blocks deploys of the private repo.
- iPhone home-screen apps don't share storage with Safari, so sign-in has to happen inside the installed app.

---

## 3. Phase A: Foundation (Claire sees nothing yet)

### A1. Rename
- **GitHub:** rename the repo from `pigeon-ops` to `elphyn` (Settings → General). Update the local remote.
- **Vercel:** rename the project and get `elphyn.vercel.app` if it's free. Environment variables stay as they are.
- **App identity:**
  - Manifest `name` and `short_name` are "Elphyn". Add `apple-mobile-web-app-title`.
  - An `apple-touch-icon` with the Turtlephant (iOS reads icons from that tag, not the manifest).
  - Theme color, page titles and copy.
- **Supabase:** keep the existing project. No data changes.

### A2. Couple circles and permanent accounts
- **Add `circles.kind`** (`crew` | `couple`). A `couple` circle has exactly 2 members, enforced in SQL.
- **Anonymous-only identity is not acceptable here.** Supabase's docs say an anonymous user "can't access their account if they sign out, clear browsing data, or use another device." Losing an account would lose Claire's letters.
- **Convert to permanent accounts by linking an identity.** Enable manual linking. Check the current docs, then choose:
  - **Preferred: Google** via `linkIdentity`. No email server needed, and the Google OAuth client is free.
  - **Alternative: email one-time code.** This needs custom SMTP: since September 2024, Supabase's default email only sends to your own organization's addresses, at about 2 per hour.
- **Pairing:** Mason creates the couple circle, and Claire joins with its join code *inside the installed app*. A join code is better than an invite link, because the link wouldn't carry over from Safari to the home-screen app.

### A3. Profiles
- Display name, home animal, time zone (Mason `America/New_York`, Claire `America/Los_Angeles`), quiet hours, notification switches per type.

### A4. Spike: push notifications on both iPhones
- **Plumbing:** Web Push with VAPID keys, a service worker, and a `push_subscriptions` table.
- **Subscribing:** on iPhone, subscribing only works inside the installed home-screen app (iOS 16.4 or later), and must start from a tap.
- **Sender:** one server function. Spike two options and pick the one that works reliably:
  - (a) A Vercel Node function using `web-push`.
  - (b) A Supabase Edge Function.
- **Triggers:** Supabase Database Webhooks on inserts for event-driven pushes. `pg_cron` plus `pg_net` for scheduled ones (confirm they're available on the Free plan).
- **Passes when:** a test notification arrives on both iPhones, and tapping it opens the right screen.

### A5. Spike: voice notes on both iPhones
- **The risk:** there's a public report of `MediaRecorder` working the first time a home-screen app opens and failing after a relaunch. Test record → upload → play on both phones, including after closing and reopening the app.
- **Fallback:** if recording is flaky, attach a Voice Memos file instead (a file input that takes audio).
- **Storage:** a private Supabase Storage bucket `voice`. Only the two members can read it, through short-lived signed URLs.

### A6. Extend the secrecy test
- Cover every new table, bucket and function.
- An outsider can read nothing.
- A partner can't read sealed content early.
- The push endpoint rejects unauthenticated calls.

**Phase A is done when:** both phones are installed and signed in permanently, a test push lands on both, a voice note round-trips on both, and the secrecy test passes.

---

## 4. Phase B: Launch to Claire (keep it small)

**Target date:** around their one-year anniversary. Mason said "about 11 months" in early October, so that's roughly mid-November; confirm the date. Otherwise, before winter break.

1. **Today**
   - **Daily animals:** each of them picks "today I'm a ___" (animal plus mood) and adds one line about why.
   - **Same moment:** one question a day, sent to both at the same instant (default 9:00pm Eastern = 6:00pm Pacific; changeable).
   - **Your answer unlocks theirs,** enforced on the server.
2. **Hypotheticals.** Her ritual, so make asking effortless for her.
   - Either one asks. The other answers in text or voice.
   - The asker sees the answer right away. If both answer, each answer unlocks only after you've given yours, enforced on the server.
   - There's a dice button for the backup deck.
3. **The jar.**
   - Proud-of-you, thank-you and miss-you notes, in text or voice.
   - The recipient sees a count and opens one at a time with a small ritual. Contents stay sealed on the server until opened.
4. **Bids.**
   - One tap sends "thinking of you", good morning or goodnight, with the sender's animal.
   - The notification lets the partner send one back with one tap.
   - No counters, no history pressure.
5. **Countdown.**
   - The next time they're together; either of them can set it.
   - Both clocks show, plus the distance (Ithaca to LA is about 2,300 miles as the crow flies).
   - Milestone notifications at 30, 14, 7, 1 and 0 days.
6. **Here now.** When both have the app open at the same time, show "Claire is here right now. Call?" using Supabase Realtime presence. The app points at the call.

**Claire's first five minutes** (design this screen by screen):
1. Mason texts her a link. It opens in Safari, not inside Instagram.
2. Three illustrated steps: Share → Add to Home Screen → open the Elphyn icon.
3. In the app: sign in, enter the join code, tap to allow notifications.
4. Pick her animal (defaults offered: elephant, chicken).
5. **The first thing she sees is a sealed letter from Mason: "Open when you first open Elphyn."** He writes it himself.

**Launch gate:** secrecy tests pass for all sealed content, push works on her phone, and nothing is lost after closing and reopening the app.

---

## 5. Phase C: Play and depth (staged reveals after launch)

1. **Missions.**
   - Port the Pigeon Ops core loop to couple circles: briefing → call → debrief → reveal → case file.
   - Keep decoys and author credit. In a 2-person circle, missions written by the target are allowed (the rule already decided in Phase 0).
   - Seed with the tender deck. Claire can write missions too.
2. **Sealed letters.**
   - "Open when…" letters work on the honor system, with a confirm step.
   - Dated letters can't be opened before their date, enforced on the server. A notification goes out the morning one unlocks.
   - Text or voice.
3. **Good news.**
   - One person shares a win, and the partner gets a notification.
   - The response screen makes an enthusiastic reply easy: a big reaction plus a "tell me more" question.
   - Nothing is scored.
4. **Question ladders** (optional). Sets of questions that get deeper as they go, written by the two of them.

## 6. Phase D: Bring it offline

1. **Reunion list.** Things to do together when they're together, checked off together.
2. **Coupons.** "Redeemable in person," for small acts and silly favors. Redeemed at the reunion.
3. **Pigeon post.**
   - Log a real letter or postcard you mailed. The partner marks it when it arrives, and the app shows "in flight" until then.
   - This is where the pigeon theme lives on.
4. **Same sky.** A photo prompt; both photos are revealed together. Uses the camera through a file input; photos go in a private `photos` bucket.
5. **Our book.**
   - A timeline of case files, opened letters and notes, hypotheticals, and reunions.
   - Either person can export everything (JSON at minimum).
6. **Home-screen widget through Scriptable,** a free iPhone app that runs JavaScript widgets.
   - Web apps can't make widgets, so this is the workaround.
   - A read-only endpoint with a revocable per-user token returns the latest opened note or a photo from the partner.
   - A small widget script displays it.

**Later, only if earned:**
- A native app (Expo plus Apple's $99/yr developer program) if real widgets, sounds or haptics matter after months of use.
- The Pigeon Ops crew front door for the friends.

---

## 7. Notifications

| Event | Who gets it | Example copy (never reveal sealed content) |
|---|---|---|
| Partner asked a hypothetical | Partner | "🐔 Claire has a hypothetical for you." |
| Partner answered your hypothetical | Asker | "🐢 Mason answered." |
| Same-moment question | Both, at the shared instant | "Same moment: what's the light like where you are?" |
| Partner answered same moment | The other one | "Claire answered. Yours unlocks hers." |
| Jar note dropped in | Recipient | "Something landed in your jar." |
| Letter sealed | Recipient | "A sealed letter arrived: 'Open when you can't sleep.'" |
| Dated letter unlocks | Recipient, in the morning | "A letter unlocked today." |
| Bid | Recipient | "🐢 Mason is thinking of you." |
| Good news | Partner | "🐢 Mason has good news." |
| Countdown milestone | Both | "7 sleeps until winter break." |
| Mission filed | Partner | "Case file: did you notice?" |
| Pigeon post sent | Recipient | "A pigeon is in flight." |

**Rules:**
- **Quiet hours** default to midnight–8am in each person's own time zone. Notifications during quiet hours are held, then delivered when they end.
- **Every type can be switched off** per person.
- **Bundle bursts:** five jar notes in a minute become one notification.
- **Prune dead subscriptions:** when sending to one fails as gone (HTTP 410), remove it.

---

## 8. Data model additions (sketch: refine it, but keep it small)

**Existing tables:**
- `circles`: add `kind` (`crew` | `couple`).
- `profiles`: add `home_animal`, `timezone`, `quiet_start`, `quiet_end`, `notify` (jsonb of per-type switches).

**New tables:**

| Table | Columns |
|---|---|
| `couple_settings` | `circle_id` (pk), `reunion_on`, `reunion_label`, `same_moment_at_utc`, `day_timezone` (default `America/Los_Angeles`, so a late night in Ithaca still counts as today) |
| `daily_entries` | `circle_id`, `user_id`, `day`, `animal`, `mood`, `line`, `moment_text`, `moment_voice_path`, timestamps; primary key (`circle_id`, `user_id`, `day`) |
| `hypotheticals` | `id`, `circle_id`, `asked_by`, `text`, `voice_path`, `created_at` |
| `hypothetical_answers` | `hypothetical_id`, `user_id`, `text`, `voice_path`, `created_at` |
| `notes` | `id`, `circle_id`, `from_id`, `to_id`, `kind` (`proud` \| `thanks` \| `miss`), `created_at`, `opened_at` |
| `note_bodies` | `note_id`, `text`, `voice_path` |
| `letters` | `id`, `circle_id`, `from_id`, `to_id`, `title`, `mode` (`when` \| `date`), `unlock_on`, `created_at`, `opened_at` |
| `letter_bodies` | `letter_id`, `body`, `voice_path` |
| `bids` | `id`, `circle_id`, `from_id`, `to_id`, `kind`, `animal`, `created_at`, `returned_at` |
| `good_news`, `good_news_responses` | (Phase C) |
| `reunion_items`, `coupons`, `mail` | (Phase D) |
| `push_subscriptions` | `user_id`, `endpoint` (unique), `p256dh`, `auth`, `created_at`, `last_ok_at`, `failures` |
| `notification_log` | for quiet hours, bundling and rate limits |
| `widget_tokens` | (Phase D) the token stored hashed, revocable |

Notes and letters keep their contents in separate tables (`note_bodies`, `letter_bodies`) so a contents row can be sealed on its own. The sender can always read it. The recipient can read it only once it has been opened, or after its date.

Opening goes through security-definer functions, `open_note()` and `open_letter()`, which check the caller and the date and stamp `opened_at`.

---

## 9. Security and privacy (non-negotiable)

- **Access rules:** RLS on every new table and bucket, and every write through a security-definer function that checks the caller. Revoke and grant in the same migration that creates each object.
- **Sealed content is enforced in SQL,** never only in the UI. Extend the acceptance test to try reading each kind of sealed content through the client library, as Claire's account and as an outsider. Every attempt must fail.
- **Notifications never carry sealed content.**
- **Keys:** the VAPID private key, the service-role key and any SMTP credentials live only in Vercel and Supabase server settings. Never in client code or git.
- **The limit:** this is not end-to-end encrypted, so the infrastructure could technically reach the data. Don't store anything you'd be devastated to see leaked.
- **Leaving:** either person can export everything, and deleting the couple deletes its content and files.
- **Supabase Free pauses a project after about 7 days of low activity.** Holidays together could trigger it. Restoring from the dashboard keeps the data. Check whether scheduled jobs count as activity.

---

## 10. Content

- `elphyn-seed-content.json`:
  - Tender deck: 18 missions, Mason-reviewed.
  - Placeholder decks: 50 extra missions, 100 hypotheticals, 36 same-moment questions, 7 jar starters, 10 open-when titles.
  - 30 animals and 18 moods.
- Seed it from one plain file, so Mason can edit it without touching code. This is the same pattern as `decks.sql`.
- In-app, make it obvious that Claire can add her own hypotheticals and missions. Hers are the real deck.

---

## 11. How to work (same rules as Pigeon Ops)

1. **Check the official docs first** for: Supabase identity linking and auth providers, Supabase custom SMTP, Web Push on iOS home-screen apps, `web-push` or Edge Function push sending, `pg_cron` and `pg_net`, Storage RLS and signed URLs, Realtime presence, and MediaRecorder on iOS Safari. Don't rely on memory.
2. **Plan first:** show the rename steps, the migrations and RLS for Phases A and B, the push design, and the two spike test plans. Wait for an OK.
3. **One phase at a time:** run, test, commit, deploy. After each phase, give the URL and a 3-line summary.
4. **Ask before** adding dependencies, anything that could cost money, or changing a hard rule in section 1.
5. **Put ideas in `IDEAS.md`,** not in the build.
6. **Walk Mason through any dashboard steps** (Google OAuth client, Supabase settings, Vercel rename) in numbered plain English.

---

## Sources

- Seltzer et al., "Instant messages vs. speech" (*Evolution and Human Behavior*), as reported by HealthDay: https://www.healthday.com/health-news/public-health/texting-doesn-t-replace-the-feel-good-effects-of-talking-study-says-672965.html
- Gottman Institute, "Turn Toward Instead of Away": https://www.gottman.com/blog/turn-toward-instead-of-away/
- Gable et al. (2004), *JPSP*: https://pubmed.ncbi.nlm.nih.gov/15301629/
- Algoe, Gable & Maisel (2010), via ScienceDaily: https://www.sciencedaily.com/releases/2010/05/100524072912.htm
- Aron et al. (2000), via Greater Good in Action: https://ggia.berkeley.edu/practice/practice_as_pdf/exciting_activities_for_couples
- Jiang & Hancock (2013), Stanford Social Media Lab: https://sml.stanford.edu/publications/2013/absence-makes-communication-grow-fonder-geographic-separation-interpersonal-media
- Impett, Park & Muise (2024), via University of Toronto: https://www.utoronto.ca/news/little-evidence-linking-five-love-languages-healthy-relationships-researchers-say
- Supabase anonymous sign-ins and identity linking: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase default email provider change: https://github.com/orgs/supabase/discussions/29370
- Supabase scheduled functions (`pg_cron` and `pg_net`): https://supabase.com/docs/guides/functions/schedule-functions
- iOS web app limits in 2026: https://tappwa.com/blog/ios-pwa-limitations-2026
- MediaRecorder in iOS home-screen apps (forum report): https://developer.apple.com/forums/thread/797987
- Scriptable widgets: https://dev.to/steventey/building-an-ios-app-with-30-lines-of-javascript-3i1k
