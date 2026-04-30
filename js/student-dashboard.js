/* student-dashboard.js — Student Portal with Complete Functionality, Timetable, Notifications & Reports */
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let refreshInterval = null;
  let currentSelectedYear = null;
  let currentSelectedSemester = null;
  let enrolledCourses = [];
  let allStudentSessions = [];
  let lecturersMap = new Map();
  let timetable = [];
  let notificationCheckInterval = null;
  let currentFilterCourse = null;
  let currentFilterLecturer = null;

  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    if (month >= 7) semester = 1;
    else if (month >= 0 && month <= 6) semester = 2;
    else semester = 1;
    return { year, semester };
  }

  function getRiskLevel(percentage) {
    if (percentage >= 80) return { level: 'good', text: '✅ Good Standing', color: 'var(--teal)', icon: '✅' };
    if (percentage >= 60) return { level: 'warning', text: '⚠️ Approaching Threshold', color: 'var(--amber)', icon: '⚠️' };
    return { level: 'critical', text: '❌ At Risk', color: 'var(--danger)', icon: '❌' };
  }

  function formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  function getCurrentDay() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ==================== INITIALIZATION ====================
  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    currentStudent = user;
    
    console.log('[STUDENT_DASH] Initializing for student:', currentStudent.studentId);
    
    await createDashboardStructure();
    await loadTimetable();
    await loadStudentData();
    await loadOverview();
    startAutoRefresh();
    startNotificationCheck();
  }

  async function createDashboardStructure() {
    const container = document.getElementById('student-dash-content');
    if (!container) return;
    if (container.querySelector('.dashboard-grid')) return;
    
    container.innerHTML = `
      <div class="dashboard-grid">
        <div class="sidebar">
          <div class="sidebar-header">
            <h3 id="student-sidebar-name">🎓 Student Portal</h3>
            <p id="student-sidebar-id">Loading...</p>
          </div>
          <div class="sidebar-nav">
            <div class="nav-section">
              <div class="nav-section-title">MAIN</div>
              <div class="nav-item active" data-tab="overview" onclick="STUDENT_DASH.switchTab('overview')">
                <span class="nav-icon">📊</span>
                <span>Overview</span>
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
                <span>Help & Support</span>
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
          <div id="calendar-view" class="tab-content" style="display:none"></div>
          <div id="history-view" class="tab-content" style="display:none"></div>
          <div id="messages-view" class="tab-content" style="display:none"></div>
        </div>
      </div>
    `;
  }

  async function loadStudentData() {
    try {
      const allEnrollments = await DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId, null);
      
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
        lecturerName: lecturersMap.get(enrollment.lecId) || 'Unknown Lecturer',
        lecturerLat: null,
        lecturerLng: null
      }));
      
      for (const course of enrolledCourses) {
        const lecturer = await DB.LEC.get(course.lecId);
        if (lecturer && lecturer.lastLocation) {
          course.lecturerLat = lecturer.lastLocation.lat;
          course.lecturerLng = lecturer.lastLocation.lng;
        }
      }
      
      allStudentSessions = await DB.SESSION.getStudentSessions(currentStudent.studentId, null);
      
      const currentPeriod = getAcademicPeriod();
      let defaultYear = currentPeriod.year;
      let defaultSemester = currentPeriod.semester;
      
      const hasCurrentPeriod = enrolledCourses.some(c => c.year === defaultYear && c.semester === defaultSemester);
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
      currentFilterCourse = null;
      currentFilterLecturer = null;
      
      const sidebarName = document.getElementById('student-sidebar-name');
      const sidebarId = document.getElementById('student-sidebar-id');
      const userName = document.getElementById('student-dash-name');
      const userAvatar = document.getElementById('student-avatar');
      
      if (sidebarName) sidebarName.textContent = currentStudent.name || '🎓 Student';
      if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId}`;
      if (userName) userName.textContent = currentStudent.name || currentStudent.email;
      if (userAvatar) userAvatar.textContent = '🎓';
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Load error:', err); 
      enrolledCourses = []; 
    }
  }

  function getCoursesForCurrentPeriod() {
    return enrolledCourses.filter(c => c.year === currentSelectedYear && c.semester === currentSelectedSemester);
  }

  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const courseCodes = new Set(periodCourses.map(c => c.courseCode));
    
    let sessions = allSessions.filter(s => 
      courseCodes.has(s.courseCode) && s.year === currentSelectedYear && s.semester === currentSelectedSemester
    );
    
    for (const session of sessions) {
      const records = session.records ? Object.values(session.records) : [];
      session.attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
      session.myRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
    }
    
    return sessions;
  }

  // ==================== OVERVIEW TAB ====================
  async function loadOverview() {
    const container = document.getElementById('overview-view');
    if (!container) return;
    
    try {
      const periodCourses = getCoursesForCurrentPeriod();
      const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
        .sort((a, b) => {
          const [yearA, semA] = a.split('_');
          const [yearB, semB] = b.split('_');
          if (yearA !== yearB) return yearB - yearA;
          return semB - semA;
        });
      
      const allPeriodSessions = await getAllSessionsForCurrentPeriod();
      
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
      
      const goodCourses = courseStats.filter(c => c.risk.level === 'good');
      const warningCourses = courseStats.filter(c => c.risk.level === 'warning');
      const criticalCourses = courseStats.filter(c => c.risk.level === 'critical');
      
      const allActiveSessions = await DB.SESSION.getAll();
      const activeCourseCodes = new Set(periodCourses.map(c => c.courseCode));
      const activeSessions = allActiveSessions.filter(s => 
        s.active === true && activeCourseCodes.has(s.courseCode)
      );
      
      let activeSessionsHtml = '';
      if (activeSessions.length > 0) {
        activeSessionsHtml = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">`;
        for (const session of activeSessions) {
          const timeRemaining = Math.max(0, session.expiresAt - Date.now());
          const minutesLeft = Math.floor(timeRemaining / 60000);
          const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
          const records = session.records ? Object.values(session.records) : [];
          const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          const course = periodCourses.find(c => c.courseCode === session.courseCode);
          
          const mapsUrl = course && course.lecturerLat && course.lecturerLng 
            ? `https://www.google.com/maps/dir/?api=1&destination=${course.lecturerLat},${course.lecturerLng}`
            : null;
          
          activeSessionsHtml += `
            <div class="course-card" style="border-left: 4px solid #1d9e75;">
              <div class="course-header">
                <span class="course-code">📚 ${escapeHtml(session.courseCode)}</span>
                <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
              </div>
              <div class="course-name">${escapeHtml(session.courseName)}</div>
              <div class="course-stats">
                <span>📅 ${session.date}</span>
                <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
              </div>
              <div class="course-buttons">
                ${isCheckedIn ? 
                  '<div class="checked-in-badge">✅ Already checked in</div>' : 
                  `<button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.directCheckIn('${session.id}')">✓ Check in now</button>`
                }
                ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" class="btn btn-outline btn-sm">🗺️ Get Directions</a>` : ''}
              </div>
            </div>
          `;
        }
        activeSessionsHtml += `</div>`;
      } else {
        activeSessionsHtml = '<div class="no-rec">📭 No active sessions for your enrolled courses.</div>';
      }
      
      container.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Academic Year</label>
            <select id="overview-year" class="fi" onchange="STUDENT_DASH.changePeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
                </option>`;
              }).join('')}
            </select>
          </div>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card">
            <div class="stat-value">${periodCourses.length}</div>
            <div class="stat-label">📚 Total Courses</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: var(--teal);">${goodCourses.length}</div>
            <div class="stat-label">✅ Good Standing</div>
            <div style="font-size: 10px; margin-top: 5px;">${goodCourses.map(c => c.courseCode).join(', ')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: var(--amber);">${warningCourses.length}</div>
            <div class="stat-label">⚠️ Approaching Threshold</div>
            <div style="font-size: 10px; margin-top: 5px;">${warningCourses.map(c => c.courseCode).join(', ')}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: var(--danger);">${criticalCourses.length}</div>
            <div class="stat-label">❌ At Risk</div>
            <div style="font-size: 10px; margin-top: 5px;">${criticalCourses.map(c => c.courseCode).join(', ')}</div>
          </div>
        </div>
        
        ${criticalCourses.map(course => `
          <div class="alert-card warning">
            <strong>❌ ${course.risk.text}</strong> — ${course.courseCode}: 
            Your attendance is ${course.percentage}% (${course.attended}/${course.total} sessions). 
            Minimum required is 75%. Attend next sessions to recover.
          </div>
        `).join('')}
        ${warningCourses.map(course => `
          <div class="alert-card" style="background: var(--amber-s);">
            <strong>⚠️ ${course.risk.text}</strong> — ${course.courseCode}: 
            Currently at ${course.percentage}% (${course.attended}/${course.total} sessions). 
            One more absence puts you at risk.
          </div>
        `).join('')}
        
        <div class="dash-section">
          <h3>🟢 Active Sessions</h3>
          ${activeSessionsHtml}
        </div>
        
        <div class="dash-section">
          <h3>📊 Course Progress (${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'})</h3>
          <div class="courses-grid">
            ${courseStats.map(course => `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">📚 ${escapeHtml(course.courseCode)}</span>
                  <span class="badge" style="background: ${course.risk.color};">${course.risk.icon} ${course.risk.text}</span>
                </div>
                <div class="course-name">${escapeHtml(course.courseName)} · ${escapeHtml(course.lecturerName)}</div>
                <div class="course-stats">
                  <span>${course.attended} of ${course.total} sessions attended</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${course.percentage}%; background: ${course.risk.color};"></div>
                </div>
                <div style="font-size: 12px; color: ${course.risk.color}; margin-top: 8px;">
                  ${course.percentage}% ${course.risk.level === 'critical' ? '⚠️ Attend next sessions to recover' : (course.risk.level === 'warning' ? '⚠️ 1 more absence = at risk' : '✅ Keep it up!')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      if (activeSessionListener) activeSessionListener();
      activeSessionListener = DB.SESSION.listenActiveSessions(null, async () => {
        await loadOverview();
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Overview error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== CALENDAR WITH TIMETABLE ====================
  async function loadCalendarView() {
    const container = document.getElementById('calendar-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = getCurrentDay();
    
    // Get upcoming sessions from timetable (next 30 minutes)
    const upcomingFromTimetable = timetable.filter(entry => {
      if (entry.day !== currentDay) return false;
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const entryStartMinutes = startHour * 60 + startMin;
      const minutesUntil = entryStartMinutes - currentMinutes;
      return minutesUntil <= 30 && minutesUntil > 0;
    });
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let h = 7; h <= 20; h++) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < 20) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    
    let timetableHtml = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">📅 Academic Period</label>
          <select id="calendar-period" class="fi" onchange="STUDENT_DASH.changeCalendarPeriod()">
            ${availablePeriods.map(p => {
              const [year, semester] = p.split('_');
              return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="STUDENT_DASH.showTimetableEditor()">✏️ Edit Timetable</button>
        </div>
      </div>
      
      ${upcomingFromTimetable.length > 0 ? `
        <div class="alert-card warning" style="margin-bottom: 20px;">
          <strong>⏰ Upcoming Sessions (Next 30 minutes):</strong>
          ${upcomingFromTimetable.map(entry => {
            const course = periodCourses.find(c => c.courseCode === entry.courseCode);
            return `
              <div style="margin-top: 8px;">
                📚 ${entry.courseCode} - ${course?.courseName || ''} at ${entry.startTime}
                <button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.checkInFromTimetable('${entry.courseCode}')" style="margin-left: 10px;">✓ Check In Now</button>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}
      
      <div class="dash-section">
        <h3>📅 My Weekly Timetable</h3>
        <div class="timetable-grid" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 10px;">Time</th>
                ${days.map(day => `<th style="padding: 10px;">${day}</th>`).join('')}
              </table>
            </thead>
            <tbody>
              ${timeSlots.map(timeSlot => `
                <tr>
                  <td style="padding: 8px; border: 1px solid var(--border); font-weight: 600;">${timeSlot}</td>
                  ${days.map(day => {
                    const entry = timetable.find(t => t.day === day && t.startTime === timeSlot);
                    if (entry) {
                      const course = periodCourses.find(c => c.courseCode === entry.courseCode);
                      const now = new Date();
                      const currentMinutes = now.getHours() * 60 + now.getMinutes();
                      const [startHour, startMin] = entry.startTime.split(':').map(Number);
                      const entryStartMinutes = startHour * 60 + startMin;
                      const isLive = entry.day === getCurrentDay() && Math.abs(entryStartMinutes - currentMinutes) <= 60;
                      return `
                        <td style="padding: 8px; border: 1px solid var(--border); background: ${isLive ? 'var(--teal-l)' : 'var(--primary-s)'};">
                          <div><strong>📚 ${escapeHtml(entry.courseCode)}</strong></div>
                          <div style="font-size: 11px;">${escapeHtml(course?.courseName || '')}</div>
                          <div style="font-size: 10px;">⏰ ${entry.startTime} - ${entry.endTime}</div>
                          <div style="font-size: 10px;">👨‍🏫 ${escapeHtml(entry.lecturerName)}</div>
                          ${isLive ? `<span class="badge" style="background: #1d9e75; margin-top: 4px;">🔴 LIVE</span>` : ''}
                          <button class="btn btn-outline btn-sm" style="margin-top: 6px; width: 100%;" onclick="STUDENT_DASH.checkInFromTimetable('${entry.courseCode}')">✓ Check In</button>
                         </td>
                      `;
                    }
                    return `<td style="padding: 8px; border: 1px solid var(--border); color: var(--text4); text-align: center;">—</td>`;
                  }).join('')}
                 </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    container.innerHTML = timetableHtml;
  }

  async function loadTimetable() {
    const key = `timetable_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      timetable = JSON.parse(saved);
    } else {
      timetable = [];
    }
  }

  async function saveTimetable() {
    const key = `timetable_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`;
    localStorage.setItem(key, JSON.stringify(timetable));
  }

  async function showTimetableEditor() {
    const periodCourses = getCoursesForCurrentPeriod();
    const availableCourses = periodCourses.map(c => ({ code: c.courseCode, name: c.courseName, lecturer: c.lecturerName, lecId: c.lecId }));
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let h = 7; h <= 20; h++) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < 20) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    
    let entriesHtml = '';
    if (timetable.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      timetable.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${entry.startTime} - ${entry.endTime}</div>
              <div>📚 <strong>${escapeHtml(entry.courseCode)}</strong> - ${escapeHtml(entry.courseName)}</div>
              <div>👨‍🏫 ${escapeHtml(entry.lecturerName)}</div>
              <button class="btn btn-danger btn-sm" onclick="STUDENT_DASH.removeTimetableEntry(${index})">🗑️ Remove</button>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No entries yet. Add your schedule above.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add New Timetable Entry</h4>
          <div class="two-col">
            <div class="field">
              <label class="fl">📅 Day</label>
              <select id="timetable-day" class="fi">
                ${days.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="fl">📚 Course</label>
              <select id="timetable-course" class="fi">
                <option value="">Select Course</option>
                ${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="two-col">
            <div class="field">
              <label class="fl">⏰ Start Time</label>
              <select id="timetable-start" class="fi">
                ${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="fl">⏰ End Time</label>
              <select id="timetable-end" class="fi">
                ${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
          </div>
          <button class="btn btn-ug" onclick="STUDENT_DASH.addTimetableEntry()">✅ Add to Timetable</button>
        </div>
        
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>📋 Current Timetable</h4>
          ${entriesHtml}
        </div>
      </div>
    `;
    
    await MODAL.alert('✏️ Edit Weekly Timetable', modalContent, { icon: '📅', btnLabel: 'Close', width: '600px' });
  }

  async function addTimetableEntry() {
    const day = document.getElementById('timetable-day')?.value;
    const startTime = document.getElementById('timetable-start')?.value;
    const endTime = document.getElementById('timetable-end')?.value;
    const courseValue = document.getElementById('timetable-course')?.value;
    
    if (!day || !startTime || !endTime || !courseValue) {
      await MODAL.alert('Missing Info', '⚠️ Please fill all fields.');
      return;
    }
    
    const [courseCode, courseName, lecturerName, lecId] = courseValue.split('|');
    
    // Check for duplicate at same time
    const existingIndex = timetable.findIndex(t => t.day === day && t.startTime === startTime);
    if (existingIndex !== -1) {
      const replace = await MODAL.confirm('Duplicate Entry', `You already have ${timetable[existingIndex].courseCode} at this time. Replace it?`, { confirmLabel: 'Replace' });
      if (replace) {
        timetable.splice(existingIndex, 1);
      } else {
        return;
      }
    }
    
    timetable.push({ day, startTime, endTime, courseCode, courseName, lecturerName, lecId });
    
    // Sort timetable
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    timetable.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Added', '✅ Timetable entry added successfully.');
  }

  async function removeTimetableEntry(index) {
    timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Timetable entry removed.');
  }

  async function checkInFromTimetable(courseCode) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => s.courseCode === courseCode && s.active === true);
    
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode}. Please check with your lecturer.`);
      return;
    }
    
    await directCheckIn(activeSession.id);
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
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = getCurrentDay();
      
      const upcomingEntries = timetable.filter(entry => {
        if (entry.day !== currentDay) return false;
        const [startHour, startMin] = entry.startTime.split(':').map(Number);
        const entryStartMinutes = startHour * 60 + startMin;
        const minutesUntil = entryStartMinutes - currentMinutes;
        return minutesUntil <= 30 && minutesUntil > 0;
      });
      
      if (upcomingEntries.length > 0 && typeof NOTIFICATIONS !== 'undefined') {
        for (const entry of upcomingEntries) {
          await NOTIFICATIONS.add({
            title: '⏰ Upcoming Session',
            message: `${entry.courseCode} - ${entry.courseName} starts in less than 30 minutes!`,
            type: 'warning',
            link: null
          });
        }
        // Refresh calendar view to show upcoming banner
        const calendarView = document.getElementById('calendar-view');
        if (calendarView && calendarView.style.display !== 'none') {
          await loadCalendarView();
        }
      }
    }, 60000);
  }

  // ==================== HISTORY TAB ====================
  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    const availableLecturers = [...new Map(periodCourses.map(c => [c.lecId, c.lecturerName]))].map(([id, name]) => ({ id, name }));
    
    let filteredSessions = await getAllSessionsForCurrentPeriod();
    if (currentFilterCourse) {
      filteredSessions = filteredSessions.filter(s => s.courseCode === currentFilterCourse);
    }
    if (currentFilterLecturer) {
      filteredSessions = filteredSessions.filter(s => {
        const course = periodCourses.find(c => c.courseCode === s.courseCode);
        return course && course.lecId === currentFilterLecturer;
      });
    }
    
    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 150px;">
          <label class="fl">📅 Academic Period</label>
          <select id="history-period" class="fi" onchange="STUDENT_DASH.changeHistoryPeriod()">
            ${availablePeriods.map(p => {
              const [year, semester] = p.split('_');
              return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div style="min-width: 180px;">
          <label class="fl">📚 Course</label>
          <select id="history-course" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All Courses</option>
            ${periodCourses.map(c => `<option value="${c.courseCode}" ${currentFilterCourse === c.courseCode ? 'selected' : ''}>${c.courseCode} - ${c.courseName}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 180px;">
          <label class="fl">👨‍🏫 Lecturer</label>
          <select id="history-lecturer" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All Lecturers</option>
            ${availableLecturers.map(l => `<option value="${l.id}" ${currentFilterLecturer === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="STUDENT_DASH.exportHistoryToExcel()">📥 Export to Excel</button>
        </div>
      </div>
      
      <div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
        ${filteredSessions.map(session => `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📅 ${session.date}</span>
              <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">${session.attended ? '✅ Present' : '❌ Absent'}</span>
            </div>
            <div class="course-name">${escapeHtml(session.courseCode)} - ${escapeHtml(session.courseName)}</div>
            <div class="course-stats">
              <span>👨‍🏫 ${escapeHtml(session.lecturer || 'Unknown')}</span>
              ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
              ${session.attended && session.myRecord?.authMethod ? `<span>🔐 ${session.myRecord.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
      ${filteredSessions.length === 0 ? '<div class="no-rec">📭 No sessions found for the selected filters.</div>' : ''}
    `;
  }

  async function filterHistory() {
    const courseSelect = document.getElementById('history-course');
    const lecturerSelect = document.getElementById('history-lecturer');
    currentFilterCourse = courseSelect?.value || null;
    currentFilterLecturer = lecturerSelect?.value || null;
    await loadHistoryView();
  }

  async function changeHistoryPeriod() {
    const select = document.getElementById('history-period');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentFilterCourse = null;
      currentFilterLecturer = null;
      await loadHistoryView();
    }
  }

  async function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export not loaded.');
      return;
    }
    
    const filteredSessions = await getAllSessionsForCurrentPeriod();
    
    const wsData = [
      ['📋 Attendance History Report'],
      [`🎓 Student: ${currentStudent.name} (${currentStudent.studentId})`],
      [`📅 Period: ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}`],
      [`📆 Generated: ${new Date().toLocaleString()}`],
      [],
      ['#', 'Date', 'Course Code', 'Course Name', 'Lecturer', 'Status', 'Check-in Time', 'Verification Method']
    ];
    
    let i = 1;
    for (const session of filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date))) {
      wsData.push([
        i++,
        session.date,
        session.courseCode,
        session.courseName || '',
        session.lecturer || 'Unknown',
        session.attended ? 'Present' : 'Absent',
        session.myRecord?.time || '—',
        session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—')
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
    XLSX.writeFile(wb, `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`);
    await MODAL.success('Export Complete', '✅ Your attendance history has been exported.');
  }

  // ==================== MESSAGES TAB ====================
  async function loadMessagesView() {
    const container = document.getElementById('messages-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages & Announcements</h3>
        <p class="sub">View messages from your lecturers and communicate with your course mates.</p>
        
        <div class="filter-bar" style="margin-bottom: 20px;">
          <div style="min-width: 250px;">
            <label class="fl">📚 Select Course</label>
            <select id="message-course-select" class="fi" onchange="STUDENT_DASH.loadCourseMessages()">
              <option value="">Select Course</option>
              ${periodCourses.map(c => `<option value="${c.courseCode}_${c.year}_${c.semester}_${c.lecId}">${c.courseCode} - ${c.courseName} (${c.year} Sem ${c.semester === 1 ? 'First' : 'Second'})</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div id="course-messages-container" style="margin-top: 20px; max-height: 500px; overflow-y: auto;">
          <div class="att-empty">📭 Select a course to view messages</div>
        </div>
        
        <div id="message-input-area" style="display: none; margin-top: 20px;">
          <div class="message-input-area">
            <input type="text" id="new-message-text" class="fi" placeholder="Type your message here..." style="flex: 1;">
            <button class="btn btn-ug" onclick="STUDENT_DASH.sendCourseMessage()">📤 Send</button>
          </div>
        </div>
      </div>
    `;
  }

  async function loadCourseMessages() {
    const courseSelect = document.getElementById('message-course-select');
    const container = document.getElementById('course-messages-container');
    const inputArea = document.getElementById('message-input-area');
    
    if (!courseSelect || !container) return;
    
    const [courseCode, year, semester, lecId] = courseSelect.value.split('_');
    if (!courseCode) {
      container.innerHTML = '<div class="att-empty">📭 Select a course to view messages</div>';
      if (inputArea) inputArea.style.display = 'none';
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading messages...</div>';
    if (inputArea) inputArea.style.display = 'block';
    
    try {
      const messages = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
      
      if (!messages || Object.keys(messages).length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No messages yet. Be the first to send a message!</div>';
        return;
      }
      
      const messageList = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = messageList.map(msg => `
        <div class="message-card">
          <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
            <div>
              <strong style="color: var(--ug);">${msg.senderName === currentStudent.name ? '👤 You' : escapeHtml(msg.senderName)}</strong>
              ${msg.senderId === lecId ? '<span class="badge" style="background: var(--ug); margin-left: 8px;">👨‍🏫 Lecturer</span>' : ''}
              ${msg.isAnnouncement ? '<span class="badge" style="background: #fcd116; color: #003087;">📢 Announcement</span>' : ''}
            </div>
            <span style="font-size: 11px; color: var(--text4);">${formatTime(msg.timestamp)}</span>
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px;">
            ${escapeHtml(msg.message)}
          </div>
          ${msg.replies && msg.replies.length > 0 ? `
            <div style="margin-top: 12px; padding-left: 16px; border-left: 2px solid var(--border);">
              <div style="font-size: 12px; color: var(--text3); margin-bottom: 8px;">💬 ${msg.replies.length} repl${msg.replies.length === 1 ? 'y' : 'ies'}</div>
              ${msg.replies.slice(-3).map(reply => `
                <div style="font-size: 12px; margin-bottom: 8px; background: var(--surface2); padding: 8px; border-radius: 8px;">
                  <strong>${reply.senderName === currentStudent.name ? '👤 You' : escapeHtml(reply.senderName)}</strong>
                  <span style="font-size: 10px; color: var(--text4); margin-left: 8px;">${formatTime(reply.timestamp)}</span>
                  <div style="margin-top: 4px;">${escapeHtml(reply.message)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="margin-top: 12px;">
            <button class="btn btn-outline btn-sm" onclick="STUDENT_DASH.showReplyForm('${msg.id}')">💬 Reply</button>
          </div>
        </div>
      `).join('');
      
      window.currentMessageCourse = { courseCode, year, semester, lecId };
      
    } catch(err) {
      console.error('Load messages error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading messages</div>';
    }
  }

  async function sendCourseMessage() {
    const messageText = document.getElementById('new-message-text')?.value.trim();
    const courseInfo = window.currentMessageCourse;
    
    if (!courseInfo) {
      await MODAL.alert('No Course', '⚠️ Please select a course first.');
      return;
    }
    
    if (!messageText) {
      await MODAL.alert('No Message', '⚠️ Please enter a message.');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
    
    const message = {
      id: messageId,
      senderId: currentStudent.studentId,
      senderName: currentStudent.name,
      message: messageText,
      timestamp: Date.now(),
      isAnnouncement: false,
      replies: []
    };
    
    await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, message);
    
    // Notify lecturer
    await DB.set(`notifications/lecturer/${lecId}/messages/${messageId}`, {
      id: messageId,
      title: `💬 New Message: ${courseCode}`,
      message: `${currentStudent.name}: ${messageText.substring(0, 100)}`,
      type: 'info',
      timestamp: Date.now(),
      read: false
    });
    
    document.getElementById('new-message-text').value = '';
    await loadCourseMessages();
    await MODAL.success('Message Sent', '✅ Your message has been posted.');
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
      
      // Notify original sender if it's a lecturer
      if (message.senderId === lecId) {
        await DB.set(`notifications/lecturer/${lecId}/messages/reply_${Date.now()}`, {
          id: `reply_${Date.now()}`,
          title: `💬 New Reply: ${courseCode}`,
          message: `${currentStudent.name} replied to your message: ${replyText.substring(0, 100)}`,
          type: 'info',
          timestamp: Date.now(),
          read: false
        });
      }
    }
    
    await loadCourseMessages();
    await MODAL.success('Reply Sent', '✅ Your reply has been posted.');
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
    
    const payload = btoa(JSON.stringify({
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
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    sessionStorage.setItem('student_checkin_name', currentStudent.name);
    sessionStorage.setItem('student_checkin_id', currentStudent.studentId);
    
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  // ==================== PERIOD CHANGE ====================
  async function changePeriod() {
    const select = document.getElementById('overview-year');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      await loadOverview();
    }
  }

  // ==================== SWITCH TAB ====================
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
    if (activeContent) activeContent.style.display = 'block';
    
    // Update topbar title
    const titles = {
      overview: '📊 Student Dashboard',
      calendar: '📅 Schedule & Calendar',
      history: '📋 Attendance History',
      messages: '💬 Messages'
    };
    const tbTitle = document.getElementById('student-dash-title');
    if (tbTitle && titles[tabName]) tbTitle.textContent = titles[tabName];
    
    // Load content based on tab
    if (tabName === 'overview') {
      await loadOverview();
    } else if (tabName === 'calendar') {
      await loadCalendarView();
    } else if (tabName === 'history') {
      await loadHistoryView();
    } else if (tabName === 'messages') {
      await loadMessagesView();
    }
  }

  // ==================== AUTO REFRESH & CLEANUP ====================
  function startAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') {
        loadOverview();
      } else if (activeTab === 'calendar-view') {
        loadCalendarView();
      } else if (activeTab === 'history-view') {
        loadHistoryView();
      } else if (activeTab === 'messages-view') {
        loadCourseMessages();
      }
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
    loadCalendarView,
    loadHistoryView,
    loadMessagesView,
    directCheckIn,
    checkInFromTimetable,
    changePeriod,
    changeCalendarPeriod,
    changeHistoryPeriod,
    filterHistory,
    exportHistoryToExcel,
    showTimetableEditor,
    addTimetableEntry,
    removeTimetableEntry,
    loadCourseMessages,
    sendCourseMessage,
    showReplyForm,
    logout
  };
})();
