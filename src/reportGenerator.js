"use strict";

const ExcelJS = require("exceljs");

const BRAND_BLUE = "FF4C5FE8"; // matches the Corro horse-logo blue
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true };
const CURRENCY_FMT = '"$"#,##0.00';
const PERCENT_FMT = '0.0"%"';

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  row.height = 20;
}

function autoFitColumns(sheet, minWidth = 12) {
  sheet.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len + 2 > max) max = len + 2;
    });
    col.width = Math.min(max, 40);
  });
}

function addExecutiveSummarySheet(workbook, { combined, byBrand, windowLabel }) {
  const sheet = workbook.addWorksheet("Executive Summary");
  sheet.addRow(["Shopify Payment Methods Analysis"]).font = { bold: true, size: 14 };
  sheet.addRow([`Period: ${windowLabel}`]).font = { italic: true };
  sheet.addRow([]);

  const header = sheet.addRow(["KPI", "All Brands", "CORRO", "CAVALI"]);
  styleHeaderRow(header);

  const kpiRows = [
    ["Total Orders", combined.totalOrders, byBrand.CORRO?.totalOrders ?? 0, byBrand.CAVALI?.totalOrders ?? 0],
    [
      "Total Revenue",
      combined.totalRevenue,
      byBrand.CORRO?.totalRevenue ?? 0,
      byBrand.CAVALI?.totalRevenue ?? 0,
    ],
    [
      "Total Transactions",
      combined.totalTransactions,
      byBrand.CORRO?.totalTransactions ?? 0,
      byBrand.CAVALI?.totalTransactions ?? 0,
    ],
    [
      "Average Order Value",
      combined.averageOrderValue,
      byBrand.CORRO?.averageOrderValue ?? 0,
      byBrand.CAVALI?.averageOrderValue ?? 0,
    ],
  ];

  kpiRows.forEach((r) => {
    const row = sheet.addRow(r);
    row.getCell(2).numFmt = r[0].includes("Revenue") || r[0].includes("Value") ? CURRENCY_FMT : "#,##0";
    row.getCell(3).numFmt = row.getCell(2).numFmt;
    row.getCell(4).numFmt = row.getCell(2).numFmt;
  });

  autoFitColumns(sheet);
}

function addPaymentMethodSummarySheet(workbook, sheetName, summaryRows) {
  const sheet = workbook.addWorksheet(sheetName);
  const header = sheet.addRow([
    "Payment Method",
    "Transactions",
    "Transaction %",
    "Revenue",
    "Revenue %",
    "Avg Order Value",
  ]);
  styleHeaderRow(header);

  summaryRows.forEach((r) => {
    const row = sheet.addRow([
      r.paymentMethod,
      r.transactions,
      r.transactionPct,
      r.revenue,
      r.revenuePct,
      r.avgOrderValue,
    ]);
    row.getCell(3).numFmt = PERCENT_FMT;
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.getCell(5).numFmt = PERCENT_FMT;
    row.getCell(6).numFmt = CURRENCY_FMT;
  });

  autoFitColumns(sheet);
  return sheet;
}

function addTopPaymentMethodsSheet(workbook, topByBrand) {
  const sheet = workbook.addWorksheet("Top Payment Methods");
  sheet.addRow(["Top 3 Payment Methods — \u00bfCu\u00e1les son los 3 m\u00e9todos que m\u00e1s utiliza la gente?"]).font = {
    bold: true,
  };
  sheet.addRow([]);

  for (const [brandKey, rows] of Object.entries(topByBrand)) {
    sheet.addRow([brandKey]).font = { bold: true, color: { argb: BRAND_BLUE } };
    const header = sheet.addRow(["Rank", "Payment Method", "Transaction %", "Transactions", "Revenue"]);
    styleHeaderRow(header);
    rows.forEach((r, i) => {
      const row = sheet.addRow([i + 1, r.paymentMethod, r.transactionPct, r.transactions, r.revenue]);
      row.getCell(3).numFmt = PERCENT_FMT;
      row.getCell(5).numFmt = CURRENCY_FMT;
    });
    sheet.addRow([]);
  }

  autoFitColumns(sheet);
}

function addPaymentProvidersSheet(workbook, providersByBrand) {
  const sheet = workbook.addWorksheet("Payment Providers");
  for (const [brandKey, rows] of Object.entries(providersByBrand)) {
    sheet.addRow([brandKey]).font = { bold: true, color: { argb: BRAND_BLUE } };
    const header = sheet.addRow(["Provider", "Available in Shopify", "Used", "Transactions"]);
    styleHeaderRow(header);
    rows.forEach((r) => {
      sheet.addRow([r.provider, r.availableInShopify, r.used, r.transactions]);
    });
    sheet.addRow([]);
  }
  autoFitColumns(sheet);
}

function addTransactionDetailSheet(workbook, transactionRecords) {
  const sheet = workbook.addWorksheet("Transaction Detail");
  const header = sheet.addRow([
    "Company",
    "Order ID",
    "Order Date",
    "Financial Status",
    "Fulfillment Status",
    "Currency",
    "Payment Method",
    "Payment Gateway (raw)",
    "Transaction ID",
    "Transaction Kind",
    "Transaction Status",
    "Transaction Date",
    "Transaction Amount",
  ]);
  styleHeaderRow(header);

  transactionRecords.forEach((r) => {
    const row = sheet.addRow([
      r.company,
      r.orderId,
      r.orderDate,
      r.financialStatus,
      r.fulfillmentStatus,
      r.currency,
      r.paymentMethod,
      r.paymentGateway,
      r.transactionId,
      r.transactionKind,
      r.transactionStatus,
      r.transactionDate,
      r.transactionAmount,
    ]);
    row.getCell(13).numFmt = CURRENCY_FMT;
  });

  sheet.autoFilter = { from: "A1", to: "M1" };
  autoFitColumns(sheet);
}

function addBrandAnalysisSheet(workbook, brandKey, { orderSummaries, executiveSummary, paymentMethodSummary }) {
  const sheet = workbook.addWorksheet(`${brandKey} Analysis`);

  sheet.addRow([`${brandKey} — Order & Revenue Detail`]).font = { bold: true, size: 12 };
  sheet.addRow([]);
  const kpiHeader = sheet.addRow(["Total Orders", "Total Revenue", "Total Transactions", "Avg Order Value"]);
  styleHeaderRow(kpiHeader);
  const kpiRow = sheet.addRow([
    executiveSummary.totalOrders,
    executiveSummary.totalRevenue,
    executiveSummary.totalTransactions,
    executiveSummary.averageOrderValue,
  ]);
  kpiRow.getCell(2).numFmt = CURRENCY_FMT;
  kpiRow.getCell(4).numFmt = CURRENCY_FMT;
  sheet.addRow([]);

  sheet.addRow(["Payment Method Breakdown"]).font = { bold: true };
  const pmHeader = sheet.addRow(["Payment Method", "Transactions", "Transaction %", "Revenue", "Revenue %"]);
  styleHeaderRow(pmHeader);
  paymentMethodSummary.forEach((r) => {
    const row = sheet.addRow([r.paymentMethod, r.transactions, r.transactionPct, r.revenue, r.revenuePct]);
    row.getCell(3).numFmt = PERCENT_FMT;
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.getCell(5).numFmt = PERCENT_FMT;
  });
  sheet.addRow([]);

  sheet.addRow(["Orders"]).font = { bold: true };
  const orderHeader = sheet.addRow([
    "Order ID",
    "Order Date",
    "Financial Status",
    "Fulfillment Status",
    "Customer Type",
    "Country",
    "Subtotal",
    "Discount",
    "Shipping",
    "Tax",
    "Total Order Value",
    "Refund Amount",
    "Net Revenue",
  ]);
  styleHeaderRow(orderHeader);
  orderSummaries.forEach((o) => {
    const row = sheet.addRow([
      o.orderId,
      o.orderDate,
      o.financialStatus,
      o.fulfillmentStatus,
      o.customerType,
      o.country,
      o.subtotal,
      o.discountAmount,
      o.shippingAmount,
      o.taxAmount,
      o.totalOrderValue,
      o.refundAmount,
      o.netRevenue,
    ]);
    [7, 8, 9, 10, 11, 12, 13].forEach((c) => (row.getCell(c).numFmt = CURRENCY_FMT));
  });

  sheet.autoFilter = { from: "A5", to: `M5` };
  autoFitColumns(sheet);
}

/**
 * Builds the full workbook exactly as specified:
 * Executive Summary, Payment Method Summary, Transaction Detail,
 * Payment Providers, CORRO Analysis, CAVALI Analysis.
 */
async function generateWorkbook({
  windowLabel,
  combinedExecutiveSummary,
  combinedPaymentMethodSummary,
  combinedTransactionRecords,
  topByBrand,
  providersByBrand,
  brandData, // { CORRO: {orderSummaries, executiveSummary, paymentMethodSummary}, CAVALI: {...} }
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Equestrian Labs, Inc. — Analytics Suite";
  workbook.created = new Date();

  const byBrandExecSummary = Object.fromEntries(
    Object.entries(brandData).map(([k, v]) => [k, v.executiveSummary])
  );

  addExecutiveSummarySheet(workbook, {
    combined: combinedExecutiveSummary,
    byBrand: byBrandExecSummary,
    windowLabel,
  });
  addPaymentMethodSummarySheet(workbook, "Payment Method Summary", combinedPaymentMethodSummary);
  addTransactionDetailSheet(workbook, combinedTransactionRecords);
  addPaymentProvidersSheet(workbook, providersByBrand);

  for (const [brandKey, data] of Object.entries(brandData)) {
    addBrandAnalysisSheet(workbook, brandKey, data);
  }

  // Top Payment Methods placed last so the workbook reads Summary -> Detail -> Providers -> Top 3 -> per-brand
  addTopPaymentMethodsSheet(workbook, topByBrand);

  return workbook;
}

module.exports = { generateWorkbook };
