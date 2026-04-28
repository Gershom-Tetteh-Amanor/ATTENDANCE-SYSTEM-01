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
  let lecturersMap = new Map();

  // Helper to get academic period
  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    
    if (month >= 7 && month <= 12) {
      semester = 1;
    } else if (month >= 0 && month <= 6) {
      semester = 2;
    } else {
      semester = 1;
    }
    
    return { year, semester };
  }

  function getAcademicYearRange(year, semester) {
    if (semester === 1) {
      return `${year} - ${year + 1}`;
    } else {
      return `${year - 1} - ${year}`;
    }
  }

  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    
    console.log('[STUDENT_DASH] Initializing for student ID:', currentStudent.studentId);
    
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
      // Get all enrollments for the student
      const allEnrollments = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId, null);
      console.log('[STUDENT_DASH] Enrollments found:', allEnrollments.length);
      
      // Fetch lecturer names for each enrollment
      for (const enrollment of allEnrollments) {
        if (!lecturersMap.has(enrollment.lecId)) {
          const lecturer = await DB.LEC.get(enrollment.lecId);
          lecturersMap.set(enrollment.lecId, lecturer?.name || 'Unknown Lecturer');
        }
      }
      
      // Build enrolled courses array
      enrolledCourses = allEnrollments.map(enrollment => ({
        studentId: enrollment.studentId,
        lecId: enrollment.lecId,
        courseCode: enrollment.courseCode,
        courseName: enrollment.courseName || enrollment.courseCode,
        year: enrollment.year,
        semester: enrollment.semester,
        enrolledAt: enrollment.enrolledAt,
        lecturerName: lecturersMap.get(enrollment.lecId) || 'Unknown Lecturer'
      }));
      
      console.log('[STUDENT_DASH] Processed courses:', enrolledCourses.length);
      
      // Get all sessions the student has attended
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId, null);
      console.log('[STUDENT_DASH] Past sessions (attended):', allStudentSessions.length);
      
      // Set default period to current or most recent
      const currentPeriod = getAcademicPeriod();
      let defaultYear = currentPeriod.year;
      let defaultSemester = currentPeriod.semester;
      
      // Check if student has enrollments in current period
      const hasCurrentPeriod = enrolledCourses.some(c => 
        c.year === defaultYear && c.semester === defaultSemester
      );
      
      if (!hasCurrentPeriod && enrolledCourses.length > 0) {
        // Use the most recent enrollment
        const sorted = [...enrolledCourses].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.semester - a.semester;
        });
        defaultYear = sorted[0].year;
        defaultSemester = sorted[0].semester;
      }
      
      currentSelectedYear = defaultYear;
      currentSelectedSemester = defaultSemester;
      
      // Set default course
      const periodCourses = getCoursesForCurrentPeriod();
      if (periodCourses.length > 0) {
        currentSelectedCourse = periodCourses[0].courseCode;
      } else {
        currentSelectedCourse = null;
      }
      
      console.log('[STUDENT_DASH] Selected period:', currentSelectedYear, currentSelectedSemester);
      console.log('[STUDENT_DASH] Selected course:', currentSelectedCourse);
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Load student data error:', err); 
      enrolledCourses = []; 
      allStudentSessions = [];
    }
  }

  function getAvailablePeriods() {
    const periods = new Map();
    for (const course of enrolledCourses) {
      const key = `${course.year}_${course.semester}`;
      if (!periods.has(key)) {
        periods.set(key, {
          year: course.year,
          semester: course.semester,
          courses: []
        });
      }
      periods.get(key).courses.push(course);
    }
    return Array.from(periods.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.semester - a.semester;
    });
  }

  function getCoursesForCurrentPeriod() {
    return enrolledCourses.filter(c => 
      c.year === currentSelectedYear && 
      c.semester === currentSelectedSemester
    );
  }

  // Get ALL sessions for the current period (for history - shows both present and absent)
  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const courseCodes = new Set(periodCourses.map(c => c.courseCode));
    
    let sessions = allSessions.filter(s => 
      courseCodes.has(s.courseCode) && 
      s.year === currentSelectedYear && 
      s.semester === currentSelectedSemester
    );
    
    // Add attendance status to each session
    for (const session of sessions) {
      const records = session.records ? Object.values(session.records) : [];
      session.attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      session.myRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
    }
    
    return sessions;
  }

  async function loadDashboard() {
    const container = UI.Q('student-dash-content');
    if (!container) return;
    
    try {
      const periodCourses = getCoursesForCurrentPeriod();
      const availablePeriods = getAvailablePeriods();
      
      // Get ALL sessions for current period (for complete history)
      const allPeriodSessions = await getAllSessionsForCurrentPeriod();
      
      console.log('[STUDENT_DASH] All sessions for period:', allPeriodSessions.length);
      console.log('[STUDENT_DASH] Attended sessions:', allPeriodSessions.filter(s => s.attended).length);
      console.log('[STUDENT_DASH] Absent sessions:', allPeriodSessions.filter(s => !s.attended).length);
      
      // Calculate attendance stats from all sessions
      const totalSessions = allPeriodSessions.length;
      const totalPresent = allPeriodSessions.filter(s => s.attended).length;
      const attendancePercentage = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;
      
      // Get active sessions
      const allActiveSessions = await DB.SESSION.getAll();
      const activeCourseCodes = new Set(periodCourses.map(c => c.courseCode));
      let relevantActiveSessions = allActiveSessions.filter(s => 
        s.active === true && activeCourseCodes.has(s.courseCode)
      );
      if (currentSelectedCourse) {
        relevantActiveSessions = relevantActiveSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      // Build session history showing BOTH present AND absent
      let sessionHistoryHtml = '';
      if (allPeriodSessions.length === 0) {
        sessionHistoryHtml = '<div class="no-rec">No sessions found for this period.</div>';
      } else {
        const sortedSessions = [...allPeriodSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        for (const session of sortedSessions) {
          const attended = session.attended;
          const attendedRecord = session.myRecord;
          
          sessionHistoryHtml += `
            <div class="session-history-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:var(--surface); border-radius:8px; margin-bottom:6px; border-left:3px solid ${attended ? 'var(--teal)' : 'var(--danger)'}; flex-wrap:wrap; gap:8px">
              <div style="flex:1">
                <div>
                  <span style="font-weight:600; font-size:13px">${UI.esc(session.courseCode)}</span>
                  <span style="font-size:10px; color:var(--text3); margin-left:6px">${UI.esc(session.courseName || '')}</span>
                </div>
                <div style="font-size:10px; color:var(--text3); margin-top:3px">
                  📅 ${UI.esc(session.date)} · ⏱️ ${session.durationMins || 60} min · 👨‍🏫 ${UI.esc(session.lecturer || 'Unknown')}
                </div>
              </div>
              <div>
                <span class="pill ${attended ? 'pill-teal' : 'pill-red'}" style="padding:2px 8px; font-size:10px">
                  ${attended ? '✓ Present' : '✗ Absent'}
                </span>
                ${attended && attendedRecord ? `<span style="font-size:10px; margin-left:6px">⏰ ${attendedRecord.time}</span>` : ''}
              </div>
            </div>
          `;
        }
      }
      
      // Build course options
      let courseOptions = '<option value="">All Courses</option>';
      for (const course of periodCourses) {
        courseOptions += `<option value="${UI.esc(course.courseCode)}" ${currentSelectedCourse === course.courseCode ? 'selected' : ''}>${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)}</option>`;
      }
      
      // Build period options
      let periodOptions = '';
      if (availablePeriods.length === 0) {
        periodOptions = '<option value="">No enrollments found</option>';
      } else {
        for (const period of availablePeriods) {
          const selected = (period.year === currentSelectedYear && period.semester === currentSelectedSemester);
          const semesterName = period.semester === 1 ? 'First Semester' : 'Second Semester';
          const yearRange = getAcademicYearRange(period.year, period.semester);
          periodOptions += `<option value="${period.year}_${period.semester}" ${selected ? 'selected' : ''}>${period.year} - ${semesterName} (${yearRange}) - ${period.courses.length} course(s)</option>`;
        }
      }
      
      // Calculate stats colors
      const attendanceColor = attendancePercentage >= 70 ? 'var(--teal)' : (attendancePercentage >= 50 ? 'var(--amber)' : 'var(--danger)');
      
      container.innerHTML = `
        <div class="pg" style="padding:12px; max-width:1000px; margin:0 auto">
          <!-- Header -->
          <div class="dash-header" style="margin-bottom:12px">
            <h2 style="font-size:20px; margin-bottom:2px">🎓 Student Dashboard</h2>
            <p class="sub" style="font-size:12px; margin-bottom:0">Welcome back, <strong>${UI.esc(currentStudent.name)}</strong> (ID: ${UI.esc(currentStudent.studentId)})</p>
          </div>
          
          <!-- Period and Course Filter Section -->
          <div class="filter-section" style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap; align-items:flex-end">
            <div style="flex:2; min-width:180px">
              <label class="fl" style="font-size:11px; margin-bottom:3px">📅 Academic Period</label>
              <select id="period-select" class="fi" style="padding:8px; font-size:13px" onchange="STUDENT_DASH.changePeriod()">
                ${periodOptions}
              </select>
            </div>
            <div style="flex:2; min-width:200px">
              <label class="fl" style="font-size:11px; margin-bottom:3px">📚 Course</label>
              <select id="course-select" class="fi" style="padding:8px; font-size:13px" onchange="STUDENT_DASH.changeCourse()">
                ${courseOptions}
              </select>
            </div>
          </div>
          
          <!-- Stats Cards - Reduced Size -->
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:15px">
            <div class="stat-card" style="padding:8px 4px">
              <div class="stat-icon" style="font-size:20px; margin-bottom:3px">📊</div>
              <div class="stat-value" style="font-size:20px">${totalSessions}</div>
              <div class="stat-label" style="font-size:9px">Sessions</div>
            </div>
            <div class="stat-card" style="padding:8px 4px">
              <div class="stat-icon" style="font-size:20px; margin-bottom:3px">✅</div>
              <div class="stat-value" style="font-size:20px">${totalPresent}</div>
              <div class="stat-label" style="font-size:9px">Present</div>
            </div>
            <div class="stat-card" style="padding:8px 4px">
              <div class="stat-icon" style="font-size:20px; margin-bottom:3px">📈</div>
              <div class="stat-value" style="font-size:20px; color:${attendanceColor}">${attendancePercentage}%</div>
              <div class="stat-label" style="font-size:9px">Attendance</div>
            </div>
            <div class="stat-card" style="padding:8px 4px">
              <div class="stat-icon" style="font-size:20px; margin-bottom:3px">🎓</div>
              <div class="stat-value" style="font-size:20px">${periodCourses.length}</div>
              <div class="stat-label" style="font-size:9px">Enrolled</div>
            </div>
          </div>
          
          <!-- Enrolled Courses List - Smaller Cards -->
          <div class="dash-section" style="margin-bottom:15px">
            <h3 style="font-size:14px; margin-bottom:8px">📚 My Enrolled Courses</h3>
            <div id="enrolled-courses-list" class="courses-grid" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:8px">
              ${_renderEnrolledCourses(periodCourses)}
            </div>
          </div>
          
          <!-- Active Sessions -->
          <div class="dash-section" style="margin-bottom:15px">
            <h3 style="font-size:14px; margin-bottom:8px">🟢 Active Sessions</h3>
            <div id="active-sessions-list" class="sessions-list" style="display:flex; flex-direction:column; gap:8px">
              ${_renderActiveSessions(relevantActiveSessions)}
            </div>
          </div>
          
          <!-- Session History (shows both present and absent) -->
          <div class="dash-section">
            <h3 style="font-size:14px; margin-bottom:8px">📅 Session History</h3>
            <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px">
              <div>
                <span class="pill pill-teal" style="margin-right:6px; font-size:10px">✓ Present: ${totalPresent}</span>
                <span class="pill pill-red" style="font-size:10px">✗ Absent: ${totalSessions - totalPresent}</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="STUDENT_DASH.exportHistoryToExcel()" style="width:auto; padding:4px 12px; font-size:11px">📥 Export to Excel</button>
            </div>
            <div id="session-history" style="max-height:400px; overflow-y:auto">
              ${sessionHistoryHtml}
            </div>
          </div>
        </div>
      `;
      
      // Attach event listeners
      const periodSelect = document.getElementById('period-select');
      const courseSelect = document.getElementById('course-select');
      if (periodSelect) periodSelect.onchange = () => STUDENT_DASH.changePeriod();
      if (courseSelect) courseSelect.onchange = () => STUDENT_DASH.changeCourse();
      
      // Setup real-time listener for active sessions
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(null, async (sessions) => {
        const activeList = document.getElementById('active-sessions-list');
        if (activeList) {
          const periodCourseCodes = new Set(periodCourses.map(c => c.courseCode));
          let relevant = sessions.filter(s => periodCourseCodes.has(s.courseCode));
          if (currentSelectedCourse) {
            relevant = relevant.filter(s => s.courseCode === currentSelectedCourse);
          }
          if (JSON.stringify(relevant) !== JSON.stringify(relevantActiveSessions)) {
            await loadDashboard();
          }
        }
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Dashboard error:', err);
      container.innerHTML = `<div class="pg"><div class="att-empty">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function _renderEnrolledCourses(courses) {
    if (!courses || courses.length === 0) {
      return '<div class="no-rec" style="padding:15px; font-size:12px; grid-column:1/-1">No courses enrolled for this period.</div>';
    }
    
    return courses.map(course => `
      <div class="course-card" style="background:var(--surface); border-radius:8px; padding:10px; border:1px solid var(--border)">
        <div class="course-header" style="margin-bottom:5px">
          <div class="course-code" style="font-weight:600; font-size:13px; color:var(--ug)">${UI.esc(course.courseCode)}</div>
          <div class="course-name" style="font-size:11px; color:var(--text2); margin-top:2px">${UI.esc(course.courseName || 'Course Name Not Set')}</div>
        </div>
        <div class="course-meta" style="font-size:10px; color:var(--text3); margin-top:6px">
          <div>👨‍🏫 ${UI.esc(course.lecturerName)}</div>
          <div>📅 ${course.year} - ${course.semester === 1 ? 'First Semester' : 'Second Semester'}</div>
        </div>
      </div>
    `).join('');
  }

  function _renderActiveSessions(sessions) {
    if (!sessions || !sessions.length) {
      return '<div class="no-rec" style="padding:15px; font-size:12px; background:var(--surface); border-radius:8px">No active sessions for your enrolled courses.</div>';
    }
    
    return sessions.map(session => {
      const timeRemaining = Math.max(0, session.expiresAt - Date.now());
      const minutesLeft = Math.floor(timeRemaining / 60000);
      const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
      const records = session.records ? Object.values(session.records) : [];
      const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      
      return `
        <div class="session-card active-session" style="background:var(--surface); border-radius:8px; padding:12px; border:1px solid var(--border); border-left:3px solid var(--teal)">
          <div class="session-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:5px">
            <div class="session-code" style="font-weight:600; font-size:14px; color:var(--ug)">${UI.esc(session.courseCode)}</div>
            <div class="session-badge active" style="font-size:10px; padding:2px 8px; border-radius:12px; background:var(--teal-l); color:var(--teal)">🟢 ACTIVE</div>
          </div>
          <div class="session-name" style="font-size:12px; color:var(--text2); margin-bottom:5px">${UI.esc(session.courseName)}</div>
          <div class="session-details" style="display:flex; gap:10px; font-size:10px; color:var(--text3); margin-bottom:8px; flex-wrap:wrap">
            <span>📅 ${UI.esc(session.date)}</span>
            <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
            <span>👥 ${records.length} checked in</span>
          </div>
          ${isCheckedIn ? 
            '<div class="checked-in-badge" style="background:var(--teal-l); color:var(--teal); padding:8px; border-radius:6px; text-align:center; font-size:11px; font-weight:500">✅ Already Checked In</div>' : 
            `<button class="btn btn-ug checkin-btn" onclick="STUDENT_DASH.directCheckIn('${session.id}')" style="width:100%; margin-top:6px; padding:8px; font-size:12px; border-radius:6px">✓ Check In Now</button>`
          }
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

  async function changePeriod() {
    const select = document.getElementById('period-select');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      
      // Reset course selection for new period
      const periodCourses = getCoursesForCurrentPeriod();
      if (periodCourses.length > 0) {
        currentSelectedCourse = periodCourses[0].courseCode;
      } else {
        currentSelectedCourse = null;
      }
      
      await loadDashboard();
    }
  }
  
  async function changeCourse() { 
    const select = document.getElementById('course-select'); 
    if (select) { 
      currentSelectedCourse = select.value || null; 
      await loadDashboard(); 
    } 
  }

  async function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export library not loaded.');
      return;
    }
    
    try {
      const allPeriodSessions = await getAllSessionsForCurrentPeriod();
      let courseSessions = allPeriodSessions;
      if (currentSelectedCourse) {
        courseSessions = allPeriodSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      const periodCourses = getCoursesForCurrentPeriod();
      const selectedCourseInfo = currentSelectedCourse 
        ? periodCourses.find(c => c.courseCode === currentSelectedCourse)
        : null;
      
      const semesterLabel = currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester';
      const yearRange = getAcademicYearRange(currentSelectedYear, currentSelectedSemester);
      
      const totalPresent = courseSessions.filter(s => s.attended).length;
      const totalAbsent = courseSessions.filter(s => !s.attended).length;
      const attendanceRate = courseSessions.length > 0 ? Math.round((totalPresent / courseSessions.length) * 100) : 0;
      
      const wsData = [
        ['Attendance History Report'],
        [`Student: ${currentStudent.name} (${currentStudent.studentId})`],
        [`Period: ${currentSelectedYear} - ${semesterLabel} (${yearRange})`],
        currentSelectedCourse ? [`Course: ${currentSelectedCourse} - ${selectedCourseInfo?.courseName || ''}`] : ['Course: All Courses'],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Summary: Total Sessions: ${courseSessions.length}, Present: ${totalPresent}, Absent: ${totalAbsent}, Attendance Rate: ${attendanceRate}%`],
        [],
        ['#', 'Date', 'Course Code', 'Course Name', 'Lecturer', 'Status', 'Check-in Time', 'Duration', 'Verification Method']
      ];
      
      let i = 1;
      for (const session of courseSessions.sort((a, b) => new Date(b.date) - new Date(a.date))) {
        const attended = session.attended;
        const attendedRecord = session.myRecord;
        
        let verificationMethod = '—';
        if (attendedRecord) {
          if (attendedRecord.authMethod === 'webauthn') verificationMethod = '🔐 Biometric';
          else if (attendedRecord.authMethod === 'manual') verificationMethod = '📝 Manual';
          else verificationMethod = attendedRecord.authMethod || '—';
        }
        
        wsData.push([
          i++,
          session.date,
          session.courseCode,
          session.courseName || '',
          session.lecturer || 'Unknown',
          attended ? 'Present' : 'Absent',
          attendedRecord?.time || '—',
          `${session.durationMins || 60} min`,
          verificationMethod
        ]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{wch:5}, {wch:12}, {wch:12}, {wch:30}, {wch:20}, {wch:10}, {wch:12}, {wch:10}, {wch:15}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
      const fileName = currentSelectedCourse 
        ? `UG_Attendance_${currentStudent.studentId}_${currentSelectedCourse}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`
        : `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
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
    changePeriod,
    changeCourse, 
    exportHistoryToExcel,
    logout, 
    stopAutoRefresh 
  };
})();
