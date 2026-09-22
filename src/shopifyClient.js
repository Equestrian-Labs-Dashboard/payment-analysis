"use strict";

const axios = require("axios");

const ORDER_FIELDS = [
  "id",
  "name",
  "created_at",
  "processed_at",
  "financial_status",
  "fulfillment_status",
  "currency",
  "subtotal_price",
  "total_discounts",
  "total_shipping_price_set",
  "total_tax",
  "total_price",
  "total_outstanding",
  "customer",
  "order_number",
].join(",");

/**
 * Thin wrapper around one Shopify store's Admin REST API.
 * Handles cursor pagination (Link header) and 429 rate-limit backoff.
 */
class ShopifyClient {
  constructor({ storeDomain, accessToken, apiVersion, brandKey }) {
    this.brandKey = brandKey;
    const cleanStore = String(storeDomain || "")
      .replace(/[\"\'\\n\\r\\t]/g, "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .trim()
      .toLowerCase();

    if (!cleanStore || !accessToken) {
      throw new Error(`[${brandKey}] Missing Shopify store or access token`);
    }

    if (!cleanStore.endsWith(".myshopify.com")) {
      throw new Error(`[${brandKey}] Invalid Shopify store domain: ${cleanStore}. Expected format: your-store.myshopify.com`);
    }

    this.baseUrl = `https://${cleanStore}/admin/api/${apiVersion || "2025-10"}`;
    this.shopUrl = `https://${cleanStore}/admin/api/${apiVersion || "2025-10"}/shop.json`;
    console.log(`[${brandKey}] Shopify store: ${cleanStore}`);
    console.log(`[${brandKey}] Shopify endpoint: ${this.baseUrl}`);

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  async validateConnection() {
    try {
      await this.http.get('/shop.json');
      return true;
    } catch (err) {
      const status = err.response && err.response.status;
      const body = err.response && err.response.data;
      throw new Error(`[${this.brandKey}] Shopify connection failed (${status || 'unknown'}). Check STORE domain, token and API permissions. Response: ${JSON.stringify(body || err.message)}`);
    }
  }

  async _requestWithRetry(config, attempt = 1) {
    try {
      return await this.http.request(config);
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 429 && attempt <= 5) {
        const retryAfterSec = Number(err.response.headers["retry-after"]) || 2;
        await sleep(retryAfterSec * 1000);
        return this._requestWithRetry(config, attempt + 1);
      }
      if (status >= 500 && attempt <= 3) {
        await sleep(attempt * 1000);
        return this._requestWithRetry(config, attempt + 1);
      }
      const endpoint = `${this.baseUrl}${config.url || ""}`;
      err.message = `[${this.brandKey}] Request failed ${status || ""} ${endpoint}: ${JSON.stringify(err.response && err.response.data || err.message)}`;
      throw err;
    }
  }

  /**
   * Fetch every order created within [dateFromISO, dateToISO], across all
   * financial statuses, following Shopify's cursor-based Link pagination.
   */
  async getOrders(dateFromISO, dateToISO) {
    const orders = [];
    let url = "/orders.json";
    let params = {
      status: "any",
      created_at_min: dateFromISO,
      created_at_max: dateToISO,
      limit: 250,
      fields: ORDER_FIELDS,
    };

    while (url) {
      const res = await this._requestWithRetry({ method: "get", url, params });
      orders.push(...res.data.orders);

      const nextUrl = parseNextLink(res.headers.link);
      if (nextUrl) {
        // The Link header already encodes the page_info cursor + limit;
        // call it directly and drop the now-irrelevant params.
        url = nextUrl;
        params = undefined;
      } else {
        url = null;
      }

      // Be a polite REST citizen: Shopify's default bucket is ~2 req/sec.
      await sleep(500);
    }

    return orders;
  }

  /**
   * Fetch every transaction (sale, capture, refund, void, authorization)
   * for a single order. This is the ONLY reliable source for the real
   * gateway / payment method / transaction status / transaction id.
   */
  async getTransactionsForOrder(orderId) {
    const res = await this._requestWithRetry({
      method: "get",
      url: `/orders/${orderId}/transactions.json`,
    });
    await sleep(300);
    return res.data.transactions;
  }
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) {
      // Return path + query only — axios baseURL supplies the host.
      const full = new URL(match[1]);
      return full.pathname + full.search;
    }
  }
  return null;
}

function enrichError(err, brandKey) {
  const status = err.response && err.response.status;
  const body = err.response && err.response.data;
  const wrapped = new Error(
    `[${brandKey}] Shopify API error${status ? ` (${status})` : ""}: ${
      body ? JSON.stringify(body) : err.message
    }`
  );
  wrapped.cause = err;
  return wrapped;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { ShopifyClient };
