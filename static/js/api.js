// Cliente de la API Django (reemplaza a Appwrite).

function getCookie(name) {
  const match = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=')[1]) : '';
}

async function request(method, url, body) {
  const opts = { method, headers: { 'X-CSRFToken': getCookie('csrftoken') }, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const resp = await fetch(url, opts);
  let data = null;
  try { data = await resp.json(); } catch (_) { /* respuesta vacía */ }
  if (resp.status === 401 && !url.startsWith('/api/auth/')) {
    window.location.href = '/';
  }
  if (!resp.ok) {
    const err = new Error((data && data.error) || 'Error ' + resp.status);
    err.status = resp.status;
    throw err;
  }
  return data;
}

// Arma un FormData con los campos y, si hay, el comprobante.
function toForm(data, file) {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
  });
  if (file) fd.append('voucher', file);
  return fd;
}

// --- Auth / perfil ---
export const login = (email, password, remember) => request('POST', '/api/auth/login', { email, password, remember });
export const register = (data) => request('POST', '/api/auth/register', data);
export const logout = () => request('POST', '/api/auth/logout', {});
export const requestRecovery = (email) => request('POST', '/api/auth/recovery', { email });
export const saveProfile = (data) => request('POST', '/api/profile', data);

// --- Clínica ---
export const fetchClinic = () => request('GET', '/api/clinic');
export const saveClinic = (data) => request('POST', '/api/clinic', data);
export const fetchClinics = () => request('GET', '/api/clinics');
export const addClinic = (data) => request('POST', '/api/clinics', data);
export const updateClinic = (id, data) => request('PUT', '/api/clinics/' + id, data);
export const deleteClinic = (id) => request('DELETE', '/api/clinics/' + id);
export const activateClinic = (id) => request('POST', '/api/clinics/' + id + '/activate', {});

// --- Servicios ---
export const fetchServices = () => request('GET', '/api/services');
export const addService = (data) => request('POST', '/api/services', data);
export const updateService = (id, data) => request('PUT', '/api/services/' + id, data);
export const deleteService = (id) => request('DELETE', '/api/services/' + id);
export const restoreServices = () => request('POST', '/api/services/restore', {});

// --- Gastos ---
export const fetchExpenses = () => request('GET', '/api/expenses');
export const addExpense = (data, file) => request('POST', '/api/expenses', toForm(data, file));
export const updateExpense = (id, data, file) => request('POST', '/api/expenses/' + id, toForm(data, file));
export const deleteExpense = (id) => request('DELETE', '/api/expenses/' + id);

// --- Tratamientos ---
export const fetchTreatments = () => request('GET', '/api/treatments');
export const addTreatment = (data, file) => request('POST', '/api/treatments', toForm(data, file));
export const updateTreatment = (id, data, file) => request('POST', '/api/treatments/' + id, toForm(data, file));
export const deleteTreatment = (id) => request('DELETE', '/api/treatments/' + id);

// --- Deudas ---
export const fetchDebts = () => request('GET', '/api/debts');
export const addDebt = (data, file) => request('POST', '/api/debts', toForm(data, file));
export const updateDebt = (id, data, file) => request('POST', '/api/debts/' + id, toForm(data, file));
export const payDebt = (id) => request('POST', '/api/debts/' + id + '/pay', {});
export const deleteDebt = (id) => request('DELETE', '/api/debts/' + id);

// --- Dashboard / notificaciones ---
export const fetchSummary = (year) => request('GET', '/api/summary' + (year ? '?year=' + year : ''));
export const fetchNotifications = () => request('GET', '/api/notifications');

// Convierte una URL de comprobante en data URL (para incrustarla en el PDF).
export async function voucherToDataUrl(url) {
  if (!url) return '';
  try {
    const resp = await fetch(url, { credentials: 'same-origin' });
    if (!resp.ok) return '';
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) return '';
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    return '';
  }
}

export function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

export const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Fechas ISO "YYYY-MM-DD" → { day, month, year } sin desfase de zona horaria.
export function parseDate(dateStr) {
  const parts = String(dateStr || '').slice(0, 10).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0]), m = parseInt(parts[1]) - 1, d = parseInt(parts[2]);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return { day: d, month: m, year: y };
  }
  const dt = new Date(dateStr);
  if (!isNaN(dt.getTime())) return { day: dt.getDate(), month: dt.getMonth(), year: dt.getFullYear() };
  const now = new Date();
  return { day: now.getDate(), month: now.getMonth(), year: now.getFullYear() };
}

export function formatDate(dateStr) {
  const { day, month } = parseDate(dateStr);
  return String(day).padStart(2, '0') + ' ' + MONTHS[month].slice(0, 3);
}

export function isOverdue(dueDate) {
  if (!dueDate) return false;
  const { day, month, year } = parseDate(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(year, month, day) < today;
}

// Filtro de los selectores de mes: -1 = hoy, 99 = todos, 0-11 = mes del año actual.
export function matchesMonthFilter(dateStr, filter) {
  const now = new Date();
  const { day, month, year } = parseDate(dateStr);
  if (filter === 99) return true;
  if (filter === -1) return day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  return month === filter && year === now.getFullYear();
}

export function money(n) {
  return 'S/ ' + (Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatAppointment(value) {
  if (!value) return '';
  const [d, t] = value.split('T');
  const { day, month } = parseDate(d);
  return String(day).padStart(2, '0') + ' ' + MONTHS[month].slice(0, 3) + (t ? ' · ' + t.slice(0, 5) : '');
}
