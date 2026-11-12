# Deploying D1 Hoops (Railway)

One Railway service runs everything: the static site, the `/auth` proxy to Neon Auth, the `/api` routes (account, follows, picks, Stripe, alerts) and the live-score relay (`/events`). GitHub Pages keeps working as a free mirror with accounts hidden.

Data stays fresh on its own: the GitHub Action refreshes data three times a day and commits it to `main`, and Railway redeploys on every push to `main`.

## 1. Create the service

1. In Railway, go to **New project → Deploy from GitHub repo → shaincarrasco/D1-Basketball-Analytics**. Railway picks up `railway.json` and the root `Dockerfile`.
2. Under **Settings → Networking**, generate a domain (or add your own).
3. Add the variables below and redeploy.

## 2. Variables

| Variable | Value |
|---|---|
| `PUBLIC_URL` | `https://<your-domain>` (no trailing slash). Railway's own domain is used when this is unset. |
| `NEON_AUTH_URL` | `https://ep-silent-truth-be7xu1wm.neonauth.c-9.us-east-2.aws.neon.tech/neondb/auth` |
| `DATABASE_URL` | Neon console → project **d1hoops** → Connect → pooled connection string |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (`sk_live_…`, or `sk_test_…` while testing) |
| `STRIPE_PRICE_MONTHLY` | Price id of the monthly Pro price (`price_…`) |
| `STRIPE_PRICE_YEARLY` | Price id of the yearly Pro price (optional; the button is hidden without it) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook in step 4 (`whsec_…`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Run `npx web-push generate-vapid-keys` once and paste both |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` |
| `NEXT_PUBLIC_PRICE_MONTHLY_LABEL` / `NEXT_PUBLIC_PRICE_YEARLY_LABEL` | Button labels, e.g. `$5/mo` and `$40/yr`. They must match the Stripe prices. |

Each feature switches on when its variables are present (`/api/health` shows which ones are on): accounts need `NEON_AUTH_URL` and `DATABASE_URL`, billing needs the Stripe keys, and alerts need the VAPID keys.

## 3. Neon Auth

In the Neon console, open **Auth → Settings → Trusted domains** and add `https://<your-domain>`. If you skip this, sign-in is rejected for an untrusted origin.

Google sign-in uses Neon's shared Google credentials. Before launch, add your own Google OAuth client so the consent screen shows "D1 Hoops".

## 4. Stripe

1. Create a product called **D1 Hoops Pro** with a monthly recurring price and, optionally, a yearly one. Copy the price ids into the variables above.
2. Go to **Developers → Webhooks → Add endpoint** and enter `https://<your-domain>/api/stripe/webhook`. Subscribe it to these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Under **Settings → Billing → Customer portal**, turn on cancel and update-payment-method. "Manage billing" opens this portal.

The test flow is: sign up at `/account/`, click **Get Pro**, then pay with card `4242 4242 4242 4242`. Your plan flips to Pro within a few seconds.

## 5. Alerts

Alerts are part of Pro. A user turns them on at `/account/` on each device. The server watches the live slate and sends tip-off, close-game (final 4 minutes, within 5 points) and final alerts for followed teams. Each alert is sent once (`app.sent_alerts`), and dead subscriptions are removed automatically.

On iPhone, web push only works after the site has been added to the Home Screen (iOS 16.4+).

## Schema

`live/migrations/001_app.sql` is already applied to the Neon project. Users live in Neon Auth, and the app's tables key on the user id from the JWT.
