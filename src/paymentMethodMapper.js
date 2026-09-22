"use strict";

/**
 * Shopify's `gateway` field on a transaction is a raw internal string
 * (e.g. "shopify_payments", "paypal", "klarna", "gift_card"). This maps
 * those raw values to the display names the business actually uses,
 * so "Shopify Payments", "PayPal", "Klarna", "Afterpay", "Shop Pay" and
 * "Manual Payment" show up consistently in the report regardless of how
 * Shopify happened to label the gateway internally.
 */
const GATEWAY_DISPLAY_NAMES = [
  { match: /^shopify_payments$/i, name: "Shopify Payments" },
  { match: /^shop_pay/i, name: "Shop Pay" },
  { match: /^paypal/i, name: "PayPal" },
  { match: /^klarna/i, name: "Klarna" },
  { match: /^afterpay/i, name: "Afterpay" },
  { match: /^stripe/i, name: "Stripe" },
  { match: /^amazon/i, name: "Amazon Pay" },
  { match: /^google_pay|^googlepay/i, name: "Google Pay" },
  { match: /^apple_pay|^applepay/i, name: "Apple Pay" },
  { match: /^gift_card/i, name: "Gift Card" },
  { match: /^bogus|^dummy|^manual|^cash|^cod/i, name: "Manual Payment" },
];

function toDisplayName(rawGateway) {
  if (!rawGateway) return "Unknown";
  const trimmed = String(rawGateway).trim();
  const found = GATEWAY_DISPLAY_NAMES.find((entry) => entry.match.test(trimmed));
  if (found) return found.name;

  // Fall back to a title-cased version of whatever Shopify sent
  // (covers regional / less common gateways without hard-coding all of them).
  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = { toDisplayName };
