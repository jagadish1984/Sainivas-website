const DB_NAME = "sai-nivas-billing-db";
const STORE_NAME = "app";
const RECORD_KEY = "state";

const dom = {
  notice: document.getElementById("notice"),
  monthSelect: document.getElementById("month-select"),
  dueDateDisplay: document.getElementById("due-date-display"),
  carryForwardValue: document.getElementById("carry-forward-value"),
  flatSearch: document.getElementById("flat-search"),
  summaryStrip: document.getElementById("summary-strip"),
  bankReportBody: document.getElementById("bank-report-body"),
  tankerReportBody: document.getElementById("tanker-report-body"),
  billingBody: document.getElementById("billing-body"),
  tableTitle: document.getElementById("table-title"),
  tankersCount: document.getElementById("tankers-count"),
  costPerTanker: document.getElementById("cost-per-tanker"),
  defaultMaintenance: document.getElementById("default-maintenance"),
  defaultGarbage: document.getElementById("default-garbage"),
  expenseTitle: document.getElementById("expense-title"),
  expenseList: document.getElementById("expense-list"),
  billHeading: document.getElementById("bill-heading"),
  billPreview: document.getElementById("bill-preview"),
  createNextMonth: document.getElementById("create-next-month"),
  syncExcel: document.getElementById("sync-excel"),
  importExcel: document.getElementById("import-excel"),
  importFile: document.getElementById("import-file"),
  resetDatabase: document.getElementById("reset-database"),
  exportDatabase: document.getElementById("export-database"),
  addExpense: document.getElementById("add-expense"),
  addCommonExpenses: document.getElementById("add-common-expenses"),
  printBill: document.getElementById("print-bill"),
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numberFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

let db;
let appState;

const commonExpensePresets = [
  { label: "Watch man salary", defaultAmount: 6500 },
  { label: "Majeera Water Bill", defaultAmount: 2044 },
  { label: "Garbage", defaultAmount: 800 },
  { label: "Common Power Bill", defaultAmount: 0 },
  { label: "Previous Month tanker bill payment", defaultAmount: 0 },
  { label: "Custom", defaultAmount: 0 },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function announce(message, tone = "info") {
  dom.notice.textContent = message;
  dom.notice.className = `notice ${tone === "info" ? "" : tone}`.trim();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGet(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbSet(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function endOfMonth(monthId) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month, 0).toISOString().slice(0, 10);
}

function dueDateForMonth(monthId) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month - 1, 10);
}

function labelFromMonthId(monthId) {
  const [year, month] = monthId.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function dueDateLabel(monthId) {
  const dueDate = dueDateForMonth(monthId);
  return dueDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  });
}

function nextMonthId(monthId) {
  const [year, month] = monthId.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.toLowerCase() === "na") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function displayReading(value) {
  if (value === "NA") return "NA";
  const numeric = numericValue(value);
  return numeric === null ? "NA" : numberFormat.format(numeric);
}

function computeUnits(previousReading, currentReading) {
  const previous = numericValue(previousReading);
  const current = numericValue(currentReading);
  if (previous === null || current === null) return 0;
  return Math.max(Math.round((current - previous) * 1000), 0);
}

function isShop(flatNumber) {
  return /^shop/i.test(flatNumber);
}

function isCommon(flatNumber) {
  return String(flatNumber).toLowerCase() === "common";
}

function isResidential(flatNumber) {
  return !isShop(flatNumber) && !isCommon(flatNumber);
}

function inferStatus(flat) {
  const received = Number(flat.receivedAmount || 0);
  const totalDue = Number(flat.totalDue || 0);
  if (isCommon(flat.flatNumber)) return "Shared";
  if (received === 0 && totalDue > 0) return "Pending";
  if (received >= totalDue && totalDue > 0) return "Paid";
  if (received > 0 && received < totalDue) return "Balance";
  return "Pending";
}

function safeAmount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthExpenseTitle(monthId) {
  const [year, month] = monthId.split("-").map(Number);
  const monthName = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long" });
  return `${monthName} ${year} expenditures`;
}

function chooseExpenseItems(sourceMonth) {
  const sections = Array.isArray(sourceMonth.expenseSections) ? sourceMonth.expenseSections : [];
  const preferred = sections[sections.length - 1];
  const items = preferred?.items || [];
  return items
    .filter((item) => item && (item.label || item.amount))
    .map((item, index) => ({
      id: `expense-${slugify(preferred?.title || "month")}-${index + 1}`,
      label: item.label || "",
      amount: safeAmount(item.amount),
      status: item.status || "",
      paymentDate: item.paymentDate || "",
    }));
}

function transformSeed(seed) {
  const months = seed.months.map((month, index) => {
    const flats = month.flats.map((flat) => ({
      id: slugify(flat.flatNumber),
      flatNumber: flat.flatNumber,
      previousReading: flat.previousReading ?? (isShop(flat.flatNumber) ? "NA" : ""),
      currentReading: flat.currentReading ?? (isShop(flat.flatNumber) ? "NA" : ""),
      commonMaintenance: safeAmount(flat.commonMaintenance),
      garbageAmount: safeAmount(flat.garbageAmount),
      receivedAmount: numericValue(flat.receiveAmount),
      paymentStatus: flat.paymentStatus || "",
    }));

    const firstResidential = flats.find((flat) => isResidential(flat.flatNumber));
    const summary = month.summary || {};

    return {
      id: month.id,
      label: month.label || labelFromMonthId(month.id),
      dueDate: dueDateForMonth(month.id).toISOString().slice(0, 10),
      carryForwardLabel: month.carryForwardLabel || `Bank balance as of ${month.label || month.id}`,
      carryForwardValue: safeAmount(month.carryForwardValue),
      settings: {
        tankerCount: safeAmount(summary.tankerCount),
        costPerTanker: safeAmount(summary.costPerTanker || 1200),
        defaultMaintenance: safeAmount(firstResidential?.commonMaintenance || 1200),
        defaultGarbage: safeAmount(firstResidential?.garbageAmount || 50),
      },
      expenses: chooseExpenseItems(month),
      flats,
      order: index,
    };
  });

  return {
    latestMonthId: seed.latestMonthId || months[months.length - 1]?.id,
    selectedMonthId: seed.latestMonthId || months[months.length - 1]?.id,
    selectedFlatId: slugify("101"),
    fixedFlats: seed.fixedFlats || months[months.length - 1]?.flats?.map((flat) => flat.flatNumber) || [],
    months,
  };
}

async function loadInitialState() {
  const stored = await dbGet(RECORD_KEY);
  if (stored) return stored;

  const response = await fetch("billing-seed.json");
  const seed = await response.json();
  const initialState = transformSeed(seed);
  await dbSet(RECORD_KEY, initialState);
  return initialState;
}

async function reloadFromSeed() {
  const response = await fetch(`billing-seed.json?t=${Date.now()}`);
  const seed = await response.json();
  appState = transformSeed(seed);
  await saveState();
  await render();
}

function monthRecord(monthId = appState.selectedMonthId) {
  return appState.months.find((month) => month.id === monthId);
}

function saveState() {
  return dbSet(RECORD_KEY, appState);
}

function flatComputedRows(month) {
  const baseWaterCost = safeAmount(month.settings.tankerCount) * safeAmount(month.settings.costPerTanker);
  const rows = month.flats.map((flat) => ({
    ...flat,
    units: computeUnits(flat.previousReading, flat.currentReading),
  }));

  const totalUsageUnits = rows.reduce((sum, flat) => sum + flat.units, 0);
  const perUnitCost = totalUsageUnits > 0 ? baseWaterCost / totalUsageUnits : 0;
  const commonRow = rows.find((flat) => isCommon(flat.flatNumber));
  const commonWaterBill = commonRow ? Math.round(commonRow.units * perUnitCost) : 0;
  const billableFlats = rows.filter((flat) => isResidential(flat.flatNumber));
  const shareBase = billableFlats.length ? Math.floor(commonWaterBill / billableFlats.length) : 0;
  const shareRemainder = billableFlats.length ? commonWaterBill % billableFlats.length : 0;

  const commonShareMap = new Map();
  billableFlats.forEach((flat, index) => {
    commonShareMap.set(flat.id, shareBase + (index < shareRemainder ? 1 : 0));
  });

  const computedRows = rows.map((flat) => {
    const baseWaterBill = isResidential(flat.flatNumber) ? Math.round(flat.units * perUnitCost) : 0;
    const commonShare = isResidential(flat.flatNumber) ? safeAmount(commonShareMap.get(flat.id)) : 0;
    const commonMaintenance = isCommon(flat.flatNumber) ? 0 : safeAmount(flat.commonMaintenance);
    const garbageAmount = isShop(flat.flatNumber) || isCommon(flat.flatNumber) ? 0 : safeAmount(flat.garbageAmount);
    const totalDue = isCommon(flat.flatNumber) ? 0 : baseWaterBill + commonShare + commonMaintenance + garbageAmount;
    const receivedAmount = isCommon(flat.flatNumber) ? 0 : safeAmount(flat.receivedAmount);
    const paymentStatus = flat.paymentStatus || inferStatus({ ...flat, receivedAmount, totalDue });

    return {
      ...flat,
      baseWaterBill,
      commonShare,
      waterBill: baseWaterBill + commonShare,
      commonMaintenance,
      garbageAmount,
      totalDue,
      receivedAmount,
      balance: totalDue - receivedAmount,
      paymentStatus,
    };
  });

  return {
    computedRows,
    totalUsageUnits,
    perUnitCost,
    baseWaterCost,
    commonWaterBill,
    tableTotalDue: computedRows.reduce((sum, flat) => sum + flat.totalDue, 0),
    tableTotalReceived: computedRows.reduce((sum, flat) => sum + flat.receivedAmount, 0),
    totalGarbage: computedRows.reduce((sum, flat) => sum + flat.garbageAmount, 0),
  };
}

function summaryCards(month, model) {
  const openBalance = model.tableTotalDue - model.tableTotalReceived;
  const sharedPerFlat = model.computedRows.find((flat) => isResidential(flat.flatNumber))?.commonShare || 0;
  return [
    { label: "Month", value: labelFromMonthId(month.id) },
    { label: "Water expense", value: currency.format(model.baseWaterCost) },
    { label: "Per unit cost", value: model.perUnitCost.toFixed(6) },
    { label: "Common water share", value: currency.format(sharedPerFlat) },
    { label: "Total due", value: currency.format(model.tableTotalDue) },
    { label: "Received", value: currency.format(model.tableTotalReceived) },
    { label: "Bank balance", value: currency.format(month.carryForwardValue || 0) },
  ];
}

function renderReports() {
  const recentMonths = appState.months
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(-12);

  dom.bankReportBody.innerHTML = recentMonths
    .map(
      (month) => `
        <tr>
          <td>${labelFromMonthId(month.id)}</td>
          <td>${currency.format(Number(month.carryForwardValue || 0))}</td>
        </tr>
      `
    )
    .join("");

  dom.tankerReportBody.innerHTML = recentMonths
    .map((month) => {
      const tankerCount = Number(month.settings?.tankerCount || 0);
      const rate = Number(month.settings?.costPerTanker || 0);
      const total = tankerCount * rate;
      return `
        <tr>
          <td>${labelFromMonthId(month.id)}</td>
          <td>${tankerCount}</td>
          <td>${currency.format(rate)}</td>
          <td>${currency.format(total)}</td>
        </tr>
      `;
    })
    .join("");
}

function statusClass(status) {
  if (status === "Paid") return "status-paid";
  if (status === "Balance") return "status-balance";
  return "status-pending";
}

function paymentStatusOptions(selected) {
  const options = ["Pending", "Paid", "Balance"];
  return options
    .map((option) => `<option value="${option}" ${selected === option ? "selected" : ""}>${option}</option>`)
    .join("");
}

function captureUiState() {
  const active = document.activeElement;
  const state = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    focus: null,
  };

  if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement) {
    state.focus = {
      action: active.dataset.action || "",
      id: active.dataset.id || "",
      field: active.dataset.field || "",
      selectionStart: active instanceof HTMLInputElement ? active.selectionStart : null,
      selectionEnd: active instanceof HTMLInputElement ? active.selectionEnd : null,
    };
  }

  return state;
}

function restoreUiState(uiState) {
  window.scrollTo(uiState.scrollX, uiState.scrollY);
  if (!uiState.focus) return;

  const selector = `[data-action="${uiState.focus.action}"][data-id="${uiState.focus.id}"][data-field="${uiState.focus.field}"]`;
  const target = document.querySelector(selector);
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement &&
    uiState.focus.selectionStart !== null &&
    uiState.focus.selectionEnd !== null
  ) {
    try {
      target.setSelectionRange(uiState.focus.selectionStart, uiState.focus.selectionEnd);
    } catch (error) {
      console.debug("Selection restore skipped", error);
    }
  }
}

function renderMonthOptions() {
  dom.monthSelect.innerHTML = appState.months
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((month) => `<option value="${month.id}" ${month.id === appState.selectedMonthId ? "selected" : ""}>${labelFromMonthId(month.id)}</option>`)
    .join("");
}

function renderSummary(month, model) {
  dom.summaryStrip.innerHTML = summaryCards(month, model)
    .map((card) => `<div class="summary-card"><span class="summary-label">${card.label}</span><span class="summary-value">${card.value}</span></div>`)
    .join("");
}

function renderTable(month, model) {
  const query = dom.flatSearch.value.trim().toLowerCase();
  dom.billingBody.innerHTML = model.computedRows
    .filter((flat) => flat.flatNumber.toLowerCase().includes(query))
    .map((flat) => {
      const rowClass = isCommon(flat.flatNumber) ? "common-row" : isShop(flat.flatNumber) ? "shop-row" : "";
      const canEditReading = !isShop(flat.flatNumber);
      const canEditCharges = isResidential(flat.flatNumber);
      const canEditStatus = !isCommon(flat.flatNumber);

      return `
        <tr class="${rowClass}">
          <td class="flat-name">${flat.flatNumber}</td>
          <td>${canEditReading ? `<input type="text" inputmode="decimal" value="${escapeHtml(flat.previousReading ?? "")}" data-action="flat-field" data-id="${flat.id}" data-field="previousReading">` : "NA"}</td>
          <td>${canEditReading ? `<input type="text" inputmode="decimal" value="${escapeHtml(flat.currentReading ?? "")}" data-action="flat-field" data-id="${flat.id}" data-field="currentReading">` : "NA"}</td>
          <td class="readonly">${numberFormat.format(flat.units)}</td>
          <td class="readonly">${isCommon(flat.flatNumber) ? "Shared" : isShop(flat.flatNumber) ? "NA" : currency.format(flat.baseWaterBill)}</td>
          <td class="readonly">${isResidential(flat.flatNumber) ? currency.format(flat.commonShare) : "—"}</td>
          <td>${canEditCharges ? `<input type="text" inputmode="numeric" value="${escapeHtml(flat.commonMaintenance ?? "")}" data-action="flat-field" data-id="${flat.id}" data-field="commonMaintenance">` : flat.commonMaintenance ? currency.format(flat.commonMaintenance) : "—"}</td>
          <td>${canEditCharges ? `<input type="text" inputmode="numeric" value="${escapeHtml(flat.garbageAmount ?? "")}" data-action="flat-field" data-id="${flat.id}" data-field="garbageAmount">` : "—"}</td>
          <td class="readonly">${currency.format(flat.totalDue)}</td>
          <td>${canEditStatus ? `<input type="text" inputmode="numeric" value="${escapeHtml(flat.receivedAmount ?? "")}" data-action="flat-field" data-id="${flat.id}" data-field="receivedAmount">` : "—"}</td>
          <td>${canEditStatus ? `<select class="status-select" data-action="flat-field" data-id="${flat.id}" data-field="paymentStatus">${paymentStatusOptions(flat.paymentStatus)}</select>` : `<span class="status-pill ${statusClass("Pending")}">Shared</span>`}</td>
          <td><button class="bill-button" type="button" data-action="select-bill" data-id="${flat.id}">View bill</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderExpenses(month) {
  dom.expenseTitle.textContent = monthExpenseTitle(month.id);
  dom.expenseList.innerHTML = month.expenses
    .map((item) => `
      <div class="expense-row">
        <select data-action="expense-field" data-id="${item.id}" data-field="label">
          ${commonExpensePresets
            .map((preset) => {
              const selected = preset.label === (item.label || "Custom") ? "selected" : "";
              return `<option value="${preset.label}" ${selected}>${preset.label}</option>`;
            })
            .join("")}
        </select>
        <input type="number" min="0" step="1" value="${item.amount || 0}" data-action="expense-field" data-id="${item.id}" data-field="amount">
        <select data-action="expense-field" data-id="${item.id}" data-field="status">
          <option value="" ${!item.status ? "selected" : ""}>Status</option>
          <option value="Paid" ${item.status === "Paid" ? "selected" : ""}>Paid</option>
          <option value="Pending" ${item.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="Part Payment" ${item.status === "Part Payment" ? "selected" : ""}>Part Payment</option>
        </select>
        <input type="date" value="${item.paymentDate || ""}" data-action="expense-field" data-id="${item.id}" data-field="paymentDate">
        <button class="button ghost" type="button" data-action="remove-expense" data-id="${item.id}">Remove</button>
      </div>
    `)
    .join("");
}

function renderBillPreview(month, model) {
  const selectedId = appState.selectedFlatId || model.computedRows[0]?.id;
  const flat = model.computedRows.find((item) => item.id === selectedId) || model.computedRows[0];

  if (!flat) {
    dom.billHeading.textContent = "Select a flat";
    dom.billPreview.innerHTML = "<p class='muted'>No bill data available.</p>";
    return;
  }

  appState.selectedFlatId = flat.id;
  dom.billHeading.textContent = `Monthly bill for ${flat.flatNumber} - ${labelFromMonthId(month.id)}`;

  if (isCommon(flat.flatNumber)) {
    dom.billPreview.innerHTML = `
      <div class="bill-sheet">
        <div class="bill-head">
          <div class="bill-brand">
            <p class="eyebrow small">Shared usage statement</p>
            <h3>Sai Nivas Building</h3>
          </div>
          <div class="bill-month">${labelFromMonthId(month.id)}</div>
        </div>
        <div class="bill-note">
          The <strong>Common</strong> meter is for watchman/common usage. Its water bill is not billed to Common directly.
          The amount is shared across the 16 residential flats for this month.
        </div>
        <div class="bill-lines">
          <div class="bill-line"><span>Common units</span><strong>${numberFormat.format(flat.units)}</strong></div>
          <div class="bill-line"><span>Total shared common water bill</span><strong>${currency.format(model.commonWaterBill)}</strong></div>
          <div class="bill-line"><span>Per residential flat share</span><strong>${currency.format(model.computedRows.find((row) => isResidential(row.flatNumber))?.commonShare || 0)}</strong></div>
        </div>
      </div>
    `;
    return;
  }

  dom.billPreview.innerHTML = `
    <div class="bill-sheet">
      <div class="bill-head">
        <div class="bill-brand">
          <p class="eyebrow small">Monthly maintenance bill</p>
          <h3 class="bill-heading-main">Sai Nivas Building</h3>
          <p class="muted">Water reading, common maintenance, and garbage collection bill.</p>
        </div>
        <div class="bill-month">${labelFromMonthId(month.id)}</div>
      </div>
      <div class="bill-meta">
        <div>
          <div class="bill-label">Flat number</div>
          <div class="bill-value">${flat.flatNumber}</div>
        </div>
        <div>
          <div class="bill-label">Due date</div>
          <div class="bill-value">${dueDateLabel(month.id)}</div>
        </div>
        <div>
          <div class="bill-label">Previous reading</div>
          <div class="bill-value">${displayReading(flat.previousReading)}</div>
        </div>
        <div>
          <div class="bill-label">Current reading</div>
          <div class="bill-value">${displayReading(flat.currentReading)}</div>
        </div>
      </div>
      <div class="bill-lines">
        <div class="bill-line"><span>Water units</span><strong>${numberFormat.format(flat.units)}</strong></div>
        <div class="bill-line"><span>Own water bill</span><strong>${isShop(flat.flatNumber) ? "NA" : currency.format(flat.baseWaterBill)}</strong></div>
        <div class="bill-line"><span>Shared common water</span><strong>${isResidential(flat.flatNumber) ? currency.format(flat.commonShare) : "—"}</strong></div>
        <div class="bill-line"><span>Common maintenance</span><strong>${currency.format(flat.commonMaintenance)}</strong></div>
        <div class="bill-line"><span>Garbage</span><strong>${currency.format(flat.garbageAmount)}</strong></div>
        <div class="bill-line"><span>Received amount</span><strong>${currency.format(flat.receivedAmount)}</strong></div>
        <div class="bill-line total"><span>Total due</span><strong>${currency.format(flat.totalDue)}</strong></div>
        <div class="bill-line total"><span>Status</span><strong>${flat.paymentStatus}</strong></div>
      </div>
      <div class="bill-note">
        Water charge calculation: ${currency.format(model.baseWaterCost)} / ${numberFormat.format(model.totalUsageUnits)} units = ${model.perUnitCost.toFixed(6)} per unit for ${labelFromMonthId(month.id)}.
      </div>
    </div>
  `;
}

function syncHeaderFields(month) {
  dom.tableTitle.textContent = `Monthly billing sheet for ${labelFromMonthId(month.id)}`;
  month.dueDate = dueDateForMonth(month.id).toISOString().slice(0, 10);
  dom.dueDateDisplay.textContent = dueDateLabel(month.id);
  dom.carryForwardValue.value = month.carryForwardValue || 0;
  dom.tankersCount.value = month.settings.tankerCount || 0;
  dom.costPerTanker.value = month.settings.costPerTanker || 0;
  dom.defaultMaintenance.value = month.settings.defaultMaintenance || 0;
  dom.defaultGarbage.value = month.settings.defaultGarbage || 0;
}

async function render() {
  const uiState = captureUiState();
  const month = monthRecord();
  if (!month) return;

  renderMonthOptions();
  const model = flatComputedRows(month);
  syncHeaderFields(month);
  renderSummary(month, model);
  renderReports();
  renderTable(month, model);
  renderExpenses(month);
  renderBillPreview(month, model);
  await saveState();
  restoreUiState(uiState);
}

function updateFlat(month, flatId, field, value) {
  const flat = month.flats.find((item) => item.id === flatId);
  if (!flat) return;

  if (field === "paymentStatus") {
    flat.paymentStatus = value;
    return;
  }

  flat[field] = value;
}

function updateExpense(month, expenseId, field, value) {
  const item = month.expenses.find((expense) => expense.id === expenseId);
  if (!item) return;
  if (field === "label") {
    item.label = value;
    const preset = commonExpensePresets.find((entry) => entry.label === value);
    if (preset && (!item.amount || item.amount === 0)) {
      item.amount = preset.defaultAmount || 0;
    }
    return;
  }
  if (field === "amount") {
    item.amount = Number(value || 0);
    return;
  }
  item[field] = value;
}

function createMonthFromPrevious(previousMonth) {
  const newMonthId = nextMonthId(previousMonth.id);
  const existing = monthRecord(newMonthId);
  if (existing) {
    appState.selectedMonthId = existing.id;
    announce(`${labelFromMonthId(newMonthId)} already exists. Opened that month instead.`, "info");
    return;
  }

  const newMonth = {
    id: newMonthId,
    label: labelFromMonthId(newMonthId),
    dueDate: dueDateForMonth(newMonthId).toISOString().slice(0, 10),
    carryForwardLabel: `Bank balance as of ${labelFromMonthId(previousMonth.id)}`,
    carryForwardValue: previousMonth.carryForwardValue || 0,
    settings: { ...previousMonth.settings },
    expenses: [],
    flats: previousMonth.flats.map((flat) => {
      if (isShop(flat.flatNumber)) {
        return {
          ...flat,
          previousReading: "NA",
          currentReading: "NA",
          commonMaintenance: 300,
          garbageAmount: 0,
          receivedAmount: null,
          paymentStatus: "Pending",
        };
      }

      const previous = numericValue(flat.currentReading);
      const nextPrevious = previous === null ? "" : previous;
      return {
        ...flat,
        previousReading: nextPrevious,
        currentReading: nextPrevious,
        commonMaintenance: isCommon(flat.flatNumber) ? 0 : previousMonth.settings.defaultMaintenance,
        garbageAmount: isResidential(flat.flatNumber) ? previousMonth.settings.defaultGarbage : 0,
        receivedAmount: null,
        paymentStatus: isCommon(flat.flatNumber) ? "" : "Pending",
      };
    }),
    order: appState.months.length,
  };

  appState.months.push(newMonth);
  appState.selectedMonthId = newMonthId;
  announce(`${labelFromMonthId(newMonthId)} created. Previous month current readings were carried forward.`, "success");
}

function addExpense(month) {
  month.expenses.push({
    id: `expense-${Date.now()}`,
    label: "Custom",
    amount: 0,
    status: "",
    paymentDate: "",
  });
}

function addCommonExpenses(month) {
  const existing = new Set(month.expenses.map((item) => item.label));
  commonExpensePresets
    .filter((item) => item.label !== "Custom")
    .forEach((preset) => {
      if (existing.has(preset.label)) return;
      month.expenses.push({
        id: `expense-${slugify(preset.label)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: preset.label,
        amount: preset.defaultAmount,
        status: "",
        paymentDate: "",
      });
    });
}

function removeExpense(month, expenseId) {
  month.expenses = month.expenses.filter((item) => item.id !== expenseId);
}

function exportDatabase() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sai-nivas-billing-db-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  announce("Local billing database exported.", "success");
}

async function resetDatabase() {
  const response = await fetch("billing-seed.json");
  const seed = await response.json();
  appState = transformSeed(seed);
  await render();
  announce("Local database reset to workbook seed data.", "success");
}

async function syncToExcel() {
  dom.syncExcel.disabled = true;
  dom.syncExcel.textContent = "Syncing...";

  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(appState),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Sync failed");
    }

    announce(result.message || "Workbook synced successfully.", "success");
  } catch (error) {
    console.error(error);
    announce(error.message || "Unable to sync workbook.", "danger");
  } finally {
    dom.syncExcel.disabled = false;
    dom.syncExcel.textContent = "Sync to Excel";
  }
}

async function importExcelFile(file) {
  if (!file) return;

  dom.importExcel.disabled = true;
  dom.importExcel.textContent = "Importing...";

  try {
    const buffer = await file.arrayBuffer();
    const response = await fetch(`/api/import?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: buffer,
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Import failed");
    }

    await reloadFromSeed();
    announce(result.message || "Excel workbook imported successfully.", "success");
  } catch (error) {
    console.error(error);
    announce(error.message || "Unable to import workbook.", "danger");
  } finally {
    dom.importFile.value = "";
    dom.importExcel.disabled = false;
    dom.importExcel.textContent = "Import Excel";
  }
}

function attachEvents() {
  dom.monthSelect.addEventListener("change", async (event) => {
    appState.selectedMonthId = event.target.value;
    await render();
  });

  dom.flatSearch.addEventListener("input", () => render());

  dom.carryForwardValue.addEventListener("input", async (event) => {
    monthRecord().carryForwardValue = Number(event.target.value || 0);
    await render();
  });

  [dom.tankersCount, dom.costPerTanker, dom.defaultMaintenance, dom.defaultGarbage].forEach((input) => {
    input.addEventListener("input", async () => {
      const month = monthRecord();
      month.settings.tankerCount = Number(dom.tankersCount.value || 0);
      month.settings.costPerTanker = Number(dom.costPerTanker.value || 0);
      month.settings.defaultMaintenance = Number(dom.defaultMaintenance.value || 0);
      month.settings.defaultGarbage = Number(dom.defaultGarbage.value || 0);
      month.flats.forEach((flat) => {
        if (isResidential(flat.flatNumber)) {
          if (!flat.commonMaintenance && month.settings.defaultMaintenance) {
            flat.commonMaintenance = month.settings.defaultMaintenance;
          }
          if (!flat.garbageAmount && month.settings.defaultGarbage) {
            flat.garbageAmount = month.settings.defaultGarbage;
          }
        }
      });
      await render();
    });
  });

  dom.billingBody.addEventListener("input", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset.action !== "flat-field") return;
    updateFlat(monthRecord(), target.dataset.id, target.dataset.field, target.value);
    await render();
  });

  dom.billingBody.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    if (target.dataset.action !== "flat-field") return;
    updateFlat(monthRecord(), target.dataset.id, target.dataset.field, target.value);
    await render();
  });

  dom.billingBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='select-bill']");
    if (!button) return;
    appState.selectedFlatId = button.dataset.id;
    await render();
  });

  dom.expenseList.addEventListener("input", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.action !== "expense-field") return;
    updateExpense(monthRecord(), target.dataset.id, target.dataset.field, target.value);
    await render();
  });

  dom.expenseList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action='remove-expense']");
    if (!button) return;
    removeExpense(monthRecord(), button.dataset.id);
    await render();
  });

  dom.addExpense.addEventListener("click", async () => {
    addExpense(monthRecord());
    await render();
  });

  dom.addCommonExpenses.addEventListener("click", async () => {
    addCommonExpenses(monthRecord());
    await render();
  });

  dom.createNextMonth.addEventListener("click", async () => {
    createMonthFromPrevious(monthRecord());
    await render();
  });

  dom.syncExcel.addEventListener("click", syncToExcel);
  dom.importExcel.addEventListener("click", () => dom.importFile.click());
  dom.importFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await importExcelFile(file);
  });
  dom.exportDatabase.addEventListener("click", exportDatabase);
  dom.resetDatabase.addEventListener("click", resetDatabase);
  dom.printBill.addEventListener("click", () => window.print());
}

async function init() {
  db = await openDatabase();
  appState = await loadInitialState();
  attachEvents();
  await render();
  announce("Workbook data loaded into the local database. You can update any month and create the next one.");
}

init().catch((error) => {
  console.error(error);
  announce("Unable to load billing data. Please refresh the page.", "danger");
});
