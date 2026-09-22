"use strict";

const { toDisplayName } = require("./paymentMethodMapper");

const SUCCESS_REVENUE_KINDS = new Set(["sale", "capture"]);
const REFUND_KINDS = new Set(["refund"]);

/**
 * Fetches every order + its transactions for one brand and flattens them
 * into transaction-level records — one row per transaction, which is what
 * lets us report payment methods accurately instead of relying on
 * Shopify's grouped `payment_gateway_names` string on the order.
 */
async function buildBrandRecords(shopifyClient, brandKey, dateFrom, dateTo) {
  const orders = await shopifyClient.getOrders(dateFrom.toISO(), dateTo.toISO());

  const records = [];
  const orderSummaries = [];

  for (const order of orders) {
    const transactions = await shopifyClient.getTransactionsForOrder(order.id);

    const shippingAmount = sumMoney(
      (order.total_shipping_price_set &&
        order.total_shipping_price_set.shop_money &&
        order.total_shipping_price_set.shop_money.amount) ||
        0
    );
    const subtotal = toNumber(order.subtotal_price);
    const discount = toNumber(order.total_discounts);
    const tax = toNumber(order.total_tax);
    const totalOrderValue = toNumber(order.total_price);

    const successfulTxns = transactions.filter(
      (t) => t.status === "success" && SUCCESS_REVENUE_KINDS.has(t.kind)
    );
    const refundTxns = transactions.filter(
      (t) => t.status === "success" && REFUND_KINDS.has(t.kind)
    );
    const refundAmount = refundTxns.reduce((sum, t) => sum + toNumber(t.amount), 0);
    const netRevenue = totalOrderValue - refundAmount;

    orderSummaries.push({
      company: brandKey,
      orderId: order.name || `#${order.order_number}`,
      orderDate: order.created_at ? order.created_at.slice(0, 10) : "",
      createdAt: order.created_at,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status || "unfulfilled",
      currency: order.currency,
      customerId: order.customer ? order.customer.id : null,
      customerType:
        order.customer && order.customer.orders_count > 1 ? "Returning" : "New",
      country:
        (order.customer &&
          order.customer.default_address &&
          order.customer.default_address.country) ||
        "Unknown",
      email: order.customer ? order.customer.email : null,
      subtotal,
      discountAmount: discount,
      shippingAmount,
      taxAmount: tax,
      totalOrderValue,
      refundAmount,
      netRevenue,
    });

    // Only successful sale/capture transactions represent an actual
    // "payment method used" event for the summary tabs; refunds/voids/
    // failures are still kept in Transaction Detail for auditability.
    if (transactions.length === 0) {
      continue;
    }

    for (const txn of transactions) {
      records.push({
        company: brandKey,
        orderId: order.name || `#${order.order_number}`,
        orderDate: order.created_at ? order.created_at.slice(0, 10) : "",
        createdAt: order.created_at,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status || "unfulfilled",
        currency: order.currency,
        paymentMethod: toDisplayName(txn.gateway),
        paymentGateway: txn.gateway,
        transactionId: txn.id,
        transactionKind: txn.kind,
        transactionStatus: txn.status,
        transactionDate: txn.created_at,
        transactionAmount: toNumber(txn.amount),
        isRevenueTxn: txn.status === "success" && SUCCESS_REVENUE_KINDS.has(txn.kind),
        isRefundTxn: txn.status === "success" && REFUND_KINDS.has(txn.kind),
      });
    }
  }

  return { orderSummaries, transactionRecords: records };
}

/** Executive Summary tab KPIs. */
function computeExecutiveSummary(orderSummaries, transactionRecords) {
  const totalOrders = orderSummaries.length;
  const totalRevenue = round2(orderSummaries.reduce((s, o) => s + o.netRevenue, 0));
  const totalTransactions = transactionRecords.filter((r) => r.isRevenueTxn).length;
  const averageOrderValue = totalOrders > 0 ? round2(totalRevenue / totalOrders) : 0;

  return { totalOrders, totalRevenue, totalTransactions, averageOrderValue };
}

/** Payment Method Summary tab — one row per payment method, sorted by usage. */
function computePaymentMethodSummary(transactionRecords) {
  const revenueTxns = transactionRecords.filter((r) => r.isRevenueTxn);
  const refundsByMethod = groupSum(
    transactionRecords.filter((r) => r.isRefundTxn),
    (r) => r.paymentMethod,
    (r) => r.transactionAmount
  );

  const totalTransactions = revenueTxns.length;
  const totalRevenueGross = revenueTxns.reduce((s, r) => s + r.transactionAmount, 0);

  const byMethod = new Map();
  for (const txn of revenueTxns) {
    const key = txn.paymentMethod;
    if (!byMethod.has(key)) {
      byMethod.set(key, { paymentMethod: key, transactions: 0, revenueGross: 0 });
    }
    const bucket = byMethod.get(key);
    bucket.transactions += 1;
    bucket.revenueGross += txn.transactionAmount;
  }

  const rows = Array.from(byMethod.values()).map((row) => {
    const refunds = refundsByMethod.get(row.paymentMethod) || 0;
    const revenue = round2(row.revenueGross - refunds);
    const totalRevenueNet = round2(totalRevenueGross - sumMapValues(refundsByMethod));
    return {
      paymentMethod: row.paymentMethod,
      transactions: row.transactions,
      transactionPct: totalTransactions
        ? round1((row.transactions / totalTransactions) * 100)
        : 0,
      revenue,
      revenuePct: totalRevenueNet ? round1((revenue / totalRevenueNet) * 100) : 0,
      avgOrderValue: row.transactions ? round2(revenue / row.transactions) : 0,
    };
  });

  rows.sort((a, b) => b.transactions - a.transactions);
  return rows;
}

/** Top 3 Payment Methods tab — answers "¿Cuáles son los 3 métodos que más utiliza la gente?" */
function computeTopPaymentMethods(paymentMethodSummary, topN = 3) {
  return [...paymentMethodSummary]
    .sort((a, b) => b.transactions - a.transactions)
    .slice(0, topN)
    .map((row) => ({
      paymentMethod: row.paymentMethod,
      transactionPct: row.transactionPct,
      transactions: row.transactions,
      revenue: row.revenue,
    }));
}

/** Payment Providers tab — available (configured) vs. actually used in the window. */
function computeProviderComparison(availableProviders, paymentMethodSummary) {
  const usedByName = new Map(paymentMethodSummary.map((r) => [r.paymentMethod, r]));
  const rows = availableProviders.map((provider) => {
    const used = usedByName.get(provider);
    return {
      provider,
      availableInShopify: "Yes",
      used: used ? "Yes" : "No",
      transactions: used ? used.transactions : 0,
    };
  });

  // Include any provider that appears in the data but wasn't in the configured
  // allow-list, so nothing observed in real transactions is silently dropped.
  for (const row of paymentMethodSummary) {
    if (!availableProviders.includes(row.paymentMethod)) {
      rows.push({
        provider: row.paymentMethod,
        availableInShopify: "Not configured",
        used: "Yes",
        transactions: row.transactions,
      });
    }
  }

  rows.sort((a, b) => b.transactions - a.transactions);
  return rows;
}


/**
 * Returns the last three fully closed calendar months included in the report.
 * Uses order date (not transaction date) to keep monthly revenue/order reporting
 * consistent with Shopify order reporting.
 */
function computeMonthlyClosedMonths(orderSummaries, transactionRecords = [], referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const months = [];

  for (let i = 3; i >= 1; i--) {
    const d = new Date(ref.getUTCFullYear(), ref.getUTCMonth() - i, 1);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;

    const rows = orderSummaries.filter((o) => (o.orderDate || "").slice(0, 7) === key);
    const txns = transactionRecords.filter(
      (t) => t.isRevenueTxn && (t.orderDate || "").slice(0, 7) === key
    );
    months.push({
      month: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      period: key,
      orders: rows.length,
      revenue: round2(rows.reduce((s, o) => s + o.netRevenue, 0)),
      transactions: txns.length,
    });
  }
  return months;
}

// ---- helpers --------------------------------------------------------------

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sumMoney(value) {
  return toNumber(value);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round1(n) {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function groupSum(rows, keyFn, valueFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + valueFn(row));
  }
  return map;
}

function sumMapValues(map) {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

module.exports = {
  buildBrandRecords,
  computeExecutiveSummary,
  computePaymentMethodSummary,
  computeTopPaymentMethods,
  computeProviderComparison,
  computeMonthlyClosedMonths,
};
