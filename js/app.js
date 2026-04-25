/* app.js — Bootstrap and routing with proper session restoration */
'use strict';

const APP = (() => {
  // Track if we're already processing a QR code
  let isProcessingQR = false;
  
  function goTo(view) {
    console.log('[APP] Navigating to view:', view);
    
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    // Show the requested view
    const el = document.getElementById('view-' + view);
    if (el) {
      el.classList.add('active');
    } else {
      document.getElementById('view-landing')?.classList.add('active');
      view = 'landing';
    }
    
    window.scrollTo(0, 0);
    
    // Store current view in sessionStorage (but not for check-in pages)
    if (view !== 'stu-checkin') {
      sessionStorage.setItem('current_view', view);
    }
    
    if (view === 'admin-login') _refreshAdminLogin();
  }

  async function _refreshAdminLogin() {
    const setup = document.getElementById('al-setup'), login = document.getElementById('al-login'), 
          title = document.getElementById('al-title'), sub = document.getElementById('al-sub');
    try {
      const exists = await DB.SA.exists();
      if (exists) { 
        if (setup) setup.style.display = 'none'; 
        if (login) login.style.display = 'block'; 
        if (title) title.textContent = 'Admin Portal'; 
        if (sub) sub.textContent = 'Sign in with your admin credentials'; 
      } else { 
        if (setup) setup.style.display = 'block'; 
        if (login) login.style.display = 'none'; 
        if (title) title.textContent = 'Create Admin Account'; 
        if (sub) sub.textContent = 'First-time setup — this form only appears once.'; 
      }
    } catch { 
      if (setup) setup.style.display = 'none'; 
      if (login) login.style.display = 'block'; 
    }
  }

  async function activateAdmin(user) {
    console.log('[APP] Activating admin:', user.role);
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); 
      if (el) el.textContent = user.name || 'Administrator';
      goTo('sadmin');
      try { 
        const cas = await DB.CA.getAll(); 
        const dot = document.getElementById('cadm-dot'); 
        if (dot) dot.style.display = cas.some(c => c.status === 'pending') ? 'inline-block' : 'none'; 
      } catch {}
      if (typeof SADM !== 'undefined' && SADM.tab) {
        SADM.tab('ids');
      }
    } else if (user.role === 'coAdmin') {
      const el = document.getElementById('cadm-tb-name'); 
      if (el) el.textContent = user.name || 'Co-Admin';
      goTo('cadmin');
      if (typeof CADM !== 'undefined' && CADM.tab) {
        CADM.tab('ids');
      }
    }
  }

  async function activateLecturer(user) {
    console.log('[APP] Activating lecturer/TA:', user.role);
    const isTA = user.role === 'ta';
    const tbName = document.getElementById('lec-tb-name');
    const tbTitle = document.getElementById('lec-tb-title');
    const pill = document.getElementById('lec-role-pill');
    const taTab = document.getElementById('ta-tab');
    const lecnameEl = document.getElementById('l-lecname');
    
    if (tbName) tbName.textContent = user.name || user.email;
    if (tbTitle) tbTitle.textContent = isTA ? 'Teaching Assistant Dashboard' : 'Lecturer Dashboard';
    if (pill) { 
      pill.textContent = isTA ? 'Teaching Assistant' : 'Lecturer'; 
      pill.className = isTA ? 'rpill rpill-teal' : 'rpill rpill-ug'; 
    }
    if (taTab) taTab.style.display = isTA ? 'none' : 'inline-block';
    if (lecnameEl) lecnameEl.value = user.name || user.email;
    
    // Clear any QR parameters from URL
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('lecturer');
    
    // Wait for LEC to be fully loaded
    let attempts = 0;
    const maxAttempts = 20;
    const waitForLEC = setInterval(() => {
      attempts++;
      if (typeof LEC !== 'undefined' && LEC.resetForm) {
        clearInterval(waitForLEC);
        console.log('[APP] LEC ready, initializing dashboard');
        LEC.resetForm();
      } else if (attempts >= maxAttempts) {
        clearInterval(waitForLEC);
        console.error('[APP] LEC failed to load after', maxAttempts, 'attempts');
      } else {
        console.log('[APP] Waiting for LEC to load... attempt', attempts);
      }
    }, 200);
  }

  async function activateStudent(user) {
    console.log('[APP] Activating student:', user.name);
    const nameEl = document.getElementById('student-dash-name'); 
    if (nameEl) nameEl.textContent = user.name || user.email;
    
    // Clear any QR code parameters from URL
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('student-dashboard');
    if (typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.init) {
      STUDENT_DASH.init();
    } else {
      console.warn('[APP] STUDENT_DASH not loaded');
      setTimeout(() => {
        if (typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.init) {
          STUDENT_DASH.init();
        }
      }, 200);
    }
  }

  async function restoreSession() {
    try {
      const saved = AUTH.getSession();
      if (saved) {
        console.log('[APP] Found saved session for role:', saved.role);
        
        if (saved.expiresAt && saved.expiresAt < Date.now()) {
          console.log('[APP] Session expired, clearing');
          AUTH.clearSession();
          return false;
        }
        
        if (saved.role === 'superAdmin' || saved.role === 'coAdmin') { 
          await activateAdmin(saved); 
          return true;
        }
        if (saved.role === 'lecturer' || saved.role === 'ta') { 
          await activateLecturer(saved); 
          return true;
        }
        if (saved.role === 'student') { 
          await activateStudent(saved); 
          return true;
        }
      }
    } catch (e) { 
      console.warn('[APP] Session restore error:', e);
      try { 
        if (typeof AUTH !== 'undefined' && AUTH.clearSession) {
          AUTH.clearSession(); 
        }
      } catch { } 
    }
    return false;
  }

  async function handleQRCode() {
    try {
      const params = new URLSearchParams(location.search);
      const ci = params.get('ci');
      
      if (ci && !isProcessingQR) {
        isProcessingQR = true;
        console.log('[APP] QR code detected, showing check-in');
        
        goTo('stu-checkin');
        
        if (typeof STU !== 'undefined' && STU.init) {
          await STU.init(ci);
        }
        
        // Clean URL without reloading page
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
        
        isProcessingQR = false;
        return true;
      }
    } catch (e) { 
      console.warn('QR param check error:', e);
      isProcessingQR = false;
    }
    return false;
  }

  async function handleHashRoutes() {
    try {
      if (location.hash === '#ta-signup') { 
        const params = new URLSearchParams(location.search);
        const code = params.get('code'); 
        if (code) { 
          const el = document.getElementById('ts-code'); 
          if (el) el.value = code.toUpperCase(); 
        } 
        goTo('ta-signup'); 
        return true;
      }
      
      if (location.hash === '#lec-signup') { 
        goTo('lec-signup'); 
        return true;
      }
    } catch (e) { 
      console.warn('Hash check error:', e);
    }
    return false;
  }

  async function boot() {
    console.log('[APP] Booting application...');
    
    // Initialize theme
    try { 
      if (typeof THEME !== 'undefined' && THEME.init) {
        THEME.init(); 
      }
    } catch (e) { console.warn('Theme init error:', e); }
    
    // Register service worker
    try { 
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => { }); 
      }
    } catch { }
    
    // Setup offline detection
    try { 
      const offBar = document.getElementById('offline-bar'); 
      if (offBar) { 
        window.addEventListener('online', () => { offBar.style.display = 'none'; }); 
        window.addEventListener('offline', () => { offBar.style.display = 'block'; }); 
        if (!navigator.onLine) offBar.style.display = 'block'; 
      } 
    } catch { }
    
    // Fill department selects
    try { 
      ['ls-dept', 'ca-dept'].forEach(id => {
        if (typeof UI !== 'undefined' && UI.fillDeptSelect) {
          UI.fillDeptSelect(id);
        }
      });
    } catch { }
    
    // PRIORITY 1: Check for QR code (highest priority)
    const qrHandled = await handleQRCode();
    if (qrHandled) return;
    
    // PRIORITY 2: Check for hash routes
    const hashHandled = await handleHashRoutes();
    if (hashHandled) return;
    
    // PRIORITY 3: Restore existing session
    const sessionRestored = await restoreSession();
    if (sessionRestored) return;
    
    // PRIORITY 4: Go to landing page
    console.log('[APP] No valid session, showing landing');
    goTo('landing');
  }

  // Handle page refresh
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      console.log('[APP] Page restored from bfcache');
      boot();
    }
  });

  // Start the application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { 
      boot().catch(e => {
        console.error('[APP] Boot error:', e);
        goTo('landing');
      });
    });
  } else {
    boot().catch(e => {
      console.error('[APP] Boot error:', e);
      goTo('landing');
    });
  }

  // Public API
  return { 
    goTo, 
    activateAdmin, 
    activateLecturer, 
    activateStudent, 
    _refreshAdminLogin 
  };
})();
