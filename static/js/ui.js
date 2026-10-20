// Utilidades de interfaz compartidas: paginación, comprobantes y reportes PDF.

const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>';

export function paginationHtml(page, totalPages, extraAttr = '') {
  if (totalPages <= 1) return '';
  let html = '<div class="pagination"' + extraAttr + '>';
  if (page > 1) html += `<button class="pag-btn" data-page="${page - 1}">${ICON_PREV} Anterior</button>`;
  for (let p = 1; p <= totalPages; p++) html += `<button class="pag-btn${p === page ? ' active' : ''}" data-page="${p}">${p}</button>`;
  if (page < totalPages) html += `<button class="pag-btn" data-page="${page + 1}">Siguiente ${ICON_NEXT}</button>`;
  return html + '</div>';
}

export async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
  const ratio = Math.min(1, 1200 / img.width, 1200 / img.height);
  const w = Math.round(img.width * ratio), h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.7));
  URL.revokeObjectURL(url);
  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

// Conecta un bloque .voucher-upload (input, vista previa y botón eliminar).
export function setupVoucherUpload({ input, preview, area, content, clear }) {
  function reset() {
    input.value = '';
    preview.classList.remove('show');
    preview.src = '';
    content.classList.remove('hidden');
    clear.classList.add('hidden');
    const text = area.querySelector('.voucher-text');
    if (text) text.textContent = 'Subir Comprobante';
  }
  input.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (evt) => { preview.src = evt.target.result; preview.classList.add('show'); };
      reader.readAsDataURL(file);
      content.classList.add('hidden');
    }
    clear.classList.remove('hidden');
    const text = area.querySelector('.voucher-text');
    if (text) text.textContent = file.name;
  });
  clear.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); reset(); });
  return { reset, file: () => input.files?.[0] || null };
}

// Muestra el comprobante en el modal de detalle (imagen o enlace a PDF).
export function showVoucherIn(field, img, url) {
  const errEl = field.querySelector('.dtl-voucher-err');
  let link = field.querySelector('.dtl-voucher-link');
  if (!url) { field.style.display = 'none'; return; }
  field.style.display = '';
  if (errEl) errEl.style.display = 'none';
  if (/\.pdf$/i.test(url)) {
    img.style.display = 'none';
    if (!link) {
      link = document.createElement('a');
      link.className = 'dtl-voucher-link';
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Abrir comprobante (PDF)';
      link.style.cssText = 'display:inline-block;padding:0.75rem;color:var(--c-primary);font-weight:600;font-size:0.82rem';
      img.parentElement.appendChild(link);
    }
    link.href = url;
    link.style.display = '';
    return;
  }
  if (link) link.style.display = 'none';
  img.style.display = '';
  img.onerror = () => { img.style.display = 'none'; if (errEl) errEl.style.display = ''; };
  img.src = url;
}

const LOGO = '<svg class="print-logo" viewBox="0 0 128 128" width="36" height="36"><rect width="128" height="128" rx="28" fill="#0D9488"/><path d="M64 28c-21 0-32 11-32 30 0 19 4 40 10 54 2 6 5 16 11 16 3 0 6-2 9-4l2-2 2 2c3 2 6 4 9 4 6 0 9-10 11-16 6-14 10-35 10-54 0-19-11-30-32-30z" fill="#fff"/><path d="M50 44c5-4 10-6 14-6s9 2 14 6" fill="none" stroke="#0D9488" stroke-width="4" stroke-linecap="round"/></svg>';

// Genera el reporte imprimible en #printArea y abre el diálogo de impresión.
export function printReport({ title, period, summary, head, rows, foot }) {
  const now = new Date();
  const printArea = document.getElementById('printArea');
  printArea.innerHTML = `
    <div class="print-header">
      <div class="print-brand">
        ${LOGO}
        <div>
          <div class="print-brand-name">DentFinance</div>
          <div class="print-brand-tag">Sistema de Gestión Dental</div>
        </div>
      </div>
      <div class="print-title-block">
        <h1 class="print-title">${title}</h1>
        <p class="print-period">${period} · ${now.getFullYear()}</p>
      </div>
      <div class="print-meta">
        <span>Generado: ${now.toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <span>${now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
    <div class="print-summary">
      ${summary.map(([label, value]) => `<div class="print-summary-item"><span class="print-summary-label">${label}</span><span class="print-summary-value">${value}</span></div>`).join('')}
    </div>
    <table class="print-table">
      <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>${foot || ''}</tfoot>
    </table>
    <div class="print-footer">
      <p>DentFinance © ${now.getFullYear()} — Reporte generado automáticamente</p>
    </div>
  `;
  printArea.classList.add('print-active');
  window.print();
  setTimeout(() => {
    printArea.classList.remove('print-active');
    printArea.innerHTML = '';
  }, 1000);
}
