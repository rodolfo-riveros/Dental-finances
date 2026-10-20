import {
  fetchServices, addService, updateService, deleteService, restoreServices, escHtml, money,
  fetchClinics, addClinic, updateClinic, deleteClinic, activateClinic,
} from './api.js';

let services = [];
let editingId = null;
let selectedColor = '#0D9488';
const $ = (id) => document.getElementById(id);

// --- Clínicas ---
let clinicsData = [];
let editingClinicId = null;
let clinicColor = '#0D9488';
const clinicModal = $('clinicModal');

async function loadClinics() {
  try {
    clinicsData = await fetchClinics();
  } catch (err) {
    window.showToast('No se pudieron cargar las clínicas.', 'error');
    return;
  }
  const activeClinic = clinicsData.find(c => c.active);
  $('clinicStat').textContent = activeClinic ? activeClinic.name : '—';
  $('clinicGrid').innerHTML = clinicsData.map(c => `
    <div class="clinic-card ${c.active ? 'active' : ''}" data-id="${c.id}" style="--clinic-color:${escHtml(c.color)}">
      <div class="clinic-card-top">
        <span class="clinic-card-name">${escHtml(c.name)}</span>
        ${c.active ? '<span class="clinic-badge">Activa</span>' : ''}
      </div>
      <div class="clinic-card-meta">
        ${c.address ? `<span>${escHtml(c.address)}</span>` : ''}
        ${c.phone ? `<span>${escHtml(c.phone)}</span>` : ''}
        ${c.email ? `<span>${escHtml(c.email)}</span>` : ''}
        ${!c.address && !c.phone && !c.email ? '<span>Sin datos de contacto</span>' : ''}
      </div>
      <div class="clinic-card-actions">
        ${c.active ? '' : '<button class="svc-btn svc-btn-edit" data-clinic-action="activate">Usar esta clínica</button>'}
        <button class="svc-btn svc-btn-edit" data-clinic-action="edit">${ICON_EDIT} Editar</button>
        ${clinicsData.length > 1 ? `<button class="svc-btn svc-btn-del" data-clinic-action="delete" aria-label="Eliminar">${ICON_DEL}</button>` : ''}
      </div>
    </div>`).join('');
}

function setClinicColor(color) {
  clinicColor = color;
  document.querySelectorAll('#clColorPicker .color-swatch').forEach(el => el.classList.toggle('selected', el.dataset.color === color));
}

function openClinicModal(c) {
  editingClinicId = c ? c.id : null;
  $('clinicModalTitle').textContent = c ? 'Editar Clínica' : 'Nueva Clínica';
  $('clName').value = c ? c.name : '';
  $('clEmail').value = c ? c.email : '';
  $('clPhone').value = c ? c.phone : '';
  $('clAddress').value = c ? c.address : '';
  $('clNewHint').style.display = c ? 'none' : '';
  setClinicColor(c ? c.color : '#0D9488');
  clinicModal.classList.remove('hidden');
  clinicModal.classList.add('visible');
  setTimeout(() => $('clName').focus(), 100);
}

function closeClinicModal() {
  clinicModal.classList.remove('visible');
  clinicModal.classList.add('hidden');
  editingClinicId = null;
}

$('addClinic').addEventListener('click', () => openClinicModal(null));
$('clinicModalClose').addEventListener('click', closeClinicModal);
$('clinicModalCancel').addEventListener('click', closeClinicModal);
clinicModal.addEventListener('click', (e) => { if (e.target === clinicModal) closeClinicModal(); });
$('clColorPicker').addEventListener('click', (e) => {
  const sw = e.target.closest('.color-swatch');
  if (sw) setClinicColor(sw.dataset.color);
});

$('clinicModalSave').addEventListener('click', async () => {
  const data = {
    name: $('clName').value.trim(), email: $('clEmail').value.trim(),
    phone: $('clPhone').value.trim(), address: $('clAddress').value.trim(), color: clinicColor,
  };
  if (!data.name) {
    window.showToast('El nombre de la clínica es obligatorio.', 'error');
    return;
  }
  try {
    if (editingClinicId) {
      const wasActive = clinicsData.find(c => c.id === editingClinicId)?.active;
      await updateClinic(editingClinicId, data);
      closeClinicModal();
      if (wasActive) { window.location.reload(); return; }
      await loadClinics();
      window.showToast('Clínica actualizada.', 'success');
    } else {
      await addClinic(data);
      window.showToast('Clínica creada. Cambiando a la nueva clínica…', 'success');
      setTimeout(() => window.location.reload(), 700);
    }
  } catch (err) {
    window.showToast(err.message || 'Error al guardar la clínica.', 'error');
  }
});

$('clinicGrid').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-clinic-action]');
  if (!btn) return;
  const c = clinicsData.find(x => String(x.id) === btn.closest('.clinic-card').dataset.id);
  if (!c) return;
  const action = btn.dataset.clinicAction;
  try {
    if (action === 'edit') { openClinicModal(c); return; }
    if (action === 'activate') {
      await activateClinic(c.id);
      window.location.reload();
      return;
    }
    if (action === 'delete') {
      const ok = await window.showConfirm('¿Eliminar "' + c.name + '"? Se borrarán TODOS sus servicios, tratamientos, gastos y deudas. Esta acción no se puede deshacer.');
      if (!ok) return;
      await deleteClinic(c.id);
      window.showToast('Clínica eliminada.', 'success');
      setTimeout(() => window.location.reload(), 600);
    }
  } catch (err) {
    window.showToast(err.message || 'No se pudo completar la acción.', 'error');
  }
});

// --- Servicios ---
const grid = $('servicesGrid');
const filterText = $('svcFilterText');
const filterSpecialty = $('svcFilterSpecialty');

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function specialties() {
  return [...new Set(services.map(s => s.specialty))];
}

async function loadServices() {
  try {
    services = await fetchServices();
  } catch (err) {
    window.showToast('No se pudieron cargar los servicios.', 'error');
  }
  $('svcCount').textContent = services.length;
  const current = filterSpecialty.value;
  const specs = specialties();
  filterSpecialty.innerHTML = '<option value="">Todas las especialidades</option>' +
    specs.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('');
  if (specs.includes(current)) filterSpecialty.value = current;
  $('specialtyList').innerHTML = specs.map(s => `<option value="${escHtml(s)}"></option>`).join('');
  renderServices();
}

const ICON_SVC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>';
const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>';

function cardHtml(s, i) {
  const color = /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#0D9488';
  const isClinic = s.category === 'Clínica';
  return `
    <div class="svc-card" data-id="${s.id}" style="animation-delay: ${Math.min(i, 12) * 0.04}s">
      <div class="svc-card-accent" style="background: linear-gradient(90deg, ${color}, ${color}44)"></div>
      <div class="svc-card-body">
        <div class="svc-card-top">
          <div class="svc-card-icon" style="background: ${color}18; color: ${color}; box-shadow: 0 4px 12px ${color}22">${ICON_SVC}</div>
          <span class="svc-category" style="background: ${isClinic ? 'rgba(13,148,136,0.12)' : 'rgba(16,185,129,0.12)'}; color: ${isClinic ? '#0D9488' : '#10B981'}">${escHtml(s.category)}</span>
        </div>
        <h3 class="svc-title">${escHtml(s.title)}</h3>
        <p class="svc-desc">${escHtml(s.desc)}</p>
        <div class="svc-price" style="color: ${color}">${money(s.price)}</div>
        <div class="svc-actions">
          <button class="svc-btn svc-btn-edit" data-action="edit">${ICON_EDIT} Editar</button>
          <button class="svc-btn svc-btn-del" data-action="delete" aria-label="Eliminar">${ICON_DEL}</button>
        </div>
      </div>
    </div>`;
}

function renderServices() {
  if (services.length === 0) {
    grid.innerHTML = `<div class="list-empty"><span>No hay servicios registrados</span><button class="btn-add-empty" data-action="add">+ Agregar Servicio</button><button class="btn-add-empty" data-action="restore">Cargar catálogo odontológico</button></div>`;
    return;
  }
  const q = normalize(filterText.value);
  const spec = filterSpecialty.value;
  const groups = new Map();
  services.forEach(s => {
    if (spec && s.specialty !== spec) return;
    if (q && !normalize(s.title + ' ' + s.desc + ' ' + s.specialty).includes(q)) return;
    if (!groups.has(s.specialty)) groups.set(s.specialty, []);
    groups.get(s.specialty).push(s);
  });
  if (groups.size === 0) {
    grid.innerHTML = '<div class="list-empty"><span>No hay servicios que coincidan con la búsqueda</span></div>';
    return;
  }
  let html = '';
  let i = 0;
  groups.forEach((items, specialty) => {
    html += `<div class="svc-group">
      <div class="svc-group-head"><span class="svc-group-dot" style="background:${escHtml(items[0].color)}"></span>${escHtml(specialty)} <span class="svc-group-count">${items.length} servicios</span></div>
      <div class="services-grid">${items.map(s => cardHtml(s, i++)).join('')}</div>
    </div>`;
  });
  grid.innerHTML = html;
}

filterText.addEventListener('input', renderServices);
filterSpecialty.addEventListener('change', renderServices);

grid.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'add') { openModal(null); return; }
  if (action === 'restore') { doRestore(); return; }
  const card = btn.closest('.svc-card');
  const svc = card && services.find(x => String(x.id) === card.dataset.id);
  if (!svc) return;
  if (action === 'edit') openModal(svc);
  if (action === 'delete') {
    if (!await window.showConfirm('¿Eliminar el servicio "' + svc.title + '"?')) return;
    try {
      await deleteService(svc.id);
      await loadServices();
      window.showToast('Servicio eliminado.', 'success');
    } catch (err) {
      window.showToast(err.message || 'Error al eliminar.', 'error');
    }
  }
});

async function doRestore() {
  try {
    const { created } = await restoreServices();
    await loadServices();
    window.showToast(created ? created + ' servicios del catálogo agregados.' : 'Ya tienes todos los servicios del catálogo.', created ? 'success' : 'info');
  } catch (err) {
    window.showToast(err.message || 'Error al cargar el catálogo.', 'error');
  }
}
$('restoreServices').addEventListener('click', doRestore);

// --- Modal ---
const modal = $('serviceModal');
const svcTitle = $('svcTitle');
const svcDesc = $('svcDesc');
const svcPrice = $('svcPrice');
const svcCategory = $('svcCategory');
const svcSpecialty = $('svcSpecialty');
const svcColorPicker = $('svcColorPicker');
const svcColorHex = $('svcColorHex');

function setColor(color) {
  selectedColor = color;
  svcColorPicker.value = color;
  svcColorHex.value = color;
  document.querySelectorAll('.color-swatch').forEach(el => el.classList.toggle('selected', el.dataset.color === color));
}

function openModal(svc) {
  editingId = svc ? svc.id : null;
  $('modalTitle').textContent = svc ? 'Editar Servicio' : 'Nuevo Servicio';
  svcTitle.value = svc ? svc.title : '';
  svcDesc.value = svc ? svc.desc : '';
  svcPrice.value = svc ? svc.price : '';
  svcCategory.value = svc ? svc.category : 'Clínica';
  svcSpecialty.value = svc ? svc.specialty : (filterSpecialty.value || '');
  setColor(svc ? svc.color : '#0D9488');
  modal.classList.remove('hidden');
  modal.classList.add('visible');
  setTimeout(() => svcTitle.focus(), 100);
}

function closeModal() {
  modal.classList.remove('visible');
  modal.classList.add('hidden');
  editingId = null;
}
$('addService').addEventListener('click', () => openModal(null));
$('modalClose').addEventListener('click', closeModal);
$('modalCancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

$('colorPicker').addEventListener('click', (e) => {
  const swatch = e.target.closest('.color-swatch');
  if (swatch) setColor(swatch.dataset.color);
});
svcColorPicker.addEventListener('input', () => setColor(svcColorPicker.value));
svcColorHex.addEventListener('input', () => {
  if (/^#[0-9a-fA-F]{6}$/.test(svcColorHex.value)) setColor(svcColorHex.value);
});

// Al escribir una especialidad existente se propone su color.
svcSpecialty.addEventListener('change', () => {
  const match = services.find(s => s.specialty === svcSpecialty.value.trim());
  if (match && !editingId) setColor(match.color);
});

$('modalSaveService').addEventListener('click', async () => {
  const data = {
    title: svcTitle.value.trim(),
    desc: svcDesc.value.trim(),
    price: parseFloat(svcPrice.value),
    category: svcCategory.value,
    specialty: svcSpecialty.value.trim() || 'General',
    color: selectedColor,
  };
  const missing = [];
  if (!data.title) missing.push('Nombre');
  if (isNaN(data.price) || data.price < 0) missing.push('Precio');
  if (missing.length) {
    window.showToast('Campos obligatorios: ' + missing.join(', '), 'error');
    return;
  }
  const wasEditing = !!editingId;
  try {
    if (editingId) await updateService(editingId, data);
    else await addService(data);
    closeModal();
    await loadServices();
    window.showToast(wasEditing ? 'Servicio actualizado.' : 'Servicio creado.', 'success');
  } catch (err) {
    window.showToast(err.message || 'Error al guardar servicio.', 'error');
  }
});

$('replayTour').addEventListener('click', () => {
  localStorage.removeItem('df_tour_complete');
  window.location.href = '/dashboard';
});

loadClinics();
loadServices();
if (location.hash === '#clinicas') setTimeout(() => openClinicModal(null), 400);
