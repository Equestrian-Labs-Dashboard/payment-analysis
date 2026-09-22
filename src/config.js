"use strict";

require("dotenv").config();
const { DateTime } = require("luxon");

function normalizeStoreDomain(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\\n|\\r|\\t/g, "")
    .toLowerCase();
}

/**
 * Resolves the reporting date window.
 * Defaults to "last 3 full months" (the Q3-style window requested by the business),
 * so the very first run produces a report without any extra arguments.
 */
function resolveDateWindow(cliArgs) {
  const fromArg = cliArgs.from || process.env.REPORT_DATE_FROM;
  const toArg = cliArgs.to || process.env.REPORT_DATE_TO;

  if (fromArg && toArg) {
    return {
      from: DateTime.fromISO(fromArg, { zone: "utc" }).startOf("day"),
      to: DateTime.fromISO(toArg, { zone: "utc" }).endOf("day"),
    };
  }

  const to = DateTime.utc().endOf("day");
  const from = to.minus({ months: 3 }).startOf("day");
  return { from, to };
}

/**
 * Per-brand Shopify store config. Add more brands here if the business expands
 * beyond CORRO / CAVALI — everything downstream iterates over this list.
 */
function getBrands() {
  const brands = [
   {
 key: "CORRO",
 storeDomain: "equestrian-labs.myshopify.com",
 accessToken: process.env.SHOPIFY_CORRO_TOKEN,
},
   {
 key: "CAVALI",
 storeDomain: "cavali-club.myshopify.com",
 accessToken: process.env.SHOPIFY_CAVALI_TOKEN,
},
  ];

  return brands.filter((b) => b.storeDomain && b.accessToken);
}

function getAvailableProviders() {
  const raw =
    process.env.SHOPIFY_AVAILABLE_PROVIDERS ||
    "Shopify Payments,PayPal,Klarna,Afterpay,Shop Pay,Manual Payment";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = {
  apiVersion: process.env.SHOPIFY_API_VERSION || "2025-10",
  resolveDateWindow,
  getBrands,
  getAvailableProviders,
};
