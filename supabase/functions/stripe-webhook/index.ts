// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events to keep the subscriptions table in sync.
// Deploy: supabase functions deploy stripe-webhook

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Map Stripe Price IDs back to tier names
const PRICE_TO_TIER: Record<string, string> = {
  [Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID') || '']: 'pro',
  [Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID') || '']: 'pro',
  [Deno.env.get('STRIPE_ELITE_MONTHLY_PRICE_ID') || '']: 'elite',
  [Deno.env.get('STRIPE_ELITE_ANNUAL_PRICE_ID') || '']: 'elite',
};

function getTierFromPriceId(priceId: string): string {
  return PRICE_TO_TIER[priceId] || 'pro';
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    // Verify webhook signature
    // In production, use Stripe's SDK to verify. For now, we'll parse the event directly.
    // TODO: add proper signature verification with stripe SDK when available in Deno
    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const eventType = event.type;
    console.log(`Stripe webhook received: ${eventType}`);

    switch (eventType) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        const tier = session.metadata?.tier || 'pro';

        if (userId && subscriptionId) {
          // Fetch the subscription from Stripe to get period details
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
          });
          const stripeSub = await subRes.json();

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            tier,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
            trial_ends_at: null, // Clear trial since they've subscribed
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
          }, { onConflict: 'user_id' });

          console.log(`Subscription activated for user ${userId}: ${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          // Determine tier from the price ID
          const priceId = subscription.items?.data?.[0]?.price?.id || '';
          const tier = subscription.metadata?.tier || getTierFromPriceId(priceId);

          const statusMap: Record<string, string> = {
            active: 'active',
            past_due: 'past_due',
            canceled: 'canceled',
            trialing: 'trialing',
            incomplete: 'past_due',
            incomplete_expired: 'canceled',
            unpaid: 'past_due',
          };

          await supabase.from('subscriptions').upsert({
            user_id: userId,
            tier,
            status: statusMap[subscription.status] || 'active',
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            stripe_subscription_id: subscription.id,
          }, { onConflict: 'user_id' });

          console.log(`Subscription updated for user ${userId}: ${tier} (${subscription.status})`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          // Downgrade to free
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            tier: 'free',
            status: 'canceled',
            stripe_subscription_id: subscription.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }, { onConflict: 'user_id' });

          console.log(`Subscription canceled for user ${userId}, downgraded to free`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Webhook error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
