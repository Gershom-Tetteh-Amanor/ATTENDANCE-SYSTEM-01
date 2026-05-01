/* session.js — Lecturer & TA Dashboard with Complete Functionality, Sidebar Navigation, and Fixes */
'use strict';

// Self-registration to ensure LEC is available globally
(function() {
  if (typeof window.LEC === 'undefined') {
    window.LEC = {};
  }
})();

const LEC = (() => {
  const S = { 
    session: null, 
    locOn: true, 
    lecLat: null, 
    lecLng: null, 
    locAcquired: false, 
    tickTimer: null, 
    unsubRec: null, 
    unsubBlk: null,
    currentViewYear: null,
    currentViewSemester: null,
    currentViewCourse: null,
    refreshInterval: null,
    currentReportData: null,
    activeSessionsRefresh: null,
    currentSessionRecords: null,
    currentSessionData: null
  };

  // Helper to get current lecturer/TA ID
  function getCurrentLecturerId() {
    const user = AUTH.getSession();
    if (!user) {
      console.error('[LEC] No user session found');
      return null;
    }
    if (user.role === 'ta') {
      const lecId = user.activeLecturerId || user.id;
      console.log('[LEC] Current TA accessing lecturer:', lecId);
      return lecId;
    }
    console.log('[LEC] Current lecturer ID:', user.id);
    return user.id;
  }

  function getCurrentUser() {
    return AUTH.getSession();
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Helper to get academic year and semester from a date
  function getAcademicPeriod(date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth();
    let semester;
    let academicYear;
    
    if (month >= 7) { // August (7) to December (11)
      semester = 1;
      academicYear = year;
    } else if (month >= 0 && month <= 6) { // January (0) to July (6)
      semester = 2;
      academicYear = year;
    } else {
      semester = 1;
      academicYear = year;
    }
    
    return { year: academicYear, semester };
  }

  // Helper function to get min attendance percentage from admin settings
  function getMinAttendancePercentage() {
    const saved = localStorage.getItem('min_attendance_percentage');
    if (saved && !isNaN(parseInt(saved))) {
      return parseInt(saved);
    }
    return 75; // Default 75%
  }

  // Helper function to get attendance risk category based on admin benchmark
  function getAttendanceCategory(percentage, minBenchmark) {
    const benchmark = minBenchmark || getMinAttendancePercentage();
    const rangeSize = Math.floor(benchmark / 2); // Split below benchmark into two equal ranges
    const goodUpper = benchmark + 10;
    
    if (percentage >= goodUpper) return { level: 'excellent', text: '✅ Excellent', color: 'var(--teal)' };
    if (percentage >= benchmark) return { level: 'good', text: '⚠️ Good', color: 'var(--amber)' };
    if (percentage >= benchmark - rangeSize) return { level: 'atRisk', text: '🔴 At Risk', color: '#e67e22' };
    return { level: 'critical', text: '❌ Critical', color: 'var(--danger)' };
  }

  // ==================== GLOBAL VALUE UPDATE FUNCTIONS ====================
  window.updateDurVal = function(val) {
    const mins = parseInt(val);
    let display = '';
    if (mins < 60) { 
      display = mins + ' min'; 
    } else { 
      const hours = Math.floor(mins / 60); 
      const remainingMins = mins % 60; 
      display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; 
    }
    const el = document.getElementById('l-dur-val');
    if (el) el.textContent = display;
  };
  
  window.updateRadiusVal = function(val) {
    const el = document.getElementById('l-rad-val');
    if (el) el.textContent = val + 'm';
  };
  
  window.updateStartDurVal = function(val) {
    const mins = parseInt(val);
    let display = '';
    if (mins < 60) { 
      display = mins + ' min'; 
    } else { 
      const hours = Math.floor(mins / 60); 
      const remainingMins = mins % 60; 
      display = remainingMins > 0 ? hours + 'h ' + remainingMins + 'min' : hours + 'h'; 
    }
    const el = document.getElementById('start-dur-val');
    if (el) el.textContent = display;
  };
  
  window.updateStartRadiusVal = function(val) {
    const el = document.getElementById('start-rad-val');
    if (el) el.textContent = val + 'm';
  };

  // ==================== SWITCH TAB FUNCTION (SIDEBAR NAVIGATION) ====================
  async function switchTab(tabName) {
    console.log('[LEC] Switching to tab:', tabName);
    
    // Update sidebar active state
    document.querySelectorAll('#view-lecturer .nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      }
    });
    
    // Hide all tab contents
    document.querySelectorAll('#view-lecturer .tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    // Show selected tab content
    const activeContent = document.getElementById(`${tabName}-view`);
    if (activeContent) {
      activeContent.style.display = 'block';
    }
    
    // Update topbar title
    const tbTitle = document.getElementById('lec-tb-title');
    const titles = {
      mycourses: '📚 My Courses',
      session: '🟢 Active Sessions',
      records: '📋 Attendance Records',
      reports: '📊 Reports',
      courses: '📖 Course Management',
      tas: '👥 Teaching Assistants',
      biometric: '🔐 Passkey Reset'
    };
    if (tbTitle && titles[tabName]) {
      tbTitle.textContent = titles[tabName];
    }
    
    // Load content based on tab
    if (tabName === 'mycourses') {
      await loadDashboardStats();
      await loadMyCoursesGrid();
    } else if (tabName === 'session') {
      await _loadActiveSessionsOnly();
    } else if (tabName === 'records') {
      await _loadRecords();
    } else if (tabName === 'reports') {
      await _loadReports();
    } else if (tabName === 'courses') {
      await _loadCourses();
    } else if (tabName === 'tas') {
      await _loadTAs();
    } else if (tabName === 'biometric') {
      await _loadBiometricTab();
    }
  }

  // ==================== LOAD DASHBOARD STATS ====================
  async function loadDashboardStats() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const now = new Date();
      const period = getAcademicPeriod(now);
      const year = period.year;
      const semester = period.semester;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === year && c.semester === semester && c.active !== false
      );
      
      const allSessions = await DB.SESSION.byLec(myId);
      const periodSessions = allSessions.filter(s => 
        s.year === year && s.semester === semester && !s.active
      );
      
      // Get unique students for this period
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          Object.values(session.records).forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      // Calculate average attendance
      let totalCheckins = 0;
      let sessionCount = periodSessions.length;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = sessionCount > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (sessionCount * studentsSet.size)) * 100) 
        : 0;
      
      // Update stats cards
      const coursesEl = document.getElementById('stat-courses');
      const sessionsEl = document.getElementById('stat-sessions');
      const studentsEl = document.getElementById('stat-students');
      const attendanceEl = document.getElementById('stat-attendance');
      
      if (coursesEl) coursesEl.textContent = periodCourses.length;
      if (sessionsEl) sessionsEl.textContent = sessionCount;
      if (studentsEl) studentsEl.textContent = studentsSet.size;
      if (attendanceEl) attendanceEl.textContent = `${avgAttendance}%`;
      
      // Update sidebar info
      const user = getCurrentUser();
      const sidebarName = document.getElementById('sidebar-name');
      const sidebarDept = document.getElementById('sidebar-dept');
      const lecAvatar = document.getElementById('lec-avatar');
      const lecName = document.getElementById('lec-tb-name');
      
      if (sidebarName) sidebarName.textContent = user?.name || 'Lecturer';
      if (sidebarDept) sidebarDept.textContent = user?.department || '';
      if (lecAvatar) lecAvatar.textContent = user?.role === 'ta' ? '👥' : '👨‍🏫';
      if (lecName) lecName.textContent = user?.name || user?.email;
      
      // Show/hide TA tab
      const taTab = document.getElementById('ta-tab-nav');
      if (taTab) {
        taTab.style.display = user?.role === 'ta' ? 'none' : 'flex';
      }
      
    } catch(err) {
      console.error('[LEC] Load stats error:', err);
    }
  }

  // ==================== MY COURSES GRID ====================
  async function loadMyCoursesGrid() {
    const container = document.getElementById('courses-list-container');
    if (!container) return;
    
    const now = new Date();
    const currentPeriod = getAcademicPeriod(now);
    const myId = getCurrentLecturerId();
    
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">📅 Academic Year</label>
          <select id="grid-year" class="fi" onchange="LEC.viewCoursesGrid()">
            ${availableYears.map(y => `<option value="${y}" ${y === currentPeriod.year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="fl">📖 Semester</label>
          <select id="grid-semester" class="fi" onchange="LEC.viewCoursesGrid()">
            <option value="1" ${currentPeriod.semester === 1 ? 'selected' : ''}>First Semester</option>
            <option value="2" ${currentPeriod.semester === 2 ? 'selected' : ''}>Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.viewCoursesGrid()">🔍 View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.showAddCourse()">➕ Add Course</button>
        </div>
      </div>
      <div id="courses-grid-container"></div>
      <div id="add-course-section" style="display:none; margin-top:20px"></div>
    `;
    
    await viewCoursesGrid();
  }

  async function viewCoursesGrid() {
    const year = document.getElementById('grid-year')?.value;
    const semester = document.getElementById('grid-semester')?.value;
    const container = document.getElementById('courses-grid-container');
    
    if (!year || !semester) {
      container.innerHTML = '<div class="att-empty">⚠️ Please select both Year and Semester</div>';
      return;
    }
    
    S.currentViewYear = parseInt(year);
    S.currentViewSemester = parseInt(semester);
    
    // Load stats for filtered period
    await loadFilteredStats(year, semester);
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">📭 No courses found for ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}.<br/>Click "Add Course" to create one.</div></div>`;
        return;
      }
      
      const allSessions = await DB.SESSION.byLec(myId);
      
      let html = `<div class="courses-grid">`;
      for (const course of periodCourses) {
        const courseSessions = allSessions.filter(s => s.courseCode === course.code && s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active);
        const sessionCount = courseSessions.length;
        
        // Get enrolled students from enrollments
        const enrollments = await DB.ENROLLMENT.getStudentEnrollments(null, myId);
        const courseEnrollments = enrollments.filter(e => e.courseCode === course.code && e.year === parseInt(year) && e.semester === parseInt(semester));
        const studentCount = courseEnrollments.length;
        
        // Calculate average attendance
        let totalCheckins = 0;
        for (const session of courseSessions) {
          totalCheckins += session.records ? Object.values(session.records).length : 0;
        }
        const avgAttendance = sessionCount > 0 && studentCount > 0 ? Math.round((totalCheckins / (sessionCount * studentCount)) * 100) : 0;
        
        html += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(course.code)}</span>
              <span class="badge">${sessionCount} sessions</span>
            </div>
            <div class="course-name">${escapeHtml(course.name)}</div>
            <div class="course-stats">
              <span>🎓 ${studentCount} students enrolled</span>
              <span>📊 ${avgAttendance}% avg attendance</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-ug btn-sm" onclick="LEC.showStartSessionPage('${course.code}', '${escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">▶ Start Session</button>
              <button class="btn btn-outline btn-sm" onclick="LEC.editCourse('${course.code}', '${escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">✏️ Edit</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
      
      // Add announcement button after courses load
      await addAnnouncementButton();
      
    } catch(err) {
      console.error('[LEC] View courses error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function loadFilteredStats(year, semester) {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      const allSessions = await DB.SESSION.byLec(myId);
      const periodSessions = allSessions.filter(s => 
        s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active
      );
      
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          Object.values(session.records).forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      let totalCheckins = 0;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = periodSessions.length > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (periodSessions.length * studentsSet.size)) * 100) 
        : 0;
      
      document.getElementById('stat-courses').textContent = periodCourses.length;
      document.getElementById('stat-sessions').textContent = periodSessions.length;
      document.getElementById('stat-students').textContent = studentsSet.size;
      document.getElementById('stat-attendance').textContent = `${avgAttendance}%`;
      
    } catch(err) {
      console.error('[LEC] Load filtered stats error:', err);
    }
  }

  // ==================== ACTIVE SESSIONS ====================
  async function _loadActiveSessionsOnly() {
    const container = document.getElementById('active-sessions-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading active sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="att-empty">⚠️ Unable to load sessions</div>';
        return;
      }
      
      const allSessions = await DB.SESSION.byLec(myId);
      const activeSessions = allSessions.filter(s => s.active === true);
      
      if (activeSessions.length === 0) {
        container.innerHTML = '<div class="att-empty">📭 No active sessions. Go to "My Courses" to start a session.</div>';
        return;
      }
      
      let html = `<div class="courses-grid" style="grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));">`;
      
      for (const session of activeSessions) {
        const timeRemaining = Math.max(0, session.expiresAt - Date.now());
        const minutesLeft = Math.floor(timeRemaining / 60000);
        const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
        const records = session.records ? Object.values(session.records).length : 0;
        
        if (timeRemaining <= 0) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          continue;
        }
        
        const qrPayload = btoa(JSON.stringify({ 
          id: session.id, token: session.token, code: session.courseCode, 
          course: session.courseName, date: session.date, expiresAt: session.expiresAt,
          lat: session.lat, lng: session.lng, radius: session.radius, locEnabled: session.locEnabled
        })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        
        const qrUrl = `${CONFIG.SITE_URL}?ci=${qrPayload}`;
        
        html += `
          <div class="course-card" style="border-left: 4px solid #1d9e75;">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(session.courseCode)}</span>
              <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
            </div>
            <div class="course-name">${escapeHtml(session.courseName)}</div>
            <div class="course-stats">
              <span>📅 ${session.date}</span>
              <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
              <span>👥 ${records} checked in</span>
            </div>
            <div id="qr-${session.id}" style="text-align:center; margin:15px 0; padding:10px; background:#fff; border-radius:8px;"></div>
            <div class="course-buttons">
              <button class="btn btn-secondary btn-sm" onclick="LEC.downloadSessionQR('${session.id}')">📥 Download QR</button>
              <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${qrUrl}')">📋 Copy Link</button>
              <button class="btn btn-danger btn-sm" onclick="LEC.endSessionById('${session.id}')">⏹️ End Session</button>
            </div>
          </div>
        `;
        
        setTimeout(() => {
          const qrContainer = document.getElementById(`qr-${session.id}`);
          if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: qrUrl, width: 150, height: 150 });
          }
        }, 100);
      }
      html += `</div>`;
      container.innerHTML = html;
      
      if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
      S.activeSessionsRefresh = setInterval(() => _checkAndUpdateActiveSessions(), 5000);
    } catch(err) {
      console.error('Load active sessions error:', err);
      container.innerHTML = `<div class="att-empty">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function _checkAndUpdateActiveSessions() {
    try {
      const myId = getCurrentLecturerId();
      if (!myId) return;
      
      const allSessions = await DB.SESSION.byLec(myId);
      const activeSessions = allSessions.filter(s => s.active === true);
      let needsRefresh = false;
      
      for (const session of activeSessions) {
        if (session.expiresAt <= Date.now()) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          needsRefresh = true;
        }
      }
      if (needsRefresh) await _loadActiveSessionsOnly();
    } catch(e) { console.warn(e); }
  }

  async function endSessionById(sessionId) {
    const confirmed = await MODAL.confirm('⏹️ End Session', 'End this session? All records will be saved.', { confirmLabel: 'Yes, End Session', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), endedReason: 'manual' });
      await MODAL.success('Session Ended', '✅ The session has been ended.');
      await _loadActiveSessionsOnly();
      await loadDashboardStats();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  function downloadSessionQR(sessionId) {
    const qrContainer = document.getElementById(`qr-${sessionId}`);
    const canvas = qrContainer?.querySelector('canvas');
    if (canvas) {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `QR_${sessionId}.png`;
      a.click();
    } else {
      MODAL.alert('QR not ready', 'Please wait for QR code to generate.');
    }
  }

  // ==================== START SESSION PAGE ====================
  async function showStartSessionPage(courseCode, courseName, year, semester) {
    sessionStorage.setItem('starting_course_code', courseCode);
    sessionStorage.setItem('starting_course_name', courseName);
    sessionStorage.setItem('starting_course_year', year);
    sessionStorage.setItem('starting_course_semester', semester);
    
    const container = document.getElementById('courses-grid-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="start-session-page" style="max-width: 500px; margin: 0 auto;">
        <button class="btn btn-outline btn-sm" onclick="LEC.viewCoursesGrid()" style="margin-bottom: 20px;">← Back to Courses</button>
        <div class="inner-panel">
          <h2>▶️ Start New Session</h2>
          <p class="sub">Course: <strong>${escapeHtml(courseCode)} - ${escapeHtml(courseName)}</strong></p>
          <p class="sub" style="color: var(--teal); margin-top: -10px;">📅 ${year} - ${semester === 1 ? 'First Semester' : 'Second Semester'}</p>
          <div class="sl-row" style="margin-bottom: 20px;">
            <label class="fl">⏱️ Duration (minutes)</label>
            <input type="range" id="start-dur" min="5" max="180" value="60" oninput="updateStartDurVal(this.value)"/>
            <span class="sv" id="start-dur-val">60 min</span>
          </div>
          <div class="loc-step">
            <h3>📍 Classroom Location (Required)</h3>
            <p>Set your current location as the classroom fence. Students must be within this radius to check in.</p>
            <div class="sl-row" style="margin-bottom: 8px;">
              <label class="fl">📏 Fence radius</label>
              <input type="range" id="start-radius" min="20" max="500" value="100" oninput="updateStartRadiusVal(this.value)"/>
              <span class="sv" id="start-rad-val">100m</span>
            </div>
            <button class="btn btn-teal" id="start-get-loc-btn" onclick="LEC.getStartLocation()">📍 Get my location</button>
            <div class="loc-result" id="start-loc-result"></div>
          </div>
          <button class="btn btn-ug" id="start-gen-btn" onclick="LEC.generateAndStartSession()" disabled style="margin-top: 20px;">▶️ Generate QR Code & Start Session</button>
          <p class="gen-hint" id="start-gen-hint">📍 Get your classroom location first.</p>
        </div>
      </div>
    `;
    S.lecLat = null;
    S.lecLng = null;
    S.locAcquired = false;
  }
  
  function getStartLocation() {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    if (!btn || !res) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Getting location…';
    res.className = 'loc-result';
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…';
    
    if (!navigator.geolocation) { _demoStartLoc(); return; }
    
    navigator.geolocation.getCurrentPosition(p => {
      S.lecLat = p.coords.latitude;
      S.lecLng = p.coords.longitude;
      S.locAcquired = true;
      _startLocOK(p.coords.accuracy);
    }, () => _demoStartLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  
  function _demoStartLoc() {
    S.lecLat = 5.6505 + (Math.random() - .5) * .001;
    S.lecLng = -0.1875 + (Math.random() - .5) * .001;
    S.locAcquired = true;
    _startLocOK(null);
  }
  
  function _startLocOK(acc) {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    const genBtn = document.getElementById('start-gen-btn');
    const genHint = document.getElementById('start-gen-hint');
    
    if (!btn || !res) return;
    
    res.className = 'loc-result ok';
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`;
    btn.disabled = false;
    btn.textContent = '🔄 Refresh location';
    
    if (genBtn) {
      genBtn.disabled = false;
      if (genHint) genHint.style.display = 'none';
    }
  }
  
  async function generateAndStartSession() {
    const courseCode = sessionStorage.getItem('starting_course_code');
    const courseName = sessionStorage.getItem('starting_course_name');
    const courseYear = parseInt(sessionStorage.getItem('starting_course_year'));
    const courseSemester = parseInt(sessionStorage.getItem('starting_course_semester'));
    const mins = document.getElementById('start-dur') ? +(document.getElementById('start-dur').value) : 60;
    
    if (!courseCode || !courseName) {
      await MODAL.alert('Error', '⚠️ Course information missing.');
      return;
    }
    if (!S.locAcquired || !S.lecLat) {
      await MODAL.alert('Location required', '📍 Get your classroom location first.');
      return;
    }
    
    UI.btnLoad('start-gen-btn', true);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', '⚠️ Could not identify your account.');
        return;
      }
      
      const courseExists = await DB.COURSE.get(myId, courseCode, courseYear, courseSemester);
      if (!courseExists) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Error', `⚠️ Course ${courseCode} does not exist in your account.`);
        return;
      }
      
      const user = getCurrentUser();
      const existing = await DB.SESSION.byLec(myId);
      if (existing.find(s => s.courseCode === courseCode && s.year === courseYear && s.semester === courseSemester && s.active)) {
        UI.btnLoad('start-gen-btn', false, 'Start Session');
        await MODAL.error('Session conflict', `⚠️ A session for ${courseCode} is already active.`);
        return;
      }
      
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
      const token = Math.random().toString(36).substring(2, 22);
      const sessId = token.slice(0, 12);
      const radius = document.getElementById('start-radius') ? +(document.getElementById('start-radius').value) : 100;
      
      const sessionData = {
        id: sessId, token: token, courseCode: courseCode, courseName: courseName,
        lecturer: user?.name || '', lecId: user?.lecId || '', lecFbId: myId,
        department: user?.department || '', date: dateStr,
        expiresAt: Date.now() + mins * 60000, durationMins: mins,
        lat: S.lecLat, lng: S.lecLng, radius: radius, locEnabled: true,
        active: true, createdAt: Date.now(), year: courseYear, semester: courseSemester,
        records: {}, sids: {}, devs: {}
      };
      
      await DB.SESSION.set(sessId, sessionData);
      
      // Add notification
      if (typeof NOTIFICATIONS !== 'undefined') {
        await NOTIFICATIONS.add({
          title: 'Session Started',
          message: `${courseCode} - ${courseName} session has started. QR code is ready.`,
          type: 'success',
          link: null
        });
      }
      
      await MODAL.success('Session Started', `✅ Session for ${courseCode} has started!`);
      
      sessionStorage.removeItem('starting_course_code');
      sessionStorage.removeItem('starting_course_name');
      sessionStorage.removeItem('starting_course_year');
      sessionStorage.removeItem('starting_course_semester');
      switchTab('session');
    } catch(err) {
      UI.btnLoad('start-gen-btn', false, 'Start Session');
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== RECORDS TAB ====================
  async function _loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="records-year" class="fi" onchange="LEC.populateRecordsCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="records-semester" class="fi" onchange="LEC.populateRecordsCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="records-course" class="fi" onchange="LEC.loadSessionList()">
            <option value="">Select Course First</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📅 Session Date</label>
          <select id="records-session" class="fi">
            <option value="">Select Session</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadSessionRecords()">🔍 Load Records</button>
        </div>
      </div>
      <div id="records-results"><div class="att-empty">📭 Select filters and click Load Records</div></div>
    `;
  }

  async function populateRecordsCourses() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${escapeHtml(course.code)}|${escapeHtml(course.name)}">${escapeHtml(course.code)} - ${escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
      courseSelect.onchange = () => loadSessionList();
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }

  async function loadSessionList() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseValue = document.getElementById('records-course')?.value;
    const sessionSelect = document.getElementById('records-session');
    
    if (!year || !semester || !courseValue) {
      sessionSelect.innerHTML = '<option value="">Select Course First</option>';
      return;
    }
    
    const [courseCode] = courseValue.split('|');
    sessionSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading sessions...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allSessions = await DB.SESSION.byLec(myId);
      const filteredSessions = allSessions.filter(s => 
        s.courseCode === courseCode && 
        s.year === parseInt(year) && 
        s.semester === parseInt(semester) &&
        !s.active
      ).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (filteredSessions.length === 0) {
        sessionSelect.innerHTML = '<option value="">📭 No completed sessions found</option>';
        return;
      }
      
      let options = '<option value="">Select Session</option>';
      for (const session of filteredSessions) {
        const recordsCount = session.records ? Object.values(session.records).length : 0;
        options += `<option value="${session.id}">${session.date} - ${recordsCount} students checked in</option>`;
      }
      sessionSelect.innerHTML = options;
      
    } catch(err) {
      console.error('Load session list error:', err);
      sessionSelect.innerHTML = '<option value="">❌ Error loading sessions</option>';
    }
  }

  async function loadSessionRecords() {
    const sessionId = document.getElementById('records-session')?.value;
    const container = document.getElementById('records-results');
    
    if (!sessionId) {
      await MODAL.alert('Missing Info', '⚠️ Please select a session.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading session records...</div>';
    
    try {
      const session = await DB.SESSION.get(sessionId);
      if (!session) throw new Error('Session not found');
      
      const records = session.records ? Object.values(session.records) : [];
      const totalRecords = records.length;
      const displayRecords = records.slice(0, 10);
      
      S.currentSessionData = session;
      S.currentSessionRecords = records;
      
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: white;">📋 Session Records: ${escapeHtml(session.courseCode)} - ${escapeHtml(session.courseName)}</h3>
          <p style="margin: 5px 0 0; opacity: 0.9;">📅 ${session.date} | 👥 Total Check-ins: ${totalRecords}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">Showing ${Math.min(10, totalRecords)} of ${totalRecords} records</p>
        </div>
      `;
      
      if (displayRecords.length === 0) {
        html += '<div class="no-rec">📭 No check-in records for this session.</div>';
      } else {
        html += `
          <div style="overflow-x: auto;">
            <table class="session-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Check-in Time</th>
                  <th>Verification Method</th>
                  <th>Distance</th>
                </tr>
              </thead>
              <tbody>
                ${displayRecords.map((r, i) => `
                  <tr>
                    <td>${i + 1}</td>
                                        <td>${escapeHtml(r.studentId)}</td
                    <td>${escapeHtml(r.name)}</td
                    <td>${r.time || new Date(r.checkedAt).toLocaleTimeString()}</td
                    <td>${r.authMethod === 'webauthn' ? '🔐 Biometric' : (r.authMethod === 'manual' ? '📝 Manual' : '—')}</td
                    <td>${r.locNote || (r.distanceMeters ? r.distanceMeters + 'm' : '—')}</td
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        
        if (totalRecords > 10) {
          html += `<p class="note" style="margin-top: 12px;">📌 Showing first 10 records. Download Excel for all ${totalRecords} records.</p>`;
        }
      }
      
      html += `
        <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
          <button class="btn btn-ug" onclick="LEC.exportSessionRecordsToExcel()">📊 Export All Records to Excel</button>
          <button class="btn btn-secondary" onclick="LEC.showManualCheckinModal()">📝 Manual Check-in (Single ID)</button>
          <button class="btn btn-teal" onclick="LEC.showBulkCheckinModal()">📎 Bulk Upload IDs (Excel/CSV)</button>
        </div>
      `;
      
      container.innerHTML = html;
      
    } catch(err) {
      console.error('Load session records error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportSessionRecordsToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    
    if (!S.currentSessionRecords || !S.currentSessionData) {
      await MODAL.alert('No Data', '📭 Please load session records first.');
      return;
    }
    
    const session = S.currentSessionData;
    const records = S.currentSessionRecords;
    
    const wsData = [
      [`Attendance Records - ${session.courseCode} - ${session.courseName}`],
      [`Session Date: ${session.date}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Check-ins: ${records.length}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Check-in Time', 'Verification Method', 'Distance', 'Location Note']
    ];
    
    records.forEach((r, i) => {
      wsData.push([
        i + 1,
        r.studentId || '',
        r.name || '',
        r.time || new Date(r.checkedAt).toLocaleTimeString(),
        r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
        r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—'),
        r.locNote || ''
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}`);
    XLSX.writeFile(wb, `UG_Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}.xlsx`);
    await MODAL.success('Export Complete', `✅ All ${records.length} records exported.`);
  }

  async function showManualCheckinModal() {
    if (!S.currentSessionData) {
      await MODAL.alert('No Session', '📭 Please load a session first.');
      return;
    }
    
    const studentId = await MODAL.prompt(
      'Manual Check-in',
      'Enter Student ID:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Check In' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.alert('Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    // Check if student is enrolled in this course
    const myId = getCurrentLecturerId();
    const isEnrolled = await DB.ENROLLMENT.isEnrolled(studentId.toUpperCase(), myId, S.currentSessionData.courseCode);
    
    if (!isEnrolled) {
      const enrollNow = await MODAL.confirm('Not Enrolled', `${student.name} is not enrolled in ${S.currentSessionData.courseCode}. Enroll now?`, { confirmLabel: 'Yes, Enroll' });
      if (!enrollNow) return;
      await DB.ENROLLMENT.enroll(
        studentId.toUpperCase(), 
        myId, 
        S.currentSessionData.courseCode, 
        S.currentSessionData.courseName, 
        S.currentSessionData.semester, 
        S.currentSessionData.year
      );
    }
    
    // Check if already checked in
    if (await DB.SESSION.hasSid(S.currentSessionData.id, studentId.toUpperCase())) {
      await MODAL.alert('Already Checked In', `${student.name} already checked in.`);
      return;
    }
    
    await DB.SESSION.addDevice(S.currentSessionData.id, `manual_${Date.now()}`);
    await DB.SESSION.addSid(S.currentSessionData.id, studentId.toUpperCase());
    await DB.SESSION.pushRecord(S.currentSessionData.id, {
      name: student.name, 
      studentId: studentId.toUpperCase(), 
      biometricId: `manual_${Date.now()}`,
      authMethod: 'manual', 
      locNote: 'Manual check-in by lecturer', 
      time: new Date().toLocaleTimeString(),
      checkedAt: Date.now(), 
      manualCheckin: true
    });
    
    await MODAL.success('Checked In', `✅ ${student.name} checked in successfully.`);
    await loadSessionRecords();
  }

  async function showBulkCheckinModal() {
    if (!S.currentSessionData) {
      await MODAL.alert('No Session', '📭 Please load a session first.');
      return;
    }
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,.xls,.csv';
    fileInput.onchange = async (e) => await processBulkUpload(e.target.files[0]);
    fileInput.click();
  }

  async function processBulkUpload(file) {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        let studentIds = [];
        
        if (file.name.endsWith('.csv')) {
          const text = data;
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            const parts = line.split(/[,\t]/);
            for (const part of parts) {
              const cleaned = part.trim().toUpperCase();
              if (cleaned && /^[0-9]{8,}$/.test(cleaned)) {
                studentIds.push(cleaned);
              }
            }
          }
        } else {
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          
          for (const row of rows) {
            if (row && Array.isArray(row)) {
              for (const cell of row) {
                const cleaned = String(cell).trim().toUpperCase();
                if (cleaned && /^[0-9]{8,}$/.test(cleaned)) {
                  studentIds.push(cleaned);
                }
              }
            }
          }
        }
        
        studentIds = [...new Set(studentIds)];
        
        if (studentIds.length === 0) {
          await MODAL.alert('No Valid IDs', 'No valid student IDs found in the file.');
          return;
        }
        
        const confirmed = await MODAL.confirm(
          'Bulk Check-in',
          `Found ${studentIds.length} student IDs. Process them now?`,
          { confirmLabel: 'Yes, Process', confirmCls: 'btn-ug' }
        );
        
        if (!confirmed) return;
        
        const myId = getCurrentLecturerId();
        let successCount = 0;
        let failedCount = 0;
        let notEnrolledCount = 0;
        const failedIds = [];
        
        for (const studentId of studentIds) {
          const student = await DB.STUDENTS.byStudentId(studentId);
          
          if (!student) {
            failedCount++;
            failedIds.push(`${studentId} (not found)`);
            continue;
          }
          
          const isEnrolled = await DB.ENROLLMENT.isEnrolled(studentId, myId, S.currentSessionData.courseCode);
          
          if (!isEnrolled) {
            notEnrolledCount++;
            failedIds.push(`${studentId} (${student.name} - not enrolled)`);
            continue;
          }
          
          if (await DB.SESSION.hasSid(S.currentSessionData.id, studentId)) {
            failedCount++;
            failedIds.push(`${studentId} (${student.name} - already checked in)`);
            continue;
          }
          
          await DB.SESSION.addDevice(S.currentSessionData.id, `bulk_${studentId}_${Date.now()}`);
          await DB.SESSION.addSid(S.currentSessionData.id, studentId);
          await DB.SESSION.pushRecord(S.currentSessionData.id, {
            name: student.name,
            studentId: studentId,
            biometricId: `bulk_${Date.now()}`,
            authMethod: 'manual',
            locNote: 'Bulk upload by lecturer',
            time: new Date().toLocaleTimeString(),
            checkedAt: Date.now(),
            bulkCheckin: true
          });
          successCount++;
        }
        
        let message = `✅ Successfully checked in: ${successCount}\n`;
        if (notEnrolledCount > 0) message += `⚠️ Not enrolled: ${notEnrolledCount}\n`;
        if (failedCount > 0) message += `❌ Failed: ${failedCount}`;
        
        await MODAL.alert('Bulk Check-in Results', message, { icon: '📊' });
        
        if (failedIds.length > 0) {
          const showDetails = await MODAL.confirm('View Failed IDs', `Show ${failedIds.length} failed IDs?`, { confirmLabel: 'Yes, Show' });
          if (showDetails) {
            await MODAL.alert('Failed IDs', failedIds.join('<br>'), { icon: '⚠️', width: '500px' });
          }
        }
        
        await loadSessionRecords();
        
      } catch(err) {
        console.error('Bulk upload error:', err);
        await MODAL.error('Error', 'Failed to process file. Please check the format.');
      }
    };
    
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  }

  // ==================== REPORTS TAB (FIXED - Only ended sessions) ==================
  async function _loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="report-year" class="fi" onchange="LEC.populateReportCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="report-semester" class="fi" onchange="LEC.populateReportCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="report-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.generateReport()">📊 Generate Report</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.exportReportToExcel()">📥 Export Excel</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">📭 Select filters and click Generate Report</div></div>
    `;
  }

  async function populateReportCourses() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${escapeHtml(course.code)}">${escapeHtml(course.code)} - ${escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseCode = document.getElementById('report-course')?.value;
    const container = document.getElementById('report-results');
    
    if (!year || !semester || !courseCode) {
      await MODAL.alert('Missing Info', '⚠️ Please select Year, Semester, and Course.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      // Get ALL sessions for this lecturer
      const allSessions = await DB.SESSION.byLec(myId);
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      console.log('[LEC] All sessions for lecturer:', allSessions.length);
      console.log('[LEC] Filtering for course:', courseCode, 'year:', yearInt, 'semester:', semInt);
      
      // FIXED: Only get ended sessions (active === false)
      const filteredSessions = allSessions.filter(s => 
        s.courseCode === courseCode && 
        s.year === yearInt && 
        s.semester === semInt &&
        s.active === false
      ).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      console.log('[LEC] Filtered ended sessions:', filteredSessions.length);
      
      if (filteredSessions.length === 0) {
        // Check if there are any sessions (even active ones) to help debug
        const anySessions = allSessions.filter(s => 
          s.courseCode === courseCode && s.year === yearInt && s.semester === semInt
        );
        console.log('[LEC] Any sessions (including active):', anySessions.length);
        
        if (anySessions.length > 0) {
          container.innerHTML = '<div class="no-rec">📭 No completed/ended sessions found for this course. Active sessions cannot be reported yet. Please end the session first or wait for it to expire.</div>';
        } else {
          container.innerHTML = '<div class="no-rec">📭 No sessions found for this course in the selected period.</div>';
        }
        return;
      }
      
      // Get enrolled students
      const enrollments = await DB.ENROLLMENT.getStudentEnrollments(null, myId);
      const courseEnrollments = enrollments.filter(e => 
        e.courseCode === courseCode && e.year === yearInt && e.semester === semInt
      );
      
      // Calculate student statistics from ended sessions only
      const studentStats = [];
      for (const enrollment of courseEnrollments) {
        const student = await DB.STUDENTS.byStudentId(enrollment.studentId);
        if (!student) continue;
        
        let attended = 0;
        for (const session of filteredSessions) {
          const records = session.records ? Object.values(session.records) : [];
          if (records.some(r => r.studentId === enrollment.studentId)) attended++;
        }
        
        const percentage = filteredSessions.length > 0 ? Math.round((attended / filteredSessions.length) * 100) : 0;
        studentStats.push({
          id: student.studentId,
          name: student.name,
          attended,
          total: filteredSessions.length,
          percentage
        });
      }
      
      studentStats.sort((a, b) => b.percentage - a.percentage);
      
      const minBenchmark = getMinAttendancePercentage();
      const rangeSize = Math.floor(minBenchmark / 2);
      const totalStudents = studentStats.length;
      const totalSessions = filteredSessions.length;
      let totalAttendance = studentStats.reduce((sum, s) => sum + s.attended, 0);
      const averageAttendance = totalSessions > 0 && totalStudents > 0 
        ? Math.round((totalAttendance / (totalSessions * totalStudents)) * 100) 
        : 0;
      
      // Calculate distribution based on admin benchmark
      const excellent = studentStats.filter(s => s.percentage >= minBenchmark + 10).length;
      const good = studentStats.filter(s => s.percentage >= minBenchmark && s.percentage < minBenchmark + 10).length;
      const atRisk = studentStats.filter(s => s.percentage >= minBenchmark - rangeSize && s.percentage < minBenchmark).length;
      const critical = studentStats.filter(s => s.percentage < minBenchmark - rangeSize).length;
      
      const displayStats = studentStats.slice(0, 10);
      const totalStatsCount = studentStats.length;
      
      // Build sessions list for display
      const sessionsListHtml = filteredSessions.slice(0, 10).map(s => `
        <div class="course-card" style="margin-bottom: 10px;">
          <div class="course-header">
            <span class="course-code">📅 ${s.date}</span>
            <span class="badge" style="background: var(--gray);">Ended</span>
          </div>
          <div class="course-stats">
            <span>👥 ${s.records ? Object.values(s.records).length : 0} students checked in</span>
            <span>⏱️ ${s.durationMins || 60} min duration</span>
          </div>
          <div class="course-buttons">
            <button class="btn btn-secondary btn-sm" onclick="LEC.viewSessionDetails('${s.id}')">View Details</button>
            <button class="btn btn-teal btn-sm" onclick="LEC.exportSingleSession('${s.id}')">📥 Download Excel</button>
          </div>
        </div>
      `).join('');
      
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: white;">📊 Attendance Report: ${escapeHtml(courseCode)}</h3>
          <p style="margin: 5px 0 0; opacity: 0.9;">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">🎯 Benchmark: ${minBenchmark}% (Good: ${minBenchmark}-${minBenchmark+9}%, Excellent: ${minBenchmark+10}+%)</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📊 Based on ${totalSessions} completed session(s)</p>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">📚 Completed Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">🎓 Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${averageAttendance}%</div><div class="stat-label">📊 Avg Attendance</div></div>
        </div>
        
        <div class="report-chart">
          <h4>📈 Attendance Distribution (Based on ${minBenchmark}% Benchmark)</h4>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (${minBenchmark+10}+%)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(totalStudents, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (${minBenchmark}-${minBenchmark+9}%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(totalStudents, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (${minBenchmark - rangeSize}-${minBenchmark-1}%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(totalStudents, 1)) * 100}%; background: #e67e22;"></div><span class="chart-value">${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<${minBenchmark - rangeSize}%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(totalStudents, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${critical} students</span></div>
        </div>
        
        <div style="margin-bottom: 30px;">
          <h4>📋 Completed Sessions (${totalSessions} total)</h4>
          <div class="courses-grid" style="grid-template-columns: 1fr;">
            ${sessionsListHtml || '<div class="no-rec">No session details available</div>'}
          </div>
          ${filteredSessions.length > 10 ? `<p class="note">Showing first 10 of ${filteredSessions.length} sessions. Download Excel for complete list.</p>` : ''}
        </div>
        
        <div style="overflow-x: auto;">
          <h4>📋 Student Details (Showing ${Math.min(10, totalStatsCount)} of ${totalStatsCount} students)</h4>
          <table class="session-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student ID</th>
                <th>Student Name</th>
                <th>Sessions Attended</th>
                <th>Total Sessions</th>
                <th>Attendance Rate</th>
                <th>Status</th>
               </tr>
            </thead>
            <tbody>
              ${displayStats.map((s, i) => {
                const category = getAttendanceCategory(s.percentage, minBenchmark);
                return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(s.id)}</td>
                    <td>${escapeHtml(s.name)}</td>
                    <td>${s.attended}</td>
                    <td>${s.total}</td>
                    <td>${s.percentage}%</td>
                    <td class="${category.level === 'excellent' ? 'status-present' : 'status-absent'}" style="color: ${category.color};">${category.text}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ${totalStatsCount > 10 ? `<p class="note" style="margin-top: 12px;">📌 Showing first 10 students. Download Excel for all ${totalStatsCount} students.</p>` : ''}
        </div>
      `;
      
      container.innerHTML = html;
      S.currentReportData = { 
        year: yearInt, semester: semInt, courseCode, studentStats, filteredSessions, totalSessions, totalStudents, 
        averageAttendance, excellent, good, atRisk, critical, minBenchmark 
      };
      
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Helper function to export a single session
  async function exportSingleSession(sessionId) {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export not loaded.');
      return;
    }
    
    try {
      const session = await DB.SESSION.get(sessionId);
      if (!session) {
        await MODAL.alert('Error', 'Session not found.');
        return;
      }
      
      const records = session.records ? Object.values(session.records) : [];
      
      const wsData = [
        [`Attendance Records - ${session.courseCode} - ${session.courseName}`],
        [`Session Date: ${session.date}`],
        [`Lecturer: ${session.lecturer || 'Unknown'}`],
        [`Department: ${session.department || 'Unknown'}`],
        [`Academic Year: ${session.year} - Semester ${session.semester === 1 ? 'First' : 'Second'}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [`Total Check-ins: ${records.length}`],
        [],
        ['#', 'Student ID', 'Student Name', 'Check-in Time', 'Verification Method', 'Distance', 'Location Note']
      ];
      
      records.forEach((r, i) => {
        wsData.push([
          i + 1,
          r.studentId || '',
          r.name || '',
          r.time || new Date(r.checkedAt).toLocaleTimeString(),
          r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
          r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—'),
          r.locNote || ''
        ]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}`);
      XLSX.writeFile(wb, `UG_Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}.xlsx`);
      await MODAL.success('Export Complete', `✅ Session exported with ${records.length} records.`);
      
    } catch(err) {
      console.error('Export session error:', err);
      await MODAL.error('Export Failed', err.message);
    }
  }

  // Helper function to view session details
  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    await MODAL.alert(`Session: ${session.courseCode} - ${session.date}`, `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div><div class="stat-card"><div class="stat-value">${session.durationMins || 60}</div><div class="stat-label">Duration</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${escapeHtml(session.department || 'Unknown')}</p>
      <div class="session-table-wrapper"><table class="session-table"><thead><tr><th>Student</th><th>ID</th><th>Time</th><th>Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.time}</td><td>${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</td></tr>`).join('')}</tbody></table></div>
    `, { icon: '📊', width: '700px' });
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    if (!S.currentReportData) { 
      await MODAL.alert('No Data', '📭 Generate a report first.'); 
      return; 
    }
    
    const { year, semester, courseCode, studentStats, totalSessions, totalStudents, averageAttendance, excellent, good, atRisk, critical, minBenchmark, filteredSessions } = S.currentReportData;
    
    const wsData = [
      [`Attendance Report - ${courseCode}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Benchmark: ${minBenchmark}% (Good: ${minBenchmark}-${minBenchmark+9}%, Excellent: ${minBenchmark+10}+%)`],
      [`Based on ${totalSessions} completed session(s)`],
      [`Total Students: ${totalStudents}`, `Average Attendance: ${averageAttendance}%`],
      [`Distribution: Excellent: ${excellent}, Good: ${good}, At Risk: ${atRisk}, Critical: ${critical}`],
      [],
      ['SESSION DETAILS'],
      ['Date', 'Course Code', 'Course Name', 'Students Checked In', 'Duration (mins)']
    ];
    
    if (filteredSessions) {
      for (const s of filteredSessions) {
        wsData.push([
          s.date,
          s.courseCode,
          s.courseName || '',
          s.records ? Object.values(s.records).length : 0,
          s.durationMins || 60
        ]);
      }
    }
    
    wsData.push([], ['STUDENT DETAILS'], ['#', 'Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Rate (%)', 'Status']);
    
    studentStats.forEach((s, i) => {
      const category = getAttendanceCategory(s.percentage, minBenchmark);
      wsData.push([i + 1, s.id, s.name, s.attended, s.total, `${s.percentage}%`, category.text]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', `✅ Report exported with all ${studentStats.length} students and ${filteredSessions?.length || 0} sessions.`);
  }

  // ==================== ANNOUNCEMENT SYSTEM ====================
  async function addAnnouncementButton() {
    const container = document.getElementById('courses-list-container');
    if (!container) return;
    
    // Check if button already exists
    if (document.getElementById('announcement-btn-container')) return;
    
    const buttonHtml = `
      <div id="announcement-btn-container" style="margin-bottom: 20px; text-align: right;">
        <button class="btn btn-gold" onclick="LEC.showAnnouncementModal()" style="width: auto; padding: 10px 20px;">
          📢 Send Course Announcement
        </button>
      </div>
    `;
    
    // Insert at the top of the container
    container.insertAdjacentHTML('afterbegin', buttonHtml);
  }

  async function showAnnouncementModal() {
    // First, get the current course selection
    const year = document.getElementById('grid-year')?.value;
    const semester = document.getElementById('grid-semester')?.value;
    const myId = getCurrentLecturerId();
    
    if (!year || !semester) {
      await MODAL.alert('No Period Selected', 'Please select an Academic Year and Semester from My Courses tab first.');
      return;
    }
    
    const allCourses = await DB.COURSE.getAllForLecturer(myId);
    const periodCourses = allCourses.filter(c => 
      c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
    );
    
    if (periodCourses.length === 0) {
      await MODAL.alert('No Courses', `No courses found for ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}.`);
      return;
    }
    
    const courseOptions = periodCourses.map(c => `<option value="${c.code}|${c.year}|${c.semester}">${c.code} - ${c.name} (${c.year} Sem ${c.semester === 1 ? 'First' : 'Second'})</option>`).join('');
    
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="field">
          <label class="fl">📚 Select Course</label>
          <select id="announcement-course" class="fi">${courseOptions}</select>
        </div>
        <div class="field">
          <label class="fl">📢 Announcement Title</label>
          <input type="text" id="announcement-title" class="fi" placeholder="e.g., Important Update, Class Cancellation, etc.">
        </div>
        <div class="field">
          <label class="fl">📝 Announcement Message</label>
          <textarea id="announcement-message" class="fi" rows="5" placeholder="Type your announcement here..."></textarea>
        </div>
        <div class="field">
          <label class="fl">🔔 Priority Level</label>
          <select id="announcement-priority" class="fi">
            <option value="info">ℹ️ Normal (Info)</option>
            <option value="warning">⚠️ Important (Warning)</option>
            <option value="danger">🚨 Urgent (Critical)</option>
          </select>
        </div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('Send Course Announcement', modalContent, { 
      confirmLabel: '📢 Send Announcement', 
      cancelLabel: 'Cancel',
      confirmCls: 'btn-ug',
      width: '550px'
    });
    
    if (!confirmed) return;
    
    const courseValue = document.getElementById('announcement-course')?.value;
    const title = document.getElementById('announcement-title')?.value.trim();
    const message = document.getElementById('announcement-message')?.value.trim();
    const priority = document.getElementById('announcement-priority')?.value;
    
    if (!courseValue || !title || !message) {
      await MODAL.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    
    const [courseCode, courseYear, courseSemester] = courseValue.split('|');
    const user = getCurrentUser();
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    
    try {
      // Get all enrolled students for this course
      const enrollments = await DB.ENROLLMENT.getStudentEnrollments(null, myId);
      const courseEnrollments = enrollments.filter(e => 
        e.courseCode === courseCode && 
        e.year === parseInt(courseYear) && 
        e.semester === parseInt(courseSemester)
      );
      
      if (courseEnrollments.length === 0) {
        await MODAL.alert('No Students', `No students enrolled in ${courseCode} for the selected period.`);
        return;
      }
      
      // Save announcement to database
      const announcement = {
        id: announcementId,
        title: title,
        message: message,
        priority: priority,
        courseCode: courseCode,
        courseName: periodCourses.find(c => c.code === courseCode)?.name || courseCode,
        year: parseInt(courseYear),
        semester: parseInt(courseSemester),
        senderId: myId,
        senderName: user?.name || 'Lecturer',
        timestamp: Date.now(),
        readBy: []
      };
      
      await DB.set(`announcements/course/${myId}/${courseCode}_${courseYear}_${courseSemester}/${announcementId}`, announcement);
      
      // Send notifications to all enrolled students
      let notifiedCount = 0;
      for (const enrollment of courseEnrollments) {
        await DB.set(`notifications/student/${enrollment.studentId}/announcements/${announcementId}`, {
          id: announcementId,
          title: `📢 ${title}`,
          message: `${courseCode}: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`,
          type: priority,
          timestamp: Date.now(),
          read: false,
          link: null,
          announcementId: announcementId
        });
        notifiedCount++;
      }
      
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${notifiedCount} students in ${courseCode}.`);
      
    } catch(err) {
      console.error('Send announcement error:', err);
      await MODAL.error('Error', 'Failed to send announcement. Please try again.');
    }
  }

  // ==================== COURSE MANAGEMENT ====================
  async function _loadCourses() {
    const container = document.getElementById('active-courses-list');
    if (!container) return;
    
    const myId = getCurrentLecturerId();
    let availableYears = [];
    if (myId) {
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      availableYears = [...new Set(allCourses.map(c => c.year))].filter(y => y).sort((a,b) => b - a);
    }
    if (availableYears.length === 0) availableYears = [2024, 2025, 2026, 2027, 2028];
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="course-year" class="fi">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}">${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="course-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadCoursesManagement()">🔍 Load Courses</button>
        </div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">📭 Select Year and Semester to view courses</div></div>
      <div id="archived-courses-list" style="margin-top: 20px;"><h3>📦 Archived Courses</h3><div class="att-empty">Select Year and Semester to view archived courses</div></div>
    `;
  }

  async function loadCoursesManagement() {
    const year = document.getElementById('course-year')?.value;
    const semester = document.getElementById('course-semester')?.value;
    const activeContainer = document.getElementById('active-courses-list-container');
    const archivedContainer = document.getElementById('archived-courses-list');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select both Year and Semester before loading courses.');
      return;
    }
    
    activeContainer.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    if (archivedContainer) archivedContainer.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const sessions = await DB.SESSION.byLec(myId);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const activeCourses = [];
      const archivedCourses = [];
      
      for (const course of allCourses) {
        if (course.year === yearInt && course.semester === semInt) {
          let sessionCount = 0;
          let lastSessionDate = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'Never';
          
          for (const session of sessions) {
            if (session.year === yearInt && session.semester === semInt && session.courseCode === course.code && !session.active) {
              sessionCount++;
              lastSessionDate = session.date;
            }
          }
          
          const courseInfo = {
            code: course.code,
            name: course.name,
            active: course.active !== false,
            sessionCount: sessionCount,
            lastSessionDate: lastSessionDate,
            disabledAt: course.disabledAt,
            year: course.year,
            semester: course.semester
          };
          
          if (course.active !== false) {
            activeCourses.push(courseInfo);
          } else {
            archivedCourses.push(courseInfo);
          }
        }
      }
      
      activeCourses.sort((a,b) => a.code.localeCompare(b.code));
      archivedCourses.sort((a,b) => a.code.localeCompare(b.code));
      
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">📭 No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = `<div class="courses-grid">${activeCourses.map(c => `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(c.code)}</span>
              <span class="badge" style="background: var(--teal);">🟢 Active</span>
            </div>
            <div class="course-name">${escapeHtml(c.name)}</div>
            <div class="course-stats">
              <span>📊 ${c.sessionCount} completed sessions</span>
              <span>📅 Last: ${c.lastSessionDate}</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-warning btn-sm" onclick="LEC.disableCourse('${c.code}', ${c.year}, ${c.semester})">📦 Archive Course</button>
            </div>
          </div>
        `).join('')}</div>`;
      }
      
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">📭 No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = `<div class="courses-grid">${archivedCourses.map(c => `
            <div class="course-card" style="opacity: 0.8;">
              <div class="course-header">
                <span class="course-code">📚 ${escapeHtml(c.code)}</span>
                <span class="badge" style="background: var(--danger);">📦 Archived</span>
              </div>
              <div class="course-name">${escapeHtml(c.name)}</div>
              <div class="course-stats">
                <span>📊 ${c.sessionCount} completed sessions</span>
                <span>📅 Last: ${c.lastSessionDate}</span>
              </div>
              <div class="course-buttons">
                <button class="btn btn-teal btn-sm" onclick="LEC.enableCourse('${c.code}', ${c.year}, ${c.semester})">🔄 Restore Course</button>
              </div>
            </div>
          `).join('')}</div>`;
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      activeContainer.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Archive Course', `Archive ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Archive', confirmCls: 'btn-warning' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.disableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Archived', `✅ ${courseCode} has been moved to archives.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Restore Course', `Restore ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Restore', confirmCls: 'btn-teal' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.enableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Restored', `✅ ${courseCode} is now active.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== EDIT COURSE ====================
  async function editCourse(courseCode, currentName, year, semester) {
    const newName = await MODAL.prompt('Edit Course Name', `Edit name for ${courseCode}:`, { icon: '✏️', placeholder: 'Course name', defVal: currentName });
    if (!newName || newName === currentName) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.update(myId, courseCode, year, semester, { name: newName, updatedAt: Date.now() });
      await MODAL.success('Course Updated', `✅ ${courseCode} name has been changed.`);
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (!section) return;
    
    section.style.display = 'block';
    section.innerHTML = `
      <div class="inner-panel">
        <h3>➕ Add New Course</h3>
        <div class="two-col">
          <div class="field">
            <label class="fl">📚 Course Code</label>
            <input type="text" id="new-course-code" class="fi" placeholder="e.g., STAT111" oninput="this.value = this.value.toUpperCase()"/>
          </div>
          <div class="field">
            <label class="fl">📖 Course Name</label>
            <input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Statistics"/>
          </div>
        </div>
        <div class="two-col" style="margin-top: 10px;">
          <div class="field">
            <label class="fl">📅 Academic Year</label>
            <select id="new-course-year" class="fi">
              <option value="">Select Year</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026" selected>2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
          <div class="field">
            <label class="fl">📖 Semester</label>
            <select id="new-course-semester" class="fi">
              <option value="">Select Semester</option>
              <option value="1" selected>First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
        </div>
        <p class="note" style="margin-top: 8px; font-size: 11px;">⚠️ Course will be created specifically for the selected Academic Year and Semester</p>
        <button class="btn btn-ug" onclick="LEC.addNewCourse()">✅ Create Course</button>
        <button class="btn btn-secondary" onclick="LEC.hideAddCourse()">❌ Cancel</button>
      </div>
    `;
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    
    if (!code || !name) {
      await MODAL.alert('Missing Info', '⚠️ Please enter course code and name.');
      return;
    }
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select Academic Year and Semester.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        await MODAL.error('Error', '⚠️ Could not identify your account.');
        return;
      }
      
      const existing = await DB.COURSE.get(myId, code, yearInt, semInt);
      if (existing) {
        await MODAL.alert('Course Exists', `⚠️ Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const user = getCurrentUser();
      await DB.COURSE.set(myId, code, yearInt, semInt, {
        code: code, name: name, year: yearInt, semester: semInt,
        active: true, status: 'active', createdAt: Date.now(),
        createdBy: user?.name || user?.email || 'unknown', lecId: myId
      });
      
      await MODAL.success('Course Created', `✅ ${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCoursesGrid();
      await loadDashboardStats();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== TA MANAGEMENT ====================
  async function _loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>👥 Invite New Teaching Assistant</h3>
        <div class="field"><label class="fl">📧 TA Email Address</label><input type="email" id="ta-email-input" class="fi" placeholder="ta@ug.edu.gh"/></div>
        <button class="btn btn-ug" onclick="LEC.inviteTA()" style="width: auto; padding: 10px 20px; margin-top: 10px;">📧 Send Invite Email</button>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px; margin-top: 20px;">
        <h3>👥 My Teaching Assistants</h3>
        <span class="badge" id="ta-count">0</span>
      </div>
      <div id="ta-list-container"><div class="att-empty">📭 No TAs added yet. Send an invite above.</div></div>
    `;
    await refreshTAList();
  }

  async function refreshTAList() {
    const container = document.getElementById('ta-list-container');
    const countElement = document.getElementById('ta-count');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load TAs</div>';
        return;
      }
      
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId));
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      const user = getCurrentUser();
      const lecturerName = user?.name || 'Your Lecturer';
      
      container.innerHTML = `<div class="courses-grid">${myTAs.map(ta => `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">👤 ${escapeHtml(ta.name || 'Pending Registration')}</span>
            <span class="badge ${ta.status === 'active' ? 'badge-teal' : 'badge-gray'}">${ta.status === 'active' ? '✅ Active' : '⏳ Pending'}</span>
          </div>
          <div class="course-name">📧 ${escapeHtml(ta.email)}</div>
          <div class="course-stats">
            <span>👥 Assigned to: ${escapeHtml(lecturerName)}</span>
          </div>
          <div class="course-buttons">
            ${ta.status === 'suspended' ? 
              `<button class="btn btn-teal btn-sm" onclick="LEC.unsuspendTA('${ta.id}')">🔄 Unsuspend</button>` :
              `<button class="btn btn-warning btn-sm" onclick="LEC.suspendTA('${ta.id}')">⛔ Suspend</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="LEC.endTenure('${ta.id}')">🔚 End Tenure</button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function suspendTA(taId) {
    const confirmed = await MODAL.confirm('Suspend TA', 'Suspend this TA? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.TA.update(taId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('TA Suspended', '✅ The TA has been suspended.');
    await refreshTAList();
  }

  async function unsuspendTA(taId) {
    await DB.TA.update(taId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('TA Unsuspended', '✅ The TA has been reactivated.');
    await refreshTAList();
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    if (!email) { await MODAL.alert('Missing Info', '⚠️ Please enter TA email address.'); return; }
    if (!email.includes('@')) { await MODAL.alert('Invalid Email', '⚠️ Please enter a valid email address.'); return; }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = Math.random().toString(36).substring(2, 15);
    const user = getCurrentUser();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    await DB.TA.setInvite(inviteKey, { 
      code, toEmail: email, lecturerId: getCurrentLecturerId(), 
      lecturerName: user?.name, createdAt: Date.now(), 
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, usedAt: null 
    });
    
    await MODAL.alert('Invite Code', `
      <div style="text-align:center">
        <div style="font-size:36px; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px; margin:10px 0;">${code}</div>
        <p>Share this code with the TA at ${email}</p>
        <p>Registration: <a href="${signupLink}" target="_blank">${signupLink}</a></p>
      </div>
    `, { icon: '📧' });
    
    document.getElementById('ta-email-input').value = '';
    await refreshTAList();
  }

  async function endTenure(taId) {
    const confirmed = await MODAL.confirm('End Tenure', 'End this TA\'s tenure? They will no longer access your dashboard.', { confirmLabel: 'Yes', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const myId = getCurrentLecturerId();
    if (!myId) return;
    
    const ta = await DB.TA.get(taId);
    if (ta && ta.lecturers) {
      const updatedLecturers = ta.lecturers.filter(id => id !== myId);
      await DB.TA.update(taId, { lecturers: updatedLecturers, endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() } });
      if (updatedLecturers.length === 0) await DB.TA.update(taId, { active: false });
      await MODAL.success('Tenure Ended', '✅ TA removed from your dashboard.');
      await refreshTAList();
    }
  }

  // ==================== BIOMETRIC RESET TAB ====================
  async function _loadBiometricTab() {
    const container = document.getElementById('biometric-reset-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom: 20px;">
        <h3>🔐 Student Passkey Reset</h3>
        <p class="sub">When a student gets a new device, you can reset their passkey and unregister their old device.</p>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-ug" id="reset-passkey-btn" style="width: auto; padding: 10px 20px;">📱 Reset Passkey (New Device)</button>
          <button class="btn btn-secondary" id="manage-devices-btn" style="width: auto; padding: 10px 20px;">🔍 View / Manage Devices</button>
        </div>
      </div>
      <div class="inner-panel">
        <h3>📋 Instructions</h3>
        <ul style="margin-left: 20px; color: var(--text3); font-size: 13px; line-height: 1.8;">
          <li><strong>Device Binding:</strong> Each student's passkey is bound to their specific device</li>
          <li><strong>New Device:</strong> When a student gets a new device, their old passkey won't work</li>
          <li><strong>Reset Passkey:</strong> Click "Reset Passkey" and enter the student's ID</li>
          <li>The student will receive a link to register their fingerprint/face passkey on their new device</li>
          <li><strong>Old Device Unregistered:</strong> After reset, the old device cannot be used for check-ins</li>
        </ul>
      </div>
      <div class="inner-panel">
        <h3>📊 Recent Reset Requests</h3>
        <div id="recent-resets-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    
    const resetBtn = document.getElementById('reset-passkey-btn');
    const manageBtn = document.getElementById('manage-devices-btn');
    
    if (resetBtn) resetBtn.onclick = () => showPasskeyResetUI();
    if (manageBtn) manageBtn.onclick = () => showDeviceManagementUI();
    
    await _loadRecentResets();
  }

  async function _loadRecentResets() {
    const container = document.getElementById('recent-resets-list');
    if (!container) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="no-rec">⚠️ Unable to load reset history</div>';
        return;
      }
      
      const allResets = await DB.BIOMETRIC_RESET.getAllForLecturer(myId);
      const recentResets = allResets.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
      
      if (recentResets.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No recent reset requests</div>';
        return;
      }
      
      let html = '<div style="font-size: 13px;">';
      for (const reset of recentResets) {
        const date = new Date(reset.createdAt).toLocaleString();
        const status = reset.used ? '✅ Used' : (reset.expiresAt < Date.now() ? '⏰ Expired' : '⏳ Pending');
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
            <div>
              <strong>${escapeHtml(reset.studentName)}</strong><br>
              <span style="font-size: 11px; color: var(--text3);">${escapeHtml(reset.studentId)}</span>
            </div>
            <div style="font-size: 11px;">
              <span>${date}</span><br>
              <span class="pill ${reset.used ? 'pill-teal' : (reset.expiresAt < Date.now() ? 'pill-gray' : 'pill-amber')}">${status}</span>
            </div>
          </div>
        `;
      }
      html += '</div>';
      container.innerHTML = html;
    } catch(err) {
      console.error('Load recent resets error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading reset history</div>';
    }
  }

  async function showPasskeyResetUI() {
    const studentId = await MODAL.prompt(
      'Reset Student Passkey',
      'Enter the Student ID of the student who needs to reset their passkey:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Continue' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const confirmReset = await MODAL.confirm(
      'Confirm Passkey Reset',
      `Reset passkey for:<br/><br/>
       <strong>${escapeHtml(student.name)}</strong><br/>
       ID: ${escapeHtml(student.studentId)}<br/>
       Email: ${escapeHtml(student.email)}<br/><br/>
       <span style="color: var(--danger);">⚠️ This will erase their current passkey and unregister their device.</span>`,
      { confirmLabel: 'Send Reset Link', confirmCls: 'btn-warning' }
    );
    if (!confirmReset) return;
    
    try {
      const myId = getCurrentLecturerId();
      const user = getCurrentUser();
      const token = Math.random().toString(36).substring(2, 34);
      const resetLink = `${CONFIG.SITE_URL}?reset=${token}`;
      
      await DB.STUDENTS.update(student.studentId, {
        webAuthnCredentialId: null,
        webAuthnData: null,
        lastBiometricReset: Date.now(),
        biometricResetReason: 'device_change'
      });
      
      await DB.BIOMETRIC_RESET.set(token, {
        token, studentId: student.studentId, studentName: student.name,
        studentEmail: student.email, lecturerId: myId,
        lecturerName: user?.name || 'Lecturer', reason: 'device_change_reset',
        createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, used: false
      });
      
      await MODAL.alert('Passkey Reset Link', 
        `<div style="text-align: center;">
           <div class="strip-amber" style="margin-bottom: 15px;"><strong>🔗 Share this link with the student:</strong></div>
           <div style="background: var(--surface2); padding: 15px; border-radius: 8px; margin: 10px 0; word-break: break-all;">
             <a href="${resetLink}" target="_blank">${resetLink}</a>
           </div>
           <p style="font-size: 12px; margin-top: 10px;">⏰ This link expires in 7 days.</p>
         </div>`,
        { icon: '🔗', btnLabel: 'OK' }
      );
      await _loadRecentResets();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function showDeviceManagementUI() {
    const studentId = await MODAL.prompt(
      'Manage Student Devices',
      'Enter Student ID to view passkey status:',
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Search' }
    );
    if (!studentId) return;
    
    const student = await DB.STUDENTS.byStudentId(studentId.toUpperCase());
    if (!student) {
      await MODAL.error('Student Not Found', `❌ No student found with ID: ${studentId}`);
      return;
    }
    
    const hasPasskey = !!(student.webAuthnCredentialId);
    const lastUse = student.lastBiometricUse ? new Date(student.lastBiometricUse).toLocaleString() : 'Never';
    const lastReset = student.lastBiometricReset ? new Date(student.lastBiometricReset).toLocaleString() : 'Never';
    const deviceCount = student.devices ? Object.keys(student.devices).length : 0;
    
    await MODAL.alert(
      `Student: ${escapeHtml(student.name)}`,
      `<div style="text-align: left;">
         <p><strong>ID:</strong> ${escapeHtml(student.studentId)}</p>
         <p><strong>Email:</strong> ${escapeHtml(student.email)}</p>
         <hr style="margin: 10px 0;">
         <p><strong>Passkey Status:</strong> ${hasPasskey ? '✅ Registered' : '❌ Not Registered'}</p>
         <p><strong>Registered Devices:</strong> ${deviceCount}</p>
         <p><strong>Last Passkey Use:</strong> ${lastUse}</p>
         <p><strong>Last Passkey Reset:</strong> ${lastReset}</p>
       </div>`,
      { icon: '📱', btnLabel: 'Close' }
    );
  }

  // ==================== RESET FORM ====================
  function resetForm() {
    console.log('[LEC] resetForm called');
    S.locOn = true; 
    S.locAcquired = false; 
    S.lecLat = S.lecLng = null; 
    S.session = null;
    
    if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    if (S.refreshInterval) { clearInterval(S.refreshInterval); S.refreshInterval = null; }
    
    switchTab('mycourses');
  }

  // ==================== EXPORTS ====================
  return {
    switchTab,
    resetForm,
    viewCoursesGrid,
    loadMyCoursesGrid,
    loadDashboardStats,
    showAddCourse, 
    hideAddCourse, 
    addNewCourse, 
    showStartSessionPage, 
    editCourse,
    generateAndStartSession, 
    getStartLocation,
    endSessionById, 
    downloadSessionQR,
    loadRecords: _loadRecords,
    populateRecordsCourses,
    loadSessionList,
    loadSessionRecords,
    exportSessionRecordsToExcel,
    showManualCheckinModal,
    showBulkCheckinModal,
    generateReport, 
    exportReportToExcel,
    populateReportCourses,
    exportSingleSession,
    viewSessionDetails,
    showAnnouncementModal,
    loadCoursesManagement, 
    disableCourse, 
    enableCourse,
    inviteTA, 
    endTenure,
    suspendTA,
    unsuspendTA,
    refreshTAList,
    showPasskeyResetUI,
    showDeviceManagementUI,
    _loadActiveSessionsOnly
  };
})();

// Make LEC globally available
window.LEC = LEC;
window.LEC.tab = LEC.switchTab;

console.log('[session.js] LEC module loaded and registered globally');
