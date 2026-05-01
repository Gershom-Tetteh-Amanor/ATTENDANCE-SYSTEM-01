/* ============================================
   notifications.js — Real-time notification system
   FIXED: Proper panel closing, announcement handling, real-time updates
   ============================================ */
'use strict';

const NOTIFICATIONS = (() => {
  
  let notifications = [];
  let unreadCount = 0;
  let listeners = [];
  let currentUser = null;
  let panelCreated = false;
  let notificationListener = null;
  let announcementListener = null;
  let panelOpen = false;
  
  // Helper to check if current page is a dashboard
  function isDashboardPage() {
    const currentView = document.querySelector('.view.active');
    if (!currentView) return false;
    
    const dashboardViews = ['view-lecturer', 'view-sadmin', 'view-cadmin', 'view-student-dashboard'];
    return dashboardViews.some(id => currentView.id === id);
  }
  
  // Helper to safely get data from DB
  async function safeGet(path) {
    try {
      if (typeof DB !== 'undefined' && DB.get) {
        return await DB.get(path);
      } else if (typeof DB !== 'undefined' && DB._get) {
        return await DB._get(path);
      } else {
        console.warn('[NOTIFICATIONS] DB.get not available');
        return null;
      }
    } catch (err) {
      console.warn('[NOTIFICATIONS] DB.get error:', err);
      return null;
    }
  }
  
  // Helper to safely set data in DB
  async function safeSet(path, data) {
    try {
      if (typeof DB !== 'undefined' && DB.set) {
        return await DB.set(path, data);
      } else if (typeof DB !== 'undefined' && DB._set) {
        return await DB._set(path, data);
      } else {
        console.warn('[NOTIFICATIONS] DB.set not available');
        return null;
      }
    } catch (err) {
      console.warn('[NOTIFICATIONS] DB.set error:', err);
      return null;
    }
  }
  
  // Helper to safely remove data from DB
  async function safeRemove(path) {
    try {
      if (typeof DB !== 'undefined' && DB.remove) {
        return await DB.remove(path);
      } else if (typeof DB !== 'undefined' && DB._remove) {
        return await DB._remove(path);
      } else {
        console.warn('[NOTIFICATIONS] DB.remove not available');
        return null;
      }
    } catch (err) {
      console.warn('[NOTIFICATIONS] DB.remove error:', err);
      return null;
    }
  }
  
  // Helper to safely listen to DB changes
  function safeListen(path, callback) {
    try {
      if (typeof DB !== 'undefined' && DB.listen) {
        return DB.listen(path, callback);
      } else {
        console.warn('[NOTIFICATIONS] DB.listen not available');
        return null;
      }
    } catch (err) {
      console.warn('[NOTIFICATIONS] DB.listen error:', err);
      return null;
    }
  }
  
  // Initialize notification system
  async function init(user) {
    if (!user) {
      console.warn('[NOTIFICATIONS] No user provided');
      return;
    }
    
    // Only initialize on dashboard pages
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Skipping init on non-dashboard page');
      return;
    }
    
    currentUser = user;
    console.log('[NOTIFICATIONS] Initializing for user:', user.role, user.id || user.studentId);
    
    await loadAllNotifications();
    setupRealTimeListeners();
    setupUI();
    setupOutsideClickListener();
  }
  
  // Load all notifications from all sources
  async function loadAllNotifications() {
    if (!currentUser) return;
    
    const userId = currentUser.id || currentUser.studentId;
    if (!userId) {
      console.warn('[NOTIFICATIONS] No user ID found');
      return;
    }
    
    const allNotifications = [];
    
    // 1. Load regular notifications from Firebase
    const path = `notifications/${currentUser.role}/${userId}`;
    const data = await safeGet(path);
    
    if (data && data.notifications) {
      const regularNotifs = Object.values(data.notifications);
      allNotifications.push(...regularNotifs);
    }
    
    // 2. For students, also get announcements from their enrolled courses
    if (currentUser.role === 'student') {
      try {
        const enrollments = await DB.ENROLLMENT.getStudentEnrollments(userId, null);
        
        for (const enrollment of enrollments) {
          const announcementsPath = `announcements/course/${enrollment.lecId}/${enrollment.courseCode}_${enrollment.year}_${enrollment.semester}`;
          const announcements = await safeGet(announcementsPath);
          
          if (announcements) {
            for (const [annId, ann] of Object.entries(announcements)) {
              const isRead = ann.readBy && ann.readBy.includes(userId);
              allNotifications.push({
                id: annId,
                title: `📢 ${ann.title}`,
                message: `${ann.courseCode}: ${ann.message.substring(0, 150)}${ann.message.length > 150 ? '...' : ''}`,
                type: ann.priority || 'info',
                timestamp: ann.timestamp,
                read: isRead,
                link: null,
                announcementId: annId,
                courseCode: ann.courseCode,
                senderName: ann.senderName,
                senderRole: ann.senderRole
              });
            }
          }
        }
      } catch(err) {
        console.warn('[NOTIFICATIONS] Error loading course announcements:', err);
      }
    }
    
    // 3. For lecturers/TAs, get announcements from their courses
    if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
      try {
        const myId = currentUser.id || currentUser.activeLecturerId;
        const courses = await DB.COURSE.getAllForLecturer(myId);
        
        for (const course of courses) {
          const announcementsPath = `announcements/course/${myId}/${course.code}_${course.year}_${course.semester}`;
          const announcements = await safeGet(announcementsPath);
          
          if (announcements) {
            for (const [annId, ann] of Object.entries(announcements)) {
              allNotifications.push({
                id: annId,
                title: `📢 ${ann.title}`,
                message: `${ann.courseCode}: ${ann.message.substring(0, 150)}${ann.message.length > 150 ? '...' : ''}`,
                type: ann.priority || 'info',
                timestamp: ann.timestamp,
                read: false,
                link: null,
                announcementId: annId,
                courseCode: ann.courseCode,
                senderName: ann.senderName,
                senderRole: ann.senderRole
              });
            }
          }
        }
      } catch(err) {
        console.warn('[NOTIFICATIONS] Error loading lecturer announcements:', err);
      }
    }
    
    // 4. For admins, get department announcements
    if (currentUser.role === 'superAdmin' || currentUser.role === 'coAdmin') {
      try {
        const dept = currentUser.department;
        if (dept) {
          const deptAnnouncementsPath = `announcements/department/${dept}`;
          const deptAnnouncements = await safeGet(deptAnnouncementsPath);
          
          if (deptAnnouncements) {
            for (const [annId, ann] of Object.entries(deptAnnouncements)) {
              allNotifications.push({
                id: annId,
                title: `📢 ${ann.title}`,
                message: `${ann.department}: ${ann.message.substring(0, 150)}${ann.message.length > 150 ? '...' : ''}`,
                type: ann.priority || 'info',
                timestamp: ann.timestamp,
                read: false,
                link: null,
                announcementId: annId,
                senderName: ann.senderName,
                senderRole: ann.senderRole
              });
            }
          }
        }
      } catch(err) {
        console.warn('[NOTIFICATIONS] Error loading department announcements:', err);
      }
    }
    
    // Sort by timestamp (newest first)
    allNotifications.sort((a, b) => b.timestamp - a.timestamp);
    notifications = allNotifications;
    unreadCount = notifications.filter(n => !n.read).length;
    
    console.log('[NOTIFICATIONS] Loaded', notifications.length, 'notifications,', unreadCount, 'unread');
    notifyListeners();
    updateBadge();
  }
  
  // Setup real-time listeners for new notifications and announcements
  function setupRealTimeListeners() {
    if (!currentUser) return;
    
    const userId = currentUser.id || currentUser.studentId;
    if (!userId) return;
    
    // Listen for regular notifications
    const path = `notifications/${currentUser.role}/${userId}`;
    
    if (notificationListener && typeof notificationListener === 'function') {
      notificationListener();
      notificationListener = null;
    }
    
    notificationListener = safeListen(path, (data) => {
      if (!isDashboardPage()) return;
      console.log('[NOTIFICATIONS] Regular notifications updated');
      loadAllNotifications();
    });
    
    // For students, also listen for new announcements in enrolled courses
    if (currentUser.role === 'student') {
      if (announcementListener && typeof announcementListener === 'function') {
        announcementListener();
        announcementListener = null;
      }
      
      announcementListener = safeListen('announcements/course', (data) => {
        if (!isDashboardPage()) return;
        console.log('[NOTIFICATIONS] Announcements updated, reloading...');
        loadAllNotifications();
      });
    }
    
    // For lecturers/TAs, listen to their own announcements
    if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
      const myId = currentUser.id || currentUser.activeLecturerId;
      if (myId) {
        if (announcementListener && typeof announcementListener === 'function') {
          announcementListener();
          announcementListener = null;
        }
        
        announcementListener = safeListen(`announcements/course/${myId}`, (data) => {
          if (!isDashboardPage()) return;
          console.log('[NOTIFICATIONS] Lecturer announcements updated');
          loadAllNotifications();
        });
      }
    }
  }
  
  // Show browser notification for important messages
  function showBrowserNotification(notification) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!isDashboardPage()) return;
    
    const panel = document.querySelector('.notification-panel');
    if (panel && panel.classList.contains('open')) return;
    
    // Only show for important notifications (warnings, dangers, or announcements)
    if (notification.type === 'warning' || notification.type === 'danger' || notification.title.includes('📢')) {
      new Notification(notification.title, {
        body: notification.message,
        icon: "/uo_ghana.png",
        silent: false,
        vibrate: [200, 100, 200]
      });
    }
  }
  
  // Add a new notification
  async function add(notification) {
    if (!currentUser) return;
    
    const userId = currentUser.id || currentUser.studentId;
    if (!userId) return;
    
    const newNotification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      link: notification.link || null,
      timestamp: Date.now(),
      read: false
    };
    
    const path = `notifications/${currentUser.role}/${userId}/notifications/${newNotification.id}`;
    await safeSet(path, newNotification);
    
    await loadAllNotifications();
    
    return newNotification;
  }
  
  // Mark notification as read
  async function markAsRead(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return;
    
    notification.read = true;
    unreadCount = Math.max(0, unreadCount - 1);
    
    const userId = currentUser.id || currentUser.studentId;
    if (userId) {
      const path = `notifications/${currentUser.role}/${userId}/notifications/${notificationId}/read`;
      await safeSet(path, true);
    }
    
    notifyListeners();
    updateBadge();
    
    if (panelOpen) {
      renderNotifications();
    }
  }
  
  // Mark all as read
  async function markAllAsRead() {
    for (const notification of notifications) {
      if (!notification.read) {
        await markAsRead(notification.id);
      }
    }
  }
  
  // Delete notification
  async function deleteNotification(notificationId) {
    const userId = currentUser.id || currentUser.studentId;
    if (userId) {
      const path = `notifications/${currentUser.role}/${userId}/notifications/${notificationId}`;
      await safeRemove(path);
    }
    
    notifications = notifications.filter(n => n.id !== notificationId);
    unreadCount = notifications.filter(n => n.read === false).length;
    notifyListeners();
    updateBadge();
    
    if (panelOpen) {
      renderNotifications();
    }
  }
  
  // Setup UI components
  function setupUI() {
    if (panelCreated) return;
    
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Skipping UI setup on non-dashboard page');
      return;
    }
    
    // Create notification panel if not exists
    let panel = document.querySelector('.notification-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'notification-panel';
      panel.innerHTML = `
        <div class="notification-header">
          <h4>Notifications</h4>
          <button class="mark-all-read" onclick="NOTIFICATIONS.markAllAsRead()">Mark all as read</button>
        </div>
        <div class="notification-list">
          <div style="padding:20px; text-align:center; color:var(--text3);">No notifications</div>
        </div>
      `;
      document.body.appendChild(panel);
    }
    
    // Setup bell click listeners
    setupBellClickListeners();
    
    panelCreated = true;
  }
  
  // Setup bell click listeners for all dashboards
  function setupBellClickListeners() {
    const bells = document.querySelectorAll('.notification-bell');
    console.log('[NOTIFICATIONS] Found', bells.length, 'notification bells');
    
    bells.forEach(bell => {
      // Remove existing listener to avoid duplicates
      const newBell = bell.cloneNode(true);
      bell.parentNode.replaceChild(newBell, bell);
      
      newBell.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[NOTIFICATIONS] Bell clicked - toggling panel');
        togglePanel();
      };
    });
  }
  
  // Setup click outside listener to close panel
  function setupOutsideClickListener() {
    // Remove any existing listener
    if (window._notificationOutsideHandler) {
      document.removeEventListener('click', window._notificationOutsideHandler);
    }
    
    window._notificationOutsideHandler = function(event) {
      const panel = document.querySelector('.notification-panel');
      const bell = document.querySelector('.notification-bell');
      const wrapper = document.querySelector('.notification-wrapper');
      
      // Only process if panel is open
      if (panel && panel.classList.contains('open')) {
        // Check if click is inside panel OR on bell OR inside wrapper
        const isClickInsidePanel = panel.contains(event.target);
        const isClickOnBell = bell && bell.contains(event.target);
        const isClickInWrapper = wrapper && wrapper.contains(event.target);
        
        // Close only if clicking outside the panel AND not on the bell
        if (!isClickInsidePanel && !isClickOnBell && !isClickInWrapper) {
          console.log('[NOTIFICATIONS] Click outside - closing panel');
          closePanel();
        }
      }
    };
    
    document.addEventListener('click', window._notificationOutsideHandler);
  }
  
  // Toggle notification panel
  function togglePanel() {
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Cannot open panel on non-dashboard page');
      return;
    }
    
    const panel = document.querySelector('.notification-panel');
    if (!panel) {
      console.log('[NOTIFICATIONS] Panel not found');
      return;
    }
    
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      // Close any other open panels first
      document.querySelectorAll('.notification-panel.open').forEach(p => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.add('open');
      panelOpen = true;
      renderNotifications();
      console.log('[NOTIFICATIONS] Panel opened');
    }
  }
  
  // Close panel
  function closePanel() {
    const panel = document.querySelector('.notification-panel');
    if (panel && panel.classList.contains('open')) {
      panel.classList.remove('open');
      panelOpen = false;
      console.log('[NOTIFICATIONS] Panel closed');
    }
  }
  
  // Render notifications in panel
  function renderNotifications() {
    const list = document.querySelector('.notification-list');
    if (!list) return;
    
    if (notifications.length === 0) {
      list.innerHTML = '<div class="notification-item" style="text-align:center; color:var(--text3);">📭 No notifications</div>';
      return;
    }
    
    list.innerHTML = notifications.map(notification => {
      const typeIcon = notification.type === 'danger' ? '🚨' : (notification.type === 'warning' ? '⚠️' : 'ℹ️');
      const typeClass = notification.type === 'danger' ? 'notification-danger' : (notification.type === 'warning' ? 'notification-warning' : '');
      
      return `
        <div class="notification-item ${notification.read ? '' : 'unread'} ${typeClass}" data-id="${notification.id}" onclick="NOTIFICATIONS.handleNotificationClick('${notification.id}')">
          <div class="notification-title">${typeIcon} ${escapeHtml(notification.title)}</div>
          <div class="notification-message">${escapeHtml(notification.message)}</div>
          ${notification.courseCode ? `<div class="notification-course">📚 ${escapeHtml(notification.courseCode)}</div>` : ''}
          ${notification.senderName ? `<div class="notification-sender">👤 ${escapeHtml(notification.senderName)}</div>` : ''}
          <div class="notification-time">${formatTime(notification.timestamp)}</div>
          <button class="delete-notif" onclick="event.stopPropagation(); NOTIFICATIONS.deleteNotification('${notification.id}')">✕</button>
        </div>
      `;
    }).join('');
  }
  
  function formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  
  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  
  async function handleNotificationClick(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      await markAsRead(notificationId);
      
      // If it's an announcement, navigate to messages tab
      if (notification.title.includes('📢')) {
        if (currentUser.role === 'student') {
          if (typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.switchTab) {
            STUDENT_DASH.switchTab('messages');
          }
          if (notification.courseCode && typeof STUDENT_DASH !== 'undefined' && STUDENT_DASH.loadCourseMessages) {
            setTimeout(() => {
              const courseSelect = document.getElementById('message-course-select');
              if (courseSelect) {
                for (let i = 0; i < courseSelect.options.length; i++) {
                  if (courseSelect.options[i].text.includes(notification.courseCode)) {
                    courseSelect.value = courseSelect.options[i].value;
                    STUDENT_DASH.loadCourseMessages();
                    break;
                  }
                }
              }
            }, 500);
          }
        } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
          if (typeof LEC !== 'undefined' && LEC.switchTab) {
            LEC.switchTab('mycourses');
          }
        }
      } else if (notification.link) {
        window.location.href = notification.link;
      }
    }
    closePanel();
  }
  
  function updateBadge() {
    const badge = document.querySelector('.notification-badge');
    const bell = document.querySelector('.notification-bell');
    
    if (badge) {
      if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'block';
        if (bell) {
          bell.style.animation = 'none';
          bell.offsetHeight; // Trigger reflow
          bell.style.animation = 'bellShake 0.5s ease';
        }
        setTimeout(() => {
          if (bell) bell.style.removeProperty('animation');
        }, 500);
      } else {
        badge.style.display = 'none';
      }
    }
  }
  
  function notifyListeners() {
    listeners.forEach(cb => cb({ notifications, unreadCount }));
  }
  
  function subscribe(callback) {
    listeners.push(callback);
    callback({ notifications, unreadCount });
    return () => { listeners = listeners.filter(cb => cb !== callback); };
  }
  
  // Request notification permission
  function requestPermission() {
    if (!isDashboardPage()) return;
    
    if ("Notification" in window && Notification.permission === "default") {
      console.log('[NOTIFICATIONS] Permission not requested - will ask when needed');
    }
  }
  
  async function requestPermissionExplicit() {
    if (!isDashboardPage()) return;
    
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await MODAL.success('Notifications Enabled', 'You will now receive important notifications.');
      }
      return permission;
    }
    return 'denied';
  }
  
  async function addTestNotification() {
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Cannot add test notification on non-dashboard page');
      return;
    }
    
    await add({
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working.',
      type: 'info',
      link: null
    });
  }
  
  // Clean up listeners
  function cleanup() {
    if (notificationListener && typeof notificationListener === 'function') {
      notificationListener();
      notificationListener = null;
    }
    if (announcementListener && typeof announcementListener === 'function') {
      announcementListener();
      announcementListener = null;
    }
    if (window._notificationOutsideHandler) {
      document.removeEventListener('click', window._notificationOutsideHandler);
      window._notificationOutsideHandler = null;
    }
  }
  
  // Force refresh notifications
  async function refresh() {
    await loadAllNotifications();
  }
  
  return {
    init,
    add,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    subscribe,
    togglePanel,
    closePanel,
    handleNotificationClick,
    requestPermission,
    requestPermissionExplicit,
    addTestNotification,
    cleanup,
    refresh,
    getUnreadCount: () => unreadCount,
    getNotifications: () => notifications
  };
})();

// Make NOTIFICATIONS globally available
window.NOTIFICATIONS = NOTIFICATIONS;
