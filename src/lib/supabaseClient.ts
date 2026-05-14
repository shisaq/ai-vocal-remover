import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
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
