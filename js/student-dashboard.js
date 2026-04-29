/* student-dashboard.js — Student Portal with Complete Functionality, Sidebar Navigation & Notifications */
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

  function getRiskLevel(percentage) {
    if (percentage >= 80) return { level: 'good', text: 'Good standing', color: 'var(--teal)', icon: '✅' };
    if (percentage >= 60) return { level: 'warning', text: 'Approaching threshold', color: 'var(--amber)', icon: '⚠️' };
    return { level: 'critical', text: 'At risk', color: 'var(--danger)', icon: '❌' };
  }

  // Switch between tabs (sidebar navigation)
  async function switchTab(tabName) {
    console.log('[STUDENT_DASH] Switching to tab:', tabName);
    
    // Update sidebar active state
    document.querySelectorAll('#view-student-dashboard .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      }
    });
    
    // Hide all tab contents
    document.querySelectorAll('#view-student-dashboard .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    // Show selected tab content
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    // Update topbar title
    const tbTitle = document.getElementById('student-dash-title');
    const titles = {
      overview: 'Student Dashboard',
      mycourses: 'My Courses',
      calendar: 'Schedule & Calendar',
      history: 'Attendance History'
    };
    if (tbTitle && titles[tabName]) {
      tbTitle.textContent = titles[tabName];
    }
    
    // Load content based on tab
    if (tabName === 'overview') {
      await loadDashboard();
    } else if (tabName === 'mycourses') {
      await loadMyCoursesView();
    } else if (tabName === 'calendar') {
      await loadCalendarView();
    } else if (tabName === 'history') {
      await loadHistoryView();
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
    
    // Create dashboard structure if not exists
    await createDashboardStructure();
    
    // Update sidebar user info
    const sidebarName = document.querySelector('#view-student-dashboard .sidebar-header h3');
    const sidebarId = document.querySelector('#view-student-dashboard .sidebar-header p');
    const userAvatar = document.querySelector('#view-student-dashboard .user-avatar');
    const userName = document.getElementById('student-dash-name');
    
    if (sidebarName) sidebarName.textContent = currentStudent.name || 'Student';
    if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId} • ${currentStudent.email || ''}`;
    if (userAvatar) userAvatar.textContent = '🎓';
    if (userName) userName.textContent = currentStudent.name || currentStudent.email;
    
    await loadStudentData();
    await loadDashboard();
    startAutoRefresh();
  }

  async function createDashboardStructure() {
    const container = document.getElementById('student-dash-content');
    if (!container) return;
    
    // Only create structure if not already created
    if (container.querySelector('.dashboard-grid')) return;
    
    container.innerHTML = `
      <div class="dashboard-grid">
        <!-- Sidebar -->
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
        
        <!-- Main Content -->
        <div class="main-content">
          <div id="overview-view" class="tab-content active"></div>
          <div id="mycourses-view" class="tab-content" style="display:none"></div>
          <div id="calendar-view" class="tab-content" style="display:none"></div>
          <div id="history-view" class="tab-content" style="display:none"></div>
        </div>
      </div>
    `;
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
    const container = document.getElementById('overview-view');
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
      const riskInfo = getRiskLevel(attendancePercentage);
      
      // Get active sessions
      const allActiveSessions = await DB.SESSION.getAll();
      const activeCourseCodes = new Set(periodCourses.map(c => c.courseCode));
      let relevantActiveSessions = allActiveSessions.filter(s => 
        s.active === true && activeCourseCodes.has(s.courseCode)
      );
      if (currentSelectedCourse) {
        relevantActiveSessions = relevantActiveSessions.filter(s => s.courseCode === currentSelectedCourse);
      }
      
      // Calculate course-specific stats for alerts
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
      
      // Build alert messages
      let alertsHtml = '';
      const criticalCourses = courseStats.filter(c => c.risk.level === 'critical');
      const warningCourses = courseStats.filter(c => c.risk.level === 'warning');
      
      for (const course of criticalCourses) {
        const needed = Math.ceil((course.total * 0.75) - course.attended);
        alertsHtml += `
          <div class="alert-card warning">
            <strong>⚠️ ${course.risk.icon} ${course.risk.text}</strong> — ${course.courseCode}: 
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
      
      // Build active sessions HTML
      let activeSessionsHtml = '';
      if (relevantActiveSessions.length > 0) {
        activeSessionsHtml = `<div class="courses-grid">`;
        for (const session of relevantActiveSessions) {
          const timeRemaining = Math.max(0, session.expiresAt - Date.now());
          const minutesLeft = Math.floor(timeRemaining / 60000);
          const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
          const records = session.records ? Object.values(session.records) : [];
          const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          
          activeSessionsHtml += `
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
        }
        activeSessionsHtml += `</div>`;
      } else {
        activeSessionsHtml = '<div class="no-rec">No active sessions for your enrolled courses.</div>';
      }
      
      // Build course progress HTML
      let courseProgressHtml = `<div class="courses-grid">`;
      for (const course of courseStats) {
        const riskColor = course.risk.level === 'good' ? 'var(--teal)' : (course.risk.level === 'warning' ? 'var(--amber)' : 'var(--danger)');
        courseProgressHtml += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">${UI.esc(course.courseCode)}</span>
              <span class="badge" style="background:${riskColor};">${course.risk.icon} ${course.risk.text}</span>
            </div>
            <div class="course-name">${UI.esc(course.courseName)} · ${UI.esc(course.lecturerName)}</div>
            <div class="course-stats">
              <span>${course.attended} of ${course.total} sessions attended</span>
            </div>
            <div class="progress-bar" style="margin: 10px 0;">
              <div class="progress-fill" style="width: ${course.percentage}%; background: ${riskColor};"></div>
            </div>
            <div style="font-size: 12px; color: ${riskColor};">
              ${course.percentage}% ${course.risk.level === 'critical' ? '· Attend next sessions to recover' : (course.risk.level === 'warning' ? '· 1 more absence = at risk' : '')}
            </div>
          </div>
        `;
      }
      courseProgressHtml += `</div>`;
      
      // Build upcoming sessions HTML (next 7 days)
      const upcomingSessions = allActiveSessions.filter(s => {
        const sessionDate = new Date(s.date);
        const daysDiff = Math.ceil((sessionDate - new Date()) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= 7;
      });
      
      let upcomingHtml = '';
      if (upcomingSessions.length > 0) {
        upcomingHtml = `<div class="courses-grid">`;
        for (const session of upcomingSessions) {
          upcomingHtml += `
            <div class="course-card">
              <div class="course-header">
                <span class="course-code">${UI.esc(session.courseCode)}</span>
              </div>
              <div class="course-name">${UI.esc(session.courseName)}</div>
              <div class="course-stats">
                <span>📅 ${session.date}</span>
                <span>🕐 ${session.time || 'Scheduled'}</span>
              </div>
            </div>
          `;
        }
        upcomingHtml += `</div>`;
      } else {
        upcomingHtml = '<div class="no-rec">No upcoming sessions scheduled.</div>';
      }
      
      container.innerHTML = `
        <!-- Stats Cards -->
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
        
        <!-- Alerts -->
        ${alertsHtml || ''}
        
        <!-- Active Sessions Section -->
        <div class="dash-section">
          <h3>🟢 Active Sessions</h3>
          ${activeSessionsHtml}
        </div>
        
        <!-- Course Progress Section -->
        <div class="dash-section">
          <h3>📊 Course Progress</h3>
          ${courseProgressHtml}
        </div>
        
        <!-- Upcoming Sessions Section -->
        <div class="dash-section">
          <h3>📅 Upcoming Sessions</h3>
          ${upcomingHtml}
        </div>
      `;
      
      // Setup real-time listener for active sessions
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(null, async (sessions) => {
        // Refresh only if there are relevant changes
        const hasRelevantChanges = sessions.some(s => 
          activeCourseCodes.has(s.courseCode) && s.active === true
        );
        if (hasRelevantChanges) {
          await loadDashboard();
        }
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Dashboard error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function loadMyCoursesView() {
    const container = document.getElementById('mycourses-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = getAvailablePeriods();
    
    // Get all sessions for attendance stats per course
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    
    let html = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">Academic Period</label>
          <select id="period-select-courses" class="fi" onchange="STUDENT_DASH.changePeriodFromCourses()">
            ${availablePeriods.map(p => `
              <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'} (${getAcademicYearRange(p.year, p.semester)})
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="courses-grid">
    `;
    
    for (const course of periodCourses) {
      const courseSessions = allPeriodSessions.filter(s => s.courseCode === course.courseCode);
      const attended = courseSessions.filter(s => s.attended).length;
      const percentage = courseSessions.length > 0 ? Math.round((attended / courseSessions.length) * 100) : 0;
      const riskInfo = getRiskLevel(percentage);
      
      html += `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">${UI.esc(course.courseCode)}</span>
            <span class="badge" style="background: ${riskInfo.color};">${riskInfo.icon} ${riskInfo.text}</span>
          </div>
          <div class="course-name">${UI.esc(course.courseName || 'Course Name Not Set')}</div>
          <div class="course-stats">
            <span>👨‍🏫 ${UI.esc(course.lecturerName)}</span>
            <span>📊 ${percentage}% attendance</span>
          </div>
          <div class="progress-bar" style="margin: 10px 0;">
            <div class="progress-fill" style="width: ${percentage}%; background: ${riskInfo.color};"></div>
          </div>
          <div class="course-stats">
            <span>📅 ${course.year} - ${course.semester === 1 ? 'First Semester' : 'Second Semester'}</span>
            <span>🎓 ${courseSessions.length} sessions</span>
          </div>
        </div>
      `;
    }
    
    html += `</div>`;
    container.innerHTML = html;
  }

  async function loadCalendarView() {
    const container = document.getElementById('calendar-view');
    if (!container) return;
    
    const allSessions = await getAllSessionsForCurrentPeriod();
    const upcomingSessions = allSessions.filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate >= new Date() && !s.attended;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const pastSessions = allSessions.filter(s => {
      const sessionDate = new Date(s.date);
      return sessionDate < new Date();
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let html = `
      <div class="dash-section">
        <h3>📅 Upcoming Sessions (${upcomingSessions.length})</h3>
        ${upcomingSessions.length > 0 ? `
          <div class="courses-grid">
            ${upcomingSessions.map(session => `
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
            `).join('')}
          </div>
        ` : '<div class="no-rec">No upcoming sessions.</div>'}
      </div>
      
      <div class="dash-section" style="margin-top: 24px;">
        <h3>📋 Past Sessions (${pastSessions.length})</h3>
        ${pastSessions.length > 0 ? `
          <div class="courses-grid">
            ${pastSessions.slice(0, 10).map(session => `
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
          ${pastSessions.length > 10 ? `<div class="no-rec">... and ${pastSessions.length - 10} more sessions</div>` : ''}
        ` : '<div class="no-rec">No past sessions.</div>'}
      </div>
    `;
    
    container.innerHTML = html;
  }

  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    const allPeriodSessions = await getAllSessionsForCurrentPeriod();
    const availablePeriods = getAvailablePeriods();
    
    // Group sessions by course
    const sessionsByCourse = new Map();
    for (const session of allPeriodSessions) {
      if (!sessionsByCourse.has(session.courseCode)) {
        sessionsByCourse.set(session.courseCode, []);
      }
      sessionsByCourse.get(session.courseCode).push(session);
    }
    
    let html = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">Academic Period</label>
          <select id="period-select-history" class="fi" onchange="STUDENT_DASH.changePeriodFromHistory()">
            ${availablePeriods.map(p => `
              <option value="${p.year}_${p.semester}" ${p.year === currentSelectedYear && p.semester === currentSelectedSemester ? 'selected' : ''}>
                ${p.year} - ${p.semester === 1 ? 'First Semester' : 'Second Semester'} (${getAcademicYearRange(p.year, p.semester)})
              </option>
            `).join('')}
          </select>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="STUDENT_DASH.exportHistoryToExcel()">📥 Export to Excel</button>
        </div>
      </div>
    `;
    
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
    
    if (sessionsByCourse.size === 0) {
      html += '<div class="no-rec">No session history found for this period.</div>';
    }
    
    container.innerHTML = html;
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

  async function changePeriod(periodValue) {
    const [year, semester] = periodValue.split('_');
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
  
  async function changePeriodFromCourses() {
    const select = document.getElementById('period-select-courses');
    if (select) {
      await changePeriod(select.value);
      await loadMyCoursesView();
    }
  }
  
  async function changePeriodFromHistory() {
    const select = document.getElementById('period-select-history');
    if (select) {
      await changePeriod(select.value);
      await loadHistoryView();
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
    refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') {
        loadDashboard();
      } else if (activeTab === 'mycourses-view') {
        loadMyCoursesView();
      } else if (activeTab === 'calendar-view') {
        loadCalendarView();
      } else if (activeTab === 'history-view') {
        loadHistoryView();
      }
    }, 30000); 
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
    switchTab,
    directCheckIn, 
    changePeriod,
    changePeriodFromCourses,
    changePeriodFromHistory,
    changeCourse, 
    exportHistoryToExcel,
    logout, 
    stopAutoRefresh 
  };
})();
