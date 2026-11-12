// Display labels only; the real amounts live on the Stripe prices (STRIPE_PRICE_MONTHLY / _YEARLY).
export const PRICES = {
  month: process.env.NEXT_PUBLIC_PRICE_MONTHLY_LABEL ?? "$5/mo",
  year: process.env.NEXT_PUBLIC_PRICE_YEARLY_LABEL ?? "$40/yr",
};
