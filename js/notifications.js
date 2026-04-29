/* ============================================
   notifications.js — Real-time notification system
   Fixed: DOM insertion error
   ============================================ */
'use strict';

const NOTIFICATIONS = (() => {
  
  let notifications = [];
  let unreadCount = 0;
  let listeners = [];
  let currentUser = null;
  let panelCreated = false;
  
  // Initialize notification system
  async function init(user) {
    currentUser = user;
    await loadNotifications();
    setupRealTimeListener();
    setupUI();
  }
  
  // Load notifications from Firebase
  async function loadNotifications() {
    if (!currentUser) return;
    
    const path = `notifications/${currentUser.role}/${currentUser.id}`;
    const data = await DB.get(path);
    
    if (data && data.notifications) {
      notifications = Object.values(data.notifications).sort((a, b) => b.timestamp - a.timestamp);
      unreadCount = notifications.filter(n => !n.read).length;
    } else {
      notifications = [];
      unreadCount = 0;
    }
    
    notifyListeners();
    updateBadge();
  }
  
  // Setup real-time listener for new notifications
  function setupRealTimeListener() {
    if (!currentUser) return;
    
    const path = `notifications/${currentUser.role}/${currentUser.id}`;
    DB.listen(path, (data) => {
      if (data && data.notifications) {
        const newNotifications = Object.values(data.notifications).sort((a, b) => b.timestamp - a.timestamp);
        const oldIds = new Set(notifications.map(n => n.id));
        const newOnes = newNotifications.filter(n => !oldIds.has(n.id));
        
        notifications = newNotifications;
        unreadCount = notifications.filter(n => !n.read).length;
        
        // Show browser notification for new ones
        newOnes.forEach(notification => {
          showBrowserNotification(notification);
        });
        
        notifyListeners();
        updateBadge();
      }
    });
  }
  
  // Show browser notification
  function showBrowserNotification(notification) {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      new Notification(notification.title, {
        body: notification.message,
        icon: "/uo_ghana.png"
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }
  
  // Add a new notification
  async function add(notification) {
    if (!currentUser) return;
    
    const newNotification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      link: notification.link || null,
      timestamp: Date.now(),
      read: false
    };
    
    const path = `notifications/${currentUser.role}/${currentUser.id}/notifications/${newNotification.id}`;
    await DB.set(path, newNotification);
    
    // Also send email for important notifications
    if (notification.sendEmail && notification.email) {
      await sendEmailNotification(notification.email, notification.title, notification.message);
    }
    
    return newNotification;
  }
  
  // Mark notification as read
  async function markAsRead(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.read) return;
    
    notification.read = true;
    unreadCount--;
    
    const path = `notifications/${currentUser.role}/${currentUser.id}/notifications/${notificationId}/read`;
    await DB.set(path, true);
    
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
    const path = `notifications/${currentUser.role}/${currentUser.id}/notifications/${notificationId}`;
    await DB.remove(path);
    notifications = notifications.filter(n => n.id !== notificationId);
    unreadCount = notifications.filter(n => !n.read).length;
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
    
    // Create notification bell if not exists
    let bellContainer = document.querySelector('.notification-wrapper');
    if (!bellContainer) {
      const topbar = document.querySelector('.topbar');
      if (topbar) {
        bellContainer = document.createElement('div');
        bellContainer.className = 'notification-wrapper';
        
        const bellBtn = document.createElement('button');
        bellBtn.className = 'notification-bell';
        bellBtn.innerHTML = '🔔';
        bellBtn.onclick = (e) => {
          e.stopPropagation();
          togglePanel();
        };
        
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.style.display = 'none';
        
        bellContainer.appendChild(bellBtn);
        bellContainer.appendChild(badge);
        
        // Find the right position to insert (before theme button or at the end)
        const themeBtn = topbar.querySelector('.theme-btn');
        const topbarRight = topbar.querySelector('.topbar-right');
        
        if (topbarRight) {
          // Insert into topbar-right
          const userInfo = topbarRight.querySelector('.user-info');
          if (userInfo) {
            topbarRight.insertBefore(bellContainer, userInfo.nextSibling);
          } else {
            topbarRight.insertBefore(bellContainer, themeBtn || null);
          }
        } else if (themeBtn) {
          topbar.insertBefore(bellContainer, themeBtn);
        } else {
          topbar.appendChild(bellContainer);
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
  
  // Toggle notification panel
  function togglePanel() {
    const panel = document.querySelector('.notification-panel');
    if (!panel) return;
    
    // Close any other open panels
    document.querySelectorAll('.notification-panel.open').forEach(p => {
      if (p !== panel) p.classList.remove('open');
    });
    
    panel.classList.toggle('open');
    
    if (panel.classList.contains('open')) {
      renderNotifications();
    }
  }
  
  // Close panel
  function closePanel() {
    const panel = document.querySelector('.notification-panel');
    if (panel) {
      panel.classList.remove('open');
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
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
        if (bell) bell.classList.add('has-notifications');
      } else {
        badge.style.display = 'none';
        if (bell) bell.classList.remove('has-notifications');
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
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
  
  // Add a test notification (for debugging)
  async function addTestNotification() {
    await add({
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working.',
      type: 'info',
      link: null
    });
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
    addTestNotification,
    getUnreadCount: () => unreadCount,
    getNotifications: () => notifications
  };
})();

// Make sure NOTIFICATIONS is globally available
window.NOTIFICATIONS = NOTIFICATIONS;
