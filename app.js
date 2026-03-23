/* =========================================
   SPLIT TAB — App Logic (Google Sheets Backend)
   ========================================= */

// ─── CONFIG ─────────────────────────────
// After deploying the Apps Script, paste the Web App URL here:
const API_URL = 'https://script.google.com/macros/s/AKfycbwyZlH45pzJ86FZ5MdsRRZA5dvtlB2yt6Xhh2N61tuBhAIC_lM6EHZqqEfLn3ErfGbQ0w/exec';

const USERS = { A: 'Yarin', B: 'Cat' };

// ─── State ──────────────────────────────
let expenses = [];
let currentFilter = 'all';
let currentPayer = USERS.A;
let currentSplit = 'equal';
let isLoading = false;
let editingId = null;

// ─── DOM refs ───────────────────────────
const form = document.getElementById('expenseForm');
const descInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('expenseDate');
const expenseList = document.getElementById('expenseList');
const balanceAmount = document.getElementById('balanceAmount');
const balanceLabel = document.getElementById('balanceLabel');
const totalExpensesEl = document.getElementById('totalExpenses');
const txCountEl = document.getElementById('txCount');
const yarinPaidEl = document.getElementById('yarinPaid');
const catPaidEl = document.getElementById('catPaid');
const historyBadge = document.getElementById('historyBadge');
const expensePreview = document.getElementById('expensePreview');
const previewText = document.getElementById('previewText');
const submitBtnText = document.getElementById('submitBtnText');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const formTitle = document.getElementById('formTitle');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalCancel = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');
const modalCount = document.getElementById('modalCount');

// ─── Init ────────────────────────────────
dateInput.value = todayISO();

if (!API_URL || API_URL === 'PASTE_YOUR_APPS_SCRIPT_URL_HERE') {
  showBanner('⚙️ Setup needed: paste your Apps Script URL into app.js (see instructions)', 'amber');
  renderAll();
} else {
  loadFromSheets();
}

initCategoryControls();

const catTitleToggle = document.getElementById('catTitleToggle');
const catSection = document.getElementById('catSection');
if (catTitleToggle && catSection) {
  if (window.innerWidth <= 768) {
    catSection.classList.add('collapsed');
  }
  catTitleToggle.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      catSection.classList.toggle('collapsed');
    }
  });
}

// ─── Auto-refresh every 30 seconds ───────
setInterval(() => {
  if (API_URL && API_URL !== 'PASTE_YOUR_APPS_SCRIPT_URL_HERE') {
    loadFromSheets(true); // silent refresh
  }
}, 30000);

// ─── Category picker ─────────────────────
let selectedEmoji = '';
document.querySelectorAll('.cat-pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-pick-btn').forEach(b => b.classList.remove('active'));
    if (selectedEmoji === btn.dataset.emoji) {
      // clicking same button deselects it
      selectedEmoji = '';
    } else {
      btn.classList.add('active');
      selectedEmoji = btn.dataset.emoji;
    }
  });
});

// ─── Event Listeners ─────────────────────

document.querySelectorAll('#payerToggle .toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#payerToggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPayer = btn.dataset.value;
    updatePreview();
  });
});

document.querySelectorAll('.split-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.split-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    currentSplit = opt.querySelector('input').value;
    updatePreview();
  });
});

amountInput.addEventListener('input', updatePreview);
descInput.addEventListener('input', updatePreview);

function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = todayISO();
  expensePreview.style.display = 'none';
  selectedEmoji = '';
  document.querySelectorAll('.cat-pick-btn').forEach(b => b.classList.remove('active'));
  cancelEditBtn.style.display = 'none';
  submitBtnText.textContent = 'Add Expense';
  formTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>\n            Add Expense`;
}

if (cancelEditBtn) {
  cancelEditBtn.addEventListener('click', () => { resetForm(); renderAll(); });
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const desc = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const date = dateInput.value || todayISO();
  if (!desc || isNaN(amount) || amount <= 0) return;

  const emoji = selectedEmoji || categoryIcon(desc);
  const expense = {
    id: Date.now(),
    date,
    desc,
    emoji,
    payer: currentPayer,
    amount: +amount.toFixed(2),
    split: currentSplit,
    amountOwed: currentSplit === 'equal' ? +(amount / 2).toFixed(2) : +amount.toFixed(2),
  };

  if (editingId) {
    expense.id = editingId;
    const idx = expenses.findIndex(e => String(e.id) === String(editingId));
    if (idx !== -1) expenses[idx] = expense;
    showToast(`✅ "${desc}" updated`);
    const eid = editingId;
    resetForm();
    renderAll();
    try {
      await apiPost({ action: 'edit', ...expense });
    } catch {
      showToast('⚠️ Updated locally but failed to sync.');
    }
  } else {
    expenses.unshift(expense);
    resetForm();
    renderAll();
    showToast(`✅ "${desc}" added`);
    try {
      await apiPost({ action: 'add', ...expense });
    } catch {
      showToast('⚠️ Saved locally but failed to sync.');
    }
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList();
  });
});


clearBtn.addEventListener('click', () => {
  if (expenses.length === 0) { showToast('📭 Nothing to clear'); return; }
  modalCount.textContent = expenses.length;
  document.getElementById('clearPassword').value = '';
  document.getElementById('passwordError').style.display = 'none';
  modalOverlay.style.display = 'flex';
  setTimeout(() => document.getElementById('clearPassword').focus(), 100);
});
modalCancel.addEventListener('click', () => {
  modalOverlay.style.display = 'none';
  document.getElementById('clearPassword').value = '';
  document.getElementById('passwordError').style.display = 'none';
});
modalConfirm.addEventListener('click', async () => {
  const entered = document.getElementById('clearPassword').value;
  if (entered !== 'j8468400') {
    document.getElementById('passwordError').style.display = 'block';
    document.getElementById('clearPassword').value = '';
    document.getElementById('clearPassword').focus();
    return;
  }
  expenses = [];
  renderAll();
  modalOverlay.style.display = 'none';
  showToast('🗑 All expenses cleared');
  try {
    await apiPost({ action: 'clear' });
  } catch {
    showToast('⚠️ Cleared locally but failed to sync.');
  }
});

// Manual refresh button (refresh icon in header)
document.getElementById('refreshBtn').addEventListener('click', () => {
  loadFromSheets();
});

// ─── API Calls ───────────────────────────

async function loadFromSheets(silent = false) {
  if (isLoading) return;
  isLoading = true;
  if (!silent) showListLoading();

  try {
    const res = await fetch(`${API_URL}?action=getAll`);
    const data = await res.json();
    if (data.success) {
      expenses = data.expenses.map(ex => ({
        id: ex.ID,
        date: ex.Date,
        desc: ex.Description,
        payer: ex.Payer,
        amount: parseFloat(ex.Amount),
        split: ex.SplitType,
        amountOwed: parseFloat(ex.AmountOwed),
        emoji: ex.Emoji || '',
      }));
      renderAll();
      if (!silent) showToast('🔄 Data synced from Google Sheets');
    } else {
      if (!silent) showToast('⚠️ Could not load data: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    if (!silent) showToast('⚠️ Could not reach Google Sheets. Check your URL.');
    console.error(err);
  } finally {
    isLoading = false;
  }
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ─── Render ──────────────────────────────
function renderAll() {
  renderBalance();
  renderCategoryStats();
  renderList();
}

// ─── Category stats state ─────────────────────
let catPeriod = 'all'; // 'month' | 'last' | 'all' | 'custom'
let catFromDate = null;
let catToDate = null;

const CAT_COLORS = {
  '🍽️': '#ff6b6b', '🚗': '#4ecdc4', '🛒': '#45b7d1',
  '🎮': '#a29bfe', '🏨': '#ffeaa7', '✈️': '#74b9ff',
  '💡': '#fdcb6e', '💊': '#fd79a8', '🎁': '#55efc4', '💰': '#636e72'
};
const CAT_NAMES = {
  '🍽️': 'Food & Drinks', '🚗': 'Transport', '🛒': 'Grocery',
  '🎮': 'Entertainment', '🏨': 'Hotel/Stay', '✈️': 'Travel',
  '💡': 'Utilities', '🎁': 'Gifts', '💊': 'Health', '💰': 'Other'
};

function getPeriodBounds() {
  const now = new Date();
  if (catPeriod === 'all') return { from: null, to: null };
  if (catPeriod === 'custom') return { from: catFromDate, to: catToDate };
  if (catPeriod === 'month') {
    return {
      from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      to: todayISO()
    };
  }
  if (catPeriod === 'last') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    const pad = n => String(n).padStart(2, '0');
    return {
      from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
      to: `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
    };
  }
  return { from: null, to: null };
}

function getFilteredExpenses() {
  const { from, to } = getPeriodBounds();
  if (!from && !to) return expenses;
  return expenses.filter(ex => {
    const d = String(ex.date).substring(0, 10); // normalize sheet timestamps
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function initCategoryControls() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      catPeriod = btn.dataset.period;
      const customRow = document.getElementById('customRange');
      if (catPeriod === 'custom') {
        customRow.style.display = 'flex';
        // default custom range to current month
        const now = new Date();
        document.getElementById('rangeFrom').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        document.getElementById('rangeTo').value = todayISO();
      } else {
        customRow.style.display = 'none';
        renderCategoryStats();
      }
    });
  });
  document.getElementById('rangeApply').addEventListener('click', () => {
    catFromDate = document.getElementById('rangeFrom').value;
    catToDate = document.getElementById('rangeTo').value;
    if (catFromDate && catToDate) renderCategoryStats();
  });
}

function drawPieChart(data, total) {
  const canvas = document.getElementById('pieChart');
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 8;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (total === 0 || data.length === 0) return;

  let startAngle = -Math.PI / 2;
  data.forEach(({ emoji, value }) => {
    const slice = (value / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = CAT_COLORS[emoji] || '#636e72';
    ctx.fill();
    startAngle += slice;
  });

  // Inner donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-main').trim() || '#0d1117';
  ctx.fill();
}

function renderCategoryStats() {
  const section = document.getElementById('catSection');
  const grid = document.getElementById('catGrid');
  const pieTotal = document.getElementById('pieTotal');

  if (expenses.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const filtered = getFilteredExpenses();

  // Group by emoji
  const catMap = {};
  filtered.forEach(ex => {
    const emoji = ex.emoji || categoryIcon(ex.desc);
    if (!catMap[emoji]) catMap[emoji] = { total: 0, count: 0 };
    catMap[emoji].total += ex.amount;
    catMap[emoji].count++;
  });

  const grandTotal = Object.values(catMap).reduce((s, c) => s + c.total, 0);
  const sorted = Object.entries(catMap).sort((a, b) => b[1].total - a[1].total);

  // Draw pie
  drawPieChart(sorted.map(([emoji, d]) => ({ emoji, value: d.total })), grandTotal);

  // Centre label
  pieTotal.innerHTML = grandTotal > 0
    ? `<div class="pie-total-amount">${fmt(grandTotal)}</div><div class="pie-total-label">Total</div>`
    : '';

  // Cards
  grid.innerHTML = sorted.map(([emoji, data]) => {
    const pct = grandTotal > 0 ? Math.round((data.total / grandTotal) * 100) : 0;
    const color = CAT_COLORS[emoji] || '#636e72';
    return `
    <div class="cat-card">
      <div class="cat-card-top">
        <span class="cat-dot" style="background:${color}"></span>
        <span class="cat-emoji">${emoji}</span>
      </div>
      <div class="cat-name">${CAT_NAMES[emoji] || 'Other'}</div>
      <div class="cat-amount">${fmt(data.total)}</div>
      <div class="cat-pct">${pct}% · ${data.count} item${data.count !== 1 ? 's' : ''}</div>
      <div class="cat-bar-bg">
        <div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }).join('');
}

function renderBalance() {
  let yarinNet = 0;
  let yarinTotal = 0;
  let catTotal = 0;
  let totalAmount = 0;

  expenses.forEach(ex => {
    totalAmount += ex.amount;
    if (ex.payer === USERS.A) {
      yarinTotal += ex.amount;
      yarinNet += ex.amountOwed;
    } else {
      catTotal += ex.amount;
      yarinNet -= ex.amountOwed;
    }
  });

  totalExpensesEl.textContent = fmt(totalAmount);
  txCountEl.textContent = expenses.length;
  yarinPaidEl.textContent = fmt(yarinTotal);
  catPaidEl.textContent = fmt(catTotal);
  historyBadge.textContent = expenses.length;

  const absNet = Math.abs(yarinNet);
  balanceAmount.textContent = fmt(absNet);

  if (absNet < 0.01) {
    balanceAmount.className = 'balance-amount color-green';
    balanceLabel.textContent = 'All settled up! 🎉';
  } else if (yarinNet > 0) {
    balanceAmount.className = 'balance-amount color-amber';
    balanceLabel.textContent = `Cat owes Yarin ${fmt(absNet)}`;
  } else {
    balanceAmount.className = 'balance-amount color-red';
    balanceLabel.textContent = `Yarin owes Cat ${fmt(absNet)}`;
  }
}

function renderList() {
  const filtered = currentFilter === 'all'
    ? expenses
    : expenses.filter(ex => ex.payer === currentFilter);

  if (filtered.length === 0) {
    expenseList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${currentFilter === 'all' ? '🧾' : '🔍'}</div>
        <p>${currentFilter === 'all' ? 'No expenses yet.<br/>Add your first one!' : `No expenses by ${currentFilter} yet.`}</p>
      </div>`;
    return;
  }

  expenseList.innerHTML = filtered.map(ex => {
    const isYarin = ex.payer === USERS.A;
    const otherPerson = isYarin ? USERS.B : USERS.A;
    const iconBg = isYarin ? 'bg-purple' : 'bg-green';
    const amountColor = isYarin ? 'color-green' : 'color-red';
    const owedLabel = ex.split === 'equal'
      ? `Paid by ${ex.payer} (50/50)`
      : `Paid by ${ex.payer} (${otherPerson} owes full)`;

    const emoji = ex.emoji || categoryIcon(ex.desc);
    const fallbackDesc = CAT_NAMES[emoji] || 'Expense';
    const displayDesc = ex.desc && ex.desc.trim().length > 0 ? ex.desc : fallbackDesc;

    return `
      <div class="expense-item" data-id="${ex.id}">
        <div class="expense-item-main">
          <div class="expense-item-icon ${iconBg}">${emoji}</div>
          <div class="expense-item-body">
            <div class="expense-item-desc">${escHtml(displayDesc)}</div>
            <div class="expense-item-meta">${formatDate(ex.date)}</div>
            <div class="expense-item-owed color-muted">${owedLabel}</div>
          </div>
          <div class="expense-item-amounts">
            <div class="expense-item-amount ${amountColor}">${fmt(ex.amount)}</div>
          </div>
        </div>
        <div class="expense-item-actions">
          <button class="expense-btn edit-btn" data-id="${ex.id}" title="Edit expense">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>Edit</span>
          </button>
          <button class="expense-btn delete-btn" data-id="${ex.id}" title="Delete expense">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>`;
  }).join('');

  expenseList.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const ex = expenses.find(x => String(x.id) === String(id));
      if (!ex) return;
      editingId = ex.id;
      descInput.value = ex.desc;
      amountInput.value = ex.amount;
      dateInput.value = String(ex.date).substring(0, 10);
      currentPayer = ex.payer;
      document.querySelectorAll('#payerToggle .toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.value === ex.payer);
      });
      currentSplit = ex.split;
      document.querySelectorAll('.split-option').forEach(o => {
        const input = o.querySelector('input');
        if (input.value === ex.split) {
          o.classList.add('active');
          input.checked = true;
        } else {
          o.classList.remove('active');
        }
      });
      selectedEmoji = ex.emoji;
      document.querySelectorAll('.cat-pick-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.emoji === (ex.emoji || categoryIcon(ex.desc)));
      });
      updatePreview();
      formTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>\n            Edit Expense`;
      submitBtnText.textContent = 'Save Changes';
      cancelEditBtn.style.display = 'block';
      document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
    });
  });

  expenseList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const item = btn.closest('.expense-item');

      // Show inline confirmation
      const originalContent = item.innerHTML;
      const ex = expenses.find(e => String(e.id) === String(id));
      item.innerHTML = `
        <div class="delete-confirm">
          <span class="delete-confirm-text">🗑 Delete "<strong>${escHtml(ex?.desc || '')}</strong>"?</span>
          <div class="delete-confirm-btns">
            <button class="btn-confirm-yes" data-id="${id}">Yes, delete</button>
            <button class="btn-confirm-no">Cancel</button>
          </div>
        </div>`;

      // Cancel → restore original
      item.querySelector('.btn-confirm-no').addEventListener('click', () => {
        item.innerHTML = originalContent;
        // Re-attach delete listener on restored button
        item.querySelector('.delete-btn').addEventListener('click', () => {
          renderList(); // re-render cleanly to rebind all handlers
        });
      });

      // Confirm → delete
      item.querySelector('.btn-confirm-yes').addEventListener('click', async () => {
        expenses = expenses.filter(e => String(e.id) !== String(id));
        renderAll();
        if (ex) showToast(`🗑 "${ex.desc}" removed`);
        try {
          await apiPost({ action: 'delete', id });
        } catch {
          showToast('⚠️ Deleted locally but failed to sync.');
        }
      });
    });
  });
}

function showListLoading() {
  expenseList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon spin">🔄</div>
      <p>Loading from Google Sheets…</p>
    </div>`;
}

function updatePreview() {
  const amount = parseFloat(amountInput.value);
  const desc = descInput.value.trim();
  if (!amount || amount <= 0) { expensePreview.style.display = 'none'; return; }
  const other = currentPayer === USERS.A ? USERS.B : USERS.A;
  const owed = currentSplit === 'equal' ? amount / 2 : amount;
  const splitDesc = currentSplit === 'equal' ? '50/50 split' : 'full amount';
  previewText.textContent = `${currentPayer} pays ${fmt(amount)}${desc ? ` for "${desc}"` : ''} → ${other} owes ${fmt(owed)} (${splitDesc})`;
  expensePreview.style.display = 'block';
}



// ─── Helpers ─────────────────────────────
function fmt(n) { return `$${Number(n).toFixed(2)}`; }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function categoryIcon(desc) {
  const d = String(desc).toLowerCase();
  if (/food|eat|dinner|lunch|breakfast|eggs|restaurant|cafe|coffee|drink|boba|milk tea|burger|pizza|fruit|ramen/.test(d)) return '🍽️';
  if (/grab|taxi|uber|lyft|bus|train|mrt|transit|transport|car/.test(d)) return '🚗';
  if (/grocery|market|supermarket|shop|apple|vegetable|veggie|veg|fruit|salad|bread|egg|milk|rice|tomato|potato|onion|carrot|chicken|meat|fish|pork|beef|noodle|pasta|tofu|butter|cheese|yogurt|snack|chips|cookie|juice/.test(d)) return '🛒';
  if (/movie|cinema|netflix|game|sport|gym|entertain/.test(d)) return '🎮';
  if (/hotel|airbnb|stay|accommodation/.test(d)) return '🏨';
  if (/flight|air|ticket/.test(d)) return '✈️';
  if (/bill|electric|water|utility|rent|wifi|internet/.test(d)) return '💡';
  if (/gift|present/.test(d)) return '🎁';
  if (/medicine|pharmacy|doctor|health/.test(d)) return '💊';
  return '💰';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function showBanner(msg, type = 'amber') {
  const banner = document.getElementById('setupBanner');
  if (banner) { banner.textContent = msg; banner.style.display = 'flex'; }
}
