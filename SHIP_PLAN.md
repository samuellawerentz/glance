# PLAN — Glance ship polish: deploy-readiness 404, real cmdk search, share-to-group discoverability

**Goal:** Close the three near-term gaps from the consult: (1) the intermittent 404 right after
upload, (2) the command palette being a launcher rather than a real search/settings surface, (3)
"how do I share to a group" — a discoverability/labelling gap, not a missing capability.

**Bias:** additive + minimal, reuse existing idioms — pure unit helpers + the S-D in-memory SQLite
harness (`packages/api/src/test/harness.ts`) + light `app.request(path, init, env)` route tests;
biome 2-space/single-quote/no-semicolon; event-driven React (no `useEffect`). Each step
independently shippable. Riskiest correctness (content consistency) first; pure UI copy last.

**Revised after 3-agent review (self + codex + cursor) — 2026-06-28.** Consensus folds noted inline.

## Key codebase facts (verified)
- Two Workers share one D1 + one R2: MAIN app (`index.ts`, SPA + `/api/*`) and CONTENT
  (`content.ts`) on a separate origin streaming R2 bytes.
- Upload (`routes/upload.ts:87`) awaits every `GLANCE_FILES.put()` then commits the D1 `db.batch()`
  before returning `{ url }`. Write is durable at response time.
- Serving (`content.ts:serve`) reads D1 site → D1 file → R2 object; any miss → `c.notFound()` with
  **no `Cache-Control`** today.
- DB client uses plain `drizzle(c.env.GLANCE_DB)` (`db/client.ts:7`) — **no `withSession()`**, so D1
  read replication is NOT engaged in code. R2 is strongly consistent after PUT. ⇒ ordinary D1 replica
  lag is not a code-level explanation for the 404; a **cached/uncacheable-unset 404** is the more
  plausible cause. *(consensus: codex + self — don't over-index on D1 replication.)*
- Hono route matching: the 2-segment `:space/:site` catch-all does NOT eat 3-segment paths, which is
  why `/exists` (before) and `/shares` (declared AFTER it, `sites.ts:257`) both work. A 3-segment
  `:space/:site/ready` is collision-free regardless of order; place it near `/exists` for readability.
  *(correction: plan previously claimed `/shares` precedes the catch-all — it does not.)*
- `signToken(secret, userId, scope, ttlSec)` (`token.ts:42`); metadata route mints
  `signToken(SECRET, user.id, "<space>/<site>", TTL)` (`sites.ts:235`). Step 2 uses it identically. ✓
- Access truth = pure `checkAccess(site,user,isMember,isShared)` (`lib/access.ts:27`): private→owner,
  group→space member/owner, team→any auth, public→all, shared→additive, archived→410, superadmin→all.
  Reused by API (`sites.ts:226`) AND content worker (`content.ts:68`). Helpers in `db/repo.ts`:
  `sharedSiteIds`, `resolveIsShared`, `isSpaceMember`, `listSiteShares`, `replaceSiteShares`.
- Search access UNION must include the **group-space-membership tier** (sites in a group space the user
  belongs to but doesn't own) — only reachable today via `GET /api/spaces/:slug/sites`; `/mine` (owner),
  `/shared` (explicit shares), `/team` (team/public) each miss it. *(consensus: cursor + codex + self.)*
- cmdk: `CommandPalette.tsx` lazy-loads `/api/sites/mine`, slices to 6; "settings" = theme + logout.
- Sharing already works (group visibility + per-user/group grants via `ShareDialog` → `PUT /shares`).
  Share trigger ALREADY renders on dashboard cards (`dashboard.tsx:690`), space cards (`space.tsx:130`),
  and `PreviewToolbar.tsx`. Gap is purely labelling/empty-state. *(consensus: codex + cursor.)*
- `SiteSummary` (`types.ts:31`) has NO `isOwner` field; `UploadState` (`dashboard.tsx:117`) =
  `idle|uploading|done|error`; `lib/api.ts` is the thin `fetch` wrapper.

---

## Phase 1 — Kill the 404 (cheap fix first, gate optional)
**Goal:** "Open" never lands on a 404. Sequence the cheapest plausible fix first and RE-MEASURE before
building anything heavier — the readiness gate may be unnecessary. *(consensus: all three — the
server-side readiness fetch is correct but likely over-built vs `no-store`; ship `no-store` first.)*

- **Step 0** — *(verify, not code)* `wrangler d1 info glance-db` (is read replication on?) + reproduce
  the 404 reliably (deploy → immediate open) and inspect the 404's response headers (cacheable?). This
  is the measurement baseline that tells us if Step 1 alone suffices. *low*
- **Step 1** — `content.ts:serve`: set `Cache-Control: no-store` on every not-found / not-ready
  response (missing site row, missing file row, missing R2 object). Highest-probability actual fix.
  *low*
- **Checkpoint 1** — re-run the Step-0 repro. **If the 404 no longer reproduces, Phase 1 is done** —
  Steps 2-4 become an OPTIONAL UX follow-up, not correctness. Record the result in the log.
- **Step 2** *(optional / only if 404 persists OR we want the "finishing up" UX)* — `GET
  /api/sites/:spaceSlug/:siteSlug/ready` in `sites.ts` near `/exists`. **Auth: mirror the metadata
  route exactly** — resolve `isMember` + `isShared`, run `checkAccess`, then mint the SAME content URL
  (gated token via `signToken(... user.id ...)` or public path). Server-side `fetch(contentUrl, {method:
  'HEAD'})` → `{ ready: res.ok }`. *(fix: was "owner/member check" — that misses shares + superadmin;
  consensus codex+cursor+self.)* HEAD works because Hono dispatches HEAD to the matching GET handler
  (codex verified 200 locally). If HEAD ever proves unreliable, the fallback is a **root-level `/_ready`
  route on the content worker** — NOT `Range: bytes=0-0` (serve() ignores Range, returns full body).
  *med* · dep:1
- **Step 3** *(optional, with Step 2)* — `lib/pollReady.ts`: `pollReady(space, site, {tries, baseMs,
  now?, sleep?})`, capped exp backoff (~300ms→3s, ~8s ceiling) over `/ready`, returns boolean;
  `now`/`sleep` injected for unit testing. *med* · dep:2
- **Step 4** *(optional, with Step 2/3)* — `dashboard.tsx doUpload()`: add `finalizing` to
  `UploadState`; after a successful `uploadFiles`, set `finalizing`, await `pollReady`; ready → `done`;
  timeout → `done` + "may take a few seconds" note. **Never hard-fail — the upload already succeeded.**
  *med* · dep:3
- **Gate P1.**

## Phase 2 — Real cmdk search + settings (two shippable slices)
**Goal:** palette searches ALL accessible sites; settings/spaces follow as a second slice.

- **Step 5** — `GET /api/sites/search?q=` in `sites.ts`. Shape *(consensus: cursor's idiom — matches
  `spaces.ts` which fetches rows then filters with `checkAccess`; do NOT duplicate permission logic in
  SQL, and do NOT compose client-side)*: ONE bounded candidate query —
  `status='active' AND q-match AND (ownerId=me OR spaceId ∈ my member spaces OR visibility ∈
  (team,public) OR id ∈ sharedSiteIds)`, superadmin ⇒ all active — then a final in-memory `checkAccess`
  filter (passing the already-computed `isMember`/`isShared` sets so it's not N+1), cap ~20. Returns
  `SiteSummary[]`. **Semantics decision: search = "openable"** (checkAccess-passing), so normal users
  don't see archived; superadmin sees all via the bypass. *med*
- **Step 6** — `CommandPalette.tsx`: replace the static `/mine` slice-6 with a debounced remote search
  against `/search?q=` driven by the input (`useFetcher`, event-driven, no effect). **This slice = a
  single "Sites" group with Open + Copy URL only.** *(fix: was bundled with spaces/settings — split so
  it ships alone; consensus codex+cursor.)* *med* · dep:5
- **Step 7** *(separate slice)* — Spaces group from `/api/spaces/mine` + a small set of command actions
  (New space, CLI install, Admin for superadmin, Theme, Sign out — most already exist). Keep it small.
  *low* · dep:6
  - **deferred non-goal:** inline Share/Visibility INSIDE the palette (nested-dialog complexity).
- **Gate P2.**

## Phase 3 — Share-to-group discoverability (UI copy only, no backend)
**Goal:** a user who wants to share with a group finds how, without docs. *(consensus: real work is copy
+ empty-state; the Share trigger already exists everywhere.)*

- **Step 8** — `visibility.tsx` `VISIBILITY_META.group.hint`: "Members of this space" → "This space
  only" (so it doesn't read like an arbitrary-group picker). *low*
- **Step 9** — `ShareDialog.tsx`: trigger label "Share" → "Share with people & groups" (or a groups
  affordance/count); add an empty-groups state with a "New space" CTA when `groups.length === 0`; keep
  the "on top of the visibility setting" copy. *low*
- **Step 10** *(confirmation, mostly stale)* — confirm the Share trigger is present on dashboard cards
  (`dashboard.tsx:690`), space cards (`space.tsx:130`), and `PreviewToolbar.tsx` (it is). OPTIONAL: add
  an owner-only Share cmdk action — but that needs `isOwner` added to the `/search` payload (SiteSummary
  lacks it, `types.ts:31`) or a metadata fetch. Defer unless trivial. *low*
- **Gate P3.**

> **Per-phase gate (right-sized):** after a phase's steps land, run a scoped quality pass over that
> phase's diff → triage (fix legit, note deferred) → full `bun test` + `typecheck` + `lint` green, no
> unaddressed finding → commit the phase as one scoped commit (`Phase <n>: <summary>`). *(cursor flagged
> full thermo-nuclear per phase as heavy for a side project; kept the gate per the skill but sized the
> intensity to scope. Frontend-only steps with no web test runner = manual smoke, per the bootstrap
> precedent.)*
