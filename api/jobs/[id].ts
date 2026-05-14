import { del } from '@vercel/blob';
import { requireUser } from '../_lib/auth.js';
import { errorResponse, json } from '../_lib/http.js';
import { getSupabaseAdmin, type JobRecord } from '../_lib/supabase.js';

function getJobId(request: Request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', getJobId(request))
      .eq('user_id', user.id)
      .single();

    if (error) {
      throw error;
    }

    return json({ job: data });
  } catch (error) {
    return errorResponse(error, 'Failed to load job.');
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const supabase = getSupabaseAdmin();
    const { data: job, error: readError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', getJobId(request))
      .eq('user_id', user.id)
      .single();

    if (readError) {
      throw readError;
    }

    const stems = (job as JobRecord).stems;
    const pathnames = Object.values(stems || {})
      .map((stem) => typeof stem === 'object' && stem && 'pathname' in stem ? String(stem.pathname) : null)
      .filter((pathname): pathname is string => Boolean(pathname));

    if (pathnames.length > 0) {
      await del(pathnames).catch(() => undefined);
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', getJobId(request))
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete job.');
  }
}
