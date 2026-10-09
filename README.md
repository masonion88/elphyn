# Pigeon Ops

Secret missions for long-distance friends. See [SPEC.md](SPEC.md).

## Commands

| | |
|---|---|
| `npm run dev` | Run the app locally (needs `.env.local`, see `.env.example`) |
| `npm run build` | Type-check and build |
| `npm run db:push` | Apply new migrations in `supabase/migrations` to the linked Supabase project |
| `npm run db:seed` | Load the built-in decks from `supabase/seed/decks.sql` (safe to re-run) |
| `npm run db:advisors` | Supabase's security checks against the live database |
| `npm run test:secrecy` | The secrecy acceptance test. Signs up 4 anonymous agents per run (limit: 30/hour/IP), so run it sparingly |

## Editing the decks

Edit `supabase/seed/decks.sql`, then run `npm run db:seed`. Instructions are at the top of the file.

## Changing the scoring numbers

They all live in `public.game_rules()` in `supabase/migrations/20261009150100_game_rules.sql`. To change one, add a new migration that redefines that function, then `npm run db:push`.
