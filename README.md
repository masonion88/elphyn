# Elphyn

A two-person app for Mason and Claire. See [ELPHYN_PLAN.md](ELPHYN_PLAN.md). The friends' game it grew out of, Pigeon Ops, is parked at the git tag `pigeon-ops-v1` (its backend and secrecy test are still here).

## Commands

| | |
|---|---|
| `npm run dev` | Run the app locally (needs `.env.local`, see `.env.example`) |
| `npm run build` | Type-check and build |
| `npm run db:push` | Apply new migrations in `supabase/migrations` to the linked Supabase project |
| `npm run db:advisors` | Supabase's security checks against the live database |
| `npm run test:elphyn` | Elphyn's secrecy and authorization tests |
| `npm run test:secrecy` | The parked Pigeon Ops secrecy test |
| `npm run test:all` | Both |

The tests create throwaway users (`elphyn-test-…@example.com`) through the admin API, so they need `SUPABASE_SECRET_KEY` in `.env.local`, plus a linked Supabase CLI for the checks that read hidden tables.

## Where things run

- **App:** Vite + React on Vercel. Only the publishable key and the VAPID public key reach the browser.
- **Push:** the database queues notifications in `private.outbox`; `pg_cron` and `pg_net` call `api/dispatch.ts` (Vercel) with a shared secret, which sends them with `web-push`.
- **Keep-alive:** a daily Vercel cron calls `api/keepalive.ts`, which makes one database request and cleans up unused recordings.
