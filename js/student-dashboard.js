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
      
      if (allEnrollments.length === 0) {
        console.log('[STUDENT_DASH] No enrollments - student needs to check in to a course first');
      }
      
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
      console.log('[STUDENT_DASH] Past sessions:', allStudentSessions.length);
      
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

  function getSessionsForCurrentPeriod() {
    return allStudentSessions.filter(s => {
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
      const periodCourses = getCoursesForCurrentPeriod();
      const periodSessions = getSessionsForCurrentPeriod();
      const availablePeriods = getAvailablePeriods();
      
      console.log('[STUDENT_DASH] Rendering dashboard with', periodCourses.length, 'courses');
      
      // If no enrollments, show empty state
      if (enrolledCourses.length === 0) {
        container.innerHTML = `
          <div class="pg" style="text-align:center; padding:60px 20px">
            <div class="state-icon" style="font-size:64px; margin-bottom:20px">📚</div>
            <h2 style="margin-bottom:10px">No Courses Yet</h2>
            <p class="sub" style="margin-bottom:20px">You haven't checked in to any courses yet.</p>
            <p class="sub">Scan a QR code during your next lecture to get started!</p>
            <button class="btn btn-ug" onclick="APP.goTo('landing')" style="margin-top:20px; max-width:200px; margin-left:auto; margin-right:auto">Go to Home</button>
          </div>
        `;
        return;
      }
      
      // If no courses in selected period
      if (periodCourses.length === 0) {
        container.innerHTML = `
          <div class="pg">
            <div class="filter-section" style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; align-items:flex-end">
              <div style="flex:2; min-width:200px">
                <label class="fl">📅 Academic Period</label>
                <select id="period-select" class="fi" style="padding:10px" onchange="STUDENT_DASH.changePeriod()">
                  ${availablePeriods.map(p => `<option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="inner-panel" style="text-align:center; padding:40px">
              <div class="state-icon" style="font-size:48px; margin-bottom:15px">📖</div>
              <h3>No Courses in This Period</h3>
              <p class="sub">You don't have any enrolled courses for ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}.</p>
              <p class="sub">Try selecting a different period above.</p>
            </div>
          </div>
        `;
        
        // Still need to attach period selector event
        const periodSelect = document.getElementById('period-select');
        if (periodSelect) {
          periodSelect.onchange = () => STUDENT_DASH.changePeriod();
        }
        return;
      }
      
      // Get attendance stats
      let stats;
      if (currentSelectedCourse) {
        stats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId, null, currentSelectedCourse);
      } else {
        let totalSessions = 0;
        let totalPresent = 0;
        for (const course of periodCourses) {
          const courseStats = await DB.STUDENTS.getAttendanceStats(currentStudent.studentId, null, course.courseCode);
          if (courseStats) {
            totalSessions += courseStats.totalSessions || 0;
            totalPresent += courseStats.totalPresent || 0;
          }
        }
        stats = { totalSessions, totalPresent, attendancePercentage: totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0, courses: [] };
      }
      
      // Get active sessions
      const allActiveSessions = await DB.SESSION.getAll();
      const activeCourseCodes = new Set(periodCourses.map(c => c.courseCode));
      let relevantActiveSessions = allActiveSessions.filter(s => s.active === true && activeCourseCodes.has(s.courseCode));
      if (currentSelectedCourse) {
        relevantActiveSessions = relevantActiveSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      // Build session history
      let courseSessions = periodSessions;
      if (currentSelectedCourse) {
        courseSessions = periodSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      // Build HTML
      let sessionHistoryHtml = courseSessions.length === 0 ? 
        '<div class="no-rec">No session history for this period.</div>' :
        courseSessions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(session => {
          const records = session.records ? Object.values(session.records) : [];
          const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          return `
            <div class="session-history-item" style="display:flex; justify-content:space-between; padding:12px; background:var(--surface); border-radius:10px; margin-bottom:8px; border-left:3px solid ${attended ? 'var(--teal)' : 'var(--danger)'}; flex-wrap:wrap; gap:8px">
              <div>
                <span style="font-weight:600">${UI.esc(session.courseCode)}</span>
                <span style="font-size:12px; color:var(--text3); margin-left:10px">📅 ${UI.esc(session.date)}</span>
                <div style="font-size:11px; color:var(--text3); margin-top:4px">${UI.esc(session.courseName)} · 👨‍🏫 ${UI.esc(session.lecturer || 'Unknown')}</div>
              </div>
              <div>
                <span class="pill ${attended ? 'pill-teal' : 'pill-gray'}">${attended ? '✓ Present' : '✗ Absent'}</span>
              </div>
            </div>
          `;
        }).join('');
      
      // Build course options
      let courseOptions = '<option value="">All Courses</option>';
      for (const course of periodCourses) {
        courseOptions += `<option value="${UI.esc(course.courseCode)}" ${currentSelectedCourse === course.courseCode ? 'selected' : ''}>${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)}</option>`;
      }
      
      // Build period options
      let periodOptions = '';
      for (const period of availablePeriods) {
        const selected = (period.year === currentSelectedYear && period.semester === currentSelectedSemester);
        periodOptions += `<option value="${period.year}_${period.semester}" ${selected ? 'selected' : ''}>${period.year} - ${period.semester === 1 ? 'First Semester' : 'Second Semester'} (${period.courses.length} course${period.courses.length !== 1 ? 's' : ''})</option>`;
      }
      
      container.innerHTML = `
        <div class="pg" style="max-width:900px; margin:0 auto">
          <!-- Header -->
          <div class="dash-header" style="margin-bottom:20px">
            <h2 style="font-size:22px">🎓 Student Dashboard</h2>
            <p class="sub">Welcome, <strong>${UI.esc(currentStudent.name)}</strong> (ID: ${UI.esc(currentStudent.studentId)})</p>
          </div>
          
          <!-- Filters -->
          <div style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap">
            <div style="flex:2; min-width:200px">
              <label class="fl">📅 Academic Period</label>
              <select id="period-select" class="fi" style="padding:10px">
                ${periodOptions}
              </select>
            </div>
            <div style="flex:2; min-width:200px">
              <label class="fl">📚 Course</label>
              <select id="course-select" class="fi" style="padding:10px">
                ${courseOptions}
              </select>
            </div>
          </div>
          
          <!-- Stats -->
          <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px">
            <div class="stat-card"><div class="stat-value">${stats?.totalSessions || 0}</div><div class="stat-label">Sessions</div></div>
            <div class="stat-card"><div class="stat-value">${stats?.totalPresent || 0}</div><div class="stat-label">Present</div></div>
            <div class="stat-card"><div class="stat-value" style="color:${(stats?.attendancePercentage || 0) >= 70 ? 'var(--teal)' : 'var(--danger)'}">${stats?.attendancePercentage || 0}%</div><div class="stat-label">Attendance</div></div>
            <div class="stat-card"><div class="stat-value">${periodCourses.length}</div><div class="stat-label">Enrolled</div></div>
          </div>
          
          <!-- Enrolled Courses -->
          <div class="inner-panel" style="margin-bottom:20px">
            <h3 style="margin-bottom:12px">📚 My Enrolled Courses (${periodCourses.length})</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:10px">
              ${periodCourses.map(course => `
                <div style="background:var(--surface2); border-radius:8px; padding:12px; border:1px solid var(--border)">
                  <div style="font-weight:700; color:var(--ug)">${UI.esc(course.courseCode)}</div>
                  <div style="font-size:12px; margin-top:4px">${UI.esc(course.courseName)}</div>
                  <div style="font-size:11px; color:var(--text3); margin-top:6px">👨‍🏫 ${UI.esc(course.lecturerName)}</div>
                  <div style="font-size:10px; color:var(--text4); margin-top:4px">Enrolled: ${new Date(course.enrolledAt).toLocaleDateString()}</div>
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- Active Sessions -->
          <div class="inner-panel" style="margin-bottom:20px">
            <h3 style="margin-bottom:12px">🟢 Active Sessions</h3>
            ${relevantActiveSessions.length === 0 ? 
              '<div class="no-rec">No active sessions for your enrolled courses.</div>' :
              relevantActiveSessions.map(session => {
                const timeRemaining = Math.max(0, session.expiresAt - Date.now());
                const minutesLeft = Math.floor(timeRemaining / 60000);
                const records = session.records ? Object.values(session.records) : [];
                const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
                const qrPayload = UI.b64e(JSON.stringify({ id: session.id, token: session.token, code: session.courseCode, course: session.courseName, date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng, radius: session.radius, locEnabled: session.locEnabled }));
                return `
                  <div style="background:var(--surface); border-radius:10px; padding:15px; margin-bottom:10px; border-left:4px solid var(--teal)">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px">
                      <span style="font-weight:700">${UI.esc(session.courseCode)}</span>
                      <span class="pill pill-teal">🟢 ACTIVE</span>
                    </div>
                    <div style="font-size:13px">${UI.esc(session.courseName)}</div>
                    <div style="font-size:12px; color:var(--text3); margin:8px 0">📅 ${session.date} · ⏱️ ${minutesLeft}m left · 👥 ${records.length} checked in</div>
                    ${isCheckedIn ? 
                      '<div class="pill pill-teal" style="text-align:center">✅ Already Checked In</div>' : 
                      `<button class="btn btn-ug" style="width:100%; margin-top:8px" onclick="STUDENT_DASH.directCheckIn('${session.id}')">✓ Check In Now</button>`
                    }
                  </div>
                `;
              }).join('')
            }
          </div>
          
          <!-- Session History -->
          <div class="inner-panel">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px">
              <h3 style="margin:0">📅 Session History</h3>
              <button class="btn btn-secondary btn-sm" onclick="STUDENT_DASH.exportHistoryToExcel()" style="width:auto">📥 Export Excel</button>
            </div>
            <div style="max-height:400px; overflow-y:auto">
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
        const activeList = document.querySelector('#view-student-dashboard .inner-panel:first-of-type + .inner-panel');
        if (activeList && relevantActiveSessions.length > 0) {
          const periodCourseCodes = new Set(periodCourses.map(c => c.courseCode));
          let relevant = sessions.filter(s => periodCourseCodes.has(s.courseCode));
          if (currentSelectedCourse) {
            relevant = relevant.filter(s => s.courseCode === currentSelectedCourse);
          }
          // Update UI (simplified - full re-render would be better but keep it simple)
          if (relevant.length !== relevantActiveSessions.length) {
            await loadDashboard();
          }
        }
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Dashboard error:', err);
      container.innerHTML = `<div class="pg"><div class="att-empty">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.error('Error', 'Session not found.'); return; }
    if (!session.active) { await MODAL.error('Ended', 'Session has ended.'); loadDashboard(); return; }
    if (Date.now() > session.expiresAt) { await MODAL.error('Expired', 'Session expired.'); loadDashboard(); return; }
    
    const payload = UI.b64e(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
    }));
    
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  async function changePeriod() {
    const select = document.getElementById('period-select');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      const periodCourses = getCoursesForCurrentPeriod();
      currentSelectedCourse = periodCourses.length > 0 ? periodCourses[0].courseCode : null;
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
      const periodSessions = getSessionsForCurrentPeriod();
      let courseSessions = periodSessions;
      if (currentSelectedCourse) {
        courseSessions = periodSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      const wsData = [
        ['Attendance History Report'],
        [`Student: ${currentStudent.name} (${currentStudent.studentId})`],
        [`Period: ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ['#', 'Date', 'Course Code', 'Course Name', 'Lecturer', 'Status', 'Time']
      ];
      
      let i = 1;
      for (const session of courseSessions.sort((a, b) => new Date(b.date) - new Date(a.date))) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        const attendedRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        
        wsData.push([
          i++, session.date, session.courseCode, session.courseName || '', session.lecturer || 'Unknown',
          attended ? 'Present' : 'Absent', attendedRecord?.time || '—'
        ]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
      XLSX.writeFile(wb, `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`);
      await MODAL.success('Export Complete', 'Attendance history exported.');
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
    if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; } 
  }
  
  function logout() { stopAutoRefresh(); AUTH.clearSession(); APP.goTo('landing'); }

  return { init, loadDashboard, directCheckIn, changePeriod, changeCourse, exportHistoryToExcel, logout, stopAutoRefresh };
})();
