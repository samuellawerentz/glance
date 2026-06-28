// S-D test harness: a real in-memory SQLite (bun:sqlite) wired through drizzle so the
// repo/route helpers run their actual query builders, plus a KV mock matching the
// GLANCE_SESSIONS surface. Cast to the D1 types the app expects — query semantics are
// identical; only the driver differs (D1's `.batch` is shimmed sequentially).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  type NewSite,
  type NewSpace,
  type NewUser,
  siteGroupShares,
  siteUserShares,
  sites,
  spaceMembers,
  spaces,
  users,
} from '../db/schema'

const MIGRATIONS = ['drizzle/0000_init.sql', 'drizzle/0001_steep_black_bolt.sql']

/** Fresh in-memory DB with the real schema applied. */
export function makeDb(): DrizzleD1Database {
  const sqlite = new Database(':memory:')
  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(import.meta.dir, '../..', file), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint')) {
      const trimmed = stmt.trim()
      if (trimmed) sqlite.run(trimmed)
    }
  }
  const db = drizzle(sqlite) as unknown as DrizzleD1Database & {
    batch(stmts: Promise<unknown>[]): Promise<unknown[]>
  }
  // D1 exposes atomic `.batch`; bun-sqlite does not. Run sequentially (sync driver) so
  // FK-ordered inserts (spaces before space_members) still land in order.
  db.batch = async (stmts) => {
    const out: unknown[] = []
    for (const s of stmts) out.push(await s)
    return out
  }
  return db
}

// --- S-SEED: minimal row inserts so route/search specs are authorable. Test-only,
// behavior-preserving; every field defaults to something sensible and overridable. ---

let seedSeq = 0
const nextId = (prefix: string) => `${prefix}-${++seedSeq}`

/** Insert a user; returns its id. Defaults: member role, derived email. */
export async function seedUser(db: DrizzleD1Database, o: Partial<NewUser> = {}): Promise<string> {
  const id = o.id ?? nextId('u')
  await db.insert(users).values({ id, email: o.email ?? `${id}@example.com`, name: o.name ?? null, role: o.role ?? 'member' })
  return id
}

/** Insert a space; returns its id. Defaults: group type, slug/name derived from id. */
export async function seedSpace(db: DrizzleD1Database, o: Partial<NewSpace> & { createdBy: string }): Promise<string> {
  const id = o.id ?? nextId('sp')
  await db
    .insert(spaces)
    .values({ id, slug: o.slug ?? id, name: o.name ?? id, type: o.type ?? 'group', createdBy: o.createdBy })
  return id
}

/** Add a user to a space's membership. */
export async function seedMember(db: DrizzleD1Database, spaceId: string, userId: string): Promise<void> {
  await db.insert(spaceMembers).values({ spaceId, userId })
}

/** Insert a site; returns its id. Defaults: team visibility, active, slug derived from id. */
export async function seedSite(
  db: DrizzleD1Database,
  o: Partial<NewSite> & { spaceId: string; ownerId: string },
): Promise<string> {
  const id = o.id ?? nextId('site')
  await db.insert(sites).values({
    id,
    spaceId: o.spaceId,
    ownerId: o.ownerId,
    slug: o.slug ?? id,
    title: o.title ?? null,
    visibility: o.visibility ?? 'team',
    status: o.status ?? 'active',
  })
  return id
}

/** Grant a user a direct (per-user) share on a site. */
export async function seedUserShare(db: DrizzleD1Database, siteId: string, userId: string): Promise<void> {
  await db.insert(siteUserShares).values({ siteId, userId })
}

/** Grant every member of a (group) space a share on a site. */
export async function seedGroupShare(db: DrizzleD1Database, siteId: string, spaceId: string): Promise<void> {
  await db.insert(siteGroupShares).values({ siteId, spaceId })
}

/** In-memory stand-in for the GLANCE_SESSIONS KV namespace (get/put/delete + ttl peek). */
export function makeKv() {
  const store = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    put: (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value)
      ttls.set(key, options?.expirationTtl)
      return Promise.resolve()
    },
    delete: (key: string) => {
      store.delete(key)
      ttls.delete(key)
      return Promise.resolve()
    },
    store,
    ttls,
  }
}
