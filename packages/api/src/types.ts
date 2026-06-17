import type { DrizzleD1Database } from 'drizzle-orm/d1'

/** Worker bindings + secrets/vars. Secrets come from `.dev.vars` locally and
 *  `wrangler secret put` in prod; plain vars can live in wrangler.jsonc `vars`. */
export interface Bindings {
  GLANCE_DB: D1Database
  GLANCE_FILES: R2Bucket
  GLANCE_SESSIONS: KVNamespace
  ASSETS: Fetcher
  UPLOAD_LIMITER?: RateLimit
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  SESSION_SECRET: string
  CONTENT_TOKEN_SECRET: string
  APP_URL: string
  CONTENT_URL: string
  ALLOWED_HD: string
  SUPERADMIN_EMAIL: string
}

/** The minimal user identity stored in KV and attached to the request context. */
export interface SessionUser {
  id: string
  email: string
  name: string | null
  role: 'member' | 'superadmin'
}

/** Hono context variables set by middleware. */
export interface Variables {
  db: DrizzleD1Database
  user: SessionUser
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
