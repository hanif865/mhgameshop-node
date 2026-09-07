import { prisma } from '../config/database';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';

/**
 * Google identity helpers shared by the web OAuth flow (passport) and the
 * mobile native flow (POST /api/auth/google/token).
 */

export type GoogleIdentity = {
  googleId: string;
  email: string;
  name: string;
  avatar: string | null;
};

/** Client IDs whose ID tokens we accept. */
function allowedAudiences(): string[] {
  return [env.GOOGLE_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID].filter(Boolean);
}

type TokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  exp?: string;
  error_description?: string;
};

/**
 * Verify a Google ID token issued to the mobile app.
 *
 * Uses Google's tokeninfo endpoint, which validates the signature and expiry
 * on Google's side. We still check `aud` ourselves — without that check any
 * valid Google token from any app would be accepted.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    throw new HttpError(503, 'Google sign-in is not configured on the server.');
  }

  let info: TokenInfo;
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    info = (await resp.json()) as TokenInfo;
    if (!resp.ok) {
      throw new HttpError(401, 'Google token is invalid or expired.');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, 'Could not reach Google to verify the token.');
  }

  if (!info.aud || !audiences.includes(info.aud)) {
    throw new HttpError(401, 'Google token was not issued for this application.');
  }
  if (!info.sub) {
    throw new HttpError(401, 'Google token is missing a subject.');
  }
  // tokeninfo returns booleans as strings.
  if (info.email_verified !== true && info.email_verified !== 'true') {
    throw new HttpError(403, 'Google account email is not verified.');
  }

  const email = info.email ?? `${info.sub}@google.local`;
  return {
    googleId: info.sub,
    email,
    name: info.name?.trim() || email.split('@')[0],
    avatar: info.picture ?? null,
  };
}

/**
 * Match an incoming Google identity to a user by google_id OR email, updating
 * the stored google_id/avatar, or create the account on first sign-in.
 * Mirrors the legacy Laravel SocialLoginController behaviour.
 */
export async function upsertGoogleUser(identity: GoogleIdentity) {
  const { googleId, email, name, avatar } = identity;

  const existing = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
  });

  if (existing) {
    if (existing.status !== 1) {
      throw new HttpError(403, 'Account is disabled.');
    }
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { googleId, googleAvatar: avatar, avatar: existing.avatar ?? avatar },
    });
    return { user, isNew: false };
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      googleId,
      googleAvatar: avatar,
      avatar,
      password: null,
      role: 'user',
    },
  });
  return { user, isNew: true };
}
