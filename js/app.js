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

  // ==================== TOGGLE SIDEBAR ====================
  function toggleSidebar() {
    console.log('[APP] toggleSidebar called');
    
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    
    let sidebar = activeView.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) {
      sidebar = document.querySelector('.dashboard-grid .sidebar');
    }
    
    if (!sidebar) return;
    
    const overlay = document.querySelector('.sidebar-overlay');
    
    // Toggle sidebar
    sidebar.classList.toggle('open');
    
    if (overlay) {
      overlay.classList.toggle('open');
    }
    
    // Save state
    localStorage.setItem('sidebar_open', sidebar.classList.contains('open'));
  }

  function closeSidebar() {
    console.log('[APP] closeSidebar called');
    
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    
    let sidebar = activeView.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) {
      sidebar = document.querySelector('.dashboard-grid .sidebar');
    }
    
    if (sidebar) {
      sidebar.classList.remove('open');
    }
    
    const overlay = document.querySelector('.sidebar-overlay');
    if (overlay) {
      overlay.classList.remove('open');
    }
    
    localStorage.setItem('sidebar_open', false);
  }

  // ==================== CREATE OVERLAY ====================
  function createOverlay() {
    if (!document.querySelector('.sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:999; display:none; cursor:pointer;';
      overlay.onclick = closeSidebar;
      document.body.appendChild(overlay);
      console.log('[APP] Overlay created');
    }
  }

  // ==================== RESTORE SIDEBAR STATE ====================
  function restoreSidebarState() {
    const isOpen = localStorage.getItem('sidebar_open') === 'true';
    
    // Only apply on mobile
    if (window.innerWidth > 768) return;
    
    const activeView = document.querySelector('.view.active');
    if (!activeView) return;
    
    let sidebar = activeView.querySelector('.dashboard-grid .sidebar');
    if (!sidebar) {
      sidebar = document.querySelector('.dashboard-grid .sidebar');
    }
    
    if (sidebar && isOpen) {
      sidebar.classList.add('open');
      const overlay = document.querySelector('.sidebar-overlay');
      if (overlay) overlay.classList.add('open');
    }
  }

  // ==================== SETUP MOBILE FEATURES ====================
  function setupMobileFeatures() {
    createOverlay();
    restoreSidebarState();
    
    // Close sidebar when clicking on main content (mobile only)
    const mainContent = document.querySelector('.dashboard-grid .main-content');
    if (mainContent) {
      mainContent.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeSidebar();
      }
    });
  }

  // ==================== NOTIFICATION FUNCTIONS (FIXED - No auto-open) ====================
  function isDashboardPage() {
    const currentView = document.querySelector('.view.active');
    if (!currentView) return false;
    
    const dashboardViews = ['view-lecturer', 'view-sadmin', 'view-cadmin', 'view-student-dashboard'];
    return dashboardViews.some(id => currentView.id === id);
  }

  function cleanupNotifications() {
    if (typeof NOTIFICATIONS !== 'undefined' && NOTIFICATIONS.cleanup) {
      NOTIFICATIONS.cleanup();
      console.log('[APP] Notifications cleaned up');
    }
  }

  async function initNotificationsSafely(user) {
    // Only initialize on dashboard pages
    if (!isDashboardPage()) {
      console.log('[APP] Skipping notifications on non-dashboard page');
      return;
    }
    
    if (typeof NOTIFICATIONS !== 'undefined' && NOTIFICATIONS.init) {
      try {
        await NOTIFICATIONS.init(user);
        NOTIFICATIONS.requestPermission();
        console.log('[APP] Notifications initialized for:', user.role);
      } catch (err) {
        console.warn('[APP] Notification init failed:', err);
      }
    }
  }

  // Notification bell is now handled entirely by NOTIFICATIONS module
  // This function is kept for compatibility but does nothing to prevent duplicates
  function createNotificationBellSafely() {
    // Let NOTIFICATIONS handle the bell creation - don't create duplicate
    // The NOTIFICATIONS.init() method already creates the bell and panel
    console.log('[APP] Notification bell handled by NOTIFICATIONS module');
  }

  // ==================== ACTIVATE FUNCTIONS ====================
  async function activateAdmin(user) {
    console.log('[APP] Activating admin:', user.role);
    
    cleanupNotifications();
    
    if (user.role === 'superAdmin') {
      const el = document.getElementById('sadm-name-tb'); 
      if (el) el.textContent = user.name || 'Administrator';
      
      const sidebarName = document.querySelector('#view-sadmin .sidebar-header h3');
      const sidebarRole = document.querySelector('#view-sadmin .sidebar-header p');
      const userAvatar = document.querySelector('#view-sadmin .user-avatar');
      if (sidebarName) sidebarName.textContent = user.name || 'System Admin';
      if (sidebarRole) sidebarRole.textContent = '🔐 Administrator';
      if (userAvatar) userAvatar.textContent = '🔐';
      
      goTo('sadmin');
      
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        initNotificationsSafely({ ...user, role: 'superAdmin', id: 'superadmin' });
        setupMobileFeatures();
      }, 100);
      
      if (typeof USER_ACCOUNT !== 'undefined') {
        await USER_ACCOUNT.init();
        USER_ACCOUNT.loadProfilePicture();
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
      
      const sidebarName = document.querySelector('#view-cadmin .sidebar-header h3');
      const sidebarDept = document.querySelector('#view-cadmin .sidebar-header p');
      const userAvatar = document.querySelector('#view-cadmin .user-avatar');
      if (sidebarName) sidebarName.textContent = user.name || 'Co-Admin';
      if (sidebarDept) sidebarDept.textContent = user.department || 'Department';
      if (userAvatar) userAvatar.textContent = '🤝';
      
      goTo('cadmin');
      
      setTimeout(() => {
        initNotificationsSafely({ ...user, role: 'coAdmin', id: user.id });
        setupMobileFeatures();
      }, 100);
      
      if (typeof USER_ACCOUNT !== 'undefined') {
        await USER_ACCOUNT.init();
        USER_ACCOUNT.loadProfilePicture();
      }
      
      if (typeof CADM !== 'undefined' && CADM.tab) {
        CADM.tab('ids');
      }
    }
  }

  async function activateLecturer(user) {
    console.log('[APP] Activating lecturer/TA:', user.role);
    
    cleanupNotifications();
    
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
    
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('lecturer');
    
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
      USER_ACCOUNT.loadProfilePicture();
    }
    
    setTimeout(() => {
      initNotificationsSafely({ ...user, role: user.role, id: user.id });
      setupMobileFeatures();
    }, 100);
    
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
    
    cleanupNotifications();
    
    const nameEl = document.getElementById('student-dash-name');
    const avatarEl = document.getElementById('student-avatar');
    const titleEl = document.getElementById('student-dash-title');
    
    if (nameEl) nameEl.textContent = user.name || user.email;
    if (avatarEl) avatarEl.textContent = '🎓';
    if (titleEl) titleEl.textContent = '📊 Student Dashboard';
    
    if (window.location.search.includes('ci=')) {
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    goTo('student-dashboard');
    
    if (typeof USER_ACCOUNT !== 'undefined') {
      await USER_ACCOUNT.init();
      USER_ACCOUNT.loadProfilePicture();
    }
    
    setTimeout(() => {
      initNotificationsSafely({ ...user, role: 'student', id: user.studentId });
      setupMobileFeatures();
    }, 100);
    
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

  // ==================== SESSION RESTORATION ====================
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

  // ==================== QR CODE & HASH HANDLING ====================
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
        console.log('[APP] Reset parameter detected, showing biometric reset page');
        goTo('biometric-reset');
        if (typeof RESET !== 'undefined' && RESET.init) {
          await RESET.init();
        } else {
          console.error('[APP] RESET module not loaded');
          const container = document.getElementById('view-biometric-reset');
          if (container) {
            container.innerHTML = '<div class="pg"><div class="inner-panel"><div class="alert alert-err">❌ Reset module not loaded. Please refresh the page.</div></div></div>';
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

  // ==================== GLOBAL CLICK HANDLER ====================
  function setupGlobalClickHandler() {
    document.addEventListener('click', function(event) {
      const panel = document.querySelector('.notification-panel');
      const bell = document.querySelector('.notification-bell');
      
      if (panel && panel.classList.contains('open')) {
        if (!panel.contains(event.target) && !bell?.contains(event.target)) {
          if (typeof NOTIFICATIONS !== 'undefined' && NOTIFICATIONS.closePanel) {
            NOTIFICATIONS.closePanel();
          } else {
            panel.classList.remove('open');
          }
        }
      }
    });
  }

  // ==================== ADD CLOSE SIDEBAR ON NAVIGATION ITEMS ====================
  function setupSidebarNavigationClose() {
    // Close sidebar when any nav-item is clicked (on mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          setTimeout(() => {
            closeSidebar();
          }, 150);
        }
      });
    });
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
        const swPath = window.location.pathname.replace(/[^/]*$/, '') + 'sw.js';
        navigator.serviceWorker.register(swPath).catch(() => { }); 
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
    
    // Setup global click handler for notifications
    setupGlobalClickHandler();
    
    // Setup sidebar navigation close
    setupSidebarNavigationClose();
    
    // PRIORITY 0: Check for reset parameter in URL
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
      // Re-setup sidebar navigation close after session restore
      setTimeout(() => {
        setupSidebarNavigationClose();
      }, 500);
      return;
    }
    
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

  window.addEventListener('popstate', () => {
    console.log('[APP] Popstate event, re-checking routes');
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
    closeSidebar,
    setupMobileFeatures
  };
})();
