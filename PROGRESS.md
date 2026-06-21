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
- [ ] **Step 4** — `bootstrapSuperadminByEmail()` (separate helper): insert googleId:null OR **promote existing member**; reuse `createPersonalSpace`. OAuth path untouched. · *med* · dep:3
- [ ] **Step 5** — pure `bootstrapDecision()`: const-time compare (token.ts pattern); inert if no token (404); **idempotent for configured email**; 410 only on a *different* superadmin. · *med* · dep:1
- [ ] **Step 6** — `POST /api/auth/bootstrap`: token in body; **own** Origin/Sec-Fetch check; per-IP rate-limit (`isCliStartRateLimited`); session-first ordering. Inert without token. · *med* · dep:4,5
- [ ] **Step 7** — `GET /api/config` → `{googleEnabled, bootstrapAvailable}` via pure `buildPublicConfig`. · *low* · dep:1,3
- [ ] **Gate P1** — thermo-nuclear on Phase-1 diff → address → full suite green → **commit** `Phase 1: token-gated bootstrap auth`

### Phase 2 — Frontend first-run UX
- [ ] **Step 8** — login loader fetches `/api/config`; hide Google + Workspace copy when `!googleEnabled`; drop brittle `hostname` dev check. · *low* · dep:7
- [ ] **Step 9** — first-run `/setup` panel: token → POST bootstrap → /dashboard; error states; shown when `bootstrapAvailable`. · *low* · dep:6,8
- [ ] **Gate P2** — thermo-nuclear on Phase-2 diff → address → full suite green + manual smoke → **commit** `Phase 2: first-run setup UI`

### Phase 3 — Deploy tooling + one-click wiring
- [ ] **Step 10** — `scripts/setup.sh`: gen secrets+token → `wrangler secret put` (never into jsonc) → remote-migrate → deploy → print URL + token (token NOT in URL). · *med* · dep:6
- [ ] **Step 11** — URL wiring: post-deploy `workers.dev` URLs into `vars` (both jsonc) + `_headers` CSP. Fragile — evaluate runtime-derived APP_URL. · *med* · dep:10
- [ ] **Step 12** — Deploy-to-Cloudflare button + README first-run/token docs; Google demoted to optional; do NOT destructively strip `YOUR_*`. · *low* · dep:11
- [ ] **Gate P3** — thermo-nuclear on Phase-3 diff → address → full suite green + manual one-click smoke → **commit** `Phase 3: one-click deploy tooling`

> **Phase-exit gate (every phase):** after a phase's steps land, run `/thermo-nuclear-code-quality-review` scoped to that phase's diff. Triage findings — fix legit ones, note any deliberately-deferred with rationale. Re-run the full suite; **all tests pass and no unaddressed finding remains before the phase is done** and the next starts. Then commit the phase as one scoped commit.

---

## Test seams (land before gated cases)
- [ ] **S-A** — pure `bootstrapDecision` (= Step 5) — unlocks all `decision-*`
- [ ] **S-B** — pure `buildPublicConfig` (= Step 7) — unlocks `config-shape`
- [ ] **S-C** — pure `secretEquals` const-time helper — unlocks `decision-bad-token`, `secretEquals-correctness`
- [x] **S-D** — in-memory `db` (real bun:sqlite + migrations, `.batch` shim) + `GLANCE_SESSIONS` KV mock in `src/test/harness.ts` — unlocks route + helper cases

---

## Test cases

### Phase 0
- [x] `google-route-500-without-creds` · P0 · red-now-bug · S-D-lite
- [x] `google-route-redirects-when-configured` · P1 · characterization · S-D-lite
- [x] `superadminExists-reflects-rows` · P1 · new-module-spec · S-D

### Phase 1
- [ ] `decision-no-token-configured-404` · P0 · new-module-spec · Today
- [ ] `decision-bad-token-rejected` · P0 · new-module-spec · S-C
- [ ] `decision-good-token-no-superadmin-ok` · P0 · new-module-spec · Today
- [ ] `decision-good-token-existing-configured-superadmin-ok` · P0 · new-module-spec · Today
- [ ] `decision-different-superadmin-exists-410` · P0 · new-module-spec · Today
- [ ] `secretEquals-correctness` · P1 · new-module-spec · S-C
- [ ] `route-cross-origin-post-403` · P0 · red-now-bug · S-D
- [ ] `route-success-mints-session-and-superadmin` · P0 · new-module-spec · S-D
- [ ] `route-token-from-body-only` · P1 · new-module-spec · S-D
- [ ] `route-rate-limited-after-N-fails` · P1 · new-module-spec · S-D
- [ ] `bootstrap-promotes-existing-member` · P0 · red-now-bug · S-D
- [ ] `bootstrap-inserts-null-googleId` · P1 · new-module-spec · S-D
- [ ] `backfill-google-onto-bootstrap-user` · P1 · characterization · S-D
- [ ] `config-shape` · P0 · new-module-spec · S-B

### Phase 2 (manual — no web test runner)
- [ ] `m-login-hides-google-when-disabled` · P1 · manual
- [ ] `m-setup-panel-posts-and-redirects` · P0 · manual

### Phase 3 (manual)
- [ ] `m-setup-script-idempotent` · P1 · manual
- [ ] `m-one-click-fresh-deploy` · P0 · manual

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
