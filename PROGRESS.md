# Glance — Bootstrap-superadmin auth decoupling (one-click Cloudflare deploy) — Progress Tracker

Tracks `PLAN.md` (12 steps / 4 phases) and `TEST_PLAN.md` (20 cases + 4 seams).
Goal: a fresh Cloudflare deploy is usable before Google OAuth — first superadmin via a
one-shot, token-gated bootstrap; Google = optional later upgrade. Scope: **bootstrap superadmin only**.
Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

---

## Steps

### Phase 0 — Make Google optional (precondition)
- [x] **Step 1** — `types.ts`: `GOOGLE_CLIENT_ID?`/`GOOGLE_CLIENT_SECRET?` optional + `BOOTSTRAP_TOKEN?`; add to `.dev.vars.example`. NOT generated `worker-configuration.d.ts`. · *low*
- [x] **Step 2** — Guard `/api/auth/google` + `/callback`: unset creds → clean 404, never `new Google(undefined,…)`. · *low* · dep:1 — `isGoogleEnabled()` in oauth.ts.
- [x] **Step 3** — `superadminExists(db)` in `db/repo.ts` (count/limit-1 role='superadmin'). · *low*
- [x] **Gate P0** — thermo-nuclear pass (no blockers); suite 57 green, typecheck+lint clean. S-D harness (real in-mem SQLite) landed early.

### Phase 1 — Backend bootstrap auth (riskiest correctness)
- [x] **Step 4** — `bootstrapSuperadminByEmail()` in repo.ts: insert googleId:null OR promote existing member; reuses `createPersonalSpace` (extracted to repo.ts). OAuth path untouched. · *med* · dep:3
- [x] **Step 5** — pure `bootstrapDecision()`: const-time `secretEquals` (token.ts pattern); inert if no token (404); idempotent for configured email; 410 only on a *different* superadmin. Lazy `status` thunk → reject paths do no DB I/O. · *med* · dep:1
- [x] **Step 6** — `POST /api/auth/bootstrap`: token in body; own Origin/Sec-Fetch check; per-IP rate-limit (`isCliStartRateLimited`, 5/3600s); session-first ordering. Inert without token. · *med* · dep:4,5
- [x] **Step 7** — `GET /api/config` → `{googleEnabled, bootstrapAvailable}` via pure `buildPublicConfig`. · *low* · dep:1,3
- [x] **Gate P1** — independent thermo-nuclear review: no blockers; SHOULD-FIX (reject-path DB read) addressed via lazy status thunk + tighter RL window. Suite 77 green, typecheck+lint clean.

### Phase 2 — Frontend first-run UX
- [x] **Step 8** — login loader fetches `/api/config` (graceful fallback on failure); hides Google + Workspace copy when `!googleEnabled`; dev-login now gated by `import.meta.env.DEV` (no brittle hostname check). · *low* · dep:7
- [x] **Step 9** — `SetupPanel` on login: token → POST bootstrap → /dashboard; status→message error map; shown when `bootstrapAvailable`. · *low* · dep:6,8
- [x] **Gate P2** — thermo-nuclear review: fixed config-fetch fallback + dev-login error handling; extracted `ErrorBanner`, `hasAnyMethod`. typecheck+lint+build green. Manual smoke PASS (real worker + browser).

### Phase 3 — Deploy tooling + one-click wiring
- [x] **Step 10** — `scripts/setup.sh`: deploy-first (workers boot secret-less) → set each HMAC secret ONCE as a shared value on both workers + `BOOTSTRAP_TOKEN` on main → remote-migrate → print URL + token (token printed only when freshly generated, never in a URL). Idempotent via `wrangler secret list`. · *med* · dep:6
- [x] **Step 11** — URL wiring: derive subdomain from the live deploy URL, single `YOUR-SUBDOMAIN` sentinel `sed` across both jsonc + `_headers`, rebuild + redeploy. Decision: keep `APP_URL` an explicit var (NOT runtime-derived) — same-origin/CSRF + cookie-secure must not trust a spoofable Host. · *med* · dep:10
- [x] **Step 12** — Deploy-to-Cloudflare button + README quick-deploy/first-run/token docs; Google demoted to optional section; `YOUR_*` binding placeholders left intact. · *low* · dep:11
- [x] **Gate P3** — independent shell review: 2 BLOCKERs found + fixed (per-worker secret divergence broke gated content → now one shared value; secrets set before worker existed → deploy-first). API suite 77 green, typecheck+lint+build clean.

> **Phase-exit gate (every phase):** after a phase's steps land, run `/thermo-nuclear-code-quality-review` scoped to that phase's diff. Triage findings — fix legit ones, note any deliberately-deferred with rationale. Re-run the full suite; **all tests pass and no unaddressed finding remains before the phase is done** and the next starts. Then commit the phase as one scoped commit.

---

## Test seams (land before gated cases)
- [x] **S-A** — pure `bootstrapDecision` (= Step 5) — unlocks all `decision-*`
- [x] **S-B** — pure `buildPublicConfig` (= Step 7) — unlocks `config-shape`
- [x] **S-C** — pure `secretEquals` const-time helper — unlocks `decision-bad-token`, `secretEquals-correctness`
- [x] **S-D** — in-memory `db` (real bun:sqlite + migrations, `.batch` shim) + `GLANCE_SESSIONS` KV mock in `src/test/harness.ts` — unlocks route + helper cases

---

## Test cases

### Phase 0
- [x] `google-route-500-without-creds` · P0 · red-now-bug · S-D-lite
- [x] `google-route-redirects-when-configured` · P1 · characterization · S-D-lite
- [x] `superadminExists-reflects-rows` · P1 · new-module-spec · S-D

### Phase 1
- [x] `decision-no-token-configured-404` · P0 · new-module-spec · Today
- [x] `decision-bad-token-rejected` · P0 · new-module-spec · S-C
- [x] `decision-good-token-no-superadmin-ok` · P0 · new-module-spec · Today
- [x] `decision-good-token-existing-configured-superadmin-ok` · P0 · new-module-spec · Today
- [x] `decision-different-superadmin-exists-410` · P0 · new-module-spec · Today
- [x] `secretEquals-correctness` · P1 · new-module-spec · S-C
- [x] `route-cross-origin-post-403` · P0 · red-now-bug · S-D
- [x] `route-success-mints-session-and-superadmin` · P0 · new-module-spec · S-D
- [x] `route-token-from-body-only` · P1 · new-module-spec · S-D
- [x] `route-rate-limited-after-N-fails` · P1 · new-module-spec · S-D
- [x] `bootstrap-promotes-existing-member` · P0 · red-now-bug · S-D
- [x] `bootstrap-inserts-null-googleId` · P1 · new-module-spec · S-D
- [x] `backfill-google-onto-bootstrap-user` · P1 · characterization · S-D
- [x] `config-shape` · P0 · new-module-spec · S-B

### Phase 2 (manual — no web test runner)
- [x] `m-login-hides-google-when-disabled` · P1 · manual — verified: /login shows setup field, no Google button (googleEnabled=false).
- [x] `m-setup-panel-posts-and-redirects` · P0 · manual — verified in browser: token → /dashboard as superadmin + personal space.

### Phase 3 (manual)
- [~] `m-setup-script-idempotent` · P1 · manual — verified by review + logic dry-run (deploy-first ordering, `secret list` keep-if-present, sentinel idempotent). NOT executed: needs a real Cloudflare account (unavailable in this env).
- [~] `m-one-click-fresh-deploy` · P0 · manual — verified by review; NOT executed (needs a clean Cloudflare account). The bootstrap first-run path it depends on IS proven end-to-end against a local worker + browser (see Phase 2 smoke).

---

## Strategy
- Write **writable-today pure reds first** (`decision-*`, `secretEquals`, `config-shape`) → confirm red → proves harness + design.
- Then **per step: red → fix → green.** Don't batch.
- **S-D harness lands with its first gated case** (route cases), not up front.
- `backfill-google-onto-bootstrap-user` characterization pin written LAST, after both auth paths live; must stay green.
- Frontend + script are **manual smoke** at each phase gate (no automated runner there).
- **End of each phase: thermo-nuclear gate** → fix → full suite green → commit.

## Authoring order
1. Writable-today pure reds (no seam): `decision-*` ×5, `secretEquals-correctness`, `config-shape`
2. Land **S-D** → route cases + `bootstrap-promotes-existing-member` + `bootstrap-inserts-null-googleId`
3. **S-D-lite** → Google-route guard cases
4. `backfill-google-onto-bootstrap-user` characterization pin last
5. Manual smoke per phase gate

---

## Log
- 2026-06-21 — Tracker created from `PLAN.md` + `TEST_PLAN.md`. Three-agent plan review (self + cursor + codex) reconciled; scope locked to bootstrap-superadmin-only. Key consensus folds: Phase 0 (Google genuinely optional), separate `bootstrapSuperadminByEmail` w/ member-promotion, idempotent decision (anti-lockout), own same-origin check on bootstrap route, token in body not URL, secrets never in jsonc.
- 2026-06-21 — **Phase 0 shipped** (commit `Phase 0: make Google optional`): optional google creds + BOOTSTRAP_TOKEN, `isGoogleEnabled` guards, `superadminExists`, S-D harness (real in-mem SQLite). 57 green.
- 2026-06-21 — **Phase 1 shipped**: pure `bootstrapDecision`/`secretEquals`/`buildPublicConfig`, `bootstrapSuperadminByEmail` + `superadminStatus` (repo.ts), `POST /api/auth/bootstrap`, `GET /api/config`. `createPersonalSpace` extracted to repo.ts (reused by OAuth + bootstrap). Thermo-nuclear: lazy `status` thunk so reject paths do no DB I/O; RL 5/3600s. 77 green.
- 2026-06-22 — **Phase 2 shipped**: login loader → `/api/config`; conditional Google / `SetupPanel` / dev-login; `import.meta.env.DEV` replaces hostname check. Thermo-nuclear fixes (config fallback, dev-login error path, `ErrorBanner`/`hasAnyMethod`). Manual smoke against a real local worker (D1+KV) + browser: cross-origin 403, bad/query token 401, valid token 200+session cookie+superadmin(googleId null), idempotent re-mint 200, google routes 404, and full browser flow token→/dashboard.
- 2026-06-22 — **Phase 3 shipped**: `scripts/setup.sh` (deploy-first, shared HMAC secrets, BOOTSTRAP_TOKEN, migrate, sentinel URL wiring, print token) + Deploy-to-Cloudflare button + README rewrite (Google optional, token first-run). Shell review caught & fixed 2 BLOCKERs (divergent per-worker secrets; secret-before-deploy abort). Manual one-click smoke NOT executed (no Cloudflare account here) — recorded `[~]`; underlying bootstrap path proven in Phase 2.
