import { getBearerToken, requireUser } from './_lib/auth';
import { getSupabaseAdmin, type JobRecord } from './_lib/supabase';

type SeparateStatusRequest = {
  jobId: string;
};

function getStatusEndpoint(jobId: string) {
  if (!process.env.MODAL_WEBHOOK_URL) {
    throw new Error('Missing MODAL_WEBHOOK_URL.');
  }

  const baseUrl = process.env.MODAL_WEBHOOK_URL.replace(/\/separate\/?$/, '');
  return `${baseUrl}/separate-blob/status/${encodeURIComponent(jobId)}`;
}

export async function POST(request: Request) {
  const { jobId } = (await request.json()) as SeparateStatusRequest;

  if (!jobId) {
    return Response.json({ error: 'Missing jobId.' }, { status: 400 });
  }

  const modalAuthToken = process.env.MODAL_AUTH_TOKEN;
  if (!modalAuthToken) {
    return Response.json(
      { error: 'Missing MODAL_AUTH_TOKEN in Vercel environment variables.' },
      { status: 500 },
    );
  }

  try {
    const token = getBearerToken(request);
    const user = token ? await requireUser(request) : null;
    const supabase = user ? getSupabaseAdmin() : null;
    let trackedJob: JobRecord | null = null;
    let modalJobId = jobId;

    if (user && supabase) {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        trackedJob = data as JobRecord;
        modalJobId = trackedJob.modal_job_id || jobId;

        if (trackedJob.status === 'done' || trackedJob.status === 'failed') {
          return Response.json({ success: trackedJob.status === 'done', status: trackedJob.status, stems: trackedJob.stems, error: trackedJob.error });
        }
      }
    }

    const modalResponse = await fetch(getStatusEndpoint(modalJobId), {
      headers: {
        Authorization: `Bearer ${modalAuthToken}`,
      },
    });

    const data = await modalResponse.json();

    if (!modalResponse.ok) {
      if (trackedJob && supabase) {
        await supabase
          .from('jobs')
          .update({ status: 'failed', error: data.detail || data.error || 'Failed to fetch Modal job status.', completed_at: new Date().toISOString() })
          .eq('id', trackedJob.id);
      }

      return Response.json(
        { error: data.detail || data.error || 'Failed to fetch Modal job status.' },
        { status: modalResponse.status },
      );
    }

    if (trackedJob && supabase && data.status === 'done') {
      await supabase
        .from('jobs')
        .update({ status: 'done', stems: data.stems, completed_at: new Date().toISOString() })
        .eq('id', trackedJob.id);
    }

    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Modal job status.' },
      { status: 500 },
    );
  }
}
