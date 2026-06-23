# TEST_PLAN — Bootstrap-superadmin auth decoupling

Bind every case to a real public interface. Repo idiom = pure helpers (`checkAccess`,
`isCliStartRateLimited`) + light `app.request` with injected env (`csrf.test.ts`).
No DB/KV integration harness exists → one minimal seam (S-D) provides in-memory fakes.

## Seams
- **S-A** — extract pure `bootstrapDecision(args)` (Step 5). Unlocks all decision cases. (= the step)
- **S-B** — extract pure `buildPublicConfig(googleEnabled, bootstrapAvailable)` (Step 7). Unlocks config shaping.
- **S-C** — extract pure `secretEquals(a, b)` constant-time helper (reuse `lib/token.ts` `crypto.subtle` pattern). Unlocks compare cases.
- **S-D** — minimal in-memory `db` (Variables.db stub) + `GLANCE_SESSIONS` KV mock, injected via Hono `app.request(path, init, env)` like `csrf.test.ts`/`mockKv()` in `auth-cli.test.ts`. Unlocks route + repo-helper cases.

## Cases

### Phase 0 — Google optional
- `google-route-500-without-creds` · P0 · **red-now-bug** · S-D-lite (no db) — `/api/auth/google` with `GOOGLE_*` unset → clean 404/JSON error, NOT a thrown 500 from `new Google(undefined,…)`.
- `google-route-redirects-when-configured` · P1 · characterization · S-D-lite — creds set → 302 to accounts.google.com (don't regress OAuth).
- `superadminExists-reflects-rows` · P1 · new-module-spec · S-D — true iff a role='superadmin' row exists.

### Phase 1 — bootstrap decision (pure, writable today)
- `decision-no-token-configured-404` · P0 · new-module-spec · Today — `expectedToken` unset → `{status:404}` (inert).
- `decision-bad-token-rejected` · P0 · new-module-spec · S-C — wrong token → `{status:401}`.
- `decision-good-token-no-superadmin-ok` · P0 · new-module-spec · Today — `{ok:true}`.
- `decision-good-token-existing-configured-superadmin-ok` · P0 · new-module-spec · Today — idempotent re-mint (anti-lockout) → `{ok:true}`.
- `decision-different-superadmin-exists-410` · P0 · new-module-spec · Today — a non-configured superadmin already exists → `{status:410}`.
- `secretEquals-correctness` · P1 · new-module-spec · S-C — equal→true; unequal & length-mismatch→false.

### Phase 1 — bootstrap route (S-D)
- `route-cross-origin-post-403` · P0 · **red-now-bug** · S-D — POST with foreign Origin & NO session cookie → 403 (own check; `requireSameOrigin` is a no-op here).
- `route-success-mints-session-and-superadmin` · P0 · new-module-spec · S-D — valid token → 200, `glance_session` cookie set, user row role='superadmin', googleId null.
- `route-token-from-body-only` · P1 · new-module-spec · S-D — token in query string is ignored/rejected; only POST body accepted.
- `route-rate-limited-after-N-fails` · P1 · new-module-spec · S-D — repeated bad tokens from one IP → 429.

### Phase 1 — admin creation helper (S-D)
- `bootstrap-promotes-existing-member` · P0 · **red-now-bug** · S-D — pre-existing `member` row for SUPERADMIN_EMAIL → promoted to superadmin (guards the `findOrCreateUser` non-promotion trap, auth.ts:204).
- `bootstrap-inserts-null-googleId` · P1 · new-module-spec · S-D — fresh insert leaves googleId null + personal space created.
- `backfill-google-onto-bootstrap-user` · P1 · characterization · S-D — bootstrap user (googleId null) then Google login same lowercased email → same id, googleId backfilled, role stays superadmin.

### Phase 1 — config shaping (pure)
- `config-shape` · P0 · new-module-spec · S-B — googleEnabled true only when BOTH client id+secret set; bootstrapAvailable true only when `!superadmin && token set`.

### Phase 2 — frontend (manual smoke — no web test runner)
- `m-login-hides-google-when-disabled` · P1 · manual — `/api/config` googleEnabled=false → no Google button, copy adjusted.
- `m-setup-panel-posts-and-redirects` · P0 · manual — token submit → POST bootstrap → /dashboard; bad token shows error.

### Phase 3 — deploy tooling (manual smoke)
- `m-setup-script-idempotent` · P1 · manual — re-run sets/over-writes secrets, doesn't duplicate resources; prints URL + token (token not in any URL).
- `m-one-click-fresh-deploy` · P0 · manual — clean account → button/script → /setup → superadmin, Google never configured.

## Authoring order
1. Writable-today pure reds: `decision-*` (5) + `secretEquals-correctness` + `config-shape`.
2. Land **S-D** fake db+KV harness → route cases + `bootstrap-promotes-existing-member` + helper cases.
3. **S-D-lite** → Google-route guard cases.
4. `backfill-google-onto-bootstrap-user` characterization pin LAST (needs both paths live).
5. Frontend + script = manual smoke at each phase gate.
