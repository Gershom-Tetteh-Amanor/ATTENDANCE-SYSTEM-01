/* student-messages.js — Course messages and announcements */
'use strict';

const STUDENT_MESSAGES = (() => {
  const core = () => window.STUDENT_CORE;
  const overview = () => window.STUDENT_OVERVIEW;
  
  async function loadMessagesView() {
    const container = document.getElementById('messages-view');
    if (!container) return;
    
    const periodCourses = overview().getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    if (periodCourses.length === 0) {
      container.innerHTML = `<div class="inner-panel"><div class="att-empty">📭 No courses found. Check in to a session first.</div></div>`;
      return;
    }
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => {
        const [year, semester] = p.split('_');
        return `<option value="${p}" ${parseInt(year) === core().state.currentSelectedYear && parseInt(semester) === core().state.currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = core().getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages</h3>
        <div class="filter-bar" style="margin-bottom: 16px; flex-wrap: wrap;">
          <div style="min-width: 150px;"><label class="fl">📅 Period</label><select id="message-period" class="fi" onchange="STUDENT_MESSAGES.changeMessagePeriod()">${periodsHtml}</select></div>
          <div style="min-width: 250px;"><label class="fl">📚 Course</label><select id="message-course-select" class="fi" onchange="STUDENT_MESSAGES.loadCourseMessages()"><option value="">-- Select --</option>${periodCourses.map(course => `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">${course.courseCode} - ${course.courseName} (${course.lecturerName})</option>`).join('')}</select></div>
          <div><button class="btn btn-outline btn-sm" id="refresh-messages-btn">🔄 Refresh</button></div>
        </div>
        <div id="course-messages-container" style="max-height: 500px; overflow-y: auto;"><div class="att-empty">📭 Select a course</div></div>
        <div id="message-input-area" style="display: none; margin-top: 20px;"><div class="message-input-container"><textarea id="new-message-text" class="fi" rows="3" placeholder="Type your message..."></textarea><div style="display: flex; justify-content: flex-end; margin-top: 8px;"><button class="btn btn-ug" id="send-message-btn">📤 Send</button></div></div></div>
      </div>
    `;
    
    document.getElementById('refresh-messages-btn').onclick = () => core().state.currentMessageCourse && loadCourseMessages();
    document.getElementById('send-message-btn').onclick = () => sendCourseMessage();
    document.getElementById('new-message-text').onkeypress = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendCourseMessage(); } };
  }

  async function changeMessagePeriod() {
    const periodSelect = document.getElementById('message-period');
    if (!periodSelect?.value) return;
    const [year, semester] = periodSelect.value.split('_');
    core().state.currentSelectedYear = parseInt(year);
    core().state.currentSelectedSemester = parseInt(semester);
    core().state.currentMessageCourse = null;
    await STUDENT_OVERVIEW.loadStudentData();
    const periodCourses = overview().getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('message-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select --</option>';
      for (const course of periodCourses) courseSelect.innerHTML += `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">${course.courseCode} - ${course.courseName} (${course.lecturerName})</option>`;
    }
    document.getElementById('course-messages-container').innerHTML = '<div class="att-empty">📭 Select a course</div>';
    document.getElementById('message-input-area').style.display = 'none';
  }

  async function loadCourseMessages() {
    await core().rateLimiters.filters.execute(async () => {
      const courseSelect = document.getElementById('message-course-select');
      const container = document.getElementById('course-messages-container');
      const inputArea = document.getElementById('message-input-area');
      const selectedValue = courseSelect?.value;
      if (!selectedValue) {
        container.innerHTML = '<div class="att-empty">📭 Select a course</div>';
        if (inputArea) inputArea.style.display = 'none';
        core().state.currentMessageCourse = null;
        return;
      }
      const parts = selectedValue.split('_');
      if (parts.length < 4) return;
      const courseCode = parts[0], year = parseInt(parts[1]), semester = parseInt(parts[2]), lecId = parts[3];
      core().state.currentMessageCourse = { courseCode, year, semester, lecId };
      container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading...</div>';
      if (inputArea) inputArea.style.display = 'block';
      try {
        const messages = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
        const messageList = messages ? Object.values(messages).sort((a, b) => b.timestamp - a.timestamp) : [];
        if (messageList.length === 0) { container.innerHTML = '<div class="att-empty">📭 No messages yet</div>'; return; }
        container.innerHTML = messageList.map(item => `<div class="message-card"><div class="message-header"><div><strong>${core().escapeHtml(item.senderName)}</strong> ${item.senderId === lecId ? '<span class="badge">Lecturer</span>' : ''}</div><span class="note">${core().formatTime(item.timestamp)}</span></div><div class="message-content">${core().escapeHtml(item.message)}</div><div><button class="btn btn-outline btn-sm reply-btn" data-id="${item.id}">💬 Reply</button></div></div>`).join('');
        document.querySelectorAll('.reply-btn').forEach(btn => { btn.onclick = () => showReplyForm(btn.dataset.id); });
      } catch(err) { console.error('Load messages error:', err); container.innerHTML = '<div class="no-rec">❌ Error loading messages</div>'; }
    });
  }

  async function showReplyForm(messageId) {
    const replyText = await MODAL.prompt('Reply', 'Enter your reply:', { icon: '💬', placeholder: 'Type here...' });
    if (!replyText) return;
    const courseInfo = core().state.currentMessageCourse;
    if (!courseInfo) return;
    const { courseCode, year, semester, lecId } = courseInfo;
    try {
      const message = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`);
      if (message) {
        const replies = message.replies || [];
        replies.push({ senderId: core().state.currentStudent.studentId, senderName: core().state.currentStudent.name, message: replyText, timestamp: Date.now() });
        await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, { ...message, replies });
        await loadCourseMessages();
        await MODAL.success('Reply Sent', '✅ Reply posted');
      }
    } catch(err) { await MODAL.error('Error', 'Failed to send reply'); }
  }

  async function sendCourseMessage() {
    const messageText = document.getElementById('new-message-text')?.value.trim();
    const courseInfo = core().state.currentMessageCourse;
    if (!courseInfo) { await MODAL.alert('Error', 'Select a course first'); return; }
    if (!messageText) { await MODAL.alert('Error', 'Enter a message'); return; }
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const sendBtn = document.getElementById('send-message-btn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="spin"></span> Sending...'; }
    try {
      await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, { id: messageId, senderId: core().state.currentStudent.studentId, senderName: core().state.currentStudent.name, message: messageText, timestamp: Date.now(), isAnnouncement: false, replies: [] });
      document.getElementById('new-message-text').value = '';
      await loadCourseMessages();
      await MODAL.success('Sent', '✅ Message posted');
    } catch(err) { await MODAL.error('Error', err.message); } finally { if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '📤 Send'; } }
  }

  async function loadAnnouncementsView() {
    const container = document.getElementById('announcements-view');
    if (!container) return;
    const periodCourses = overview().getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))].sort((a, b) => {
      const [yearA, semA] = a.split('_');
      const [yearB, semB] = b.split('_');
      if (yearA !== yearB) return yearB - yearA;
      return semB - semA;
    });
    if (periodCourses.length === 0) { container.innerHTML = `<div class="inner-panel"><div class="att-empty">📭 No courses found</div></div>`; return; }
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => { const [year, semester] = p.split('_'); return `<option value="${p}" ${parseInt(year) === core().state.currentSelectedYear && parseInt(semester) === core().state.currentSelectedSemester ? 'selected' : ''}>${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}</option>`; }).join('');
    } else {
      const availableYears = core().getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `<option value="${year}_1" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 1 ? 'selected' : ''}>${year} - First Semester</option><option value="${year}_2" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 2 ? 'selected' : ''}>${year} - Second Semester</option>`).join('');
    }
    container.innerHTML = `
      <div class="inner-panel">
        <h3>📢 Announcements</h3>
        <div class="filter-bar" style="margin-bottom: 16px;">
          <div style="min-width: 150px;"><label class="fl">📅 Period</label><select id="announcement-period" class="fi" onchange="STUDENT_MESSAGES.changeAnnouncementPeriod()">${periodsHtml}</select></div>
          <div style="min-width: 250px;"><label class="fl">📚 Course</label><select id="announcement-course-select" class="fi" onchange="STUDENT_MESSAGES.loadCourseAnnouncements()"><option value="">-- Select --</option>${periodCourses.map(course => `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">${course.courseCode} - ${course.courseName} (${course.lecturerName})</option>`).join('')}</select></div>
          <div><button class="btn btn-outline btn-sm" id="refresh-announcements-btn">🔄 Refresh</button></div>
        </div>
        <div id="announcements-container" style="max-height: 500px; overflow-y: auto;"><div class="att-empty">📭 Select a course</div></div>
      </div>
    `;
    document.getElementById('refresh-announcements-btn').onclick = () => core().state.currentAnnouncementCourse && loadCourseAnnouncements();
  }

  async function changeAnnouncementPeriod() {
    const periodSelect = document.getElementById('announcement-period');
    if (!periodSelect?.value) return;
    const [year, semester] = periodSelect.value.split('_');
    core().state.currentSelectedYear = parseInt(year);
    core().state.currentSelectedSemester = parseInt(semester);
    core().state.currentAnnouncementCourse = null;
    await STUDENT_OVERVIEW.loadStudentData();
    const periodCourses = overview().getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('announcement-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select --</option>';
      for (const course of periodCourses) courseSelect.innerHTML += `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">${course.courseCode} - ${course.courseName} (${course.lecturerName})</option>`;
    }
    document.getElementById('announcements-container').innerHTML = '<div class="att-empty">📭 Select a course</div>';
  }

  async function loadCourseAnnouncements() {
    const courseSelect = document.getElementById('announcement-course-select');
    const container = document.getElementById('announcements-container');
    const selectedValue = courseSelect?.value;
    if (!selectedValue) { container.innerHTML = '<div class="att-empty">📭 Select a course</div>'; core().state.currentAnnouncementCourse = null; return; }
    const parts = selectedValue.split('_');
    if (parts.length < 4) return;
    const courseCode = parts[0], year = parseInt(parts[1]), semester = parseInt(parts[2]), lecId = parts[3];
    core().state.currentAnnouncementCourse = { courseCode, year, semester, lecId };
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading...</div>';
    try {
      const announcements = await DB.get(`announcements/course/${lecId}/${courseCode}_${year}_${semester}`);
      const announcementList = announcements ? Object.values(announcements).sort((a, b) => b.timestamp - a.timestamp) : [];
      if (announcementList.length === 0) { container.innerHTML = '<div class="att-empty">📭 No announcements</div>'; return; }
      container.innerHTML = announcementList.map(ann => `<div class="message-card" style="border-left: 4px solid ${ann.priority === 'danger' ? '#d42b2b' : (ann.priority === 'warning' ? '#b8860b' : '#003087')}"><div class="message-header"><div><strong>📢 ${core().escapeHtml(ann.title)}</strong> <span class="badge">${ann.priority || 'info'}</span></div><span class="note">${core().formatTime(ann.timestamp)}</span></div><div class="message-content"><div><strong>From:</strong> ${core().escapeHtml(ann.senderName)}</div><hr>${core().escapeHtml(ann.message)}</div></div>`).join('');
    } catch(err) { console.error('Load announcements error:', err); container.innerHTML = '<div class="no-rec">❌ Error loading announcements</div>'; }
  }

  return {
    loadMessagesView,
    changeMessagePeriod,
    loadCourseMessages,
    sendCourseMessage,
    showReplyForm,
    loadAnnouncementsView,
    changeAnnouncementPeriod,
    loadCourseAnnouncements
  };
})();

window.STUDENT_MESSAGES = STUDENT_MESSAGES;
