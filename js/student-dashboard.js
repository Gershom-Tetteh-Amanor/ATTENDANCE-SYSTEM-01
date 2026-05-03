/* student-dashboard.js — Student Portal with Lecturer-Specific Courses */
'use strict';

const STUDENT_DASH = (() => {
  let activeSessionListener = null;
  let currentStudent = null;
  let refreshInterval = null;
  let currentSelectedYear = null;
  let currentSelectedSemester = null;
  let enrolledCourses = []; // Each entry: { courseCode, lecId, lecturerName, year, semester }
  let allStudentSessions = [];
  let lecturersMap = new Map();
  let timetable = [];
  let personalStudyTimes = [];
  let notificationCheckInterval = null;
  let upcomingCheckInterval = null;
  let currentFilterCourseKey = null; // Store as "courseCode_lecId"
  let currentFilterLecturer = null;
  let currentMessageCourse = null; // Now stores { courseCode, lecId, year, semester }
  let currentAnnouncementCourse = null;
  let activeUpcomingNotifications = new Set();

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

  // Get unique key for course + lecturer combination
  function getCourseKey(courseCode, lecId) {
    return `${courseCode}_${lecId}`;
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
    
    await loadStudentData(); // Loads ONLY lecturer-specific courses student has checked into
    await loadTimetable();
    await loadPersonalStudyTimes();
    await loadOverview();
    startAutoRefresh();
    startNotificationCheck();
    startUpcomingSessionsCheck();
    
    const sidebarName = document.getElementById('student-sidebar-name');
    const sidebarId = document.getElementById('student-sidebar-id');
    const userName = document.getElementById('student-dash-name');
    const userAvatar = document.getElementById('student-avatar');
    
    if (sidebarName) sidebarName.textContent = currentStudent.name || '🎓 Student';
    if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId}`;
    if (userName) userName.textContent = currentStudent.name || currentStudent.email;
    if (userAvatar) userAvatar.textContent = '🎓';
  }

  // FIXED: Load ONLY courses where student has checked in (lecturer-specific)
  async function loadStudentData() {
    try {
      // Get ALL sessions from database
      const allSessions = await DB.SESSION.getAll();
      
      // Track unique (courseCode + lecId) combinations the student has checked into
      const uniqueCourseLecturerMap = new Map(); // key: "courseCode_lecId" -> { courseCode, lecId, courseName, year, semester, lecturerName }
      
      for (const session of allSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          const hasStudentCheckin = records.some(r => 
            r.studentId && r.studentId.toUpperCase() === currentStudent.studentId.toUpperCase()
          );
          
          if (hasStudentCheckin) {
            const key = getCourseKey(session.courseCode, session.lecFbId);
            
            if (!uniqueCourseLecturerMap.has(key)) {
              // Get lecturer info
              let lecturerName = session.lecturer || 'Unknown Lecturer';
              try {
                const lecturer = await DB.LEC.get(session.lecFbId);
                if (lecturer && lecturer.name) {
                  lecturerName = lecturer.name;
                }
                lecturersMap.set(session.lecFbId, { 
                  name: lecturerName,
                  id: session.lecFbId,
                  lat: lecturer?.lastLocation?.lat || null,
                  lng: lecturer?.lastLocation?.lng || null
                });
              } catch(e) {
                console.warn('Could not fetch lecturer:', session.lecFbId);
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
      }
      
      // Convert map to array
      enrolledCourses = Array.from(uniqueCourseLecturerMap.values());
      
      // Store all student sessions for reference
      allStudentSessions = [];
      for (const session of allSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          const hasStudentCheckin = records.some(r => 
            r.studentId && r.studentId.toUpperCase() === currentStudent.studentId.toUpperCase()
          );
          if (hasStudentCheckin) {
            allStudentSessions.push(session);
          }
        }
      }
      
      // Get available periods from actual check-ins
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
      
      console.log('[STUDENT_DASH] Loaded', enrolledCourses.length, 'lecturer-specific courses');
      enrolledCourses.forEach(c => {
        console.log(`  - ${c.courseCode} with ${c.lecturerName} (${c.lecId})`);
      });
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Load error:', err); 
      enrolledCourses = []; 
    }
  }

  function getCoursesForCurrentPeriod() {
    // Returns lecturer-specific courses for the selected period
    return enrolledCourses.filter(c => c.year === currentSelectedYear && c.semester === currentSelectedSemester);
  }

  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await DB.SESSION.getAll();
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    // Only include sessions where student has checked in AND matches the exact course+lecturer
    let sessions = [];
    for (const session of allSessions) {
      const sessionKey = getCourseKey(session.courseCode, session.lecFbId);
      const isEnrolled = enrolledKeys.has(sessionKey);
      
      if (isEnrolled && session.year === currentSelectedYear && session.semester === currentSelectedSemester) {
        // Check if student actually attended this specific session
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        
        // Only include sessions that were held (whether student attended or not)
        // We want to show ALL sessions for the course, not just attended ones
        sessions.push({
          ...session,
          attended: attended,
          myRecord: records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())
        });
      }
    }
    
    return sessions;
  }

  // ==================== UPCOMING SESSIONS CHECK ====================
  function startUpcomingSessionsCheck() {
    if (upcomingCheckInterval) clearInterval(upcomingCheckInterval);
    upcomingCheckInterval = setInterval(async () => {
      await checkUpcomingSessions();
    }, 60000);
  }
  
  async function checkUpcomingSessions() {
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
            body: `Starts at ${entry.startTime} in ${minutesUntil} minutes. Don't be late!`,
            icon: "/uo_ghana.png",
            tag: entryId
          });
        }
        
        if (typeof NOTIFICATIONS !== 'undefined') {
          await NOTIFICATIONS.add({
            title: `⏰ Upcoming Class: ${entry.courseCode}`,
            message: `Starts at ${entry.startTime} (in ${minutesUntil} minutes). Lecturer: ${entry.lecturerName}`,
            type: 'warning',
            link: null
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
    
    for (const entry of personalStudyTimes) {
      if (entry.day !== currentDay) continue;
      
      const [startHour, startMin] = entry.startTime.split(':').map(Number);
      const entryStartMinutes = startHour * 60 + startMin;
      const minutesUntil = entryStartMinutes - currentMinutes;
      const entryId = `study_${entry.title}_${entry.day}_${entry.startTime}`;
      
      if (minutesUntil <= 30 && minutesUntil > 0 && !activeUpcomingNotifications.has(entryId)) {
        activeUpcomingNotifications.add(entryId);
        
        if (Notification.permission === "granted") {
          new Notification(`📖 Upcoming Study: ${entry.title}`, {
            body: `Starts at ${entry.startTime} in ${minutesUntil} minutes. ${entry.location || 'Get ready!'}`,
            icon: "/uo_ghana.png",
            tag: entryId
          });
        }
        
        if (typeof NOTIFICATIONS !== 'undefined') {
          await NOTIFICATIONS.add({
            title: `⏰ Upcoming Study: ${entry.title}`,
            message: `Starts at ${entry.startTime} (in ${minutesUntil} minutes). ${entry.location || 'Get ready!'}`,
            type: 'info',
            link: null
          });
        }
        
        setTimeout(() => {
          activeUpcomingNotifications.delete(entryId);
        }, minutesUntil * 60 * 1000);
      }
    }
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
          <button class="btn btn-secondary" onclick="STUDENT_DASH.showTimetableEditor()">✏️ Edit Class Timetable</button>
        </div>
        <div>
          <button class="btn btn-teal" onclick="STUDENT_DASH.showPersonalStudyEditor()">📚 Edit Personal Study Time</button>
        </div>
      </div>
      
      ${upcomingSessions.length > 0 ? `
        <div class="alert-card warning" style="margin-bottom: 20px; background: var(--amber-s); border-left: 4px solid var(--amber);">
          <strong>⏰ Upcoming Sessions (Next 30 minutes):</strong>
          ${upcomingSessions.map(session => `
            <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <span>📚 ${session.courseCode} with ${session.lecturerName} at ${session.startTime} (in ${session.minutesUntil} minutes)</span>
              <button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.checkInFromTimetable('${session.courseCode}', '${session.lecId}')" style="margin-left: 10px;">✓ Check In Now</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="dash-section">
        <h3>📅 My Weekly Schedule</h3>
        <div class="timetable-grid" style="overflow-x: auto; position: relative;">
          <table style="width: 100%; border-collapse: collapse; min-width: 700px;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 12px; width: 80px;">Time</th>
                ${days.map(day => `<th style="padding: 12px;">${day}</th>`).join('')}
              </table>
            </thead>
            <tbody>
              ${timeSlots.map(timeSlot => {
                return `
                  <tr>
                    <td style="padding: 8px; border: 1px solid var(--border); font-weight: 600; background: var(--surface2);">${timeSlot}</td>
                    ${days.map(day => {
                      const classEntry = timetable.find(t => t.day === day && t.startTime === timeSlot);
                      const studyEntry = personalStudyTimes.find(p => p.day === day && p.startTime === timeSlot);
                      
                      if (classEntry) {
                        const course = periodCourses.find(c => c.courseCode === classEntry.courseCode && c.lecId === classEntry.lecId);
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const [startHour, startMin] = classEntry.startTime.split(':').map(Number);
                        const entryStartMinutes = startHour * 60 + startMin;
                        const isLive = classEntry.day === getCurrentDay() && Math.abs(entryStartMinutes - currentMinutes) <= 60;
                        const isUpcoming = classEntry.day === getCurrentDay() && entryStartMinutes > currentMinutes && entryStartMinutes - currentMinutes <= 30;
                        
                        const [endHour, endMin] = classEntry.endTime.split(':').map(Number);
                        const startMinutes = startHour * 60 + startMin;
                        const endMinutes = endHour * 60 + endMin;
                        const durationSlots = Math.ceil((endMinutes - startMinutes) / 30);
                        const rowspan = Math.max(1, durationSlots);
                        
                        const timeSlotMinutes = parseInt(timeSlot.split(':')[0]) * 60 + parseInt(timeSlot.split(':')[1]);
                        if (timeSlotMinutes !== startMinutes) return null;
                        
                        return `
                          <td rowspan="${rowspan}" style="padding: 8px; border: 1px solid var(--border); background: ${isLive ? 'var(--teal-l)' : (isUpcoming ? 'var(--amber-s)' : 'var(--primary-s)')}; vertical-align: top;">
                            <div><strong>📚 ${escapeHtml(classEntry.courseCode)}</strong></div>
                            <div style="font-size: 11px;">${escapeHtml(course?.courseName || '')}</div>
                            <div style="font-size: 10px;">👨‍🏫 ${escapeHtml(classEntry.lecturerName)}</div>
                            <div style="font-size: 10px;">⏰ ${classEntry.startTime} - ${classEntry.endTime}</div>
                            <div style="font-size: 10px;">📍 ${escapeHtml(classEntry.location || 'Classroom')}</div>
                            ${isLive ? `<span class="badge" style="background: #1d9e75; margin-top: 4px;">🔴 LIVE</span>` : ''}
                            ${isUpcoming ? `<span class="badge" style="background: var(--amber); margin-top: 4px;">⏰ UPCOMING</span>` : ''}
                            <button class="btn btn-outline btn-sm" style="margin-top: 6px; width: 100%;" onclick="STUDENT_DASH.checkInFromTimetable('${classEntry.courseCode}', '${classEntry.lecId}')">✓ Check In</button>
                          </td>
                        `;
                      } else if (studyEntry) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const [startHour, startMin] = studyEntry.startTime.split(':').map(Number);
                        const entryStartMinutes = startHour * 60 + startMin;
                        const isOngoing = studyEntry.day === getCurrentDay() && Math.abs(entryStartMinutes - currentMinutes) <= 60;
                        const isUpcoming = studyEntry.day === getCurrentDay() && entryStartMinutes > currentMinutes && entryStartMinutes - currentMinutes <= 30;
                        
                        const [endHour, endMin] = studyEntry.endTime.split(':').map(Number);
                        const startMinutes = startHour * 60 + startMin;
                        const endMinutes = endHour * 60 + endMin;
                        const durationSlots = Math.ceil((endMinutes - startMinutes) / 30);
                        const rowspan = Math.max(1, durationSlots);
                        
                        const timeSlotMinutes = parseInt(timeSlot.split(':')[0]) * 60 + parseInt(timeSlot.split(':')[1]);
                        if (timeSlotMinutes !== startMinutes) return null;
                        
                        return `
                          <td rowspan="${rowspan}" style="padding: 8px; border: 1px solid var(--border); background: ${isOngoing ? 'var(--green-s)' : (isUpcoming ? 'var(--amber-s)' : 'var(--surface2)')}; border-left: 3px solid var(--teal); vertical-align: top;">
                            <div><strong>📖 ${escapeHtml(studyEntry.title || 'Personal Study')}</strong></div>
                            <div style="font-size: 11px;">${escapeHtml(studyEntry.description || 'Self-study session')}</div>
                            <div style="font-size: 10px;">⏰ ${studyEntry.startTime} - ${studyEntry.endTime}</div>
                            ${isOngoing ? `<span class="badge" style="background: var(--teal); margin-top: 4px;">🟢 ONGOING</span>` : ''}
                            ${isUpcoming ? `<span class="badge" style="background: var(--amber); margin-top: 4px;">⏰ UPCOMING</span>` : ''}
                            <div style="font-size: 10px; color: var(--text4); margin-top: 4px;">📍 ${studyEntry.location || 'Self-study'}</div>
                          </td>
                        `;
                      }
                      return `<td style="padding: 8px; border: 1px solid var(--border); color: var(--text4); text-align: center; background: var(--surface);">—</td>`;
                    }).filter(td => td !== null).join('')}
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
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${entry.startTime} - ${entry.endTime}</div>
              <div>📖 <strong>${escapeHtml(entry.title || 'Personal Study')}</strong></div>
              <div>📍 ${escapeHtml(entry.location || 'Self-study')}</div>
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
      entriesHtml = '<div class="no-rec">📭 No personal study times added. Add your study schedule above.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Personal Study Time</h4>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="personal-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="personal-title" class="fi" placeholder="e.g., Math Review, Programming Practice"></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start Time</label><select id="personal-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">⏰ End Time</label><select id="personal-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">📍 Location</label><input type="text" id="personal-location" class="fi" placeholder="e.g., Library, Hall, Online"></div>
            <div class="field"><label class="fl">🎯 Priority</label><select id="personal-priority" class="fi">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select></div>
          </div>
          <div class="field">
            <label class="fl">📝 Description (Optional)</label>
            <textarea id="personal-description" class="fi" rows="2" placeholder="What will you study?"></textarea>
          </div>
          <button class="btn btn-teal" onclick="STUDENT_DASH.addPersonalStudyEntry()">✅ Add Personal Study Time</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>📋 Current Personal Study Schedule</h4>
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
    const priority = document.getElementById('personal-priority')?.value;
    const description = document.getElementById('personal-description')?.value.trim();
    
    if (!day || !startTime || !endTime) {
      await MODAL.alert('Missing Info', '⚠️ Please fill in day and time.');
      return;
    }
    
    if (!title) {
      await MODAL.alert('Missing Info', '⚠️ Please enter a study title.');
      return;
    }
    
    const overlappingClass = timetable.find(t => 
      t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );
    
    if (overlappingClass) {
      const overlapWarning = await MODAL.confirm(
        'Time Conflict Detected',
        `This study time overlaps with ${overlappingClass.courseCode} (${overlappingClass.startTime} - ${overlappingClass.endTime}). Continue anyway?`,
        { confirmLabel: 'Yes, Add Anyway', confirmCls: 'btn-warning' }
      );
      if (!overlapWarning) return;
    }
    
    personalStudyTimes.push({ 
      day, startTime, endTime, title, location, priority, description,
      type: 'personal',
      createdAt: Date.now()
    });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
    personalStudyTimes.sort((a, b) => {
      if (daysOrder[a.day] !== daysOrder[b.day]) return daysOrder[a.day] - daysOrder[b.day];
      return a.startTime.localeCompare(b.startTime);
    });
    
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Added', '✅ Personal study time added to your schedule.');
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
          <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="edit-personal-title" class="fi" value="${escapeHtml(entry.title)}"></div>
        </div>
        <div class="two-col">
          <div class="field"><label class="fl">⏰ Start Time</label><select id="edit-personal-start" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.startTime ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label class="fl">⏰ End Time</label><select id="edit-personal-end" class="fi">${timeSlots.map(t => `<option value="${t}" ${t === entry.endTime ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>
        <div class="two-col">
          <div class="field"><label class="fl">📍 Location</label><input type="text" id="edit-personal-location" class="fi" value="${escapeHtml(entry.location || '')}"></div>
          <div class="field"><label class="fl">🎯 Priority</label><select id="edit-personal-priority" class="fi">
            <option value="normal" ${entry.priority === 'normal' ? 'selected' : ''}>Normal</option>
            <option value="important" ${entry.priority === 'important' ? 'selected' : ''}>Important</option>
            <option value="urgent" ${entry.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
          </select></div>
        </div>
        <div class="field">
          <label class="fl">📝 Description</label>
          <textarea id="edit-personal-description" class="fi" rows="2">${escapeHtml(entry.description || '')}</textarea>
        </div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('✏️ Edit Personal Study Time', modalContent, { confirmLabel: 'Save Changes', cancelLabel: 'Cancel' });
    if (!confirmed) return;
    
    const newDay = document.getElementById('edit-personal-day')?.value;
    const newStartTime = document.getElementById('edit-personal-start')?.value;
    const newEndTime = document.getElementById('edit-personal-end')?.value;
    const newTitle = document.getElementById('edit-personal-title')?.value.trim();
    const newLocation = document.getElementById('edit-personal-location')?.value.trim();
    const newPriority = document.getElementById('edit-personal-priority')?.value;
    const newDescription = document.getElementById('edit-personal-description')?.value.trim();
    
    if (!newTitle) {
      await MODAL.alert('Missing Info', '⚠️ Please enter a study title.');
      return;
    }
    
    personalStudyTimes[index] = {
      ...entry,
      day: newDay,
      startTime: newStartTime,
      endTime: newEndTime,
      title: newTitle,
      location: newLocation,
      priority: newPriority,
      description: newDescription,
      updatedAt: Date.now()
    };
    
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Updated', '✅ Personal study time updated.');
  }

  async function removePersonalStudyEntry(index) {
    const confirmed = await MODAL.confirm('Remove Study Time', 'Remove this personal study time from your schedule?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    personalStudyTimes.splice(index, 1);
    await savePersonalStudyTimes();
    await MODAL.close();
    await showPersonalStudyEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Personal study time removed.');
  }

  // ==================== CLASS TIMETABLE EDITOR ====================
  async function showTimetableEditor() {
    const periodCourses = getCoursesForCurrentPeriod();
    const availableCourses = periodCourses.map(c => ({ 
      code: c.courseCode, 
      name: c.courseName, 
      lecturer: c.lecturerName, 
      lecId: c.lecId, 
      location: c.location || 'Classroom' 
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
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${entry.startTime} - ${entry.endTime}</div>
              <div>📚 <strong>${escapeHtml(entry.courseCode)}</strong> - ${escapeHtml(entry.courseName)} (${escapeHtml(entry.lecturerName)})</div>
              <div>📍 ${escapeHtml(entry.location || 'Classroom')}</div>
              <button class="btn btn-danger btn-sm" onclick="STUDENT_DASH.removeTimetableEntry(${index})">🗑️ Remove</button>
            </div>
          </div>
        `;
      });
      entriesHtml += `</div>`;
    } else {
      entriesHtml = '<div class="no-rec">📭 No class entries yet. Add your course schedule above.</div>';
    }
    
    const modalContent = `
      <div style="max-height: 500px; overflow-y: auto;">
        <div class="timetable-editor">
          <h4>➕ Add Class Timetable Entry</h4>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="timetable-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📚 Course</label><select id="timetable-course" class="fi">
              <option value="">Select Course</option>
              ${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}|${c.location}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}
            </select></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start Time</label><select id="timetable-start" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">⏰ End Time</label><select id="timetable-end" class="fi">${timeSlots.map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
          </div>
          <div class="field">
            <label class="fl">📍 Location</label>
            <input type="text" id="timetable-location" class="fi" placeholder="e.g., JQB 3, Online, etc.">
          </div>
          <button class="btn btn-ug" onclick="STUDENT_DASH.addTimetableEntry()">✅ Add to Timetable</button>
        </div>
        <div class="timetable-editor" style="margin-top: 20px;">
          <h4>📋 Current Class Timetable</h4>
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
      const replace = await MODAL.confirm(
        'Time Conflict Detected',
        `This time overlaps with ${overlappingClass.courseCode} (${overlappingClass.startTime} - ${overlappingClass.endTime}). Replace it?`,
        { confirmLabel: 'Replace' }
      );
      if (!replace) return;
      
      const overlappingIndex = timetable.findIndex(t => 
        t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
      );
      if (overlappingIndex !== -1) timetable.splice(overlappingIndex, 1);
    }
    
    const overlappingStudy = personalStudyTimes.find(p => 
      p.day === day && doTimesOverlap(startTime, endTime, p.startTime, p.endTime)
    );
    
    if (overlappingStudy) {
      const proceed = await MODAL.confirm(
        'Personal Study Conflict',
        `This time overlaps with your personal study "${overlappingStudy.title}". Add class anyway?`,
        { confirmLabel: 'Yes, Add Class', confirmCls: 'btn-warning' }
      );
      if (!proceed) return;
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
    await MODAL.success('Added', '✅ Class timetable entry added.');
  }

  async function removeTimetableEntry(index) {
    timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Timetable entry removed.');
  }

  async function checkInFromTimetable(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    // Find active session for this specific course AND specific lecturer
    const activeSession = allActiveSessions.find(s => 
      s.courseCode === courseCode && s.lecFbId === lecId && s.active === true
    );
    
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode} with your lecturer.`);
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
        const unreadCount = upcomingEntries.length;
        const badge = document.querySelector('.notification-badge');
        if (badge && unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
          badge.style.display = 'block';
        }
        
        const calendarView = document.getElementById('calendar-view');
        if (calendarView && calendarView.style.display !== 'none') {
          await loadCalendarView();
        }
      }
    }, 60000);
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
      
      const allActiveSessions = await DB.SESSION.getAll();
      const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
      const activeSessions = allActiveSessions.filter(s => 
        s.active === true && enrolledKeys.has(getCourseKey(s.courseCode, s.lecFbId))
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
          const course = periodCourses.find(c => c.courseCode === session.courseCode && c.lecId === session.lecFbId);
          
          let mapsUrl = null;
          if (course && course.lecturerLat && course.lecturerLng) {
            mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${course.lecturerLat},${course.lecturerLng}`;
          } else if (session.lat && session.lng) {
            mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${session.lat},${session.lng}`;
          }
          
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
                <span>📍 ${escapeHtml(course?.location || 'Classroom')}</span>
                <span>👨‍🏫 ${escapeHtml(course?.lecturerName || session.lecturer || 'Unknown')}</span>
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
          <div>
            <button class="btn btn-outline btn-sm" onclick="STUDENT_DASH.refreshOverview()">🔄 Refresh</button>
          </div>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${periodCourses.length}</div><div class="stat-label">📚 Total Courses</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--teal);">${goodCourses.length}</div><div class="stat-label">✅ Good Standing</div><div style="font-size: 10px;">${goodCourses.map(c => `${c.courseCode} (${c.lecturerName})`).join(', ')}</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--amber);">${warningCourses.length}</div><div class="stat-label">⚠️ Approaching Threshold</div><div style="font-size: 10px;">${warningCourses.map(c => `${c.courseCode} (${c.lecturerName})`).join(', ')}</div></div>
          <div class="stat-card"><div class="stat-value" style="color: var(--danger);">${criticalCourses.length}</div><div class="stat-label">❌ At Risk</div><div style="font-size: 10px;">${criticalCourses.map(c => `${c.courseCode} (${c.lecturerName})`).join(', ')}</div></div>
        </div>
        
        ${criticalCourses.map(course => `
          <div class="alert-card warning">
            <strong>❌ ${course.risk.text}</strong> — ${course.courseCode} with ${course.lecturerName}: ${course.percentage}% (${course.attended}/${course.total}). Minimum 75%.
          </div>
        `).join('')}
        ${warningCourses.map(course => `
          <div class="alert-card" style="background: var(--amber-s);">
            <strong>⚠️ ${course.risk.text}</strong> — ${course.courseCode} with ${course.lecturerName}: ${course.percentage}% (${course.attended}/${course.total}). 1 more absence = at risk.
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
                <div class="course-name">${escapeHtml(course.courseName)}</div>
                <div class="course-stats">
                  <span>👨‍🏫 ${escapeHtml(course.lecturerName)}</span>
                  <span>📍 ${escapeHtml(course.location || 'Classroom')}</span>
                </div>
                <div class="course-stats">
                  <span>${course.attended} of ${course.total} sessions attended</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${course.percentage}%; background: ${course.risk.color};"></div>
                </div>
                <div style="font-size: 12px; color: ${course.risk.color};">${course.percentage}% ${course.risk.level === 'critical' ? '⚠️ Attend next sessions' : (course.risk.level === 'warning' ? '⚠️ 1 more = at risk' : '✅ Keep it up!')}</div>
              </div>
            `).join('')}
          </div>
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

  // ==================== HISTORY TAB (Lecturer-specific courses only) ====================

  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    // Get lecturer-specific courses the student has checked into
    const periodCourses = getCoursesForCurrentPeriod();
    
    // Get available periods from actual check-ins
    const availablePeriods = [...new Set(enrolledCourses.map(c => `${c.year}_${c.semester}`))]
      .sort((a, b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      });
    
    // Get unique lecturers from enrolled courses
    const availableLecturers = [...new Map(periodCourses.map(c => [c.lecId, c.lecturerName]))].map(([id, name]) => ({ id, name }));
    
    // Get unique course+lecturer combinations
    const availableCourses = periodCourses.map(c => ({ 
      key: getCourseKey(c.courseCode, c.lecId),
      code: c.courseCode, 
      name: c.courseName, 
      lecId: c.lecId,
      lecturerName: c.lecturerName 
    }));
    
    // Get ALL sessions from database
    const allSessions = await DB.SESSION.getAll();
    
    // Only include sessions that match the student's enrolled course+lecturer combinations
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    let filteredSessions = [];
    for (const session of allSessions) {
      const sessionKey = getCourseKey(session.courseCode, session.lecFbId);
      const isEnrolled = enrolledKeys.has(sessionKey);
      
      if (isEnrolled && session.year === currentSelectedYear && session.semester === currentSelectedSemester) {
        // Check if student attended this specific session
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
        
        filteredSessions.push({
          ...session,
          attended: attended,
          myRecord: records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase())
        });
      }
    }
    
    // Apply additional filters if selected
    if (currentFilterCourseKey) {
      filteredSessions = filteredSessions.filter(s => getCourseKey(s.courseCode, s.lecFbId) === currentFilterCourseKey);
    }
    if (currentFilterLecturer) {
      filteredSessions = filteredSessions.filter(s => s.lecFbId === currentFilterLecturer);
    }
    
    // Sort by date (newest first)
    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Build the HTML
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div><label class="fl">📅 Academic Period</label>
          <select id="history-period" class="fi" onchange="STUDENT_DASH.changeHistoryPeriod()">
            <option value="">Select Period</option>
            ${availablePeriods.map(p => { 
              const [year, semester] = p.split('_'); 
              return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
              </option>`;
            }).join('')}
          </select>
        </div>
        <div><label class="fl">📚 Course & Lecturer</label>
          <select id="history-course" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All Courses</option>
            ${availableCourses.map(c => `<option value="${c.key}" ${currentFilterCourseKey === c.key ? 'selected' : ''}>
              ${c.code} - ${c.name} (${c.lecturerName})
            </option>`).join('')}
          </select>
        </div>
        <div><label class="fl">👨‍🏫 Lecturer</label>
          <select id="history-lecturer" class="fi" onchange="STUDENT_DASH.filterHistory()">
            <option value="">All Lecturers</option>
            ${availableLecturers.map(l => `<option value="${l.id}" ${currentFilterLecturer === l.id ? 'selected' : ''}>
              ${escapeHtml(l.name)}
            </option>`).join('')}
          </select>
        </div>
        <div><button class="btn btn-secondary" onclick="STUDENT_DASH.exportHistoryToExcel()">📥 Export Excel</button></div>
      </div>
      ${filteredSessions.length === 0 ? 
        '<div class="no-rec">📭 No sessions found for the selected period.</div>' : 
        `<div class="courses-grid">
          ${filteredSessions.map(session => {
            const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
            const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
            
            return `
              <div class="course-card">
                <div class="course-header">
                  <span class="course-code">📅 ${session.date}</span>
                  <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">
                    ${session.attended ? '✅ Present' : '❌ Absent'}
                  </span>
                </div>
                <div class="course-name">📚 ${escapeHtml(session.courseCode)} - ${escapeHtml(session.courseName || 'Course')}</div>
                <div class="course-stats">
                  <span>👨‍🏫 ${escapeHtml(lecturerName)}</span>
                  ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
                  ${session.attended && session.myRecord?.authMethod === 'webauthn' ? '<span>🔐 Biometric</span>' : ''}
                  ${session.attended && session.myRecord?.authMethod === 'manual' ? '<span>📝 Manual</span>' : ''}
                </div>
                ${!session.attended ? 
                  `<div class="course-stats" style="color: var(--danger); font-size: 11px;">
                    ⚠️ You were absent for this session
                  </div>` : ''
                }
              </div>
            `;
          }).join('')}
        </div>`
      }
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
      await MODAL.alert('Library Error', 'Excel export not loaded.');
      return;
    }
    
    // Get lecturer-specific courses
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    const allSessions = await DB.SESSION.getAll();
    
    // Filter sessions based on enrollments
    let filteredSessions = [];
    for (const session of allSessions) {
      const isEnrolled = enrolledKeys.has(getCourseKey(session.courseCode, session.lecFbId));
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
    
    const wsData = [
      ['📋 Attendance History Report'],
      [`🎓 Student: ${currentStudent.name} (${currentStudent.studentId})`],
      [`📅 Period: ${currentSelectedYear} - ${currentSelectedSemester === 1 ? 'First Semester' : 'Second Semester'}`],
      [`📆 Generated: ${new Date().toLocaleString()}`],
      [],
      ['#', 'Date', 'Course Code', 'Course Name', 'Lecturer', 'Status', 'Check-in Time', 'Method']
    ];
    
    let i = 1;
    for (const session of filteredSessions) {
      const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
      const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
      
      wsData.push([
        i++,
        session.date,
        session.courseCode,
        session.courseName || '',
        lecturerName,
        session.attended ? 'Present' : 'Absent',
        session.myRecord?.time || '—',
        session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—')
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${currentStudent.studentId}`);
    XLSX.writeFile(wb, `UG_Attendance_${currentStudent.studentId}_${currentSelectedYear}_Sem${currentSelectedSemester}.xlsx`);
    await MODAL.success('Export Complete', '✅ Attendance history exported.');
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
      container.innerHTML = `
        <div class="inner-panel">
          <h3>💬 Course Messages</h3>
          <p class="sub">Discuss with your classmates and lecturers</p>
          <div class="att-empty">📭 No courses found. Check in to a session first to see course messages.</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages</h3>
        <p class="sub">Discuss with your classmates and lecturers</p>
        <div class="filter-bar" style="margin-bottom: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px;">
            <label class="fl">📅 Academic Period</label>
            <select id="message-period" class="fi" onchange="STUDENT_DASH.changeMessagePeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
                </option>`;
              }).join('')}
            </select>
          </div>
          <div style="flex: 2; min-width: 250px;">
            <label class="fl">📚 Course</label>
            <select id="message-course-select" class="fi" onchange="STUDENT_DASH.loadCourseMessages()">
              <option value="">-- Select a course --</option>
              ${periodCourses.map(course => `
                <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
                  ${course.courseCode} - ${course.courseName} (${course.lecturerName})
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <button class="btn btn-outline btn-sm" id="refresh-messages-btn">🔄 Refresh</button>
          </div>
        </div>
        <div id="course-messages-container" style="margin-top: 20px; max-height: 500px; overflow-y: auto;">
          <div class="att-empty">📭 Select a course to view messages</div>
        </div>
        <div id="message-input-area" style="display: none; margin-top: 20px; width: 100%;">
          <div class="message-input-container" style="width: 100%; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
            <textarea id="new-message-text" class="fi" placeholder="Type your message here..." rows="4" style="width: 100%; resize: vertical; margin-bottom: 12px; font-family: inherit; padding: 12px; font-size: 14px; line-height: 1.5; border-radius: 8px; border: 1.5px solid var(--border2); background: var(--surface); color: var(--text);"></textarea>
            <div style="display: flex; justify-content: flex-end;">
              <button class="btn btn-ug" id="send-message-btn" style="padding: 10px 24px; white-space: nowrap; font-weight: 600;">📤 Send Message</button>
            </div>
            <p class="note" style="margin-top: 12px; font-size: 12px; text-align: left; margin-bottom: 0;">💡 Your message will be visible to all students enrolled in this course and the lecturer. Press Ctrl+Enter to send.</p>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('refresh-messages-btn').onclick = () => {
      if (currentMessageCourse) {
        loadCourseMessages();
      }
    };
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
    if (!periodSelect || !periodSelect.value) return;
    
    const [year, semester] = periodSelect.value.split('_');
    currentSelectedYear = parseInt(year);
    currentSelectedSemester = parseInt(semester);
    currentMessageCourse = null;
    
    await loadStudentData();
    
    const periodCourses = getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('message-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select a course --</option>';
      for (const course of periodCourses) {
        courseSelect.innerHTML += `
          <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
            ${course.courseCode} - ${course.courseName} (${course.lecturerName})
          </option>
        `;
      }
    }
    
    document.getElementById('course-messages-container').innerHTML = '<div class="att-empty">📭 Select a course to view messages</div>';
    document.getElementById('message-input-area').style.display = 'none';
  }

  async function loadCourseMessages() {
    const courseSelect = document.getElementById('message-course-select');
    const container = document.getElementById('course-messages-container');
    const inputArea = document.getElementById('message-input-area');
    
    if (!courseSelect || !container) return;
    
    const selectedValue = courseSelect.value;
    if (!selectedValue || selectedValue === '') {
      container.innerHTML = '<div class="att-empty">📭 Select a course to view messages</div>';
      if (inputArea) inputArea.style.display = 'none';
      currentMessageCourse = null;
      return;
    }
    
    const parts = selectedValue.split('_');
    if (parts.length < 4) {
      container.innerHTML = '<div class="att-empty">❌ Invalid course selection.</div>';
      if (inputArea) inputArea.style.display = 'none';
      currentMessageCourse = null;
      return;
    }
    
    const courseCode = parts[0];
    const year = parseInt(parts[1]);
    const semester = parseInt(parts[2]);
    const lecId = parts[3];
    
    if (!courseCode || !year || !semester || !lecId) {
      container.innerHTML = '<div class="att-empty">❌ Invalid course data.</div>';
      if (inputArea) inputArea.style.display = 'none';
      currentMessageCourse = null;
      return;
    }
    
    currentMessageCourse = { courseCode, year, semester, lecId };
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading messages...</div>';
    if (inputArea) inputArea.style.display = 'block';
    
    try {
      const messagesPath = `messages/course/${lecId}/${courseCode}_${year}_${semester}`;
      const messages = await DB.get(messagesPath);
      
      let allItems = [];
      if (messages && Object.keys(messages).length > 0) {
        allItems = Object.values(messages);
      }
      
      if (allItems.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No messages yet. Be the first to send a message!</div>';
        return;
      }
      
      allItems.sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = allItems.map(item => `
        <div class="message-card" style="margin-bottom: 16px; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border);">
          <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div>
              <strong style="color: var(--ug);">${escapeHtml(item.senderName)}</strong>
              ${item.senderId === lecId ? '<span class="badge" style="margin-left: 8px; background: var(--ug);">👨‍🏫 Lecturer</span>' : ''}
            </div>
            <span style="font-size: 11px; color: var(--text4);">${formatTime(item.timestamp)}</span>
          </div>
          <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px; line-height: 1.6; word-wrap: break-word;">
            ${escapeHtml(item.message)}
          </div>
          ${item.replies && item.replies.length > 0 ? `
            <div style="margin-top: 12px; padding-left: 16px; border-left: 2px solid var(--border);">
              <div style="font-size: 12px; color: var(--text3); margin-bottom: 8px;">💬 ${item.replies.length} repl${item.replies.length === 1 ? 'y' : 'ies'}</div>
              ${item.replies.slice(-3).map(reply => `
                <div style="font-size: 12px; margin-bottom: 8px; background: var(--surface2); padding: 8px; border-radius: 8px;">
                  <strong>${reply.senderName === currentStudent.name ? '👤 You' : escapeHtml(reply.senderName)}</strong>
                  <span style="font-size: 10px; color: var(--text4); margin-left: 8px;">${formatTime(reply.timestamp)}</span>
                  <div style="margin-top: 4px;">${escapeHtml(reply.message)}</div>
                </div>
              `).join('')}
              ${item.replies.length > 3 ? `<div style="font-size: 11px; color: var(--text4); text-align: center;">... and ${item.replies.length - 3} more replies</div>` : ''}
            </div>
          ` : ''}
          <div style="margin-top: 12px;">
            <button class="btn btn-outline btn-sm reply-btn" data-id="${item.id}">💬 Reply</button>
          </div>
        </div>
      `).join('');
      
      document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.onclick = () => showReplyForm(btn.getAttribute('data-id'));
      });
      
    } catch(err) {
      console.error('[STUDENT_DASH] Load messages error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading messages.</div>';
    }
  }

  async function showReplyForm(messageId) {
    const replyText = await MODAL.prompt(
      'Reply to Message',
      'Enter your reply:',
      { icon: '💬', placeholder: 'Type your reply here...', confirmLabel: 'Send Reply' }
    );
    
    if (!replyText) return;
    
    const courseInfo = currentMessageCourse;
    if (!courseInfo) {
      await MODAL.alert('Error', 'Course information not found.');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    
    MODAL.loading('Sending reply...');
    
    try {
      const messagePath = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
      const message = await DB.get(messagePath);
      
      if (!message) {
        MODAL.close();
        await MODAL.alert('Error', 'Message not found.');
        return;
      }
      
      const replies = message.replies || [];
      replies.push({
        senderId: currentStudent.studentId,
        senderName: currentStudent.name,
        message: replyText,
        timestamp: Date.now()
      });
      
      await DB.set(messagePath, { ...message, replies });
      
      MODAL.close();
      await loadCourseMessages();
      await MODAL.success('Reply Sent', '✅ Your reply has been posted.');
      
    } catch(err) {
      console.error('[STUDENT_DASH] Reply error:', err);
      MODAL.close();
      await MODAL.error('Error', 'Failed to send reply. Please try again.');
    }
  }

  async function sendCourseMessage() {
    const messageText = document.getElementById('new-message-text')?.value.trim();
    const courseInfo = currentMessageCourse;
    
    if (!courseInfo) {
      await MODAL.alert('No Course Selected', '⚠️ Please select a course from the dropdown first.');
      return;
    }
    
    if (!messageText) {
      await MODAL.alert('No Message', '⚠️ Please enter a message.');
      return;
    }
    
    const { courseCode, year, semester, lecId } = courseInfo;
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const timestamp = Date.now();
    
    const sendBtn = document.getElementById('send-message-btn');
    const originalBtnText = sendBtn?.textContent;
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="spin"></span> Sending...';
    }
    
    try {
      const messageData = {
        id: messageId,
        senderId: currentStudent.studentId,
        senderName: currentStudent.name,
        message: messageText,
        timestamp: timestamp,
        isAnnouncement: false,
        replies: []
      };
      
      const messagePath = `messages/course/${lecId}/${courseCode}_${year}_${semester}/${messageId}`;
      await DB.set(messagePath, messageData);
      
      await DB.set(`notifications/lecturer/${lecId}/messages/${messageId}`, {
        id: messageId,
        title: `💬 New Message: ${courseCode}`,
        message: `${currentStudent.name}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
        type: 'info',
        timestamp: timestamp,
        read: false,
        link: null,
        courseCode: courseCode
      });
      
      const enrollments = await DB.ENROLLMENT.getAll();
      const courseEnrollments = enrollments.filter(e => 
        e.courseCode === courseCode && 
        e.year === year && 
        e.semester === semester &&
        e.studentId !== currentStudent.studentId
      );
      
      for (const enrollment of courseEnrollments) {
        await DB.set(`notifications/student/${enrollment.studentId}/messages/${messageId}`, {
          id: messageId,
          title: `💬 New Discussion: ${courseCode}`,
          message: `${currentStudent.name}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
          type: 'info',
          timestamp: timestamp,
          read: false,
          link: null,
          courseCode: courseCode
        });
      }
      
      const messageInput = document.getElementById('new-message-text');
      if (messageInput) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
      }
      
      await loadCourseMessages();
      await MODAL.success('Message Sent', `✅ Your message has been posted to the ${courseCode} course discussion.`);
      
    } catch(err) {
      console.error('[STUDENT_DASH] Send message error:', err);
      await MODAL.error('Error', err.message || 'Failed to send message. Please try again.');
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = originalBtnText || '📤 Send Message';
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
      container.innerHTML = `
        <div class="inner-panel">
          <h3>📢 Course Announcements</h3>
          <p class="sub">Important updates from your lecturers</p>
          <div class="att-empty">📭 No courses found. Check in to a session first to see announcements.</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>📢 Course Announcements</h3>
        <p class="sub">Important updates from your lecturers - announcements cannot be replied to</p>
        <div class="filter-bar" style="margin-bottom: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px;">
            <label class="fl">📅 Academic Period</label>
            <select id="announcement-period" class="fi" onchange="STUDENT_DASH.changeAnnouncementPeriod()">
              ${availablePeriods.map(p => {
                const [year, semester] = p.split('_');
                return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
                  ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
                </option>`;
              }).join('')}
            </select>
          </div>
          <div style="flex: 2; min-width: 250px;">
            <label class="fl">📚 Course</label>
            <select id="announcement-course-select" class="fi" onchange="STUDENT_DASH.loadCourseAnnouncements()">
              <option value="">-- Select a course --</option>
              ${periodCourses.map(course => `
                <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
                  ${course.courseCode} - ${course.courseName} (${course.lecturerName})
                </option>
              `).join('')}
            </select>
          </div>
          <div>
            <button class="btn btn-outline btn-sm" id="refresh-announcements-btn">🔄 Refresh</button>
          </div>
        </div>
        <div id="announcements-container" style="margin-top: 20px; max-height: 500px; overflow-y: auto;">
          <div class="att-empty">📭 Select a course to view announcements</div>
        </div>
      </div>
    `;
    
    document.getElementById('refresh-announcements-btn').onclick = () => {
      if (currentAnnouncementCourse) {
        loadCourseAnnouncements();
      }
    };
  }

  async function changeAnnouncementPeriod() {
    const periodSelect = document.getElementById('announcement-period');
    if (!periodSelect || !periodSelect.value) return;
    
    const [year, semester] = periodSelect.value.split('_');
    currentSelectedYear = parseInt(year);
    currentSelectedSemester = parseInt(semester);
    currentAnnouncementCourse = null;
    
    await loadStudentData();
    
    const periodCourses = getCoursesForCurrentPeriod();
    const courseSelect = document.getElementById('announcement-course-select');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">-- Select a course --</option>';
      for (const course of periodCourses) {
        courseSelect.innerHTML += `
          <option value="${course.courseCode}_${course.year}_${course.semester}_${course.lecId}">
            ${course.courseCode} - ${course.courseName} (${course.lecturerName})
          </option>
        `;
      }
    }
    
    document.getElementById('announcements-container').innerHTML = '<div class="att-empty">📭 Select a course to view announcements</div>';
  }

  async function loadCourseAnnouncements() {
    const courseSelect = document.getElementById('announcement-course-select');
    const container = document.getElementById('announcements-container');
    
    if (!courseSelect || !container) return;
    
    const selectedValue = courseSelect.value;
    if (!selectedValue || selectedValue === '') {
      container.innerHTML = '<div class="att-empty">📭 Select a course to view announcements</div>';
      currentAnnouncementCourse = null;
      return;
    }
    
    const parts = selectedValue.split('_');
    if (parts.length < 4) {
      container.innerHTML = '<div class="att-empty">❌ Invalid course selection.</div>';
      currentAnnouncementCourse = null;
      return;
    }
    
    const courseCode = parts[0];
    const year = parseInt(parts[1]);
    const semester = parseInt(parts[2]);
    const lecId = parts[3];
    
    if (!courseCode || !year || !semester || !lecId) {
      container.innerHTML = '<div class="att-empty">❌ Invalid course data.</div>';
      currentAnnouncementCourse = null;
      return;
    }
    
    currentAnnouncementCourse = { courseCode, year, semester, lecId };
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading announcements...</div>';
    
    try {
      const announcementsPath = `announcements/course/${lecId}/${courseCode}_${year}_${semester}`;
      const announcements = await DB.get(announcementsPath);
      
      let allAnnouncements = [];
      if (announcements && Object.keys(announcements).length > 0) {
        allAnnouncements = Object.values(announcements);
      }
      
      if (allAnnouncements.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No announcements yet. Check back later for updates from your lecturer.</div>';
        return;
      }
      
      allAnnouncements.sort((a, b) => b.timestamp - a.timestamp);
      
      container.innerHTML = allAnnouncements.map(ann => {
        const priorityColor = ann.priority === 'danger' ? 'var(--danger)' : (ann.priority === 'warning' ? 'var(--amber)' : 'var(--teal)');
        const priorityIcon = ann.priority === 'danger' ? '🚨' : (ann.priority === 'warning' ? '⚠️' : 'ℹ️');
        
        return `
          <div class="message-card" style="margin-bottom: 16px; background: var(--surface); border-radius: 12px; padding: 16px; border: 1px solid var(--border); border-left: 4px solid ${priorityColor};">
            <div class="message-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div>
                <strong style="color: var(--ug);">${priorityIcon} ${escapeHtml(ann.title)}</strong>
                <span class="badge" style="margin-left: 8px; background: ${priorityColor};">${ann.priority === 'danger' ? 'Urgent' : (ann.priority === 'warning' ? 'Important' : 'Info')}</span>
              </div>
              <span style="font-size: 11px; color: var(--text4);">${formatTime(ann.timestamp)}</span>
            </div>
            <div class="message-content" style="margin: 8px 0; padding: 12px; background: var(--surface2); border-radius: 8px; line-height: 1.6;">
              <div style="font-weight: 600; margin-bottom: 8px; color: ${priorityColor};">📢 From: ${escapeHtml(ann.senderName)} (${ann.senderRole === 'TA' ? 'Teaching Assistant' : 'Lecturer'})</div>
              ${escapeHtml(ann.message)}
            </div>
            <div style="margin-top: 12px;">
              <span class="note" style="font-size: 11px;">📢 Announcements are for information only. Please contact your lecturer directly if you have questions.</span>
            </div>
          </div>
        `;
      }).join('');
      
    } catch(err) {
      console.error('[STUDENT_DASH] Load announcements error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading announcements.</div>';
    }
  }

  // ==================== CHECK-IN ====================
  async function directCheckIn(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session || !session.active || Date.now() > session.expiresAt) {
      await MODAL.error('Error', 'Session not available.');
      return;
    }
    
    const payload = btoa(JSON.stringify({
      id: session.id, token: session.token, code: session.courseCode, course: session.courseName,
      date: session.date, expiresAt: session.expiresAt, lat: session.lat, lng: session.lng,
      radius: session.radius, locEnabled: session.locEnabled
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
      currentFilterCourseKey = null;
      currentFilterLecturer = null;
      currentMessageCourse = null;
      currentAnnouncementCourse = null;
      await loadOverview();
    }
  }

  // ==================== SWITCH TAB ====================
  async function switchTab(tabName) {
    if (tabName !== 'messages') {
      currentMessageCourse = null;
    }
    if (tabName !== 'announcements') {
      currentAnnouncementCourse = null;
    }
    
    document.querySelectorAll('#view-student-dashboard .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) item.classList.add('active');
    });
    
    document.querySelectorAll('#view-student-dashboard .tab-content').forEach(content => content.style.display = 'none');
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) activeContent.style.display = 'block';
    
    const titles = { 
      overview: '📊 Student Dashboard', 
      calendar: '📅 Schedule & Calendar', 
      history: '📋 Check-in History', 
      messages: '💬 Messages',
      announcements: '📢 Announcements'
    };
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
    }, 30000); 
  }
  
  function stopAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; }
    if (notificationCheckInterval) { clearInterval(notificationCheckInterval); notificationCheckInterval = null; }
    if (upcomingCheckInterval) { clearInterval(upcomingCheckInterval); upcomingCheckInterval = null; }
  }
  
  function logout() { stopAutoRefresh(); AUTH.clearSession(); APP.goTo('landing'); }

  return { 
    init, 
    switchTab, 
    loadOverview, 
    loadCalendarView, 
    loadHistoryView, 
    loadMessagesView,
    loadCourseMessages,
    changeMessagePeriod,
    loadAnnouncementsView,
    changeAnnouncementPeriod,
    loadCourseAnnouncements,
    refreshOverview,
    sendCourseMessage,
    showReplyForm,
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
    showPersonalStudyEditor, 
    addPersonalStudyEntry, 
    editPersonalStudyEntry, 
    removePersonalStudyEntry,
    logout
  };
})();

window.STUDENT_DASH = STUDENT_DASH;
