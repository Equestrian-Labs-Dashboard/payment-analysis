"use strict";

require("dotenv").config();
const { DateTime } = require("luxon");

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
function cleanSecretValue(value) {
  return String(value || "")
    .replace(/[\"\'\n\r\t]/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim();
}

function getBrands() {
  const brands = [
    {
      key: "CORRO",
      storeDomain: cleanSecretValue(process.env.SHOPIFY_CORRO_STORE),
      accessToken: cleanSecretValue(process.env.SHOPIFY_CORRO_TOKEN),
    },
    {
      key: "CAVALI",
      storeDomain: cleanSecretValue(process.env.SHOPIFY_CAVALI_STORE),
      accessToken: cleanSecretValue(process.env.SHOPIFY_CAVALI_TOKEN),
    },
  ];

  return brands.filter((b) => {
    if (!b.storeDomain && !b.accessToken) return false;
    if (!b.storeDomain || !b.accessToken) {
      throw new Error(`[${b.key}] Missing Shopify secret. Check GitHub Actions secrets.`);
    }
    return true;
  });
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
  apiVersion: process.env.SHOPIFY_API_VERSION || "2025-07",
  resolveDateWindow,
  getBrands,
  getAvailableProviders,
};
