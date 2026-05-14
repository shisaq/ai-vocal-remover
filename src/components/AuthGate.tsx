import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LogIn, Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase, type Profile } from '../lib/supabaseClient';

type AuthGateProps = {
  children: (props: {
    session: Session | null;
    profile: Profile | null;
    refreshProfile: () => Promise<void>;
  }) => ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

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

  const signInWithEmail = async () => {
    if (!supabase || !email) return;

    setAuthLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setAuthLoading(false);
    setMessage(error ? error.message : '登录链接已发送，请检查邮箱。');
  };

  const signInWithGoogle = async () => {
    if (!supabase) return;

    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center">
        <div className="text-sm text-zinc-400">正在载入账号状态...</div>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return <>{children({ session: null, profile: null, refreshProfile })}</>;
  }

  return (
    <>
      {children({ session, profile, refreshProfile })}
      {!session && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-zinc-950/90 px-4 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">登录后解锁任务历史与套餐额度</p>
              <p className="text-xs text-zinc-400">未登录可试用 1 次，正式分离任务会绑定到你的账号。</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
                <Mail className="h-4 w-4 text-zinc-400" />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="邮箱登录"
                  className="w-44 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                  type="email"
                />
              </label>
              <button
                onClick={signInWithEmail}
                disabled={authLoading || !email}
                className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                发送链接
              </button>
              <button
                onClick={signInWithGoogle}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"
              >
                <LogIn className="h-4 w-4" />
                Google
              </button>
            </div>
          </div>
          {message && <p className="mx-auto mt-2 max-w-3xl text-xs text-indigo-300">{message}</p>}
        </div>
      )}
    </>
  );
}
