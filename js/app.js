/* app.js — Bootstrap and routing - FIXED for freezing */
'use strict';

const APP = (() => {
  let isProcessingQR = false;
  let isBooting = false;  // Prevent multiple boots
  let bootComplete = false;  // Track boot status
  
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
    
    // Store current view in sessionStorage
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

  // ==================== SIDEBAR FUNCTIONS ====================
  function toggleSidebar() {
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    
    let sidebar = activeView.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) sidebar = document.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) return;
    
    const overlay = document.querySelector('.sidebar-overlay');
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('open');
    localStorage.setItem('sidebar_open', sidebar.classList.contains('open'));
  }

  function closeSidebar() {
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    
    let sidebar = activeView.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) sidebar = document.querySelector('.dashboard-grid .sidebar');
    if (sidebar) sidebar.classList.remove('open');
    
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) overlay.classList.remove('open');
    localStorage.setItem('sidebar_open', false);
  }

  function createOverlay() {
    if (!document.querySelector('.sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:999; display:none; cursor:pointer;';
      overlay.onclick = closeSidebar;
      document.body.appendChild(overlay);
    }
  }

  function setupMobileFeatures() {
    createOverlay();
    
    // Close sidebar when clicking on main content (mobile only)
    const mainContent = document.querySelector('.dashboard-grid .main-content');
    if (mainContent) {
      mainContent.removeEventListener('click', closeSidebar);
      mainContent.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
      });
    }
    
    // Handle window resize
    window.removeEventListener('resize', closeSidebar);
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeSidebar();
    });
  }

  // ==================== NOTIFICATION FUNCTIONS ====================
  function isDashboardPage() {
    const currentView = document.querySelector('.view.active');
    if (!currentView) return false;
    const dashboardViews = ['view-lecturer', 'view-sadmin', 'view-cadmin', 'view-student-dashboard'];
    return dashboardViews.some(id => currentView.id === id);
  }

  async function initNotificationsSafely(user) {
    if (!isDashboardPage()) return;
    if (typeof NOTIFICATIONS !== 'undefined' && NOTIFICATIONS.init) {
      try {
        await NOTIFICATIONS.init(user);
      } catch (err) {
        console.warn('[APP] Notification init failed:', err);
      }
    }
  }

  // ==================== ACTIVATE FUNCTIONS ====================
  async function activateAdmin(user) {
    console.log('[APP] Activating admin:', user.role);
    
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); 
      if (el) el.textContent = user.name || 'Administrator';
      
      const sidebarName = document.querySelector('#view-sadmin .sidebar-header h3');
      const sidebarRole = document.querySelector('#view-sadmin .sidebar-header p');
      if (sidebarName) sidebarName.textContent = user.name || 'System Admin';
      if (sidebarRole) sidebarRole.textContent = '🔐 Administrator';
      
      goTo('sadmin');
      
      setTimeout(() => {
        initNotificationsSafely({ ...user, role: 'superAdmin', id: 'superadmin' });
        setupMobileFeatures();
      }, 100);
      
      if (typeof USER_ACCOUNT !== 'undefined') {
        await USER_ACCOUNT.init();
      }
      
      if (typeof SADM !== 'undefined' && SADM.tab) {
        SADM.tab('ids');
      }
    } else if (user.role === 'coAdmin') {
      const el = document.getElementById('cadm-tb-name'); 
      if (el) el.textContent = user.name || 'Co-Admin';
      
      const sidebarName = document.querySelector('#view-cadmin .sidebar-header h3');
      if (sidebarName) sidebarName.textContent = user.name || 'Co-Admin';
      
      goTo('cadmin');
      
      setTimeout(() => {
        initNotificationsSafely({ ...user, role: 'coAdmin', id: user.id });
        setupMobileFeatures();
      }, 100);
      
      if (typeof USER_ACCOUNT !== 'undefined') {
        await USER_ACCOUNT.init();
      }
      
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
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarDept = document.getElementById('sidebar-dept');
    
    if (tbName) tbName.textContent = user.name || user.email;
    if (tbTitle) tbTitle.textContent = isTA ? '👥 Teaching Assistant Dashboard' : '📚 My Courses';
    if (sidebarName) sidebarName.textContent = user.name || (isTA ? 'Teaching Assistant' : 'Lecturer');
    if (sidebarDept) sidebarDept.textContent = user.department || '';
    
    const taTabNav = document.getElementById('ta-tab-nav');
    if (taTabNav) taTabNav.style.display = isTA ? 'none' : 'flex';
    
    goTo('lecturer');
    
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
    }
    
    setTimeout(() => {
      initNotificationsSafely({ ...user, role: user.role, id: user.id });
      setupMobileFeatures();
    }, 100);
    
    // Single attempt to load LEC - no infinite loop
    if (typeof LEC !== 'undefined' && LEC.resetForm) {
      setTimeout(() => {
        LEC.resetForm();
      }, 200);
    }
  }

  async function activateStudent(user) {
    console.log('[APP] Activating student:', user.name);
    
    const nameEl = document.getElementById('student-dash-name');
    const titleEl = document.getElementById('student-dash-title');
    
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (titleEl) titleEl.textContent = '📊 Student Dashboard';
    
    goTo('student-dashboard');
    
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
    }
    
    setTimeout(() => {
      initNotificationsSafely({ ...user, role: 'student', id: user.studentId });
      setupMobileFeatures();
    }, 100);
    
    if (typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.init) {
      STUDENT_DASH.init();
    }
  }

  // ==================== SESSION RESTORATION ====================
  async function restoreSession() {
    try {
      const saved = AUTH.getSession();
      if (saved) {
        console.log('[APP] Found saved session for role:', saved.role);
        
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

  // ==================== GLOBAL CLICK HANDLER ====================
  function setupGlobalClickHandler() {
    document.removeEventListener('click', handleGlobalClick);
    document.addEventListener('click', handleGlobalClick);
  }
  
  function handleGlobalClick(event) {
    // Close notification panel if open and clicking outside
    const panel = document.querySelector('.notification-panel');
    const bell = document.querySelector('.notification-bell');
    
    if (panel && panel.classList.contains('open')) {
      if (!panel.contains(event.target) && !bell?.contains(event.target)) {
        if (typeof NOTIFICATIONS !== 'undefined' && NOTIFICATIONS.closePanel) {
          NOTIFICATIONS.closePanel();
        } else if (panel) {
          panel.classList.remove('open');
        }
      }
    }
  }

  // ==================== BOOT APPLICATION ====================
  async function boot() {
    // Prevent multiple boots
    if (isBooting || bootComplete) {
      console.log('[APP] Boot already in progress or complete');
      return;
    }
    
    isBooting = true;
    console.log('[APP] Booting application...');
    
    // Initialize theme
    try { 
      if (typeof THEME !== 'undefined' && THEME.init) {
        THEME.init(); 
      }
    } catch (e) { console.warn('Theme init error:', e); }
    
    // Register service worker (don't await)
    try { 
      if ('serviceWorker' in navigator) {
        const swPath = window.location.pathname.replace(/[^/]*$/, '') + 'sw.js';
        navigator.serviceWorker.register(swPath).catch(() => { }); 
      }
    } catch { }
    
    // Setup offline detection
    try { 
      const offBar = document.getElementById('offline-bar'); 
      if (offBar) { 
        const updateOnlineStatus = () => { offBar.style.display = !navigator.onLine ? 'block' : 'none'; };
        window.addEventListener('online', updateOnlineStatus); 
        window.addEventListener('offline', updateOnlineStatus); 
        updateOnlineStatus();
      } 
    } catch { }
    
    // Fill department selects
    try { 
      if (typeof UI !== 'undefined' && UI.fillDeptSelect) {
        ['ls-dept', 'ca-dept'].forEach(id => UI.fillDeptSelect(id));
      }
    } catch { }
    
    // Create overlay for sidebar
    createOverlay();
    
    // Setup global click handler for notifications
    setupGlobalClickHandler();
    
    // Check URLs in order
    const urlParams = new URLSearchParams(window.location.search);
    const resetParam = urlParams.get('reset');
    
    if (resetParam) {
      goTo('biometric-reset');
      if (typeof RESET !== 'undefined' && RESET.init) {
        await RESET.init();
      }
      isBooting = false;
      bootComplete = true;
      return;
    }
    
    const qrHandled = await handleQRCode();
    if (qrHandled) {
      isBooting = false;
      bootComplete = true;
      return;
    }
    
    const hashHandled = await handleHashRoutes();
    if (hashHandled) {
      isBooting = false;
      bootComplete = true;
      return;
    }
    
    const sessionRestored = await restoreSession();
    if (sessionRestored) {
      isBooting = false;
      bootComplete = true;
      return;
    }
    
    goTo('landing');
    isBooting = false;
    bootComplete = true;
  }

  // Handle page refresh
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      bootComplete = false;
      isBooting = false;
      boot();
    }
  });

  // Start the application when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { 
      boot().catch(e => {
        console.error('[APP] Boot error:', e);
        goTo('landing');
        isBooting = false;
        bootComplete = true;
      });
    });
  } else {
    boot().catch(e => {
      console.error('[APP] Boot error:', e);
      goTo('landing');
      isBooting = false;
      bootComplete = true;
    });
  }

  return { 
    goTo, 
    activateAdmin, 
    activateLecturer, 
    activateStudent, 
    _refreshAdminLogin,
    toggleSidebar,
    closeSidebar,
    setupMobileFeatures
  };
})();
