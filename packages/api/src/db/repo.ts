import { and, eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { SessionUser } from '../types'
import {
  type SpaceType,
  type User,
  siteGroupShares,
  siteUserShares,
  spaceMembers,
  spaces,
} from './schema'

export function toSessionUser(u: Pick<User, 'id' | 'email' | 'name' | 'role'>): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role }
}

/** Insert a space and add its creator as a member, atomically (D1 batch). Returns the new id. */
export async function createSpace(
  db: DrizzleD1Database,
  input: { slug: string; name: string; type: SpaceType; createdBy: string },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.batch([
    db.insert(spaces).values({ id, slug: input.slug, name: input.name, type: input.type, createdBy: input.createdBy }),
    db.insert(spaceMembers).values({ spaceId: id, userId: input.createdBy }),
  ])
  return id
}

export async function isSpaceMember(db: DrizzleD1Database, spaceId: string, userId: string): Promise<boolean> {
  const row = await db
    .select({ spaceId: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1)
  return row.length > 0
}

/** True if a site is explicitly shared with the user — directly, or via a group they're in. */
export async function resolveIsShared(db: DrizzleD1Database, siteId: string, userId: string): Promise<boolean> {
  const direct = await db
    .select({ siteId: siteUserShares.siteId })
    .from(siteUserShares)
    .where(and(eq(siteUserShares.siteId, siteId), eq(siteUserShares.userId, userId)))
    .limit(1)
  if (direct.length > 0) return true
  const viaGroup = await db
    .select({ siteId: siteGroupShares.siteId })
    .from(siteGroupShares)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, siteGroupShares.spaceId))
    .where(and(eq(siteGroupShares.siteId, siteId), eq(spaceMembers.userId, userId)))
    .limit(1)
  return viaGroup.length > 0
}

/** Set of site ids explicitly shared with the user (direct + via group membership). */
export async function sharedSiteIds(db: DrizzleD1Database, userId: string): Promise<Set<string>> {
  const direct = await db
    .select({ siteId: siteUserShares.siteId })
    .from(siteUserShares)
    .where(eq(siteUserShares.userId, userId))
  const viaGroup = await db
    .select({ siteId: siteGroupShares.siteId })
    .from(siteGroupShares)
    .innerJoin(spaceMembers, eq(spaceMembers.spaceId, siteGroupShares.spaceId))
    .where(eq(spaceMembers.userId, userId))
  return new Set([...direct, ...viaGroup].map((r) => r.siteId))
}

/** Current explicit share lists for a site. */
export async function listSiteShares(
  db: DrizzleD1Database,
  siteId: string,
): Promise<{ userIds: string[]; groupIds: string[] }> {
  const u = await db.select({ id: siteUserShares.userId }).from(siteUserShares).where(eq(siteUserShares.siteId, siteId))
  const g = await db
    .select({ id: siteGroupShares.spaceId })
    .from(siteGroupShares)
    .where(eq(siteGroupShares.siteId, siteId))
  return { userIds: u.map((r) => r.id), groupIds: g.map((r) => r.id) }
}

/** Replace a site's entire share set atomically (clear both tables, then re-insert). */
export async function replaceSiteShares(
  db: DrizzleD1Database,
  siteId: string,
  userIds: string[],
  groupIds: string[],
): Promise<void> {
  const ops = [
    db.delete(siteUserShares).where(eq(siteUserShares.siteId, siteId)),
    db.delete(siteGroupShares).where(eq(siteGroupShares.siteId, siteId)),
    ...userIds.map((userId) => db.insert(siteUserShares).values({ siteId, userId })),
    ...groupIds.map((spaceId) => db.insert(siteGroupShares).values({ siteId, spaceId })),
  ]
  // D1 runs the batch in a single atomic transaction.
  await db.batch(ops as [(typeof ops)[number], ...(typeof ops)[number][]])
}
