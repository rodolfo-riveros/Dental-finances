import {
  fetchTreatments, addTreatment, updateTreatment, deleteTreatment, fetchServices, voucherToDataUrl,
  escHtml, MONTHS as months, parseDate, formatDate, matchesMonthFilter, money, formatAppointment,
} from './api.js';
import { printReport, paginationHtml, compressImage, setupVoucherUpload, showVoucherIn } from './ui.js';

let treatmentsData = [];
let services = [];
const monthFilter = document.getElementById('txMonthFilter');
let currentFilter = parseInt(monthFilter.value);
let editingId = null;
let txPage = 1;
const PER_PAGE = 10;

const $ = (id) => document.getElementById(id);
const txList = $('txList');
const txEmpty = $('txEmpty');
const historialDesc = $('historialDesc');
const modal = $('txModal');
const form = $('tx-form');
const submitBtn = $('txSubmitBtn');
const cancelBtn = $('txCancelBtn');
const SUBMIT_NEW = submitBtn.innerHTML;

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>';
const ICON_CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';

// ---------- Comprobante ----------
const voucher = setupVoucherUpload({
  input: $('tx-voucher'), preview: $('tx-voucher-preview'), area: $('voucher-area'),
  content: $('txVoucherContent'), clear: $('txVoucherClear'),
});

// ---------- Servicios (paso 2) ----------
const typeGrid = $('txTypeGrid');
const svcSearch = $('svcSearch');
const svcSpecialty = $('svcSpecialty');
const otherGroup = $('otherGroup');

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function selectedType() {
  return form.querySelector('[name="type"]:checked')?.value || '';
}

function renderServices() {
  const q = normalize(svcSearch.value);
  const spec = svcSpecialty.value;
  const current = selectedType();
  const groups = new Map();
  services.forEach(s => {
    if (spec && s.specialty !== spec) return;
    if (q && !normalize(s.title + ' ' + s.specialty).includes(q)) return;
    if (!groups.has(s.specialty)) groups.set(s.specialty, []);
    groups.get(s.specialty).push(s);
  });
  if (groups.size === 0) {
    typeGrid.innerHTML = services.length
      ? '<div class="tx-type-noresults">No hay servicios que coincidan. Usa "Otro tratamiento".</div>'
      : '<div class="tx-type-noresults">Aún no tienes servicios. Agrégalos en <a href="/ajustes">Ajustes</a>.</div>';
    return;
  }
  let html = '';
  groups.forEach((items, specialty) => {
    html += `<div class="tx-spec-title"><span class="tx-spec-dot" style="background:${escHtml(items[0].color)}"></span>${escHtml(specialty)}</div>`;
    items.forEach(s => {
      html += `
        <label class="tx-type-card">
          <input type="radio" name="type" value="${escHtml(s.title)}" ${s.title === current ? 'checked' : ''} />
          <span class="tx-type-content">
            <span class="tx-type-name">${escHtml(s.title)}</span>
            <span class="tx-type-price">${money(s.price)}</span>
          </span>
        </label>`;
    });
  });
  typeGrid.innerHTML = html;
}

async function loadServiceTypes() {
  try {
    services = await fetchServices();
    const specialties = [...new Set(services.map(s => s.specialty))];
    svcSpecialty.innerHTML = '<option value="">Todas las especialidades</option>' +
      specialties.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
  } catch (err) {
    console.warn('Error al cargar servicios:', err);
  }
  renderServices();
}

svcSearch.addEventListener('input', renderServices);
$('tx-other').addEventListener('input', calc);
svcSpecialty.addEventListener('change', renderServices);

form.addEventListener('change', (e) => {
  if (e.target.name !== 'type') return;
  const isOther = e.target.value === 'Otro';
  otherGroup.style.display = isOther ? 'block' : 'none';
  if (isOther) { $('tx-other').focus(); return; }
  const svc = services.find(s => s.title === e.target.value);
  // Al elegir un servicio se propone su precio como monto total.
  if (svc && svc.price) totalInput.value = svc.price;
  calc();
});

// ---------- Finanzas (paso 3) ----------
const totalInput = $('tx-total');
const paidInput = $('tx-paid');
const balanceDisplay = $('balanceDisplay');
const balanceHint = $('balanceHint');
const costsList = $('costsList');
const totalCostsEl = $('totalCosts');
const estimatedProfitEl = $('estimatedProfit');
const collectedProfitEl = $('collectedProfit');
const finSelected = $('finSelected');

function addCostRow(concept = '', amount = '') {
  const row = document.createElement('div');
  row.className = 'cost-row';
  row.innerHTML = `
    <input type="text" class="form-input cost-concept" list="costConcepts" placeholder="Concepto (ej: Laboratorio)" maxlength="150" />
    <input type="number" class="form-input cost-amount" placeholder="S/ 0.00" step="0.01" min="0" />
    <button type="button" class="cost-remove" aria-label="Quitar gasto">${ICON_X}</button>`;
  row.querySelector('.cost-concept').value = concept;
  row.querySelector('.cost-amount').value = amount;
  costsList.appendChild(row);
  return row;
}

$('addCostBtn').addEventListener('click', () => {
  addCostRow().querySelector('.cost-concept').focus();
});

costsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.cost-remove');
  if (!btn) return;
  btn.closest('.cost-row').remove();
  calc();
});
costsList.addEventListener('input', calc);

function getCosts() {
  return [...costsList.querySelectorAll('.cost-row')].map(row => ({
    concept: row.querySelector('.cost-concept').value.trim() || 'Gasto',
    amount: parseFloat(row.querySelector('.cost-amount').value) || 0,
  })).filter(c => c.amount > 0);
}

function setMoney(el, value, colorize = true) {
  el.textContent = money(value);
  if (colorize) el.style.color = value >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
}

function calc() {
  const total = parseFloat(totalInput.value) || 0;
  const paid = parseFloat(paidInput.value) || 0;
  const overpaid = paid > total && total > 0;
  const balance = Math.max(total - paid, 0);
  const costs = getCosts().reduce((s, c) => s + c.amount, 0);
  const collected = Math.min(paid, total);

  if (overpaid) {
    balanceDisplay.innerHTML = 'El monto pagado supera el total por <strong>' + money(paid - total) + '</strong>';
    balanceDisplay.style.color = '#D97706';
  } else {
    balanceDisplay.innerHTML = 'Saldo Pendiente: <strong>' + money(balance) + '</strong>';
    balanceDisplay.style.color = balance > 0 ? '#DC2626' : '#059669';
  }
  paidInput.classList.toggle('error', overpaid);
  balanceHint.classList.toggle('hidden', !(balance > 0 && !overpaid));
  totalCostsEl.textContent = money(costs);
  setMoney(estimatedProfitEl, total - costs);
  setMoney(collectedProfitEl, collected - costs);

  const type = selectedType() === 'Otro' ? ($('tx-other').value.trim() || 'Otro') : selectedType();
  finSelected.innerHTML = type ? `<span>${escHtml(type)}</span><small>${escHtml($('tx-patient').value.trim())}</small>` : '';
}
totalInput.addEventListener('input', calc);
paidInput.addEventListener('input', calc);

// ---------- Pasos ----------
let currentStep = 1;
const totalSteps = 3;
const stepContents = document.querySelectorAll('.tx-step-content');
const stepIndicators = document.querySelectorAll('.tx-step');
const prevBtn = $('txPrevBtn');
const nextBtn = $('txNextBtn');

function showStep(n) {
  currentStep = n;
  stepContents.forEach(el => { el.style.display = String(el.dataset.step) === String(n) ? '' : 'none'; });
  stepIndicators.forEach(el => { el.classList.toggle('active', String(el.dataset.step) === String(n)); });
  prevBtn.style.display = n === 1 ? 'none' : '';
  nextBtn.style.display = n === totalSteps ? 'none' : '';
  document.querySelector('.form-actions')?.classList.toggle('hidden', n !== totalSteps);
  if (n === 3) calc();
}

function validateStep(n) {
  const content = document.querySelector(`.tx-step-content[data-step="${n}"]`);
  for (const el of content.querySelectorAll('[required]')) {
    if (!el.value || el.value.trim() === '') {
      el.focus();
      el.style.borderColor = '#DC2626';
      setTimeout(() => { el.style.borderColor = ''; }, 2000);
      window.showToast('Completa todos los campos obligatorios.', 'error');
      return false;
    }
  }
  if (n === 2) {
    const type = selectedType();
    if (!type) {
      window.showToast('Selecciona un tipo de tratamiento.', 'error');
      return false;
    }
    if (type === 'Otro' && !$('tx-other').value.trim()) {
      $('tx-other').focus();
      window.showToast('Especifica el tratamiento.', 'error');
      return false;
    }
  }
  return true;
}

prevBtn.addEventListener('click', () => { if (currentStep > 1) showStep(currentStep - 1); });
nextBtn.addEventListener('click', () => { if (validateStep(currentStep) && currentStep < totalSteps) showStep(currentStep + 1); });

// ---------- Listado ----------
function sourceColors(source) {
  return source === 'Clínica'
    ? { bg: 'rgba(13,148,136,0.1)', fg: '#0D9488' }
    : { bg: 'rgba(16,185,129,0.1)', fg: '#10B981' };
}

function renderTreatments() {
  const now = new Date();
  const filtered = treatmentsData.filter(t => matchesMonthFilter(t.date, currentFilter));
  const mes = treatmentsData.filter(t => matchesMonthFilter(t.date, now.getMonth()));
  $('statMonth').textContent = mes.length;
  $('statClinica').textContent = mes.filter(t => t.source === 'Clínica').length;
  $('statExterno').textContent = mes.filter(t => t.source === 'Externo').length;

  if (filtered.length === 0) {
    txList.innerHTML = '';
    txList.classList.add('hidden');
    txEmpty.classList.remove('hidden');
    const label = currentFilter === -1 ? 'hoy' : currentFilter === 99 ? 'todos los registros' : months[currentFilter];
    historialDesc.textContent = `Sin tratamientos — ${label}`;
    return;
  }
  txList.classList.remove('hidden');
  txEmpty.classList.add('hidden');

  const total = filtered.reduce((s, t) => s + t.total, 0);
  const label = currentFilter === -1 ? 'Hoy' : currentFilter === 99 ? 'Todos' : months[currentFilter];
  historialDesc.textContent = label + ' — ' + filtered.length + ' tratamientos · ' + money(total);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  if (txPage > totalPages) txPage = totalPages;
  const start = (txPage - 1) * PER_PAGE;

  txList.innerHTML = filtered.slice(start, start + PER_PAGE).map((t, i) => {
    const c = sourceColors(t.source);
    return `
      <div class="tx-card" data-id="${t.id}" style="animation-delay: ${i * 0.04}s">
        <div class="tx-card-main">
          <div class="expense-left">
            <div class="tx-icon" style="background: ${c.bg}; color: ${c.fg}">${ICON_CLIP}</div>
            <div class="expense-info">
              <span class="tx-patient">${escHtml(t.patient)}</span>
              <div class="expense-meta">
                <span class="tx-type-badge">${escHtml(t.type)}</span>
                <span class="expense-sep">•</span>
                <span class="expense-date">${formatDate(t.date)}</span>
              </div>
              <div class="expense-meta">
                ${t.balance > 0 ? `<span class="tx-balance-badge">Debe ${money(t.balance)}</span>` : ''}
                ${t.nextAppointment ? `<span class="tx-appt-badge">${ICON_CAL} ${formatAppointment(t.nextAppointment)}</span>` : ''}
              </div>
            </div>
          </div>
          <span class="tx-source" style="background: ${c.bg}; color: ${c.fg}">${t.source}</span>
          <div class="expense-right">
            <span class="tx-cost">${money(t.total)}</span>
            <div class="expense-actions">
              <button class="expense-action-btn tx-edit-btn" aria-label="Editar" type="button">${ICON_EDIT}</button>
              <button class="expense-action-btn tx-delete-btn" aria-label="Eliminar" type="button">${ICON_DELETE}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('') + paginationHtml(txPage, totalPages);
}

monthFilter.addEventListener('change', function () {
  currentFilter = parseInt(this.value);
  txPage = 1;
  renderTreatments();
});

txList.addEventListener('click', (e) => {
  const pagBtn = e.target.closest('.pag-btn');
  if (pagBtn) {
    txPage = parseInt(pagBtn.dataset.page);
    renderTreatments();
    return;
  }
  const card = e.target.closest('.tx-card');
  if (!card) return;
  const t = treatmentsData.find(x => String(x.id) === card.dataset.id);
  if (!t) return;
  if (e.target.closest('.tx-edit-btn')) { startEdit(t); return; }
  if (e.target.closest('.tx-delete-btn')) { handleDelete(t); return; }
  openModal(t);
});

function startEdit(t) {
  editingId = t.id;
  form.querySelector('[name="source"][value="' + t.source + '"]').checked = true;
  $('tx-date').value = t.date;
  $('tx-patient').value = t.patient;
  svcSearch.value = '';
  svcSpecialty.value = '';
  renderServices();
  const typeRadio = [...form.querySelectorAll('[name="type"]')].find(r => r.value === t.type);
  if (typeRadio) {
    typeRadio.checked = true;
    otherGroup.style.display = 'none';
  } else {
    form.querySelector('[name="type"][value="Otro"]').checked = true;
    otherGroup.style.display = 'block';
    $('tx-other').value = t.type;
  }
  totalInput.value = t.total;
  paidInput.value = t.paid;
  costsList.innerHTML = '';
  t.costs.forEach(c => addCostRow(c.concept, c.amount));
  const [apptDate, apptTime] = (t.nextAppointment || '').split('T');
  $('tx-appt-date').value = apptDate || '';
  $('tx-appt-time').value = apptTime || '09:00';
  $('tx-appt-note').value = t.appointmentNote || '';
  calc();
  submitBtn.innerHTML = ICON_EDIT.replace(/14/g, '18') + ' Actualizar Tratamiento';
  cancelBtn.classList.remove('hidden');
  $('formTitle').textContent = 'Editar Tratamiento';
  $('formDesc').textContent = 'Modifica los datos del tratamiento';
  showStep(1);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  form.reset();
  $('tx-date').value = new Date().toLocaleDateString('en-CA');
  $('tx-appt-time').value = '09:00';
  otherGroup.style.display = 'none';
  costsList.innerHTML = '';
  voucher.reset();
  svcSearch.value = '';
  svcSpecialty.value = '';
  renderServices();
  calc();
  submitBtn.innerHTML = SUBMIT_NEW;
  cancelBtn.classList.add('hidden');
  $('formTitle').textContent = 'Nuevo Tratamiento';
  $('formDesc').textContent = 'Registra un nuevo tratamiento';
  showStep(1);
}
cancelBtn.addEventListener('click', resetForm);

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!validateStep(1) || !validateStep(2)) return;
  const fd = new FormData(this);
  const type = fd.get('type');
  const total = parseFloat(fd.get('total'));
  const paid = parseFloat(fd.get('paid')) || 0;
  if (!total || total <= 0) {
    window.showToast('Ingresa el monto total.', 'error');
    totalInput.focus();
    return;
  }
  if (paid > total) {
    window.showToast('El monto pagado no puede ser mayor que el total.', 'error');
    paidInput.focus();
    return;
  }
  const apptDate = $('tx-appt-date').value;
  const data = {
    patient: fd.get('patient').trim(),
    type: type === 'Otro' ? (fd.get('otherType') || '').trim() || 'Otro' : type,
    source: fd.get('source') || 'Clínica',
    date: fd.get('date'),
    total,
    paid,
    costs: getCosts(),
    nextAppointment: apptDate ? apptDate + 'T' + ($('tx-appt-time').value || '09:00') : '',
    appointmentNote: $('tx-appt-note').value.trim(),
  };
  let file = voucher.file();
  if (file) {
    try { file = await compressImage(file); } catch (_) { /* se sube el original */ }
  }
  submitBtn.disabled = true;
  try {
    if (editingId) {
      const updated = await updateTreatment(editingId, data, file);
      treatmentsData[treatmentsData.findIndex(t => t.id === updated.id)] = updated;
      window.showToast('Tratamiento actualizado.', 'success');
    } else {
      treatmentsData.unshift(await addTreatment(data, file));
      window.showToast('Tratamiento registrado correctamente.', 'success');
    }
    if (data.total - data.paid > 0) {
      window.showToast('Saldo de ' + money(data.total - data.paid) + ' registrado en Deudas.', 'info', 4500);
    }
    resetForm();
    renderTreatments();
    if (window.dfCheckNotifications) window.dfCheckNotifications();
  } catch (err) {
    window.showToast(err.message || 'Error al guardar el tratamiento.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

async function handleDelete(t) {
  const msg = t.balance > 0 ? '¿Eliminar este tratamiento? También se eliminará su deuda pendiente.' : '¿Eliminar este tratamiento?';
  if (!await window.showConfirm(msg)) return;
  try {
    await deleteTreatment(t.id);
    treatmentsData = treatmentsData.filter(x => x.id !== t.id);
    if (editingId === t.id) resetForm();
    renderTreatments();
    window.showToast('Tratamiento eliminado.', 'success');
  } catch (err) {
    window.showToast(err.message || 'Error al eliminar el tratamiento.', 'error');
  }
}

// ---------- Modal ----------
function openModal(t) {
  $('mType').textContent = t.type;
  $('mPatient').textContent = t.patient;
  $('mSource').textContent = t.source;
  $('mTotal').textContent = money(t.total);
  $('mPaid').textContent = money(t.paid);
  const mBalance = $('mBalance');
  mBalance.textContent = money(t.balance);
  mBalance.style.color = t.balance > 0 ? '#DC2626' : '#059669';
  const { day, month, year } = parseDate(t.date);
  $('mDate').textContent = String(day).padStart(2, '0') + ' de ' + months[month] + ' ' + year;
  $('mCosts').textContent = t.costs.length
    ? t.costs.map(c => c.concept + ': ' + money(c.amount)).join(' · ') + ' (total ' + money(t.totalCosts) + ')'
    : '—';
  const mProfit = $('mProfit');
  mProfit.textContent = money(t.estimatedProfit) + ' · cobrada ' + money(t.collectedProfit);
  mProfit.style.color = t.estimatedProfit >= 0 ? 'var(--c-success)' : 'var(--c-danger)';
  $('mAppt').textContent = t.nextAppointment
    ? formatAppointment(t.nextAppointment) + (t.appointmentNote ? ' — ' + t.appointmentNote : '')
    : 'Sin cita programada';
  showVoucherIn($('mVoucherField'), $('mVoucherImg'), t.voucher);
  modal.classList.remove('hidden');
  modal.classList.add('visible');
}

function closeModal() {
  modal.classList.remove('visible');
  modal.classList.add('hidden');
}
$('txModalClose').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

// ---------- PDF ----------
$('exportPdfBtn').addEventListener('click', async () => {
  const now = new Date();
  const filter = currentFilter === -1 ? now.getMonth() : currentFilter;
  const filtered = treatmentsData.filter(t => matchesMonthFilter(t.date, filter));
  if (filtered.length === 0) {
    window.showToast('No hay tratamientos para exportar.', 'info');
    return;
  }
  const label = filter === 99 ? 'Todos los meses' : months[filter];
  const sum = (k) => filtered.reduce((s, t) => s + t[k], 0);
  const rows = await Promise.all(filtered.map(async (t) => {
    const dataUrl = await voucherToDataUrl(t.voucher);
    const img = dataUrl ? `<img src="${dataUrl}" class="print-voucher" />` : '';
    return `<tr><td>${formatDate(t.date)}</td><td>${escHtml(t.patient)}</td><td>${escHtml(t.type)}</td><td>${t.source}</td><td style="text-align:right">${money(t.total)}</td><td style="text-align:right">${money(t.paid)}</td><td style="text-align:right">${money(t.balance)}</td><td style="text-align:right">${money(t.totalCosts)}</td><td style="text-align:right">${money(t.estimatedProfit)}</td><td>${img}</td></tr>`;
  }));
  const r = 'text-align:right;font-weight:700';
  printReport({
    title: 'Reporte de Tratamientos',
    period: label,
    summary: [
      ['Total Tratamientos', money(sum('total'))],
      ['Cobrado', money(sum('paid'))],
      ['Saldo Pendiente', money(sum('balance'))],
      ['Ganancia Estimada', money(sum('estimatedProfit'))],
      ['Cantidad', filtered.length + ' registros'],
    ],
    head: ['Fecha', 'Paciente', 'Tratamiento', 'Ubicación', 'Total', 'Pagado', 'Saldo', 'Costos', 'Ganancia', 'Comprobante'],
    rows: rows.join(''),
    foot: `<tr><td colspan="4" style="${r}">Total</td><td style="${r}">${money(sum('total'))}</td><td style="${r}">${money(sum('paid'))}</td><td style="${r}">${money(sum('balance'))}</td><td style="${r}">${money(sum('totalCosts'))}</td><td style="${r}">${money(sum('estimatedProfit'))}</td><td></td></tr>`,
  });
});

// ---------- Init ----------
$('tx-date').value = new Date().toLocaleDateString('en-CA');
showStep(1);

async function init() {
  try {
    treatmentsData = await fetchTreatments();
  } catch (err) {
    window.showToast('No se pudieron cargar los tratamientos.', 'error');
  }
  renderTreatments();
  loadServiceTypes();
}

init();
