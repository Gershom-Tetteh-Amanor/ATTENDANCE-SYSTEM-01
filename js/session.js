/* session.js — Lecturer & TA Dashboard with Complete Functionality (FULLY UPDATED) */
'use strict';

// Self-registration to ensure LEC is available globally
(function() {
  if (typeof window.LEC === 'undefined') {
    window.LEC = {};
  }
})();

const LEC = (() => {
  const S = { 
    session: null, 
    locOn: true, 
    lecLat: null, 
    lecLng: null, 
    locAcquired: false, 
    tickTimer: null, 
    unsubRec: null, 
    unsubBlk: null,
    currentViewYear: null,
    currentViewSemester: null,
    currentViewCourse: null,
    refreshInterval: null,
    currentReportData: null,
    activeSessionsRefresh: null,
    currentSessionRecords: null,
    currentSessionData: null,
    currentRecordsCourseCode: null,
    currentRecordsYear: null,
    currentRecordsSemester: null,
    selectedReportCourse: null,
    selectedReportYear: null,
    selectedReportSemester: null,
    courseSessionsCache: [],
    courseEnrollmentsCache: []
  };

  // Helper to get current lecturer/TA ID
  function getCurrentLecturerId() {
    const user = AUTH.getSession();
    if (!user) {
      console.error('[LEC] No user session found');
      return null;
    }
    if (user.role === 'ta') {
      const lecId = user.activeLecturerId || user.id;
      return lecId;
    }
    return user.id;
  }

  function getCurrentUser() {
    return AUTH.getSession();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    if (month >= 7) semester = 1;
    else if (month >= 0 && month <= 6) semester = 2;
    else semester = 1;
    return { year, semester };
  }

  function getMinAttendancePercentage() {
    const saved = localStorage.getItem('min_attendance_percentage');
    if (saved && !isNaN(parseInt(saved))) {
      return parseInt(saved);
    }
    return 75;
  }

  function getAttendanceCategory(percentage) {
    if (percentage >= 80) return { level: 'excellent', text: '✅ Excellent', color: 'var(--teal)' };
    if (percentage >= 75) return { level: 'good', text: '⚠️ Good', color: 'var(--amber)' };
    if (percentage >= 60) return { level: 'atRisk', text: '🔴 At Risk', color: '#e67e22' };
    return { level: 'critical', text: '❌ Critical', color: 'var(--danger)' };
  }

  // ==================== SWITCH TAB ====================
  async function switchTab(tabName) {
    console.log('[LEC] Switching to tab:', tabName);
    
    document.querySelectorAll('#view-lecturer .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      }
    });
    
    document.querySelectorAll('#view-lecturer .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    const tbTitle = document.getElementById('lec-tb-title');
    const titles = {
      mycourses: '📚 My Courses',
      session: '🟢 Active Sessions',
      records: '📋 Attendance Records',
      reports: '📊 Reports',
      courses: '📖 Course Management',
      tas: '👥 Teaching Assistants',
      biometric: '🔐 Passkey Reset'
    };
    if (tbTitle && titles[tabName]) {
      tbTitle.textContent = titles[tabName];
    }
    
    if (tabName === 'mycourses') {
      await loadDashboardStats();
      await loadMyCoursesGrid();
    } else if (tabName === 'session') {
      await loadActiveSessions();
    } else if (tabName === 'records') {
      await loadRecords();
    } else if (tabName === 'reports') {
      await loadReports();
    } else if (tabName === 'courses') {
      await loadCourses();
    } else if (tabName === 'tas') {
      await loadTAs();
    } else if (tabName === 'biometric') {
      await loadBiometricTab();
    }
  }

  // ==================== LOAD DASHBOARD STATS ====================
  async function loadDashboardStats() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const now = new Date();
      const period = getAcademicPeriod(now);
      const year = period.year;
      const semester = period.semester;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => c.year === year && c.semester === semester && c.active !== false);
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      const periodSessions = mySessions.filter(s => s.year === year && s.semester === semester && !s.active);
      
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          records.forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      let totalCheckins = 0;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = periodSessions.length > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (periodSessions.length * studentsSet.size)) * 100) : 0;
      
      const coursesEl = document.getElementById('stat-courses');
      const sessionsEl = document.getElementById('stat-sessions');
      const studentsEl = document.getElementById('stat-students');
      const attendanceEl = document.getElementById('stat-attendance');
      
      if (coursesEl) coursesEl.textContent = periodCourses.length;
      if (sessionsEl) sessionsEl.textContent = periodSessions.length;
      if (studentsEl) studentsEl.textContent = studentsSet.size;
      if (attendanceEl) attendanceEl.textContent = `${avgAttendance}%`;
      
      const user = getCurrentUser();
      const sidebarName = document.getElementById('sidebar-name');
      const sidebarDept = document.getElementById('sidebar-dept');
      const lecAvatar = document.getElementById('lec-avatar');
      const lecName = document.getElementById('lec-tb-name');
      
      if (sidebarName) sidebarName.textContent = user?.name || 'Lecturer';
      if (sidebarDept) sidebarDept.textContent = user?.department || '';
      if (lecAvatar) lecAvatar.textContent = user?.role === 'ta' ? '👥' : '👨‍🏫';
      if (lecName) lecName.textContent = user?.name || user?.email;
      
      const taTab = document.getElementById('ta-tab-nav');
      if (taTab) {
        taTab.style.display = user?.role === 'ta' ? 'none' : 'flex';
      }
      
    } catch(err) {
      console.error('[LEC] Load stats error:', err);
    }
  }

  // ==================== MY COURSES GRID ====================
  async function loadMyCoursesGrid() {
    const container = document.getElementById('courses-list-container');
    if (!container) return;
    
    const now = new Date();
    const currentPeriod = getAcademicPeriod(now);
    const myId = getCurrentLecturerId();
    
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">📅 Academic Year</label>
          <select id="grid-year" class="fi" onchange="LEC.viewCoursesGrid()">
            ${availableYears.map(y => `<option value="${y}" ${y === currentPeriod.year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="fl">📖 Semester</label>
          <select id="grid-semester" class="fi" onchange="LEC.viewCoursesGrid()">
            <option value="1" ${currentPeriod.semester === 1 ? 'selected' : ''}>First Semester</option>
            <option value="2" ${currentPeriod.semester === 2 ? 'selected' : ''}>Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.viewCoursesGrid()">🔍 View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.showAddCourse()">➕ Add Course</button>
        </div>
        <div>
          <button class="btn btn-gold" onclick="LEC.showAnnouncementModal()">📢 Send Announcement</button>
        </div>
      </div>
      <div id="courses-grid-container"></div>
      <div id="add-course-section" style="display:none; margin-top:20px"></div>
    `;
    
    await viewCoursesGrid();
  }

  async function viewCoursesGrid() {
    const year = document.getElementById('grid-year')?.value;
    const semester = document.getElementById('grid-semester')?.value;
    const container = document.getElementById('courses-grid-container');
    
    if (!year || !semester) {
      container.innerHTML = '<div class="att-empty">⚠️ Please select both Year and Semester</div>';
      return;
    }
    
    S.currentViewYear = parseInt(year);
    S.currentViewSemester = parseInt(semester);
    
    await loadFilteredStats(year, semester);
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">📭 No courses found for ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}.<br/>Click "Add Course" to create one.</div></div>`;
        return;
      }
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      
      let html = `<div class="courses-grid">`;
      for (const course of periodCourses) {
        const courseSessions = mySessions.filter(s => s.courseCode === course.code && s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active);
        const sessionCount = courseSessions.length;
        
        const enrollments = await DB.ENROLLMENT.getAll();
        const courseEnrollments = enrollments.filter(e => e.courseCode === course.code && e.year === parseInt(year) && e.semester === parseInt(semester) && e.lecId === myId);
        const studentCount = courseEnrollments.length;
        
        let totalCheckins = 0;
        for (const session of courseSessions) {
          totalCheckins += session.records ? Object.values(session.records).length : 0;
        }
        const avgAttendance = sessionCount > 0 && studentCount > 0 ? Math.round((totalCheckins / (sessionCount * studentCount)) * 100) : 0;
        
        html += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(course.code)}</span>
              <span class="badge">${sessionCount} sessions</span>
            </div>
            <div class="course-name">${escapeHtml(course.name)}</div>
            <div class="course-stats">
              <span>🎓 ${studentCount} students enrolled</span>
              <span>📊 ${avgAttendance}% avg attendance</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-ug btn-sm" onclick="LEC.showStartSessionPage('${course.code}', '${escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">▶ Start Session</button>
              <button class="btn btn-outline btn-sm" onclick="LEC.editCourse('${course.code}', '${escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">✏️ Edit</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
      
    } catch(err) {
      console.error('[LEC] View courses error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadFilteredStats(year, semester) {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false);
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      const periodSessions = mySessions.filter(s => s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active);
      
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          Object.values(session.records).forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      let totalCheckins = 0;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = periodSessions.length > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (periodSessions.length * studentsSet.size)) * 100) : 0;
      
      document.getElementById('stat-courses').textContent = periodCourses.length;
      document.getElementById('stat-sessions').textContent = periodSessions.length;
      document.getElementById('stat-students').textContent = studentsSet.size;
      document.getElementById('stat-attendance').textContent = `${avgAttendance}%`;
      
    } catch(err) {
      console.error('[LEC] Load filtered stats error:', err);
    }
  }

  // ==================== ANNOUNCEMENT SYSTEM ====================
  async function showAnnouncementModal() {
    const myId = getCurrentLecturerId();
    
    const allCourses = await DB.COURSE.getAllForLecturer(myId);
    
    if (allCourses.length === 0) {
      await MODAL.alert('No Courses', 'You have no courses added. Please add a course first in Course Management.');
      return;
    }
    
    const availableYears = [...new Set(allCourses.map(c => c.year))].sort((a, b) => b - a);
    
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="filter-bar" style="margin-bottom: 15px; flex-wrap: wrap;">
          <div style="min-width: 120px;">
            <label class="fl">📅 Academic Year</label>
            <select id="announcement-filter-year" class="fi" onchange="LEC.filterAnnouncementCourses()">
              <option value="">Select Year</option>
              ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
            </select>
          </div>
          <div style="min-width: 120px;">
            <label class="fl">📖 Semester</label>
            <select id="announcement-filter-semester" class="fi" onchange="LEC.filterAnnouncementCourses()">
              <option value="">Select Semester</option>
              <option value="1">First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="fl">📚 Select Course</label>
          <select id="announcement-course" class="fi">
            <option value="">-- Select Year and Semester first --</option>
          </select>
        </div>
        <div class="field">
          <label class="fl">📢 Announcement Title</label>
          <input type="text" id="announcement-title" class="fi" placeholder="e.g., Important Update, Class Cancellation, etc.">
        </div>
        <div class="field">
          <label class="fl">📝 Announcement Message</label>
          <textarea id="announcement-message" class="fi" rows="5" placeholder="Type your announcement here..."></textarea>
        </div>
        <div class="field">
          <label class="fl">🔔 Priority Level</label>
          <select id="announcement-priority" class="fi">
            <option value="info">ℹ️ Normal (Info)</option>
            <option value="warning">⚠️ Important (Warning)</option>
            <option value="danger">🚨 Urgent (Critical)</option>
          </select>
        </div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('Send Course Announcement', modalContent, { 
      confirmLabel: '📢 Send Announcement', 
      cancelLabel: 'Cancel',
      confirmCls: 'btn-ug',
      width: '550px'
    });
    
    if (!confirmed) return;
    
    const courseValue = document.getElementById('announcement-course')?.value;
    const title = document.getElementById('announcement-title')?.value.trim();
    const message = document.getElementById('announcement-message')?.value.trim();
    const priority = document.getElementById('announcement-priority')?.value;
    
    if (!courseValue) {
      await MODAL.alert('Missing Info', 'Please select a course.');
      return;
    }
    
    if (!title || !message) {
      await MODAL.alert('Missing Info', 'Please fill in both title and message.');
      return;
    }
    
    const [courseCode, courseYear, courseSemester, courseName] = courseValue.split('|');
    const user = getCurrentUser();
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    
    try {
      const enrollments = await DB.ENROLLMENT.getAll();
      const courseEnrollments = enrollments.filter(e => 
        e.courseCode === courseCode && 
        e.year === parseInt(courseYear) && 
        e.semester === parseInt(courseSemester) &&
        e.lecId === myId
      );
      
      if (courseEnrollments.length === 0) {
        await MODAL.alert('No Students', `No students enrolled in ${courseCode} for the selected period.\n\nStudents need to check in at least once to be enrolled.`);
        return;
      }
      
      MODAL.loading(`Sending announcement to ${courseEnrollments.length} students...`);
      
      const announcement = {
        id: announcementId,
        title: title,
        message: message,
        priority: priority,
        courseCode: courseCode,
        courseName: courseName,
        year: parseInt(courseYear),
        semester: parseInt(courseSemester),
        senderId: myId,
        senderName: user?.name || 'Lecturer',
        senderRole: user?.role === 'ta' ? 'TA' : 'Lecturer',
        timestamp: Date.now(),
        readBy: []
      };
      
      await DB.set(`announcements/course/${myId}/${courseCode}_${courseYear}_${courseSemester}/${announcementId}`, announcement);
      
      let notifiedCount = 0;
      for (const enrollment of courseEnrollments) {
        await DB.set(`notifications/student/${enrollment.studentId}/announcements/${announcementId}`, {
          id: announcementId,
          title: `📢 ${title}`,
          message: `${courseCode}: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`,
          type: priority,
          timestamp: Date.now(),
          read: false,
          link: null,
          announcementId: announcementId,
          courseCode: courseCode
        });
        notifiedCount++;
      }
      
      MODAL.close();
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${notifiedCount} students in ${courseCode}.`);
      
    } catch(err) {
      console.error('[LEC] Send announcement error:', err);
      MODAL.close();
      await MODAL.error('Error', err.message || 'Failed to send announcement. Please try again.');
    }
  }
  
  async function filterAnnouncementCourses() {
    const year = document.getElementById('announcement-filter-year')?.value;
    const semester = document.getElementById('announcement-filter-semester')?.value;
    const courseSelect = document.getElementById('announcement-course');
    
    if (!year || !semester) {
      courseSelect.innerHTML = '<option value="">-- Select Year and Semester first --</option>';
      return;
    }
    
    const myId = getCurrentLecturerId();
    const allCourses = await DB.COURSE.getAllForLecturer(myId);
    const filteredCourses = allCourses.filter(c => 
      c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
    );
    
    if (filteredCourses.length === 0) {
      courseSelect.innerHTML = '<option value="">-- No courses found for this period --</option>';
      return;
    }
    
    let options = '<option value="">-- Select Course --</option>';
    for (const course of filteredCourses) {
      options += `<option value="${course.code}|${course.year}|${course.semester}|${course.name}">${course.code} - ${course.name}</option>`;
    }
    courseSelect.innerHTML = options;
  }

  // ==================== ACTIVE SESSIONS ====================
  async function loadActiveSessions() {
    const container = document.getElementById('active-sessions-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading active sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="att-empty">⚠️ Unable to load sessions</div>';
        return;
      }
      
      const allSessions = await DB.SESSION.getAll();
      const activeSessions = allSessions.filter(s => s.lecFbId === myId && s.active === true);
      
      if (activeSessions.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No active sessions. Go to "My Courses" to start a session.</div>';
        return;
      }
      
      let html = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">`;
      
      for (const session of activeSessions) {
        const timeRemaining = Math.max(0, session.expiresAt - Date.now());
        const minutesLeft = Math.floor(timeRemaining / 60000);
        const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
        const records = session.records ? Object.values(session.records).length : 0;
        
        if (timeRemaining <= 0) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          continue;
        }
        
        const qrPayload = btoa(JSON.stringify({ 
          id: session.id, token: session.token, code: session.courseCode, 
          course: session.courseName, date: session.date, expiresAt: session.expiresAt,
          lat: session.lat, lng: session.lng, radius: session.radius, locEnabled: session.locEnabled
        })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        
        const qrUrl = `${CONFIG.SITE_URL}?ci=${qrPayload}`;
        
        html += `
          <div class="course-card" style="border-left: 4px solid #1d9e75;">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(session.courseCode)}</span>
              <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
            </div>
            <div class="course-name">${escapeHtml(session.courseName)}</div>
            <div class="course-stats">
              <span>📅 ${session.date}</span>
              <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
              <span>👥 ${records} checked in</span>
            </div>
            <div id="qr-${session.id}" style="text-align:center; margin:15px 0; padding:10px; background:#fff; border-radius:8px;"></div>
            <div class="course-buttons">
              <button class="btn btn-secondary btn-sm" onclick="LEC.downloadSessionQR('${session.id}')">📥 Download QR</button>
              <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${qrUrl}')">📋 Copy Link</button>
              <button class="btn btn-danger btn-sm" onclick="LEC.endSessionById('${session.id}')">⏹️ End Session</button>
            </div>
          </div>
        `;
        
        setTimeout(() => {
          const qrContainer = document.getElementById(`qr-${session.id}`);
          if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: qrUrl, width: 150, height: 150 });
          }
        }, 100);
      }
      html += `</div>`;
      container.innerHTML = html;
      
      if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
      S.activeSessionsRefresh = setInterval(() => checkAndUpdateActiveSessions(), 5000);
    } catch(err) {
      console.error('Load active sessions error:', err);
      container.innerHTML = `<div class="att-empty">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function checkAndUpdateActiveSessions() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allSessions = await DB.SESSION.getAll();
      const activeSessions = allSessions.filter(s => s.lecFbId === myId && s.active === true);
      let needsRefresh = false;
      
      for (const session of activeSessions) {
        if (session.expiresAt <= Date.now()) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          needsRefresh = true;
        }
      }
      if (needsRefresh) await loadActiveSessions();
    } catch(e) { console.warn(e); }
  }

  async function endSessionById(sessionId) {
    const confirmed = await MODAL.confirm('⏹️ End Session', 'End this session? All records will be saved.', { confirmLabel: 'Yes, End Session', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), endedReason: 'manual' });
      await MODAL.success('Session Ended', '✅ The session has been ended.');
      await loadActiveSessions();
      await loadDashboardStats();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  function downloadSessionQR(sessionId) {
    const qrContainer = document.getElementById(`qr-${sessionId}`);
    const canvas = qrContainer?.querySelector('canvas');
    if (canvas) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `QR_${sessionId}.png`;
      a.click();
    } else {
      MODAL.alert('QR not ready', 'Please wait for QR code to generate.');
    }
  }

  // ==================== START SESSION PAGE ====================
  async function showStartSessionPage(courseCode, courseName, year, semester) {
    sessionStorage.setItem('starting_course_code', courseCode);
    sessionStorage.setItem('starting_course_name', courseName);
    sessionStorage.setItem('starting_course_year', year);
    sessionStorage.setItem('starting_course_semester', semester);
    
    const container = document.getElementById('courses-grid-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="start-session-page" style="max-width: 500px; margin: 0 auto;">
        <button class="btn btn-outline btn-sm" onclick="LEC.viewCoursesGrid()" style="margin-bottom: 20px;">← Back to Courses</button>
        <div class="inner-panel">
          <h2>▶️ Start New Session</h2>
          <p class="sub">Course: <strong>${escapeHtml(courseCode)} - ${escapeHtml(courseName)}</strong></p>
          <p class="sub" style="color: var(--teal); margin-top: -10px;">📅 ${year} - ${semester === 1 ? 'First Semester' : 'Second Semester'}</p>
          <div class="sl-row" style="margin-bottom: 20px;">
            <label class="fl">⏱️ Duration (minutes)</label>
            <input type="range" id="start-dur" min="5" max="180" value="60" oninput="updateStartDurVal(this.value)"/>
            <span class="sv" id="start-dur-val">60 min</span>
          </div>
          <div class="loc-step">
            <h3>📍 Classroom Location (Required)</h3>
            <p>Set your current location as the classroom fence. Students must be within this radius to check in.</p>
            <div class="sl-row" style="margin-bottom: 8px;">
              <label class="fl">📏 Fence radius</label>
              <input type="range" id="start-radius" min="20" max="500" value="100" oninput="updateStartRadiusVal(this.value)"/>
              <span class="sv" id="start-rad-val">100m</span>
            </div>
            <button class="btn btn-teal" id="start-get-loc-btn" onclick="LEC.getStartLocation()">📍 Get my location</button>
            <div class="loc-result" id="start-loc-result"></div>
          </div>
          <button class="btn btn-ug" id="start-gen-btn" onclick="LEC.generateAndStartSession()" disabled style="margin-top: 20px;">▶️ Generate QR Code & Start Session</button>
          <p class="gen-hint" id="start-gen-hint">📍 Get your classroom location first.</p>
        </div>
      </div>
    `;
    S.lecLat = null;
    S.lecLng = null;
    S.locAcquired = false;
  }
  
  function getStartLocation() {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    if (!btn || !res) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Getting location…';
    res.className = 'loc-result';
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…';
    
    if (!navigator.geolocation) { demoStartLoc(); return; }
    
    navigator.geolocation.getCurrentPosition(p => {
      S.lecLat = p.coords.latitude;
      S.lecLng = p.coords.longitude;
      S.locAcquired = true;
      startLocOK(p.coords.accuracy);
    }, () => demoStartLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  
  function demoStartLoc() {
    S.lecLat = 5.6505 + (Math.random() - .5) * .001;
    S.lecLng = -0.1875 + (Math.random() - .5) * .001;
    S.locAcquired = true;
    startLocOK(null);
  }
  
  function startLocOK(acc) {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    const genBtn = document.getElementById('start-gen-btn');
    const genHint = document.getElementById('start-gen-hint');
    
    if (!btn || !res) return;
    
    res.className = 'loc-result ok';
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`;
    btn.disabled = false;
    btn.textContent = '🔄 Refresh location';
    
    if (genBtn) {
      genBtn.disabled = false;
      if (genHint) genHint.style.display = 'none';
    }
  }
  
  async function generateAndStartSession() {
    const courseCode = sessionStorage.getItem('starting_course_code');
    const courseName = sessionStorage.getItem('starting_course_name');
    const courseYear = parseInt(sessionStorage.getItem('starting_course_year'));
    const courseSemester = parseInt(sessionStorage.getItem('starting_course_semester'));
    const mins = document.getElementById('start-dur') ? +(document.getElementById('start-dur').value) : 60;
    
    if (!courseCode || !courseName) {
      await MODAL.alert('Error', '⚠️ Course information missing.');
      return;
    }
    if (!S.locAcquired || !S.lecLat) {
      await MODAL.alert('Location required', '📍 Get your classroom location first.');
      return;
    }
    
    UI.btnLoad('start-gen-btn', true);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', '⚠️ Could not identify your account.');
        return;
      }
      
      const courseExists = await DB.COURSE.get(myId, courseCode, courseYear, courseSemester);
      if (!courseExists) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', `⚠️ Course ${courseCode} does not exist in your account.`);
        return;
      }
      
      const user = getCurrentUser();
      const allSessions = await DB.SESSION.getAll();
      const existing = allSessions.filter(s => s.lecFbId === myId);
      if (existing.find(s => s.courseCode === courseCode && s.year === courseYear && s.semester === courseSemester && s.active)) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Session conflict', `⚠️ A session for ${courseCode} is already active.`);
        return;
      }
      
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
      const token = Math.random().toString(36).substring(2, 22);
      const sessId = token.slice(0, 12);
      const radius = document.getElementById('start-radius') ? +(document.getElementById('start-radius').value) : 100;
      
      const sessionData = {
        id: sessId, token: token, courseCode: courseCode, courseName: courseName,
        lecturer: user?.name || '', lecId: user?.lecId || '', lecFbId: myId,
        department: user?.department || '', date: dateStr,
        expiresAt: Date.now() + mins * 60000, durationMins: mins,
        lat: S.lecLat, lng: S.lecLng, radius: radius, locEnabled: true,
        active: true, createdAt: Date.now(), year: courseYear, semester: courseSemester,
        records: {}, sids: {}, devs: {}
      };
      
      await DB.SESSION.set(sessId, sessionData);
      
      if (typeof NOTIFICATIONS !== 'undefined') {
        await NOTIFICATIONS.add({
          title: 'Session Started',
          message: `${courseCode} - ${courseName} session has started. QR code is ready.`,
          type: 'success',
          link: null
        });
      }
      
      await MODAL.success('Session Started', `✅ Session for ${courseCode} has started!`);
      
      sessionStorage.removeItem('starting_course_code');
      sessionStorage.removeItem('starting_course_name');
      sessionStorage.removeItem('starting_course_year');
      sessionStorage.removeItem('starting_course_semester');
      switchTab('session');
    } catch(err) {
      UI.btnLoad('start-gen-btn', false, 'Start Session');
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== RECORDS TAB ====================
  async function loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="records-year" class="fi" onchange="LEC.populateRecordsCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="records-semester" class="fi" onchange="LEC.populateRecordsCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="records-course" class="fi" onchange="LEC.loadSessionsForCourse()">
            <option value="">Select Course First</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📅 Session Date</label>
          <select id="records-session" class="fi">
            <option value="">Select Session or "All Sessions"</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadSessionRecords()">🔍 Load Records</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.exportAllSessionRecords()">📥 Export All to Excel</button>
        </div>
      </div>
      <div id="records-results"><div class="att-empty">📭 Select filters and click Load Records</div></div>
    `;
  }

  async function populateRecordsCourses() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${escapeHtml(course.code)}|${escapeHtml(course.name)}">${escapeHtml(course.code)} - ${escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }
  
  async function loadSessionsForCourse() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseValue = document.getElementById('records-course')?.value;
    const sessionSelect = document.getElementById('records-session');
    
    if (!year || !semester || !courseValue) {
      sessionSelect.innerHTML = '<option value="">Select Course First</option>';
      return;
    }
    
    const [courseCode] = courseValue.split('|');
    S.currentRecordsCourseCode = courseCode;
    S.currentRecordsYear = parseInt(year);
    S.currentRecordsSemester = parseInt(semester);
    
    sessionSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading sessions...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allSessions = await DB.SESSION.getAll();
      const courseSessions = allSessions.filter(s => 
        s.lecFbId === myId &&
        s.courseCode === courseCode && 
        s.year === parseInt(year) && 
        s.semester === parseInt(semester)
      );
      
      S.courseSessionsCache = courseSessions;
      
      const endedSessions = courseSessions.filter(s => !s.active);
      const uniqueDates = [...new Set(endedSessions.map(s => s.date))];
      
      if (uniqueDates.length === 0) {
        sessionSelect.innerHTML = '<option value="">📭 No ended sessions found</option>';
        return;
      }
      
      let options = '<option value="__ALL__">📋 ALL SESSIONS (Combined View)</option>';
      for (const date of uniqueDates) {
        const sessionsOnDate = endedSessions.filter(s => s.date === date);
        const totalRecords = sessionsOnDate.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
        options += `<option value="${date}">📅 ${date} - ${sessionsOnDate.length} session(s), ${totalRecords} check-ins</option>`;
      }
      sessionSelect.innerHTML = options;
      
    } catch(err) {
      console.error('[LEC] Load sessions for course error:', err);
      sessionSelect.innerHTML = '<option value="">❌ Error loading sessions</option>';
    }
  }

  async function loadSessionRecords() {
    const sessionValue = document.getElementById('records-session')?.value;
    const container = document.getElementById('records-results');
    
    if (!sessionValue) {
      await MODAL.alert('Missing Info', '⚠️ Please select a session or "All Sessions".');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading session records...</div>';
    
    try {
      const isAllSessions = sessionValue === '__ALL__';
      const selectedDate = isAllSessions ? null : sessionValue;
      const sessions = S.courseSessionsCache || [];
      
      let filteredSessions = sessions.filter(s => !s.active);
      if (!isAllSessions && selectedDate) {
        filteredSessions = filteredSessions.filter(s => s.date === selectedDate);
      }
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No ended sessions found for this selection.</div>';
        return;
      }
      
      let allRecords = [];
      for (const session of filteredSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          allRecords.push(...records.map(r => ({ 
            ...r, 
            sessionDate: session.date, 
            sessionId: session.id, 
            courseCode: session.courseCode, 
            courseName: session.courseName 
          })));
        }
      }
      
      const studentMap = new Map();
      for (const record of allRecords) {
        const existing = studentMap.get(record.studentId);
        if (!existing || record.checkedAt > existing.checkedAt) {
          studentMap.set(record.studentId, record);
        }
      }
      const records = Array.from(studentMap.values());
      const totalRecords = records.length;
      const displayRecords = records.slice(0, 50);
      
      const sessionInfo = isAllSessions 
        ? `All Ended Sessions (${filteredSessions.length} sessions)`
        : `Session: ${selectedDate} (${filteredSessions.length} session(s))`;
      
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: white;">📋 ${sessionInfo}</h3>
          <p style="margin: 5px 0 0; opacity: 0.9;">📚 Course: ${escapeHtml(S.currentRecordsCourseCode)}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">👥 Total Unique Students: ${totalRecords}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">Showing ${Math.min(50, totalRecords)} of ${totalRecords} students</p>
        </div>
      `;
      
      if (displayRecords.length === 0) {
        html += '<div class="no-rec">📭 No check-in records for this selection.</div>';
      } else {
        html += `
          <div style="overflow-x: auto;">
            <table class="session-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: var(--ug); color: white;">
                  <th style="padding: 10px;">#</th>
                  <th style="padding: 10px;">Student ID</th>
                  <th style="padding: 10px;">Student Name</th>
                  <th style="padding: 10px;">Email</th>
                  <th style="padding: 10px;">Session Date</th>
                  <th style="padding: 10px;">Check-in Time</th>
                  <th style="padding: 10px;">Method</th>
                  <th style="padding: 10px;">Distance</th>
                <table>
              </thead>
              <tbody>
                ${displayRecords.map((r, i) => `
                  <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 8px;">${i + 1}</td>
                    <td style="padding: 8px;"><strong>${escapeHtml(r.studentId)}</strong></td>
                    <td style="padding: 8px;">${escapeHtml(r.name)}</td>
                    <td style="padding: 8px;">${escapeHtml(r.email) || '—'}</td>
                    <td style="padding: 8px;">${r.sessionDate || '—'}</td>
                    <td style="padding: 8px;">${r.time || new Date(r.checkedAt).toLocaleTimeString()}</td>
                    <td style="padding: 8px;">${r.authMethod === 'webauthn' ? '🔐 Biometric' : (r.authMethod === 'manual' ? '📝 Manual' : '—')}</td>
                    <td style="padding: 8px;">${r.locNote || (r.distanceMeters ? r.distanceMeters + 'm' : '—')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        
        if (totalRecords > 50) {
          html += `<p class="note" style="margin-top: 12px;">📌 Showing first 50 records. Download Excel for all ${totalRecords} records.</p>`;
        }
      }
      
      html += `
        <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-ug" onclick="LEC.exportCurrentRecordsToExcel()">📊 Export Current View to Excel</button>
          <button class="btn btn-secondary" onclick="LEC.showManualCheckinModal()">📝 Manual Check-in</button>
          <button class="btn btn-teal" onclick="LEC.showBulkCheckinModal()">📎 Bulk Upload</button>
        </div>
      `;
      
      container.innerHTML = html;
      S.currentSessionRecords = records;
      S.currentSessionData = { 
        courseCode: S.currentRecordsCourseCode, 
        year: S.currentRecordsYear, 
        semester: S.currentRecordsSemester,
        courseName: filteredSessions[0]?.courseName || ''
      };
      
    } catch(err) {
      console.error('[LEC] Load session records error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }
  
  async function exportCurrentRecordsToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    
    if (!S.currentSessionRecords || S.currentSessionRecords.length === 0) {
      await MODAL.alert('No Data', '📭 No records to export.');
      return;
    }
    
    const records = S.currentSessionRecords;
    const wsData = [
      [`Attendance Records - ${S.currentSessionData?.courseCode || 'Course'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Unique Students: ${records.length}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Email', 'Session Date', 'Check-in Time', 'Verification Method', 'Distance', 'Location Note']
    ];
    
    records.forEach((r, i) => {
      wsData.push([
        i + 1,
        r.studentId || '',
        r.name || '',
        r.email || '',
        r.sessionDate || '—',
        r.time || new Date(r.checkedAt).toLocaleTimeString(),
        r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
        r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—'),
        r.locNote || ''
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${S.currentSessionData?.courseCode || 'Course'}`);
    XLSX.writeFile(wb, `UG_Attendance_${S.currentSessionData?.courseCode || 'Course'}_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', `✅ ${records.length} records exported.`);
  }
  
  async function exportAllSessionRecords() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    
    const sessions = S.courseSessionsCache || [];
    const endedSessions = sessions.filter(s => !s.active);
    
    if (endedSessions.length === 0) {
      await MODAL.alert('No Data', '📭 No session data to export.');
      return;
    }
    
    let allRecords = [];
    for (const session of endedSessions) {
      if (session.records) {
        const records = Object.values(session.records);
        allRecords.push(...records.map(r => ({ 
          ...r, 
          sessionDate: session.date, 
          courseCode: session.courseCode,
          courseName: session.courseName
        })));
      }
    }
    
    const wsData = [
      [`Complete Attendance Records - ${S.currentRecordsCourseCode}`],
      [`Period: ${S.currentRecordsYear} - Semester ${S.currentRecordsSemester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${endedSessions.length}`],
      [`Total Check-ins: ${allRecords.length}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Email', 'Session Date', 'Check-in Time', 'Verification Method', 'Distance']
    ];
    
    allRecords.sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));
    allRecords.forEach((r, i) => {
      wsData.push([
        i + 1,
        r.studentId || '',
        r.name || '',
        r.email || '',
        r.sessionDate || '—',
        r.time || new Date(r.checkedAt).toLocaleTimeString(),
        r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
        r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—')
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `All_Sessions_${S.currentRecordsCourseCode}`);
    XLSX.writeFile(wb, `UG_All_Sessions_${S.currentRecordsCourseCode}_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', `✅ ${allRecords.length} total check-ins exported from ${endedSessions.length} sessions.`);
  }

  async function showManualCheckinModal() {
    if (!S.currentSessionData) {
      await MODAL.alert('No Course Selected', '📭 Please load a course and session first.');
      return;
    }
    
    const studentId = await MODAL.prompt(
      'Manual Check-in',
      'Enter Student ID:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Add to Records' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.alert('Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const myId = getCurrentLecturerId();
    const isEnrolled = await DB.ENROLLMENT.isEnrolled(studentId.toUpperCase(), myId, S.currentSessionData.courseCode);
    
    if (!isEnrolled) {
      const enrollNow = await MODAL.confirm('Not Enrolled', `${student.name} is not enrolled in ${S.currentSessionData.courseCode}. Enroll now?`, { confirmLabel: 'Yes, Enroll' });
      if (!enrollNow) return;
      await DB.ENROLLMENT.enroll(
        studentId.toUpperCase(), 
        myId, 
        S.currentSessionData.courseCode, 
        S.currentSessionData.courseName, 
        S.currentSessionData.semester, 
        S.currentSessionData.year
      );
    }
    
    await MODAL.success('Added to Records', `✅ ${student.name} has been added to the course records.`);
    await loadSessionRecords();
  }

  async function showBulkCheckinModal() {
    if (!S.currentSessionData) {
      await MODAL.alert('No Course Selected', '📭 Please load a course and session first.');
      return;
    }
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.csv';
    fileInput.onchange = async (e) => await processBulkUpload(e.target.files[0]);
    fileInput.click();
  }

  async function processBulkUpload(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        let studentIds = [];
        
        if (file.name.endsWith('.csv')) {
          const text = data;
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            const parts = line.split(/[,\t]/);
            for (const part of parts) {
              const cleaned = part.trim().toUpperCase();
              if (cleaned && /^[0-9]{8,}$/.test(cleaned)) {
                studentIds.push(cleaned);
              }
            }
          }
        } else {
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          for (const row of rows) {
            if (row && Array.isArray(row)) {
              for (const cell of row) {
                const cleaned = String(cell).trim().toUpperCase();
                if (cleaned && /^[0-9]{8,}$/.test(cleaned)) {
                  studentIds.push(cleaned);
                }
              }
            }
          }
        }
        
        studentIds = [...new Set(studentIds)];
        
        if (studentIds.length === 0) {
          await MODAL.alert('No Valid IDs', 'No valid student IDs found in the file.');
          return;
        }
        
        const confirmed = await MODAL.confirm(
          'Bulk Student Addition',
          `Found ${studentIds.length} student IDs. Add them to the course records?`,
          { confirmLabel: 'Yes, Process', confirmCls: 'btn-ug' }
        );
        
        if (!confirmed) return;
        
        const myId = getCurrentLecturerId();
        let successCount = 0;
        let alreadyEnrolledCount = 0;
        let failedCount = 0;
        const failedIds = [];
        
        for (const studentId of studentIds) {
          const student = await DB.STUDENTS.byStudentId(studentId);
          
          if (!student) {
            failedCount++;
            failedIds.push(`${studentId} (not found)`);
            continue;
          }
          
          const isEnrolled = await DB.ENROLLMENT.isEnrolled(studentId, myId, S.currentSessionData.courseCode);
          
          if (!isEnrolled) {
            await DB.ENROLLMENT.enroll(
              studentId, 
              myId, 
              S.currentSessionData.courseCode, 
              S.currentSessionData.courseName, 
              S.currentSessionData.semester, 
              S.currentSessionData.year
            );
            successCount++;
          } else {
            alreadyEnrolledCount++;
          }
        }
        
        let message = `✅ Newly enrolled: ${successCount}\n📋 Already enrolled: ${alreadyEnrolledCount}\n❌ Failed: ${failedCount}`;
        
        await MODAL.alert('Bulk Student Addition Results', message, { icon: '📊' });
        
        if (failedIds.length > 0) {
          const showDetails = await MODAL.confirm('View Failed IDs', `Show ${failedIds.length} failed IDs?`, { confirmLabel: 'Yes, Show' });
          if (showDetails) {
            await MODAL.alert('Failed IDs', failedIds.join('<br>'), { icon: '⚠️', width: '500px' });
          }
        }
        
        await loadSessionRecords();
        
      } catch(err) {
        console.error('Bulk upload error:', err);
        await MODAL.error('Error', 'Failed to process file. Please check the format.');
      }
    };
    
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  }

  // ==================== REPORTS TAB (FIXED - Single table only) ====================
  async function loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="report-year" class="fi" onchange="LEC.populateReportCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="report-semester" class="fi" onchange="LEC.populateReportCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="report-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.generateReport()">📊 Generate Report</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.exportReportToExcel()">📥 Export Excel</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">📭 Select course and click Generate Report</div></div>
    `;
  }

  async function populateReportCourses() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${escapeHtml(course.code)}|${escapeHtml(course.name)}">${escapeHtml(course.code)} - ${escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseValue = document.getElementById('report-course')?.value;
    const container = document.getElementById('report-results');
    
    if (!year || !semester || !courseValue) {
      await MODAL.alert('Missing Info', '⚠️ Please select Year, Semester, and Course.');
      return;
    }
    
    const [courseCode, courseName] = courseValue.split('|');
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      // Get all sessions for this course (only ended sessions - active === false)
      const allSessions = await DB.SESSION.getAll();
      const courseSessions = allSessions.filter(s => 
        s.lecFbId === myId &&
        s.courseCode === courseCode && 
        s.year === yearInt && 
        s.semester === semInt &&
        s.active === false
      );
      
      const totalSessions = courseSessions.length;
      
      if (totalSessions === 0) {
        container.innerHTML = '<div class="no-rec">📭 No completed sessions found for this course in the selected period.</div>';
        return;
      }
      
      // Get all enrollments for this course
      const allEnrollments = await DB.ENROLLMENT.getAll();
      const courseEnrollments = allEnrollments.filter(e => 
        e.lecId === myId &&
        e.courseCode === courseCode && 
        e.year === yearInt && 
        e.semester === semInt
      );
      
      if (courseEnrollments.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No students enrolled in this course for the selected period.</div>';
        return;
      }
      
      // Calculate attendance frequency for each student
      const studentStats = [];
      
      for (const enrollment of courseEnrollments) {
        const student = await DB.STUDENTS.byStudentId(enrollment.studentId);
        if (!student) continue;
        
        let presentCount = 0;
        
        // Count how many sessions this student attended
        for (const session of courseSessions) {
          if (session.records) {
            const records = Object.values(session.records);
            const attended = records.some(r => r.studentId === enrollment.studentId);
            if (attended) presentCount++;
          }
        }
        
        const percentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;
        const category = getAttendanceCategory(percentage);
        
        studentStats.push({
          id: student.studentId,
          name: student.name,
          email: student.email,
          presentCount: presentCount,
          totalSessions: totalSessions,
          percentage: percentage,
          status: category.text,
          statusColor: category.color
        });
      }
      
      // Sort by percentage (highest first)
      studentStats.sort((a, b) => b.percentage - a.percentage);
      
      // Calculate summary statistics
      const totalStudents = studentStats.length;
      const totalAttendance = studentStats.reduce((sum, s) => sum + s.presentCount, 0);
      const averageAttendance = totalSessions > 0 && totalStudents > 0 
        ? Math.round((totalAttendance / (totalSessions * totalStudents)) * 100) : 0;
      
      const excellent = studentStats.filter(s => s.percentage >= 80).length;
      const good = studentStats.filter(s => s.percentage >= 75 && s.percentage < 80).length;
      const atRisk = studentStats.filter(s => s.percentage >= 60 && s.percentage < 75).length;
      const critical = studentStats.filter(s => s.percentage < 60).length;
      
      // Build the report HTML - ONLY THE TABLE, no session details
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: white;">📊 Attendance Frequency Report</h3>
          <p style="margin: 5px 0 0; opacity: 0.9;">${escapeHtml(courseCode)} - ${escapeHtml(courseName)}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📊 Total Sessions Conducted: ${totalSessions}</p>
        </div>
        
        <!-- Summary Stats Cards -->
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">📚 Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">🎓 Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${averageAttendance}%</div><div class="stat-label">📊 Avg Attendance</div></div>
          <div class="stat-card"><div class="stat-value">${totalAttendance}</div><div class="stat-label">✅ Total Check-ins</div></div>
        </div>
        
        <!-- Distribution Summary -->
        <div class="report-chart" style="margin-bottom: 20px;">
          <h4>📈 Attendance Distribution</h4>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (80%+)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(totalStudents, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (75-79%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(totalStudents, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (60-74%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(totalStudents, 1)) * 100}%; background: #e67e22;"></div><span class="chart-value">${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<60%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(totalStudents, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${critical} students</span></div>
        </div>
        
        <!-- Student Attendance Frequency Table - ONLY TABLE -->
        <div style="overflow-x: auto;">
          <h4>📋 Student Attendance Frequency</h4>
          <table class="session-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 12px;">#</th>
                <th style="padding: 12px;">Student ID</th>
                <th style="padding: 12px;">Student Name</th>
                <th style="padding: 12px;">Email</th>
                <th style="padding: 12px;">Present</th>
                <th style="padding: 12px;">Total Sessions</th>
                <th style="padding: 12px;">Attendance Rate</th>
                <th style="padding: 12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${studentStats.map((s, i) => `
                <tr style="border-bottom: 1px solid var(--border); ${s.percentage < 60 ? 'background: var(--danger-s);' : (s.percentage < 75 ? 'background: var(--amber-s);' : '')}">
                  <td style="padding: 10px;">${i + 1}</td>
                  <td style="padding: 10px;"><strong>${escapeHtml(s.id)}</strong></td>
                  <td style="padding: 10px;">${escapeHtml(s.name)}</td>
                  <td style="padding: 10px;">${escapeHtml(s.email)}</td>
                  <td style="padding: 10px; text-align: center;"><strong>${s.presentCount}</strong></td>
                  <td style="padding: 10px; text-align: center;">${s.totalSessions}</td>
                  <td style="padding: 10px; text-align: center;"><strong style="color: ${s.statusColor};">${s.percentage}%</strong></td>
                  <td style="padding: 10px; color: ${s.statusColor}; font-weight: 600;">${s.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
      
      // Store report data for export
      S.currentReportData = { 
        courseCode, courseName, year: yearInt, semester: semInt, 
        studentStats, totalSessions, totalStudents, 
        averageAttendance, excellent, good, atRisk, critical 
      };
      
    } catch(err) {
      console.error('[LEC] Generate report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    if (!S.currentReportData) { 
      await MODAL.alert('No Data', '📭 Generate a report first.'); 
      return; 
    }
    
    const { courseCode, courseName, year, semester, studentStats, totalSessions, totalStudents, averageAttendance, excellent, good, atRisk, critical } = S.currentReportData;
    
    const wsData = [
      [`Attendance Frequency Report - ${courseCode} - ${courseName}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${totalSessions}`, `Total Students: ${totalStudents}`, `Average Attendance: ${averageAttendance}%`],
      [`Distribution: Excellent: ${excellent}, Good: ${good}, At Risk: ${atRisk}, Critical: ${critical}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Email', 'Present', 'Total Sessions', 'Attendance Rate (%)', 'Status']
    ];
    
    studentStats.forEach((s, i) => {
      wsData.push([i + 1, s.id, s.name, s.email, s.presentCount, s.totalSessions, `${s.percentage}%`, s.status]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', `✅ Report exported with ${studentStats.length} students.`);
  }

  // ==================== COURSE MANAGEMENT ====================
  async function loadCourses() {
    const container = document.getElementById('active-courses-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="course-year" class="fi">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="course-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadCoursesManagement()">🔍 Load Courses</button>
        </div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">📭 Select Year and Semester to view courses</div></div>
      <div id="archived-courses-list" style="margin-top: 20px;"><h3>📦 Archived Courses</h3><div class="att-empty">Select Year and Semester to view archived courses</div></div>
    `;
  }

  async function loadCoursesManagement() {
    const year = document.getElementById('course-year')?.value;
    const semester = document.getElementById('course-semester')?.value;
    const activeContainer = document.getElementById('active-courses-list-container');
    const archivedContainer = document.getElementById('archived-courses-list');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select both Year and Semester before loading courses.');
      return;
    }
    
    activeContainer.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    if (archivedContainer) archivedContainer.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const sessions = await DB.SESSION.getAll();
      const mySessions = sessions.filter(s => s.lecFbId === myId);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const activeCourses = [];
      const archivedCourses = [];
      
      for (const course of allCourses) {
        if (course.year === yearInt && course.semester === semInt) {
          let sessionCount = 0;
          let lastSessionDate = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'Never';
          
          for (const session of mySessions) {
            if (session.year === yearInt && session.semester === semInt && session.courseCode === course.code && !session.active) {
              sessionCount++;
              lastSessionDate = session.date;
            }
          }
          
          const courseInfo = {
            code: course.code,
            name: course.name,
            active: course.active !== false,
            sessionCount: sessionCount,
            lastSessionDate: lastSessionDate,
            disabledAt: course.disabledAt,
            year: course.year,
            semester: course.semester
          };
          
          if (course.active !== false) {
            activeCourses.push(courseInfo);
          } else {
            archivedCourses.push(courseInfo);
          }
        }
      }
      
      activeCourses.sort((a,b) => a.code.localeCompare(b.code));
      archivedCourses.sort((a,b) => a.code.localeCompare(b.code));
      
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">📭 No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = `<div class="courses-grid">${activeCourses.map(c => `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(c.code)}</span>
              <span class="badge" style="background: var(--teal);">🟢 Active</span>
            </div>
            <div class="course-name">${escapeHtml(c.name)}</div>
            <div class="course-stats">
              <span>📊 ${c.sessionCount} completed sessions</span>
              <span>📅 Last: ${c.lastSessionDate}</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-warning btn-sm" onclick="LEC.disableCourse('${c.code}', ${c.year}, ${c.semester})">📦 Archive Course</button>
            </div>
          </div>
        `).join('')}</div>`;
      }
      
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">📭 No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = `<div class="courses-grid">${archivedCourses.map(c => `
            <div class="course-card" style="opacity: 0.8;">
              <div class="course-header">
                <span class="course-code">📚 ${escapeHtml(c.code)}</span>
                <span class="badge" style="background: var(--danger);">📦 Archived</span>
              </div>
              <div class="course-name">${escapeHtml(c.name)}</div>
              <div class="course-stats">
                <span>📊 ${c.sessionCount} completed sessions</span>
                <span>📅 Last: ${c.lastSessionDate}</span>
              </div>
              <div class="course-buttons">
                <button class="btn btn-teal btn-sm" onclick="LEC.enableCourse('${c.code}', ${c.year}, ${c.semester})">🔄 Restore Course</button>
              </div>
            </div>
          `).join('')}</div>`;
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      activeContainer.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Archive Course', `Archive ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Archive', confirmCls: 'btn-warning' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.disableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Archived', `✅ ${courseCode} has been moved to archives.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Restore Course', `Restore ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Restore', confirmCls: 'btn-teal' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.enableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Restored', `✅ ${courseCode} is now active.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function editCourse(courseCode, currentName, year, semester) {
    const newName = await MODAL.prompt('Edit Course Name', `Edit name for ${courseCode}:`, { icon: '✏️', placeholder: 'Course name', defVal: currentName });
    if (!newName || newName === currentName) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.update(myId, courseCode, year, semester, { name: newName, updatedAt: Date.now() });
      await MODAL.success('Course Updated', `✅ ${courseCode} name has been changed.`);
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (!section) return;
    
    section.style.display = 'block';
    section.innerHTML = `
      <div class="inner-panel">
        <h3>➕ Add New Course</h3>
        <div class="two-col">
          <div class="field">
            <label class="fl">📚 Course Code</label>
            <input type="text" id="new-course-code" class="fi" placeholder="e.g., STAT111" oninput="this.value = this.value.toUpperCase()"/>
          </div>
          <div class="field">
            <label class="fl">📖 Course Name</label>
            <input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Statistics"/>
          </div>
        </div>
        <div class="two-col" style="margin-top: 10px;">
          <div class="field">
            <label class="fl">📅 Academic Year</label>
            <select id="new-course-year" class="fi">
              <option value="">Select Year</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026" selected>2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
          <div class="field">
            <label class="fl">📖 Semester</label>
            <select id="new-course-semester" class="fi">
              <option value="">Select Semester</option>
              <option value="1" selected>First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
        </div>
        <p class="note" style="margin-top: 8px; font-size: 11px;">⚠️ Course will be created specifically for the selected Academic Year and Semester</p>
        <button class="btn btn-ug" onclick="LEC.addNewCourse()">✅ Create Course</button>
        <button class="btn btn-secondary" onclick="LEC.hideAddCourse()">❌ Cancel</button>
      </div>
    `;
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    
    if (!code || !name) {
      await MODAL.alert('Missing Info', '⚠️ Please enter course code and name.');
      return;
    }
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select Academic Year and Semester.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        await MODAL.error('Error', '⚠️ Could not identify your account.');
        return;
      }
      
      const existing = await DB.COURSE.get(myId, code, yearInt, semInt);
      if (existing) {
        await MODAL.alert('Course Exists', `⚠️ Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const user = getCurrentUser();
      await DB.COURSE.set(myId, code, yearInt, semInt, {
        code: code, name: name, year: yearInt, semester: semInt,
        active: true, status: 'active', createdAt: Date.now(),
        createdBy: user?.name || user?.email || 'unknown', lecId: myId
      });
      
      await MODAL.success('Course Created', `✅ ${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCoursesGrid();
      await loadDashboardStats();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== TA MANAGEMENT ====================
  async function loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>👥 Invite New Teaching Assistant</h3>
        <div class="field"><label class="fl">📧 TA Email Address</label><input type="email" id="ta-email-input" class="fi" placeholder="ta@ug.edu.gh"/></div>
        <button class="btn btn-ug" onclick="LEC.inviteTA()" style="width: auto; padding: 10px 20px; margin-top: 10px;">📧 Send Invite Email</button>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; margin-top: 20px;">
        <h3>👥 My Teaching Assistants</h3>
        <span class="badge" id="ta-count">0</span>
      </div>
      <div id="ta-list-container"><div class="att-empty">📭 No TAs added yet. Send an invite above.</div></div>
    `;
    await refreshTAList();
  }

  async function refreshTAList() {
    const container = document.getElementById('ta-list-container');
    const countElement = document.getElementById('ta-count');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load TAs</div>';
        return;
      }
      
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId));
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      const user = getCurrentUser();
      const lecturerName = user?.name || 'Your Lecturer';
      
      container.innerHTML = `<div class="courses-grid">${myTAs.map(ta => `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">👤 ${escapeHtml(ta.name || 'Pending Registration')}</span>
            <span class="badge ${ta.status === 'active' ? 'badge-teal' : 'badge-gray'}">${ta.status === 'active' ? '✅ Active' : '⏳ Pending'}</span>
          </div>
          <div class="course-name">📧 ${escapeHtml(ta.email)}</div>
          <div class="course-stats">
            <span>👥 Assigned to: ${escapeHtml(lecturerName)}</span>
          </div>
          <div class="course-buttons">
            ${ta.status === 'suspended' ? 
              `<button class="btn btn-teal btn-sm" onclick="LEC.unsuspendTA('${ta.id}')">🔄 Unsuspend</button>` :
              `<button class="btn btn-warning btn-sm" onclick="LEC.suspendTA('${ta.id}')">⛔ Suspend</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="LEC.endTenure('${ta.id}')">🔚 End Tenure</button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function suspendTA(taId) {
    const confirmed = await MODAL.confirm('Suspend TA', 'Suspend this TA? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.TA.update(taId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('TA Suspended', '✅ The TA has been suspended.');
    await refreshTAList();
  }

  async function unsuspendTA(taId) {
    await DB.TA.update(taId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('TA Unsuspended', '✅ The TA has been reactivated.');
    await refreshTAList();
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    if (!email) { await MODAL.alert('Missing Info', '⚠️ Please enter TA email address.'); return; }
    if (!email.includes('@')) { await MODAL.alert('Invalid Email', '⚠️ Please enter a valid email address.'); return; }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = Math.random().toString(36).substring(2, 15);
    const user = getCurrentUser();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    await DB.TA.setInvite(inviteKey, { 
      code, toEmail: email, lecturerId: getCurrentLecturerId(), 
      lecturerName: user?.name, createdAt: Date.now(), 
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, usedAt: null 
    });
    
    await MODAL.alert('Invite Code', `
      <div style="text-align:center">
        <div style="font-size:36px; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px; margin:10px 0;">${code}</div>
        <p>Share this code with the TA at ${email}</p>
        <p>Registration: <a href="${signupLink}" target="_blank">${signupLink}</a></p>
      </div>
    `, { icon: '📧' });
    
    document.getElementById('ta-email-input').value = '';
    await refreshTAList();
  }

  async function endTenure(taId) {
    const confirmed = await MODAL.confirm('End Tenure', 'End this TA\'s tenure? They will no longer access your dashboard.', { confirmLabel: 'Yes', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const myId = getCurrentLecturerId();
    if (!myId) return;
    
    const ta = await DB.TA.get(taId);
    if (ta && ta.lecturers) {
      const updatedLecturers = ta.lecturers.filter(id => id !== myId);
      await DB.TA.update(taId, { lecturers: updatedLecturers, endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() } });
      if (updatedLecturers.length === 0) await DB.TA.update(taId, { active: false });
      await MODAL.success('Tenure Ended', '✅ TA removed from your dashboard.');
      await refreshTAList();
    }
  }

  // ==================== BIOMETRIC RESET TAB ====================
  async function loadBiometricTab() {
    const container = document.getElementById('biometric-reset-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>🔐 Student Passkey Reset</h3>
        <p class="sub">When a student gets a new device, you can reset their passkey and unregister their old device.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-ug" id="reset-passkey-btn" style="width: auto; padding: 10px 20px;">📱 Reset Passkey (New Device)</button>
          <button class="btn btn-secondary" id="manage-devices-btn" style="width: auto; padding: 10px 20px;">🔍 View / Manage Devices</button>
        </div>
      </div>
      <div class="inner-panel">
        <h3>📋 Instructions</h3>
        <ul style="margin-left: 20px; color: var(--text3); font-size: 13px; line-height: 1.8;">
          <li><strong>Device Binding:</strong> Each student's passkey is bound to their specific device</li>
          <li><strong>New Device:</strong> When a student gets a new device, their old passkey won't work</li>
          <li><strong>Reset Passkey:</strong> Click "Reset Passkey" and enter the student's ID</li>
          <li>The student will receive a link to register their fingerprint/face passkey on their new device</li>
          <li><strong>Old Device Unregistered:</strong> After reset, the old device cannot be used for check-ins</li>
        </ul>
      </div>
      <div class="inner-panel">
        <h3>📊 Recent Reset Requests</h3>
        <div id="recent-resets-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    
    const resetBtn = document.getElementById('reset-passkey-btn');
    const manageBtn = document.getElementById('manage-devices-btn');
    
    if (resetBtn) resetBtn.onclick = () => showPasskeyResetUI();
    if (manageBtn) manageBtn.onclick = () => showDeviceManagementUI();
    
    await loadRecentResets();
  }

  async function loadRecentResets() {
    const container = document.getElementById('recent-resets-list');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load reset history</div>';
        return;
      }
      
      const allResets = await DB.BIOMETRIC_RESET.getAllForLecturer(myId);
      const recentResets = allResets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      
      if (recentResets.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No recent reset requests</div>';
        return;
      }
      
      let html = '<div style="font-size: 13px;">';
      for (const reset of recentResets) {
        const date = new Date(reset.createdAt).toLocaleString();
        const status = reset.used ? '✅ Used' : (reset.expiresAt < Date.now() ? '⏰ Expired' : '⏳ Pending');
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
            <div>
              <strong>${escapeHtml(reset.studentName)}</strong><br>
              <span style="font-size: 11px; color: var(--text3);">${escapeHtml(reset.studentId)}</span>
            </div>
            <div style="font-size: 11px;">
              <span>${date}</span><br>
              <span class="pill ${reset.used ? 'pill-teal' : (reset.expiresAt < Date.now() ? 'pill-gray' : 'pill-amber')}">${status}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
      container.innerHTML = html;
    } catch(err) {
      console.error('Load recent resets error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading reset history</div>';
    }
  }

  async function showPasskeyResetUI() {
    const studentId = await MODAL.prompt(
      'Reset Student Passkey',
      'Enter the Student ID of the student who needs to reset their passkey:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Continue' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const confirmReset = await MODAL.confirm(
      'Confirm Passkey Reset',
      `Reset passkey for:<br/><br/>
       <strong>${escapeHtml(student.name)}</strong><br/>
       ID: ${escapeHtml(student.studentId)}<br/>
       Email: ${escapeHtml(student.email)}<br/><br/>
       <span style="color: var(--danger);">⚠️ This will erase their current passkey and unregister their device.</span>`,
      { confirmLabel: 'Send Reset Link', confirmCls: 'btn-warning' }
    );
    if (!confirmReset) return;
    
    try {
      const myId = getCurrentLecturerId();
      const user = getCurrentUser();
      const token = Math.random().toString(36).substring(2, 34);
      const resetLink = `${CONFIG.SITE_URL}?reset=${token}`;
      
      await DB.STUDENTS.update(student.studentId, {
        webAuthnCredentialId: null,
        webAuthnData: null,
        lastBiometricReset: Date.now(),
        biometricResetReason: 'device_change'
      });
      
      await DB.BIOMETRIC_RESET.set(token, {
        token, studentId: student.studentId, studentName: student.name,
        studentEmail: student.email, lecturerId: myId,
        lecturerName: user?.name || 'Lecturer', reason: 'device_change_reset',
        createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, used: false
      });
      
      await MODAL.alert('Passkey Reset Link', 
        `<div style="text-align: center;">
           <div class="strip-amber" style="margin-bottom: 15px;"><strong>🔗 Share this link with the student:</strong></div>
           <div style="background: var(--surface2); padding: 15px; border-radius: 8px; margin: 10px 0; word-break: break-all;">
             <a href="${resetLink}" target="_blank">${resetLink}</a>
           </div>
           <p style="font-size: 12px; margin-top: 10px;">⏰ This link expires in 7 days.</p>
         </div>`,
        { icon: '🔗', btnLabel: 'OK' }
      );
      await loadRecentResets();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function showDeviceManagementUI() {
    const studentId = await MODAL.prompt(
      'Manage Student Devices',
      'Enter Student ID to view passkey status:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Search' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const hasPasskey = !!(student.webAuthnCredentialId);
    const lastUse = student.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
    const lastReset = student.lastBiometricReset ? new Date(student.lastBiometricReset).toLocaleString() : 'Never';
    const deviceCount = student.devices ? Object.keys(student.devices).length : 0;
    
    await MODAL.alert(
      `Student: ${escapeHtml(student.name)}`,
      `<div style="text-align: left;">
         <p><strong>ID:</strong> ${escapeHtml(student.studentId)}</p>
         <p><strong>Email:</strong> ${escapeHtml(student.email)}</p>
         <hr style="margin: 10px 0;">
         <p><strong>Passkey Status:</strong> ${hasPasskey ? '✅ Registered' : '❌ Not Registered'}</p>
         <p><strong>Registered Devices:</strong> ${deviceCount}</p>
         <p><strong>Last Passkey Use:</strong> ${lastUse}</p>
         <p><strong>Last Passkey Reset:</strong> ${lastReset}</p>
       </div>`,
      { icon: '📱', btnLabel: 'Close' }
    );
  }

  // ==================== RESET FORM ====================
  function resetForm() {
    console.log('[LEC] resetForm called');
    S.locOn = true; 
    S.locAcquired = false; 
    S.lecLat = S.lecLng = null; 
    S.session = null;
    
    if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    if (S.refreshInterval) { clearInterval(S.refreshInterval); S.refreshInterval = null; }
    
    switchTab('mycourses');
  }

  // ==================== EXPORTS ====================
  return {
    switchTab,
    resetForm,
    viewCoursesGrid,
    loadMyCoursesGrid,
    loadDashboardStats,
    showAddCourse, 
    hideAddCourse, 
    addNewCourse, 
    showStartSessionPage, 
    editCourse,
    generateAndStartSession, 
    getStartLocation,
    endSessionById, 
    downloadSessionQR,
    loadRecords,
    populateRecordsCourses,
    loadSessionsForCourse,
    loadSessionRecords,
    exportCurrentRecordsToExcel,
    exportAllSessionRecords,
    showManualCheckinModal,
    showBulkCheckinModal,
    loadReports,
    populateReportCourses,
    generateReport, 
    exportReportToExcel,
    showAnnouncementModal,
    filterAnnouncementCourses,
    loadCoursesManagement, 
    disableCourse, 
    enableCourse,
    inviteTA, 
    endTenure,
    suspendTA,
    unsuspendTA,
    refreshTAList,
    showPasskeyResetUI,
    showDeviceManagementUI,
    loadActiveSessions
  };
})();

// Make LEC globally available
window.LEC = LEC;
window.LEC.tab = LEC.switchTab;

// Update global range slider functions
window.updateDurVal = function(val) {
  const mins = parseInt(val);
  let display = '';
  if (mins < 60) { display = mins + ' min'; } else { const hours = Math.floor(mins / 60); const remainingMins = mins % 60; display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; }
  const el = document.getElementById('l-dur-val');
  if (el) el.textContent = display;
};

window.updateRadiusVal = function(val) { 
  const el = document.getElementById('l-rad-val'); 
  if (el) el.textContent = val + 'm'; 
};

window.updateStartDurVal = function(val) {
  const mins = parseInt(val);
  let display = '';
  if (mins < 60) { display = mins + ' min'; } else { const hours = Math.floor(mins / 60); const remainingMins = mins % 60; display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; }
  const el = document.getElementById('start-dur-val'); 
  if (el) el.textContent = display;
};

window.updateStartRadiusVal = function(val) { 
  const el = document.getElementById('start-rad-val'); 
  if (el) el.textContent = val + 'm'; 
};

console.log('[session.js] LEC module loaded and registered globally');
