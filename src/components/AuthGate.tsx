import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn, Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase, type Profile } from '../lib/supabaseClient';
import { getCanonicalOrigin } from '../lib/canonicalOrigin';
import { useT } from '../lib/i18n';

type AuthGateProps = {
  children: (props: {
    session: Session | null;
    profile: Profile | null;
    refreshProfile: () => Promise<void>;
  }) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const t = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);

  const refreshProfile = useMemo(() => async () => {
    if (!supabase) {
      setProfile(null);
      return;
    }

    const { data: authData } = await supabase.auth.getSession();
    const currentSession = authData.session;
    setSession(currentSession);

    if (!currentSession) {
      setProfile(null);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, plan, plan_renews_at, monthly_jobs_used, monthly_reset_at')
      .eq('id', currentSession.user.id)
      .maybeSingle();

    setProfile((data as Profile | null) || null);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    refreshProfile().finally(() => setLoading(false));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void refreshProfile();
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [refreshProfile]);

  useEffect(() => {
    const openAuthPanel = () => setAuthPanelOpen(true);
    window.addEventListener('open-auth-panel', openAuthPanel);

    return () => {
      window.removeEventListener('open-auth-panel', openAuthPanel);
    };
  }, []);

  const signInWithEmail = async () => {
    if (!supabase || !email) return;

    setAuthLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getCanonicalOrigin(),
      },
    });
    setAuthLoading(false);
    setMessage(error ? error.message : t('auth.link_sent'));
  };

  const signInWithGoogle = async () => {
    if (!supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getCanonicalOrigin(),
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center">
        <div className="text-sm text-zinc-400">{t('auth.loading')}</div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return <>{children({ session: null, profile: null, refreshProfile })}</>;
  }

  return (
    <>
      {children({ session, profile, refreshProfile })}
      {!session && authPanelOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 px-4 py-5 backdrop-blur-sm sm:items-center">
          <button
            aria-label={t('auth.close_panel')}
            className="absolute inset-0 cursor-default"
            onClick={() => setAuthPanelOpen(false)}
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
            <div>
              <p className="text-sm font-semibold text-white">{t('auth.panel_title')}</p>
              <p className="text-xs text-zinc-400">{t('auth.panel_subtitle')}</p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
                <Mail className="h-4 w-4 text-zinc-400" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('auth.email_placeholder')}
                  className="w-44 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                  type="email"
                />
              </label>
              <button
                onClick={signInWithEmail}
                disabled={authLoading || !email}
                className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('auth.send_link')}
              </button>
              <button
                onClick={signInWithGoogle}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" />
                {t('auth.google')}
              </button>
            </div>
            <button
              onClick={() => setAuthPanelOpen(false)}
              className="mt-4 text-xs font-semibold text-zinc-500 hover:text-zinc-300"
            >
              {t('auth.skip')}
            </button>
            {message && <p className="mt-3 text-xs text-indigo-300">{message}</p>}
          </div>
        </div>
      )}
    </>
  );
}
