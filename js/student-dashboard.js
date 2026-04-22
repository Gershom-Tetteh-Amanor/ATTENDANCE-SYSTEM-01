/* student-dashboard.js — Student Portal with Complete Functionality
   - View attendance statistics
   - Filter by Year and Semester
   - Select course from dropdown
   - See active sessions for enrolled courses
   - Direct check-in from dashboard
   - View session history (present/absent)
*/
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let attendanceStats = null;
  let refreshInterval = null;
  let currentSelectedCourse = null;
  let currentSelectedYear = null;
  let currentSelectedSemester = null;
  let enrolledCourses = [];
  let allStudentSessions = [];

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    
    // Show loading
    const container = UI.Q('student-dash-content');
    if (container) {
      container.innerHTML = '<div class="pg"><div class="att-empty">Loading your dashboard...</div></div>';
    }
    
    await loadStudentData();
    await loadDashboard();
    startAutoRefresh();
  }

  async function loadStudentData() {
    try {
      // Get enrolled courses for current semester
      enrolledCourses = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId);
      
      // Get all sessions the student has attended
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId);
      
      // Set default filters (current academic period)
      const period = DB.getCurrentAcademicPeriod();
      currentSelectedYear = period.year;
      currentSelectedSemester = period.semester;
      
      // If no enrolled courses but has sessions, create enrollment records
      if (enrolledCourses.length === 0 && allStudentSessions.length > 0) {
        const uniqueCourses = {};
        for (const session of allStudentSessions) {
          const code = session.courseCode;
          if (!uniqueCourses[code]) {
            uniqueCourses[code] = {
              courseCode: code,
              courseName: session.courseName,
              year: currentSelectedYear,
              semester: currentSelectedSemester
            };
            await DB.ENROLLMENT.enroll(
              currentStudent.studentId, 
              code, 
              session.courseName, 
              currentSelectedSemester, 
              currentSelectedYear
            );
          }
        }
        enrolledCourses = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId);
      }
      
      if (enrolledCourses.length > 0 && !currentSelectedCourse) {
        currentSelectedCourse = enrolledCourses[0].courseCode;
      }
    } catch(err) { 
      console.error('Load student data error:', err); 
      enrolledCourses = []; 
      allStudentSessions = [];
    }
  }

  function filterSessionsByYearAndSemester(sessions) {
    return sessions.filter(s => {
      const sessionDate = new Date(s.date);
      let sessionYear = sessionDate.getFullYear();
      let sessionMonth = sessionDate.getMonth();
      let sessionSemester = (sessionMonth >= 1 && sessionMonth <= 6) ? 2 : 1;
      
      if (sessionSemester === 2 && sessionMonth <= 6) {
        sessionYear = sessionYear - 1;
      }
      
      return sessionYear === currentSelectedYear && sessionSemester === currentSelectedSemester;
    });
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    
    try {
      // Get stats for selected course
      attendanceStats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId, currentSelectedCourse);
      
      // Get active sessions for selected course
      const allActiveSessions = await DB.SESSION.getAll();
      let relevantActiveSessions = [];
      if (currentSelectedCourse) {
        relevantActiveSessions = allActiveSessions.filter(s => 
          s.active === true && 
          DB.normalizeCourseCode(s.courseCode) === DB.normalizeCourseCode(currentSelectedCourse)
        );
      }
      
      // Get all sessions for the student filtered by year/semester
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
          const statusClass = attended ? 'present' : 'absent';
          const statusText = attended ? '✓ Present' : '✗ Absent';
          const statusColor = attended ? 'var(--teal)' : 'var(--danger)';
          const statusBg = attended ? 'var(--teal-l)' : 'var(--danger-s)';
          
          return `<div class="session-history-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--surface);border-radius:8px;margin-bottom:6px;border-left:3px solid ${statusColor}">
            <div>
              <span style="font-weight:600;font-size:13px">${UI.esc(session.courseCode)}</span>
              <span style="font-size:11px;color:var(--text3);margin-left:10px">📅 ${UI.esc(session.date)}</span>
            </div>
            <div>
              <span style="font-size:11px;margin-right:10px">⏰ ${UI.esc(attendedTime)}</span>
              <span style="padding:3px 10px;border-radius:20px;font-size:10px;background:${statusBg};color:${statusColor}">${statusText}</span>
            </div>
          </div>`;
        }).join('');
      }
      
      container.innerHTML = `
        <div class="pg" style="padding:16px 12px">
          <!-- Header -->
          <div class="dash-header" style="margin-bottom:16px">
            <h2 style="font-size:20px;margin-bottom:4px">🎓 Student Dashboard</h2>
            <p class="sub" style="font-size:12px;margin-bottom:0">Welcome, ${UI.esc(currentStudent.name)} (ID: ${UI.esc(currentStudent.studentId)})</p>
          </div>
          
          <!-- Filter Section -->
          <div class="filter-section" style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
            <div style="flex:1; min-width:120px">
              <label class="fl" style="font-size:11px;margin-bottom:3px">Academic Year</label>
              <select id="filter-year" class="fi" style="padding:8px 10px;font-size:13px" onchange="STUDENT_DASH.changeFilters()">
                <option value="2023" ${currentSelectedYear === 2023 ? 'selected' : ''}>2023</option>
                <option value="2024" ${currentSelectedYear === 2024 ? 'selected' : ''}>2024</option>
                <option value="2025" ${currentSelectedYear === 2025 ? 'selected' : ''}>2025</option>
                <option value="2026" ${currentSelectedYear === 2026 ? 'selected' : ''}>2026</option>
                <option value="2027" ${currentSelectedYear === 2027 ? 'selected' : ''}>2027</option>
              </select>
            </div>
            <div style="flex:1; min-width:140px">
              <label class="fl" style="font-size:11px;margin-bottom:3px">Semester</label>
              <select id="filter-semester" class="fi" style="padding:8px 10px;font-size:13px" onchange="STUDENT_DASH.changeFilters()">
                <option value="1" ${currentSelectedSemester === 1 ? 'selected' : ''}>First Semester (Aug - Jan)</option>
                <option value="2" ${currentSelectedSemester === 2 ? 'selected' : ''}>Second Semester (Feb - Jul)</option>
              </select>
            </div>
          </div>
          
          <!-- Course Selector -->
          <div class="course-selector" style="margin-bottom:16px">
            <label class="fl" style="font-size:11px;margin-bottom:3px">Select Course</label>
            <select id="course-select" class="fi" style="padding:8px 10px;font-size:13px" onchange="STUDENT_DASH.changeCourse()">
              <option value="">-- All Courses --</option>
              ${enrolledCourses.map(c => `<option value="${UI.esc(c.courseCode)}" ${currentSelectedCourse === c.courseCode ? 'selected' : ''}>${UI.esc(c.courseCode)} - ${UI.esc(c.courseName || '')} (${c.year} - Sem ${c.semester})</option>`).join('')}
            </select>
          </div>
          
          <!-- Stats Cards -->
          <div class="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
            <div class="stat-card" style="background:var(--surface);border-radius:10px;padding:12px 8px;text-align:center;border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:22px;margin-bottom:4px">📊</div>
              <div class="stat-value" style="font-size:22px;font-weight:700;color:var(--ug)">${attendanceStats.totalSessions}</div>
              <div class="stat-label" style="font-size:10px;color:var(--text3)">Total Sessions</div>
            </div>
            <div class="stat-card" style="background:var(--surface);border-radius:10px;padding:12px 8px;text-align:center;border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:22px;margin-bottom:4px">✅</div>
              <div class="stat-value" style="font-size:22px;font-weight:700;color:var(--ug)">${attendanceStats.totalPresent}</div>
              <div class="stat-label" style="font-size:10px;color:var(--text3)">Present</div>
            </div>
            <div class="stat-card" style="background:var(--surface);border-radius:10px;padding:12px 8px;text-align:center;border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:22px;margin-bottom:4px">📈</div>
              <div class="stat-value" style="font-size:22px;font-weight:700;color:var(--ug)">${attendanceStats.attendancePercentage}%</div>
              <div class="stat-label" style="font-size:10px;color:var(--text3)">Attendance Rate</div>
            </div>
            <div class="stat-card" style="background:var(--surface);border-radius:10px;padding:12px 8px;text-align:center;border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:22px;margin-bottom:4px">🎓</div>
              <div class="stat-value" style="font-size:22px;font-weight:700;color:var(--ug)">${attendanceStats.courses.length}</div>
              <div class="stat-label" style="font-size:10px;color:var(--text3)">Courses</div>
            </div>
          </div>
          
          <!-- Active Sessions -->
          <div class="dash-section" style="margin-bottom:20px">
            <h3 style="font-size:14px;margin-bottom:8px">🟢 Active Sessions</h3>
            <div id="active-sessions-list" class="sessions-list" style="display:flex;flex-direction:column;gap:10px">
              ${_renderActiveSessions(relevantActiveSessions)}
            </div>
          </div>
          
          <!-- Course Progress -->
          <div class="dash-section" style="margin-bottom:20px">
            <h3 style="font-size:14px;margin-bottom:8px">📚 Course Progress</h3>
            <div id="courses-progress" class="courses-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
              ${_renderCourseProgress(attendanceStats.courses)}
            </div>
          </div>
          
          <!-- Session History -->
          <div class="dash-section">
            <h3 style="font-size:14px;margin-bottom:8px">📅 Session History (${currentSelectedYear} - Semester ${currentSelectedSemester === 1 ? 'First' : 'Second'})</h3>
            <div id="session-history" style="max-height:400px;overflow-y:auto">
              ${sessionHistoryHtml}
            </div>
          </div>
        </div>
      `;
      
      // Setup real-time listener for active sessions
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
      container.innerHTML = `<div class="pg"><div class="att-empty" style="padding:40px">Error loading dashboard: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function _renderActiveSessions(sessions) {
    if (!sessions || !sessions.length) {
      return '<div class="no-rec" style="padding:20px;font-size:12px;background:var(--surface);border-radius:8px">No active sessions for this course.</div>';
    }
    
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now());
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      const isCheckedIn = session.records ? Object.values(session.records).some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase()) : false;
      
      return `<div class="session-card active-session" style="background:var(--surface);border-radius:10px;padding:12px;border:1px solid var(--border);border-left:3px solid var(--teal)">
        <div class="session-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="session-code" style="font-weight:700;font-size:14px;color:var(--ug)">${UI.esc(session.courseCode)}</div>
          <div class="session-badge active" style="font-size:10px;padding:3px 8px;border-radius:20px;background:var(--teal-l);color:var(--teal)">🟢 ACTIVE</div>
        </div>
        <div class="session-name" style="font-size:12px;color:var(--text2);margin-bottom:6px">${UI.esc(session.courseName)}</div>
        <div class="session-details" style="display:flex;gap:12px;font-size:11px;color:var(--text3);margin-bottom:10px;flex-wrap:wrap">
          <span>📅 ${UI.esc(session.date)}</span>
          <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
          <span>📍 ${session.locEnabled ? 'Location check' : 'No location'}</span>
        </div>
        ${isCheckedIn ? 
          '<div class="checked-in-badge" style="background:var(--teal-l);color:var(--teal);padding:8px;border-radius:8px;text-align:center;font-size:11px">✅ Already Checked In</div>' : 
          `<button class="btn btn-ug btn-sm checkin-btn" onclick="STUDENT_DASH.directCheckIn('${session.id}')" style="width:100%;margin-top:6px;padding:8px;font-size:12px;border-radius:6px">✓ Check In Now</button>`
        }
      </div>`;
    }).join('');
  }

  function _renderCourseProgress(courses) {
    if (!courses || !courses.length) {
      return '<div class="no-rec" style="padding:20px;font-size:12px">No course data available.</div>';
    }
    
    return courses.map(course => { 
      const pct = course.percentage;
      const color = pct >= 80 ? 'var(--teal)' : (pct >= 60 ? 'var(--amber)' : 'var(--danger)');
      return `<div class="course-card" style="background:var(--surface);border-radius:10px;padding:12px;border:1px solid var(--border)">
        <div class="course-header" style="margin-bottom:6px">
          <div class="course-code" style="font-weight:700;font-size:13px;color:var(--ug)">${UI.esc(course.courseCode)}</div>
          <div class="course-name" style="font-size:11px;color:var(--text3);margin-top:2px">${UI.esc(course.courseName)}</div>
        </div>
        <div class="course-stats" style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:11px">
          <span>${course.attended}/${course.totalSessions} sessions</span>
          <span style="color:${color};font-weight:500">${pct}%</span>
        </div>
        <div class="progress-bar" style="height:4px;background:var(--surface2);border-radius:4px;overflow:hidden">
          <div class="progress-fill" style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
        </div>
      </div>`;
    }).join('');
  }

  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { 
      await MODAL.error('Error', 'Session not found.'); 
      return; 
    }
    if (!session.active) { 
      await MODAL.error('Ended', 'Session has ended.'); 
      loadDashboard(); 
      return; 
    }
    if (Date.now() > session.expiresAt) { 
      await MODAL.error('Expired', 'Session expired.'); 
      loadDashboard(); 
      return; 
    }
    
    // Check if course is still active
    const courseRecord = await DB.COURSE.get(session.courseCode);
    if (courseRecord && courseRecord.active === false) { 
      await MODAL.error('Course Ended', `Course ${session.courseCode} has been ended for the semester.`); 
      return; 
    }
    
    // Create QR payload
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
    
    // Redirect to check-in page
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  async function changeCourse() { 
    const select = UI.Q('course-select'); 
    if (select) { 
      currentSelectedCourse = select.value || null; 
      await loadDashboard(); 
    } 
  }
  
  async function changeFilters() { 
    const yearSelect = UI.Q('filter-year'); 
    const semesterSelect = UI.Q('filter-semester');
    if (yearSelect) currentSelectedYear = parseInt(yearSelect.value);
    if (semesterSelect) currentSelectedSemester = parseInt(semesterSelect.value);
    await loadDashboard(); 
  }

  function startAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    refreshInterval = setInterval(() => loadDashboard(), 30000); 
  }
  
  function stopAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
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

  return { 
    init, 
    loadDashboard, 
    directCheckIn, 
    changeCourse, 
    changeFilters, 
    logout, 
    stopAutoRefresh 
  };
})();
