import { requireUser } from './_lib/auth.js';
import { errorResponse, json } from './_lib/http.js';
import { getSupabaseAdmin } from './_lib/supabase.js';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return json({ jobs: data });
  } catch (error) {
    return errorResponse(error, 'Failed to load jobs.');
  }
}
