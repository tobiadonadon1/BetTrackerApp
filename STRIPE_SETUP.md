# Stripe Setup Guide for Betra

This guide walks you through setting up Stripe to enable subscription payments in Betra.

## 1. Create a Stripe Account

1. Go to [stripe.com](https://stripe.com) and create an account
2. Complete the onboarding process (you can start in **Test Mode**)
3. From the Dashboard, note your **Publishable Key** and **Secret Key**

## 2. Create Products & Prices

In the Stripe Dashboard → **Products**:

### Product 1: Betra Pro
- **Name**: Betra Pro
- **Description**: Unlimited tickets, OCR scanning, advanced analytics
- Create **2 prices**:
  - **Monthly**: €7.99/month (recurring)
  - **Annual**: €74.99/year (recurring)
- Note down both **Price IDs** (they look like `price_1abc...`)

### Product 2: Betra Elite
- **Name**: Betra Elite
- **Description**: Full analytical power. Bankroll, streaks, data export.
- Create **2 prices**:
  - **Monthly**: €17.99/month (recurring)
  - **Annual**: €149.99/year (recurring)
- Note down both **Price IDs**

## 3. Configure Environment Variables

Add the keys to your `.env` file:

```bash
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_ELITE_MONTHLY_PRICE_ID=price_...
STRIPE_ELITE_ANNUAL_PRICE_ID=price_...
```

Also set these as **secrets** in your Supabase Edge Functions:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_PRO_MONTHLY_PRICE_ID=price_...
supabase secrets set STRIPE_PRO_ANNUAL_PRICE_ID=price_...
supabase secrets set STRIPE_ELITE_MONTHLY_PRICE_ID=price_...
supabase secrets set STRIPE_ELITE_ANNUAL_PRICE_ID=price_...
```

## 4. Set Up Webhooks

1. In Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add Endpoint**
3. Set the URL to your Supabase Edge Function:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
   ```
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the **Signing Secret** (starts with `whsec_...`)
6. Add it as a Supabase secret:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## 5. Deploy Edge Functions

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
```

## 6. Run the Database Migration

In the Supabase SQL Editor, run:
```
supabase/migrations/011_subscriptions.sql
```

## 7. Going Live

When ready for production:
1. Activate your Stripe account (complete identity verification)
2. Switch from Test Mode to Live Mode in the Stripe Dashboard
3. Create **Live** products and prices (same as test, but in live mode)
4. Replace all `pk_test_` / `sk_test_` keys with `pk_live_` / `sk_live_` keys
5. Update webhook endpoint to use the live signing secret

## Testing

In Test Mode, use these test card numbers:
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires Auth**: `4000 0025 0000 3155`

Use any future expiry date and any 3-digit CVC.
