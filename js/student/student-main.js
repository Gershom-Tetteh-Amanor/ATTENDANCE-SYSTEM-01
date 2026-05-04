/* student-main.js — Main controller for Student Dashboard */
'use strict';

const STUDENT_MAIN = (() => {
  const core = () => window.STUDENT_CORE;
  const location = () => window.STUDENT_LOCATION;
  const overview = () => window.STUDENT_OVERVIEW;
  const calendar = () => window.STUDENT_CALENDAR;
  const history = () => window.STUDENT_HISTORY;
  const messages = () => window.STUDENT_MESSAGES;
  const timetable = () => window.STUDENT_TIMETABLE;
  
  let activeUpcomingCheckInterval = null;
  
  // Start auto-refresh
  function startAutoRefresh() { 
    if (core().state.refreshInterval) clearInterval(core().state.refreshInterval); 
    core().state.refreshInterval = setInterval(() => {
      const activeTab = document.querySelector('#view-student-dashboard .tab-content[style*="display: block"]')?.id;
      if (activeTab === 'overview-view') overview().loadOverview();
      else if (activeTab === 'calendar-view') calendar().loadCalendarView();
      else if (activeTab === 'history-view') history().loadHistoryView();
      else if (activeTab === 'messages-view' && core().state.currentMessageCourse) messages().loadCourseMessages();
      else if (activeTab === 'announcements-view' && core().state.currentAnnouncementCourse) messages().loadCourseAnnouncements();
    }, 60000);
  }

  // Upcoming sessions check with sound
  function startUpcomingSessionsCheck() {
    if (activeUpcomingCheckInterval) clearInterval(activeUpcomingCheckInterval);
    activeUpcomingCheckInterval = setInterval(async () => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = core().getCurrentDay();
      
      for (const entry of core().state.timetable) {
        if (entry.day !== currentDay) continue;
        const entryStartMinutes = core().timeToMinutes(entry.startTime);
        const minutesUntil = entryStartMinutes - currentMinutes;
        const entryId = `${entry.courseCode}_${entry.lecId}_${entry.day}_${entry.startTime}`;
        
        if (minutesUntil <= 30 && minutesUntil > 0 && !core().state.activeUpcomingNotifications.has(entryId)) {
          core().state.activeUpcomingNotifications.add(entryId);
          await location().playNotificationSound();
          if (Notification.permission === "granted") {
            new Notification(`⚠️ Upcoming Class: ${entry.courseCode}`, {
              body: `Starts at ${core().formatTime24(entry.startTime)} in ${minutesUntil} minutes with ${entry.lecturerName}.`,
              icon: "/uo_ghana.png",
              tag: entryId,
              requireInteraction: true
            });
          }
          if (typeof NOTIFICATIONS !== 'undefined') {
            await NOTIFICATIONS.add({
              title: `⏰ Class Starting Soon: ${entry.courseCode}`,
              message: `Your ${entry.courseName} class starts at ${core().formatTime24(entry.startTime)} (in ${minutesUntil} minutes). Don't be late!`,
              type: 'warning',
              link: null
            });
          }
          const calendarView = document.getElementById('calendar-view');
          if (calendarView && calendarView.style.display !== 'none') await calendar().loadCalendarView();
          setTimeout(() => { core().state.activeUpcomingNotifications.delete(entryId); }, minutesUntil * 60 * 1000);
        }
      }
      
      for (const entry of core().state.personalStudyTimes) {
        if (entry.day !== currentDay) continue;
        const entryStartMinutes = core().timeToMinutes(entry.startTime);
        const minutesUntil = entryStartMinutes - currentMinutes;
        const entryId = `study_${entry.title}_${entry.day}_${entry.startTime}`;
        if (minutesUntil <= 15 && minutesUntil > 0 && !core().state.activeUpcomingNotifications.has(entryId)) {
          core().state.activeUpcomingNotifications.add(entryId);
          await location().playReminderSound();
          if (Notification.permission === "granted") {
            new Notification(`📖 Study Time: ${entry.title}`, {
              body: `Starts at ${core().formatTime24(entry.startTime)} in ${minutesUntil} minutes.`,
              icon: "/uo_ghana.png",
              tag: entryId
            });
          }
          setTimeout(() => { core().state.activeUpcomingNotifications.delete(entryId); }, minutesUntil * 60 * 1000);
        }
      }
    }, 60000);
  }

  function startNotificationCheck() {
    if (core().state.notificationCheckInterval) clearInterval(core().state.notificationCheckInterval);
    core().state.notificationCheckInterval = setInterval(() => {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const currentDay = core().getCurrentDay();
      const upcomingEntries = [...core().state.timetable, ...core().state.personalStudyTimes].filter(entry => {
        if (entry.day !== currentDay) return false;
        const minutesUntil = core().timeToMinutes(entry.startTime) - currentMinutes;
        return minutesUntil <= 30 && minutesUntil > 0;
      });
      const badge = document.querySelector('.notification-badge');
      if (badge) {
        if (upcomingEntries.length > 0) {
          badge.textContent = upcomingEntries.length;
          badge.style.display = 'block';
        } else {
          badge.style.display = 'none';
        }
      }
    }, 60000);
  }

  // Check-in functions
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

  async function checkInFromTimetable(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => s.courseCode === courseCode && s.lecFbId === lecId && s.active === true);
    if (!activeSession) {
      await MODAL.alert('No Active Session', `📭 No active session found for ${courseCode} with your lecturer.`);
      return;
    }
    await directCheckIn(activeSession.id);
  }

  async function showActiveSessionLocation(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.alert('Error', 'Session not found.'); return; }
    if (session.lat && session.lng) {
      await location().showLocationDirections(session.lat, session.lng, session.lecturer || 'Lecturer', session.courseCode);
    } else {
      await MODAL.alert('Location Not Available', `No location data available for ${session.courseCode}. The lecturer hasn't enabled location sharing for this session.`, { icon: '📍' });
    }
  }

  async function showClassLocation(courseCode, lecId) {
    const allActiveSessions = await DB.SESSION.getAll();
    const activeSession = allActiveSessions.find(s => s.courseCode === courseCode && s.lecFbId === lecId && s.active === true);
    if (activeSession && activeSession.lat && activeSession.lng) {
      await location().showLocationDirections(activeSession.lat, activeSession.lng, activeSession.lecturer || 'Lecturer', courseCode);
    } else {
      const lecturer = core().cache.lecturers.get
            if (lecturer && lecturer.lat && lecturer.lng) {
        await location().showLocationDirections(lecturer.lat, lecturer.lng, lecturer.name, courseCode);
      } else {
        await MODAL.alert('Location Not Available', 
          `No location data available for ${courseCode}. The lecturer hasn't started an active session or shared their location.`,
          { icon: '📍' }
        );
      }
    }
  }

  // Tab switching
  async function switchTab(tabName) {
    if (tabName !== 'messages') core().state.currentMessageCourse = null;
    if (tabName !== 'announcements') core().state.currentAnnouncementCourse = null;
    
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
    
    if (tabName === 'overview') await overview().loadOverview();
    else if (tabName === 'calendar') await calendar().loadCalendarView();
    else if (tabName === 'history') await history().loadHistoryView();
    else if (tabName === 'messages') await messages().loadMessagesView();
    else if (tabName === 'announcements') await messages().loadAnnouncementsView();
  }

  // Initialization
  async function init() {
    const user = AUTH.getSession();
    if (!user || user.role !== 'student') {
      APP.goTo('landing');
      return;
    }
    core().setCurrentStudent(user);
    
    console.log('[STUDENT] Initializing for student:', core().state.currentStudent.studentId);
    
    document.addEventListener('click', function audioPermissionHandler() {
      location().requestAudioPermission();
      document.removeEventListener('click', audioPermissionHandler);
    }, { once: true });
    
    core().showLoadingIndicator();
    const startTime = Date.now();
    
    await Promise.all([
      overview().loadStudentData(),
      timetable().loadTimetable(),
      timetable().loadPersonalStudyTimes()
    ]);
    
    await overview().loadOverview();
    startAutoRefresh();
    startNotificationCheck();
    startUpcomingSessionsCheck();
    
    core().updateSidebarInfo();
    core().hideLoadingIndicator();
    
    console.log(`[STUDENT] Initialized in ${Date.now() - startTime}ms`);
  }

  return {
    init,
    switchTab,
    directCheckIn,
    checkInFromTimetable,
    showActiveSessionLocation,
    showClassLocation,
    logout: core().logout
  };
})();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => STUDENT_MAIN.init());
} else {
  STUDENT_MAIN.init();
}

window.STUDENT_MAIN = STUDENT_MAIN;
