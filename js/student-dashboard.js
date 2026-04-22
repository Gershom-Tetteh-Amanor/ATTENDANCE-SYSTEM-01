/* student-dashboard.js — Student Portal with Year & Semester Filter */
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null, currentStudent = null, attendanceStats = null, refreshInterval = null, currentSelectedCourse = null, currentSelectedYear = null, currentSelectedSemester = null, enrolledCourses = [], allStudentSessions = [];

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') { APP.goTo('landing'); return; }
    currentStudent = user;
    await loadStudentData();
    await loadDashboard();
    startAutoRefresh();
  }

  async function loadStudentData() {
    try {
      enrolledCourses = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId);
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId);
      
      // Set default filters (current academic period)
      const period = DB.getCurrentAcademicPeriod();
      currentSelectedYear = period.year;
      currentSelectedSemester = period.semester;
      
      if (enrolledCourses.length > 0 && !currentSelectedCourse) {
        currentSelectedCourse = enrolledCourses[0].courseCode;
      }
    } catch(err) { console.error(err); enrolledCourses = []; allStudentSessions = []; }
  }

  function filterSessionsByYearAndSemester(sessions) {
    return sessions.filter(s => {
      const sessionDate = new Date(s.date);
      let sessionYear = sessionDate.getFullYear();
      let sessionMonth = sessionDate.getMonth();
      let sessionSemester = (sessionMonth >= 1 && sessionMonth <= 6) ? 2 : 1;
      
      // For academic year display (e.g., 2024/2025)
      if (sessionSemester === 2 && sessionMonth <= 6) {
        sessionYear = sessionYear - 1;
      }
      
      return sessionYear === currentSelectedYear && sessionSemester === currentSelectedSemester;
    });
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    container.innerHTML = '<div class="pg"><div class="att-empty" style="padding:20px">Loading...</div></div>';
    try {
      // Get stats for selected course
      attendanceStats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId, currentSelectedCourse);
      
      // Get active sessions
      const allActiveSessions = await DB.SESSION.getAll();
      let relevantActiveSessions = [];
      if (currentSelectedCourse) {
        relevantActiveSessions = allActiveSessions.filter(s => 
          s.active === true && 
          DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse)
        );
      }
      
      // Get all sessions for the student (for history)
      const filteredSessions = filterSessionsByYearAndSemester(allStudentSessions);
      const courseSessions = filteredSessions.filter(s => 
        !currentSelectedCourse || DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse)
      );
      
      // Build session history HTML
      let sessionHistoryHtml = '';
      if (courseSessions.length === 0) {
        sessionHistoryHtml = '<div class="no-rec" style="padding:16px;font-size:12px">No sessions for this course in the selected academic period.</div>';
      } else {
        sessionHistoryHtml = courseSessions.map(session => {
          const records = session.records ? Object.values(session.records) : [];
          const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          const attendedTime = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())?.time || '—';
          return `<div class="session-history-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--surface);border-radius:6px;margin-bottom:4px;border-left:3px solid ${attended ? 'var(--teal)' : 'var(--danger)'}">
            <div><span style="font-weight:600;font-size:12px">${UI.esc(session.courseCode)}</span><span style="font-size:11px;color:var(--text3);margin-left:8px">📅 ${UI.esc(session.date)}</span></div>
            <div><span style="font-size:11px">⏰ ${UI.esc(attendedTime)}</span><span style="margin-left:10px;padding:2px 8px;border-radius:12px;font-size:10px;background:${attended ? 'var(--teal-l)' : 'var(--danger-s)'};color:${attended ? 'var(--teal)' : 'var(--danger)'}">${attended ? '✓ Present' : '✗ Absent'}</span></div>
          </div>`;
        }).join('');
      }
      
      container.innerHTML = `<div class="pg" style="padding:16px 12px">
        <div class="dash-header" style="margin-bottom:12px">
          <h2 style="font-size:18px;margin-bottom:2px">Student Dashboard</h2>
          <p class="sub" style="font-size:11px;margin-bottom:0">Welcome, ${UI.esc(currentStudent.name)} (ID: ${UI.esc(currentStudent.studentId)})</p>
        </div>
        
        <!-- Filter Section: Year and Semester -->
        <div class="filter-section" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <div style="flex:1">
            <label class="fl" style="font-size:10px;margin-bottom:2px">Academic Year</label>
            <select id="filter-year" class="fi" style="padding:6px 8px;font-size:12px" onchange="STUDENT_DASH.changeFilters()">
              <option value="2023" ${currentSelectedYear === 2023 ? 'selected' : ''}>2023</option>
              <option value="2024" ${currentSelectedYear === 2024 ? 'selected' : ''}>2024</option>
              <option value="2025" ${currentSelectedYear === 2025 ? 'selected' : ''}>2025</option>
              <option value="2026" ${currentSelectedYear === 2026 ? 'selected' : ''}>2026</option>
              <option value="2027" ${currentSelectedYear === 2027 ? 'selected' : ''}>2027</option>
            </select>
          </div>
          <div style="flex:1">
            <label class="fl" style="font-size:10px;margin-bottom:2px">Semester</label>
            <select id="filter-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="STUDENT_DASH.changeFilters()">
              <option value="1" ${currentSelectedSemester === 1 ? 'selected' : ''}>First Semester (Aug - Jan)</option>
              <option value="2" ${currentSelectedSemester === 2 ? 'selected' : ''}>Second Semester (Feb - Jul)</option>
            </select>
          </div>
        </div>
        
        <div class="course-selector" style="margin-bottom:12px">
          <label class="fl" style="font-size:11px;margin-bottom:2px">Select Course</label>
          <select id="course-select" class="fi" style="padding:6px 8px;font-size:12px" onchange="STUDENT_DASH.changeCourse()">
            <option value="">-- All Courses --</option>
            ${enrolledCourses.map(c => `<option value="${UI.esc(c.courseCode)}" ${currentSelectedCourse === c.courseCode ? 'selected' : ''}>${UI.esc(c.courseCode)} (${c.year} - Sem ${c.semester})</option>`).join('')}
          </select>
        </div>
        
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
          <div class="stat-card" style="background:var(--surface);border-radius:8px;padding:8px 4px;text-align:center;border:1px solid var(--border)">
            <div class="stat-icon" style="font-size:18px;margin-bottom:2px">📊</div>
            <div class="stat-value" style="font-size:18px;font-weight:700;color:var(--ug)">${attendanceStats.totalSessions}</div>
            <div class="stat-label" style="font-size:9px;color:var(--text3)">Sessions</div>
          </div>
          <div class="stat-card" style="background:var(--surface);border-radius:8px;padding:8px 4px;text-align:center;border:1px solid var(--border)">
            <div class="stat-icon" style="font-size:18px;margin-bottom:2px">✅</div>
            <div class="stat-value" style="font-size:18px;font-weight:700;color:var(--ug)">${attendanceStats.totalPresent}</div>
            <div class="stat-label" style="font-size:9px;color:var(--text3)">Present</div>
          </div>
          <div class="stat-card" style="background:var(--surface);border-radius:8px;padding:8px 4px;text-align:center;border:1px solid var(--border)">
            <div class="stat-icon" style="font-size:18px;margin-bottom:2px">📈</div>
            <div class="stat-value" style="font-size:18px;font-weight:700;color:var(--ug)">${attendanceStats.attendancePercentage}%</div>
            <div class="stat-label" style="font-size:9px;color:var(--text3)">Attendance</div>
          </div>
          <div class="stat-card" style="background:var(--surface);border-radius:8px;padding:8px 4px;text-align:center;border:1px solid var(--border)">
            <div class="stat-icon" style="font-size:18px;margin-bottom:2px">🎓</div>
            <div class="stat-value" style="font-size:18px;font-weight:700;color:var(--ug)">${attendanceStats.courses.length}</div>
            <div class="stat-label" style="font-size:9px;color:var(--text3)">Courses</div>
          </div>
        </div>
        
        <div class="dash-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;margin-bottom:6px">🟢 Active Sessions</h3>
          <div id="active-sessions-list" class="sessions-list" style="display:flex;flex-direction:column;gap:8px">${_renderActiveSessions(relevantActiveSessions)}</div>
        </div>
        
        <div class="dash-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;margin-bottom:6px">📚 Course Progress</h3>
          <div id="courses-progress" class="courses-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">${_renderCourseProgress(attendanceStats.courses)}</div>
        </div>
        
        <div class="dash-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;margin-bottom:6px">📅 Session History (${currentSelectedYear} - Semester ${currentSelectedSemester === 1 ? 'First' : 'Second'})</h3>
          <div id="session-history" style="display:flex;flex-direction:column;gap:4px">${sessionHistoryHtml}</div>
        </div>
      </div>`;
      
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(async (sessions) => {
        const activeList = UI.Q('active-sessions-list');
        if (activeList) {
          let relevant = sessions;
          if (currentSelectedCourse) relevant = sessions.filter(s => DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse));
          activeList.innerHTML = _renderActiveSessions(relevant);
        }
      });
    } catch(err) { container.innerHTML = `<div class="pg"><div class="att-empty">Error: ${UI.esc(err.message)}</div></div>`; }
  }

  function _renderActiveSessions(sessions) {
    if (!sessions || !sessions.length) return '<div class="no-rec" style="padding:16px;font-size:12px">No active sessions for this course.</div>';
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now()), minutesLeft = Math.floor(timeRemaining / 60000), secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      const isCheckedIn = session.records ? Object.values(session.records).some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase()) : false;
      return `<div class="session-card active-session" style="background:var(--surface);border-radius:8px;padding:10px;border:1px solid var(--border);border-left:3px solid var(--teal);margin-bottom:0">
        <div class="session-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <div class="session-code" style="font-weight:700;font-size:13px;color:var(--ug)">${UI.esc(session.courseCode)}</div>
          <div class="session-badge active" style="font-size:9px;padding:2px 5px;border-radius:12px;background:var(--teal-l);color:var(--teal)">🟢 ACTIVE</div>
        </div>
        <div class="session-name" style="font-size:11px;color:var(--text2);margin-bottom:4px">${UI.esc(session.courseName)}</div>
        <div class="session-details" style="display:flex;gap:8px;font-size:10px;color:var(--text3);margin-bottom:6px;flex-wrap:wrap">
          <span>📅 ${UI.esc(session.date)}</span>
          <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
          <span>📍 ${session.locEnabled ? 'Location' : 'No location'}</span>
        </div>
        ${isCheckedIn ? '<div class="checked-in-badge" style="background:var(--teal-l);color:var(--teal);padding:5px;border-radius:5px;text-align:center;margin-top:5px;font-size:10px">✅ Already Checked In</div>' : `<button class="btn btn-ug btn-sm checkin-btn" onclick="STUDENT_DASH.directCheckIn('${session.id}')" style="width:100%;margin-top:5px;padding:6px;font-size:11px;border-radius:5px">✓ Check In Now</button>`}
      </div>`;
    }).join('');
  }

  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.error('Error', 'Session not found.'); return; }
    if (!session.active) { await MODAL.error('Ended', 'Session has ended.'); loadDashboard(); return; }
    if (Date.now() > session.expiresAt) { await MODAL.error('Expired', 'Session expired.'); loadDashboard(); return; }
    
    const courseRecord = await DB.COURSE.get(session.courseCode);
    if (courseRecord && courseRecord.active === false) { await MODAL.error('Course Ended', `Course ${session.courseCode} ended for semester.`); return; }
    
    const payload = UI.b64e(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
    }));
    
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  function _renderCourseProgress(courses) {
    if (!courses || !courses.length) return '<div class="no-rec" style="padding:16px;font-size:12px">No course data.</div>';
    return courses.map(course => { 
      const pct = course.percentage, color = pct >= 80 ? 'var(--teal)' : pct >= 60 ? 'var(--amber)' : 'var(--danger)';
      return `<div class="course-card" style="background:var(--surface);border-radius:8px;padding:8px;border:1px solid var(--border)">
        <div class="course-header" style="margin-bottom:4px">
          <div class="course-code" style="font-weight:700;font-size:12px;color:var(--ug)">${UI.esc(course.courseCode)}</div>
          <div class="course-name" style="font-size:10px;color:var(--text3)">${UI.esc(course.courseName)}</div>
        </div>
        <div class="course-stats" style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:10px">
          <span>${course.attended}/${course.totalSessions}</span>
          <span style="color:${color}">${pct}%</span>
        </div>
        <div class="progress-bar" style="height:3px;background:var(--surface2);border-radius:2px;overflow:hidden">
          <div class="progress-fill" style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
        </div>
      </div>`;
    }).join('');
  }

  async function changeCourse() { const select = UI.Q('course-select'); if (select) { currentSelectedCourse = select.value || null; await loadDashboard(); } }
  async function changeFilters() { 
    const yearSelect = UI.Q('filter-year'); 
    const semesterSelect = UI.Q('filter-semester');
    if (yearSelect) currentSelectedYear = parseInt(yearSelect.value);
    if (semesterSelect) currentSelectedSemester = parseInt(semesterSelect.value);
    await loadDashboard(); 
  }

  function startAutoRefresh() { if (refreshInterval) clearInterval(refreshInterval); refreshInterval = setInterval(() => loadDashboard(), 30000); }
  function stopAutoRefresh() { if (refreshInterval) clearInterval(refreshInterval); if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; } }
  function logout() { stopAutoRefresh(); AUTH.clearSession(); APP.goTo('landing'); }

  return { init, loadDashboard, directCheckIn, changeCourse, changeFilters, logout, stopAutoRefresh };
})();
