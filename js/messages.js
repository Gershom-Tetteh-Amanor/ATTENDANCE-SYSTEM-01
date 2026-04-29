/* ============================================
   messages.js — Complete Messaging System
   Handles course messages, announcements, and replies
   ============================================ */
'use strict';

const MESSAGES = (() => {
  
  let currentUser = null;
  let currentCourse = null;
  let messageListener = null;
  let notificationListener = null;
  
  // ==================== INITIALIZATION ====================
  async function init(user) {
    currentUser = user;
    console.log('[MESSAGES] Initialized for user:', user.role, user.id || user.studentId);
    
    // Setup real-time listeners
    setupMessageListeners();
    setupNotificationListener();
  }
  
  // ==================== SETUP LISTENERS ====================
  function setupMessageListeners() {
    if (messageListener) messageListener();
    
    if (currentUser.role === 'student') {
      // Listen for messages in enrolled courses
      messageListener = DB.listen('messages/course', async () => {
        await checkForNewMessages();
      });
    } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
      // Listen for messages in lecturer's courses
      const lecId = currentUser.id || currentUser.activeLecturerId;
      if (lecId) {
        messageListener = DB.listen(`messages/course/${lecId}`, async () => {
          await checkForNewMessages();
        });
      }
    } else if (currentUser.role === 'superAdmin' || currentUser.role === 'coAdmin') {
      // Listen for department messages
      messageListener = DB.listen('messages/department', async () => {
        await checkForNewMessages();
      });
    }
  }
  
  function setupNotificationListener() {
    if (notificationListener) notificationListener();
    
    const userId = currentUser.id || currentUser.studentId;
    notificationListener = DB.listen(`notifications/${currentUser.role}/${userId}/messages`, async (data) => {
      if (data && Object.keys(data).length > 0) {
        // Update notification badge
        if (typeof NOTIFICATIONS !== 'undefined') {
          await NOTIFICATIONS.loadNotifications();
        }
        
        // Show browser notification for new messages
        const newMessages = Object.values(data);
        for (const msg of newMessages) {
          if (!msg.read) {
            showBrowserNotification(msg.title, msg.message);
          }
        }
      }
    });
  }
  
  async function checkForNewMessages() {
    // Update UI if messages tab is open
    const messagesTab = document.getElementById('messages-view');
    if (messagesTab && messagesTab.style.display !== 'none') {
      if (currentUser.role === 'student') {
        await loadStudentMessages();
      } else if (currentUser.role === 'lecturer' || currentUser.role === 'ta') {
        await loadLecturerMessages();
      } else if (currentUser.role === 'superAdmin' || currentUser.role === 'coAdmin') {
        await loadAdminMessages();
      }
    }
  }
  
  function showBrowserNotification(title, message) {
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
      new Notification(title, {
        body: message,
        icon: "/uo_ghana.png"
      });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }
  
  // ==================== STUDENT MESSAGES ====================
  async function loadStudentMessages() {
    const container = document.getElementById('course-messages-container');
    const courseSelect = document.getElementById('message-course-select');
    const inputArea = document.getElementById('message-input-area');
    
    if (!container) return;
    
    const courseValue = courseSelect?.value;
    if (!courseValue) {
      container.innerHTML = '<div class="att-empty">Select a course to view messages</div>';
      if (inputArea) inputArea.style.display = 'none';
      return;
    }
    
    const [courseCode, year, semester, lecId] = courseValue.split('_');
    if (!courseCode) {
      container.innerHTML = '<div class="att-empty">Select a course to view messages</div>';
      if (inputArea) inputArea.style.display = 'none';
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading messages...</div>';
    if (inputArea) inputArea.style.display = 'block';
    
    try {
      const messages = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
      
      if (!messages || Object.keys(messages).length === 0) {
        container.innerHTML = '<div class="att-empty">No messages yet. Be the first to send a message!</div>';
        return;
      }
      
      const messageList = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = messageList.map(msg => `
        <div class="message-card" style="margin-bottom: 16px; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
          <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
            <div>
              <strong style="color: var(--ug);">${escapeHtml(msg.senderName)}</strong>
              ${msg.senderId === lecId ? '<span class="badge" style="background: var(--ug); margin-left: 8px;">Lecturer</span>' : ''}
              ${msg.isAnnouncement ? '<span class="badge" style="background: #fcd116; color: #003087;">📢 Announcement</span>' : ''}
            </div>
            <span style="font-size: 11px; color: var(--text4);">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px; line-height: 1.6;">
            ${escapeHtml(msg.message)}
          </div>
          ${msg.attachments && msg.attachments.length > 0 ? `
            <div class="message-attachments" style="margin: 8px 0; display: flex; gap: 8px; flex-wrap: wrap;">
              ${msg.attachments.map(att => `
                <a href="${att.url}" target="_blank" class="btn btn-outline btn-sm" style="display: inline-flex; align-items: center; gap: 4px;">
                  📎 ${att.name}
                </a>
              `).join('')}
            </div>
          ` : ''}
          ${msg.replies && msg.replies.length > 0 ? `
            <div style="margin-top: 12px; padding-left: 16px; border-left: 2px solid var(--border);">
              <div style="font-size: 12px; color: var(--text3); margin-bottom: 8px;">💬 ${msg.replies.length} repl${msg.replies.length === 1 ? 'y' : 'ies'}</div>
              ${msg.replies.slice(-3).map(reply => `
                <div style="font-size: 12px; margin-bottom: 8px; background: var(--surface2); padding: 8px; border-radius: 8px;">
                  <strong>${reply.senderName === currentUser.name ? 'You' : escapeHtml(reply.senderName)}</strong>
                  <span style="font-size: 10px; color: var(--text4); margin-left: 8px;">${formatTime(reply.timestamp)}</span>
                  <div style="margin-top: 4px;">${escapeHtml(reply.message)}</div>
                </div>
              `).join('')}
              ${msg.replies.length > 3 ? `<div style="font-size: 11px; color: var(--text4); text-align: center;">... and ${msg.replies.length - 3} more replies</div>` : ''}
            </div>
          ` : ''}
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm" onclick="MESSAGES.showReplyForm('${msg.id}')">💬 Reply</button>
            ${msg.senderId === (currentUser.id || currentUser.studentId) ? 
              `<button class="btn btn-danger btn-sm" onclick="MESSAGES.deleteMessage('${msg.id}')">🗑️ Delete</button>` : ''}
          </div>
        </div>
      `).join('');
      
      window.currentMessageCourse = { courseCode, year, semester, lecId };
      
      // Mark messages as read
      await markMessagesAsRead(courseCode, year, semester, lecId);
      
    } catch(err) {
      console.error('[MESSAGES] Load error:', err);
      container.innerHTML = '<div class="no-rec">Error loading messages</div>';
    }
  }
  
  async function sendStudentMessage() {
    const messageText = document.getElementById('new-message-text')?.value.trim();
    const courseInfo = window.currentMessageCourse;
    
    if (!courseInfo) {
      await MODAL.alert('No Course', 'Please select a course first.');
      return;
    }
    
    if (!messageText) {
      await MODAL.alert('No Message', 'Please enter a message.');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    
    const message = {
      id: messageId,
      senderId: currentUser.studentId,
      senderName: currentUser.name,
      message: messageText,
      timestamp: Date.now(),
      isAnnouncement: false,
      replies: [],
      attachments: []
    };
    
    await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, message);
    
    // Add notification for lecturer
    await DB.set(`notifications/lecturer/${lecId}/messages/${messageId}`, {
      id: messageId,
      title: `💬 New Message: ${courseCode}`,
      message: `${currentUser.name}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
      type: 'info',
      timestamp: Date.now(),
      read: false,
      link: null
    });
    
    document.getElementById('new-message-text').value = '';
    await loadStudentMessages();
    await MODAL.success('Message Sent', 'Your message has been posted to the course discussion.');
  }
  
  // ==================== LECTURER MESSAGES ====================
  async function loadLecturerMessages() {
    const container = document.getElementById('lecturer-messages-container');
    const courseSelect = document.getElementById('lecturer-message-course');
    
    if (!container) return;
    
    const courseValue = courseSelect?.value;
    if (!courseValue) {
      container.innerHTML = '<div class="att-empty">Select a course to view messages</div>';
      return;
    }
    
    const [courseCode, year, semester] = courseValue.split('_');
    const lecId = currentUser.id || currentUser.activeLecturerId;
    
    if (!courseCode) {
      container.innerHTML = '<div class="att-empty">Select a course to view messages</div>';
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading messages...</div>';
    
    try {
      const messages = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
      
      if (!messages || Object.keys(messages).length === 0) {
        container.innerHTML = '<div class="att-empty">No messages yet. Send an announcement to your students!</div>';
        return;
      }
      
      const messageList = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = messageList.map(msg => `
        <div class="message-card" style="margin-bottom: 16px; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
          <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
            <div>
              <strong style="color: var(--ug);">${escapeHtml(msg.senderName)}</strong>
              ${msg.senderId === lecId ? '<span class="badge" style="background: var(--ug); margin-left: 8px;">You (Lecturer)</span>' : '<span class="badge" style="background: var(--teal); margin-left: 8px;">Student</span>'}
              ${msg.isAnnouncement ? '<span class="badge" style="background: #fcd116; color: #003087;">📢 Announcement</span>' : ''}
            </div>
            <span style="font-size: 11px; color: var(--text4);">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px; line-height: 1.6;">
            ${escapeHtml(msg.message)}
          </div>
          ${msg.replies && msg.replies.length > 0 ? `
            <div style="margin-top: 12px;">
              <div style="font-size: 12px; color: var(--text3); margin-bottom: 8px;">💬 ${msg.replies.length} repl${msg.replies.length === 1 ? 'y' : 'ies'}</div>
              ${msg.replies.map(reply => `
                <div style="font-size: 12px; margin-bottom: 8px; background: var(--surface2); padding: 8px; border-radius: 8px;">
                  <strong>${escapeHtml(reply.senderName)}</strong> <span style="font-size: 10px; color: var(--text4);">${formatTime(reply.timestamp)}</span>
                  <div style="margin-top: 4px;">${escapeHtml(reply.message)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="btn btn-outline btn-sm" onclick="MESSAGES.showLecturerReplyForm('${msg.id}')">💬 Reply</button>
            <button class="btn btn-teal btn-sm" onclick="MESSAGES.sendAnnouncement('${msg.id}')">📢 Make Announcement</button>
            ${msg.senderId === lecId ? 
              `<button class="btn btn-danger btn-sm" onclick="MESSAGES.deleteMessage('${msg.id}')">🗑️ Delete</button>` : ''}
          </div>
        </div>
      `).join('');
      
      window.currentLecturerCourse = { courseCode, year, semester, lecId };
      
    } catch(err) {
      console.error('[MESSAGES] Load error:', err);
      container.innerHTML = '<div class="no-rec">Error loading messages</div>';
    }
  }
  
  async function sendLecturerMessage() {
    const messageText = document.getElementById('lecturer-message-text')?.value.trim();
    const isAnnouncement = document.getElementById('is-announcement')?.checked || false;
    const courseInfo = window.currentLecturerCourse;
    
    if (!courseInfo) {
      await MODAL.alert('No Course', 'Please select a course first.');
      return;
    }
    
    if (!messageText) {
      await MODAL.alert('No Message', 'Please enter a message.');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    
    const message = {
      id: messageId,
      senderId: lecId,
      senderName: currentUser.name,
      message: messageText,
      timestamp: Date.now(),
      isAnnouncement: isAnnouncement,
      replies: [],
      attachments: []
    };
    
    await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, message);
    
    // Get all enrolled students for this course
    const enrollments = await DB.ENROLLMENT.getStudentEnrollments(null, lecId);
    const courseEnrollments = enrollments.filter(e => e.courseCode === courseCode && e.year === parseInt(year) && e.semester === parseInt(semester));
    
    // Send notifications to all enrolled students
    for (const enrollment of courseEnrollments) {
      await DB.set(`notifications/student/${enrollment.studentId}/messages/${messageId}`, {
        id: messageId,
        title: isAnnouncement ? `📢 Announcement: ${courseCode}` : `💬 New Message: ${courseCode}`,
        message: `${currentUser.name}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
        type: isAnnouncement ? 'warning' : 'info',
        timestamp: Date.now(),
        read: false,
        link: null
      });
    }
    
    document.getElementById('lecturer-message-text').value = '';
    if (document.getElementById('is-announcement')) {
      document.getElementById('is-announcement').checked = false;
    }
    await loadLecturerMessages();
    
    const msgType = isAnnouncement ? 'announcement' : 'message';
    await MODAL.success(`${msgType.charAt(0).toUpperCase() + msgType.slice(1)} Sent`, `Your ${msgType} has been sent to all students in ${courseCode}.`);
  }
  
  async function sendAnnouncement(messageId) {
    const announcementText = await MODAL.prompt(
      'Send Announcement',
      'Enter your announcement message (this will be highlighted and sent to all students):',
      { icon: '📢', placeholder: 'Type your announcement here...', confirmLabel: 'Send Announcement' }
    );
    
    if (!announcementText) return;
    
    const courseInfo = window.currentLecturerCourse;
    if (!courseInfo) return;
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageRef = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
    const existingMessage = await DB.get(messageRef);
    
    if (existingMessage) {
      const announcementMsg = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
        senderId: lecId,
        senderName: currentUser.name,
        message: `📢 ANNOUNCEMENT: ${announcementText}`,
        timestamp: Date.now(),
        isAnnouncement: true,
        replies: [],
        attachments: []
      };
      
      await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${announcementMsg.id}`, announcementMsg);
      
      // Get all enrolled students
      const enrollments = await DB.ENROLLMENT.getStudentEnrollments(null, lecId);
      const courseEnrollments = enrollments.filter(e => e.courseCode === courseCode && e.year === parseInt(year) && e.semester === parseInt(semester));
      
      for (const enrollment of courseEnrollments) {
        await DB.set(`notifications/student/${enrollment.studentId}/messages/announcement_${announcementMsg.id}`, {
          id: `announcement_${announcementMsg.id}`,
          title: `📢 Announcement: ${courseCode}`,
          message: announcementText.substring(0, 150),
          type: 'warning',
          timestamp: Date.now(),
          read: false,
          link: null
        });
      }
      
      await loadLecturerMessages();
      await MODAL.success('Announcement Sent', `Your announcement has been sent to all students in ${courseCode}.`);
    }
  }
  
  // ==================== ADMIN MESSAGES ====================
  async function loadAdminMessages() {
    const container = document.getElementById('admin-messages-container');
    const deptSelect = document.getElementById('admin-message-dept');
    
    if (!container) return;
    
    const department = deptSelect?.value;
    if (!department) {
      container.innerHTML = '<div class="att-empty">Select a department to view messages</div>';
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading messages...</div>';
    
    try {
      const messages = await DB.get(`messages/department/${department}`);
      
      if (!messages || Object.keys(messages).length === 0) {
        container.innerHTML = '<div class="att-empty">No messages for this department.</div>';
        return;
      }
      
      const messageList = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = messageList.map(msg => `
        <div class="message-card" style="margin-bottom: 16px; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
          <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <strong style="color: var(--ug);">${escapeHtml(msg.senderName)}</strong>
              <span class="badge" style="background: ${msg.senderRole === 'superAdmin' ? 'var(--danger)' : 'var(--amber)'};">${msg.senderRole === 'superAdmin' ? 'Admin' : 'Co-Admin'}</span>
            </div>
            <span style="font-size: 11px; color: var(--text4);">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px;">
            ${escapeHtml(msg.message)}
          </div>
          <div style="margin-top: 12px;">
            <button class="btn btn-outline btn-sm" onclick="MESSAGES.showAdminReplyForm('${msg.id}')">💬 Reply</button>
            ${currentUser.role === 'superAdmin' ? 
              `<button class="btn btn-danger btn-sm" onclick="MESSAGES.deleteAdminMessage('${msg.id}')">🗑️ Delete</button>` : ''}
          </div>
        </div>
      `).join('');
      
      window.currentAdminDept = department;
      
    } catch(err) {
      console.error('[MESSAGES] Load admin error:', err);
      container.innerHTML = '<div class="no-rec">Error loading messages</div>';
    }
  }
  
  async function sendAdminMessage() {
    const messageText = document.getElementById('admin-message-text')?.value.trim();
    const department = window.currentAdminDept;
    
    if (!department) {
      await MODAL.alert('No Department', 'Please select a department first.');
      return;
    }
    
    if (!messageText) {
      await MODAL.alert('No Message', 'Please enter a message.');
      return;
    }
    
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    const senderRole = currentUser.role === 'superAdmin' ? 'superAdmin' : 'coAdmin';
    
    const message = {
      id: messageId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: senderRole,
      message: messageText,
      timestamp: Date.now(),
      replies: []
    };
    
    await DB.set(`messages/department/${department}/${messageId}`, message);
    
    // Notify all lecturers in the department
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === department);
    
    for (const lecturer of deptLecturers) {
      await DB.set(`notifications/lecturer/${lecturer.id}/messages/${messageId}`, {
        id: messageId,
        title: `📢 Department Message: ${department}`,
        message: `${currentUser.name}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
        type: 'info',
        timestamp: Date.now(),
        read: false,
        link: null
      });
    }
    
    document.getElementById('admin-message-text').value = '';
    await loadAdminMessages();
    await MODAL.success('Message Sent', `Your message has been sent to all lecturers in ${department}.`);
  }
  
  // ==================== REPLY FUNCTIONS ====================
  async function showReplyForm(messageId) {
    const replyText = await MODAL.prompt(
      'Reply to Message',
      'Enter your reply:',
      { icon: '💬', placeholder: 'Type your reply here...', confirmLabel: 'Send Reply' }
    );
    if (!replyText) return;
    
    await sendReply(messageId, replyText);
  }
  
  async function showLecturerReplyForm(messageId) {
    const replyText = await MODAL.prompt(
      'Reply to Student',
      'Enter your reply (students will be notified):',
      { icon: '💬', placeholder: 'Type your reply here...', confirmLabel: 'Send Reply' }
    );
    if (!replyText) return;
    
    await sendReply(messageId, replyText);
  }
  
  async function showAdminReplyForm(messageId) {
    const replyText = await MODAL.prompt(
      'Reply to Message',
      'Enter your reply:',
      { icon: '💬', placeholder: 'Type your reply here...', confirmLabel: 'Send Reply' }
    );
    if (!replyText) return;
    
    await sendAdminReply(messageId, replyText);
  }
  
  async function sendReply(messageId, replyText) {
    let courseInfo = window.currentMessageCourse || window.currentLecturerCourse;
    let isCourseMessage = true;
    
    if (!courseInfo && window.currentAdminDept) {
      isCourseMessage = false;
    }
    
    if (isCourseMessage && !courseInfo) {
      await MODAL.alert('Error', 'No course selected.');
      return;
    }
    
    if (isCourseMessage) {
      const { courseCode, year, semester, lecId } = courseInfo;
      const messageRef = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
      const existingMessage = await DB.get(messageRef);
      
      if (existingMessage) {
        const replies = existingMessage.replies || [];
        replies.push({
          senderId: currentUser.id || currentUser.studentId,
          senderName: currentUser.name,
          message: replyText,
          timestamp: Date.now()
        });
        await DB.set(messageRef, { ...existingMessage, replies });
        
        // Notify the original sender
        const notifyId = existingMessage.senderId;
        const notifyRole = existingMessage.senderId === lecId ? 'lecturer' : 'student';
        const notifyUserId = existingMessage.senderId;
        
        await DB.set(`notifications/${notifyRole}/${notifyUserId}/messages/reply_${Date.now()}`, {
          id: `reply_${Date.now()}`,
          title: `💬 New Reply: ${courseCode}`,
          message: `${currentUser.name} replied to your message: ${replyText.substring(0, 100)}`,
          type: 'info',
          timestamp: Date.now(),
          read: false,
          link: null
        });
      }
    } else {
      await sendAdminReply(messageId, replyText);
      return;
    }
    
    if (currentUser.role === 'student') {
      await loadStudentMessages();
    } else {
      await loadLecturerMessages();
    }
    
    await MODAL.success('Reply Sent', 'Your reply has been posted.');
  }
  
  async function sendAdminReply(messageId, replyText) {
    const department = window.currentAdminDept;
    if (!department) return;
    
    const messageRef = `messages/department/${department}/${messageId}`;
    const existingMessage = await DB.get(messageRef);
    
    if (existingMessage) {
      const replies = existingMessage.replies || [];
      replies.push({
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        message: replyText,
        timestamp: Date.now()
      });
      await DB.set(messageRef, { ...existingMessage, replies });
      
      // Notify the original sender
      if (existingMessage.senderId !== currentUser.id) {
        const notifyRole = existingMessage.senderRole === 'superAdmin' ? 'superAdmin' : 'coAdmin';
        await DB.set(`notifications/${notifyRole}/${existingMessage.senderId}/messages/reply_${Date.now()}`, {
          id: `reply_${Date.now()}`,
          title: `💬 New Reply: ${department}`,
          message: `${currentUser.name} replied to your message: ${replyText.substring(0, 100)}`,
          type: 'info',
          timestamp: Date.now(),
          read: false,
          link: null
        });
      }
    }
    
    await loadAdminMessages();
    await MODAL.success('Reply Sent', 'Your reply has been posted.');
  }
  
  // ==================== DELETE FUNCTIONS ====================
  async function deleteMessage(messageId) {
    const confirmed = await MODAL.confirm('Delete Message', 'Are you sure you want to delete this message? This cannot be undone.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    let courseInfo = window.currentMessageCourse || window.currentLecturerCourse;
    
    if (courseInfo) {
      const { courseCode, year, semester, lecId } = courseInfo;
      await DB.remove(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`);
    }
    
    if (currentUser.role === 'student') {
      await loadStudentMessages();
    } else {
      await loadLecturerMessages();
    }
    
    await MODAL.success('Message Deleted', 'The message has been deleted.');
  }
  
  async function deleteAdminMessage(messageId) {
    const confirmed = await MODAL.confirm('Delete Message', 'Are you sure you want to delete this message? This cannot be undone.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const department = window.currentAdminDept;
    if (department) {
      await DB.remove(`messages/department/${department}/${messageId}`);
      await loadAdminMessages();
      await MODAL.success('Message Deleted', 'The message has been deleted.');
    }
  }
  
  async function markMessagesAsRead(courseCode, year, semester, lecId) {
    const userId = currentUser.id || currentUser.studentId;
    const notifications = await DB.get(`notifications/${currentUser.role}/${userId}/messages`);
    
    if (notifications) {
      for (const [key, notif] of Object.entries(notifications)) {
        if (!notif.read && notif.title.includes(courseCode)) {
          await DB.set(`notifications/${currentUser.role}/${userId}/messages/${key}/read`, true);
        }
      }
    }
    
    if (typeof NOTIFICATIONS !== 'undefined') {
      await NOTIFICATIONS.loadNotifications();
    }
  }
  
  // ==================== HELPER FUNCTIONS ====================
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
  
  // ==================== CLEANUP ====================
  function cleanup() {
    if (messageListener) {
      messageListener();
      messageListener = null;
    }
    if (notificationListener) {
      notificationListener();
      notificationListener = null;
    }
  }
  
  // ==================== EXPORTS ====================
  return {
    init,
    cleanup,
    loadStudentMessages,
    loadLecturerMessages,
    loadAdminMessages,
    sendStudentMessage,
    sendLecturerMessage,
    sendAdminMessage,
    sendAnnouncement,
    showReplyForm,
    showLecturerReplyForm,
    showAdminReplyForm,
    deleteMessage,
    deleteAdminMessage,
    formatTime
  };
})();

// Make globally available
window.MESSAGES = MESSAGES;
