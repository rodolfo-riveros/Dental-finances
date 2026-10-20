// Comportamiento común del layout: toasts, confirmación, perfil, tema y notificaciones.
(function () {
  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function getCookie(name) {
    const match = document.cookie.split('; ').find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  }

  async function post(url, body) {
    const resp = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
      body: JSON.stringify(body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Error ' + resp.status);
    return data;
  }

  // Toast system
  const toastContainer = document.getElementById('toastContainer');

  window.showToast = function (message, type = 'info', duration = 3500) {
    if (!toastContainer) return;
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/></svg>',
    };
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.innerHTML = '<div class="toast-inner"><span class="toast-icon">' + (icons[type] || icons.info) + '</span><span class="toast-msg">' + escText(message) + '</span></div>';
    toastContainer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 300);
    }, duration);
  };

  window.showConfirm = function (message, okLabel = 'Eliminar') {
    return new Promise((resolve) => {
      const existing = document.querySelector('.confirm-overlay');
      if (existing) existing.remove();
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML =
        '<div class="confirm-dialog"><div class="confirm-body"><p class="confirm-msg">' + escText(message) + '</p></div><div class="confirm-actions"><button class="confirm-btn confirm-cancel" id="confirmNo">Cancelar</button><button class="confirm-btn confirm-yes" id="confirmYes">' + escText(okLabel) + '</button></div></div>';
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('visible'));
      const done = (v) => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); resolve(v); };
      document.getElementById('confirmYes').addEventListener('click', () => done(true));
      document.getElementById('confirmNo').addEventListener('click', () => done(false));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    });
  };

  // Theme (el atributo data-theme ya se aplicó en <head>)
  function updateThemeUI(t) {
    const label = document.getElementById('dropdownThemeLabel');
    if (label) label.textContent = t === 'dark' ? 'Modo Claro' : 'Modo Oscuro';
  }
  updateThemeUI(document.documentElement.getAttribute('data-theme'));
  document.getElementById('dropdownTheme').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('df_theme', next);
    updateThemeUI(next);
  });
  window.dfUpdateThemeUI = updateThemeUI;

  // Profile
  const profileEl = document.getElementById('df-profile');
  window.dfProfile = profileEl ? JSON.parse(profileEl.textContent) : { name: 'Admin', email: '', clinic: 'Clínica Dental' };

  const dropdownMenu = document.getElementById('dropdownMenu');
  const profileModal = document.getElementById('profileModal');
  const profileFieldName = document.getElementById('profileFieldName');
  const profileFieldEmail = document.getElementById('profileFieldEmail');
  const profileFieldClinic = document.getElementById('profileFieldClinic');

  function initials(name) {
    return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'DF';
  }

  function renderProfile() {
    const p = window.dfProfile;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('profileName', p.name);
    set('profileRole', p.clinic);
    set('dropdownName', p.name);
    set('dropdownEmail', p.email);
    set('profileAvatar', initials(p.name));
    set('mobileName', p.name);
    set('mobileRole', p.clinic);
    set('mobileInitials', initials(p.name));
    set('greetingName', p.name.split(' ')[0]);
  }

  window.dfOpenProfile = function () {
    dropdownMenu.classList.remove('open');
    profileFieldName.value = window.dfProfile.name;
    profileFieldEmail.value = window.dfProfile.email;
    profileFieldClinic.value = window.dfProfile.clinic;
    profileModal.classList.add('open');
  };

  function closeProfile() { profileModal.classList.remove('open'); }

  document.getElementById('profileBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-dropdown')) dropdownMenu.classList.remove('open');
  });
  document.getElementById('profileModalClose').addEventListener('click', closeProfile);
  document.getElementById('profileCancel').addEventListener('click', closeProfile);
  profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfile(); });
  document.getElementById('dropdownEdit').addEventListener('click', window.dfOpenProfile);

  document.getElementById('profileSave').addEventListener('click', async () => {
    try {
      window.dfProfile = await post('/api/profile', {
        name: profileFieldName.value.trim(),
        email: profileFieldEmail.value.trim(),
        clinic: profileFieldClinic.value.trim(),
      });
      renderProfile();
      closeProfile();
      window.showToast('Perfil actualizado.', 'success');
    } catch (err) {
      window.showToast(err.message || 'Error al guardar el perfil.', 'error');
    }
  });

  // Logout
  window.dfLogout = async function () {
    try { await post('/api/auth/logout'); } catch (_) { /* la sesión ya no existe */ }
    window.location.href = '/';
  };
  document.getElementById('dropdownLogout').addEventListener('click', window.dfLogout);

  // Active nav
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('href') === path);
  });

  // --- Notificaciones: deudas vencidas y citas de hoy ---
  const notifDot = document.getElementById('notifDot');
  const avatarNotifDot = document.getElementById('avatarNotifDot');
  const notifList = document.getElementById('notifList');
  const warnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>';
  const calIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--c-primary)"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';

  function notifItems(data) {
    const items = [];
    data.appointmentsToday.forEach(a => items.push(
      '<div class="dropdown-notif-item">' + calIcon + '<div class="dropdown-notif-item-info"><span class="dropdown-notif-item-name">Cita ' + escText(a.time) + ' — ' + escText(a.patient) + '</span><span class="dropdown-notif-item-detail" style="font-size:0.65rem;color:var(--c-text-light)">' + escText(a.type) + '</span></div></div>'
    ));
    data.overdue.forEach(d => items.push(
      '<div class="dropdown-notif-item">' + warnIcon + '<div class="dropdown-notif-item-info"><span class="dropdown-notif-item-name">' + escText(d.patient || '—') + '</span><span class="dropdown-notif-item-detail" style="font-size:0.65rem;color:var(--c-text-light)">' + escText(d.description || '') + '</span></div><span class="dropdown-notif-item-amount">S/ ' + (Number(d.amount) || 0).toLocaleString('es-PE') + '</span></div>'
    ));
    return items;
  }

  async function checkNotifications() {
    try {
      const resp = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!resp.ok) return;
      const data = await resp.json();
      const items = notifItems(data);
      const has = items.length > 0;
      notifDot.classList.toggle('hidden', !has);
      avatarNotifDot.classList.toggle('hidden', !has);
      notifList.innerHTML = has ? items.slice(0, 6).join('') : '<div class="dropdown-notif-empty">Sin notificaciones</div>';
      if (items.length > 6) {
        notifList.insertAdjacentHTML('beforeend', '<a class="dropdown-notif-item" href="/deudas" style="justify-content:center;color:var(--c-text-light);font-size:0.68rem">+ ' + (items.length - 6) + ' más</a>');
      }
      document.dispatchEvent(new CustomEvent('df-notifications', { detail: { data, items } }));
    } catch (err) {
      console.warn('Error al cargar notificaciones:', err);
    }
  }
  window.dfCheckNotifications = checkNotifications;
  checkNotifications();
  setInterval(checkNotifications, 300000);
})();

// --- Cambio de clínica activa (multi-clínica) ---
(function () {
  function getCookie(name) {
    const match = document.cookie.split('; ').find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1]) : '';
  }
  const active = window.dfProfile ? String(window.dfProfile.clinicId) : '';
  document.querySelectorAll('[data-clinic-switcher]').forEach(sel => {
    sel.addEventListener('change', async () => {
      if (sel.value === '__new__') {
        sel.value = active;
        window.location.href = '/ajustes#clinicas';
        return;
      }
      try {
        const resp = await fetch('/api/clinics/' + sel.value + '/activate', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }, body: '{}',
        });
        if (!resp.ok) throw new Error();
        sessionStorage.removeItem('df_overdue_notified');
        window.location.reload();
      } catch (_) {
        sel.value = active;
        window.showToast('No se pudo cambiar de clínica.', 'error');
      }
    });
  });
})();
