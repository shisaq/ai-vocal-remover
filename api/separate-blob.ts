import { del, head } from '@vercel/blob';
import { getBearerToken, ensureProfile, requireUser } from './_lib/auth';
import { PLAN_LIMITS } from './_lib/plans';
import { assertCanCreateJob, incrementMonthlyUsage } from './_lib/quota';
import { getSupabaseAdmin } from './_lib/supabase';

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

type SeparateBlobRequest = {
  sourceUrl: string;
  sourcePathname?: string;
  filename?: string;
};

function getBlobEndpoint() {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL.');
  }

  return process.env.MODAL_WEBHOOK_URL.replace(/\/separate\/?$/, '/separate-blob');
}

export async function POST(request: Request) {
  const payload = (await request.json()) as SeparateBlobRequest;

  if (!payload.sourceUrl) {
    return Response.json({ error: 'Missing sourceUrl.' }, { status: 400 });
  }

  try {
    const token = getBearerToken(request);
    const user = token ? await requireUser(request) : null;
    const profile = user ? await ensureProfile(user.id) : null;
    console.log('Preparing Modal Blob separation:', payload.sourcePathname || payload.sourceUrl);

    const source = await head(payload.sourcePathname || payload.sourceUrl);
    console.log('Blob source ready:', source.pathname, source.size);

    if (source.size > MAX_AUDIO_BYTES) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json({ error: 'Audio file is too large. Maximum size is 100MB.' }, { status: 413 });
    }

    const { limits } = profile
      ? await assertCanCreateJob(profile, source.size)
      : { limits: PLAN_LIMITS.free };

    if (!profile && source.size > limits.maxUploadBytes) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json({ error: '未登录试用文件上限为 15MB。' }, { status: 413 });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const modalAuthToken = process.env.MODAL_AUTH_TOKEN;
    if (!modalAuthToken) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json(
        { error: 'Missing MODAL_AUTH_TOKEN in Vercel environment variables.' },
        { status: 500 },
      );
    }

    headers.Authorization = `Bearer ${modalAuthToken}`;

    const modalResponse = await fetch(getBlobEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        model: limits.model,
        stems: limits.stems,
      }),
    });
    console.log('Modal Blob response status:', modalResponse.status);

    const data = await modalResponse.json();

    if (!modalResponse.ok) {
      await del(payload.sourcePathname || payload.sourceUrl);
      return Response.json(
        {
          error: modalResponse.status === 401
            ? 'Modal authorization failed. Check that Vercel MODAL_AUTH_TOKEN matches the Modal Secret.'
            : data.detail || data.error || 'Modal processing failed.',
        },
        { status: modalResponse.status },
      );
    }

    if (!data.jobId) {
      return Response.json(data);
    }

    if (!user) {
      return Response.json(data);
    }

    const supabase = getSupabaseAdmin();
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        source_type: 'upload',
        source_url: payload.sourceUrl,
        source_pathname: payload.sourcePathname,
        source_filename: payload.filename,
        status: 'processing',
        model: limits.model,
        modal_job_id: data.jobId,
      })
      .select('*')
      .single();

    if (jobError) {
      await del(payload.sourcePathname || payload.sourceUrl).catch(() => undefined);
      throw jobError;
    }

    await incrementMonthlyUsage(user.id);
    return Response.json({ ...data, jobId: job.id, modalJobId: data.jobId });
  } catch (error) {
    await del(payload.sourcePathname || payload.sourceUrl).catch(() => undefined);
    if (error instanceof Response) {
      return error;
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to process Blob audio.' },
      { status: 500 },
    );
  }
}
