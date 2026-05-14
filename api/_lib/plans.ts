export type PlanId = 'free' | 'pro_monthly' | 'pro_yearly';

export type PlanLimits = {
  label: string;
  monthlyJobs: number;
  softMonthlyJobs?: number;
  maxDurationSeconds: number;
  maxUploadBytes: number;
  stems: Array<'vocals' | 'other' | 'drums' | 'bass'>;
  model: 'htdemucs' | 'htdemucs_ft';
  historyRetentionDays: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    label: 'Free',
    monthlyJobs: 3,
    maxDurationSeconds: 5 * 60,
    maxUploadBytes: 15 * 1024 * 1024,
    stems: ['vocals', 'other'],
    model: 'htdemucs',
    historyRetentionDays: 1,
  },
  pro_monthly: {
    label: 'Pro 月度',
    monthlyJobs: Number.POSITIVE_INFINITY,
    softMonthlyJobs: 200,
    maxDurationSeconds: 15 * 60,
    maxUploadBytes: 100 * 1024 * 1024,
    stems: ['vocals', 'drums', 'bass', 'other'],
    model: 'htdemucs_ft',
    historyRetentionDays: 30,
  },
  pro_yearly: {
    label: 'Pro 年度',
    monthlyJobs: Number.POSITIVE_INFINITY,
    softMonthlyJobs: 200,
    maxDurationSeconds: 15 * 60,
    maxUploadBytes: 100 * 1024 * 1024,
    stems: ['vocals', 'drums', 'bass', 'other'],
    model: 'htdemucs_ft',
    historyRetentionDays: 90,
  },
};

export function normalizePlan(plan: string | null | undefined): PlanId {
  if (plan === 'pro_monthly' || plan === 'pro_yearly') {
    return plan;
  }

  return 'free';
}

export function formatBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}
