/* student-core.js — Core utilities and state management for Student Dashboard */
'use strict';

const STUDENT_CORE = (() => {
  // State management
  const state = {
    currentStudent: null,
    currentSelectedYear: null,
    currentSelectedSemester: null,
    enrolledCourses: [],
    allStudentSessions: [],
    lecturersMap: new Map(),
    timetable: [],
    personalStudyTimes: [],
    currentFilterCourseKey: null,
    currentFilterLecturer: null,
    currentMessageCourse: null,
    currentAnnouncementCourse: null,
    activeUpcomingNotifications: new Set(),
    currentHistoryPage: 1,
    itemsPerPage: 15,
    audioContext: null,
    refreshInterval: null,
    notificationCheckInterval: null,
    upcomingCheckInterval: null,
    activeSessionListener: null
  };

  // Cache system
  const cache = {
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

  // Helper function to format time display in 24-hour format
  function formatTime24(timeStr) {
    if (!timeStr) return '—';
    const [hours, minutes] = timeStr.split(':').map(Number);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Helper function to format time display in 12-hour format
  function formatTime12(timeStr) {
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
    if (percentage >= 60) return { level: 'warning', text: 'Needs Attention', color: 'var(--amber)', icon: '⚠' };
    return { level: 'critical', text: 'At Risk', color: 'var(--danger)', icon: '❌' };
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

  // Show loading indicator
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

  function hideLoadingIndicator() {}

  function updateSidebarInfo() {
    const sidebarName = document.getElementById('student-sidebar-name');
    const sidebarId = document.getElementById('student-sidebar-id');
    const userName = document.getElementById('student-dash-name');
    const userAvatar = document.getElementById('student-avatar');
    
    if (sidebarName) sidebarName.textContent = state.currentStudent?.name || 'Student';
    if (sidebarId) sidebarId.textContent = `ID: ${state.currentStudent?.studentId}`;
    if (userName) userName.textContent = state.currentStudent?.name || state.currentStudent?.email;
    if (userAvatar) userAvatar.textContent = '🎓';
  }

  // Stop all timers
  function stopAllTimers() {
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    if (state.notificationCheckInterval) clearInterval(state.notificationCheckInterval);
    if (state.upcomingCheckInterval) clearInterval(state.upcomingCheckInterval);
    if (state.activeSessionListener) { 
      state.activeSessionListener(); 
      state.activeSessionListener = null; 
    }
  }

  // Logout function
  function logout() { 
    stopAllTimers(); 
    AUTH.clearSession(); 
    APP.goTo('landing'); 
  }

  // Get current student
  function getCurrentStudent() {
    return state.currentStudent;
  }

  function setCurrentStudent(student) {
    state.currentStudent = student;
  }

  // Get enrolled courses
  function getEnrolledCourses() {
    return state.enrolledCourses;
  }

  function setEnrolledCourses(courses) {
    state.enrolledCourses = courses;
  }

  // Get state
  function getState() {
    return state;
  }

  // Get cache
  function getCache() {
    return cache;
  }

  // Get rate limiters
  function getRateLimiters() {
    return rateLimiters;
  }

  return {
    // State
    state,
    cache,
    rateLimiters,
    
    // Utilities
    getAvailableYears,
    timeToMinutes,
    formatTime24,
    formatTime12,
    getTimeSlotsBetween,
    getAcademicPeriod,
    getRiskLevel,
    formatTime,
    getCurrentDay,
    escapeHtml,
    doTimesOverlap,
    getCourseKey,
    getCachedOrFetch,
    
    // UI helpers
    showLoadingIndicator,
    hideLoadingIndicator,
    updateSidebarInfo,
    stopAllTimers,
    logout,
    
    // State accessors
    getCurrentStudent,
    setCurrentStudent,
    getEnrolledCourses,
    setEnrolledCourses,
    getState,
    getCache
  };
})();

window.STUDENT_CORE = STUDENT_CORE;
