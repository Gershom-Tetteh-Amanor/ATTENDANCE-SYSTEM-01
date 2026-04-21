/* student-dashboard.js — Student Dashboard
   Students can:
   - Track their attendance progress
   - See active sessions for courses they've attended
   - Check in directly from the dashboard
*/
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let attendanceStats = null;
  let refreshInterval = null;

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    
    currentStudent = user;
    await loadDashboard();
    startAutoRefresh();
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    
    container.innerHTML = '<div class="pg"><div class="att-empty">Loading your dashboard...</div></div>';
    
    try {
      // Get attendance stats
      attendanceStats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId);
      
      // Get active sessions for courses the student has attended
      const allActiveSessions = await DB.SESSION.getAll();
      const activeSessions = allActiveSessions.filter(s => s.active === true);
      
      // Get courses the student has attended
      const attendedCourses = attendanceStats.courses.map(c => DB.normalizeCourseCode(c.courseCode));
      
      // Filter active sessions that match student's courses
      const relevantActiveSessions = activeSessions.filter(s => 
        attendedCourses.includes(DB.normalizeCourseCode(s.courseCode))
      );
      
      // Render dashboard
      container.innerHTML = `
        <div class="pg">
          <div class="dash-header">
            <h2>Student Dashboard</h2>
            <p class="sub">Welcome back, ${UI.esc(currentStudent.name)}!</p>
          </div>
          
          <!-- Stats Cards -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-icon">📊</div>
              <div class="stat-value">${attendanceStats.totalSessions}</div>
              <div class="stat-label">Total Sessions</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">✅</div>
              <div class="stat-value">${attendanceStats.totalPresent}</div>
              <div class="stat-label">Present</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">📈</div>
              <div class="stat-value">${attendanceStats.attendancePercentage}%</div>
              <div class="stat-label">Attendance Rate</div>
            </div>
            <div class="stat-card">
              <div class="stat-icon">🎓</div>
              <div class="stat-value">${attendanceStats.courses.length}</div>
              <div class="stat-label">Courses</div>
            </div>
          </div>
          
          <!-- Active Sessions Section -->
          <div class="dash-section">
            <h3>🟢 Active Sessions You Can Join</h3>
            <p class="sub">Sessions currently in progress for your courses</p>
            <div id="active-sessions-list" class="sessions-list">
              ${_renderActiveSessions(relevantActiveSessions)}
            </div>
          </div>
          
          <!-- Course Progress Section -->
          <div class="dash-section">
            <h3>📚 Your Course Progress</h3>
            <div id="courses-progress" class="courses-grid">
              ${_renderCourseProgress(attendanceStats.courses)}
            </div>
          </div>
          
          <!-- Recent Sessions -->
          <div class="dash-section">
            <h3>📅 Recent Sessions</h3>
            <div id="recent-sessions" class="recent-list">
              ${_renderRecentSessions(attendanceStats.courses)}
            </div>
          </div>
        </div>
      `;
      
      // Setup real-time listener for active sessions
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(async (sessions) => {
        const activeList = UI.Q('active-sessions-list');
        if (activeList) {
          const relevant = sessions.filter(s => 
            attendedCourses.includes(DB.normalizeCourseCode(s.courseCode))
          );
          activeList.innerHTML = _renderActiveSessions(relevant);
        }
      });
      
    } catch(err) {
      console.error('Dashboard load error:', err);
      container.innerHTML = `<div class="pg"><div class="att-empty">Error loading dashboard: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function _renderActiveSessions(sessions) {
    if (!sessions || sessions.length === 0) {
      return '<div class="no-rec">No active sessions for your courses at the moment.</div>';
    }
    
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now());
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      
      return `
        <div class="session-card active-session" data-session='${JSON.stringify(session)}'>
          <div class="session-header">
            <div class="session-code">${UI.esc(session.courseCode)}</div>
            <div class="session-badge active">🟢 ACTIVE</div>
          </div>
          <div class="session-name">${UI.esc(session.courseName)}</div>
          <div class="session-details">
            <span>📅 ${UI.esc(session.date)}</span>
            <span>⏱️ Expires in: ${minutesLeft}m ${secondsLeft}s</span>
            <span>📍 ${session.locEnabled ? 'Location check enabled' : 'No location check'}</span>
          </div>
          <button class="btn btn-ug btn-sm checkin-btn" onclick="STUDENT_DASH.checkInToSession('${session.id}')">
            ✓ Check In Now
          </button>
        </div>
      `;
    }).join('');
  }

  function _renderCourseProgress(courses) {
    if (!courses || courses.length === 0) {
      return '<div class="no-rec">No course data available yet.</div>';
    }
    
    return courses.map(course => {
      const percentage = course.percentage;
      const barColor = percentage >= 80 ? 'var(--teal)' : percentage >= 60 ? 'var(--amber)' : 'var(--danger)';
      
      return `
        <div class="course-card">
          <div class="course-header">
            <div class="course-code">${UI.esc(course.courseCode)}</div>
            <div class="course-name">${UI.esc(course.courseName)}</div>
          </div>
          <div class="course-stats">
            <div class="stat-item">
              <span class="stat-label">Attended:</span>
              <span class="stat-value">${course.attended}/${course.totalSessions}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Percentage:</span>
              <span class="stat-value" style="color:${barColor}">${percentage}%</span>
            </div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%; background: ${barColor}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function _renderRecentSessions(courses) {
    let allSessions = [];
    for (const course of courses) {
      for (const session of course.sessions || []) {
        allSessions.push({
          ...session,
          courseCode: course.courseCode,
          courseName: course.courseName
        });
      }
    }
    
    allSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const recent = allSessions.slice(0, 10);
    
    if (recent.length === 0) {
      return '<div class="no-rec">No recent sessions.</div>';
    }
    
    return recent.map(session => `
      <div class="recent-item">
        <div class="recent-course">${UI.esc(session.courseCode)}</div>
        <div class="recent-date">📅 ${UI.esc(session.date)}</div>
        <div class="recent-time">⏰ ${UI.esc(session.time || '—')}</div>
        <div class="recent-status present">✅ Present</div>
      </div>
    `).join('');
  }

  async function checkInToSession(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.error('Session Error', 'This session no longer exists.');
      return;
    }
    
    if (!session.active) {
      await MODAL.error('Session Ended', 'This session has already ended.');
      loadDashboard();
      return;
    }
    
    if (Date.now() > session.expiresAt) {
      await MODAL.error('Session Expired', 'This session has expired.');
      loadDashboard();
      return;
    }
    
    // Store session data and redirect to check-in
    const payload = UI.b64e(JSON.stringify({
      id: session.id,
      token: session.token,
      code: session.courseCode,
      course: session.courseName,
      date: session.date,
      expiresAt: session.expiresAt,
      lat: session.lat,
      lng: session.lng,
      radius: session.radius,
      locEnabled: session.locEnabled
    }));
    
    // Store student info for pre-fill
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      loadDashboard();
    }, 30000); // Refresh every 30 seconds
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    if (activeSessionListener) {
      activeSessionListener();
      activeSessionListener = null;
    }
  }

  function logout() {
    stopAutoRefresh();
    AUTH.clearSession();
    APP.goTo('landing');
  }

  return { init, loadDashboard, checkInToSession, logout, stopAutoRefresh };
})();
