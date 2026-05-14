import { ensureProfile, requireUser } from '../_lib/auth';
import { errorResponse, json } from '../_lib/http';
import { getSupabaseAdmin } from '../_lib/supabase';
import { getAppBaseUrl, getStripe } from '../_lib/stripe';

type CheckoutRequest = {
  plan: 'pro_monthly' | 'pro_yearly';
};

const PRICE_ENV: Record<CheckoutRequest['plan'], string> = {
  pro_monthly: 'STRIPE_PRICE_PRO_MONTHLY',
  pro_yearly: 'STRIPE_PRICE_PRO_YEARLY',
};

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const profile = await ensureProfile(user.id);
    const { plan } = (await request.json()) as CheckoutRequest;
    const priceId = process.env[PRICE_ENV[plan]];

    if (!priceId) {
      return json({ error: `Missing ${PRICE_ENV[plan]}.` }, { status: 500 });
    }

    const stripe = getStripe();
    const baseUrl = getAppBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: profile.stripe_customer_id || undefined,
      customer_email: profile.stripe_customer_id ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata: {
        userId: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan,
        },
      },
    });

    return json({ url: session.url });
  } catch (error) {
    return errorResponse(error, 'Failed to create Stripe Checkout session.');
  }
}
