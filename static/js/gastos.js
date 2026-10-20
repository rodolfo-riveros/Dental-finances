import {
  fetchExpenses, addExpense, updateExpense, deleteExpense, voucherToDataUrl,
  escHtml, MONTHS as months, parseDate, formatDate, matchesMonthFilter, money,
} from './api.js';
import { printReport, paginationHtml, compressImage, setupVoucherUpload, showVoucherIn } from './ui.js';

let expensesData = [];
const monthFilter = document.getElementById('gastosMonthFilter');
let currentFilter = parseInt(monthFilter.value);
let gastosPage = 1;
const PER_PAGE = 10;

const expensesList = document.getElementById('expensesList');
const emptyMsg = document.getElementById('expensesEmpty');
const statHoy = document.getElementById('statHoy');
const totalMesEl = document.getElementById('totalMes');
const historialDesc = document.getElementById('historialDesc');
const countRegsEl = document.getElementById('countRegistros');
const modal = document.getElementById('detailModal');
const mDesc = document.getElementById('mDesc');
const mCat = document.getElementById('mCat');
const mAmount = document.getElementById('mAmount');
const mDate = document.getElementById('mDate');
const mVoucherField = document.getElementById('mVoucherField');
const mVoucherImg = document.getElementById('mVoucherImg');

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>';

function renderExpenses() {
  const now = new Date();
  const filtered = expensesData.filter(e => matchesMonthFilter(e.date, currentFilter));
  const hoyTotal = expensesData.filter(e => matchesMonthFilter(e.date, -1)).reduce((s, e) => s + e.amount, 0);
  const mesTotal = expensesData.filter(e => matchesMonthFilter(e.date, now.getMonth())).reduce((s, e) => s + e.amount, 0);

  statHoy.textContent = money(hoyTotal);
  totalMesEl.textContent = money(mesTotal);
  countRegsEl.textContent = expensesData.length;

  if (filtered.length === 0) {
    expensesList.innerHTML = '';
    expensesList.classList.add('hidden');
    emptyMsg.classList.remove('hidden');
    const label = currentFilter === -1 ? 'hoy' : currentFilter === 99 ? 'todos los registros' : months[currentFilter];
    historialDesc.textContent = `Sin gastos — ${label}`;
    return;
  }

  expensesList.classList.remove('hidden');
  emptyMsg.classList.add('hidden');
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const label = currentFilter === -1 ? 'Hoy' : currentFilter === 99 ? 'Todos' : months[currentFilter];
  historialDesc.textContent = label + ' — ' + filtered.length + ' gastos · ' + money(total);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  if (gastosPage > totalPages) gastosPage = totalPages;
  const start = (gastosPage - 1) * PER_PAGE;
  const pageItems = filtered.slice(start, start + PER_PAGE);

  expensesList.innerHTML = pageItems.map((expense, i) => `
    <div class="expense-card" data-id="${expense.id}" style="animation-delay: ${i * 0.04}s">
      <div class="expense-card-main">
        <div class="expense-left">
          <div class="expense-icon" style="background: rgba(239,68,68,0.1); color: #DC2626;">${ICON_DOC}</div>
          <div class="expense-info">
            <span class="expense-desc">${escHtml(expense.description)}</span>
            <div class="expense-meta">
              <span class="expense-cat">${escHtml(expense.category)}</span>
              <span class="expense-sep">•</span>
              <span class="expense-date">${formatDate(expense.date)}</span>
            </div>
          </div>
        </div>
        <div class="expense-right">
          <span class="expense-amount">-${money(expense.amount)}</span>
          <div class="expense-actions">
            <button class="expense-action-btn expense-edit-btn" aria-label="Editar" type="button">${ICON_EDIT}</button>
            <button class="expense-action-btn expense-delete-btn" aria-label="Eliminar" type="button">${ICON_DELETE}</button>
          </div>
        </div>
      </div>
    </div>
  `).join('') + paginationHtml(gastosPage, totalPages);
}

monthFilter.addEventListener('change', function () {
  currentFilter = parseInt(this.value);
  gastosPage = 1;
  renderExpenses();
});

async function handleDelete(id) {
  const ok = await window.showConfirm('¿Eliminar este gasto?');
  if (!ok) return;
  try {
    await deleteExpense(id);
    expensesData = expensesData.filter(ex => String(ex.id) !== String(id));
    renderExpenses();
    window.showToast('Gasto eliminado.', 'success');
  } catch (err) {
    window.showToast(err.message || 'Error al eliminar el gasto.', 'error');
  }
}

expensesList.addEventListener('click', function (e) {
  const pagBtn = e.target.closest('.pag-btn');
  if (pagBtn) {
    gastosPage = parseInt(pagBtn.dataset.page);
    renderExpenses();
    return;
  }
  const card = e.target.closest('.expense-card');
  if (!card) return;
  const expense = expensesData.find(ex => String(ex.id) === card.dataset.id);
  if (!expense) return;
  if (e.target.closest('.expense-edit-btn')) { fillForm(expense); return; }
  if (e.target.closest('.expense-delete-btn')) { handleDelete(expense.id); return; }
  openModal(expense);
});

function openModal(expense) {
  mDesc.textContent = expense.description;
  mCat.textContent = expense.category;
  mAmount.textContent = money(expense.amount);
  const { day, month } = parseDate(expense.date);
  mDate.textContent = String(day).padStart(2, '0') + ' de ' + months[month];
  showVoucherIn(mVoucherField, mVoucherImg, expense.voucher);
  modal.classList.remove('hidden');
  modal.classList.add('visible');
}

function closeModal() {
  modal.classList.remove('visible');
  modal.classList.add('hidden');
}
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

document.getElementById('exportPdfBtn').addEventListener('click', async function () {
  const now = new Date();
  const filter = currentFilter === -1 ? now.getMonth() : currentFilter;
  const filtered = expensesData.filter(e => matchesMonthFilter(e.date, filter));
  if (filtered.length === 0) {
    window.showToast('No hay gastos para exportar.', 'info');
    return;
  }
  const label = filter === 99 ? 'Todos los meses' : months[filter];
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const rows = await Promise.all(filtered.map(async (e) => {
    const { day, month } = parseDate(e.date);
    const dataUrl = await voucherToDataUrl(e.voucher);
    const img = dataUrl ? `<img src="${dataUrl}" class="print-voucher" />` : '';
    return `<tr><td>${String(day).padStart(2, '0')} ${months[month]}</td><td>${escHtml(e.category)}</td><td>${escHtml(e.description)}</td><td style="text-align:right">${money(e.amount)}</td><td>${img}</td></tr>`;
  }));
  printReport({
    title: 'Reporte de Gastos',
    period: label,
    summary: [['Total Gastos', money(total)], ['Cantidad', filtered.length + ' registros'], ['Periodo', label]],
    head: ['Fecha', 'Categoría', 'Descripción', 'Monto', 'Comprobante'],
    rows: rows.join(''),
    foot: `<tr><td colspan="3" style="text-align:right;font-weight:700">Total</td><td style="text-align:right;font-weight:700">${money(total)}</td><td></td></tr>`,
  });
});

// ---------- Formulario ----------
const form = document.getElementById('expense-form');
const voucherInput = document.getElementById('expense-voucher');
const previewImg = document.getElementById('voucher-preview');
const voucherArea = document.getElementById('voucher-area');
const voucherContent = document.getElementById('voucherContent');
const voucherClear = document.getElementById('voucherClear');
const categorySelect = document.getElementById('expense-category');
const customWrap = document.getElementById('customCategoryWrap');
const customInput = document.getElementById('expense-custom-category');
const submitBtn = document.getElementById('expenseSubmitBtn');
const cancelBtn = document.getElementById('expenseCancelBtn');
const descInput = document.getElementById('expense-desc');
const amountInput = document.getElementById('expense-amount');
const dateInput = document.getElementById('expense-date');
const voucher = setupVoucherUpload({ input: voucherInput, preview: previewImg, area: voucherArea, content: voucherContent, clear: voucherClear });
const SUBMIT_NEW = submitBtn.innerHTML;
const SUBMIT_EDIT = ICON_EDIT.replace(/14/g, '18') + ' Actualizar Gasto';
let editingId = null;

dateInput.value = new Date().toLocaleDateString('en-CA');

categorySelect.addEventListener('change', function () {
  const show = this.value === '__other__';
  customWrap.classList.toggle('hidden', !show);
  if (show) customInput.focus();
});

function fillForm(data) {
  editingId = data.id;
  dateInput.value = data.date;
  amountInput.value = data.amount;
  const opt = Array.from(categorySelect.options).find(o => o.value === data.category);
  if (opt) {
    categorySelect.value = data.category;
    customWrap.classList.add('hidden');
  } else {
    categorySelect.value = '__other__';
    customWrap.classList.remove('hidden');
    customInput.value = data.category;
  }
  descInput.value = data.description;
  submitBtn.innerHTML = SUBMIT_EDIT;
  cancelBtn.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = new Date().toLocaleDateString('en-CA');
  customWrap.classList.add('hidden');
  voucher.reset();
  submitBtn.innerHTML = SUBMIT_NEW;
  cancelBtn.classList.add('hidden');
}
cancelBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  let category = categorySelect.value;
  if (category === '__other__') {
    category = customInput.value.trim();
    if (!category) {
      window.showToast('Especifica el nombre de la categoría.', 'error');
      return;
    }
  }
  const amount = parseFloat(amountInput.value);
  const description = descInput.value.trim();
  const date = dateInput.value;
  if (!category || !amount || !description || !date) {
    window.showToast('Completa todos los campos obligatorios.', 'error');
    return;
  }
  let file = voucher.file();
  if (file && file.type.startsWith('image/')) {
    try { file = await compressImage(file); } catch (err) { console.warn('No se pudo comprimir la imagen:', err); }
  }
  const data = { description, category, amount, date };
  submitBtn.disabled = true;
  try {
    if (editingId) {
      const updated = await updateExpense(editingId, data, file);
      const idx = expensesData.findIndex(ex => ex.id === updated.id);
      if (idx >= 0) expensesData[idx] = updated;
      window.showToast('Gasto actualizado.', 'success');
    } else {
      expensesData.unshift(await addExpense(data, file));
      window.showToast('Gasto registrado correctamente.', 'success');
    }
    resetForm();
    renderExpenses();
  } catch (err) {
    window.showToast(err.message || 'Error al guardar el gasto.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

async function init() {
  try {
    expensesData = await fetchExpenses();
  } catch (err) {
    window.showToast('No se pudieron cargar los gastos.', 'error');
  }
  renderExpenses();
}

init();
