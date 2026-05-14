import Stripe from 'stripe';
import { getSupabaseAdmin } from '../_lib/supabase';
import { getStripe } from '../_lib/stripe';

function planFromPrice(priceId?: string | null) {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_YEARLY) {
    return 'pro_yearly';
  }

  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) {
    return 'pro_monthly';
  }

  return null;
}

async function updateProfileFromSubscription(subscription: Stripe.Subscription) {
  const supabase = getSupabaseAdmin();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;
  const plan = subscription.status === 'active' || subscription.status === 'trialing'
    ? planFromPrice(priceId)
    : 'free';

  if (!plan) {
    return;
  }

  const periodEnd = new Date(subscription.items.data[0]?.current_period_end * 1000).toISOString();
  await supabase
    .from('profiles')
    .update({
      plan,
      plan_renews_at: plan === 'free' ? null : periodEnd,
      stripe_customer_id: customerId,
    })
    .eq('stripe_customer_id', customerId);
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return Response.json({ error: 'Missing STRIPE_WEBHOOK_SECRET.' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return Response.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }

  let event: Stripe.Event;
  const body = await request.text();

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid Stripe webhook signature.' },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan;
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (userId && customerId && (plan === 'pro_monthly' || plan === 'pro_yearly')) {
      await supabase
        .from('profiles')
        .update({
          plan,
          stripe_customer_id: customerId,
        })
        .eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    await updateProfileFromSubscription(event.data.object as Stripe.Subscription);
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (customerId) {
      await supabase
        .from('profiles')
        .update({ plan: 'free', plan_renews_at: null })
        .eq('stripe_customer_id', customerId);
    }
  }

  return Response.json({ received: true });
}
