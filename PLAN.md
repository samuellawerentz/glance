# PLAN — Decouple first-run admin auth from Google OAuth (one-click Cloudflare deploy)

**Goal:** A fresh Cloudflare deploy is usable before Google OAuth exists. First superadmin is
established via a one-shot, token-gated bootstrap. Google becomes an optional post-setup upgrade.

**Bias:** additive but minimal — reuse the existing `dev-login` / `findOrCreateUser` / pure-helper
idioms. No new framework. Each step independently shippable.

## Key codebase facts
- `users.googleId` is nullable (schema.ts:10) → non-Google user is schema-legal.
- `dev-login` (routes/auth.ts) already does findOrCreateUser+createSession with no Google, gated to localhost APP_URL.
- `findOrCreateUser` grants superadmin when email === SUPERADMIN_EMAIL; matches existing user by googleId then email (so Google can backfill onto a bootstrap user later).
- Google envs only read inside `createGoogle()` within route handlers → worker boots fine without them.
- Tests are pure-unit (checkAccess, isCliStartRateLimited, generateUserCode) + light `app.request` with fake env. No DB/KV integration harness.

## Phase 0 — Make Google optional (precondition; consensus-added)
Without this a bootstrap-first deploy 500s on any Google route and the types lie.
- Step 1: In `types.ts`, make `GOOGLE_CLIENT_ID?`/`GOOGLE_CLIENT_SECRET?` optional; add `BOOTSTRAP_TOKEN?: string`. Add `BOOTSTRAP_TOKEN` to `.dev.vars.example`. **Do NOT touch generated `worker-configuration.d.ts`.** *low*
- Step 2: Guard `/api/auth/google` + `/api/auth/callback` (and `createGoogle`/`OAUTH_SCOPES` usage): if creds unset → `404`/clean JSON error, never construct `new Google(undefined,...)`. *low* dep:1
- Step 3: Add `superadminExists(db)` to `db/repo.ts` (count/limit-1 on role='superadmin'). *low*
- Gate P0.

## Phase 1 — Backend bootstrap auth (riskiest correctness)
- Step 4: Add **separate** `bootstrapSuperadminByEmail(db, email, name)` (codex+consensus — do NOT make `findOrCreateUser` nullable; avoids `eq(googleId, undefined)` hazards + null overwrites). It must **insert with `googleId: null` OR promote an existing `member` row to `superadmin`** (`findOrCreateUser` at auth.ts:204 does NOT promote). Reuse `createPersonalSpace` (private in auth.ts — extraction touches auth.ts). Leave OAuth path byte-for-byte. Leaving `googleId` null + same lowercased email is what enables later Google backfill. *med* dep:3
- Step 5: Pure `bootstrapDecision({hasSuperadmin, superadminIsConfiguredEmail, tokenProvided, expectedToken})` → `{ok}|{status}`. **Constant-time compare via the `crypto.subtle` pattern in `lib/token.ts`** (no `timingSafeEqual` in Workers). Inert when `expectedToken` unset (404). **Idempotent to avoid lockout (codex):** allow when no superadmin OR the only superadmin IS `SUPERADMIN_EMAIL` (re-mint session); `410` only when a *different* superadmin already exists. *med* dep:1
- Step 6: `POST /api/auth/bootstrap` route over Steps 4+5. Token in **POST body, never URL** (codex — query leaks via history/logs/referrer). **Security:** route does its **own** Origin/Sec-Fetch same-origin check — `requireSameOrigin` is a no-op here (no session cookie on first run, middleware/auth.ts:15, codex). Per-IP failed-attempt rate-limit reusing `isCliStartRateLimited`. **Ordering for lockout-safety:** create session (KV) and confirm before the run is "done"; idempotent decision (Step 5) lets a retry recover if KV failed mid-way. Inert-without-token makes merging-before-UI safe. *med* dep:4,5
- Step 7: `GET /api/config` (public, but still behind `requireSameOrigin`+`withDb` — documented, GET same-origin is fine) → `{googleEnabled, bootstrapAvailable}` via pure `buildPublicConfig(bool,bool)` fed by `superadminExists`. *low* dep:1,3
- Gate P1.

## Phase 2 — Frontend first-run UX
- Step 8: Login loader fetches `/api/config` (reshape loader; drop brittle `window.location.hostname` dev check). Hide Google button + Workspace-only copy when `!googleEnabled`. *low* dep:7
- Step 9: First-run setup panel — token input → POST `/api/auth/bootstrap` → redirect /dashboard; error states. Shown when `bootstrapAvailable`. *low* dep:6,8
- Gate P2.

## Phase 3 — Deploy tooling + one-click wiring
- Step 10: `scripts/setup.sh` (dir does not exist yet). Scope = **secrets + migrate + deploy + print only**: generate SESSION_SECRET/CONTENT_TOKEN_SECRET/BOOTSTRAP_TOKEN → `wrangler secret put` (both workers as needed), remote-migrate, deploy, print bootstrap URL+token. **NOT low risk.** *med* dep:6
- Step 11: URL wiring — substitute post-deploy `workers.dev` URLs into `vars` (APP_URL/CONTENT_URL) of both jsonc + `web/public/_headers` CSP `frame-src`/`frame-ancestors`. **Fragile (comments, placeholders, per-account ids)** — flagged; evaluate deriving APP_URL at runtime instead. *med* dep:10
- Step 12: Deploy-to-Cloudflare button + README first-run/token docs; demote Google to optional. **Do NOT destructively strip `YOUR_*`** — they document the manual path; button provisions by binding regardless. *low* dep:11
- Gate P3.
