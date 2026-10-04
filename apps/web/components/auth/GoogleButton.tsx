'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { apiGet, apiPost } from '@/lib/api';
import { API_URL } from '@/lib/config';

/**
 * "Continue with Google" button.
 *
 * - On the normal web, it redirects to the API's web OAuth flow.
 * - Inside the Android WebView app (which injects window.AndroidApp), Google
 *   blocks its own login page in embedded WebViews, so we trigger the app's
 *   NATIVE Google picker instead: the app returns a Google ID token, we POST
 *   it to /api/auth/google/token, and the session cookie is set right in the
 *   WebView (apiPost sends credentials). See the Android app's MainActivity.
 */

type AndroidBridge = {
  googleSignIn: (serverClientId: string) => void;
};

declare global {
  interface Window {
    AndroidApp?: AndroidBridge;
    onNativeGoogleToken?: (idToken: string) => void;
    onNativeGoogleError?: (message: string) => void;
  }
}

/** True when running inside our Android WebView app with the JS bridge. */
function isNativeApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.AndroidApp?.googleSignIn === 'function' &&
    /MHGameShopApp/i.test(navigator.userAgent)
  );
}

export default function GoogleButton({ refCode }: { refCode?: string }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startNativeSignIn() {
    setLoading(true);
    try {
      // The app never hardcodes the client id — the server provides it.
      const cfg = await apiGet<{ enabled: boolean; serverClientId: string | null }>(
        '/api/auth/google/config',
      );
      const serverClientId = cfg.data?.serverClientId;
      if (!cfg.data?.enabled || !serverClientId) {
        throw new Error('Google sign-in is not available right now.');
      }

      // Called by the app once the Google ID token is obtained.
      window.onNativeGoogleToken = async (idToken: string) => {
        try {
          const res = await apiPost<{ isNew?: boolean }>('/api/auth/google/token', {
            idToken,
            ...(refCode ? { ref: refCode } : {}),
          });
          if (!res.success) throw new Error(res.message || 'Google sign-in failed.');
          await refresh();
          router.push('/auth/callback' + (res.data?.isNew ? '?new=1' : ''));
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      };

      // Called by the app if the native picker fails or is cancelled.
      window.onNativeGoogleError = (message: string) => {
        // A user cancelling the picker is not a real error worth shouting about.
        if (message && !/cancel/i.test(message)) toast.error(message);
        setLoading(false);
      };

      window.AndroidApp!.googleSignIn(serverClientId);
    } catch (err) {
      toast.error((err as Error).message);
      setLoading(false);
    }
  }

  function onClick(e: React.MouseEvent) {
    if (!isNativeApp()) return; // let the normal <a> redirect happen
    e.preventDefault();
    if (loading) return;
    void startNativeSignIn();
  }

  return (
    <a
      href={`${API_URL}/api/auth/google`}
      onClick={onClick}
      className="btn-outline flex w-full items-center justify-center gap-2 py-2.5"
    >
      {loading ? (
        <Loader2 className="animate-spin" size={18} />
      ) : (
        <>
          <GoogleIcon /> Continue with Google
        </>
      )}
    </a>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.7-2.9-.7-4.6s.3-3.2.7-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.5 2.1-8.8 2.1-6.4 0-11.8-3.7-13.7-9.1l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
