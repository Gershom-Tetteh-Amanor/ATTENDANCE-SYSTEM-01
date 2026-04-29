/* app.js — Bootstrap and routing with proper session restoration, reset handling, and notifications */
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
    
    // Update sidebar and UI based on role
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); 
      if (el) el.textContent = user.name || 'Administrator';
      
      // Update sidebar user info
      const sidebarName = document.querySelector('#view-sadmin .sidebar-header h3');
      const sidebarRole = document.querySelector('#view-sadmin .sidebar-header p');
      const userAvatar = document.querySelector('#view-sadmin .user-avatar');
      if (sidebarName) sidebarName.textContent = user.name || 'System Admin';
      if (sidebarRole) sidebarRole.textContent = 'Administrator';
      if (userAvatar) userAvatar.textContent = '🔐';
      
      goTo('sadmin');
      
      // Initialize notifications for admin
      if (typeof NOTIFICATIONS !== 'undefined') {
        await NOTIFICATIONS.init({ ...user, role: 'superAdmin', id: 'superadmin' });
        NOTIFICATIONS.requestPermission();
      }
      
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
      
      // Update sidebar user info
      const sidebarName = document.querySelector('#view-cadmin .sidebar-header h3');
      const sidebarDept = document.querySelector('#view-cadmin .sidebar-header p');
      const userAvatar = document.querySelector('#view-cadmin .user-avatar');
      if (sidebarName) sidebarName.textContent = user.name || 'Co-Admin';
      if (sidebarDept) sidebarDept.textContent = user.department || 'Department';
      if (userAvatar) userAvatar.textContent = '🤝';
      
      goTo('cadmin');
      
      // Initialize notifications for co-admin
      if (typeof NOTIFICATIONS !== 'undefined') {
        await NOTIFICATIONS.init({ ...user, role: 'coAdmin', id: user.id });
        NOTIFICATIONS.requestPermission();
      }
      
      if (typeof CADM !== 'undefined' && CADM.tab) {
        CADM.tab('ids');
      }
    }
    
    // Initialize user account system for admin
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
      USER_ACCOUNT.addAccountButton();
    }
  }

  async function activateLecturer(user) {
    console.log('[APP] Activating lecturer/TA:', user.role);
    const isTA = user.role === 'ta';
    const tbName = document.getElementById('lec-tb-name');
    const tbTitle = document.getElementById('lec-tb-title');
    const lecAvatar = document.getElementById('lec-avatar');
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarDept = document.getElementById('sidebar-dept');
    
    if (tbName) tbName.textContent = user.name || user.email;
    if (tbTitle) tbTitle.textContent = isTA ? 'Teaching Assistant Dashboard' : 'My Courses';
    if (lecAvatar) lecAvatar.textContent = isTA ? '👥' : '👨‍🏫';
    if (sidebarName) sidebarName.textContent = user.name || (isTA ? 'Teaching Assistant' : 'Lecturer');
    if (sidebarDept) sidebarDept.textContent = user.department || '';
    
    // Show/hide TA tab in sidebar
    const taTabNav = document.getElementById('ta-tab-nav');
    if (taTabNav) {
      taTabNav.style.display = isTA ? 'none' : 'flex';
    }
    
    // Clear any QR parameters from URL
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('lecturer');
    
    // Initialize user account system
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
      USER_ACCOUNT.addAccountButton();
    }
    
    // Initialize notifications for lecturer/TA
    if (typeof NOTIFICATIONS !== 'undefined') {
      await NOTIFICATIONS.init({ ...user, role: user.role, id: user.id });
      NOTIFICATIONS.requestPermission();
    }
    
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
        // Fallback: try to load dashboard stats directly
        if (typeof LEC !== 'undefined' && LEC.loadDashboardStats) {
          LEC.loadDashboardStats();
          LEC.switchTab('mycourses');
        }
      } else {
        console.log('[APP] Waiting for LEC to load... attempt', attempts);
      }
    }, 200);
  }

  async function activateStudent(user) {
    console.log('[APP] Activating student:', user.name);
    const nameEl = document.getElementById('student-dash-name');
    const avatarEl = document.getElementById('student-avatar');
    const titleEl = document.getElementById('student-dash-title');
    
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (avatarEl) avatarEl.textContent = '🎓';
    if (titleEl) titleEl.textContent = 'Student Dashboard';
    
    // Clear any QR code parameters from URL
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('student-dashboard');
    
    // Initialize user account system
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
      USER_ACCOUNT.addAccountButton();
    }
    
    // Initialize notifications for student
    if (typeof NOTIFICATIONS !== 'undefined') {
      await NOTIFICATIONS.init({ ...user, role: 'student', id: user.studentId });
      NOTIFICATIONS.requestPermission();
    }
    
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
      // Check for reset parameter in URL (highest priority for dedicated reset page)
      const urlParams = new URLSearchParams(window.location.search);
      const resetParam = urlParams.get('reset');
      
      if (resetParam) {
        console.log('[APP] Reset parameter detected, showing biometric reset page');
        goTo('biometric-reset');
        if (typeof RESET !== 'undefined' && RESET.init) {
          await RESET.init();
        } else {
          console.error('[APP] RESET module not loaded');
          const container = document.getElementById('view-biometric-reset');
          if (container) {
            container.innerHTML = '<div class="pg"><div class="inner-panel"><div class="alert alert-err">Reset module not loaded. Please refresh the page.</div></div></div>';
          }
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

  // Add test notification (for development)
  async function addTestNotification() {
    if (typeof NOTIFICATIONS !== 'undefined') {
      await NOTIFICATIONS.add({
        title: 'Welcome to UG QR Attendance!',
        message: 'You have successfully logged in. This is a test notification.',
        type: 'success',
        link: null
      });
      
      // Add a warning notification after 5 seconds (demo)
      setTimeout(async () => {
        await NOTIFICATIONS.add({
          title: 'Reminder',
          message: 'Don\'t forget to start your session before students check in.',
          type: 'warning',
          link: null
        });
      }, 5000);
    }
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
    
    // PRIORITY 0: Check for reset parameter in URL (dedicated reset page)
    const urlParams = new URLSearchParams(window.location.search);
    const resetParam = urlParams.get('reset');
    
    if (resetParam) {
      console.log('[APP] Reset parameter detected in boot, showing biometric reset page');
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
    if (sessionRestored) {
      // Add a test notification after successful login (optional, remove in production)
      // setTimeout(() => addTestNotification(), 2000);
      return;
    }
    
    // PRIORITY 4: Go to landing page
    console.log('[APP] No valid session, showing landing');
    goTo('landing');
  }

  // Close notification panel when clicking outside
  function setupGlobalClickHandler() {
    document.addEventListener('click', function(event) {
      const panel = document.querySelector('.notification-panel');
      const bell = document.querySelector('.notification-bell');
      
      if (panel && panel.classList.contains('open')) {
        // Check if click is outside the panel and not on the bell
        if (!panel.contains(event.target) && !bell?.contains(event.target)) {
          panel.classList.remove('open');
        }
      }
    });
  }

  // Handle page refresh
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      console.log('[APP] Page restored from bfcache');
      boot();
    }
  });

  // Handle browser navigation (back/forward)
  window.addEventListener('popstate', () => {
    console.log('[APP] Popstate event, re-checking routes');
    // Check for reset parameter again
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset')) {
      goTo('biometric-reset');
      if (typeof RESET !== 'undefined' && RESET.init) {
        RESET.init();
      }
    }
  });

  // Setup global click handler for notifications
  setupGlobalClickHandler();

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
    _refreshAdminLogin,
    addTestNotification  // Exposed for testing
  };
})();
