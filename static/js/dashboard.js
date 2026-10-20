import { fetchSummary, escHtml, MONTHS as months, money, formatAppointment, formatDate } from './api.js';

const monthFilter = document.getElementById('monthFilter');
const incomeFilter = document.getElementById('incomeFilter');
const thisYear = new Date().getFullYear();
let current = null;   // resumen del año actual
let previous = null;  // resumen del año anterior (para comparar enero)

const ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181"/></svg>';

function monthData(idx) {
  // idx puede ser negativo: -1 = diciembre del año anterior
  if (idx >= 0) return current.months[String(idx)];
  return previous ? previous.months[String(12 + idx)] : null;
}

function netProfit(d) {
  return d ? d.ganancia - d.gastos : 0;
}

function pctChange(now, before) {
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function setChange(el, pct, inverse = false) {
  if (pct === null) {
    el.textContent = 'Sin datos del mes anterior';
    el.className = 'dash-card-change up';
    return;
  }
  const up = pct >= 0;
  const good = inverse ? !up : up;
  el.innerHTML = (up ? ICON_ARROW : ICON_DOWN) + ' ' + (up ? '+' : '') + pct.toFixed(0) + '% vs mes anterior';
  el.className = 'dash-card-change ' + (good ? 'up' : 'down');
}

function setBars(idA, idB, a, b) {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  document.getElementById(idA).style.width = (Math.abs(a) / max * 100) + '%';
  document.getElementById(idB).style.width = (Math.abs(b) / max * 100) + '%';
}

function updateDashboard(monthIdx) {
  const data = monthData(monthIdx);
  const prev = monthData(monthIdx - 1);
  const net = netProfit(data);
  const prevNet = netProfit(prev);

  const valG = document.getElementById('valGanancia');
  valG.textContent = money(net);
  valG.title = `Cobrado ${money(data.cobrado)} − costos de tratamientos ${money(data.costos)} − gastos ${money(data.gastos)}`;
  document.getElementById('valGastos').textContent = money(data.gastos);

  setChange(document.getElementById('changeGanancia'), prev && (prev.cobrado || prev.gastos) ? pctChange(net, prevNet) : null);
  setChange(document.getElementById('changeGastos'), prev && prev.gastos ? pctChange(data.gastos, prev.gastos) : null, true);

  const cur = months[monthIdx].slice(0, 3);
  const before = months[(monthIdx + 11) % 12].slice(0, 3);
  document.querySelectorAll('.mini-cur').forEach(el => { el.textContent = cur; });
  document.querySelectorAll('.mini-prev').forEach(el => { el.textContent = before; });
  setBars('miniG1', 'miniG2', net, prevNet);
  setBars('miniE1', 'miniE2', data.gastos, prev ? prev.gastos : 0);

  updateChart(monthIdx);
}

function updateDebts() {
  const t = current.totals;
  document.getElementById('valDeudas').textContent = money(t.deudasPendientes);
  document.getElementById('activeDebtCount').innerHTML = ICON_DOWN + ' ' + t.deudasCount + ' deudas activas' +
    (t.deudasVencidas ? ' · ' + t.deudasVencidas + ' vencidas' : '');
  setBars('miniD1', 'miniD2', t.deudasCount - t.deudasVencidas, t.deudasVencidas);
  const mini = document.querySelector('#deudaCard .dash-card-mini');
  const labels = mini.querySelectorAll('span');
  if (labels.length >= 2) { labels[0].textContent = 'Al día'; labels[1].textContent = 'Venc.'; }
}

function incomeFor(monthIdx) {
  const filter = incomeFilter.value;
  const span = filter === 'month' ? 1 : filter === 'quarter' ? 3 : 12;
  let c = 0, e = 0;
  if (filter === 'year') {
    for (let i = 0; i < 12; i++) { c += current.months[String(i)].clinica; e += current.months[String(i)].externo; }
  } else {
    for (let i = 0; i < span; i++) {
      const d = monthData(monthIdx - i);
      if (d) { c += d.clinica; e += d.externo; }
    }
  }
  return { c, e };
}

function updateChart(monthIdx) {
  const { c, e } = incomeFor(monthIdx);
  const total = c + e;
  const cPct = total > 0 ? (c / total * 100) : 0;
  const ePct = total > 0 ? (e / total * 100) : 0;
  const bar = (label, cls, color, grad, pct, amount) => `
    <div class="chart-bar-row" style="display:grid;grid-template-columns:minmax(60px,80px) 1fr minmax(60px,90px);align-items:center;gap:0.75rem;">
      <div class="chart-bar-label" style="display:flex;align-items:center;gap:0.4rem;font-size:0.8rem;font-weight:500;color:var(--c-text-secondary);">
        <span class="bar-dot ${cls}" style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${label}
      </div>
      <div class="chart-bar-track" style="height:22px;background:var(--c-chart-track);border-radius:11px;overflow:hidden;">
        <div class="chart-bar-fill ${cls}" style="height:100%;border-radius:11px;display:flex;align-items:center;justify-content:flex-end;padding:0 0.5rem;background:linear-gradient(90deg,${color},${grad});min-width:fit-content;transition:width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);width:${pct}%;">
          <span class="chart-bar-value" style="font-size:0.7rem;font-weight:600;color:white;">${pct.toFixed(0)}%</span>
        </div>
      </div>
      <span class="chart-bar-amount" style="font-size:0.85rem;font-weight:700;color:var(--c-text);text-align:right;">${money(amount)}</span>
    </div>`;
  document.getElementById('incomeChartContainer').innerHTML = `
    <div class="chart-widget">
      <div class="chart-body" style="display:flex;flex-direction:column;gap:1.25rem;">
        <div class="chart-bars" style="display:flex;flex-direction:column;gap:0.75rem;">
          ${bar('Clínica', 'clinica', 'var(--c-chart-clinica)', '#14B8A6', cPct, c)}
          ${bar('Externo', 'externo', 'var(--c-chart-externo)', '#34D399', ePct, e)}
        </div>
        <div style="height:1px;background:var(--c-border);"></div>
        <div style="display:flex;justify-content:center;">
          <div class="pie-ring" style="position:relative;width:130px;height:130px;">
            <svg viewBox="0 0 100 100" style="width:100%;height:100%;">
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--c-chart-track)" stroke-width="12" />
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--c-chart-clinica)" stroke-width="12" stroke-dasharray="${cPct * 2.39} 239" stroke-linecap="round" transform="rotate(-90 50 50)" />
              <circle cx="50" cy="50" r="38" fill="none" stroke="var(--c-chart-externo)" stroke-width="12" stroke-dasharray="${ePct * 2.39} 239" stroke-dashoffset="${-cPct * 2.39}" stroke-linecap="round" transform="rotate(-90 50 50)" />
            </svg>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
              <span style="display:block;font-size:1.05rem;font-weight:800;color:var(--c-text);letter-spacing:-0.02em;">${money(total)}</span>
              <span style="font-size:0.7rem;color:var(--c-text-light);display:block;margin-top:0.05rem;">Facturado</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderActivity(items) {
  const list = document.getElementById('activityList');
  if (!items.length) {
    list.innerHTML = '<div class="activity-item" style="justify-content:center;opacity:0.5;padding:1.5rem"><span class="activity-desc" style="font-size:0.8rem;white-space:normal;text-align:center">Sin actividad reciente</span></div>';
    return;
  }
  list.innerHTML = items.map(item => {
    const isIncome = item.amount >= 0;
    const icon = isIncome
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    return `
      <div class="activity-item">
        <div class="activity-icon ${isIncome ? 'income' : 'expense'}">${icon}</div>
        <div class="activity-info">
          <span class="activity-desc">${escHtml(item.label)}</span>
          <span class="activity-date">${formatDate(item.date)}</span>
        </div>
        <span class="activity-amount ${isIncome ? 'positive' : 'negative'}">${isIncome ? '+' : '-'}${money(Math.abs(item.amount))}</span>
      </div>`;
  }).join('');
}

function renderAppointments(items) {
  const list = document.getElementById('apptList');
  if (!items.length) {
    list.innerHTML = '<div class="activity-item" style="justify-content:center;opacity:0.6;padding:1.25rem"><span class="activity-desc" style="font-size:0.8rem;white-space:normal;text-align:center">No hay citas programadas. Prográmalas en el paso de Finanzas del tratamiento.</span></div>';
    return;
  }
  const today = new Date().toLocaleDateString('en-CA');
  list.innerHTML = items.map(a => `
    <div class="activity-item">
      <div class="activity-icon income" style="background:rgba(99,102,241,0.12);color:#6366F1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </div>
      <div class="activity-info">
        <span class="activity-desc">${escHtml(a.patient)} — ${escHtml(a.type)}</span>
        <span class="activity-date">${escHtml(a.note || '')}</span>
      </div>
      <span class="activity-amount" style="color:${a.datetime.startsWith(today) ? '#6366F1' : 'var(--c-text-secondary)'}">${a.datetime.startsWith(today) ? 'Hoy ' + a.datetime.slice(11, 16) : formatAppointment(a.datetime)}</span>
    </div>`).join('');
}

async function init() {
  try {
    [current, previous] = await Promise.all([fetchSummary(thisYear), fetchSummary(thisYear - 1)]);
  } catch (err) {
    window.showToast('No se pudo cargar el resumen.', 'error');
    return;
  }
  updateDashboard(parseInt(monthFilter.value));
  updateDebts();
  renderActivity(current.activity);
  renderAppointments(current.appointments);
}

monthFilter.addEventListener('change', () => { if (current) updateDashboard(parseInt(monthFilter.value)); });
incomeFilter.addEventListener('change', () => { if (current) updateChart(parseInt(monthFilter.value)); });
init();

// 3D Tilt effect on cards
document.querySelectorAll('.dash-card, .greeting-card-3d').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const rotateX = ((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * -8;
    const rotateY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 8;
    card.style.setProperty('--rx', rotateX + 'deg');
    card.style.setProperty('--ry', rotateY + 'deg');
    card.style.setProperty('--s', '1.02');
  });
  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--s', '1');
  });
});

// --- Tour de bienvenida (driver.js) ---
function getDriverStyles() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = isDark ? 'rgba(30,41,59,0.96)' : 'rgba(255,255,255,0.96)';
  const bd = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const sb = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const sh = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)';
  const ch = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  return [
    '.driver-popover{background:' + bg + ';backdrop-filter:blur(24px);border:1px solid ' + bd + ';border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);padding:20px 22px;min-width:280px;max-width:340px;color:var(--c-text);font-family:Inter,sans-serif}',
    '.driver-popover-title{font-size:.95rem;font-weight:700;color:var(--c-text);line-height:1.4;padding-right:28px}',
    '.driver-popover-description{font-size:.82rem;color:var(--c-text-secondary);line-height:1.55;margin-top:6px}',
    '.driver-popover-description strong{color:var(--c-primary);font-weight:600}',
    '.driver-popover-footer{margin-top:14px;padding-top:12px;border-top:1px solid ' + bd + '}',
    '.driver-popover-progress-text{font-size:.7rem;color:var(--c-text-light);font-weight:500}',
    '.driver-popover-footer-btn{background:var(--c-primary);color:#fff;border:none;border-radius:8px;padding:7px 16px;font-size:.78rem;font-weight:600;cursor:pointer;transition:all .15s;font-family:Inter;text-shadow:none}',
    '.driver-popover-footer-btn:hover{filter:brightness(1.15)}',
    '.driver-popover-navigation-btns .driver-popover-footer-btn:first-child{background:' + sb + ';color:var(--c-text-secondary);border:1px solid ' + bd + '}',
    '.driver-popover-navigation-btns .driver-popover-footer-btn:first-child:hover{background:' + sh + '}',
    '.driver-popover-close-btn{color:var(--c-text-light);top:6px;right:8px;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:300;transition:all .15s}',
    '.driver-popover-close-btn:hover{color:var(--c-text);background:' + ch + '}',
    '.driver-popover-arrow{border-color:' + bg + '}',
  ].join(' ');
}

function startTour() {
  const driverFn = window.driver && window.driver.js && window.driver.js.driver;
  if (!driverFn) return;
  const style = document.createElement('style');
  style.textContent = getDriverStyles();
  document.head.appendChild(style);
  const pick = (sel) => document.querySelector(sel) || undefined;
  const steps = [
    { popover: { title: 'Bienvenido a DentFinance', description: 'Te guiaremos por el panel y las opciones del menú lateral para que empieces a gestionar tu clínica dental.', showButtons: ['next'] } },
    { element: pick('.greeting-card-3d'), popover: { title: 'Panel principal', description: 'Aquí ves tu saludo, la fecha y el filtro por mes. Desde aquí controlas todo tu negocio.', side: 'bottom', align: 'center' } },
    { element: pick('#nav-ajustes'), popover: { title: 'Ajustes — Primero lo primero', description: 'En <strong>Ajustes</strong> configuras el nombre de tu clínica y revisas el catálogo de servicios por especialidad, con sus precios.', side: 'right', align: 'center' } },
    { element: pick('.dash-cards'), popover: { title: 'Resumen financiero', description: 'Ganancia neta (cobrado − costos − gastos), gastos del mes y deudas pendientes.', side: 'bottom', align: 'center' } },
    { element: pick('#nav-gastos'), popover: { title: 'Gastos', description: 'Desde <strong>Gastos</strong> registras materiales, alquiler, sueldos. Cada gasto puede llevar comprobante.', side: 'right', align: 'center' } },
    { element: pick('.dash-grid-2'), popover: { title: 'Gráficos y actividad', description: 'El gráfico compara ingresos entre Clínica y Externo. La actividad reciente muestra los últimos movimientos.', side: 'top', align: 'center' } },
    { element: pick('#nav-tratamiento'), popover: { title: 'Tratamientos', description: 'En <strong>Tratamientos</strong> registras paciente, servicio, montos, varios gastos asociados y la próxima cita. El saldo pendiente pasa solo a Deudas.', side: 'right', align: 'center' } },
    { element: pick('#apptSection'), popover: { title: 'Próximas citas', description: 'Aquí aparecen las citas que programes al registrar un tratamiento.', side: 'top', align: 'center' } },
    { element: pick('#nav-deudas'), popover: { title: 'Deudas', description: 'En <strong>Deudas</strong> controlas lo que te deben (Clínica y Externo). Marca como pagado, revisa vencidos y exporta a PDF.', side: 'right', align: 'center' } },
    { element: pick('.quick-grid'), popover: { title: 'Acceso rápido', description: 'También puedes acceder a cada módulo desde estas tarjetas.', side: 'top', align: 'center' } },
    { popover: { title: 'Todo listo', description: 'Puedes volver a ver este tour desde <strong>Ajustes</strong>. ¡Empieza registrando tu primer tratamiento!' } },
  ];
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  driverFn({
    animate: true,
    smoothScroll: true,
    overlayColor: isDark ? '#0F172A' : '#64748B',
    overlayOpacity: isDark ? 0.55 : 0.4,
    stagePadding: 12,
    stageRadius: 14,
    showProgress: true,
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Anterior',
    doneBtnText: '¡Empezar!',
    steps,
    onDestroyed: () => localStorage.setItem('df_tour_complete', 'true'),
  }).drive();
}

if (!localStorage.getItem('df_tour_complete')) setTimeout(startTour, 800);
