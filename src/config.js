"use strict";

require("dotenv").config();
const { DateTime } = require("luxon");

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

function cleanSecretValue(value) {
  return String(value || "")
    .replace(/["'\n\r\t]/g, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .trim();
}

function getBrands() {
  const brands = [
    {
      key: "CORRO",
      storeDomain: "equestrian-labs.myshopify.com",
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
