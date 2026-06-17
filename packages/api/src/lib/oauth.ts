import { Google } from 'arctic'
import type { Bindings } from '../types'

export const OAUTH_SCOPES = ['openid', 'profile', 'email']

/** Single source of truth for the Google client. redirectURI must exactly match an
 *  Authorized redirect URI in the Google Cloud console. */
export function createGoogle(env: Bindings): Google {
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${env.APP_URL}/api/auth/callback`)
}
