/* student-dashboard.js — Student Portal with Complete Functionality, Timetable, Notifications & Reports */
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let attendanceStats = null;
  let refreshInterval = null;
  let currentSelectedCourse = null;
  let currentSelectedYear = null;
  let currentSelectedSemester = null;
  let currentSelectedLecturer = null;
  let enrolledCourses = [];
  let allStudentSessions = [];
  let lecturersMap = new Map();
  let timetable = [];
  let notificationCheckInterval = null;
  let messageListener = null;

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

  function getRiskLevel(percentage) {
    if (percentage >= 80) return { level: 'good', text: 'Good standing', color: 'var(--teal)', icon: '✅' };
    if (percentage >= 60) return { level: 'warning', text: 'Approaching threshold', color: 'var(--amber)', icon: '⚠️' };
    return { level: 'critical', text: 'At risk', color: 'var(--danger)', icon: '❌' };
  }

  // ==================== SWITCH TAB ====================
  async function switchTab(tabName) {
    console.log('[STUDENT_DASH] Switching to tab:', tabName);
    
    document.querySelectorAll('#view-student-dashboard .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      }
    });
    
    document.querySelectorAll('#view-student-dashboard .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    const tbTitle = document.getElementById('student-dash-title');
    const titles = {
      overview: 'Student Dashboard',
      mycourses: 'My Courses',
      calendar: 'Schedule & Calendar',
      history: 'Attendance History',
      messages: 'Messages'
    };
    if (tbTitle && titles[tabName]) {
      tbTitle.textContent = titles[tabName];
    }
    
    if (tabName === 'overview') {
      await loadOverview();
    } else if (tabName === 'mycourses') {
      await loadMyCoursesView();
    } else if (tabName === 'calendar') {
      await loadCalendarView();
    } else if (tabName === 'history') {
      await loadHistoryView();
    } else if (tabName === 'messages') {
      await loadMessagesView();
    }
  }

  // ==================== INITIALIZATION ====================
  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    
    console.log('[STUDENT_DASH] Initializing for student ID:', currentStudent.studentId);
    
    await createDashboardStructure();
    await loadTimetable();
    await loadStudentData();
    await loadOverview();
    startAutoRefresh();
    startNotificationCheck();
    setupMessageListener();
  }

  async function createDashboardStructure() {
    const container = document.getElementById('student-dash-content');
    if (!container) return;
    
    if (container.querySelector('.dashboard-grid')) return;
    
    container.innerHTML = `
      <div class="dashboard-grid">
        <div class="sidebar">
          <div class="sidebar-header">
            <h3 id="student-sidebar-name">Student Portal</h3>
            <p id="student-sidebar-id">Loading...</p>
          </div>
          <div class="sidebar-nav">
            <div class="nav-section">
              <div class="nav-section-title">MAIN</div>
              <div class="nav-item active" data-tab="overview" onclick="STUDENT_DASH.switchTab('overview')">
                <span class="nav-icon">📊</span>
                <span>Overview</span>
              </div>
              <div class="nav-item" data-tab="mycourses" onclick="STUDENT_DASH.switchTab('mycourses')">
                <span class="nav-icon">📚</span>
                <span>My Courses</span>
              </div>
              <div class="nav-item" data-tab="calendar" onclick="STUDENT_DASH.switchTab('calendar')">
                <span class="nav-icon">📅</span>
                <span>Calendar</span>
              </div>
              <div class="nav-item" data-tab="history" onclick="STUDENT_DASH.switchTab('history')">
                <span class="nav-icon">📋</span>
                <span>History</span>
              </div>
              <div class="nav-item" data-tab="messages" onclick="STUDENT_DASH.switchTab('messages')">
                <span class="nav-icon">💬</span>
                <span>Messages</span>
              </div>
            </div>
            <div class="nav-section">
              <div class="nav-section-title">SUPPORT</div>
              <div class="nav-item" onclick="USER_ACCOUNT.showHelp()">
                <span class="nav-icon">❓</span>
                <span>Help</span>
              </div>
              <div class="nav-item" onclick="USER_ACCOUNT.showProfile()">
                <span class="nav-icon">👤</span>
                <span>My Account</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="main-content">
          <div id="overview-view" class="tab-content active"></div>
          <div id="mycourses-view" class="tab-content" style="display:none"></div>
          <div id="calendar-view" class="tab-content" style="display:none"></div>
          <div id="history-view" class="tab-content" style="display:none"></div>
          <div id="messages-view" class="tab-content" style="display:none"></div>
        </div>
      </div>
    `;
  }

  // ==================== LOAD STUDENT DATA ====================
  async function loadStudentData() {
    try {
      const allEnrollments = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId, null);
      console.log('[STUDENT_DASH] Enrollments found:', allEnrollments.length);
      
      for (const enrollment of allEnrollments) {
        if (!lecturersMap.has(enrollment.lecId)) {
          const lecturer = await DB.LEC.get(enrollment.lecId);
          lecturersMap.set(enrollment.lecId, lecturer?.name || 'Unknown Lecturer');
        }
      }
      
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
      
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId, null);
      console.log('[STUDENT_DASH] Past sessions:', allStudentSessions.length);
      
      const currentPeriod = getAcademicPeriod();
      let defaultYear = currentPeriod.year;
      let defaultSemester = currentPeriod.semester;
      
      const hasCurrentPeriod = enrolledCourses.some(c => 
        c.year === defaultYear && c.semester === defaultSemester
      );
      
      if (!hasCurrentPeriod && enrolledCourses.length > 0) {
        const sorted = [...enrolledCourses].sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.semester - a.semester;
        });
        defaultYear = sorted[0].year;
        defaultSemester = sorted[0].semester;
      }
      
      currentSelectedYear = defaultYear;
      currentSelectedSemester = defaultSemester;
      currentSelectedLecturer = null;
      
      const periodCourses = getCoursesForCurrentPeriod();
      if (periodCourses.length > 0) {
        currentSelectedCourse = periodCourses[0].courseCode;
      } else {
        currentSelectedCourse = null;
      }
      
      // Update sidebar
      const sidebarName = document.getElementById('student-sidebar-name');
      const sidebarId = document.getElementById('student-sidebar-id');
      const userName = document.getElementById('student-dash-name');
      const userAvatar = document.getElementById('student-avatar');
      
      if (sidebarName) sidebarName.textContent = currentStudent.name || 'Student';
      if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId}`;
      if (userName) userName.textContent = currentStudent.name || currentStudent.email;
      if (userAvatar) userAvatar.textContent = '🎓';
      
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

  function getAvailableLecturers() {
    const periodCourses = getCoursesForCurrentPeriod();
    const lecturers = new Map();
    for (const course of periodCourses) {
      if (!lecturers.has(course.lecId)) {
        lecturers.set(course.lecId, course.lecturerName);
      }
    }
    return Array.from(lecturers.entries()).map(([id, name]) => ({ id, name }));
  }

  function getCoursesForCurrentPeriod() {
    let filtered = enrolledCourses.filter(c => 
      c.year === currentSelectedYear && c.semester === currentSelectedSemester
    );
    if (currentSelectedLecturer) {
      filtered = filtered.filter(c => c.lecId === currentSelectedLecturer);
    }
    return filtered;
  }

  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const courseCodes = new Set(periodCourses.map(c => c.courseCode));
    
    let sessions = allSessions.filter(s => 
      courseCodes.has(s.courseCode) && 
      s.year === currentSelectedYear && 
      s.semester === currentSelectedSemester
    );
    
    for (const session of sessions) {
      const records = session.records ? Object.values(session.records) : [];
      session.attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      session.myRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
    }
    
    return sessions;
  }

  // ==================== OVERVIEW TAB (FILTERED BY YEAR & SEMESTER) ====================
  async function loadOverview() {
    const container = document.getElementById('overview-view');
    if (!container) return;
    
    try {
      const periodCourses = getCoursesForCurrentPeriod();
      const availablePeriods = getAvailablePeriods();
      const availableLecturers = getAvailableLecturers();
      
      const allPeriodSessions = await getAllSessionsForCurrentPeriod();
      
      const totalSessions = allPeriodSessions.length;
      const totalPresent = allPeriodSessions.filter(s => s.attended).length;
      const attendancePercentage = totalSessions > 0 ? Math.round((totalPresent / totalSessions) * 100) : 0;
      const riskInfo = getRiskLevel(attendancePercentage);
      
      const allActiveSessions = await DB.SESSION.getAll();
      const activeCourseCodes = new Set(periodCourses.map(c => c.courseCode));
      let relevantActiveSessions = allActiveSessions.filter(s => 
        s.active === true && activeCourseCodes.has(s.courseCode)
      );
      if (currentSelectedCourse) {
        relevantActiveSessions = relevantActiveSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      const courseStats = [];
      for (const course of periodCourses) {
        const courseSessions = allPeriodSessions.filter(s => s.courseCode === course.courseCode);
        const attended = courseSessions.filter(s => s.attended).length;
        const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
        courseStats.push({
          ...course,
          attended,
          total: courseSessions.length,
          percentage,
          risk: getRiskLevel(percentage)
        });
      }
      
      let alertsHtml = '';
      const criticalCourses = courseStats.filter(c => c.risk.level === 'critical');
      const warningCourses = courseStats.filter(c => c.risk.level === 'warning');
      
      for (const course of criticalCourses) {
        const needed = Math.ceil((course.total * 0.75) - course.attended);
        alertsHtml += `
          <div class="alert-card warning">
            <strong>❌ ${course.risk.icon} ${course.risk.text}</strong> — ${course.courseCode}: 
            Your attendance is ${course.percentage}% (${course.attended}/${course.total} sessions). 
            Minimum required is 75%. ${needed > 0 ? `Attend next ${needed} session(s) to recover.` : ''}
          </div>
        `;
      }
      
      for (const course of warningCourses) {
        alertsHtml += `
          <div class="alert-card">
            <strong>⚠️ ${course.risk.icon} Approaching threshold</strong> — ${course.courseCode}: 
            Currently at ${course.percentage}% (${course.attended}/${course.total} sessions). 
            One more absence puts you at risk.
          </div>
        `;
      }
      
      container.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">Academic Year</label>
            <select id="overview-year" class="fi" onchange="STUDENT_DASH.changeOverviewPeriod()">
              ${availablePeriods.map(p => `
                <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                  ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'}
                </option>
              `).join('')}
            </select>
          </div>
          <div style="min-width: 150px;">
            <label class="fl">Lecturer</label>
            <select id="overview-lecturer" class="fi" onchange="STUDENT_DASH.changeOverviewLecturer()">
              <option value="">All Lecturers</option>
              ${availableLecturers.map(l => `
                <option value="${l.id}" ${currentSelectedLecturer === l.id ? 'selected' : ''}>${UI.esc(l.name)}</option>
              `).join('')}
            </select>
          </div>
          <div style="min-width: 200px;">
            <label class="fl">Course</label>
            <select id="overview-course" class="fi" onchange="STUDENT_DASH.changeOverviewCourse()">
              <option value="">All Courses</option>
              ${courseStats.map(c => `
                <option value="${c.courseCode}" ${currentSelectedCourse === c.courseCode ? 'selected' : ''}>${UI.esc(c.courseCode)} - ${UI.esc(c.courseName)}</option>
              `).join('')}
            </select>
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalSessions}</div>
            <div class="stat-label">Total Sessions</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${totalPresent}</div>
            <div class="stat-label">Present</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: ${riskInfo.color};">${attendancePercentage}%</div>
            <div class="stat-label">Attendance Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${periodCourses.length}</div>
            <div class="stat-label">Enrolled Courses</div>
          </div>
        </div>
        
        ${alertsHtml || ''}
        
        <div class="dash-section">
          <h3>🟢 Active Sessions</h3>
          <div class="courses-grid">
            ${relevantActiveSessions.length > 0 ? relevantActiveSessions.map(session => {
              const timeRemaining = Math.max(0, session.expiresAt - Date.now());
              const minutesLeft = Math.floor(timeRemaining / 60000);
              const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
              const records = session.records ? Object.values(session.records) : [];
              const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
              
              return `
                <div class="course-card" style="border-left: 4px solid #1d9e75;">
                  <div class="course-header">
                    <span class="course-code">${UI.esc(session.courseCode)}</span>
                    <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
                  </div>
                  <div class="course-name">${UI.esc(session.courseName)}</div>
                  <div class="course-stats">
                    <span>📅 ${session.date}</span>
                    <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
                    <span>📍 Location ON</span>
                  </div>
                  ${isCheckedIn ? 
                    '<div class="checked-in-badge">✅ Already checked in</div>' : 
                    `<button class="btn btn-ug checkin-btn" onclick="STUDENT_DASH.directCheckIn('${session.id}')">✓ Check in now</button>`
                  }
                </div>
              `;
            }).join('') : '<div class="no-rec">No active sessions for your enrolled courses.</div>'}
          </div>
        </div>
        
        <div class="dash-section">
          <h3>📊 Course Progress</h3>
          <div class="courses-grid">
            ${courseStats.map(course => `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">${UI.esc(course.courseCode)}</span>
                  <span class="badge" style="background: ${course.risk.color};">${course.risk.icon} ${course.risk.text}</span>
                </div>
                <div class="course-name">${UI.esc(course.courseName)} · ${UI.esc(course.lecturerName)}</div>
                <div class="course-stats">
                  <span>${course.attended} of ${course.total} sessions attended</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${course.percentage}%; background: ${course.risk.color};"></div>
                </div>
                <div style="font-size: 12px; color: ${course.risk.color};">
                  ${course.percentage}% ${course.risk.level === 'critical' ? '· Attend next sessions to recover' : (course.risk.level === 'warning' ? '· 1 more absence = at risk' : '')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(null, async (sessions) => {
        const hasRelevantChanges = sessions.some(s => activeCourseCodes.has(s.courseCode) && s.active === true);
        if (hasRelevantChanges) await loadOverview();
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Overview error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function changeOverviewPeriod() {
    const select = document.getElementById('overview-year');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentSelectedLecturer = null;
      currentSelectedCourse = null;
      await loadStudentData();
      await loadOverview();
    }
  }
  
  async function changeOverviewLecturer() {
    const select = document.getElementById('overview-lecturer');
    if (select) {
      currentSelectedLecturer = select.value || null;
      currentSelectedCourse = null;
      await loadOverview();
    }
  }
  
  async function changeOverviewCourse() {
    const select = document.getElementById('overview-course');
    if (select) {
      currentSelectedCourse = select.value || null;
      await loadOverview();
    }
  }

  // ==================== MY COURSES TAB (WITH ATTENDANCE REPORTS) ====================
  async function loadMyCoursesView() {
    const container = document.getElementById('mycourses-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = getAvailablePeriods();
    const availableLecturers = getAvailableLecturers();
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    
    let html = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 150px;">
          <label class="fl">Academic Period</label>
          <select id="mycourses-period" class="fi" onchange="STUDENT_DASH.changeMyCoursesPeriod()">
            ${availablePeriods.map(p => `
              <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'} (${getAcademicYearRange(p.year, p.semester)})
              </option>
            `).join('')}
          </select>
        </div>
        <div style="min-width: 180px;">
          <label class="fl">Lecturer</label>
          <select id="mycourses-lecturer" class="fi" onchange="STUDENT_DASH.filterMyCourses()">
            <option value="">All Lecturers</option>
            ${availableLecturers.map(l => `
              <option value="${l.id}" ${currentSelectedLecturer === l.id ? 'selected' : ''}>${UI.esc(l.name)}</option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="courses-grid" id="mycourses-grid">
    `;
    
    for (const course of periodCourses) {
      const courseSessions = allPeriodSessions.filter(s => s.courseCode === course.courseCode);
      const attended = courseSessions.filter(s => s.attended).length;
      const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
      const riskInfo = getRiskLevel(percentage);
      
      // Get detailed session records for this course
      const sessionDetails = courseSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      html += `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">${UI.esc(course.courseCode)}</span>
            <span class="badge" style="background: ${riskInfo.color};">${riskInfo.icon} ${riskInfo.text}</span>
          </div>
          <div class="course-name">${UI.esc(course.courseName)}</div>
          <div class="course-stats">
            <span>👨‍🏫 ${UI.esc(course.lecturerName)}</span>
            <span>📊 ${percentage}% attendance</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%; background: ${riskInfo.color};"></div>
          </div>
          <div class="course-stats">
            <span>📅 ${course.year} - ${course.semester === 1 ? 'First Semester' : 'Second Semester'}</span>
            <span>🎓 ${courseSessions.length} sessions</span>
          </div>
          <div class="course-buttons">
            <button class="btn btn-secondary btn-sm" onclick="STUDENT_DASH.showCourseAttendanceReport('${course.courseCode}')">📊 View Full Report</button>
            <button class="btn btn-outline btn-sm" onclick="STUDENT_DASH.exportCourseAttendance('${course.courseCode}')">📥 Export Excel</button>
            <button class="btn btn-teal btn-sm" onclick="STUDENT_DASH.exportCourseAttendancePDF('${course.courseCode}')">📄 Export PDF</button>
          </div>
        </div>
      `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
  }

  async function changeMyCoursesPeriod() {
    const select = document.getElementById('mycourses-period');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentSelectedLecturer = null;
      await loadStudentData();
      await loadMyCoursesView();
    }
  }
  
  async function filterMyCourses() {
    const select = document.getElementById('mycourses-lecturer');
    if (select) {
      currentSelectedLecturer = select.value || null;
      await loadMyCoursesView();
    }
  }

  async function showCourseAttendanceReport(courseCode) {
    const periodCourses = getCoursesForCurrentPeriod();
    const course = periodCourses.find(c => c.courseCode === courseCode);
    if (!course) return;
    
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    const courseSessions = allPeriodSessions.filter(s => s.courseCode === courseCode).sort((a, b) => new Date(b.date) - new Date(a.date));
    const attended = courseSessions.filter(s => s.attended).length;
    const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
    const riskInfo = getRiskLevel(percentage);
    
    let sessionsHtml = `
      <div style="max-height: 400px; overflow-y: auto;">
        <table class="session-table">
          <thead>
            <tr><th>Date</th><th>Status</th><th>Check-in Time</th><th>Method</th><th>Location</th></tr>
          </thead>
          <tbody>
    `;
    
    for (const session of courseSessions) {
      sessionsHtml += `
        <tr>
          <td>${session.date}</td>
          <td class="${session.attended ? 'status-present' : 'status-absent'}">${session.attended ? '✅ Present' : '❌ Absent'}</td>
          <td>${session.myRecord?.time || '—'}</td>
          <td>${session.myRecord?.authMethod === 'webauthn' ? '🔐 Biometric' : (session.myRecord?.authMethod === 'manual' ? '📝 Manual' : '—')}</td>
          <td>${session.myRecord?.locNote || '—'}</td>
        </tr>
      `;
    }
    
    sessionsHtml += `
          </tbody>
        </table>
      </div>
      <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
        <button class="btn btn-secondary" onclick="STUDENT_DASH.exportCourseAttendance('${courseCode}')">📥 Export Excel</button>
        <button class="btn btn-teal" onclick="STUDENT_DASH.exportCourseAttendancePDF('${courseCode}')">📄 Export PDF</button>
      </div>
    `;
    
    await MODAL.alert(
      `Attendance Report: ${courseCode} - ${course.courseName}`,
      `<div style="text-align: center;">
         <div class="stats-grid" style="margin-bottom: 15px;">
           <div class="stat-card"><div class="stat-value">${courseSessions.length}</div><div class="stat-label">Total Sessions</div></div>
           <div class="stat-card"><div class="stat-value">${attended}</div><div class="stat-label">Present</div></div>
           <div class="stat-card"><div class="stat-value" style="color: ${riskInfo.color};">${percentage}%</div><div class="stat-label">Attendance</div></div>
         </div>
         ${sessionsHtml}
       </div>`,
      { icon: '📊', btnLabel: 'Close', width: '700px' }
    );
  }

  async function exportCourseAttendance(courseCode) {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export not loaded.');
      return;
    }
    
    const periodCourses = getCoursesForCurrentPeriod();
    const course = periodCourses.find(c => c.courseCode === courseCode);
    if (!course) return;
    
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    const courseSessions = allPeriodSessions.filter(s => s.courseCode === courseCode).sort((a, b) => new Date(b.date) - new Date(a.date));
    const attended = courseSessions.filter(s => s.attended).length;
    const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
    
    const wsData = [
      [`Attendance Report - ${courseCode} - ${course.courseName}`],
      [`Student: ${currentStudent.name} (${currentStudent.studentId})`],
      [`Period: ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Summary: Total Sessions: ${courseSessions.length}, Present: ${attended}, Attendance Rate: ${percentage}%`],
      [],
      ['#', 'Date', 'Status', 'Check-in Time', 'Verification Method', 'Location']
    ];
    
    courseSessions.forEach((session, i) => {
      wsData.push([
        i + 1,
        session.date,
        session.attended ? 'Present' : 'Absent',
        session.myRecord?.time || '—',
        session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—'),
        session.myRecord?.locNote || '—'
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${courseCode}_Attendance`);
    XLSX.writeFile(wb, `UG_Attendance_${courseCode}_${currentStudent.studentId}.xlsx`);
    await MODAL.success('Export Complete', 'Attendance report downloaded.');
  }

  async function exportCourseAttendancePDF(courseCode) {
    const periodCourses = getCoursesForCurrentPeriod();
    const course = periodCourses.find(c => c.courseCode === courseCode);
    if (!course) return;
    
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    const courseSessions = allPeriodSessions.filter(s => s.courseCode === courseCode).sort((a, b) => new Date(b.date) - new Date(a.date));
    const attended = courseSessions.filter(s => s.attended).length;
    const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
    
    let tableRows = '';
    for (const session of courseSessions) {
      tableRows += `
        <tr>
          <td>${session.date}</td>
          <td>${session.attended ? 'Present' : 'Absent'}</td>
          <td>${session.myRecord?.time || '—'}</td>
          <td>${session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—')}</td>
        </tr>
      `;
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Attendance Report - ${courseCode}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #003087; border-bottom: 2px solid #fcd116; }
          .header { text-align: center; margin-bottom: 30px; }
          .stats { display: flex; justify-content: center; gap: 20px; margin: 20px 0; }
          .stat-box { background: #f5f5f7; padding: 15px; border-radius: 8px; text-align: center; width: 150px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #003087; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background: #003087; color: white; padding: 10px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>University of Ghana - Attendance Report</h1>
          <p><strong>Course:</strong> ${courseCode} - ${course.courseName}</p>
          <p><strong>Student:</strong> ${currentStudent.name} (${currentStudent.studentId})</p>
          <p><strong>Period:</strong> ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}</p>
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="stats">
          <div class="stat-box"><div class="stat-value">${courseSessions.length}</div><div>Total Sessions</div></div>
          <div class="stat-box"><div class="stat-value">${attended}</div><div>Present</div></div>
          <div class="stat-box"><div class="stat-value">${percentage}%</div><div>Attendance Rate</div></div>
        </div>
        
        <h3>Session Details</h3>
        <table>
          <thead><tr><th>Date</th><th>Status</th><th>Check-in Time</th><th>Method</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        
        <div class="footer">
          <p>UG QR Attendance System - University of Ghana</p>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  // ==================== CALENDAR TAB (WITH TIMETABLE & NOTIFICATIONS) ====================
  async function loadCalendarView() {
    const container = document.getElementById('calendar-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const upcomingSessions = await getUpcomingSessions(30); // Next 30 minutes
    
    // Check for sessions starting in next 30 minutes
    const startingSoon = upcomingSessions.filter(s => {
      const sessionStart = new Date(s.date + ' ' + (s.time || '08:00'));
      const minutesUntil = (sessionStart - new Date()) / 60000;
      return minutesUntil <= 30 && minutesUntil > 0;
    });
    
    let html = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">Academic Period</label>
          <select id="calendar-period" class="fi" onchange="STUDENT_DASH.changeCalendarPeriod()">
            ${getAvailablePeriods().map(p => `
              <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'}
              </option>
            `).join('')}
          </select>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="STUDENT_DASH.showTimetableEditor()">✏️ Edit Timetable</button>
        </div>
      </div>
      
      ${startingSoon.length > 0 ? `
        <div class="alert-card warning" style="margin-bottom: 20px; background: #fff3cd;">
          <strong>⏰ Upcoming Sessions (Next 30 minutes):</strong>
          ${startingSoon.map(s => `
            <div style="margin-top: 8px;">
              📚 ${s.courseCode} - ${s.courseName} at ${s.time || 'Scheduled time'}
              <button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.directCheckIn('${s.id}')" style="margin-left: 10px;">Check In Now</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="dash-section">
        <h3>📅 My Weekly Timetable</h3>
        <div id="timetable-display" class="timetable-grid">
          ${await renderTimetable()}
        </div>
      </div>
      
      <div class="dash-section" style="margin-top: 24px;">
        <h3>🟢 Upcoming Sessions (Next 7 Days)</h3>
        <div class="courses-grid" id="upcoming-sessions-list">
          ${upcomingSessions.length > 0 ? upcomingSessions.map(session => `
            <div class="course-card">
              <div class="course-header">
                <span class="course-code">${UI.esc(session.courseCode)}</span>
                <span class="badge">Upcoming</span>
              </div>
              <div class="course-name">${UI.esc(session.courseName)}</div>
              <div class="course-stats">
                <span>📅 ${session.date}</span>
                <span>⏰ ${session.time || 'Scheduled'}</span>
              </div>
              <div class="course-stats">
                <span>👨‍🏫 ${UI.esc(session.lecturer || 'Unknown')}</span>
              </div>
            </div>
          `).join('') : '<div class="no-rec">No upcoming sessions in the next 7 days.</div>'}
        </div>
      </div>
      
      <div class="dash-section" style="margin-top: 24px;">
        <h3>📋 Past Sessions</h3>
        <div class="courses-grid" id="past-sessions-list">
          ${(await getPastSessions()).slice(0, 6).map(session => `
            <div class="course-card" style="opacity: 0.8;">
              <div class="course-header">
                <span class="course-code">${UI.esc(session.courseCode)}</span>
                <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">${session.attended ? '✓ Present' : '✗ Absent'}</span>
              </div>
              <div class="course-name">${UI.esc(session.courseName)}</div>
              <div class="course-stats">
                <span>📅 ${session.date}</span>
                ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    container.innerHTML = html;
  }

  async function getUpcomingSessions(daysAhead = 7) {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const courseCodes = new Set(periodCourses.map(c => c.courseCode));
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysAhead);
    
    return allSessions.filter(s => {
      const sessionDate = new Date(s.date);
      return courseCodes.has(s.courseCode) && 
             sessionDate >= now && 
             sessionDate <= futureDate &&
             !s.active;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async function getPastSessions() {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const courseCodes = new Set(periodCourses.map(c => c.courseCode));
    const now = new Date();
    
    let sessions = allSessions.filter(s => {
      const sessionDate = new Date(s.date);
      return courseCodes.has(s.courseCode) && sessionDate < now;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    for (const session of sessions) {
      const records = session.records ? Object.values(session.records) : [];
      session.attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      session.myRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
    }
    
    return sessions;
  }

  async function loadTimetable() {
    const saved = localStorage.getItem(`timetable_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`);
    if (saved) {
      timetable = JSON.parse(saved);
    } else {
      timetable = [];
    }
  }

  async function saveTimetable() {
    localStorage.setItem(`timetable_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`, JSON.stringify(timetable));
  }

  async function renderTimetable() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const periodCourses = getCoursesForCurrentPeriod();
    
    let html = '<table class="session-table"><thead><tr><th>Time/Day</th>';
    days.forEach(day => html += `<th>${day}</th>`);
    html += '</tr></thead><tbody>';
    
    const timeSlots = ['08:00', '10:00', '12:00', '14:00', '16:00'];
    
    for (const timeSlot of timeSlots) {
      html += `<tr><td><strong>${timeSlot}</strong></td>`;
      for (const day of days) {
        const entry = timetable.find(t => t.day === day && t.time === timeSlot);
        if (entry) {
          const course = periodCourses.find(c => c.courseCode === entry.courseCode);
          html += `<td style="background: var(--primary-s);">
            <div><strong>${UI.esc(entry.courseCode)}</strong></div>
            <div style="font-size: 11px;">${UI.esc(course?.courseName || '')}</div>
            <div style="font-size: 10px;">👨‍🏫 ${UI.esc(entry.lecturerName)}</div>
          </td>`;
        } else {
          html += `<td style="color: var(--text4);">—</td>`;
        }
      }
      html += '</tr>';
    }
    
    html += '</tbody></table>';
    return html;
  }

  async function showTimetableEditor() {
    const periodCourses = getCoursesForCurrentPeriod();
    const availableCourses = periodCourses.map(c => ({ code: c.courseCode, name: c.courseName, lecturer: c.lecturerName, lecId: c.lecId }));
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = ['08:00', '10:00', '12:00', '14:00', '16:00'];
    
    let entriesHtml = '';
    timetable.forEach((entry, index) => {
      entriesHtml += `
        <div class="timetable-item">
          <span><strong>${entry.day}</strong> at ${entry.time}</span>
          <span>${UI.esc(entry.courseCode)} - ${UI.esc(entry.courseName)}</span>
          <span>👨‍🏫 ${UI.esc(entry.lecturerName)}</span>
          <button class="btn btn-danger btn-sm" onclick="STUDENT_DASH.removeTimetableEntry(${index})">Remove</button>
        </div>
      `;
    });
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>Add New Entry</h4>
          <div class="two-col">
            <div class="field">
              <label class="fl">Day</label>
              <select id="timetable-day" class="fi">
                ${days.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="fl">Time</label>
              <select id="timetable-time" class="fi">
                ${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label class="fl">Course</label>
            <select id="timetable-course" class="fi">
              <option value="">Select Course</option>
              ${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-ug" onclick="STUDENT_DASH.addTimetableEntry()">Add to Timetable</button>
        </div>
        
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>Current Timetable</h4>
          ${entriesHtml || '<div class="no-rec">No entries yet. Add your schedule above.</div>'}
        </div>
      </div>
    `;
    
    await MODAL.alert('Edit Weekly Timetable', modalContent, { icon: '📅', btnLabel: 'Close', width: '600px' });
  }

  async function addTimetableEntry() {
    const day = document.getElementById('timetable-day')?.value;
    const time = document.getElementById('timetable-time')?.value;
    const courseValue = document.getElementById('timetable-course')?.value;
    
    if (!day || !time || !courseValue) {
      await MODAL.alert('Missing Info', 'Please fill all fields.');
      return;
    }
    
    const [courseCode, courseName, lecturerName, lecId] = courseValue.split('|');
    
    timetable.push({ day, time, courseCode, courseName, lecturerName, lecId });
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
  }

  async function removeTimetableEntry(index) {
    timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
  }

  async function changeCalendarPeriod() {
    const select = document.getElementById('calendar-period');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      await loadTimetable();
      await loadCalendarView();
    }
  }

  function startNotificationCheck() {
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    notificationCheckInterval = setInterval(async () => {
      const upcoming = await getUpcomingSessions(1);
      const startingSoon = upcoming.filter(s => {
        const sessionStart = new Date(s.date + ' ' + (s.time || '09:00'));
        const minutesUntil = (sessionStart - new Date()) / 60000;
        return minutesUntil <= 30 && minutesUntil > 0;
      });
      
      if (startingSoon.length > 0 && typeof NOTIFICATIONS !== 'undefined') {
        for (const session of startingSoon) {
          await NOTIFICATIONS.add({
            title: 'Upcoming Session',
            message: `${session.courseCode} - ${session.courseName} starts in less than 30 minutes!`,
            type: 'warning',
            link: null
          });
        }
        await loadCalendarView(); // Refresh to show upcoming banner
      }
    }, 60000); // Check every minute
  }

  // ==================== HISTORY TAB (FILTERED) ====================
  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    const availablePeriods = getAvailablePeriods();
    const availableLecturers = getAvailableLecturers();
    
    // Group sessions by course
    const sessionsByCourse = new Map();
    for (const session of allPeriodSessions) {
      if (!sessionsByCourse.has(session.courseCode)) {
        sessionsByCourse.set(session.courseCode, []);
      }
      sessionsByCourse.get(session.courseCode).push(session);
    }
    
    let html = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 150px;">
          <label class="fl">Academic Period</label>
          <select id="history-period" class="fi" onchange="STUDENT_DASH.changeHistoryPeriod()">
            ${availablePeriods.map(p => `
              <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'} (${getAcademicYearRange(p.year, p.semester)})
              </option>
            `).join('')}
          </select>
        </div>
        <div style="min-width: 180px;">
          <label class="fl">Lecturer</label>
          <select id="history-lecturer" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All Lecturers</option>
            ${availableLecturers.map(l => `
              <option value="${l.id}" ${currentSelectedLecturer === l.id ? 'selected' : ''}>${UI.esc(l.name)}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="STUDENT_DASH.exportHistoryToExcel()">📥 Export to Excel</button>
        </div>
      </div>
    `;
    
    if (sessionsByCourse.size === 0) {
      html += '<div class="no-rec">No session history found for this period.</div>';
    } else {
      for (const [courseCode, sessions] of sessionsByCourse) {
        const sortedSessions = sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const courseInfo = getCoursesForCurrentPeriod().find(c => c.courseCode === courseCode);
        const attended = sortedSessions.filter(s => s.attended).length;
        const percentage = sortedSessions.length > 0 ? Math.round((attended / sortedSessions.length) * 100) : 0;
        const riskInfo = getRiskLevel(percentage);
        
        html += `
          <div class="dash-section" style="margin-bottom: 24px;">
            <div class="course-header" style="margin-bottom: 12px;">
              <div>
                <span class="course-code">${UI.esc(courseCode)}</span>
                <span class="course-name" style="margin-left: 12px;">${UI.esc(courseInfo?.courseName || '')}</span>
              </div>
              <div>
                <span class="badge" style="background: ${riskInfo.color};">${riskInfo.icon} ${percentage}%</span>
              </div>
            </div>
            <div class="courses-grid">
              ${sortedSessions.map(session => `
                <div class="course-card">
                  <div class="course-header">
                    <span class="course-code">📅 ${session.date}</span>
                    <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">${session.attended ? '✓ Present' : '✗ Absent'}</span>
                  </div>
                  <div class="course-stats">
                    <span>👨‍🏫 ${UI.esc(session.lecturer || 'Unknown')}</span>
                    ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
                    ${session.attended && session.myRecord?.authMethod ? `<span>🔐 ${session.myRecord.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }
    
    container.innerHTML = html;
  }

  async function changeHistoryPeriod() {
    const select = document.getElementById('history-period');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentSelectedLecturer = null;
      await loadStudentData();
      await loadHistoryView();
    }
  }
  
  async function filterHistory() {
    const select = document.getElementById('history-lecturer');
    if (select) {
      currentSelectedLecturer = select.value || null;
      await loadHistoryView();
    }
  }

  async function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export not loaded.');
      return;
    }
    
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
      ['#', 'Date', 'Course Code', 'Course Name', 'Lecturer', 'Status', 'Check-in Time', 'Verification Method']
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
        verificationMethod
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
    const fileName = currentSelectedCourse 
      ? `UG_Attendance_${currentStudent.studentId}_${currentSelectedCourse}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`
      : `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    await MODAL.success('Export Complete', 'Your attendance history has been exported.');
  }

  // ==================== MESSAGES TAB ====================
  async function loadMessagesView() {
    const container = document.getElementById('messages-view');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages & Announcements</h3>
        <p class="sub">View messages from your lecturers and communicate with your course mates.</p>
        
        <div class="filter-bar" style="margin-bottom: 20px;">
          <div style="min-width: 250px;">
            <label class="fl">Select Course</label>
            <select id="message-course-select" class="fi" onchange="STUDENT_DASH.loadCourseMessages()">
              <option value="">Loading courses...</option>
            </select>
          </div>
        </div>
        
        <div id="course-messages-container" style="margin-top: 20px; max-height: 500px; overflow-y: auto;">
          <div class="att-empty">Select a course to view messages</div>
        </div>
        
        <div id="message-input-area" style="display: none; margin-top: 20px;">
          <div class="message-input-area">
            <input type="text" id="new-message-text" class="fi" placeholder="Type your message here..." style="flex: 1;">
            <button class="btn btn-ug" onclick="STUDENT_DASH.sendCourseMessage()">Send</button>
          </div>
        </div>
      </div>
    `;
    
    await loadCourseList();
  }

  async function loadCourseList() {
    const courseSelect = document.getElementById('message-course-select');
    if (!courseSelect) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    
    courseSelect.innerHTML = '<option value="">Select Course</option>';
    for (const course of periodCourses) {
      courseSelect.innerHTML += `<option value="${UI.esc(course.courseCode)}_${course.year}_${course.semester}_${course.lecId}">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.year} Sem ${course.semester === 1 ? 'First' : 'Second'})</option>`;
    }
  }

  async function loadCourseMessages() {
    const courseSelect = document.getElementById('message-course-select');
    const container = document.getElementById('course-messages-container');
    const inputArea = document.getElementById('message-input-area');
    
    if (!courseSelect || !container) return;
    
    const [courseCode, year, semester, lecId] = courseSelect.value.split('_');
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
        <div class="message-item" style="margin-bottom: 16px;">
          <div class="message-sender">
            <strong>${msg.senderName === currentStudent.name ? 'You' : UI.esc(msg.senderName)}</strong>
            <span style="font-size: 11px; color: var(--text4); margin-left: 8px;">${new Date(msg.timestamp).toLocaleString()}</span>
            ${msg.senderId === lecId ? '<span class="badge" style="background: var(--ug); margin-left: 8px;">Lecturer</span>' : ''}
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 8px; background: var(--surface2); border-radius: 8px;">
            ${UI.esc(msg.message)}
          </div>
          ${msg.replies && msg.replies.length > 0 ? `
            <div style="margin-top: 8px; padding-left: 16px; border-left: 2px solid var(--border);">
              ${msg.replies.map(reply => `
                <div style="font-size: 12px; margin-top: 8px;">
                  <strong>${reply.senderName === currentStudent.name ? 'You' : UI.esc(reply.senderName)}:</strong> ${UI.esc(reply.message)}
                  <span style="font-size: 10px; color: var(--text4); margin-left: 8px;">${new Date(reply.timestamp).toLocaleString()}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <button class="btn btn-outline btn-sm" onclick="STUDENT_DASH.showReplyForm('${msg.id}')" style="margin-top: 8px;">Reply</button>
        </div>
      `).join('');
      
      // Store current course info for sending messages
      window.currentMessageCourse = { courseCode, year, semester, lecId };
      
    } catch(err) {
      console.error('Load messages error:', err);
      container.innerHTML = '<div class="no-rec">Error loading messages</div>';
    }
  }

  async function sendCourseMessage() {
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
    const messageId = Date.now().toString();
    
    const message = {
      id: messageId,
      senderId: currentStudent.studentId,
      senderName: currentStudent.name,
      message: messageText,
      timestamp: Date.now(),
      replies: []
    };
    
    await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, message);
    
    // Add notification for lecturer
    await DB.set(`notifications/lecturer/${lecId}/messages/${messageId}`, {
      id: messageId,
      title: `New Message: ${courseCode}`,
      message: `${currentStudent.name}: ${messageText.substring(0, 100)}`,
      type: 'info',
      timestamp: Date.now(),
      read: false
    });
    
    document.getElementById('new-message-text').value = '';
    await loadCourseMessages();
    await MODAL.success('Message Sent', 'Your message has been posted.');
  }

  async function showReplyForm(messageId) {
    const replyText = await MODAL.prompt('Reply to Message', 'Enter your reply:', { icon: '💬', placeholder: 'Type your reply here...' });
    if (!replyText) return;
    
    const courseInfo = window.currentMessageCourse;
    if (!courseInfo) return;
    
    const { courseCode, year, semester, lecId } = courseInfo;
    
    const messageRef = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
    const message = await DB.get(messageRef);
    
    if (message) {
      const replies = message.replies || [];
      replies.push({
        senderId: currentStudent.studentId,
        senderName: currentStudent.name,
        message: replyText,
        timestamp: Date.now()
      });
      await DB.set(messageRef, { ...message, replies });
      
      // Notify lecturer about reply
      await DB.set(`notifications/lecturer/${lecId}/messages/reply_${Date.now()}`, {
        id: `reply_${Date.now()}`,
        title: `New Reply: ${courseCode}`,
        message: `${currentStudent.name} replied to a message: ${replyText.substring(0, 100)}`,
        type: 'info',
        timestamp: Date.now(),
        read: false
      });
    }
    
    await loadCourseMessages();
    await MODAL.success('Reply Sent', 'Your reply has been posted.');
  }

  function setupMessageListener() {
    if (messageListener) messageListener();
    messageListener = DB.listen(`messages/course`, async () => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'messages-view') {
        await loadCourseMessages();
      }
    });
  }

  // ==================== CHECK-IN ====================
  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { 
      await MODAL.error('Error', 'Session not found.'); 
      return; 
    }
    if (!session.active) { 
      await MODAL.error('Ended', 'Session has ended.'); 
      await loadOverview(); 
      return; 
    }
    if (Date.now() > session.expiresAt) { 
      await MODAL.error('Expired', 'Session expired.'); 
      await loadOverview(); 
      return; 
    }
    
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
    
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  // ==================== AUTO REFRESH & CLEANUP ====================
  function startAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') loadOverview();
      else if (activeTab === 'mycourses-view') loadMyCoursesView();
      else if (activeTab === 'calendar-view') loadCalendarView();
      else if (activeTab === 'history-view') loadHistoryView();
      else if (activeTab === 'messages-view') loadCourseMessages();
    }, 30000); 
  }
  
  function stopAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    if (activeSessionListener) { 
      activeSessionListener(); 
      activeSessionListener = null; 
    }
    if (notificationCheckInterval) {
      clearInterval(notificationCheckInterval);
      notificationCheckInterval = null;
    }
    if (messageListener) {
      messageListener();
      messageListener = null;
    }
  }
  
  function logout() { 
    stopAutoRefresh(); 
    AUTH.clearSession(); 
    APP.goTo('landing'); 
  }

  // ==================== EXPORTS ====================
  return { 
    init, 
    switchTab,
    loadOverview,
    loadMyCoursesView,
    loadCalendarView,
    loadHistoryView,
    loadMessagesView,
    directCheckIn, 
    changeOverviewPeriod,
    changeOverviewLecturer,
    changeOverviewCourse,
    changeMyCoursesPeriod,
    changeCalendarPeriod,
    changeHistoryPeriod,
    filterHistory,
    filterMyCourses,
    showCourseAttendanceReport,
    exportCourseAttendance,
    exportCourseAttendancePDF,
    exportHistoryToExcel,
    showTimetableEditor,
    addTimetableEntry,
    removeTimetableEntry,
    loadCourseMessages,
    sendCourseMessage,
    showReplyForm,
    logout, 
    stopAutoRefresh 
  };
})();
