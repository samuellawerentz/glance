# Glance — agent notes

Self-hosted static hosting on Cloudflare Workers (Hono) + React/RR7 + D1 + R2 + KV.
Monorepo (`bun` workspaces): `packages/api` (worker + SPA assets), `packages/web` (Vite SPA), `packages/cli`.

## Commands (run from repo root)
- `bun run test` — `bun test` across packages (api has the tests).
- `bun run typecheck` / `bun run lint` (biome) / `bun run build:web`.
- `bun run db:migrate:local` — apply D1 migrations to the local miniflare db (`.wrangler-shared`).
- `bun run dev` — main worker :8787 + content worker :8788 + vite :5173.
- Lint/format: biome (`biome.json`), 2-space, single quotes, no semicolons.

## Testing conventions
- Tests are `bun test` only; pure helpers + light `app.request(path, init, env)` with a cast fake `env` (see `middleware/csrf.test.ts`, `routes/auth-cli.test.ts`).
- **S-D DB/KV harness** = `packages/api/src/test/harness.ts`: a REAL in-memory SQLite via `drizzle-orm/bun-sqlite` (`new Database(':memory:')`), schema applied by reading `drizzle/*.sql` and splitting on `--> statement-breakpoint`. Cast to `DrizzleD1Database`. D1's `.batch` is shimmed (sequential await) since bun-sqlite lacks it. `makeKv()` mocks the `GLANCE_SESSIONS` surface. Prefer this over hand-faking drizzle query chains.
- `tsconfig.json` excludes `src/**/*.test.ts` AND `src/test/**` from typecheck — so test/harness files can use `bun:sqlite`/`node:*` and casts freely without tripping tsc. Keep test-only infra under `src/test/`.
- To exercise a private route helper in a test, `export` it (idiom already used: `findOrCreateUser`, `generateUserCode`).

## Auth model (post bootstrap-decoupling)
- Google OAuth is OPTIONAL: `isGoogleEnabled(env)` (both `GOOGLE_CLIENT_*` set) gates `/api/auth/google` + `/callback` (404 when unset). `BOOTSTRAP_TOKEN` gates first-run admin.
- First superadmin via `POST /api/auth/bootstrap` (token in BODY only; route does its OWN same-origin check since there's no cookie on first run; pure `bootstrapDecision` in `lib/bootstrap.ts` is idempotent/anti-lockout). `GET /api/config` → `{googleEnabled, bootstrapAvailable}` drives the login UI.
- `findOrCreateUser` matches by googleId then email and does NOT change role → a later Google login backfills onto a bootstrap user (googleId null, same email) preserving superadmin. `bootstrapSuperadminByEmail` (in `db/repo.ts`) is the separate promote-or-insert path; `createPersonalSpace` lives in `db/repo.ts` (reused by both auth paths).

## Deploy
- `scripts/setup.sh` is the one-shot: deploy-first → set shared secrets → migrate → wire `workers.dev` URL via the `YOUR-SUBDOMAIN` sentinel → redeploy → print URL + bootstrap token. Provisioning of D1/KV/R2 bindings is the "Deploy to Cloudflare" button's job, NOT the script.
- Never put secrets into the `.jsonc` configs; `YOUR_*` binding placeholders are intentional docs — don't strip them.
