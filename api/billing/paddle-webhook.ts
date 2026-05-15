import { getSupabaseAdmin } from '../_lib/supabase.js';
import { planFromPaddlePrice, verifyPaddleWebhook, type PaddleWebhookEvent } from '../_lib/paddle.js';

function isPlan(value: unknown): value is 'pro_monthly' | 'pro_yearly' {
  return value === 'pro_monthly' || value === 'pro_yearly';
}

function getCustomData(data: Record<string, any>) {
  return (data.custom_data || data.customData || {}) as Record<string, unknown>;
}

function getUserId(data: Record<string, any>) {
  const customData = getCustomData(data);
  const userId = customData.user_id || customData.userId;
  return typeof userId === 'string' ? userId : null;
}

function getPriceId(data: Record<string, any>) {
  const subscriptionItem = data.items?.[0];
  const transactionItem = data.items?.[0];

  return (
    subscriptionItem?.price?.id ||
    transactionItem?.price_id ||
    transactionItem?.price?.id ||
    null
  ) as string | null;
}

function getPlan(data: Record<string, any>) {
  const customData = getCustomData(data);
  if (isPlan(customData.plan)) {
    return customData.plan;
  }

  return planFromPaddlePrice(getPriceId(data));
}

function getRenewalDate(data: Record<string, any>) {
  return (
    data.next_billed_at ||
    data.current_billing_period?.ends_at ||
    data.billing_period?.ends_at ||
    null
  ) as string | null;
}

async function updateProfileForPaddleEvent(event: PaddleWebhookEvent) {
  const { event_type: eventType, data } = event;
  const supabase = getSupabaseAdmin();
  const userId = getUserId(data);
  const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;
  const plan = getPlan(data);
  const renewalDate = getRenewalDate(data);

  if (
    eventType === 'subscription.canceled' ||
    eventType === 'subscription.paused' ||
    eventType === 'subscription.past_due' ||
    eventType === 'transaction.payment_failed'
  ) {
    const update = { plan: 'free', plan_renews_at: null };
    if (userId) {
      await supabase.from('profiles').update(update).eq('id', userId);
      return;
    }
    if (customerId) {
      await supabase.from('profiles').update(update).eq('stripe_customer_id', customerId);
    }
    return;
  }

  if (!plan) {
    return;
  }

  if (
    eventType === 'transaction.completed' ||
    eventType === 'transaction.paid' ||
    eventType === 'subscription.created' ||
    eventType === 'subscription.activated' ||
    eventType === 'subscription.trialing' ||
    eventType === 'subscription.resumed' ||
    eventType === 'subscription.updated'
  ) {
    const update = {
      plan,
      plan_renews_at: renewalDate,
      stripe_customer_id: customerId,
    };

    if (userId) {
      await supabase.from('profiles').update(update).eq('id', userId);
      return;
    }

    if (customerId) {
      await supabase.from('profiles').update(update).eq('stripe_customer_id', customerId);
    }
  }
}

export async function POST(request: Request) {
  const body = await request.text();

  try {
    verifyPaddleWebhook(body, request.headers.get('paddle-signature'));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Invalid Paddle webhook signature.' },
      { status: 400 },
    );
  }

  try {
    const event = JSON.parse(body) as PaddleWebhookEvent;
    await updateProfileForPaddleEvent(event);

    return Response.json({ received: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Failed to process Paddle webhook.' }, { status: 500 });
  }
}
