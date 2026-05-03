/* student-dashboard.js — OPTIMIZED VERSION (Faster Loading) */
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
  let personalStudyTimes = [];
  let notificationCheckInterval = null;
  let upcomingCheckInterval = null;
  let currentFilterCourseKey = null;
  let currentFilterLecturer = null;
  let currentMessageCourse = null;
  let currentAnnouncementCourse = null;
  let activeUpcomingNotifications = new Set();
  
  // CACHE for faster loading
  let sessionsCache = null;
  let lecturersCache = new Map();
  let lastCacheTime = 0;
  const CACHE_DURATION = 60000; // 1 minute cache

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

  function doTimesOverlap(start1, end1, start2, end2) {
    const [startHour1, startMin1] = start1.split(':').map(Number);
    const [endHour1, endMin1] = end1.split(':').map(Number);
    const [startHour2, startMin2] = start2.split(':').map(Number);
    const [endHour2, endMin2] = end2.split(':').map(Number);
    
    const startMinutes1 = startHour1 * 60 + startMin1;
    const endMinutes1 = endHour1 * 60 + endMin1;
    const startMinutes2 = startHour2 * 60 + startMin2;
    const endMinutes2 = endHour2 * 60 + endMin2;
    
    return (startMinutes1 < endMinutes2 && startMinutes2 < endMinutes1);
  }

  function getCourseKey(courseCode, lecId) {
    return `${courseCode}_${lecId}`;
  }

  // ==================== OPTIMIZED: Fetch all data in parallel ====================
  async function fetchAllData() {
    // Check cache first
    if (sessionsCache && (Date.now() - lastCacheTime) < CACHE_DURATION) {
      console.log('[STUDENT_DASH] Using cached data');
      return sessionsCache;
    }
    
    console.log('[STUDENT_DASH] Fetching fresh data...');
    
    // Fetch all data in PARALLEL (much faster!)
    const [allSessions, allEnrollments] = await Promise.all([
      DB.SESSION.getAll(),
      DB.ENROLLMENT.getStudentEnrollments(currentStudent.studentId, null)
    ]);
    
    sessionsCache = { allSessions, allEnrollments };
    lastCacheTime = Date.now();
    
    return sessionsCache;
  }

  // ==================== OPTIMIZED: Load student data ====================
  async function loadStudentData() {
    try {
      const { allSessions, allEnrollments } = await fetchAllData();
      
      // Use Map for O(1) lookups instead of Array.find
      const enrollmentMap = new Map();
      for (const enrollment of allEnrollments) {
        const key = getCourseKey(enrollment.courseCode, enrollment.lecId);
        enrollmentMap.set(key, enrollment);
      }
      
      // Track unique course+lecturer combinations from check-ins
      const uniqueCourseLecturerMap = new Map();
      const studentCheckinSessions = [];
      
      // Single pass through sessions
      for (const session of allSessions) {
        if (!session.records) continue;
        
        const records = Object.values(session.records);
        const hasStudentCheckin = records.some(r => 
          r.studentId && r.studentId.toUpperCase() === currentStudent.studentId.toUpperCase()
        );
        
        if (hasStudentCheckin) {
          studentCheckinSessions.push(session);
          const key = getCourseKey(session.courseCode, session.lecFbId);
          
          if (!uniqueCourseLecturerMap.has(key)) {
            // Get lecturer name from cache or fetch
            let lecturerName = session.lecturer || 'Unknown Lecturer';
            if (lecturersCache.has(session.lecFbId)) {
              lecturerName = lecturersCache.get(session.lecFbId).name;
            } else {
              try {
                const lecturer = await DB.LEC.get(session.lecFbId);
                if (lecturer && lecturer.name) {
                  lecturerName = lecturer.name;
                  lecturersCache.set(session.lecFbId, { 
                    name: lecturerName,
                    id: session.lecFbId,
                    lat: lecturer?.lastLocation?.lat || null,
                    lng: lecturer?.lastLocation?.lng || null
                  });
                }
              } catch(e) {}
            }
            
            uniqueCourseLecturerMap.set(key, {
              courseCode: session.courseCode,
              courseName: session.courseName || session.courseCode,
              lecId: session.lecFbId,
              lecturerName: lecturerName,
              year: session.year,
              semester: session.semester,
              firstCheckedIn: Date.now()
            });
          }
        }
      }
      
      enrolledCourses = Array.from(uniqueCourseLecturerMap.values());
      allStudentSessions = studentCheckinSessions;
      
      // Get available periods
      const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))];
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
      
      currentSelectedYear = defaultYear;
      currentSelectedSemester = defaultSemester;
      currentFilterCourseKey = null;
      currentFilterLecturer = null;
      currentMessageCourse = null;
      currentAnnouncementCourse = null;
      
      console.log(`[STUDENT_DASH] Loaded ${enrolledCourses.length} courses in ${Date.now() - lastCacheTime}ms`);
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Load error:', err); 
      enrolledCourses = []; 
    }
  }

  function getCoursesForCurrentPeriod() {
    return enrolledCourses.filter(c => c.year === currentSelectedYear && c.semester === currentSelectedSemester);
  }

  // ==================== OPTIMIZED: Get sessions for current period ====================
  async function getAllSessionsForCurrentPeriod() {
    const { allSessions } = await fetchAllData();
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    // Filter sessions in O(n) without extra loops
    const sessions = [];
    for (const session of allSessions) {
      const sessionKey = getCourseKey(session.courseCode, session.lecFbId);
      const isEnrolled = enrolledKeys.has(sessionKey);
      
      if (isEnrolled && session.year === currentSelectedYear && session.semester === currentSelectedSemester) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        
        sessions.push({
          ...session,
          attended: attended,
          myRecord: records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())
        });
      }
    }
    
    return sessions;
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
    
    // Show loading indicator
    showLoadingIndicator();
    
    // Load data in parallel
    await Promise.all([
      loadStudentData(),
      loadTimetable(),
      loadPersonalStudyTimes()
    ]);
    
    await loadOverview();
    startAutoRefresh();
    startNotificationCheck();
    startUpcomingSessionsCheck();
    
    updateSidebarInfo();
    hideLoadingIndicator();
  }
  
  function showLoadingIndicator() {
    const container = document.getElementById('overview-view');
    if (container) {
      container.innerHTML = '<div class="att-empty"><div class="spin-ug"></div> Loading your dashboard...</div>';
    }
  }
  
  function hideLoadingIndicator() {
    // Loading complete
  }
  
  function updateSidebarInfo() {
    const sidebarName = document.getElementById('student-sidebar-name');
    const sidebarId = document.getElementById('student-sidebar-id');
    const userName = document.getElementById('student-dash-name');
    const userAvatar = document.getElementById('student-avatar');
    
    if (sidebarName) sidebarName.textContent = currentStudent.name || '🎓 Student';
    if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId}`;
    if (userName) userName.textContent = currentStudent.name || currentStudent.email;
    if (userAvatar) userAvatar.textContent = '🎓';
  }

  // ==================== TIMETABLE FUNCTIONS ====================
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
    await checkUpcomingSessions();
  }

  async function loadPersonalStudyTimes() {
    const key = `personal_study_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      personalStudyTimes = JSON.parse(saved);
    } else {
      personalStudyTimes = [];
    }
  }

  async function savePersonalStudyTimes() {
    const key = `personal_study_${currentStudent.studentId}_${currentSelectedYear}_${currentSelectedSemester}`;
    localStorage.setItem(key, JSON.stringify(personalStudyTimes));
    await checkUpcomingSessions();
  }

  // ==================== UPCOMING SESSIONS CHECK ====================
  function startUpcomingSessionsCheck() {
    if (upcomingCheckInterval) clearInterval(upcomingCheckInterval);
    upcomingCheckInterval = setInterval(async () => {
      await checkUpcomingSessions();
    }, 60000);
  }
  
  async function checkUpcomingSessions() {
    // This function remains the same but now uses cached data
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = getCurrentDay();
    
    for (const entry of timetable) {
      if (entry.day !== currentDay) continue;
      
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const entryStartMinutes = startHour * 60 + startMin;
      const minutesUntil = entryStartMinutes - currentMinutes;
      const entryId = `${entry.courseCode}_${entry.lecId}_${entry.day}_${entry.startTime}`;
      
      if (minutesUntil <= 30 && minutesUntil > 0 && !activeUpcomingNotifications.has(entryId)) {
        activeUpcomingNotifications.add(entryId);
        
        if (Notification.permission === "granted") {
          new Notification(`📚 Upcoming Class: ${entry.courseCode} with ${entry.lecturerName}`, {
            body: `Starts at ${entry.startTime} in ${minutesUntil} minutes.`,
            icon: "/uo_ghana.png",
            tag: entryId
          });
        }
        
        const calendarView = document.getElementById('calendar-view');
        if (calendarView && calendarView.style.display !== 'none') {
          await loadCalendarView();
        }
        
        setTimeout(() => {
          activeUpcomingNotifications.delete(entryId);
        }, minutesUntil * 60 * 1000);
      }
    }
  }

  // ==================== CALENDAR VIEW ====================
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
    
    const upcomingSessions = [];
    for (const entry of timetable) {
      if (entry.day !== currentDay) continue;
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const entryStartMinutes = startHour * 60 + startMin;
      const minutesUntil = entryStartMinutes - currentMinutes;
      if (minutesUntil <= 30 && minutesUntil > 0) {
        upcomingSessions.push({ ...entry, minutesUntil });
      }
    }
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let h = 7; h <= 22; h++) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < 22) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
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
        <div>
          <button class="btn btn-teal" onclick="STUDENT_DASH.showPersonalStudyEditor()">📚 Study Time</button>
        </div>
      </div>
      
      ${upcomingSessions.length > 0 ? `
        <div class="alert-card warning" style="margin-bottom: 20px; background: var(--amber-s); border-left: 4px solid var(--amber);">
          <strong>⏰ Upcoming Sessions (Next 30 minutes):</strong>
          ${upcomingSessions.map(session => `
            <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <span>📚 ${session.courseCode} with ${session.lecturerName} at ${session.startTime}</span>
              <button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.checkInFromTimetable('${session.courseCode}', '${session.lecId}')">✓ Check In</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="dash-section">
        <h3>📅 My Weekly Schedule</h3>
        <div class="timetable-grid" style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; min-width: 700px;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 12px;">Time</th>
                ${days.map(day => `<th style="padding: 12px;">${day}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${timeSlots.slice(0, 30).map(timeSlot => {
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid var(--border); background: var(--surface2);">${timeSlot}</td>
                    ${days.map(day => {
                      const classEntry = timetable.find(t => t.day === day && t.startTime === timeSlot);
                      const studyEntry = personalStudyTimes.find(p => p.day === day && p.startTime === timeSlot);
                      
                      if (classEntry) {
                        return `<td style="padding: 8px; border: 1px solid var(--border); background: var(--primary-s);">
                          <strong>${escapeHtml(classEntry.courseCode)}</strong><br>
                          <small>${escapeHtml(classEntry.lecturerName)}</small><br>
                          ${classEntry.startTime}-${classEntry.endTime}
                          <button class="btn btn-sm btn-outline" style="margin-top: 4px;" onclick="STUDENT_DASH.checkInFromTimetable('${classEntry.courseCode}', '${classEntry.lecId}')">Check In</button>
                         </td>`;
                      } else if (studyEntry) {
                        return `<td style="padding: 8px; border: 1px solid var(--border); background: var(--green-s);">
                          <strong>📖 ${escapeHtml(studyEntry.title)}</strong><br>
                          ${studyEntry.startTime}-${studyEntry.endTime}
                         </td>`;
                      }
                      return `<td style="padding: 8px; border: 1px solid var(--border); color: var(--text4); text-align: center;">—</td>`;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    container.innerHTML = timetableHtml;
  }

  // ==================== PERSONAL STUDY TIME EDITOR ====================
  async function showPersonalStudyEditor() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeSlots = [];
    for (let h = 0; h <= 23; h++) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < 23) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    
    let entriesHtml = '';
    if (personalStudyTimes.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      personalStudyTimes.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item" style="border-left: 3px solid var(--teal);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div><strong>📅 ${entry.day}</strong> ${entry.startTime}-${entry.endTime}</div>
              <div>📖 <strong>${escapeHtml(entry.title || 'Personal Study')}</strong></div>
              <div>
                <button class="btn btn-warning btn-sm" onclick="STUDENT_DASH.editPersonalStudyEntry(${index})">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="STUDENT_DASH.removePersonalStudyEntry(${index})">🗑️ Remove</button>
              </div>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No personal study times added.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Personal Study Time</h4>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="personal-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📖 Title</label><input type="text" id="personal-title" class="fi" placeholder="Study title"></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start</label><select id="personal-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">⏰ End</label><select id="personal-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
          </div>
          <div class="field">
            <label class="fl">📍 Location</label>
            <input type="text" id="personal-location" class="fi" placeholder="e.g., Library">
          </div>
          <button class="btn btn-teal" onclick="STUDENT_DASH.addPersonalStudyEntry()">✅ Add</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>📋 Current Schedule</h4>
          ${entriesHtml}
        </div>
      </div>
    `;
    
    await MODAL.alert('📖 Manage Personal Study Time', modalContent, { icon: '📚', btnLabel: 'Close', width: '650px' });
  }

  async function addPersonalStudyEntry() {
    const day = document.getElementById('personal-day')?.value;
    const startTime = document.getElementById('personal-start')?.value;
    const endTime = document.getElementById('personal-end')?.value;
    const title = document.getElementById('personal-title')?.value.trim();
    const location = document.getElementById('personal-location')?.value.trim();
    
    if (!day || !startTime || !endTime || !title) {
      await MODAL.alert('Missing Info', '⚠️ Please fill all fields.');
      return;
    }
    
    personalStudyTimes.push({ day, startTime, endTime, title, location, createdAt: Date.now() });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
    personalStudyTimes.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Added', '✅ Study time added.');
  }

  async function editPersonalStudyEntry(index) {
    const entry = personalStudyTimes[index];
    if (!entry) return;
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const timeSlots = [];
    for (let h = 0; h <= 23; h++) {
      timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      if (h < 23) timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
    
    const modalContent = `
      <div>
        <div class="two-col">
          <div class="field"><label class="fl">📅 Day</label><select id="edit-personal-day" class="fi">${days.map(d => `<option value="${d}" ${d === entry.day ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label class="fl">📖 Title</label><input type="text" id="edit-personal-title" class="fi" value="${escapeHtml(entry.title)}"></div>
        </div>
        <div class="two-col">
          <div class="field"><label class="fl">⏰ Start</label><select id="edit-personal-start" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.startTime ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label class="fl">⏰ End</label><select id="edit-personal-end" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.endTime ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="field">
          <label class="fl">📍 Location</label>
          <input type="text" id="edit-personal-location" class="fi" value="${escapeHtml(entry.location || '')}">
        </div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('✏️ Edit Study Time', modalContent, { confirmLabel: 'Save', cancelLabel: 'Cancel' });
    if (!confirmed) return;
    
    const newDay = document.getElementById('edit-personal-day')?.value;
    const newStartTime = document.getElementById('edit-personal-start')?.value;
    const newEndTime = document.getElementById('edit-personal-end')?.value;
    const newTitle = document.getElementById('edit-personal-title')?.value.trim();
    const newLocation = document.getElementById('edit-personal-location')?.value.trim();
    
    if (!newTitle) {
      await MODAL.alert('Missing Info', '⚠️ Please enter a title.');
      return;
    }
    
    personalStudyTimes[index] = { ...entry, day: newDay, startTime: newStartTime, endTime: newEndTime, title: newTitle, location: newLocation, updatedAt: Date.now() };
    
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Updated', '✅ Study time updated.');
  }

  async function removePersonalStudyEntry(index) {
    const confirmed = await MODAL.confirm('Remove', 'Remove this study time?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    personalStudyTimes.splice(index, 1);
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Study time removed.');
  }

  // ==================== CLASS TIMETABLE EDITOR ====================
  async function showTimetableEditor() {
    const periodCourses = getCoursesForCurrentPeriod();
    const availableCourses = periodCourses.map(c => ({ 
      code: c.courseCode, 
      name: c.courseName, 
      lecturer: c.lecturerName, 
      lecId: c.lecId
    }));
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
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div><strong>📅 ${entry.day}</strong> ${entry.startTime}-${entry.endTime}</div>
              <div>📚 <strong>${escapeHtml(entry.courseCode)}</strong> (${escapeHtml(entry.lecturerName)})</div>
              <button class="btn btn-danger btn-sm" onclick="STUDENT_DASH.removeTimetableEntry(${index})">🗑️ Remove</button>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No class entries yet.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Class Entry</h4>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="timetable-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📚 Course</label><select id="timetable-course" class="fi">
              <option value="">Select Course</option>
              ${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}
            </select></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start</label><select id="timetable-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
                        <div class="field"><label class="fl">⏰ End</label><select id="timetable-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
          </div>
          <div class="field">
            <label class="fl">📍 Location</label>
            <input type="text" id="timetable-location" class="fi" placeholder="e.g., JQB 3">
          </div>
          <button class="btn btn-ug" onclick="STUDENT_DASH.addTimetableEntry()">✅ Add</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>📋 Current Schedule</h4>
          ${entriesHtml}
        </div>
      </div>
    `;
    
    await MODAL.alert('✏️ Edit Class Timetable', modalContent, { icon: '📅', btnLabel: 'Close', width: '600px' });
  }

  async function addTimetableEntry() {
    const day = document.getElementById('timetable-day')?.value;
    const startTime = document.getElementById('timetable-start')?.value;
    const endTime = document.getElementById('timetable-end')?.value;
    const courseValue = document.getElementById('timetable-course')?.value;
    const location = document.getElementById('timetable-location')?.value.trim() || 'Classroom';
    
    if (!day || !startTime || !endTime || !courseValue) {
      await MODAL.alert('Missing Info', '⚠️ Please fill all fields.');
      return;
    }
    
    const [courseCode, courseName, lecturerName, lecId] = courseValue.split('|');
    
    const overlappingClass = timetable.find(t => 
      t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );
    
    if (overlappingClass) {
      const replace = await MODAL.confirm('Time Conflict', `Overlaps with ${overlappingClass.courseCode}. Replace?`, { confirmLabel: 'Replace' });
      if (!replace) return;
      const overlappingIndex = timetable.findIndex(t => t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime));
      if (overlappingIndex !== -1) timetable.splice(overlappingIndex, 1);
    }
    
    timetable.push({ day, startTime, endTime, courseCode, courseName, lecturerName, lecId, location });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    timetable.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Added', '✅ Class added to timetable.');
  }

  async function removeTimetableEntry(index) {
    timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Entry removed.');
  }

  async function checkInFromTimetable(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => 
      s.courseCode === courseCode && s.lecFbId === lecId && s.active === true
    );
    
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode}.`);
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
      await loadPersonalStudyTimes();
      await loadCalendarView();
    }
  }

  function startNotificationCheck() {
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    notificationCheckInterval = setInterval(async () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = getCurrentDay();
      
      const upcomingEntries = [...timetable, ...personalStudyTimes].filter(entry => {
        if (entry.day !== currentDay) return false;
        const [startHour, startMin] = entry.startTime.split(':').map(Number);
        const entryStartMinutes = startHour * 60 + startMin;
        const minutesUntil = entryStartMinutes - currentMinutes;
        return minutesUntil <= 30 && minutesUntil > 0;
      });
      
      if (upcomingEntries.length > 0) {
        const badge = document.querySelector('.notification-badge');
        if (badge) {
          badge.textContent = upcomingEntries.length;
          badge.style.display = 'block';
        }
      }
    }, 60000);
  }

  // ==================== OVERVIEW TAB (OPTIMIZED) ====================
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
      
      // Calculate course stats efficiently
      const courseStats = [];
      for (const course of periodCourses) {
        const courseSessions = allPeriodSessions.filter(s => s.courseCode === course.courseCode && s.lecFbId === course.lecId);
        const attended = courseSessions.filter(s => s.attended).length;
        const total = courseSessions.length;
        const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
        courseStats.push({
          ...course,
          attended,
          total,
          percentage,
          risk: getRiskLevel(percentage)
        });
      }
      
      const goodCourses = courseStats.filter(c => c.risk.level === 'good');
      const warningCourses = courseStats.filter(c => c.risk.level === 'warning');
      const criticalCourses = courseStats.filter(c => c.risk.level === 'critical');
      
      // Get active sessions
      const { allSessions } = await fetchAllData();
      const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
      const activeSessions = allSessions.filter(s => 
        s.active === true && enrolledKeys.has(getCourseKey(s.courseCode, s.lecFbId))
      );
      
      let activeSessionsHtml = '';
      if (activeSessions.length > 0) {
        activeSessionsHtml = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">`;
        for (const session of activeSessions.slice(0, 10)) { // Limit to 10 active sessions
          const timeRemaining = Math.max(0, session.expiresAt - Date.now());
          const minutesLeft = Math.floor(timeRemaining / 60000);
          const records = session.records ? Object.values(session.records) : [];
          const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          const course = periodCourses.find(c => c.courseCode === session.courseCode && c.lecId === session.lecFbId);
          
          activeSessionsHtml += `
            <div class="course-card" style="border-left: 4px solid #1d9e75;">
              <div class="course-header">
                <span class="course-code">📚 ${escapeHtml(session.courseCode)}</span>
                <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
              </div>
              <div class="course-name">${escapeHtml(session.courseName)}</div>
              <div class="course-stats">
                <span>📅 ${session.date}</span>
                <span>⏱️ ${minutesLeft}m left</span>
                <span>👨‍🏫 ${escapeHtml(course?.lecturerName || session.lecturer || 'Unknown')}</span>
              </div>
              <div class="course-buttons">
                ${isCheckedIn ? '<div class="checked-in-badge">✅ Already checked in</div>' : `<button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.directCheckIn('${session.id}')">✓ Check in</button>`}
              </div>
            </div>
          `;
        }
        activeSessionsHtml += `</div>`;
        if (activeSessions.length > 10) {
          activeSessionsHtml += `<p class="note" style="text-align: center;">+ ${activeSessions.length - 10} more active sessions</p>`;
        }
      } else {
        activeSessionsHtml = '<div class="no-rec">📭 No active sessions</div>';
      }
      
      container.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Academic Period</label>
            <select id="overview-year" class="fi" onchange="STUDENT_DASH.changePeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
                </option>`;
              }).join('')}
            </select>
          </div>
          <div>
            <button class="btn btn-outline btn-sm" onclick="STUDENT_DASH.refreshOverview()">🔄 Refresh</button>
          </div>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${periodCourses.length}</div><div class="stat-label">📚 Courses</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--teal);">${goodCourses.length}</div><div class="stat-label">✅ Good Standing</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--amber);">${warningCourses.length}</div><div class="stat-label">⚠️ At Risk</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--danger);">${criticalCourses.length}</div><div class="stat-label">❌ Critical</div></div>
        </div>
        
        ${criticalCourses.slice(0, 3).map(course => `
          <div class="alert-card warning">
            <strong>❌ ${course.risk.text}</strong> — ${course.courseCode}: ${course.percentage}% (${course.attended}/${course.total})
          </div>
        `).join('')}
        
        <div class="dash-section">
          <h3>🟢 Active Sessions</h3>
          ${activeSessionsHtml}
        </div>
        
        <div class="dash-section">
          <h3>📊 Course Progress</h3>
          <div class="courses-grid">
            ${courseStats.slice(0, 6).map(course => `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">📚 ${escapeHtml(course.courseCode)}</span>
                  <span class="badge" style="background: ${course.risk.color};">${course.risk.icon}</span>
                </div>
                <div class="course-name">${escapeHtml(course.courseName)}</div>
                <div class="course-stats">
                  <span>👨‍🏫 ${escapeHtml(course.lecturerName)}</span>
                </div>
                <div class="course-stats">
                  <span>${course.attended}/${course.total} sessions</span>
                  <span>${course.percentage}%</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${course.percentage}%; background: ${course.risk.color};"></div>
                </div>
              </div>
            `).join('')}
          </div>
          ${courseStats.length > 6 ? `<p class="note" style="text-align: center;">+ ${courseStats.length - 6} more courses</p>` : ''}
        </div>
      `;
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Overview error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }
  
  async function refreshOverview() {
    await loadOverview();
  }

  // ==================== HISTORY TAB (OPTIMIZED) ====================
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
    const availableCourses = periodCourses.map(c => ({ 
      key: getCourseKey(c.courseCode, c.lecId),
      code: c.courseCode, 
      name: c.courseName, 
      lecturerName: c.lecturerName 
    }));
    
    const { allSessions } = await fetchAllData();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    let filteredSessions = [];
    for (const session of allSessions) {
      const sessionKey = getCourseKey(session.courseCode, session.lecFbId);
      const isEnrolled = enrolledKeys.has(sessionKey);
      
      if (isEnrolled && session.year === currentSelectedYear && session.semester === currentSelectedSemester) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        filteredSessions.push({
          ...session,
          attended: attended,
          myRecord: records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())
        });
      }
    }
    
    if (currentFilterCourseKey) {
      filteredSessions = filteredSessions.filter(s => getCourseKey(s.courseCode, s.lecFbId) === currentFilterCourseKey);
    }
    if (currentFilterLecturer) {
      filteredSessions = filteredSessions.filter(s => s.lecFbId === currentFilterLecturer);
    }
    
    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div><label class="fl">📅 Period</label>
          <select id="history-period" class="fi" onchange="STUDENT_DASH.changeHistoryPeriod()">
            <option value="">Select Period</option>
            ${availablePeriods.map(p => { 
              const [year, semester] = p.split('_'); 
              return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                ${year} - ${semester === '1' ? 'First' : 'Second'}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div><label class="fl">📚 Course</label>
          <select id="history-course" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All</option>
            ${availableCourses.map(c => `<option value="${c.key}" ${currentFilterCourseKey === c.key ? 'selected' : ''}>
              ${c.code} (${c.lecturerName})
            </option>`).join('')}
          </select>
        </div>
        <div><label class="fl">👨‍🏫 Lecturer</label>
          <select id="history-lecturer" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All</option>
            ${availableLecturers.map(l => `<option value="${l.id}" ${currentFilterLecturer === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
          </select>
        </div>
        <div><button class="btn btn-secondary" onclick="STUDENT_DASH.exportHistoryToExcel()">📥 Export</button></div>
      </div>
      ${filteredSessions.length === 0 ? 
        '<div class="no-rec">📭 No sessions found</div>' : 
        `<div class="courses-grid">
          ${filteredSessions.slice(0, 20).map(session => {
            const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
            const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
            
            return `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">📅 ${session.date}</span>
                  <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">${session.attended ? '✅ Present' : '❌ Absent'}</span>
                </div>
                <div class="course-name">📚 ${escapeHtml(session.courseCode)} - ${escapeHtml(session.courseName || 'Course')}</div>
                <div class="course-stats">
                  <span>👨‍🏫 ${escapeHtml(lecturerName)}</span>
                  ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>`
      }
      ${filteredSessions.length > 20 ? `<p class="note" style="text-align: center;">Showing 20 of ${filteredSessions.length} sessions</p>` : ''}
    `;
  }

  async function filterHistory() {
    currentFilterCourseKey = document.getElementById('history-course')?.value || null;
    currentFilterLecturer = document.getElementById('history-lecturer')?.value || null;
    await loadHistoryView();
  }

  async function changeHistoryPeriod() {
    const select = document.getElementById('history-period');
    if (select && select.value) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentFilterCourseKey = null;
      currentFilterLecturer = null;
      await loadHistoryView();
    }
  }

  async function exportHistoryToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Error', 'Excel export not loaded.');
      return;
    }
    
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    const { allSessions } = await fetchAllData();
    
    let filteredSessions = [];
    for (const session of allSessions) {
      const isEnrolled = enrolledKeys.has(getCourseKey(session.courseCode, session.lecFbId));
      if (isEnrolled && session.year === currentSelectedYear && session.semester === currentSelectedSemester) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        filteredSessions.push({
          ...session,
          attended,
          myRecord: records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())
        });
      }
    }
    
    if (currentFilterCourseKey) {
      filteredSessions = filteredSessions.filter(s => getCourseKey(s.courseCode, s.lecFbId) === currentFilterCourseKey);
    }
    if (currentFilterLecturer) {
      filteredSessions = filteredSessions.filter(s => s.lecFbId === currentFilterLecturer);
    }
    
    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const wsData = [
      ['📋 Attendance History'],
      [`Student: ${currentStudent.name} (${currentStudent.studentId})`],
      [`Period: ${currentSelectedYear} - Semester ${currentSelectedSemester}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ['#', 'Date', 'Course', 'Lecturer', 'Status', 'Time', 'Method']
    ];
    
    let i = 1;
    for (const session of filteredSessions) {
      const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
      const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
      
      wsData.push([
        i++, session.date, `${session.courseCode} ${session.courseName || ''}`, lecturerName,
        session.attended ? 'Present' : 'Absent',
        session.myRecord?.time || '—',
        session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—')
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
    XLSX.writeFile(wb, `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`);
    await MODAL.success('Export Complete', '✅ Exported.');
  }

  // ==================== MESSAGES TAB ====================
  async function loadMessagesView() {
    const container = document.getElementById('messages-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    if (periodCourses.length === 0) {
      container.innerHTML = `<div class="inner-panel"><div class="att-empty">📭 No courses found. Check in to a session first.</div></div>`;
      return;
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages</h3>
        <div class="filter-bar" style="margin-bottom: 16px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Period</label>
            <select id="message-period" class="fi" onchange="STUDENT_DASH.changeMessagePeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First' : 'Second'}
                </option>`;
              }).join('')}
            </select>
          </div>
          <div style="min-width: 250px;">
            <label class="fl">📚 Course</label>
            <select id="message-course-select" class="fi" onchange="STUDENT_DASH.loadCourseMessages()">
              <option value="">-- Select --</option>
              ${periodCourses.map(course => `
                <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
                  ${course.courseCode} - ${course.courseName} (${course.lecturerName})
                </option>
              `).join('')}
            </select>
          </div>
          <div><button class="btn btn-outline btn-sm" id="refresh-messages-btn">🔄 Refresh</button></div>
        </div>
        <div id="course-messages-container" style="max-height: 500px; overflow-y: auto;">
          <div class="att-empty">📭 Select a course</div>
        </div>
        <div id="message-input-area" style="display: none; margin-top: 20px;">
          <div class="message-input-container">
            <textarea id="new-message-text" class="fi" rows="3" placeholder="Type your message..."></textarea>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
              <button class="btn btn-ug" id="send-message-btn">📤 Send</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('refresh-messages-btn').onclick = () => currentMessageCourse && loadCourseMessages();
    document.getElementById('send-message-btn').onclick = () => sendCourseMessage();
    document.getElementById('new-message-text').onkeypress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendCourseMessage();
      }
    };
  }

  async function changeMessagePeriod() {
    const periodSelect = document.getElementById('message-period');
    if (!periodSelect?.value) return;
    
    const [year, semester] = periodSelect.value.split('_');
    currentSelectedYear = parseInt(year);
    currentSelectedSemester = parseInt(semester);
    currentMessageCourse = null;
    
    await loadStudentData();
    
    const periodCourses = getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('message-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select --</option>';
      for (const course of periodCourses) {
        courseSelect.innerHTML += `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
          ${course.courseCode} - ${course.courseName} (${course.lecturerName})
        </option>`;
      }
    }
    
    document.getElementById('course-messages-container').innerHTML = '<div class="att-empty">📭 Select a course</div>';
    document.getElementById('message-input-area').style.display = 'none';
  }

  async function loadCourseMessages() {
    const courseSelect = document.getElementById('message-course-select');
    const container = document.getElementById('course-messages-container');
    const inputArea = document.getElementById('message-input-area');
    
    const selectedValue = courseSelect?.value;
    if (!selectedValue) {
      container.innerHTML = '<div class="att-empty">📭 Select a course</div>';
      if (inputArea) inputArea.style.display = 'none';
      currentMessageCourse = null;
      return;
    }
    
    const parts = selectedValue.split('_');
    if (parts.length < 4) {
      container.innerHTML = '<div class="att-empty">Invalid selection</div>';
      return;
    }
    
    const courseCode = parts[0];
    const year = parseInt(parts[1]);
    const semester = parseInt(parts[2]);
    const lecId = parts[3];
    
    currentMessageCourse = { courseCode, year, semester, lecId };
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading...</div>';
    if (inputArea) inputArea.style.display = 'block';
    
    try {
      const messages = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}`);
      const messageList = messages ? Object.values(messages).sort((a, b) => b.timestamp - a.timestamp) : [];
      
      if (messageList.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No messages yet</div>';
        return;
      }
      
      container.innerHTML = messageList.map(item => `
        <div class="message-card">
          <div class="message-header">
            <div><strong>${escapeHtml(item.senderName)}</strong> ${item.senderId === lecId ? '<span class="badge">Lecturer</span>' : ''}</div>
            <span class="note">${formatTime(item.timestamp)}</span>
          </div>
          <div class="message-content">${escapeHtml(item.message)}</div>
          <div><button class="btn btn-outline btn-sm reply-btn" data-id="${item.id}">💬 Reply</button></div>
        </div>
      `).join('');
      
      document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.onclick = () => showReplyForm(btn.dataset.id);
      });
      
    } catch(err) {
      console.error('Load messages error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading messages</div>';
    }
  }

  async function showReplyForm(messageId) {
    const replyText = await MODAL.prompt('Reply', 'Enter your reply:', { icon: '💬', placeholder: 'Type here...' });
    if (!replyText) return;
    
    const courseInfo = currentMessageCourse;
    if (!courseInfo) return;
    
    const { courseCode, year, semester, lecId } = courseInfo;
    
    try {
      const message = await DB.get(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`);
      if (message) {
        const replies = message.replies || [];
        replies.push({ senderId: currentStudent.studentId, senderName: currentStudent.name, message: replyText, timestamp: Date.now() });
        await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, { ...message, replies });
        await loadCourseMessages();
        await MODAL.success('Reply Sent', '✅ Reply posted');
      }
    } catch(err) {
      await MODAL.error('Error', 'Failed to send reply');
    }
  }

  async function sendCourseMessage() {
    const messageText = document.getElementById('new-message-text')?.value.trim();
    const courseInfo = currentMessageCourse;
    
    if (!courseInfo) {
      await MODAL.alert('Error', 'Select a course first');
      return;
    }
    if (!messageText) {
      await MODAL.alert('Error', 'Enter a message');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    
    const sendBtn = document.getElementById('send-message-btn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spin"></span> Sending...';
    }
    
    try {
      await DB.set(`messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`, {
        id: messageId, senderId: currentStudent.studentId, senderName: currentStudent.name,
        message: messageText, timestamp: Date.now(), isAnnouncement: false, replies: []
      });
      
      document.getElementById('new-message-text').value = '';
      await loadCourseMessages();
      await MODAL.success('Sent', '✅ Message posted');
      
    } catch(err) {
      await MODAL.error('Error', err.message);
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '📤 Send';
      }
    }
  }

  // ==================== ANNOUNCEMENTS TAB ====================
  async function loadAnnouncementsView() {
    const container = document.getElementById('announcements-view');
    if (!container) return;
    
    const periodCourses = getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    if (periodCourses.length === 0) {
      container.innerHTML = `<div class="inner-panel"><div class="att-empty">📭 No courses found</div></div>`;
      return;
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>📢 Announcements</h3>
        <div class="filter-bar" style="margin-bottom: 16px;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Period</label>
            <select id="announcement-period" class="fi" onchange="STUDENT_DASH.changeAnnouncementPeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First' : 'Second'}
                </option>`;
              }).join('')}
            </select>
          </div>
          <div style="min-width: 250px;">
            <label class="fl">📚 Course</label>
            <select id="announcement-course-select" class="fi" onchange="STUDENT_DASH.loadCourseAnnouncements()">
              <option value="">-- Select --</option>
              ${periodCourses.map(course => `
                <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
                  ${course.courseCode} - ${course.courseName} (${course.lecturerName})
                </option>
              `).join('')}
            </select>
          </div>
          <div><button class="btn btn-outline btn-sm" id="refresh-announcements-btn">🔄 Refresh</button></div>
        </div>
        <div id="announcements-container" style="max-height: 500px; overflow-y: auto;">
          <div class="att-empty">📭 Select a course</div>
        </div>
      </div>
    `;
    
    document.getElementById('refresh-announcements-btn').onclick = () => currentAnnouncementCourse && loadCourseAnnouncements();
  }

  async function changeAnnouncementPeriod() {
    const periodSelect = document.getElementById('announcement-period');
    if (!periodSelect?.value) return;
    
    const [year, semester] = periodSelect.value.split('_');
    currentSelectedYear = parseInt(year);
    currentSelectedSemester = parseInt(semester);
    currentAnnouncementCourse = null;
    
    await loadStudentData();
    
    const periodCourses = getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('announcement-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select --</option>';
      for (const course of periodCourses) {
        courseSelect.innerHTML += `<option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
          ${course.courseCode} - ${course.courseName} (${course.lecturerName})
        </option>`;
      }
    }
    
    document.getElementById('announcements-container').innerHTML = '<div class="att-empty">📭 Select a course</div>';
  }

  async function loadCourseAnnouncements() {
    const courseSelect = document.getElementById('announcement-course-select');
    const container = document.getElementById('announcements-container');
    
    const selectedValue = courseSelect?.value;
    if (!selectedValue) {
      container.innerHTML = '<div class="att-empty">📭 Select a course</div>';
      currentAnnouncementCourse = null;
      return;
    }
    
    const parts = selectedValue.split('_');
    if (parts.length < 4) return;
    
    const courseCode = parts[0];
    const year = parseInt(parts[1]);
    const semester = parseInt(parts[2]);
    const lecId = parts[3];
    
    currentAnnouncementCourse = { courseCode, year, semester, lecId };
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading...</div>';
    
    try {
      const announcements = await DB.get(`announcements/course/${lecId}/${courseCode}_${year}_${semester}`);
      const announcementList = announcements ? Object.values(announcements).sort((a, b) => b.timestamp - a.timestamp) : [];
      
      if (announcementList.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No announcements</div>';
        return;
      }
      
      container.innerHTML = announcementList.map(ann => `
        <div class="message-card" style="border-left: 4px solid ${ann.priority === 'danger' ? '#d42b2b' : (ann.priority === 'warning' ? '#b8860b' : '#003087')}">
          <div class="message-header">
            <div><strong>📢 ${escapeHtml(ann.title)}</strong> <span class="badge">${ann.priority || 'info'}</span></div>
            <span class="note">${formatTime(ann.timestamp)}</span>
          </div>
          <div class="message-content">
            <div><strong>From:</strong> ${escapeHtml(ann.senderName)}</div>
            <hr>
            ${escapeHtml(ann.message)}
          </div>
        </div>
      `).join('');
      
    } catch(err) {
      console.error('Load announcements error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading announcements</div>';
    }
  }

  // ==================== CHECK-IN ====================
  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session || !session.active || Date.now() > session.expiresAt) {
      await MODAL.error('Error', 'Session not available');
      return;
    }
    
    const payload = btoa(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
    })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
    window.location.href = `${CONFIG.SITE_URL}?ci=${payload}`;
  }

  // ==================== PERIOD CHANGE ====================
  async function changePeriod() {
    const select = document.getElementById('overview-year');
    if (select) {
      const [year, semester] = select.value.split('_');
      currentSelectedYear = parseInt(year);
      currentSelectedSemester = parseInt(semester);
      currentFilterCourseKey = null;
      currentFilterLecturer = null;
      currentMessageCourse = null;
      currentAnnouncementCourse = null;
      await loadOverview();
    }
  }

  // ==================== SWITCH TAB ====================
  async function switchTab(tabName) {
    if (tabName !== 'messages') currentMessageCourse = null;
    if (tabName !== 'announcements') currentAnnouncementCourse = null;
    
    document.querySelectorAll('#view-student-dashboard .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) item.classList.add('active');
    });
    
    document.querySelectorAll('#view-student-dashboard .tab-content').forEach(content => content.style.display = 'none');
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) activeContent.style.display = 'block';
    
    const titles = { overview: '📊 Dashboard', calendar: '📅 Schedule', history: '📋 History', messages: '💬 Messages', announcements: '📢 Announcements' };
    const tbTitle = document.getElementById('student-dash-title');
    if (tbTitle && titles[tabName]) tbTitle.textContent = titles[tabName];
    
    if (tabName === 'overview') await loadOverview();
    else if (tabName === 'calendar') await loadCalendarView();
    else if (tabName === 'history') await loadHistoryView();
    else if (tabName === 'messages') await loadMessagesView();
    else if (tabName === 'announcements') await loadAnnouncementsView();
  }

  // ==================== AUTO REFRESH & CLEANUP ====================
  function startAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') loadOverview();
      else if (activeTab === 'calendar-view') loadCalendarView();
      else if (activeTab === 'history-view') loadHistoryView();
      else if (activeTab === 'messages-view' && currentMessageCourse) loadCourseMessages();
      else if (activeTab === 'announcements-view' && currentAnnouncementCourse) loadCourseAnnouncements();
    }, 60000); // Reduced to 60 seconds instead of 30
  }
  
  function stopAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; }
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    if (upcomingCheckInterval) clearInterval(upcomingCheckInterval);
  }
  
  function logout() { stopAutoRefresh(); AUTH.clearSession(); APP.goTo('landing'); }

  return { 
    init, switchTab, loadOverview, loadCalendarView, loadHistoryView, 
    loadMessagesView, loadCourseMessages, changeMessagePeriod,
    loadAnnouncementsView, changeAnnouncementPeriod, loadCourseAnnouncements,
    refreshOverview, sendCourseMessage, showReplyForm, directCheckIn, 
    checkInFromTimetable, changePeriod, changeCalendarPeriod, changeHistoryPeriod,
    filterHistory, exportHistoryToExcel, showTimetableEditor, addTimetableEntry, 
    removeTimetableEntry, showPersonalStudyEditor, addPersonalStudyEntry, 
    editPersonalStudyEntry, removePersonalStudyEntry, logout
  };
})();

window.STUDENT_DASH = STUDENT_DASH;
