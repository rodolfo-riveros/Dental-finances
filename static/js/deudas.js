import {
  fetchDebts, addDebt, updateDebt, payDebt, deleteDebt, voucherToDataUrl,
  escHtml, MONTHS as months, parseDate, isOverdue, matchesMonthFilter, money,
} from './api.js';
import { printReport, paginationHtml, compressImage, setupVoucherUpload, showVoucherIn } from './ui.js';

let debtsData = [];
let editingId = null;
let selectedId = null;

function getInitials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function formatDue(dateStr) {
  const { day, month, year } = parseDate(dateStr);
  return String(day).padStart(2, '0') + ' ' + months[month].slice(0, 3) + ' ' + year;
}

// Form elements
const form = document.getElementById('debt-form');
const submitBtn = document.getElementById('debtSubmitBtn');
const cancelBtn = document.getElementById('debtCancelBtn');
const formTitle = document.getElementById('formTitle');
const formDesc = document.getElementById('formDesc');
const patientInput = document.getElementById('debt-patient');
const descInput = document.getElementById('debt-desc');
const amountInput = document.getElementById('debt-amount');
const dueInput = document.getElementById('debt-due');
const sourceRadios = document.querySelectorAll('[name="source"]');
const voucher = setupVoucherUpload({
  input: document.getElementById('debt-voucher'),
  preview: document.getElementById('debt-voucher-preview'),
  area: document.getElementById('voucher-area'),
  content: document.getElementById('debtVoucherContent'),
  clear: document.getElementById('debtVoucherClear'),
});
const SUBMIT_NEW = submitBtn.innerHTML;

// Lists
const sections = {
  'Clínica': {
    list: document.getElementById('listClinica'), empty: document.getElementById('emptyClinica'),
    desc: document.getElementById('descClinica'), select: document.querySelector('.month-filter[data-section="clinica"]'), page: 1,
  },
  'Externo': {
    list: document.getElementById('listExterno'), empty: document.getElementById('emptyExterno'),
    desc: document.getElementById('descExterno'), select: document.querySelector('.month-filter[data-section="externo"]'), page: 1,
  },
};
const PER_PAGE = 10;

// Modal
const modal = document.getElementById('detailModal');
const mPatient = document.getElementById('mPatient');
const mDesc = document.getElementById('mDesc');
const mAmount = document.getElementById('mAmount');
const mSource = document.getElementById('mSource');
const mStatus = document.getElementById('mStatus');
const mStatus2 = document.getElementById('mStatus2');
const mDue = document.getElementById('mDue');
const mVoucherField = document.getElementById('mVoucherField');
const mVoucherImg = document.getElementById('mVoucherImg');
const modalPay = document.getElementById('modalPay');

const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>';

function filteredFor(sourceType) {
  const filter = parseInt(sections[sourceType].select.value);
  return debtsData
    .filter(d => d.source === sourceType && matchesMonthFilter(d.dueDate, filter))
    // Pendientes primero (las vencidas arriba), luego pagadas.
    .sort((a, b) => (a.status === b.status ? a.dueDate.localeCompare(b.dueDate) : a.status === 'Pendiente' ? -1 : 1));
}

function renderSection(sourceType) {
  const sec = sections[sourceType];
  const filtered = filteredFor(sourceType);
  const pendingSum = filtered.filter(d => d.status === 'Pendiente').reduce((s, d) => s + d.amount, 0);
  sec.desc.textContent = filtered.length + ' registros · ' + money(pendingSum) + ' pend.';

  if (filtered.length === 0) {
    sec.list.innerHTML = '';
    sec.list.classList.add('hidden');
    sec.empty.classList.remove('hidden');
    return;
  }
  sec.list.classList.remove('hidden');
  sec.empty.classList.add('hidden');

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  if (sec.page > totalPages) sec.page = totalPages;
  const start = (sec.page - 1) * PER_PAGE;

  sec.list.innerHTML = filtered.slice(start, start + PER_PAGE).map((d, i) => {
    const overdue = d.status === 'Pendiente' && isOverdue(d.dueDate);
    return `
      <div class="d-item" data-id="${d.id}" style="animation-delay: ${i * 0.04}s">
        <div class="d-item-main">
          <div class="d-avatar">${escHtml(getInitials(d.patient))}</div>
          <div class="d-info">
            <div class="d-header">
              <span class="d-patient">${escHtml(d.patient)}</span>
              <span class="d-badge ${d.status.toLowerCase()}">${d.status}</span>
              ${overdue ? '<span class="d-overdue-badge">Vencida</span>' : ''}
              ${d.treatmentId ? '<span class="d-overdue-badge" style="background:rgba(99,102,241,0.12);color:#6366F1">Tratamiento</span>' : ''}
            </div>
            <span class="d-desc">${escHtml(d.description)}</span>
            <div class="d-meta">
              <span class="d-amount">${money(d.amount)}</span>
              <span class="d-sep">•</span>
              <span class="d-due ${overdue ? 'overdue' : ''}">Vence: ${formatDue(d.dueDate)}</span>
            </div>
          </div>
          <div class="d-right">
            <span class="d-source ${d.source === 'Clínica' ? 'clinica' : 'externo'}">${d.source === 'Clínica' ? 'Clínica' : 'Ext.'}</span>
            <button class="d-toggle" data-action="open" aria-label="Ver detalle">${ICON_NEXT}</button>
            ${d.treatmentId ? '' : `<button class="d-action-btn d-edit-btn" data-action="edit" aria-label="Editar">${ICON_EDIT}</button>`}
            ${d.status === 'Pendiente' ? `<button class="d-action-btn d-pay-btn" data-action="pay" aria-label="Pagar" title="Marcar como Pagado">${ICON_CHECK}</button>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('') + paginationHtml(sec.page, totalPages, ` data-section="${sourceType}"`);
}

function renderSections() {
  renderSection('Clínica');
  renderSection('Externo');
  const pending = debtsData.filter(d => d.status === 'Pendiente').reduce((s, d) => s + d.amount, 0);
  const paid = debtsData.filter(d => d.status === 'Pagado').reduce((s, d) => s + d.amount, 0);
  document.getElementById('statPending').textContent = money(pending);
  document.getElementById('statPaid').textContent = money(paid);
  document.getElementById('statCount').textContent = debtsData.filter(d => d.status === 'Pendiente').length;
}

Object.entries(sections).forEach(([sourceType, sec]) => {
  sec.select.addEventListener('change', () => { sec.page = 1; renderSection(sourceType); });
  sec.list.addEventListener('click', (e) => {
    const pagBtn = e.target.closest('.pag-btn');
    if (pagBtn) {
      sec.page = parseInt(pagBtn.dataset.page);
      renderSection(sourceType);
      return;
    }
    const item = e.target.closest('.d-item');
    if (!item) return;
    const action = e.target.closest('[data-action]')?.dataset.action || 'open';
    if (action === 'edit') editDebt(item.dataset.id);
    else if (action === 'pay') markPaid(item.dataset.id);
    else openDebtModal(item.dataset.id);
  });
});

function findDebt(id) {
  return debtsData.find(x => String(x.id) === String(id));
}

// Form submit
form.addEventListener('submit', async function (e) {
  e.preventDefault();
  const fd = new FormData(this);
  const data = {
    patient: (fd.get('patient') || '').trim(),
    description: (fd.get('description') || '').trim(),
    amount: parseFloat(fd.get('amount')),
    dueDate: fd.get('dueDate'),
    source: fd.get('source') || 'Clínica',
  };
  if (!data.patient || !data.description || !data.amount || !data.dueDate) {
    window.showToast('Completa todos los campos obligatorios.', 'error');
    return;
  }
  let file = voucher.file();
  if (file) {
    try { file = await compressImage(file); } catch (_) { /* se sube el original */ }
  }
  submitBtn.disabled = true;
  try {
    if (editingId) {
      const updated = await updateDebt(editingId, data, file);
      debtsData[debtsData.findIndex(d => d.id === updated.id)] = updated;
      window.showToast('Deuda actualizada.', 'success');
    } else {
      debtsData.unshift(await addDebt(data, file));
      window.showToast('Deuda registrada correctamente.', 'success');
    }
    resetForm();
    renderSections();
  } catch (err) {
    window.showToast(err.message || 'Error al guardar la deuda.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

function resetForm() {
  editingId = null;
  form.reset();
  sourceRadios[0].checked = true;
  voucher.reset();
  submitBtn.innerHTML = SUBMIT_NEW;
  cancelBtn.classList.add('hidden');
  formTitle.textContent = 'Nueva Deuda';
  formDesc.textContent = 'Registra una nueva deuda';
}
cancelBtn.addEventListener('click', resetForm);

function openDebtModal(id) {
  const d = findDebt(id);
  if (!d) return;
  selectedId = d.id;
  mPatient.textContent = d.patient;
  mDesc.textContent = d.description;
  mAmount.textContent = money(d.amount);
  mSource.textContent = d.source;
  const color = d.status === 'Pendiente' ? '#D97706' : '#059669';
  mStatus.textContent = d.status;
  mStatus.style.color = color;
  mStatus2.textContent = d.status;
  mStatus2.style.color = color;
  mDue.textContent = formatDue(d.dueDate);
  mDue.style.color = d.status === 'Pendiente' && isOverdue(d.dueDate) ? '#DC2626' : 'inherit';
  modalPay.style.display = d.status === 'Pendiente' ? '' : 'none';
  showVoucherIn(mVoucherField, mVoucherImg, d.voucher);
  modal.classList.remove('hidden');
  modal.classList.add('visible');
}

function editDebt(id) {
  const d = findDebt(id);
  if (!d) return;
  editingId = d.id;
  document.querySelector('[name="source"][value="' + d.source + '"]').checked = true;
  patientInput.value = d.patient;
  descInput.value = d.description;
  amountInput.value = d.amount;
  dueInput.value = d.dueDate;
  submitBtn.innerHTML = ICON_EDIT.replace(/13/g, '18') + ' Actualizar Deuda';
  cancelBtn.classList.remove('hidden');
  formTitle.textContent = 'Editar Deuda';
  formDesc.textContent = 'Modifica los datos de la deuda';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function markPaid(id) {
  const d = findDebt(id);
  if (!d || d.status !== 'Pendiente') return false;
  try {
    const updated = await payDebt(id);
    Object.assign(d, updated);
    renderSections();
    window.showToast(d.treatmentId ? 'Deuda pagada y tratamiento saldado.' : 'Deuda marcada como pagada.', 'success');
    if (window.dfCheckNotifications) window.dfCheckNotifications();
    return true;
  } catch (err) {
    window.showToast(err.message || 'Error al actualizar la deuda.', 'error');
    return false;
  }
}

function closeModal() {
  modal.classList.remove('visible');
  modal.classList.add('hidden');
  selectedId = null;
}
document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

modalPay.addEventListener('click', async () => {
  if (selectedId && await markPaid(selectedId)) closeModal();
});

document.getElementById('modalDelete').addEventListener('click', async () => {
  if (!selectedId) return;
  const d = findDebt(selectedId);
  const msg = d && d.treatmentId
    ? '¿Eliminar esta deuda? Se volverá a generar si el tratamiento sigue con saldo pendiente al editarlo.'
    : '¿Eliminar esta deuda?';
  if (!await window.showConfirm(msg)) return;
  try {
    await deleteDebt(selectedId);
    debtsData = debtsData.filter(x => String(x.id) !== String(selectedId));
    closeModal();
    renderSections();
    window.showToast('Deuda eliminada.', 'success');
  } catch (err) {
    window.showToast(err.message || 'Error al eliminar la deuda.', 'error');
  }
});

// Export PDF
document.querySelectorAll('.pdf-btn').forEach(btn => {
  btn.addEventListener('click', async function () {
    const sourceType = this.dataset.section === 'clinica' ? 'Clínica' : 'Externo';
    const filterVal = parseInt(sections[sourceType].select.value);
    const filtered = filteredFor(sourceType);
    if (filtered.length === 0) {
      window.showToast('No hay deudas para exportar.', 'info');
      return;
    }
    const label = filterVal === -1 ? 'Hoy' : filterVal === 99 ? 'Todos' : months[filterVal];
    const total = filtered.reduce((s, d) => s + d.amount, 0);
    const rows = await Promise.all(filtered.map(async (d) => {
      const overdue = d.status === 'Pendiente' && isOverdue(d.dueDate);
      const dataUrl = await voucherToDataUrl(d.voucher);
      const img = dataUrl ? `<img src="${dataUrl}" class="print-voucher" />` : '';
      const statusLabel = d.status === 'Pendiente' ? (overdue ? 'Vencida' : 'Pendiente') : 'Pagado';
      return `<tr><td>${formatDue(d.dueDate)}</td><td>${escHtml(d.patient)}</td><td>${escHtml(d.description)}</td><td style="text-align:right">${money(d.amount)}</td><td>${statusLabel}</td><td>${img}</td></tr>`;
    }));
    printReport({
      title: 'Reporte de Deudas — ' + sourceType,
      period: label,
      summary: [
        ['Total Deudas', money(total)],
        ['Pendientes', filtered.filter(d => d.status === 'Pendiente').length],
        ['Pagadas', filtered.filter(d => d.status === 'Pagado').length],
        ['Periodo', label],
      ],
      head: ['Vencimiento', 'Paciente', 'Descripción', 'Monto', 'Estado', 'Comprobante'],
      rows: rows.join(''),
      foot: `<tr><td colspan="3" style="text-align:right;font-weight:700">Total</td><td style="text-align:right;font-weight:700">${money(total)}</td><td></td><td></td></tr>`,
    });
  });
});

function checkOverdueDebts() {
  const overdue = debtsData.filter(d => d.status === 'Pendiente' && isOverdue(d.dueDate));
  if (overdue.length === 0 || sessionStorage.getItem('df_overdue_notified')) return;
  const total = overdue.reduce((s, d) => s + d.amount, 0);
  const names = overdue.map(d => d.patient).slice(0, 3).join(', ');
  const more = overdue.length > 3 ? ` y ${overdue.length - 3} más` : '';
  const pl = overdue.length > 1 ? 's' : '';
  window.showToast(`${overdue.length} deuda${pl} vencida${pl} — ${money(total)} (${names}${more})`, 'warning', 8000);
  sessionStorage.setItem('df_overdue_notified', 'true');
}

async function init() {
  try {
    debtsData = await fetchDebts();
  } catch (err) {
    window.showToast('No se pudieron cargar las deudas.', 'error');
  }
  renderSections();
  checkOverdueDebts();
}

init();
