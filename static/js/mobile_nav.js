// Menú móvil: apertura, tema, perfil, logout y notificaciones.
(function () {
  const btn = document.getElementById('mnav-btn');
  const overlay = document.getElementById('mnav-overlay');
  const panel = document.getElementById('mnav-panel');
  const closeBtn = document.getElementById('mnav-close');
  if (!btn || !overlay) return;
  const links = overlay.querySelectorAll('.mobile-link');

  function open() {
    overlay.classList.add('open');
    panel.classList.add('open');
    btn.classList.add('hidden');
  }

  function close() {
    overlay.classList.remove('open');
    panel.classList.remove('open');
    btn.classList.remove('hidden');
  }

  btn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  links.forEach(l => l.addEventListener('click', close));

  const path = window.location.pathname;
  links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === path));

  function updateMobileThemeUI(t) {
    const sun = document.querySelector('.mobile-theme-sun');
    const moon = document.querySelector('.mobile-theme-moon');
    if (sun) sun.style.display = t === 'dark' ? 'none' : 'block';
    if (moon) moon.style.display = t === 'dark' ? 'block' : 'none';
  }
  updateMobileThemeUI(document.documentElement.getAttribute('data-theme') || 'light');

  document.getElementById('mobileThemeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('df_theme', next);
    updateMobileThemeUI(next);
    if (window.dfUpdateThemeUI) window.dfUpdateThemeUI(next);
  });

  document.getElementById('mobileEditProfile').addEventListener('click', () => {
    if (window.dfOpenProfile) window.dfOpenProfile();
    close();
  });

  document.getElementById('mobileLogout').addEventListener('click', () => {
    if (window.dfLogout) window.dfLogout();
  });

  // Notificaciones (las carga layout.js y las comparte por evento)
  const notifBtn = document.getElementById('mobileNotifToggle');
  const notifPanel = document.getElementById('mobileNotifPanel');
  const notifList = document.getElementById('mobileNotifList');
  const notifDot = document.getElementById('mobileNotifDot');
  const notifDotHeader = document.getElementById('mobileNotifDotHeader');
  const notifBadge = document.getElementById('mobileNotifBadge');

  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifPanel.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.mobile-notif-panel') && !e.target.closest('#mobileNotifToggle')) {
      notifPanel.classList.add('hidden');
    }
  });

  document.addEventListener('df-notifications', (e) => {
    const items = e.detail.items;
    const has = items.length > 0;
    notifDot.classList.toggle('hidden', !has);
    notifDotHeader.classList.toggle('hidden', !has);
    notifBadge.classList.toggle('hidden', !has);
    notifBadge.textContent = items.length;
    notifList.innerHTML = has
      ? items.slice(0, 6).join('').replace(/dropdown-notif-/g, 'mobile-notif-')
      : '<div class="mobile-notif-empty">Sin notificaciones</div>';
  });
})();
