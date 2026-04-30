/* app.js — Bootstrap and routing with proper session restoration, reset handling, notifications, and mobile sidebar */
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
    
    // Store current view in sessionStorage (but not for check-in pages or reset)
    if (view !== 'stu-checkin' && view !== 'biometric-reset') {
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
        if (title) title.textContent = '🔐 Admin Portal'; 
        if (sub) sub.textContent = 'Sign in with your admin credentials'; 
      } else { 
        if (setup) setup.style.display = 'block'; 
        if (login) login.style.display = 'none'; 
        if (title) title.textContent = '🔐 Create Admin Account'; 
        if (sub) sub.textContent = 'First-time setup — this form only appears once.'; 
      }
    } catch { 
      if (setup) setup.style.display = 'none'; 
      if (login) login.style.display = 'block'; 
    }
  }

  // ==================== TOGGLE SIDEBAR (GLOBAL FUNCTION) ====================
  function toggleSidebar() {
    console.log('[APP] toggleSidebar called');
    const sidebar = document.querySelector('.dashboard-grid .sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('open');
      localStorage.setItem('sidebar_open', sidebar.classList.contains('open'));
    }
  }

  function closeSidebar() {
    const sidebar = document.querySelector('.dashboard-grid .sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
    }
  }

  // ==================== CREATE OVERLAY ====================
  function createOverlay() {
    if (!document.querySelector('.sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.onclick = closeSidebar;
      document.body.appendChild(overlay);
      console.log('[APP] Overlay created');
    }
  }

  // ==================== ACTIVATE FUNCTIONS ====================
  async function activateAdmin(user) {
    console.log('[APP] Activating admin:', user.role);
    
    createOverlay();
    
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); 
      if (el) el.textContent = user.name || 'Administrator';
      goTo('sadmin');
      
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
    
    createOverlay();
    
    const isTA = user.role === 'ta';
    const tbName = document.getElementById('lec-tb-name');
    const tbTitle = document.getElementById('lec-tb-title');
    const lecAvatar = document.getElementById('lec-avatar');
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarDept = document.getElementById('sidebar-dept');
    
    if (tbName) tbName.textContent = user.name || user.email;
    if (tbTitle) tbTitle.textContent = isTA ? '👥 Teaching Assistant Dashboard' : '📚 My Courses';
    if (lecAvatar) lecAvatar.textContent = isTA ? '👥' : '👨‍🏫';
    if (sidebarName) sidebarName.textContent = user.name || (isTA ? 'Teaching Assistant' : 'Lecturer');
    if (sidebarDept) sidebarDept.textContent = user.department || '';
    
    const taTabNav = document.getElementById('ta-tab-nav');
    if (taTabNav) {
      taTabNav.style.display = isTA ? 'none' : 'flex';
    }
    
    goTo('lecturer');
    
    let attempts = 0;
    const waitForLEC = setInterval(() => {
      attempts++;
      if (typeof LEC !== 'undefined' && LEC.resetForm) {
        clearInterval(waitForLEC);
        LEC.resetForm();
      } else if (attempts >= 20) {
        clearInterval(waitForLEC);
        console.error('[APP] LEC failed to load');
      }
    }, 200);
  }

  async function activateStudent(user) {
    console.log('[APP] Activating student:', user.name);
    
    createOverlay();
    
    const nameEl = document.getElementById('student-dash-name');
    const avatarEl = document.getElementById('student-avatar');
    const titleEl = document.getElementById('student-dash-title');
    
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (avatarEl) avatarEl.textContent = '🎓';
    if (titleEl) titleEl.textContent = '📊 Student Dashboard';
    
    goTo('student-dashboard');
    
    if (typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.init) {
      STUDENT_DASH.init();
    }
  }

  // ==================== SESSION RESTORATION ====================
  async function restoreSession() {
    try {
      const saved = AUTH.getSession();
      if (saved) {
        if (saved.expiresAt && saved.expiresAt < Date.now()) {
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
    }
    return false;
  }

  // ==================== QR CODE & HASH HANDLING ====================
  async function handleQRCode() {
    try {
      const params = new URLSearchParams(location.search);
      const ci = params.get('ci');
      
      if (ci && !isProcessingQR) {
        isProcessingQR = true;
        goTo('stu-checkin');
        if (typeof STU !== 'undefined' && STU.init) {
          await STU.init(ci);
        }
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
      const urlParams = new URLSearchParams(window.location.search);
      const resetParam = urlParams.get('reset');
      
      if (resetParam) {
        goTo('biometric-reset');
        if (typeof RESET !== 'undefined' && RESET.init) {
          await RESET.init();
        }
        return true;
      }
      
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

  // ==================== BOOT APPLICATION ====================
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
    
    // Create overlay for sidebar
    createOverlay();
    
    // PRIORITY 0: Check for reset parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const resetParam = urlParams.get('reset');
    
    if (resetParam) {
      goTo('biometric-reset');
      if (typeof RESET !== 'undefined' && RESET.init) {
        await RESET.init();
      }
      return;
    }
    
    // PRIORITY 1: Check for QR code
    const qrHandled = await handleQRCode();
    if (qrHandled) return;
    
    // PRIORITY 2: Check for hash routes
    const hashHandled = await handleHashRoutes();
    if (hashHandled) return;
    
    // PRIORITY 3: Restore existing session
    const sessionRestored = await restoreSession();
    if (sessionRestored) return;
    
    // PRIORITY 4: Go to landing page
    goTo('landing');
  }

  // Handle page refresh
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      boot();
    }
  });

  window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset')) {
      goTo('biometric-reset');
      if (typeof RESET !== 'undefined' && RESET.init) {
        RESET.init();
      }
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

  // ==================== PUBLIC API ====================
  return { 
    goTo, 
    activateAdmin, 
    activateLecturer, 
    activateStudent, 
    _refreshAdminLogin,
    toggleSidebar,
    closeSidebar
  };
})();
