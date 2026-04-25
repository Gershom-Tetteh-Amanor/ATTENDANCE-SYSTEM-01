/* student-dashboard.js — Student Portal with Complete Functionality */
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

  // Helper to get academic period
  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    let academicYear;
    
    if (month >= 7) { // August (7) to December (11)
      semester = 1;
      academicYear = year;
    } else if (month >= 0 && month <= 6) { // January (0) to July (6)
      semester = 2;
      academicYear = year;
    } else {
      semester = 1;
      academicYear = year;
    }
    
    return { year: academicYear, semester };
  }

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    
    console.log('[STUDENT_DASH] Initializing for:', currentStudent.name);
    
    const container = UI.Q('student-dash-content');
    if (container) {
      container.innerHTML = '<div class="pg"><div class="att-empty"><span class="spin-ug"></span> Loading your dashboard...</div></div>';
    }
    
    await loadStudentData();
    await loadDashboard();
    startAutoRefresh();
  }

  async function loadStudentData() {
    try {
      // Get current academic period
      const period = getAcademicPeriod();
      currentSelectedYear = period.year;
      currentSelectedSemester = period.semester;
      
      // Get enrolled courses for student
      enrolledCourses = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId, null);
      
      // Get all sessions the student has attended
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId, null);
      
      console.log('[STUDENT_DASH] Enrolled courses:', enrolledCourses.length);
      console.log('[STUDENT_DASH] Past sessions:', allStudentSessions.length);
      
      // Set default selected course
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
      let sessionYear = s.year;
      let sessionSemester = s.semester;
      if (!sessionYear && s.date) {
        const sessionDate = new Date(s.date);
        const month = sessionDate.getMonth();
        sessionYear = sessionDate.getFullYear();
        sessionSemester = (month >= 7 || month <= 0) ? 1 : 2;
      }
      return sessionYear === currentSelectedYear && sessionSemester === currentSelectedSemester;
    });
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    
    try {
      // Get attendance stats for selected course
      const myId = currentStudent?.studentId;
      const stats = await DB.STUDENTS.getAttendanceStats(myId, null, currentSelectedCourse);
      attendanceStats = stats;
      
      // Get active sessions for enrolled courses
      const allActiveSessions = await DB.SESSION.getAll();
      let relevantActiveSessions = [];
      if (currentSelectedCourse) {
        relevantActiveSessions = allActiveSessions.filter(s => 
          s.active === true && 
          s.courseCode === currentSelectedCourse
        );
      } else {
        const enrolledCourseCodes = new Set(enrolledCourses.map(c => c.courseCode));
        relevantActiveSessions = allActiveSessions.filter(s => 
          s.active === true && enrolledCourseCodes.has(s.courseCode)
        );
      }
      
      // Get session history filtered by year/semester
      const filteredSessions = filterSessionsByYearAndSemester(allStudentSessions);
      let courseSessions = filteredSessions;
      if (currentSelectedCourse) {
        courseSessions = filteredSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      // Build session history HTML
      let sessionHistoryHtml = '';
      if (courseSessions.length === 0) {
        sessionHistoryHtml = '<div class="no-rec" style="padding:20px; font-size:13px">No sessions found for the selected period.</div>';
      } else {
        sessionHistoryHtml = courseSessions.map(session => {
          const records = session.records ? Object.values(session.records) : [];
          const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          const attendedTime = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())?.time || '—';
          const statusClass = attended ? 'present' : 'absent';
          const statusText = attended ? '✓ Present' : '✗ Absent';
          const statusColor = attended ? 'var(--teal)' : 'var(--danger)';
          const statusBg = attended ? 'var(--teal-l)' : 'var(--danger-s)';
          
          return `
            <div class="session-history-item" style="display:flex; align-items:center; justify-content:space-between; padding:12px; background:var(--surface); border-radius:10px; margin-bottom:8px; border-left:3px solid ${statusColor}; flex-wrap:wrap; gap:8px">
              <div>
                <span style="font-weight:600; font-size:14px">${UI.esc(session.courseCode)}</span>
                <span style="font-size:12px; color:var(--text3); margin-left:12px">📅 ${UI.esc(session.date)}</span>
                <span style="font-size:11px; color:var(--text3); margin-left:8px">⏱️ ${session.durationMins || 60} min</span>
              </div>
              <div>
                <span style="font-size:11px; margin-right:12px">⏰ ${UI.esc(attendedTime)}</span>
                <span style="padding:4px 12px; border-radius:20px; font-size:11px; background:${statusBg}; color:${statusColor}">${statusText}</span>
              </div>
            </div>
          `;
        }).join('');
      }
      
      // Build courses dropdown options
      let courseOptions = '<option value="">All Courses</option>';
      for (const course of enrolledCourses) {
        courseOptions += `<option value="${UI.esc(course.courseCode)}" ${currentSelectedCourse === course.courseCode ? 'selected' : ''}>${UI.esc(course.courseCode)} - ${UI.esc(course.courseName || '')}</option>`;
      }
      
      // Build years dropdown
      const currentYear = new Date().getFullYear();
      let yearsOptions = '';
      for (let y = currentYear - 2; y <= currentYear + 1; y++) {
        yearsOptions += `<option value="${y}" ${currentSelectedYear === y ? 'selected' : ''}>${y}</option>`;
      }
      
      container.innerHTML = `
        <div class="pg" style="padding:16px 12px; max-width:800px; margin:0 auto">
          <!-- Header -->
          <div class="dash-header" style="margin-bottom:20px">
            <h2 style="font-size:22px; margin-bottom:4px">🎓 Student Dashboard</h2>
            <p class="sub" style="font-size:13px; margin-bottom:0">Welcome back, <strong>${UI.esc(currentStudent.name)}</strong> (ID: ${UI.esc(currentStudent.studentId)})</p>
          </div>
          
          <!-- Filter Section -->
          <div class="filter-section" style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:flex-end">
            <div style="flex:1; min-width:120px">
              <label class="fl" style="font-size:12px; margin-bottom:4px">Academic Year</label>
              <select id="filter-year" class="fi" style="padding:10px; font-size:14px" onchange="STUDENT_DASH.changeFilters()">
                ${yearsOptions}
              </select>
            </div>
            <div style="flex:1; min-width:140px">
              <label class="fl" style="font-size:12px; margin-bottom:4px">Semester</label>
              <select id="filter-semester" class="fi" style="padding:10px; font-size:14px" onchange="STUDENT_DASH.changeFilters()">
                <option value="1" ${currentSelectedSemester === 1 ? 'selected' : ''}>First Semester (Aug - Jan)</option>
                <option value="2" ${currentSelectedSemester === 2 ? 'selected' : ''}>Second Semester (Feb - Jul)</option>
              </select>
            </div>
            <div style="flex:2; min-width:180px">
              <label class="fl" style="font-size:12px; margin-bottom:4px">Select Course</label>
              <select id="course-select" class="fi" style="padding:10px; font-size:14px" onchange="STUDENT_DASH.changeCourse()">
                ${courseOptions}
              </select>
            </div>
          </div>
          
          <!-- Stats Cards -->
          <div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px">
            <div class="stat-card" style="background:var(--surface); border-radius:12px; padding:16px 8px; text-align:center; border:1px solid var(--border); box-shadow:0 1px 3px rgba(0,0,0,0.05)">
              <div class="stat-icon" style="font-size:28px; margin-bottom:6px">📊</div>
              <div class="stat-value" style="font-size:28px; font-weight:700; color:var(--ug)">${attendanceStats?.totalSessions || 0}</div>
              <div class="stat-label" style="font-size:11px; color:var(--text3)">Total Sessions</div>
            </div>
            <div class="stat-card" style="background:var(--surface); border-radius:12px; padding:16px 8px; text-align:center; border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:28px; margin-bottom:6px">✅</div>
              <div class="stat-value" style="font-size:28px; font-weight:700; color:var(--ug)">${attendanceStats?.totalPresent || 0}</div>
              <div class="stat-label" style="font-size:11px; color:var(--text3)">Present</div>
            </div>
            <div class="stat-card" style="background:var(--surface); border-radius:12px; padding:16px 8px; text-align:center; border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:28px; margin-bottom:6px">📈</div>
              <div class="stat-value" style="font-size:28px; font-weight:700; color:${(attendanceStats?.attendancePercentage || 0) >= 70 ? 'var(--teal)' : (attendanceStats?.attendancePercentage || 0) >= 50 ? 'var(--amber)' : 'var(--danger)'}">${attendanceStats?.attendancePercentage || 0}%</div>
              <div class="stat-label" style="font-size:11px; color:var(--text3)">Attendance Rate</div>
            </div>
            <div class="stat-card" style="background:var(--surface); border-radius:12px; padding:16px 8px; text-align:center; border:1px solid var(--border)">
              <div class="stat-icon" style="font-size:28px; margin-bottom:6px">🎓</div>
              <div class="stat-value" style="font-size:28px; font-weight:700; color:var(--ug)">${enrolledCourses.length}</div>
              <div class="stat-label" style="font-size:11px; color:var(--text3)">Enrolled Courses</div>
            </div>
          </div>
          
          <!-- Active Sessions -->
          <div class="dash-section" style="margin-bottom:24px">
            <h3 style="font-size:16px; margin-bottom:12px; color:var(--ug)">🟢 Active Sessions</h3>
            <div id="active-sessions-list" class="sessions-list" style="display:flex; flex-direction:column; gap:10px">
              ${_renderActiveSessions(relevantActiveSessions)}
            </div>
          </div>
          
          <!-- Course Progress -->
          <div class="dash-section" style="margin-bottom:24px">
            <h3 style="font-size:16px; margin-bottom:12px; color:var(--ug)">📚 Course Progress</h3>
            <div id="courses-progress" class="courses-grid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px">
              ${_renderCourseProgress(attendanceStats?.courses || [])}
            </div>
          </div>
          
          <!-- Session History -->
          <div class="dash-section">
            <h3 style="font-size:16px; margin-bottom:12px; color:var(--ug)">📅 Session History</h3>
            <div style="margin-bottom:12px; text-align:right">
              <button class="btn btn-secondary btn-sm" onclick="STUDENT_DASH.exportHistoryToExcel()" style="width:auto; padding:6px 16px">📥 Export to Excel</button>
            </div>
            <div id="session-history" style="max-height:500px; overflow-y:auto">
              ${sessionHistoryHtml}
            </div>
          </div>
        </div>
      `;
      
      // Setup real-time listener for active sessions
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(null, async (sessions) => {
        const activeList = UI.Q('active-sessions-list');
        if (activeList) {
          let relevant = sessions;
          const enrolledCourseCodes = new Set(enrolledCourses.map(c => c.courseCode));
          relevant = sessions.filter(s => enrolledCourseCodes.has(s.courseCode));
          
          if (currentSelectedCourse) {
            relevant = relevant.filter(s => s.courseCode === currentSelectedCourse);
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
      return '<div class="no-rec" style="padding:20px; font-size:13px; background:var(--surface); border-radius:10px">No active sessions for your enrolled courses.</div>';
    }
    
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now());
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      const records = session.records ? Object.values(session.records) : [];
      const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      
      return `
        <div class="session-card active-session" style="background:var(--surface); border-radius:12px; padding:16px; border:1px solid var(--border); border-left:4px solid var(--teal)">
          <div class="session-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px">
            <div class="session-code" style="font-weight:700; font-size:16px; color:var(--ug)">${UI.esc(session.courseCode)}</div>
            <div class="session-badge active" style="font-size:11px; padding:4px 12px; border-radius:20px; background:var(--teal-l); color:var(--teal)">🟢 ACTIVE</div>
          </div>
          <div class="session-name" style="font-size:14px; color:var(--text2); margin-bottom:8px">${UI.esc(session.courseName)}</div>
          <div class="session-details" style="display:flex; gap:16px; font-size:12px; color:var(--text3); margin-bottom:12px; flex-wrap:wrap">
            <span>📅 ${UI.esc(session.date)}</span>
            <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
            <span>📍 ${session.locEnabled ? 'Location check enabled' : 'No location check'}</span>
            <span>👥 ${records.length} students checked in</span>
          </div>
          ${isCheckedIn ? 
            '<div class="checked-in-badge" style="background:var(--teal-l); color:var(--teal); padding:10px; border-radius:10px; text-align:center; font-size:13px; font-weight:500">✅ Already Checked In</div>' : 
            `<button class="btn btn-ug checkin-btn" onclick="STUDENT_DASH.directCheckIn('${session.id}')" style="width:100%; margin-top:8px; padding:10px; font-size:14px; border-radius:8px">✓ Check In Now</button>`
          }
        </div>
      `;
    }).join('');
  }

  function _renderCourseProgress(courses) {
    if (!courses || !courses.length) {
      return '<div class="no-rec" style="padding:20px; font-size:13px">No course data available.</div>';
    }
    
    return courses.map(course => { 
      const pct = course.percentage;
      const color = pct >= 80 ? 'var(--teal)' : (pct >= 60 ? 'var(--amber)' : 'var(--danger)');
      return `
        <div class="course-card" style="background:var(--surface); border-radius:12px; padding:14px; border:1px solid var(--border)">
          <div class="course-header" style="margin-bottom:8px">
            <div class="course-code" style="font-weight:700; font-size:14px; color:var(--ug)">${UI.esc(course.courseCode)}</div>
            <div class="course-name" style="font-size:12px; color:var(--text3); margin-top:4px">${UI.esc(course.courseName)}</div>
          </div>
          <div class="course-stats" style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12px">
            <span>${course.attended}/${course.totalSessions} sessions</span>
            <span style="color:${color}; font-weight:600">${pct}%</span>
          </div>
          <div class="progress-bar" style="height:6px; background:var(--surface2); border-radius:4px; overflow:hidden">
            <div class="progress-fill" style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition:width 0.3s"></div>
          </div>
        </div>
      `;
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
    
    // Create QR payload and redirect to check-in page
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

  async function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export library not loaded.');
      return;
    }
    
    try {
      const filteredSessions = filterSessionsByYearAndSemester(allStudentSessions);
      let courseSessions = filteredSessions;
      if (currentSelectedCourse) {
        courseSessions = filteredSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      const wsData = [
        ['Attendance History Report'],
        [`Student: ${currentStudent.name} (${currentStudent.studentId})`],
        [`Academic Year: ${currentSelectedYear} - Semester ${currentSelectedSemester === 1 ? 'First' : 'Second'}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ['#', 'Date', 'Course Code', 'Course Name', 'Status', 'Check-in Time', 'Duration', 'Verification Method']
      ];
      
      let i = 1;
      for (const session of courseSessions) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        const attendedRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        
        wsData.push([
          i++,
          session.date,
          session.courseCode,
          session.courseName,
          attended ? 'Present' : 'Absent',
          attendedRecord?.time || '—',
          `${session.durationMins || 60} min`,
          attendedRecord?.authMethod === 'manual' ? 'Manual' : (attendedRecord?.authMethod === 'webauthn' ? 'Biometric' : '—')
        ]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{wch:5}, {wch:12}, {wch:12}, {wch:25}, {wch:10}, {wch:12}, {wch:10}, {wch:15}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
      XLSX.writeFile(wb, `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`);
      
      await MODAL.success('Export Complete', 'Your attendance history has been exported.');
    } catch(err) {
      console.error('Export error:', err);
      await MODAL.error('Export Failed', err.message);
    }
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
    exportHistoryToExcel,
    logout, 
    stopAutoRefresh 
  };
})();
