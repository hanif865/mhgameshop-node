import passport from 'passport';
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20';
import { env } from './env';
import { upsertGoogleUser } from '../services/google-auth.service';

/**
 * Google OAuth via Passport (stateless — we issue our own JWT in the callback).
 * The find-or-create logic is shared with the mobile native flow; see
 * services/google-auth.service.ts.
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
          const { user, isNew } = await upsertGoogleUser({
            googleId,
            email,
            name: profile.displayName || email.split('@')[0],
            avatar: profile.photos?.[0]?.value ?? null,
          });

          done(null, { id: user.id, role: user.role, isNew });
        } catch (e) {
          done(e as Error);
        }
      },
    ),
  );
}

export { passport };
