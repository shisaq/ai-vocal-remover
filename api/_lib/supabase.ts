import { createClient } from '@supabase/supabase-js';

export type Profile = {
  id: string;
  plan: string;
  plan_renews_at: string | null;
  stripe_customer_id: string | null;
  monthly_jobs_used: number;
  monthly_reset_at: string;
};

export type JobRecord = {
  id: string;
  user_id: string | null;
  source_type: 'upload' | 'url';
  source_url: string | null;
  source_pathname: string | null;
  source_filename: string | null;
  duration_seconds: number | null;
  status: 'queued' | 'processing' | 'done' | 'failed';
  model: string;
  stems: Record<string, unknown> | null;
  error: string | null;
  cost_credits: number;
  modal_job_id: string | null;
  created_at: string;
  completed_at: string | null;
};

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SECRET_KEY.');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY
  );

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  }

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
