const storageKey = 'sainivas:billing';
const rowsContainer = document.getElementById('resident-rows');
const overviewContainer = document.getElementById('overview');
const searchInput = document.getElementById('search');
const statusFilter = document.getElementById('status-filter');
const rowTemplate = document.getElementById('row-template');
const flatOptions = document.getElementById('flat-options');

const formatCurrency = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

function seedData() {
  return {
    flats: [
      { flat: 'A-101', resident: 'Bhavana Rao', phone: '9876543210', maintenance: 2200, lastPayment: '2024-12-05', status: 'paid', notes: 'UPI', history: [] },
      { flat: 'A-102', resident: 'Ramesh Kumar', phone: '9822012233', maintenance: 2200, lastPayment: '2025-01-03', status: 'pending', notes: 'Check due', history: [] },
      { flat: 'B-201', resident: 'Amrita & Dev', phone: '9812244556', maintenance: 2400, lastPayment: '2024-12-28', status: 'overdue', notes: 'Travelled', history: [] },
      { flat: 'B-202', resident: 'Sushil Agarwal', phone: '9811290901', maintenance: 2400, lastPayment: '2025-01-07', status: 'paid', notes: 'Cash', history: [] }
    ]
  };
}

function loadData() {
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    try {
      return JSON.parse(existing);
    } catch (e) {
      console.warn('Invalid saved data, resetting.');
    }
  }
  const base = seedData();
  localStorage.setItem(storageKey, JSON.stringify(base));
  return base;
}

let state = loadData();

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function summarize() {
  const totalFlats = state.flats.length;
  const pending = state.flats.filter((f) => f.status === 'pending').length;
  const overdue = state.flats.filter((f) => f.status === 'overdue').length;
  const paid = state.flats.filter((f) => f.status === 'paid').length;
  const totalMaintenance = state.flats.reduce((sum, f) => sum + Number(f.maintenance || 0), 0);
  const collectedThisMonth = state.flats.reduce((sum, f) => {
    const last = f.lastPayment ? new Date(f.lastPayment) : null;
    const now = new Date();
    if (last && last.getMonth() === now.getMonth() && last.getFullYear() === now.getFullYear()) {
      return sum + Number(f.maintenance || 0);
    }
    return sum;
  }, 0);

  const stats = [
    { label: 'Active flats', value: totalFlats, tone: 'neutral' },
    { label: 'Collected this month', value: formatCurrency(collectedThisMonth), tone: 'success' },
    { label: 'Pending follow-ups', value: pending, tone: 'warning' },
    { label: 'Overdue', value: overdue, tone: 'danger' },
    { label: 'Total monthly billing', value: formatCurrency(totalMaintenance), tone: 'neutral' },
    { label: 'Paid up-to-date', value: paid, tone: 'success' },
  ];

  overviewContainer.innerHTML = '';
  stats.forEach((stat) => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<h3>${stat.label}</h3><div class="stat-value">${stat.value}</div>`;
    overviewContainer.appendChild(card);
  });
}

function badge(status) {
  const map = {
    paid: { text: 'Paid', class: 'success' },
    pending: { text: 'Pending', class: 'warning' },
    overdue: { text: 'Overdue', class: 'danger' },
  };
  const data = map[status] || { text: 'Unknown', class: 'neutral' };
  return `<span class="badge small ${data.class}">${data.text}</span>`;
}

function statusFromDate(date, maintenance) {
  if (!date) return 'pending';
  const last = new Date(date);
  const now = new Date();
  const monthsDiff = (now.getFullYear() - last.getFullYear()) * 12 + now.getMonth() - last.getMonth();
  if (monthsDiff <= 0) return 'paid';
  if (monthsDiff === 1 && maintenance > 0) return 'pending';
  return 'overdue';
}

function renderFlats() {
  const query = searchInput.value.toLowerCase();
  const filter = statusFilter.value;
  rowsContainer.innerHTML = '';
  flatOptions.innerHTML = '';

  state.flats
    .filter((f) => {
      const matchesQuery = `${f.flat} ${f.resident}`.toLowerCase().includes(query);
      const matchesStatus = filter === 'all' ? true : f.status === filter;
      return matchesQuery && matchesStatus;
    })
    .sort((a, b) => a.flat.localeCompare(b.flat))
    .forEach((flat) => {
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      const fields = row.querySelectorAll('[data-field]');
      fields.forEach((cell) => {
        const key = cell.dataset.field;
        switch (key) {
          case 'flat':
            cell.textContent = flat.flat;
            break;
          case 'resident':
            cell.innerHTML = `<div class="strong">${flat.resident}</div><div class="muted">${flat.phone || ''}</div>`;
            break;
          case 'maintenance':
            cell.textContent = formatCurrency(flat.maintenance);
            break;
          case 'lastPayment':
            cell.textContent = flat.lastPayment ? new Date(flat.lastPayment).toLocaleDateString() : '—';
            break;
          case 'status':
            cell.innerHTML = badge(flat.status);
            break;
          case 'notes':
            cell.textContent = flat.notes || 'No notes';
            break;
          case 'actions':
            cell.innerHTML = `
              <button class="ghost" data-action="collect" data-flat="${flat.flat}">Collect</button>
              <button class="ghost" data-action="mark-pending" data-flat="${flat.flat}">Mark pending</button>
            `;
            break;
          default:
            break;
        }
      });

      row.querySelectorAll('div[data-field]').forEach((cell) => {
        cell.setAttribute('data-label', cell.dataset.field.replace(/([A-Z])/g, ' $1'));
      });

      rowsContainer.appendChild(row);

      const option = document.createElement('option');
      option.value = flat.flat;
      flatOptions.appendChild(option);
    });
}

function addOrUpdateFlat(flatData) {
  const existing = state.flats.find((f) => f.flat.toLowerCase() === flatData.flat.toLowerCase());
  if (existing) {
    Object.assign(existing, flatData);
  } else {
    state.flats.push(flatData);
  }
  saveState();
  renderFlats();
  summarize();
}

function collectPayment(flatId, amount, date, notes) {
  const flat = state.flats.find((f) => f.flat.toLowerCase() === flatId.toLowerCase());
  if (!flat) return;
  const paymentDate = date || new Date().toISOString().slice(0, 10);
  flat.lastPayment = paymentDate;
  flat.status = 'paid';
  flat.notes = notes || flat.notes;
  flat.history = flat.history || [];
  flat.history.unshift({ amount, date: paymentDate, notes });
  saveState();
  renderFlats();
  summarize();
}

function markPending(flatId) {
  const flat = state.flats.find((f) => f.flat.toLowerCase() === flatId.toLowerCase());
  if (!flat) return;
  flat.status = 'pending';
  saveState();
  renderFlats();
  summarize();
}

function attachEvents() {
  searchInput.addEventListener('input', renderFlats);
  statusFilter.addEventListener('change', renderFlats);

  rowsContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const flat = button.dataset.flat;
    if (button.dataset.action === 'collect') {
      const defaultAmount = state.flats.find((f) => f.flat === flat)?.maintenance || 0;
      collectPayment(flat, defaultAmount, new Date().toISOString().slice(0, 10), 'Collected via quick action');
    }
    if (button.dataset.action === 'mark-pending') {
      markPending(flat);
    }
  });

  document.getElementById('payment-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const flat = document.getElementById('payment-flat').value.trim();
    const amount = Number(document.getElementById('payment-amount').value) || 0;
    const date = document.getElementById('payment-date').value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('payment-notes').value.trim();
    collectPayment(flat, amount, date, notes);
    event.target.reset();
  });

  document.getElementById('flat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const payload = {
      flat: document.getElementById('flat-number').value.trim(),
      resident: document.getElementById('flat-resident').value.trim(),
      maintenance: Number(document.getElementById('flat-maintenance').value) || 0,
      phone: document.getElementById('flat-phone').value.trim(),
      notes: document.getElementById('flat-notes').value.trim(),
      lastPayment: new Date().toISOString().slice(0, 10),
      status: 'paid',
    };
    addOrUpdateFlat(payload);
    event.target.reset();
  });

  document.getElementById('reset-data').addEventListener('click', () => {
    state = seedData();
    saveState();
    renderFlats();
    summarize();
  });

  document.getElementById('export-data').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sainivas-billing-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function refreshStatuses() {
  state.flats.forEach((flat) => {
    flat.status = statusFromDate(flat.lastPayment, flat.maintenance);
  });
  saveState();
}

refreshStatuses();
attachEvents();
renderFlats();
summarize();
