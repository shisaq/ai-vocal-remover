import { PLAN_LIMITS, formatBytes, normalizePlan } from './plans';
import { getSupabaseAdmin, type Profile } from './supabase';

function monthHasElapsed(resetAt: string) {
  const resetTime = new Date(resetAt).getTime();
  return Number.isFinite(resetTime) && Date.now() - resetTime >= 31 * 24 * 60 * 60 * 1000;
}

export async function refreshMonthlyQuota(profile: Profile): Promise<Profile> {
  if (!monthHasElapsed(profile.monthly_reset_at)) {
    return profile;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      monthly_jobs_used: 0,
      monthly_reset_at: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as Profile;
}

export async function assertCanCreateJob(profile: Profile, fileSizeBytes?: number) {
  const currentProfile = await refreshMonthlyQuota(profile);
  const plan = normalizePlan(currentProfile.plan);
  const limits = PLAN_LIMITS[plan];

  if (fileSizeBytes && fileSizeBytes > limits.maxUploadBytes) {
    throw new Response(JSON.stringify({
      error: `当前套餐文件上限为 ${formatBytes(limits.maxUploadBytes)}。`,
      code: 'file_too_large',
    }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (Number.isFinite(limits.monthlyJobs) && currentProfile.monthly_jobs_used >= limits.monthlyJobs) {
    throw new Response(JSON.stringify({
      error: '本月免费额度已用完，请升级 Pro 后继续处理。',
      code: 'quota_exceeded',
    }), {
      status: 402,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { profile: currentProfile, limits };
}

export async function incrementMonthlyUsage(userId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc('increment_monthly_jobs_used', { user_id_input: userId });

  if (!error) {
    return;
  }

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('monthly_jobs_used')
    .eq('id', userId)
    .single();

  if (readError) {
    throw readError;
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ monthly_jobs_used: (profile?.monthly_jobs_used || 0) + 1 })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }
}
