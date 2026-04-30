/* ============================================
   notifications.js — Real-time notification system
   FIXED: Only shows on bell click, closes on outside click
   ============================================ */
'use strict';

const NOTIFICATIONS = (() => {
  
  let notifications = [];
  let unreadCount = 0;
  let listeners = [];
  let currentUser = null;
  let panelCreated = false;
  let notificationListener = null;
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
    
    await loadNotifications();
    setupRealTimeListener();
    setupUI();
    setupOutsideClickListener();
  }
  
  // Load notifications from Firebase
  async function loadNotifications() {
    if (!currentUser) return;
    
    const userId = currentUser.id || currentUser.studentId;
    if (!userId) {
      console.warn('[NOTIFICATIONS] No user ID found');
      return;
    }
    
    const path = `notifications/${currentUser.role}/${userId}`;
    const data = await safeGet(path);
    
    if (data && data.notifications) {
      notifications = Object.values(data.notifications).sort((a, b) => b.timestamp - a.timestamp);
      unreadCount = notifications.filter(n => !n.read).length;
    } else {
      notifications = [];
      unreadCount = 0;
    }
    
    console.log('[NOTIFICATIONS] Loaded', notifications.length, 'notifications');
    notifyListeners();
    updateBadge();
  }
  
  // Setup real-time listener for new notifications
  function setupRealTimeListener() {
    if (!currentUser) return;
    
    const userId = currentUser.id || currentUser.studentId;
    if (!userId) return;
    
    const path = `notifications/${currentUser.role}/${userId}`;
    
    // Remove existing listener if any
    if (notificationListener && typeof notificationListener === 'function') {
      notificationListener();
      notificationListener = null;
    }
    
    notificationListener = safeListen(path, (data) => {
      // Only process if still on dashboard
      if (!isDashboardPage()) return;
      
      if (data && data.notifications) {
        const newNotifications = Object.values(data.notifications).sort((a, b) => b.timestamp - a.timestamp);
        const oldIds = new Set(notifications.map(n => n.id));
        const newOnes = newNotifications.filter(n => !oldIds.has(n.id));
        
        notifications = newNotifications;
        unreadCount = notifications.filter(n => !n.read).length;
        
        // FIXED: Only show browser notification if page is visible AND panel is NOT open
        // AND user hasn't clicked the bell (don't auto-popup)
        const panel = document.querySelector('.notification-panel');
        const isPanelOpen = panel && panel.classList.contains('open');
        
        // Only show browser notifications for important messages (like announcements)
        // when the panel is not open, to avoid double notifications
        if (document.visibilityState === 'visible' && !isPanelOpen) {
          // Only show browser notification for high-priority messages
          newOnes.forEach(notification => {
            if (notification.type === 'warning' || notification.type === 'danger') {
              showBrowserNotification(notification);
            }
          });
        }
        
        notifyListeners();
        updateBadge();
        
        // Re-render panel if open
        if (isPanelOpen) {
          renderNotifications();
        }
      }
    });
  }
  
  // Show browser notification (only for important messages)
  function showBrowserNotification(notification) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    
    // Only show if on dashboard
    if (!isDashboardPage()) return;
    
    // Don't show if panel is already open
    const panel = document.querySelector('.notification-panel');
    if (panel && panel.classList.contains('open')) return;
    
    new Notification(notification.title, {
      body: notification.message,
      icon: "/uo_ghana.png",
      silent: false
    });
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
    
    return newNotification;
  }
  
  // Mark notification as read
  async function markAsRead(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return;
    
    notification.read = true;
    unreadCount--;
    
    const userId = currentUser.id || currentUser.studentId;
    if (userId) {
      const path = `notifications/${currentUser.role}/${userId}/notifications/${notificationId}/read`;
      await safeSet(path, true);
    }
    
    notifyListeners();
    updateBadge();
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
    
    // Re-render panel if open
    const panel = document.querySelector('.notification-panel');
    if (panel && panel.classList.contains('open')) {
      renderNotifications();
    }
  }
  
  // Setup UI components
  function setupUI() {
    if (panelCreated) return;
    
    // Don't create notification UI on non-dashboard pages
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Skipping UI setup on non-dashboard page');
      return;
    }
    
    // Create notification bell if not exists
    let bellContainer = document.querySelector('.notification-wrapper');
    if (!bellContainer) {
      const topbar = document.querySelector('.topbar');
      if (topbar && topbar.querySelector('.topbar-right')) {
        bellContainer = document.createElement('div');
        bellContainer.className = 'notification-wrapper';
        
        const bellBtn = document.createElement('button');
        bellBtn.className = 'notification-bell';
        bellBtn.innerHTML = '🔔';
        bellBtn.title = 'Notifications';
        bellBtn.onclick = (e) => {
          e.stopPropagation();
          togglePanel();
        };
        
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.style.display = 'none';
        
        bellContainer.appendChild(bellBtn);
        bellContainer.appendChild(badge);
        
        // Insert into topbar-right
        const topbarRight = topbar.querySelector('.topbar-right');
        const userInfo = topbarRight.querySelector('.user-info');
        const themeBtn = topbarRight.querySelector('.theme-btn');
        
        if (userInfo && userInfo.nextSibling) {
          topbarRight.insertBefore(bellContainer, userInfo.nextSibling);
        } else if (themeBtn) {
          topbarRight.insertBefore(bellContainer, themeBtn);
        } else {
          topbarRight.appendChild(bellContainer);
        }
        
        panelCreated = true;
      }
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
  }
  
  // Setup click outside listener to close panel
  function setupOutsideClickListener() {
    // Remove any existing listener to avoid duplicates
    document.removeEventListener('click', window._notificationOutsideHandler);
    
    // Create handler
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
        
        if (!isClickInsidePanel && !isClickOnBell && !isClickInWrapper) {
          console.log('[NOTIFICATIONS] Click outside - closing panel');
          closePanel();
        }
      }
    };
    
    document.addEventListener('click', window._notificationOutsideHandler);
  }
  
  // Toggle notification panel - ONLY opens/closes on bell click
  function togglePanel() {
    // Only allow on dashboard pages
    if (!isDashboardPage()) {
      console.log('[NOTIFICATIONS] Cannot open panel on non-dashboard page');
      return;
    }
    
    const panel = document.querySelector('.notification-panel');
    if (!panel) return;
    
    // Toggle the panel
    if (panel.classList.contains('open')) {
      closePanel();
    } else {
      // Close any other open panels first
      document.querySelectorAll('.notification-panel.open').forEach(p => {
        if (p !== panel) p.classList.remove('open');
      });
      panel.classList.add('open');
      renderNotifications();
      console.log('[NOTIFICATIONS] Panel opened');
    }
  }
  
  // Close panel
  function closePanel() {
    const panel = document.querySelector('.notification-panel');
    if (panel && panel.classList.contains('open')) {
      panel.classList.remove('open');
      console.log('[NOTIFICATIONS] Panel closed');
    }
  }
  
  // Render notifications in panel
  function renderNotifications() {
    const list = document.querySelector('.notification-list');
    if (!list) return;
    
    if (notifications.length === 0) {
      list.innerHTML = '<div class="notification-item" style="text-align:center; color:var(--text3);">No notifications</div>';
      return;
    }
    
    list.innerHTML = notifications.map(notification => `
      <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}" onclick="NOTIFICATIONS.handleNotificationClick('${notification.id}')">
        <div class="notification-title">${escapeHtml(notification.title)}</div>
        <div class="notification-message">${escapeHtml(notification.message)}</div>
        <div class="notification-time">${formatTime(notification.timestamp)}</div>
        <button class="delete-notif" onclick="event.stopPropagation(); NOTIFICATIONS.deleteNotification('${notification.id}')">✕</button>
      </div>
    `).join('');
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
  
  function handleNotificationClick(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
      markAsRead(notificationId);
      if (notification.link) {
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
        if (bell) bell.style.setProperty('animation', 'bellShake 0.5s ease');
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
  
  // Request notification permission (only if user wants it)
  function requestPermission() {
    if (!isDashboardPage()) return;
    
    if ("Notification" in window && Notification.permission === "default") {
      // Don't auto-request, only when user clicks something
      // This prevents unwanted permission popups
      console.log('[NOTIFICATIONS] Permission not requested - will ask when needed');
    }
  }
  
  // Request permission explicitly (call this when user enables notifications)
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
  
  // Add a test notification (for debugging)
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
    // Remove outside click listener
    if (window._notificationOutsideHandler) {
      document.removeEventListener('click', window._notificationOutsideHandler);
      window._notificationOutsideHandler = null;
    }
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
    getUnreadCount: () => unreadCount,
    getNotifications: () => notifications
  };
})();

// Make sure NOTIFICATIONS is globally available
window.NOTIFICATIONS = NOTIFICATIONS;
