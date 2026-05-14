import { ensureProfile, requireUser } from '../_lib/auth.js';
import { errorResponse, json } from '../_lib/http.js';
import { getAppBaseUrl, getStripe } from '../_lib/stripe.js';

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const profile = await ensureProfile(user.id);

    if (!profile.stripe_customer_id) {
      return json({ error: 'No Stripe customer is linked to this account.' }, { status: 400 });
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${getAppBaseUrl(request)}/?billing=portal`,
    });

    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error, 'Failed to open Stripe Customer Portal.');
  }
}
