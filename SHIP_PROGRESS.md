# Glance ship polish — Progress Tracker

Tracks `SHIP_PLAN.md` (3 phases). Goal: kill the post-upload 404, turn the command palette into a real
search/settings surface, and close the share-to-group discoverability gap.
Revised after 3-agent plan review (self + codex + cursor), 2026-06-28.
Status keys: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.

> **Phase-1 scope decision (user, 2026-06-28):** ship `no-store` first and RE-MEASURE; the readiness
> gate (Steps 2-4) is built ONLY if the 404 still reproduces after Step 1. Steps 2-4 are marked
> *conditional* below.

---

## Steps

### Phase 1 — Kill the 404 (cheap fix first, gate conditional)
- [!] **Step 0** — *(verify/manual — NEEDS USER)* `wrangler d1 info glance-db` (read replication on?) +
      reproduce the 404 (deploy → immediate Open) + capture the 404 response headers (cacheable?).
      Baseline to prove a fix. **Blocked: requires a live deploy (state-changing) — not run autonomously.**
      · *low*
- [x] **Step 1** — `content.ts:serve`: `Cache-Control: no-store` on all 404 paths (missing site row,
      missing file row, missing R2 object). Done via `notFound(c)` helper + injectable db seam. · *low*
- [!] **Checkpoint 1** — *(NEEDS USER)* re-run the Step-0 repro after deploying `no-store`. **404 gone →
      Phase 1 done; skip Steps 2-4.** Still reproducing → build the readiness gate (Steps 2-4). Default
      expectation (3-agent consensus: cached-404, not D1 replica lag): `no-store` suffices. Record in Log.
- [ ] **Step 2** *(conditional)* — `GET /api/sites/:spaceSlug/:siteSlug/ready` near `/exists`. Auth
      MIRRORS the metadata route: resolve `isMember`+`isShared` → `checkAccess` → mint the same content
      URL (`signToken(... user.id ...)` gated / public path) → server-side `fetch(url,{method:'HEAD'})`
      → `{ ready: res.ok }`. Fallback if HEAD flaky = root `/_ready` route on the content worker (NOT
      Range). · *med* · dep:1
- [ ] **Step 3** *(conditional)* — `lib/pollReady.ts`: capped exp backoff (~300ms→3s, ~8s ceiling) over
      `/ready`; `now`/`sleep` injected. · *med* · dep:2
- [ ] **Step 4** *(conditional)* — `dashboard.tsx doUpload()`: add `finalizing` to `UploadState`; poll
      after a successful upload; ready→`done`, timeout→`done`+note. Never hard-fail. · *med* · dep:3
- [x] **Gate P1** — scoped quality pass on the Phase-1 diff · full `bun test` (82 pass) + typecheck + lint
      green · committed `Phase 1: post-upload 404 (no-store on content 404s)` (e05e389). Steps 2-4 deferred
      (conditional on Checkpoint-1 re-measure).

### Phase 2 — Real cmdk search + settings
- [x] **Step 5** — `GET /api/sites/search?q=`: one bounded candidate query (`status='active' AND q-match
      AND (owner OR member-space OR team/public OR sharedSiteIds)`, superadmin⇒all) → in-memory
      `checkAccess` filter (precomputed `memberSpaceIds`/`sharedSiteIds` sets — no N+1) → cap. Factored as
      exported `searchSites()`. Search = "openable" semantics. · *med*
- [x] **Step 6** — `CommandPalette.tsx`: debounced remote search over `/search?q=` (useFetcher,
      event-driven, `onValueChange`). One "Sites" group, Open (select) + Copy URL (trailing button). · *med*
- [x] **Step 7** — Spaces group from `/api/spaces/mine` + Install CLI command (New space/Admin/Theme/Sign
      out already present). Inline Share/Visibility in palette left as deferred non-goal. · *low*
- [x] **Gate P2** — scoped quality pass · full suite (91 pass) + typecheck + lint + `build:web` green ·
      committed `Phase 2: cmdk site search + settings` (c9f09c5).

### Phase 3 — Share-to-group discoverability (UI copy only)
- [x] **Step 8** — `visibility.tsx`: `VISIBILITY_META.group.hint` → "This space only". · *low*
- [x] **Step 9** — `ShareDialog.tsx`: trigger → "Share with people & groups"; empty-groups state + "New
      space" CTA when `groups.length === 0` (navigates `/dashboard?new=space`). · *low*
- [x] **Step 10** *(confirmation)* — Share trigger confirmed on dashboard cards (`dashboard.tsx:693`),
      space cards (`space.tsx:139`), PreviewToolbar (`PreviewToolbar.tsx:119`). `/search` payload now
      carries `isOwner` (ready if the cmdk Share action is built later); action itself deferred. · *low*
- [x] **Gate P3** — scoped quality pass · suite/typecheck/lint/`build:web` green · committed `Phase 3:
      share-to-group discoverability` (ea64a88).

> **Per-phase gate (right-sized):** scoped quality review of the phase diff → triage (fix legit, note
> deferred) → full `bun test` + `typecheck` + `lint` green, no unaddressed finding → one scoped commit.
> Frontend-only steps have no web test runner → manual smoke (bootstrap precedent).

---

## Test seams (land before the cases they unlock)
- [x] **S-SEED** — insert helpers on the S-D harness (`src/test/harness.ts`): `seedUser/seedSpace/
      seedMember/seedSite/seedUserShare/seedGroupShare`. Test-only, behavior-preserving. Unlocked all
      nine `search-*`. (Also added the content-worker db seam `getDb` = `c.get('db')` fallback.)
- [ ] **S-R2** *(optional — not built)* — minimal R2 mock on the harness env. Only the
      `content-missing-object-404-no-store` P1 case needs it; the two D1-only 404 paths (shipped) don't.
      Skipped — the no-store fix is proven by the D1-only paths.
- [ ] **S-FETCH** *(conditional — not built)* — injectable content-readiness `fetch`. Only needed if the
      readiness gate (Steps 2-4) is built after a Checkpoint-1 re-measure. Deferred with Steps 2-4.

---

## Test cases

### Phase 1
- [ ] `m-404-repro-baseline` · P0 · manual (Step 0) — deploy → immediate Open reproduces 404; capture
      headers + replication setting.
- [x] `content-missing-site-404-no-store` · P0 · red-now-bug · D1-only — `app.request('/nope/nope/',{},env)`
      on the content app → 404 AND `Cache-Control: no-store`. Returns before any R2 access. GREEN.
- [x] `content-missing-file-404-no-store` · P0 · red-now-bug · D1-only — site row seeded, 0 files, request
      a path → 404 + `no-store` (returns before R2.get). GREEN.
- [ ] `content-missing-object-404-no-store` · P1 · red-now-bug · S-R2 — site+file row but R2 returns null
      → 404 + `no-store`. *(optional — needs S-R2.)*
- [ ] `m-404-fixed-after-no-store` · P0 · manual (Checkpoint 1) — re-run repro; record fixed / still-404.
- [ ] `pollReady-stops-on-ready` · P1 · new-module-spec *(conditional)* — ready-fn false×2 then true →
      resolves true, stops polling; injected `sleep`.
- [ ] `pollReady-backs-off-and-times-out` · P1 · new-module-spec *(conditional)* — ready-fn always false →
      resolves false after `tries`, backoff is capped/monotonic.
- [ ] `ready-true-when-content-200` · P1 · new-module-spec · S-FETCH *(conditional)* — stubbed content
      fetch 200 → `{ready:true}`; 404 → `{ready:false}`.
- [ ] `ready-mirrors-access` · P1 · new-module-spec · S-D *(conditional)* — non-member on a group/private
      site → 403 (matches `checkAccess`), not a readiness probe.
- [ ] `m-upload-finalizing-then-open` · P1 · manual *(conditional)* — UI shows "finishing up…" then Open;
      timeout still reveals Open with the note.

### Phase 2  — all nine `search-*` GREEN (`routes/sites-search.test.ts`)
- [x] `search-owner-sees-own-private` · P0 · new-module-spec · S-SEED
- [x] `search-member-sees-group-site-in-their-space` · P0 · new-module-spec · S-SEED — the tier every
      existing endpoint misses.
- [x] `search-nonmember-excluded` · P0 · new-module-spec · S-SEED — non-member sees neither the group nor
      the private site.
- [x] `search-team-public-visible-to-any-member` · P1 · new-module-spec · S-SEED
- [x] `search-explicit-share-included` · P1 · new-module-spec · S-SEED — direct + via-group share.
- [x] `search-q-matches-title-slug-space` · P1 · new-module-spec · S-SEED
- [x] `search-excludes-archived-for-normal-user` · P1 · new-module-spec · S-SEED
- [x] `search-superadmin-sees-all-active` · P1 · new-module-spec · S-SEED
- [x] `search-caps-results` · P2 · new-module-spec · S-SEED — > limit seeded → ≤ cap returned.
- [x] `m-palette-remote-search` · P1 · **browser-verified** — typing "deck" returns the Sites group with
      "Launch Deck · owner/launch-deck"; live search via real miniflare D1.
- [x] `m-palette-open-and-copy` · P1 · **browser-verified** — result row has Open (select) + Copy URL
      (trailing button).
- [x] `m-palette-spaces-and-settings` · P2 · **browser-verified** — Navigate (Dashboard/Admin/New
      space/Install CLI) + Spaces group (owner) + Preferences all render; closing resets search state.

### Phase 3 (manual — no web test runner) — browser-verified live (localhost stack, bootstrap auth)
- [x] `m-visibility-group-hint` · P1 · **browser-verified** — visibility menu "Group" reads "This space only".
- [x] `m-share-button-label` · P1 · **browser-verified** — card trigger reads "Share with people & groups".
- [x] `m-share-empty-groups-cta` · P1 · **browser-verified** — superadmin (no groups) → ShareDialog shows
      "You're not in any groups yet… New space" CTA.
- [x] `m-share-triggers-present` · P2 · verified via source — Share trigger present on dashboard cards
      (`dashboard.tsx:693`), space cards (`space.tsx:139`), PreviewToolbar (`PreviewToolbar.tsx:119`).

---

## Strategy
- **Per step: red → fix → green.** Don't batch.
- Phase 1 leads with the two **D1-only** `content-*-404-no-store` reds (no R2 mock needed) → add
  `no-store` → green. Manual repro brackets it (baseline before, recheck after).
- **Checkpoint 1 decides Phase-1 scope.** Steps 2-4 + their `pollReady-*`/`ready-*` cases + S-FETCH/S-R2
  only get authored if the 404 survives `no-store`.
- Phase 2's `search-*` are the real correctness surface — land **S-SEED** first, write all nine reds
  against the not-yet-existing endpoint, then implement Step 5 to green. Palette (Steps 6-7) = manual.
- Phase 3 = manual smoke (UI copy / empty-state).
- **End of each phase:** scoped quality pass → full suite green → one scoped commit.

## Authoring order
1. `m-404-repro-baseline` (Step 0) → `content-missing-site-404-no-store` + `content-missing-file-404-no-store`
   (red) → Step 1 → green → `m-404-fixed-after-no-store`.
2. **Checkpoint 1.** If still red: S-FETCH → `pollReady-*` → `ready-*` → Steps 2-4 → `m-upload-finalizing`.
3. S-SEED → nine `search-*` reds → Step 5 → green → manual palette smoke (Steps 6-7).
4. Phase 3 manual smoke (Steps 8-10).

---

## Log
- 2026-06-28 — **Local browser smoke (localhost stack + bootstrap auth) — found & fixed 2 palette bugs.**
  Stood up the worker + SPA on a local miniflare D1, bootstrapped a superadmin, seeded sites. Live
  `/api/sites/search` E2E verified (title/slug/space match, empty-q→[], isOwner). Browser smoke caught:
  (1) palette used `useFetcher().load('/api/..')` which resolves an RR route not a worker endpoint →
  search returned nothing; switched to the `api` helper + state + request-id race guard. (2) spaces-load
  gated on `onOpenChange` which the externally-controlled `open` (⌘K/header button) bypasses → Spaces
  group never appeared; moved load+reset to a dialog-content ref-callback (effect-free idiom). Both fixed,
  re-verified live, committed `fa90685`. All Phase-2/3 `m-*` UI cases now browser-verified. 91 tests still
  green. **Phase-1 Checkpoint (deploy re-measure) remains the only USER-gated item.**
- 2026-06-28 — **Phase 3 shipped (Steps 8-10).** Group hint → "This space only"; ShareDialog trigger →
  "Share with people & groups" + empty-groups "New space" CTA; Share-trigger presence reconfirmed across
  the three surfaces. Gate P3 green (91 pass / tsc / lint / build), committed ea64a88. cmdk Share action
  left as the documented deferred non-goal. UI copy/empty-state are source-verified + build-green; live
  browser smoke (the `m-*` Phase-3 cases) not run this session.
- 2026-06-28 — **Phase 2 shipped (Steps 5-7).** `GET /api/sites/search` via exported `searchSites()`
  (bounded candidate query → in-memory `checkAccess`, precomputed `memberSpaceIds`/`sharedSiteIds`, no
  N+1, capped; `isOwner` in payload). Added `memberSpaceIds()` repo helper + S-SEED harness helpers; all
  nine `search-*` red→green incl. the group-member tier. CommandPalette: debounced remote `/search`
  (event-driven, one Sites group, Open + Copy URL) + Spaces group + Install CLI. Gate P2 green (91 pass /
  tsc / lint / build), committed c9f09c5. Palette `m-*` cases code-shipped; live browser smoke pending.
- 2026-06-28 — **Phase 1 code shipped (Step 1).** Added `notFound(c)` helper → `Cache-Control: no-store`
  on all three content-origin 404 paths; added an injectable db seam (`getDb` = `c.get('db')` fallback,
  behavior-preserving in prod) so the two D1-only 404 cases are testable via the harness. Both
  `content-missing-*-404-no-store` cases red→green. Gate P1 green (82 pass / tsc / lint), committed
  `ship/glance-polish` e05e389. **Steps 0 + Checkpoint 1 blocked on USER** (need a live deploy +
  re-measure — state-changing, not run autonomously). Steps 2-4 deferred per the scope decision (only
  built if the 404 survives `no-store`; consensus says it won't).
- 2026-06-28 — Tracker created from `SHIP_PLAN.md`. Three-agent plan review (self + codex + cursor)
  reconciled. Key consensus folds: (1) 404 most likely a cached-404, not D1 replica lag (code uses plain
  `drizzle()`, no `withSession()`; R2 strong) → ship `no-store` first + re-measure, readiness gate
  conditional; (2) `/ready` must reuse `checkAccess`, not owner/member; HEAD works via Hono GET→HEAD
  (codex-verified), Range fallback dropped; (3) `/search` = bounded candidate query + in-memory
  `checkAccess` filter (not pure SQL), must include the group-space-membership tier; (4) split cmdk into
  search-first then settings; (5) Phase 3 is copy/empty-state only — Share trigger already everywhere.
  Plan-fact correction: `/shares` is declared AFTER the `:space/:site` catch-all (works by segment-count).
  User scoped Phase 1 to "no-store first, then decide".
