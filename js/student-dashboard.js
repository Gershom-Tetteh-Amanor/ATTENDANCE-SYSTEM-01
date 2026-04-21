/* student-dashboard.js — Student Dashboard
   Students can:
   - Select a course from enrolled courses dropdown
   - Track attendance progress for selected course
   - See active sessions for selected course
   - Check in directly from dashboard
*/
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let attendanceStats = null;
  let refreshInterval = null;
  let currentSelectedCourse = null;
  let enrolledCourses = [];

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    await loadEnrolledCourses();
    await loadDashboard();
    startAutoRefresh();
  }

  async function loadEnrolledCourses() {
    try {
      enrolledCourses = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId);
      const stats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId);
      for (const course of stats.courses) {
        if (!enrolledCourses.some(c => DB.normalizeCourseCode(c.courseCode) === DB.normalizeCourseCode(course.courseCode))) {
          const currentPeriod = DB.getCurrentAcademicPeriod();
          enrolledCourses.push({
            courseCode: course.courseCode,
            courseOriginalCode: course.courseCode,
            courseName: course.courseName,
            year: currentPeriod.year,
            semester: currentPeriod.semester,
            enrolledAt: Date.now()
          });
        }
      }
      if (enrolledCourses.length > 0 && !currentSelectedCourse) {
        currentSelectedCourse = enrolledCourses[0].courseCode;
      }
    } catch(err) {
      console.error('Load enrolled courses error:', err);
      enrolledCourses = [];
    }
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    container.innerHTML = '<div class="pg"><div class="att-empty">Loading your dashboard...</div></div>';
    
    try {
      attendanceStats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId, currentSelectedCourse);
      const allActiveSessions = await DB.SESSION.getAll();
      let relevantActiveSessions = [];
      if (currentSelectedCourse) {
        relevantActiveSessions = allActiveSessions.filter(s => 
          s.active === true && DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse)
        );
      }
      
      container.innerHTML = `
        <div class="pg">
          <div class="dash-header"><h2>Student Dashboard</h2><p class="sub">Welcome back, ${UI.esc(currentStudent.name)}!</p></div>
          <div class="course-selector"><label class="fl">Select Course</label>
            <select id="course-select" class="fi" onchange="STUDENT_DASH.changeCourse()">
              <option value="">-- All Courses --</option>
              ${enrolledCourses.map(c => `<option value="${UI.esc(c.courseCode)}" ${currentSelectedCourse === c.courseCode ? 'selected' : ''}>${UI.esc(c.courseCode)} (${c.year} - Semester ${c.semester})</option>`).join('')}
            </select>
          </div>
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-value">${attendanceStats.totalSessions}</div><div class="stat-label">Total Sessions</div></div>
            <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-value">${attendanceStats.totalPresent}</div><div class="stat-label">Present</div></div>
            <div class="stat-card"><div class="stat-icon">📈</div><div class="stat-value">${attendanceStats.attendancePercentage}%</div><div class="stat-label">Attendance Rate</div></div>
            <div class="stat-card"><div class="stat-icon">🎓</div><div class="stat-value">${attendanceStats.courses.length}</div><div class="stat-label">Courses</div></div>
          </div>
          <div class="dash-section"><h3>🟢 Active Sessions</h3><div id="active-sessions-list" class="sessions-list">${_renderActiveSessions(relevantActiveSessions)}</div></div>
          <div class="dash-section"><h3>📚 Course Progress</h3><div id="courses-progress" class="courses-grid">${_renderCourseProgress(attendanceStats.courses)}</div></div>
          <div class="dash-section"><h3>📅 Recent Sessions</h3><div id="recent-sessions" class="recent-list">${_renderRecentSessions(attendanceStats.courses)}</div></div>
        </div>`;
      
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(async (sessions) => {
        const activeList = UI.Q('active-sessions-list');
        if (activeList) {
          let relevant = sessions;
          if (currentSelectedCourse) {
            relevant = sessions.filter(s => DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse));
          }
          activeList.innerHTML = _renderActiveSessions(relevant);
        }
      });
    } catch(err) {
      console.error('Dashboard load error:', err);
      container.innerHTML = `<div class="pg"><div class="att-empty">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function _renderActiveSessions(sessions) {
    if (!sessions || sessions.length === 0) return '<div class="no-rec">No active sessions for your selected course.</div>';
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now());
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      const isCheckedIn = session.records ? Object.values(session.records).some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase()) : false;
      return `<div class="session-card active-session">
        <div class="session-header"><div class="session-code">${UI.esc(session.courseCode)}</div><div class="session-badge active">🟢 ACTIVE</div></div>
        <div class="session-name">${UI.esc(session.courseName)}</div>
        <div class="session-details"><span>📅 ${UI.esc(session.date)}</span><span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span><span>📍 ${session.locEnabled ? 'Location check' : 'No location'}</span></div>
        ${isCheckedIn ? '<div class="checked-in-badge">✅ Already Checked In</div>' : `<button class="btn btn-ug btn-sm checkin-btn" onclick="STUDENT_DASH.checkInToSession('${session.id}')">✓ Check In Now</button>`}
      </div>`;
    }).join('');
  }

  function _renderCourseProgress(courses) {
    if (!courses || courses.length === 0) return '<div class="no-rec">No course data available yet.</div>';
    return courses.map(course => {
      const percentage = course.percentage;
      const barColor = percentage >= 80 ? 'var(--teal)' : percentage >= 60 ? 'var(--amber)' : 'var(--danger)';
      return `<div class="course-card">
        <div class="course-header"><div class="course-code">${UI.esc(course.courseCode)}</div><div class="course-name">${UI.esc(course.courseName)}</div></div>
        <div class="course-stats"><span>Attended: ${course.attended}/${course.totalSessions}</span><span style="color:${barColor}">${percentage}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${percentage}%; background: ${barColor}"></div></div>
      </div>`;
    }).join('');
  }

  function _renderRecentSessions(courses) {
    let allSessions = [];
    for (const course of courses) {
      for (const session of course.sessions || []) {
        allSessions.push({ ...session, courseCode: course.courseCode, courseName: course.courseName });
      }
    }
    allSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = allSessions.slice(0, 10);
    if (recent.length === 0) return '<div class="no-rec">No recent sessions.</div>';
    return recent.map(session => `<div class="recent-item"><div class="recent-course">${UI.esc(session.courseCode)}</div><div class="recent-date">📅 ${UI.esc(session.date)}</div><div class="recent-time">⏰ ${UI.esc(session.time || '—')}</div><div class="recent-status present">✅ Present</div></div>`).join('');
  }

  async function changeCourse() {
    const select = UI.Q('course-select');
    if (select) {
      currentSelectedCourse = select.value || null;
      await loadDashboard();
    }
  }

  async function checkInToSession(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.error('Session Error', 'This session no longer exists.'); return; }
    if (!session.active) { await MODAL.error('Session Ended', 'This session has already ended.'); loadDashboard(); return; }
    if (Date.now() > session.expiresAt) { await MODAL.error('Session Expired', 'This session has expired.'); loadDashboard(); return; }
    
    const courseRecord = await DB.COURSE.get(session.courseCode);
    if (courseRecord && courseRecord.active === false) {
      await MODAL.error('Course Ended', `This course (${session.courseCode}) has been ended for the semester. Please contact your lecturer.`);
      return;
    }
    
    const payload = UI.b64e(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
    }));
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => loadDashboard(), 30000);
  }

  function stopAutoRefresh() {
    if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; }
  }

  function logout() { stopAutoRefresh(); AUTH.clearSession(); APP.goTo('landing'); }

  return { init, loadDashboard, checkInToSession, changeCourse, logout, stopAutoRefresh };
})();
