/* student-overview.js — Overview dashboard with statistics and active sessions */
'use strict';

const STUDENT_OVERVIEW = (() => {
  const core = () => window.STUDENT_CORE;
  const location = () => window.STUDENT_LOCATION;
  
  async function refreshOverview() {
    await loadOverview();
  }

  async function changePeriod() {
    const select = document.getElementById('overview-year');
    if (select) {
      const [year, semester] = select.value.split('_');
      core().state.currentSelectedYear = parseInt(year);
      core().state.currentSelectedSemester = parseInt(semester);
      core().state.currentFilterCourseKey = null;
      core().state.currentFilterLecturer = null;
      core().state.currentMessageCourse = null;
      core().state.currentAnnouncementCourse = null;
      core().state.currentHistoryPage = 1;
      await loadOverview();
      if (typeof STUDENT_CALENDAR !== 'undefined') await STUDENT_CALENDAR.loadCalendarView();
      if (typeof STUDENT_HISTORY !== 'undefined') await STUDENT_HISTORY.loadHistoryView();
    }
  }

  async function loadStudentData() {
    try {
      const allSessions = await core().getCachedOrFetch('allSessions', async () => {
        return await DB.SESSION.getAll();
      }, 30000);
      
      const uniqueCourseLecturerMap = new Map();
      const studentCheckinSessions = [];
      const lecturerIdsNeeded = new Set();
      
      for (const session of allSessions) {
        if (!session.records) continue;
        const records = Object.values(session.records);
        const hasStudentCheckin = records.some(r => 
          r.studentId && r.studentId.toUpperCase() === core().state.currentStudent.studentId.toUpperCase()
        );
        
        if (hasStudentCheckin) {
          studentCheckinSessions.push(session);
          const key = core().getCourseKey(session.courseCode, session.lecFbId);
          if (!uniqueCourseLecturerMap.has(key)) {
            uniqueCourseLecturerMap.set(key, {
              courseCode: session.courseCode,
              courseName: session.courseName || session.courseCode,
              lecId: session.lecFbId,
              lecturerName: session.lecturer || 'Unknown Lecturer',
              year: session.year,
              semester: session.semester,
              firstCheckedIn: Date.now()
            });
            lecturerIdsNeeded.add(session.lecFbId);
          }
        }
      }
      
      const lecturerPromises = Array.from(lecturerIdsNeeded).map(async (lecId) => {
        if (!core().cache.lecturers.has(lecId)) {
          try {
            const lecturer = await DB.LEC.get(lecId);
            if (lecturer && lecturer.name) {
              core().cache.lecturers.set(lecId, { 
                name: lecturer.name,
                id: lecId,
                lat: lecturer?.lastLocation?.lat || null,
                lng: lecturer?.lastLocation?.lng || null
              });
              for (const [key, course] of uniqueCourseLecturerMap) {
                if (course.lecId === lecId) course.lecturerName = lecturer.name;
              }
            }
          } catch(e) {}
        }
      });
      await Promise.all(lecturerPromises);
      
      core().state.enrolledCourses = Array.from(uniqueCourseLecturerMap.values());
      core().state.allStudentSessions = studentCheckinSessions;
      
      const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))];
      let defaultYear = new Date().getFullYear();
      let defaultSemester = 1;
      
      if (availablePeriods.length > 0) {
        const sorted = availablePeriods.sort((a, b) => {
          const [yearA, semA] = a.split('_');
          const [yearB, semB] = b.split('_');
          if (yearA !== yearB) return yearB - yearA;
          return semB - semA;
        });
        const [year, semester] = sorted[0].split('_');
        defaultYear = parseInt(year);
        defaultSemester = parseInt(semester);
      }
      
      core().state.currentSelectedYear = defaultYear;
      core().state.currentSelectedSemester = defaultSemester;
      core().state.currentFilterCourseKey = null;
      core().state.currentFilterLecturer = null;
      core().state.currentMessageCourse = null;
      core().state.currentAnnouncementCourse = null;
      
      console.log('[STUDENT] Loaded', core().state.enrolledCourses.length, 'courses');
    } catch(err) { 
      console.error('[STUDENT] Load error:', err); 
      core().state.enrolledCourses = []; 
    }
  }

  function getCoursesForCurrentPeriod() {
    return core().state.enrolledCourses.filter(c => 
      c.year === core().state.currentSelectedYear && 
      c.semester === core().state.currentSelectedSemester
    );
  }

  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await core().getCachedOrFetch('allSessions', async () => {
      return await DB.SESSION.getAll();
    }, 30000);
    
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => core().getCourseKey(c.courseCode, c.lecId)));
    const sessions = [];
    for (const session of allSessions) {
      const sessionKey = core().getCourseKey(session.courseCode, session.lecFbId);
      if (enrolledKeys.has(sessionKey) && 
          session.year === core().state.currentSelectedYear && 
          session.semester === core().state.currentSelectedSemester) {
        let attended = false;
        let myRecord = null;
        if (session.records) {
          const records = Object.values(session.records);
          myRecord = records.find(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase());
          attended = !!myRecord;
        }
        sessions.push({ ...session, attended, myRecord });
      }
    }
    return sessions;
  }

  async function loadOverview() {
    const container = document.getElementById('overview-view');
    if (!container) return;
    
    try {
      const periodCourses = getCoursesForCurrentPeriod();
      const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))]
        .sort((a, b) => {
          const [yearA, semA] = a.split('_');
          const [yearB, semB] = b.split('_');
          if (yearA !== yearB) return yearB - yearA;
          return semB - semA;
        });
      
      let periodsHtml = '';
      if (availablePeriods.length > 0) {
        periodsHtml = availablePeriods.map(p => {
          const [year, semester] = p.split('_');
          return `<option value="${p}" ${parseInt(year) === core().state.currentSelectedYear && parseInt(semester) === core().state.currentSelectedSemester ? 'selected' : ''}>
            ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
          </option>`;
        }).join('');
      } else {
        const availableYears = core().getAvailableYears();
        const currentYear = new Date().getFullYear();
        periodsHtml = availableYears.map(year => `
          <option value="${year}_1" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 1 ? 'selected' : ''}>
            ${year} - First Semester
          </option>
          <option value="${year}_2" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 2 ? 'selected' : ''}>
            ${year} - Second Semester
          </option>
        `).join('');
      }
      
      const allPeriodSessions = await getAllSessionsForCurrentPeriod();
      
      const courseStats = [];
      for (const course of periodCourses) {
        const courseSessions = allPeriodSessions.filter(s => s.courseCode === course.courseCode && s.lecFbId === course.lecId);
        const attended = courseSessions.filter(s => s.attended).length;
        const total = courseSessions.length;
        const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
        const upcomingSessions = courseSessions.filter(s => !s.attended && new Date(s.date) > new Date());
        courseStats.push({ ...course, attended, total, percentage, upcomingCount: upcomingSessions.length, risk: core().getRiskLevel(percentage) });
      }
      
      const goodCourses = courseStats.filter(c => c.risk.level === 'good');
      const warningCourses = courseStats.filter(c => c.risk.level === 'warning');
      const criticalCourses = courseStats.filter(c => c.risk.level === 'critical');
      
      const totalCourses = periodCourses.length;
      const totalSessions = courseStats.reduce((sum, c) => sum + c.total, 0);
      const totalAttended = courseStats.reduce((sum, c) => sum + c.attended, 0);
      const overallAttendance = totalSessions > 0 ? Math.round((totalAttended / totalSessions) * 100) : 0;
      const totalUpcoming = courseStats.reduce((sum, c) => sum + c.upcomingCount, 0);
      
      const allActiveSessions = await DB.SESSION.getAll();
      const enrolledKeys = new Set(periodCourses.map(c => core().getCourseKey(c.courseCode, c.lecId)));
      const activeSessions = allActiveSessions.filter(s => s.active === true && enrolledKeys.has(core().getCourseKey(s.courseCode, s.lecFbId)));
      
      const today = new Date().toISOString().split('T')[0];
      const todaySessions = allPeriodSessions.filter(s => s.date === today && !s.attended && new Date(s.date + ' ' + (s.myRecord?.time || '00:00')) > new Date());
      
      const recentActivity = allPeriodSessions.filter(s => s.attended && s.myRecord).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
      
      let activeSessionsHtml = '';
      if (activeSessions.length > 0) {
        activeSessionsHtml = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">`;
        for (const session of activeSessions) {
          const timeRemaining = Math.max(0, session.expiresAt - Date.now());
          const minutesLeft = Math.floor(timeRemaining / 60000);
          const records = session.records ? Object.values(session.records) : [];
          const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase());
          const course = periodCourses.find(c => c.courseCode === session.courseCode && c.lecId === session.lecFbId);
          const hasLocation = session.lat && session.lng;
          
          activeSessionsHtml += `
            <div class="course-card" style="border-left: 4px solid #1d9e75;">
              <div class="course-header"><span class="course-code">📚 ${core().escapeHtml(session.courseCode)}</span><span class="badge" style="background:#1d9e75;">ACTIVE</span></div>
              <div class="course-name">${core().escapeHtml(session.courseName)}</div>
              <div class="course-stats"><span>📅 ${session.date}</span><span>⏱️ ${minutesLeft}m left</span><span>👨‍🏫 ${core().escapeHtml(course?.lecturerName || session.lecturer || 'Unknown')}</span>${hasLocation ? `<span>📍 Location available</span>` : ''}</div>
              <div class="course-buttons" style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${isCheckedIn ? '<div class="checked-in-badge" style="flex: 1;">✅ Already checked in</div>' : `<button class="btn btn-ug btn-sm" onclick="STUDENT_MAIN.directCheckIn('${session.id}')" style="flex: 1;">✓ Check In</button>`}
                ${hasLocation ? `<button class="btn btn-outline btn-sm" onclick="STUDENT_MAIN.showActiveSessionLocation('${session.id}')" style="flex: 1;">📍 Get Directions</button>` : ''}
              </div>
            </div>
          `;
        }
        activeSessionsHtml += `</div>`;
        if (activeSessions.length > 5) activeSessionsHtml += `<p class="note" style="text-align: center; margin-top: 12px;">+ ${activeSessions.length - 5} more active sessions</p>`;
      } else {
        activeSessionsHtml = '<div class="no-rec">📭 No active sessions at the moment</div>';
      }
      
      let todaySessionsHtml = '';
      if (todaySessions.length > 0) {
        todaySessionsHtml = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">`;
        for (const session of todaySessions.slice(0, 5)) {
          todaySessionsHtml += `
            <div class="course-card">
              <div class="course-header"><span class="course-code">📚 ${core().escapeHtml(session.courseCode)}</span><span class="badge" style="background: var(--amber);">UPCOMING</span></div>
              <div class="course-name">${core().escapeHtml(session.courseName)}</div>
              <div class="course-stats"><span>📅 ${session.date}</span><span>👨‍🏫 ${core().escapeHtml(session.lecturer || 'Unknown')}</span></div>
              <button class="btn btn-outline btn-sm" onclick="STUDENT_MAIN.checkInFromTimetable('${session.courseCode}', '${session.lecFbId}')">⏰ Check In When Available</button>
            </div>
          `;
        }
        todaySessionsHtml += `</div>`;
        if (todaySessions.length > 5) todaySessionsHtml += `<p class="note" style="text-align: center;">+ ${todaySessions.length - 5} more sessions today</p>`;
      } else {
        todaySessionsHtml = '<div class="no-rec">📭 No upcoming sessions today</div>';
      }
      
      let recentActivityHtml = '';
      if (recentActivity.length > 0) {
        recentActivityHtml = `<div class="recent-list">`;
        for (const activity of recentActivity) {
          recentActivityHtml += `
            <div class="recent-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
              <div><strong>${core().escapeHtml(activity.courseCode)}</strong><br><small>${core().escapeHtml(activity.courseName)}</small></div>
              <div><span class="badge" style="background: var(--teal);">✓ Checked In</span></div>
              <div style="font-size: 12px; color: var(--text3);">📅 ${activity.date} at ${activity.myRecord?.time || '—'}</div>
            </div>
          `;
        }
        recentActivityHtml += `</div>`;
      } else {
        recentActivityHtml = '<div class="no-rec">📭 No recent check-in activity</div>';
      }
      
      container.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 150px;"><label class="fl">📅 Academic Period</label><select id="overview-year" class="fi" onchange="STUDENT_OVERVIEW.changePeriod()">${periodsHtml}</select></div>
          <div><button class="btn btn-outline btn-sm" onclick="STUDENT_OVERVIEW.refreshOverview()">🔄 Refresh</button></div>
        </div>
        <div class="stats-grid" style="margin-bottom: 24px;">
          <div class="stat-card"><div class="stat-value">${totalCourses}</div><div class="stat-label">📚 Courses</div></div>
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">📊 Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${overallAttendance}%</div><div class="stat-label">📈 Overall Attendance</div></div>
          <div class="stat-card"><div class="stat-value">${totalUpcoming}</div><div class="stat-label">⏰ Upcoming Sessions</div></div>
        </div>
        <div class="stats-grid" style="margin-bottom: 24px;">
          <div class="stat-card" style="border-left: 4px solid var(--teal);"><div class="stat-value" style="color: var(--teal);">${goodCourses.length}</div><div class="stat-label">✅ Good Standing (≥80%)</div></div>
          <div class="stat-card" style="border-left: 4px solid var(--amber);"><div class="stat-value" style="color: var(--amber);">${warningCourses.length}</div><div class="stat-label">⚠️ Needs Attention (60-79%)</div></div>
          <div class="stat-card" style="border-left: 4px solid var(--danger);"><div class="stat-value" style="color: var(--danger);">${criticalCourses.length}</div><div class="stat-label">❌ At Risk (&lt;60%)</div></div>
          <div class="stat-card"><div class="stat-value">${totalAttended}</div><div class="stat-label">✓ Total Check-ins</div></div>
        </div>
        ${criticalCourses.length > 0 ? `<div class="alert-card warning" style="margin-bottom: 20px; background: var(--danger-s); border-left: 4px solid var(--danger);"><strong>⚠️ Attention Required!</strong> You are at risk in ${criticalCourses.length} course(s). Please check your attendance below.</div>` : ''}
        <div class="dash-section"><h3>🟢 Active Sessions <span style="font-size: 12px;" class="note">(Check in now or get directions)</span></h3>${activeSessionsHtml}</div>
        <div class="dash-section"><h3>📅 Today's Upcoming Sessions</h3>${todaySessionsHtml}</div>
        <div class="dash-section">
          <h3>📊 Course Progress</h3>
          <div class="courses-grid">
            ${courseStats.slice(0, 6).map(course => `
              <div class="course-card">
                <div class="course-header"><span class="course-code">📚 ${core().escapeHtml(course.courseCode)}</span><span class="badge" style="background: ${course.risk.color};">${course.risk.icon}</span></div>
                <div class="course-name">${core().escapeHtml(course.courseName)}</div>
                <div class="course-stats"><span>👨‍🏫 ${core().escapeHtml(course.lecturerName)}</span></div>
                <div class="course-stats"><span>${course.attended}/${course.total} sessions attended</span><span>${course.percentage}%</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width: ${course.percentage}%; background: ${course.risk.color};"></div></div>
                ${course.upcomingCount > 0 ? `<p class="note" style="margin-top: 8px;">📌 ${course.upcomingCount} upcoming session(s)</p>` : ''}
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                  <button class="btn btn-outline btn-sm" onclick="STUDENT_MAIN.checkInFromTimetable('${course.courseCode}', '${course.lecId}')">⏰ Check In</button>
                  <button class="btn btn-secondary btn-sm" onclick="STUDENT_MAIN.switchTab('history')">📋 View History</button>
                </div>
              </div>
            `).join('')}
          </div>
          ${courseStats.length > 6 ? `<p class="note" style="text-align: center; margin-top: 12px;">+ ${courseStats.length - 6} more courses</p>` : ''}
        </div>
        <div class="dash-section"><h3>🕐 Recent Activity</h3>${recentActivityHtml}</div>
        <div class="dash-section">
          <h3>⚡ Quick Actions</h3>
          <div style="display: flex; gap: 12px; flex-wrap: wrap;">
            <button class="btn btn-ug" onclick="STUDENT_MAIN.switchTab('calendar')">📅 View Full Schedule</button>
            <button class="btn btn-secondary" onclick="STUDENT_MAIN.switchTab('history')">📋 Attendance History</button>
            <button class="btn btn-outline" onclick="STUDENT_MAIN.switchTab('messages')">💬 Course Messages</button>
          </div>
        </div>
      `;
    } catch(err) { 
      console.error('[STUDENT] Overview error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`;
    }
  }

  return {
    loadStudentData,
    getCoursesForCurrentPeriod,
    getAllSessionsForCurrentPeriod,
    loadOverview,
    refreshOverview,
    changePeriod
  };
})();

window.STUDENT_OVERVIEW = STUDENT_OVERVIEW;
