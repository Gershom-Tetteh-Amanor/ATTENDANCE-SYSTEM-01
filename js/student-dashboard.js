/* student-dashboard.js — Student Portal with Proper Time Spanning */
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
  
  // Pagination states
  let currentHistoryPage = 1;
  let itemsPerPage = 15;
  
  // Cache system
  let cache = {
    sessions: null,
    lecturers: new Map(),
    lastCacheTime: 0,
    cacheDuration: 30000,
    pendingPromises: new Map()
  };

  // Helper function to get years from 2020 to current year
  function getAvailableYears() {
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    const years = [];
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }
    return years;
  }

  // Helper function to convert time to minutes
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Helper function to format time display (24h to 12h with AM/PM)
  function formatTimeDisplay(timeStr) {
    if (!timeStr) return '—';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours < 12 ? 'AM' : 'PM';
    const displayHour = hours === 0 ? 12 : (hours > 12 ? hours - 12 : hours);
    return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  // Helper function to get all time slots between start and end
  function getTimeSlotsBetween(startTime, endTime, allTimeSlots) {
    const startIdx = allTimeSlots.indexOf(startTime);
    const endIdx = allTimeSlots.indexOf(endTime);
    if (startIdx === -1 || endIdx === -1) return [];
    return allTimeSlots.slice(startIdx, endIdx);
  }

  // Rate limiter for API calls
  class RateLimiter {
    constructor(maxRequests = 20, timeWindow = 60000) {
      this.maxRequests = maxRequests;
      this.timeWindow = timeWindow;
      this.requests = [];
    }
    
    canMakeRequest() {
      const now = Date.now();
      this.requests = this.requests.filter(timestamp => now - timestamp < this.timeWindow);
      
      if (this.requests.length < this.maxRequests) {
        this.requests.push(now);
        return true;
      }
      return false;
    }
    
    async execute(fn) {
      if (this.canMakeRequest()) {
        return await fn();
      }
      throw new Error('Rate limit exceeded. Please wait.');
    }
  }
  
  const rateLimiters = {
    sessions: new RateLimiter(30, 60000),
    filters: new RateLimiter(40, 60000),
    exports: new RateLimiter(5, 60000)
  };

  // Cache helper
  async function getCachedOrFetch(key, fetchFn, ttl = 30000) {
    if (cache.pendingPromises.has(key)) {
      return cache.pendingPromises.get(key);
    }
    
    const cached = cache[key];
    if (cached && (Date.now() - cache.lastCacheTime) < ttl) {
      return cached;
    }
    
    const promise = fetchFn();
    cache.pendingPromises.set(key, promise);
    
    try {
      const result = await promise;
      cache[key] = result;
      cache.lastCacheTime = Date.now();
      return result;
    } finally {
      cache.pendingPromises.delete(key);
    }
  }

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
    if (percentage >= 80) return { level: 'good', text: 'Good Standing', color: 'var(--teal)', icon: '✓' };
    if (percentage >= 60) return { level: 'warning', text: 'Approaching Threshold', color: 'var(--amber)', icon: '⚠' };
    return { level: 'critical', text: 'At Risk', color: 'var(--danger)', icon: '✗' };
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

  // Proper time overlap detection
  function doTimesOverlap(start1, end1, start2, end2) {
    if (!start1 || !end1 || !start2 || !end2) return false;
    
    const start1Min = timeToMinutes(start1);
    const end1Min = timeToMinutes(end1);
    const start2Min = timeToMinutes(start2);
    const end2Min = timeToMinutes(end2);
    
    return (start1Min < end2Min && start2Min < end1Min);
  }

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
    
    showLoadingIndicator();
    const startTime = Date.now();
    
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
    
    console.log(`[STUDENT_DASH] Initialized in ${Date.now() - startTime}ms`);
  }
  
  function showLoadingIndicator() {
    const container = document.getElementById('overview-view');
    if (container) {
      container.innerHTML = `
        <div class="dashboard-loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px;">
          <div class="loading-spinner" style="width: 50px; height: 50px; border: 4px solid var(--surface2); border-top-color: var(--ug); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          <div class="loading-text" style="margin-top: 15px; color: var(--text3);">Loading your dashboard...</div>
        </div>
      `;
    }
  }
  
  function hideLoadingIndicator() {
    // Loading complete - content will be rendered by load functions
  }
  
  function updateSidebarInfo() {
    const sidebarName = document.getElementById('student-sidebar-name');
    const sidebarId = document.getElementById('student-sidebar-id');
    const userName = document.getElementById('student-dash-name');
    const userAvatar = document.getElementById('student-avatar');
    
    if (sidebarName) sidebarName.textContent = currentStudent.name || 'Student';
    if (sidebarId) sidebarId.textContent = `ID: ${currentStudent.studentId}`;
    if (userName) userName.textContent = currentStudent.name || currentStudent.email;
    if (userAvatar) userAvatar.textContent = '🎓';
  }

  async function loadStudentData() {
    try {
      const allSessions = await getCachedOrFetch('allSessions', async () => {
        return await DB.SESSION.getAll();
      }, 30000);
      
      const uniqueCourseLecturerMap = new Map();
      const studentCheckinSessions = [];
      const lecturerIdsNeeded = new Set();
      
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
      
      // Batch fetch lecturers
      const lecturerPromises = Array.from(lecturerIdsNeeded).map(async (lecId) => {
        if (!lecturersMap.has(lecId)) {
          try {
            const lecturer = await DB.LEC.get(lecId);
            if (lecturer && lecturer.name) {
              lecturersMap.set(lecId, { 
                name: lecturer.name,
                id: lecId,
                lat: lecturer?.lastLocation?.lat || null,
                lng: lecturer?.lastLocation?.lng || null
              });
              for (const [key, course] of uniqueCourseLecturerMap) {
                if (course.lecId === lecId) {
                  course.lecturerName = lecturer.name;
                }
              }
            }
          } catch(e) {}
        }
      });
      
      await Promise.all(lecturerPromises);
      
      enrolledCourses = Array.from(uniqueCourseLecturerMap.values());
      allStudentSessions = studentCheckinSessions;
      
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
      
      console.log('[STUDENT_DASH] Loaded', enrolledCourses.length, 'courses');
      
    } catch(err) { 
      console.error('[STUDENT_DASH] Load error:', err); 
      enrolledCourses = []; 
    }
  }

  function getCoursesForCurrentPeriod() {
    return enrolledCourses.filter(c => c.year === currentSelectedYear && c.semester === currentSelectedSemester);
  }

  async function getAllSessionsForCurrentPeriod() {
    const allSessions = await getCachedOrFetch('allSessions', async () => {
      return await DB.SESSION.getAll();
    }, 30000);
    
    const periodCourses = getCoursesForCurrentPeriod();
    const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
    
    const sessions = [];
    for (const session of allSessions) {
      const sessionKey = getCourseKey(session.courseCode, session.lecFbId);
      if (enrolledKeys.has(sessionKey) && 
          session.year === currentSelectedYear && 
          session.semester === currentSelectedSemester) {
        
        let attended = false;
        let myRecord = null;
        
        if (session.records) {
          const records = Object.values(session.records);
          myRecord = records.find(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          attended = !!myRecord;
        }
        
        sessions.push({
          ...session,
          attended,
          myRecord
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
      
      const entryStartMinutes = timeToMinutes(entry.startTime);
      const minutesUntil = entryStartMinutes - currentMinutes;
      const entryId = `${entry.courseCode}_${entry.lecId}_${entry.day}_${entry.startTime}`;
      
      if (minutesUntil <= 30 && minutesUntil > 0 && !activeUpcomingNotifications.has(entryId)) {
        activeUpcomingNotifications.add(entryId);
        
        if (Notification.permission === "granted") {
          new Notification(`Upcoming Class: ${entry.courseCode} with ${entry.lecturerName}`, {
            body: `Starts at ${formatTimeDisplay(entry.startTime)} in ${minutesUntil} minutes.`,
            icon: "/uo_ghana.png",
            tag: entryId
          });
        }
        
        if (typeof NOTIFICATIONS !== 'undefined') {
          await NOTIFICATIONS.add({
            title: `⏰ Upcoming Class: ${entry.courseCode}`,
            message: `Starts at ${formatTimeDisplay(entry.startTime)} (in ${minutesUntil} minutes). Lecturer: ${entry.lecturerName}`,
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
      
      const entryStartMinutes = timeToMinutes(entry.startTime);
      const minutesUntil = entryStartMinutes - currentMinutes;
      const entryId = `study_${entry.title}_${entry.day}_${entry.startTime}`;
      
      if (minutesUntil <= 30 && minutesUntil > 0 && !activeUpcomingNotifications.has(entryId)) {
        activeUpcomingNotifications.add(entryId);
        
        if (Notification.permission === "granted") {
          new Notification(`Upcoming Study: ${entry.title}`, {
            body: `Starts at ${formatTimeDisplay(entry.startTime)} in ${minutesUntil} minutes.`,
            icon: "/uo_ghana.png",
            tag: entryId
          });
        }
        
        if (typeof NOTIFICATIONS !== 'undefined') {
          await NOTIFICATIONS.add({
            title: `⏰ Upcoming Study: ${entry.title}`,
            message: `Starts at ${formatTimeDisplay(entry.startTime)} (in ${minutesUntil} minutes).`,
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

  // ==================== CALENDAR VIEW WITH PROPER SPANNING ====================
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
    
    // Find upcoming sessions (next 30 minutes)
    const upcomingSessions = [];
    for (const entry of timetable) {
      if (entry.day !== currentDay) continue;
      const entryStartMinutes = timeToMinutes(entry.startTime);
      const minutesUntil = entryStartMinutes - currentMinutes;
      if (minutesUntil <= 30 && minutesUntil > 0) {
        upcomingSessions.push({ ...entry, minutesUntil });
      }
    }
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Generate time slots (30-minute intervals from 7:00 AM to 10:00 PM)
    const timeSlots = [];
    for (let hour = 7; hour <= 22; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 22) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => {
        const [year, semester] = p.split('_');
        return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === currentSelectedYear && currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === currentSelectedYear && currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    // Build the calendar table with proper rowspan spanning
    let timetableHtml = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div>
          <label class="fl">📅 Academic Period</label>
          <select id="calendar-period" class="fi" onchange="STUDENT_DASH.changeCalendarPeriod()">
            ${periodsHtml}
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
              <span>📚 ${session.courseCode} with ${session.lecturerName} at ${formatTimeDisplay(session.startTime)} (in ${session.minutesUntil} minutes)</span>
              <button class="btn btn-ug btn-sm" onclick="STUDENT_DASH.checkInFromTimetable('${session.courseCode}', '${session.lecId}')" style="margin-left: 10px;">✓ Check In Now</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="dash-section">
        <h3>📅 My Weekly Schedule</h3>
        <div class="timetable-grid" style="overflow-x: auto; position: relative;">
          <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
            <thead>
              <tr style="background: var(--ug); color: white; position: sticky; top: 0;">
                <th style="padding: 12px; min-width: 100px;">Time</th>
                ${days.map(day => `<th style="padding: 12px;">${day}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
    `;
    
    // For each time slot, check which class/study spans it
    for (let i = 0; i < timeSlots.length; i++) {
      const currentSlot = timeSlots[i];
      const displayTime = formatTimeDisplay(currentSlot);
      const timeValue = currentSlot;
      
      timetableHtml += `
        <tr>
          <td style="padding: 10px; border: 1px solid var(--border); font-weight: 600; background: var(--surface2); vertical-align: middle;">
            ${displayTime}<br>
            <span style="font-size: 10px; color: var(--text4);">${timeValue}</span>
          </td>
      `;
      
      for (const day of days) {
        // Check if this slot is the start of a class that spans multiple rows
        let classFound = null;
        let classSpan = 0;
        let classStartSlot = null;
        
        // Find class that starts at this exact time
        const classAtThisSlot = timetable.find(t => 
          t.day === day && t.startTime === currentSlot
        );
        
        if (classAtThisSlot) {
          // Calculate how many slots this class spans
          const endSlotIndex = timeSlots.indexOf(classAtThisSlot.endTime);
          const currentSlotIndex = timeSlots.indexOf(classAtThisSlot.startTime);
          classSpan = endSlotIndex - currentSlotIndex;
          classFound = classAtThisSlot;
          classStartSlot = classAtThisSlot.startTime;
        }
        
        if (classFound && classSpan > 0) {
          timetableHtml += `
            <td style="padding: 12px; border: 1px solid var(--border); background: var(--primary-s); vertical-align: middle;" rowspan="${classSpan}">
              <strong>📚 ${escapeHtml(classFound.courseCode)}</strong><br>
              <small>${escapeHtml(classFound.lecturerName)}</small><br>
              <small>${formatTimeDisplay(classFound.startTime)} - ${formatTimeDisplay(classFound.endTime)}</small>
              ${classFound.location ? `<br><small>📍 ${escapeHtml(classFound.location)}</small>` : ''}
              <div style="margin-top: 10px;">
                <button class="btn btn-sm btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="STUDENT_DASH.checkInFromTimetable('${classFound.courseCode}', '${classFound.lecId}')">✓ Check In</button>
              </div>
            </td>
          `;
        } else {
          // Check if this slot is within a class (not the start)
          let isWithinClass = false;
          for (const classItem of timetable) {
            if (classItem.day === day && 
                timeToMinutes(currentSlot) > timeToMinutes(classItem.startTime) && 
                timeToMinutes(currentSlot) < timeToMinutes(classItem.endTime)) {
              isWithinClass = true;
              break;
            }
          }
          
          if (!isWithinClass) {
            // Check for personal study
            let studyFound = null;
            let studySpan = 0;
            
            const studyAtThisSlot = personalStudyTimes.find(p => 
              p.day === day && p.startTime === currentSlot
            );
            
            if (studyAtThisSlot) {
              const endSlotIndex = timeSlots.indexOf(studyAtThisSlot.endTime);
              const currentSlotIndex = timeSlots.indexOf(studyAtThisSlot.startTime);
              studySpan = endSlotIndex - currentSlotIndex;
              studyFound = studyAtThisSlot;
            }
            
            if (studyFound && studySpan > 0) {
              const priorityColor = studyFound.priority === 'urgent' ? '#d42b2b' : (studyFound.priority === 'important' ? '#b8860b' : '#1d9e75');
              timetableHtml += `
                <td style="padding: 12px; border: 1px solid var(--border); background: var(--green-s); vertical-align: middle;" rowspan="${studySpan}">
                  <strong>📖 ${escapeHtml(studyFound.title)}</strong><br>
                  <small>${formatTimeDisplay(studyFound.startTime)} - ${formatTimeDisplay(studyFound.endTime)}</small>
                  ${studyFound.location ? `<br><small>📍 ${escapeHtml(studyFound.location)}</small>` : ''}
                  ${studyFound.description ? `<br><small>📝 ${escapeHtml(studyFound.description)}</small>` : ''}
                <tr>
              `;
            } else {
              // Check if within study period
              let isWithinStudy = false;
              for (const study of personalStudyTimes) {
                if (study.day === day && 
                    timeToMinutes(currentSlot) > timeToMinutes(study.startTime) && 
                    timeToMinutes(currentSlot) < timeToMinutes(study.endTime)) {
                  isWithinStudy = true;
                  break;
                }
              }
              
              if (!isWithinStudy) {
                timetableHtml += `<td style="padding: 10px; border: 1px solid var(--border); color: var(--text4); text-align: center; vertical-align: middle;">—</td>`;
              }
            }
          }
        }
      }
      
      timetableHtml += `</tr>`;
    }
    
    timetableHtml += `
            </tbody>
          </table>
        </div>
        <p class="note" style="margin-top: 12px; text-align: center;">💡 Classes and study sessions span across their full duration automatically.</p>
      </div>
    `;
    
    container.innerHTML = timetableHtml;
  }

  // ==================== TIMETABLE EDITOR ====================
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
    
    // Generate time slots for dropdown (30-minute intervals)
    const timeSlots = [];
    for (let hour = 7; hour <= 22; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 22) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    
    let entriesHtml = '';
    if (timetable.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      timetable.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item" style="border-left: 3px solid var(--ug); padding: 12px; margin-bottom: 8px; background: var(--surface); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${formatTimeDisplay(entry.startTime)} - ${formatTimeDisplay(entry.endTime)}</div>
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
          <p class="note" style="margin-bottom: 12px;">💡 The class will automatically span across all time slots from start to end time.</p>
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
                ${availableCourses.map(c => `<option value="${c.code}|${c.name}|${c.lecturer}|${c.lecId}|${c.location}">${c.code} - ${c.name} (${c.lecturer})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="two-col">
            <div class="field">
              <label class="fl">⏰ Start Time</label>
              <select id="timetable-start" class="fi">
                ${timeSlots.map(t => `<option value="${t}">${t} (${formatTimeDisplay(t)})</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="fl">⏰ End Time</label>
              <select id="timetable-end" class="fi">
                ${timeSlots.map(t => `<option value="${t}">${t} (${formatTimeDisplay(t)})</option>`).join('')}
              </select>
            </div>
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
    
    await MODAL.alert('✏️ Edit Class Timetable', modalContent, { icon: '📅', btnLabel: 'Close', width: '650px' });
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
    
    // Validate time range
    if (startTime >= endTime) {
      await MODAL.alert('Invalid Time', '⚠️ Start time must be before end time.');
      return;
    }
    
    const [courseCode, courseName, lecturerName, lecId] = courseValue.split('|');
    
    // Check for overlapping with existing timetable entries
    const overlappingClass = timetable.find(t => 
      t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );
    
    if (overlappingClass) {
      const replace = await MODAL.confirm(
        'Time Conflict Detected',
        `This time (${formatTimeDisplay(startTime)} - ${formatTimeDisplay(endTime)}) overlaps with ${overlappingClass.courseCode} (${formatTimeDisplay(overlappingClass.startTime)} - ${formatTimeDisplay(overlappingClass.endTime)}).\n\nDo you want to replace it?`,
        { confirmLabel: 'Yes, Replace', cancelLabel: 'No, Cancel', confirmCls: 'btn-warning' }
      );
      if (!replace) return;
      
      // Remove the overlapping entry
      const overlappingIndex = timetable.findIndex(t => 
        t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
      );
      if (overlappingIndex !== -1) {
        timetable.splice(overlappingIndex, 1);
      }
    }
    
    // Check for overlap with personal study times (warning only)
    const overlappingStudy = personalStudyTimes.find(p => 
      p.day === day && doTimesOverlap(startTime, endTime, p.startTime, p.endTime)
    );
    
    if (overlappingStudy) {
      const proceed = await MODAL.confirm(
        'Personal Study Conflict',
        `This time overlaps with your personal study "${overlappingStudy.title}" (${formatTimeDisplay(overlappingStudy.startTime)} - ${formatTimeDisplay(overlappingStudy.endTime)}). Add class anyway?`,
        { confirmLabel: 'Yes, Add Class', cancelLabel: 'No, Cancel', confirmCls: 'btn-warning' }
      );
      if (!proceed) return;
    }
    
    // Add the new entry
    timetable.push({ 
      day, startTime, endTime, courseCode, courseName, lecturerName, lecId, location,
      addedAt: Date.now()
    });
    
    // Sort timetable by day and time
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
    const confirmed = await MODAL.confirm('Remove Entry', 'Remove this class from your timetable?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    timetable.splice(index, 1);
    await saveTimetable();
    await MODAL.close();
    await showTimetableEditor();
    await loadCalendarView();
    await MODAL.success('Removed', '✅ Timetable entry removed.');
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

  async function checkInFromTimetable(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => 
      s.courseCode === courseCode && s.lecFbId === lecId && s.active === true
    );
    
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode} with your lecturer.`);
      return;
    }
    
    await directCheckIn(activeSession.id);
  }

  // ==================== PERSONAL STUDY TIME EDITOR ====================
  async function showPersonalStudyEditor() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Generate time slots for dropdown (30-minute intervals)
    const timeSlots = [];
    for (let hour = 7; hour <= 22; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 22) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    
    let entriesHtml = '';
    if (personalStudyTimes.length > 0) {
      entriesHtml = `<div class="courses-grid" style="grid-template-columns: 1fr;">`;
      personalStudyTimes.forEach((entry, index) => {
        entriesHtml += `
          <div class="timetable-item" style="border-left: 3px solid var(--teal); padding: 12px; margin-bottom: 8px; background: var(--surface); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%;">
              <div><strong>📅 ${entry.day}</strong> at ⏰ ${formatTimeDisplay(entry.startTime)} - ${formatTimeDisplay(entry.endTime)}</div>
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
          <p class="note" style="margin-bottom: 12px;">💡 The study time will automatically span across all time slots from start to end time.</p>
          <div class="two-col">
            <div class="field"><label class="fl">📅 Day</label><select id="personal-day" class="fi">${days.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
            <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="personal-title" class="fi" placeholder="e.g., Math Review, Programming Practice"></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="fl">⏰ Start Time</label><select id="personal-start" class="fi">
              ${timeSlots.map(t => `<option value="${t}">${t} (${formatTimeDisplay(t)})</option>`).join('')}
            </select></div>
            <div class="field"><label class="fl">⏰ End Time</label><select id="personal-end" class="fi">
              ${timeSlots.map(t => `<option value="${t}">${t} (${formatTimeDisplay(t)})</option>`).join('')}
            </select></div>
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
    
    await MODAL.alert('📖 Manage Personal Study Time', modalContent, { icon: '📚', btnLabel: 'Close', width: '700px' });
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
    
    // Validate time range
    if (startTime >= endTime) {
      await MODAL.alert('Invalid Time', '⚠️ Start time must be before end time.');
      return;
    }
    
    const overlappingClass = timetable.find(t => 
      t.day === day && doTimesOverlap(startTime, endTime, t.startTime, t.endTime)
    );
    
    if (overlappingClass) {
      const overlapWarning = await MODAL.confirm(
        'Time Conflict Detected',
        `This study time overlaps with ${overlappingClass.courseCode} (${formatTimeDisplay(overlappingClass.startTime)} - ${formatTimeDisplay(overlappingClass.endTime)}). Continue anyway?`,
        { confirmLabel: 'Yes, Add Anyway', confirmCls: 'btn-warning' }
      );
      if (!overlapWarning) return;
    }
    
    personalStudyTimes.push({ 
      day, startTime, endTime, title, location, priority, description,
      type: 'personal',
      createdAt: Date.now()
    });
    
    const daysOrder = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
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
    
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [];
    for (let hour = 7; hour <= 22; hour++) {
      timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
      if (hour < 22) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
      }
    }
    
    const modalContent = `
      <div>
        <div class="two-col">
          <div class="field"><label class="fl">📅 Day</label><select id="edit-personal-day" class="fi">${days.map(d => `<option value="${d}" ${d === entry.day ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label class="fl">📖 Study Title</label><input type="text" id="edit-personal-title" class="fi" value="${escapeHtml(entry.title)}"></div>
        </div>
        <div class="two-col">
          <div class="field"><label class="fl">⏰ Start Time</label><select id="edit-personal-start" class="fi">
            ${timeSlots.map(t => `<option value="${t}" ${t === entry.startTime ? 'selected' : ''}>${t} (${formatTimeDisplay(t)})</option>`).join('')}
          </select></div>
          <div class="field"><label class="fl">⏰ End Time</label><select id="edit-personal-end" class="fi">
            ${timeSlots.map(t => `<option value="${t}" ${t === entry.endTime ? 'selected' : ''}>${t} (${formatTimeDisplay(t)})</option>`).join('')}
          </select></div>
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

  function startNotificationCheck() {
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    notificationCheckInterval = setInterval(async () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = getCurrentDay();
      
      const upcomingEntries = [...timetable, ...personalStudyTimes].filter(entry => {
        if (entry.day !== currentDay) return false;
        const entryStartMinutes = timeToMinutes(entry.startTime);
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
      
      let periodsHtml = '';
      if (availablePeriods.length > 0) {
        periodsHtml = availablePeriods.map(p => {
          const [year, semester] = p.split('_');
          return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
            ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
          </option>`;
        }).join('');
      } else {
        const availableYears = getAvailableYears();
        const currentYear = new Date().getFullYear();
        periodsHtml = availableYears.map(year => `
          <option value="${year}_1" ${year === currentSelectedYear && currentSelectedSemester === 1 ? 'selected' : ''}>
            ${year} - First Semester
          </option>
          <option value="${year}_2" ${year === currentSelectedYear && currentSelectedSemester === 2 ? 'selected' : ''}>
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
        for (const session of activeSessions.slice(0, 5)) {
          const timeRemaining = Math.max(0, session.expiresAt - Date.now());
          const minutesLeft = Math.floor(timeRemaining / 60000);
          const records = session.records ? Object.values(session.records) : [];
          const isCheckedIn = records.some(r => r.studentId?.toUpperCase() === currentStudent.studentId?.toUpperCase());
          const course = periodCourses.find(c => c.courseCode === session.courseCode && c.lecId === session.lecFbId);
          
          activeSessionsHtml += `
            <div class="course-card" style="border-left: 4px solid #1d9e75;">
              <div class="course-header">
                <span class="course-code">📚 ${escapeHtml(session.courseCode)}</span>
                <span class="badge" style="background:#1d9e75;">ACTIVE</span>
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
        if (activeSessions.length > 5) {
          activeSessionsHtml += `<p class="note" style="text-align: center;">+ ${activeSessions.length - 5} more active sessions</p>`;
        }
      } else {
        activeSessionsHtml = '<div class="no-rec">📭 No active sessions</div>';
      }
      
      container.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Academic Period</label>
            <select id="overview-year" class="fi" onchange="STUDENT_DASH.changePeriod()">
              ${periodsHtml}
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

  // ==================== HISTORY TAB ====================
  function renderHistoryItems(sessions) {
    if (!sessions || sessions.length === 0) {
      return '<div class="no-rec">📭 No sessions found for the selected period.</div>';
    }
    
    const periodCourses = getCoursesForCurrentPeriod();
    
    return `<div class="courses-grid">
      ${sessions.map(session => {
        const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
        const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
        
        return `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📅 ${session.date}</span>
              <span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">
                ${session.attended ? 'Present' : 'Absent'}
              </span>
            </div>
            <div class="course-name">📚 ${escapeHtml(session.courseCode)} - ${escapeHtml(session.courseName || 'Course')}</div>
            <div class="course-stats">
              <span>👨‍🏫 ${escapeHtml(lecturerName)}</span>
              ${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>`;
  }

  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 150px;"><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
        <div style="min-width: 200px;"><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
        <div style="min-width: 200px;"><div class="skeleton" style="height: 40px; width: 100%;"></div></div>
        <div><div class="skeleton" style="height: 40px; width: 100px;"></div></div>
      </div>
      <div class="courses-grid">
        ${Array(3).fill().map(() => `<div class="course-card"><div class="skeleton" style="height: 100px;"></div></div>`).join('')}
      </div>
    `;
    
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
    
    const allSessions = await DB.SESSION.getAll();
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
    
    const totalPages = Math.ceil(filteredSessions.length / itemsPerPage);
    const startIndex = (currentHistoryPage - 1) * itemsPerPage;
    const paginatedSessions = filteredSessions.slice(startIndex, startIndex + itemsPerPage);
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => { 
        const [year, semester] = p.split('_'); 
        return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === currentSelectedYear && currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === currentSelectedYear && currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div><label class="fl">📅 Academic Period</label>
          <select id="history-period" class="fi" onchange="STUDENT_DASH.changeHistoryPeriod()">
            <option value="">Select Period</option>
            ${periodsHtml}
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
      
      <div id="history-items-container">
        ${renderHistoryItems(paginatedSessions)}
      </div>
      
      ${totalPages > 1 ? `
        <div class="pagination-bar" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; padding: 10px; flex-wrap: wrap;">
          <button class="btn btn-outline btn-sm" id="prev-history-page" ${currentHistoryPage === 1 ? 'disabled' : ''}>
            ← Previous
          </button>
          <span id="history-page-info" style="font-size: 13px;">
            Page ${currentHistoryPage} of ${totalPages} (Showing ${startIndex + 1}-${Math.min(startIndex + itemsPerPage, filteredSessions.length)} of ${filteredSessions.length})
          </span>
          <button class="btn btn-outline btn-sm" id="next-history-page" ${currentHistoryPage === totalPages ? 'disabled' : ''}>
            Next →
          </button>
        </div>
      ` : ''}
    `;
    
    if (totalPages > 1) {
      document.getElementById('prev-history-page')?.addEventListener('click', () => {
        if (currentHistoryPage > 1) {
          currentHistoryPage--;
          loadHistoryView();
        }
      });
      
      document.getElementById('next-history-page')?.addEventListener('click', () => {
        if (currentHistoryPage < totalPages) {
          currentHistoryPage++;
          loadHistoryView();
        }
      });
    }
  }

  async function filterHistory() {
    currentFilterCourseKey = document.getElementById('history-course')?.value || null;
    currentFilterLecturer = document.getElementById('history-lecturer')?.value || null;
    currentHistoryPage = 1;
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
      currentHistoryPage = 1;
      await loadHistoryView();
    }
  }

  async function exportHistoryToExcel() {
    await rateLimiters.exports.execute(async () => {
      if (typeof XLSX === 'undefined') {
        await MODAL.alert('Library Error', 'Excel export not loaded.');
        return;
      }
      
      const periodCourses = getCoursesForCurrentPeriod();
      const enrolledKeys = new Set(periodCourses.map(c => getCourseKey(c.courseCode, c.lecId)));
      const allSessions = await DB.SESSION.getAll();
      
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
    });
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
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => {
        const [year, semester] = p.split('_');
        return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === currentSelectedYear && currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === currentSelectedYear && currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>💬 Course Messages</h3>
        <div class="filter-bar" style="margin-bottom: 16px; flex-wrap: wrap;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Period</label>
            <select id="message-period" class="fi" onchange="STUDENT_DASH.changeMessagePeriod()">
              ${periodsHtml}
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
    await rateLimiters.filters.execute(async () => {
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
    });
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
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => {
        const [year, semester] = p.split('_');
        return `<option value="${p}" ${parseInt(year) === currentSelectedYear && parseInt(semester) === currentSelectedSemester ? 'selected' : ''}>
          ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}
        </option>`;
      }).join('');
    } else {
      const availableYears = getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `
        <option value="${year}_1" ${year === currentSelectedYear && currentSelectedSemester === 1 ? 'selected' : ''}>
          ${year} - First Semester
        </option>
        <option value="${year}_2" ${year === currentSelectedYear && currentSelectedSemester === 2 ? 'selected' : ''}>
          ${year} - Second Semester
        </option>
      `).join('');
    }
    
    container.innerHTML = `
      <div class="inner-panel">
        <h3>📢 Announcements</h3>
        <div class="filter-bar" style="margin-bottom: 16px;">
          <div style="min-width: 150px;">
            <label class="fl">📅 Period</label>
            <select id="announcement-period" class="fi" onchange="STUDENT_DASH.changeAnnouncementPeriod()">
              ${periodsHtml}
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
      currentHistoryPage = 1;
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
    
    const titles = { overview: 'Dashboard', calendar: 'Schedule', history: 'History', messages: 'Messages', announcements: 'Announcements' };
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
    }, 60000);
  }
  
  function stopAutoRefresh() { 
    if (refreshInterval) clearInterval(refreshInterval); 
    if (activeSessionListener) { activeSessionListener(); activeSessionListener = null; }
    if (notificationCheckInterval) clearInterval(notificationCheckInterval);
    if (upcomingCheckInterval) clearInterval(upcomingCheckInterval);
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
