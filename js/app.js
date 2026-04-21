/* app.js — Bootstrap and routing */
'use strict';

const APP = (() => {
  function goTo(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.add('active');
    else document.getElementById('view-landing')?.classList.add('active');
    window.scrollTo(0, 0);
    if (view === 'admin-login') _refreshAdminLogin();
  }

  async function _refreshAdminLogin() {
    const setup = document.getElementById('al-setup'), login = document.getElementById('al-login'), title = document.getElementById('al-title'), sub = document.getElementById('al-sub');
    try {
      const exists = await DB.SA.exists();
      if (exists) { if (setup) setup.style.display = 'none'; if (login) login.style.display = 'block'; if (title) title.textContent = 'Admin Portal'; if (sub) sub.textContent = 'Sign in with your admin credentials'; }
      else { if (setup) setup.style.display = 'block'; if (login) login.style.display = 'none'; if (title) title.textContent = 'Create Admin Account'; if (sub) sub.textContent = 'First-time setup — this form only appears once.'; }
    } catch { if (setup) setup.style.display = 'none'; if (login) login.style.display = 'block'; }
  }

  async function activateAdmin(user) {
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); if (el) el.textContent = user.name || 'Administrator';
      goTo('sadmin');
      try { const cas = await DB.CA.getAll(); const dot = document.getElementById('cadm-dot'); if (dot) dot.style.display = cas.some(c => c.status === 'pending') ? 'inline-block' : 'none'; } catch {}
      SADM.tab('ids');
    } else if (user.role === 'coAdmin') {
      const el = document.getElementById('cadm-tb-name'); if (el) el.textContent = user.name || 'Co-Admin';
      goTo('cadmin');
      CADM.tab('ids');
    }
  }

  async function activateLecturer(user) {
    const isTA = user.role === 'ta';
    const tbName = document.getElementById('lec-tb-name'), tbTitle = document.getElementById('lec-tb-title'), pill = document.getElementById('lec-role-pill');
    if (tbName) tbName.textContent = user.name || user.email;
    if (tbTitle) tbTitle.textContent = isTA ? 'Teaching Assistant Dashboard' : 'Lecturer Dashboard';
    if (pill) { pill.textContent = isTA ? 'Teaching Assistant' : 'Lecturer'; pill.className = isTA ? 'rpill rpill-teal' : 'rpill rpill-ug'; }
    const taTab = document.getElementById('ta-tab'); if (taTab) taTab.style.display = isTA ? 'none' : 'inline-block';
    const lecnameEl = document.getElementById('l-lecname'); if (lecnameEl) lecnameEl.value = user.name || user.email;
    const lecidEl = document.getElementById('lecid-val'); if (lecidEl) lecidEl.textContent = user.lecId || (isTA ? 'Teaching Assistant' : '—');
    goTo('lecturer');
    LEC.resetForm();
  }

  async function activateStudent(user) {
    const nameEl = document.getElementById('student-dash-name'); if (nameEl) nameEl.textContent = user.name || user.email;
    goTo('student-dashboard');
    if (typeof STUDENT_DASH !== 'undefined') STUDENT_DASH.init();
    else goTo('landing');
  }

  async function boot() {
    try { THEME.init(); } catch (e) { }
    try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { }); } catch { }
    try { const offBar = document.getElementById('offline-bar'); if (offBar) { window.addEventListener('online', () => { offBar.style.display = 'none'; }); window.addEventListener('offline', () => { offBar.style.display = 'block'; }); if (!navigator.onLine) offBar.style.display = 'block'; } } catch { }
    try { ['ls-dept', 'ca-dept'].forEach(id => UI.fillDeptSelect(id)); } catch { }
    try {
      const params = new URLSearchParams(location.search);
      const ci = params.get('ci');
      if (ci) { goTo('stu-checkin'); await STU.init(ci); return; }
      if (location.hash === '#ta-signup') { const code = params.get('code'); if (code) { const el = document.getElementById('ts-code'); if (el) el.value = code.toUpperCase(); } goTo('ta-signup'); return; }
      if (location.hash === '#lec-signup') { goTo('lec-signup'); return; }
      if (location.hash === '#stu-scan') { goTo('stu-scan'); return; }
    } catch (e) { }
    try {
      const saved = AUTH.getSession();
      if (saved) {
        if (saved.role === 'superAdmin' || saved.role === 'coAdmin') { await activateAdmin(saved); return; }
        if (saved.role === 'lecturer' || saved.role === 'ta') { await activateLecturer(saved); return; }
        if (saved.role === 'student') { await activateStudent(saved); return; }
      }
    } catch (e) { try { AUTH.clearSession(); } catch { } }
    goTo('landing');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { boot().catch(e => goTo('landing')); });
  else boot().catch(e => goTo('landing'));

  return { goTo, activateAdmin, activateLecturer, activateStudent, _refreshAdminLogin };
})();
