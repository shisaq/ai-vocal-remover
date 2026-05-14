import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : null;

export type Profile = {
  id: string;
  plan: 'free' | 'pro_monthly' | 'pro_yearly';
  plan_renews_at: string | null;
  monthly_jobs_used: number;
  monthly_reset_at: string;
};

export const planLabels: Record<Profile['plan'], string> = {
  free: 'Free',
  pro_monthly: 'Pro 月度',
  pro_yearly: 'Pro 年度',
};
