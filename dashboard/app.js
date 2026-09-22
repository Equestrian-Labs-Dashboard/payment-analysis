(function () {
  "use strict";

  const DATA_URL = "data/report-summary.json";
  const FALLBACK_URL = "../sample-data/report-summary.sample.json";

  let reportData = null;
  let currentBrand = "CORRO"; // CORRO | CAVALI | ALL

  const fmtCurrency = (n) =>
    "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) ;
  const fmtMoneyFull = (n) =>
    "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");
  const fmtPct = (n) => Number(n || 0).toFixed(1) + "%";

  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("primary data not found");
      return await res.json();
    } catch (e) {
      const res = await fetch(FALLBACK_URL, { cache: "no-store" });
      return await res.json();
    }
  }

  function scopeFor(brand) {
    if (brand === "ALL") return reportData.combined;
    return reportData.brands[brand];
  }

  function render() {
    const scope = scopeFor(currentBrand);
    const title = currentBrand === "ALL" ? "All Brands" : currentBrand[0] + currentBrand.slice(1).toLowerCase();
    document.getElementById("pageTitle").textContent = `${title} — Payment Methods`;
    document.getElementById("windowLabel").textContent =
      `${reportData.windowLabel} · Orders API + Transactions API`;
    document.getElementById("generatedAtLabel").textContent = new Date(reportData.generatedAt)
      .toISOString()
      .slice(0, 10);

    renderKpis(scope.executiveSummary);
    renderSummaryTable(scope.paymentMethodSummary);
    renderTop3(scope.topPaymentMethods);
    renderProviders(scope.providers || combinedProviders());
  }

  function combinedProviders() {
    // "All brands" view merges the per-brand provider tables by summing transactions.
    const merged = new Map();
    for (const brandKey of Object.keys(reportData.brands)) {
      const rows = reportData.brands[brandKey].providers || [];
      for (const r of rows) {
        if (!merged.has(r.provider)) {
          merged.set(r.provider, { ...r, transactions: 0 });
        }
        merged.get(r.provider).transactions += r.transactions;
        if (r.used === "Yes") merged.get(r.provider).used = "Yes";
      }
    }
    return Array.from(merged.values()).sort((a, b) => b.transactions - a.transactions);
  }

  function renderKpis(exec) {
    const grid = document.getElementById("kpiGrid");
    const items = [
      { label: "Total Orders", value: fmtInt(exec.totalOrders) },
      { label: "Total Revenue", value: fmtMoneyFull(exec.totalRevenue) },
      { label: "Total Transactions", value: fmtInt(exec.totalTransactions) },
      { label: "Average Order Value", value: fmtMoneyFull(exec.averageOrderValue) },
    ];
    grid.innerHTML = items
      .map(
        (i) => `
      <div class="kpi-card">
        <div class="kpi-label">${i.label}</div>
        <div class="kpi-value">${i.value}</div>
      </div>`
      )
      .join("");
  }

  function renderSummaryTable(rows) {
    const tbody = document.querySelector("#summaryTable tbody");
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td class="method-name">${r.paymentMethod}</td>
        <td>${fmtInt(r.transactions)}</td>
        <td>${fmtPct(r.transactionPct)}</td>
        <td>${fmtMoneyFull(r.revenue)}</td>
        <td>${fmtPct(r.revenuePct)}</td>
        <td>${fmtMoneyFull(r.avgOrderValue)}</td>
      </tr>`
      )
      .join("");
  }

  function renderTop3(rows) {
    const grid = document.getElementById("top3Grid");
    const maxPct = Math.max(...rows.map((r) => r.transactionPct), 1);
    grid.innerHTML = rows
      .map(
        (r, i) => `
      <div class="top3-card">
        <div class="top3-rank">#${i + 1}</div>
        <div class="top3-method">${r.paymentMethod}</div>
        <div class="top3-pct">${fmtPct(r.transactionPct)}</div>
        <div class="top3-bar-track">
          <div class="top3-bar-fill" style="width:${(r.transactionPct / maxPct) * 100}%"></div>
        </div>
        <div class="top3-meta">${fmtInt(r.transactions)} transactions · ${fmtMoneyFull(r.revenue)} revenue</div>
      </div>`
      )
      .join("");
  }

  function renderProviders(rows) {
    const tbody = document.querySelector("#providersTable tbody");
    tbody.innerHTML = rows
      .map((r) => {
        const usedBadge =
          r.used === "Yes"
            ? '<span class="badge badge--yes">Used</span>'
            : '<span class="badge badge--no">Not used</span>';
        const availBadge =
          r.availableInShopify === "Not configured"
            ? '<span class="badge badge--extra">Not configured</span>'
            : r.availableInShopify;
        return `
      <tr>
        <td class="method-name">${r.provider}</td>
        <td>${availBadge}</td>
        <td>${usedBadge}</td>
        <td>${fmtInt(r.transactions)}</td>
      </tr>`;
      })
      .join("");
  }

  function wireControls() {
    document.getElementById("brandToggle").addEventListener("click", (e) => {
      const btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      currentBrand = btn.dataset.brand;
      document
        .querySelectorAll(".toggle-btn")
        .forEach((b) => b.classList.toggle("toggle-btn--active", b === btn));
      render();
    });

    document.querySelectorAll("[data-brand-link]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const brand = link.dataset.brandLink;
        currentBrand = brand;
        document
          .querySelectorAll(".toggle-btn")
          .forEach((b) => b.classList.toggle("toggle-btn--active", b.dataset.brand === brand));
        render();
      });
    });

    document.getElementById("refreshBtn").addEventListener("click", async () => {
      reportData = await loadData();
      render();
    });
  }

  (async function init() {
    reportData = await loadData();
    wireControls();
    render();
  })();
})();
