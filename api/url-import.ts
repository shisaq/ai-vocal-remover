import { getBearerToken, ensureProfile, requireUser } from './_lib/auth.js';
import { errorResponse, json } from './_lib/http.js';
import { PLAN_LIMITS } from './_lib/plans.js';

type UrlImportRequest = {
  url: string;
};

function getUrlImportEndpoint() {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL.');
  }

  const baseUrl = process.env.MODAL_WEBHOOK_URL.replace(/\/separate\/?$/, '');
  return `${baseUrl}/url-import`;
}

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as UrlImportRequest;
    if (!url || !/^https?:\/\//i.test(url)) {
      return json({ error: '请输入有效的音乐或视频链接。' }, { status: 400 });
    }

    const token = getBearerToken(request);
    const user = token ? await requireUser(request) : null;
    const profile = user ? await ensureProfile(user.id) : null;
    const plan = profile?.plan === 'pro_monthly' || profile?.plan === 'pro_yearly' ? profile.plan : 'free';
    const limits = PLAN_LIMITS[plan];
    const modalAuthToken = process.env.MODAL_AUTH_TOKEN;

    if (!modalAuthToken) {
      return json({ error: 'Missing MODAL_AUTH_TOKEN in Vercel environment variables.' }, { status: 500 });
    }

    const response = await fetch(getUrlImportEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modalAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        maxBytes: limits.maxUploadBytes,
        maxDurationSeconds: limits.maxDurationSeconds,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      return json({ error: data.detail || data.error || '链接导入失败，请改用手动上传。' }, { status: response.status });
    }

    return json(data);
  } catch (error) {
    return errorResponse(error, 'Failed to import URL.');
  }
}
