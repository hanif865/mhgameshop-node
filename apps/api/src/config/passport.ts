import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { prisma } from './database';
import { env } from './env';
import { strRandom } from '../utils/helpers';

/**
 * Google OAuth via Passport (stateless — we issue our own JWT in the callback).
 * Mirrors Laravel SocialLoginController: match by google_id OR email, then
 * update google_id + avatar, or create a new user.
 */
export function configurePassport() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value ?? `${googleId}@google.local`;
          const avatar = profile.photos?.[0]?.value ?? null;
          const name = profile.displayName || email.split('@')[0];

          let user = await prisma.user.findFirst({
            where: { OR: [{ googleId }, { email }] },
          });
          let isNew = false;

          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { googleId, googleAvatar: avatar, avatar: user.avatar ?? avatar },
            });
          } else {
            isNew = true;
            user = await prisma.user.create({
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
          }

          done(null, { id: user.id, role: user.role, isNew });
        } catch (e) {
          done(e as Error);
        }
      },
    ),
  );
}

export { passport };

// silence unused import in builds without google configured
void strRandom;
