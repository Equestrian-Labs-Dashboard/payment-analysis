"use strict";

const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const config = require("./config");
const { ShopifyClient } = require("./shopifyClient");
const {
  buildBrandRecords,
  computeExecutiveSummary,
  computePaymentMethodSummary,
  computeTopPaymentMethods,
  computeProviderComparison,
} = require("./dataProcessor");
const { generateWorkbook } = require("./reportGenerator");

function parseCliArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function run() {
  const cliArgs = parseCliArgs(process.argv);
  const { from, to } = config.resolveDateWindow(cliArgs);
  const windowLabel = `${from.toFormat("yyyy-LL-dd")} to ${to.toFormat("yyyy-LL-dd")}`;
  const brands = config.getBrands();
  const availableProviders = config.getAvailableProviders();

  if (brands.length === 0) {
    console.error(
      "No brand credentials found. Fill in .env (see .env.example) with at least one of " +
        "SHOPIFY_CORRO_STORE/TOKEN or SHOPIFY_CAVALI_STORE/TOKEN before running `npm run report`."
    );
    process.exit(1);
  }

  console.log(`Shopify Payment Methods Analysis — window: ${windowLabel}`);
  console.log(`Brands: ${brands.map((b) => b.key).join(", ")}`);

  const brandData = {};
  const allTransactionRecords = [];
  const allOrderSummaries = [];
  const topByBrand = {};
  const providersByBrand = {};

  for (const brand of brands) {
    console.log(`\nFetching ${brand.key} orders + transactions...`);
    const client = new ShopifyClient({
      storeDomain: brand.storeDomain,
      accessToken: brand.accessToken,
      apiVersion: config.apiVersion,
      brandKey: brand.key,
    });

    const { orderSummaries, transactionRecords } = await buildBrandRecords(
      client,
      brand.key,
      from,
      to
    );

    const executiveSummary = computeExecutiveSummary(orderSummaries, transactionRecords);
    const paymentMethodSummary = computePaymentMethodSummary(transactionRecords);
    const topPaymentMethods = computeTopPaymentMethods(paymentMethodSummary);
    const providerComparison = computeProviderComparison(availableProviders, paymentMethodSummary);

    brandData[brand.key] = { orderSummaries, executiveSummary, paymentMethodSummary };
    topByBrand[brand.key] = topPaymentMethods;
    providersByBrand[brand.key] = providerComparison;

    allTransactionRecords.push(...transactionRecords);
    allOrderSummaries.push(...orderSummaries);

    console.log(
      `  ${brand.key}: ${orderSummaries.length} orders, ${executiveSummary.totalTransactions} successful transactions`
    );
  }

  const combinedExecutiveSummary = computeExecutiveSummary(allOrderSummaries, allTransactionRecords);
  const combinedPaymentMethodSummary = computePaymentMethodSummary(allTransactionRecords);

  console.log("\nGenerating workbook...");
  const workbook = await generateWorkbook({
    windowLabel,
    combinedExecutiveSummary,
    combinedPaymentMethodSummary,
    combinedTransactionRecords: allTransactionRecords,
    topByBrand,
    providersByBrand,
    brandData,
  });

  const outputDir = path.join(__dirname, "..", "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const xlsxPath = path.join(outputDir, "Shopify_Payment_Methods_Analysis.xlsx");
  await workbook.xlsx.writeFile(xlsxPath);
  console.log(`Workbook written to ${xlsxPath}`);

  const dashboardJsonPath = path.join(__dirname, "..", "docs", "data", "report-summary.json");
  fs.mkdirSync(path.dirname(dashboardJsonPath), { recursive: true });
  fs.writeFileSync(
    dashboardJsonPath,
    JSON.stringify(
      {
        generatedAt: DateTime.utc().toISO(),
        windowLabel,
        combined: {
          executiveSummary: combinedExecutiveSummary,
          paymentMethodSummary: combinedPaymentMethodSummary,
          topPaymentMethods: computeTopPaymentMethods(combinedPaymentMethodSummary),
        },
        brands: Object.fromEntries(
          Object.entries(brandData).map(([key, data]) => [
            key,
            {
              executiveSummary: data.executiveSummary,
              paymentMethodSummary: data.paymentMethodSummary,
              topPaymentMethods: topByBrand[key],
              providers: providersByBrand[key],
            },
          ])
        ),
      },
      null,
      2
    )
  );
  console.log(`Dashboard data written to ${dashboardJsonPath}`);
}

run().catch((err) => {
  console.error("\nReport generation failed:");
  console.error(err.message);
  process.exit(1);
});
