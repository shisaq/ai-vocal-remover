import { getBearerToken, requireUser } from './_lib/auth';
import { errorResponse, json } from './_lib/http';
import { getSupabaseAdmin } from './_lib/supabase';

type EventRequest = {
  name: string;
  properties?: Record<string, unknown>;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as EventRequest;
    if (!payload.name || payload.name.length > 80) {
      return json({ error: 'Invalid event name.' }, { status: 400 });
    }

    const token = getBearerToken(request);
    const user = token ? await requireUser(request) : null;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('events')
      .insert({
        user_id: user?.id || null,
        name: payload.name,
        properties: payload.properties || {},
      });

    if (error) {
      throw error;
    }

    return json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to record event.');
  }
}
