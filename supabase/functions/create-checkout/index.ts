// Supabase Edge Function: create-checkout
// Creates a Stripe Checkout Session for subscription upgrades.
// Deploy: supabase functions deploy create-checkout

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Map tier + period to Stripe Price IDs (set in Supabase Edge Function secrets)
const PRICE_IDS: Record<string, string> = {
  'pro_monthly': Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID') || '',
  'pro_annual': Deno.env.get('STRIPE_PRO_ANNUAL_PRICE_ID') || '',
  'elite_monthly': Deno.env.get('STRIPE_ELITE_MONTHLY_PRICE_ID') || '',
  'elite_annual': Deno.env.get('STRIPE_ELITE_ANNUAL_PRICE_ID') || '',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tier, period, userId, email } = await req.json();

    if (!tier || !period || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tier, period, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const priceKey = `${tier}_${period}`;
    const priceId = PRICE_IDS[priceKey];

    if (!priceId) {
      return new Response(
        JSON.stringify({ error: `No Stripe Price ID configured for ${priceKey}. Set STRIPE_${tier.toUpperCase()}_${period.toUpperCase()}_PRICE_ID in Edge Function secrets.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY in Edge Function secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check if user already has a Stripe customer ID
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    let customerId = sub?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: email || '',
          'metadata[supabase_user_id]': userId,
        }),
      });

      const customer = await customerRes.json();
      if (customer.error) {
        throw new Error(customer.error.message);
      }

      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: userId,
          stripe_customer_id: customerId,
        }, { onConflict: 'user_id' });
    }

    // Create Checkout Session
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': customerId,
        'mode': 'subscription',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': `${SUPABASE_URL}/functions/v1/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${SUPABASE_URL}/functions/v1/checkout-cancel`,
        'metadata[supabase_user_id]': userId,
        'metadata[tier]': tier,
        'metadata[period]': period,
        'subscription_data[metadata][supabase_user_id]': userId,
        'subscription_data[metadata][tier]': tier,
      }),
    });

    const session = await sessionRes.json();
    if (session.error) {
      throw new Error(session.error.message);
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
