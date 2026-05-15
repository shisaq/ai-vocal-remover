import { ensureProfile, requireUser } from '../_lib/auth.js';
import { errorResponse, json } from '../_lib/http.js';
import { createPaddlePortalSession } from '../_lib/paddle.js';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const profile = await ensureProfile(user.id);

    if (!profile.stripe_customer_id) {
      return json({ error: 'No Paddle customer is linked to this account.' }, { status: 400 });
    }

    const url = await createPaddlePortalSession(profile.stripe_customer_id);

    return json({ url });
  } catch (error) {
    return errorResponse(error, 'Failed to open Paddle Customer Portal.');
  }
}
