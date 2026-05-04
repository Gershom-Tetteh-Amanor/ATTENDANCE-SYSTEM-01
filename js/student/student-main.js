/* student-main.js — Main controller for Student Dashboard with Fixed Event Handlers */
'use strict';

const STUDENT_MAIN = (() => {
  const core = () => window.STUDENT_CORE;
  const location = () => window.STUDENT_LOCATION;
  const overview = () => window.STUDENT_OVERVIEW;
  const calendar = () => window.STUDENT_CALENDAR;
  const history = () => window.STUDENT_HISTORY;
  const messages = () => window.STUDENT_MESSAGES;
  const timetable = () => window.STUDENT_TIMETABLE;
  
  let activeUpcomingCheckInterval = null;
  let isInitialized = false;
  
  // ==================== SIDEBAR FUNCTIONS ====================
  
  function toggleSidebar() {
    console.log('[STUDENT] toggleSidebar called');
    
    const sidebar = document.querySelector('#view-student-dashboard .dashboard-grid .sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (!sidebar) {
      console.log('[STUDENT] Sidebar not found');
      return;
    }
    
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('open');
      localStorage.setItem('student_sidebar_open', 'false');
    } else {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.add('open');
      localStorage.setItem('student_sidebar_open', 'true');
    }
  }
  
  function closeSidebar() {
    const sidebar = document.querySelector('#view-student-dashboard .dashboard-grid .sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) {
      sidebar.classList.remove('open');
    }
    if (overlay) {
      overlay.classList.remove('open');
    }
    localStorage.setItem('student_sidebar_open', 'false');
  }
  
  // ==================== OVERLAY CREATION ====================
  
  function createOverlay() {
    if (!document.querySelector('.sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'sidebar-overlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:1000; display:none; cursor:pointer;';
      overlay.onclick = function() {
        console.log('[STUDENT] Overlay clicked - closing sidebar');
        closeSidebar();
      };
      document.body.appendChild(overlay);
      console.log('[STUDENT] Overlay created');
    }
  }
  
  // ==================== HAMBURGER BUTTON SETUP ====================
  
  function setupHamburgerButton() {
    const topbar = document.querySelector('#view-student-dashboard .topbar');
    if (!topbar) {
      console.log('[STUDENT] Topbar not found');
      return;
    }
    
    // Check if hamburger button already exists
    let hamburger = topbar.querySelector('.hamburger-btn');
    if (!hamburger) {
      hamburger = document.createElement('button');
      hamburger.className = 'hamburger-btn';
      hamburger.innerHTML = '☰';
      hamburger.setAttribute('aria-label', 'Menu');
      hamburger.style.cssText = 'display: flex; align-items: center; justify-content: center; background: none; border: none; font-size: 24px; cursor: pointer; color: white; padding: 8px 12px; border-radius: 8px; margin-right: 10px;';
      
      // Insert at the beginning of topbar
      const logoContainer = topbar.querySelector('.topbar-logo-container');
      if (logoContainer) {
        topbar.insertBefore(hamburger, logoContainer);
      } else {
        topbar.insertBefore(hamburger, topbar.firstChild);
      }
      
      // Remove existing listener and add new one
      hamburger.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      };
      
      console.log('[STUDENT] Hamburger button created');
    }
  }
  
  // ==================== THEME BUTTON SETUP ====================
  
  function setupThemeButton() {
    const themeBtn = document.querySelector('#view-student-dashboard .theme-btn');
    if (themeBtn && typeof THEME !== 'undefined') {
      // Remove existing listeners
      const newThemeBtn = themeBtn.cloneNode(true);
      themeBtn.parentNode.replaceChild(newThemeBtn, themeBtn);
      
      newThemeBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        THEME.toggle();
      };
      console.log('[STUDENT] Theme button setup complete');
    }
  }
  
  // ==================== LOGOUT BUTTON SETUP ====================
  
  function setupLogoutButton() {
    const logoutBtn = document.querySelector('#view-student-dashboard .tb-btn');
    if (logoutBtn) {
      // Remove existing listeners
      const newLogoutBtn = logoutBtn.cloneNode(true);
      logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
      
      newLogoutBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        STUDENT_MAIN.logout();
      };
      console.log('[STUDENT] Logout button setup complete');
    }
  }
  
  // ==================== NAVIGATION ITEMS SETUP ====================
  
  function setupNavigationItems() {
    const navItems = document.querySelectorAll('#view-student-dashboard .nav-item');
    console.log('[STUDENT] Setting up', navItems.length, 'navigation items');
    
    navItems.forEach(item => {
      // Remove existing listeners
      const newItem = item.cloneNode(true);
      item.parentNode.replaceChild(newItem, item);
      
      const tabName = newItem.getAttribute('data-tab');
      if (tabName) {
        newItem.onclick = function(e) {
          e.preventDefault();
          e.stopPropagation();
          STUDENT_MAIN.switchTab(tabName);
          
          // Close sidebar on mobile after navigation
          if (window.innerWidth <= 768) {
            closeSidebar();
          }
        };
      }
    });
  }
  
  // ==================== NOTIFICATION BELL SETUP ====================
  
  function setupNotificationBell() {
    const bell = document.querySelector('#view-student-dashboard .notification-bell');
    if (bell && typeof NOTIFICATIONS !== 'undefined') {
      const newBell = bell.cloneNode(true);
      bell.parentNode.replaceChild(newBell, bell);
      
      newBell.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        NOTIFICATIONS.togglePanel();
      };
      console.log('[STUDENT] Notification bell setup complete');
    }
  }
  
  // ==================== RESPONSIVE HANDLERS ====================
  
  function setupResponsiveHandlers() {
    // Close sidebar when window is resized above mobile breakpoint
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeSidebar();
      }
    });
    
    // Close sidebar when clicking on main content (mobile only)
    const mainContent = document.querySelector('#view-student-dashboard .dashboard-grid .main-content');
    if (mainContent) {
      mainContent.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          closeSidebar();
        }
      });
    }
  }
  
  // ==================== RESTORE SIDEBAR STATE ====================
  
  function restoreSidebarState() {
    const isOpen = localStorage.getItem('student_sidebar_open') === 'true';
    
    // Only apply on mobile
    if (window.innerWidth > 768) return;
    
    const sidebar = document.querySelector('#view-student-dashboard .dashboard-grid .sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar && isOpen) {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.add('open');
    }
  }
  
  // ==================== AUTO REFRESH ====================
  
  function startAutoRefresh() { 
    if (core().state.refreshInterval) clearInterval(core().state.refreshInterval); 
    core().state.refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') overview().loadOverview();
      else if (activeTab === 'calendar-view') calendar().loadCalendarView();
      else if (activeTab === 'history-view') history().loadHistoryView();
      else if (activeTab === 'messages-view' && core().state.currentMessageCourse) messages().loadCourseMessages();
      else if (activeTab === 'announcements-view' && core().state.currentAnnouncementCourse) messages().loadCourseAnnouncements();
    }, 60000);
  }
  
  // ==================== UPCOMING SESSIONS CHECK ====================
  
  function startUpcomingSessionsCheck() {
    if (activeUpcomingCheckInterval) clearInterval(activeUpcomingCheckInterval);
    activeUpcomingCheckInterval = setInterval(async () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = core().getCurrentDay();
      
      for (const entry of core().state.timetable) {
        if (entry.day !== currentDay) continue;
        const entryStartMinutes = core().timeToMinutes(entry.startTime);
        const minutesUntil = entryStartMinutes - currentMinutes;
        const entryId = `${entry.courseCode}_${entry.lecId}_${entry.day}_${entry.startTime}`;
        
        if (minutesUntil <= 30 && minutesUntil > 0 && !core().state.activeUpcomingNotifications.has(entryId)) {
          core().state.activeUpcomingNotifications.add(entryId);
          await location().playNotificationSound();
          if (Notification.permission === "granted") {
            new Notification(`⚠️ Upcoming Class: ${entry.courseCode}`, {
              body: `Starts at ${core().formatTime24(entry.startTime)} in ${minutesUntil} minutes with ${entry.lecturerName}.`,
              icon: "/uo_ghana.png",
              tag: entryId,
              requireInteraction: true
            });
          }
          if (typeof NOTIFICATIONS !== 'undefined') {
            await NOTIFICATIONS.add({
              title: `⏰ Class Starting Soon: ${entry.courseCode}`,
              message: `Your ${entry.courseName} class starts at ${core().formatTime24(entry.startTime)} (in ${minutesUntil} minutes).`,
              type: 'warning',
              link: null
            });
          }
          const calendarView = document.getElementById('calendar-view');
          if (calendarView && calendarView.style.display !== 'none') await calendar().loadCalendarView();
          setTimeout(() => { core().state.activeUpcomingNotifications.delete(entryId); }, minutesUntil * 60 * 1000);
        }
      }
      
      for (const entry of core().state.personalStudyTimes) {
        if (entry.day !== currentDay) continue;
        const entryStartMinutes = core().timeToMinutes(entry.startTime);
        const minutesUntil = entryStartMinutes - currentMinutes;
        const entryId = `study_${entry.title}_${entry.day}_${entry.startTime}`;
        if (minutesUntil <= 15 && minutesUntil > 0 && !core().state.activeUpcomingNotifications.has(entryId)) {
          core().state.activeUpcomingNotifications.add(entryId);
          await location().playReminderSound();
          if (Notification.permission === "granted") {
            new Notification(`📖 Study Time: ${entry.title}`, {
              body: `Starts at ${core().formatTime24(entry.startTime)} in ${minutesUntil} minutes.`,
              icon: "/uo_ghana.png",
              tag: entryId
            });
          }
          setTimeout(() => { core().state.activeUpcomingNotifications.delete(entryId); }, minutesUntil * 60 * 1000);
        }
      }
    }, 60000);
  }
  
  function startNotificationCheck() {
    if (core().state.notificationCheckInterval) clearInterval(core().state.notificationCheckInterval);
    core().state.notificationCheckInterval = setInterval(() => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = core().getCurrentDay();
      const upcomingEntries = [...core().state.timetable, ...core().state.personalStudyTimes].filter(entry => {
        if (entry.day !== currentDay) return false;
        const minutesUntil = core().timeToMinutes(entry.startTime) - currentMinutes;
        return minutesUntil <= 30 && minutesUntil > 0;
      });
      const badge = document.querySelector('.notification-badge');
      if (badge) {
        if (upcomingEntries.length > 0) {
          badge.textContent = upcomingEntries.length;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    }, 60000);
  }
  
  // ==================== CHECK-IN FUNCTIONS ====================
  
  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session || !session.active || Date.now() > session.expiresAt) {
      await MODAL.error('Error', 'Session not available');
      return;
    }
    const payload = btoa(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }
  
  async function checkInFromTimetable(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => s.courseCode === courseCode && s.lecFbId === lecId && s.active === true);
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode}.`);
      return;
    }
    await directCheckIn(activeSession.id);
  }
  
  async function showActiveSessionLocation(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.alert('Error', 'Session not found.'); return; }
    if (session.lat && session.lng) {
      await location().showLocationDirections(session.lat, session.lng, session.lecturer || 'Lecturer', session.courseCode);
    } else {
      await MODAL.alert('Location Not Available', `No location data available.`, { icon: '📍' });
    }
  }
  
  async function showClassLocation(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => s.courseCode === courseCode && s.lecFbId === lecId && s.active === true);
    if (activeSession && activeSession.lat && activeSession.lng) {
      await location().showLocationDirections(activeSession.lat, activeSession.lng, activeSession.lecturer || 'Lecturer', courseCode);
    } else {
      const lecturer = core().cache.lecturers.get(lecId);
      if (lecturer && lecturer.lat && lecturer.lng) {
        await location().showLocationDirections(lecturer.lat, lecturer.lng, lecturer.name, courseCode);
      } else {
        await MODAL.alert('Location Not Available', `No location data available for ${courseCode}.`, { icon: '📍' });
      }
    }
  }
  
  // ==================== TAB SWITCHING ====================
  
  async function switchTab(tabName) {
    console.log('[STUDENT] Switching to tab:', tabName);
    
    if (tabName !== 'messages') core().state.currentMessageCourse = null;
    if (tabName !== 'announcements') core().state.currentAnnouncementCourse = null;
    
    // Update nav item active states
    document.querySelectorAll('#view-student-dashboard .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) item.classList.add('active');
    });
    
    // Hide all tab contents
    document.querySelectorAll('#view-student-dashboard .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    // Show selected tab content
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    // Update title
    const titles = { overview: 'Dashboard', calendar: 'Schedule', history: 'History', messages: 'Messages', announcements: 'Announcements' };
    const tbTitle = document.getElementById('student-dash-title');
    if (tbTitle && titles[tabName]) tbTitle.textContent = titles[tabName];
    
    // Load tab content
    if (tabName === 'overview') await overview().loadOverview();
    else if (tabName === 'calendar') await calendar().loadCalendarView();
    else if (tabName === 'history') await history().loadHistoryView();
    else if (tabName === 'messages') await messages().loadMessagesView();
    else if (tabName === 'announcements') await messages().loadAnnouncementsView();
    
    // Close sidebar on mobile after tab switch
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }
  
  // ==================== LOGOUT ====================
  
  function logout() { 
    console.log('[STUDENT] Logging out');
    core().stopAllTimers(); 
    AUTH.clearSession(); 
    APP.goTo('landing'); 
  }
  
  // ==================== SETUP ALL EVENT LISTENERS ====================
  
  function setupAllEventListeners() {
    console.log('[STUDENT] Setting up all event listeners...');
    
    // Create overlay first
    createOverlay();
    
    // Setup all buttons
    setupHamburgerButton();
    setupThemeButton();
    setupLogoutButton();
    setupNotificationBell();
    setupNavigationItems();
    setupResponsiveHandlers();
    
    // Restore sidebar state
    restoreSidebarState();
    
    console.log('[STUDENT] All event listeners setup complete');
  }
  
  // ==================== INITIALIZATION ====================
  
  async function init() {
    // Prevent double initialization
    if (isInitialized) {
      console.log('[STUDENT] Already initialized, skipping');
      return;
    }
    
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    core().setCurrentStudent(user);
    
    console.log('[STUDENT] Initializing for student:', core().state.currentStudent.studentId);
    
    // Request audio permission on first click
    document.addEventListener('click', function audioPermissionHandler() {
      location().requestAudioPermission();
      document.removeEventListener('click', audioPermissionHandler);
    }, { once: true });
    
    core().showLoadingIndicator();
    const startTime = Date.now();
    
    await Promise.all([
      overview().loadStudentData(),
      timetable().loadTimetable(),
      timetable().loadPersonalStudyTimes()
    ]);
    
    await overview().loadOverview();
    startAutoRefresh();
    startNotificationCheck();
    startUpcomingSessionsCheck();
    
    core().updateSidebarInfo();
    core().hideLoadingIndicator();
    
    // Setup all event listeners after DOM is ready
    setTimeout(() => {
      setupAllEventListeners();
    }, 100);
    
    isInitialized = true;
    
    console.log(`[STUDENT] Initialized in ${Date.now() - startTime}ms`);
  }
  
  // Expose functions globally for HTML onclick handlers
  window.toggleStudentSidebar = toggleSidebar;
  window.closeStudentSidebar = closeSidebar;
  
  return {
    init,
    switchTab,
    toggleSidebar,
    closeSidebar,
    directCheckIn,
    checkInFromTimetable,
    showActiveSessionLocation,
    showClassLocation,
    logout
  };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => STUDENT_MAIN.init());
} else {
  STUDENT_MAIN.init();
}

window.STUDENT_MAIN = STUDENT_MAIN;
