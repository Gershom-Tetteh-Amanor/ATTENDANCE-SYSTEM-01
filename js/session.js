/* session.js — Lecturer & TA Dashboard with Complete Functionality */
'use strict';

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
    activeSessionsRefresh: null
  };

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Helper to get current lecturer/TA ID
  function getCurrentLecturerId() {
    const user = AUTH.getSession();
    if (!user) return null;
    // For TA, use activeLecturerId; for lecturer, use id
    if (user.role === 'ta') {
      return user.activeLecturerId || user.id;
    }
    return user.id;
  }

  // Helper to get current user for name display
  function getCurrentUser() {
    return AUTH.getSession();
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

  // ==================== MAIN TAB FUNCTION ====================
  function tab(name) {
    console.log('[LEC] Switching to tab:', name);
    
    document.querySelectorAll('#view-lecturer .tab').forEach(t => {
      const tabName = t.getAttribute('data-tab');
      if (tabName === name) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => {
      const pageId = p.id;
      const expectedId = `lec-pg-${name}`;
      if (pageId === expectedId) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    
    if (name === 'mycourses') {
      _loadMyCourses();
    } else if (name === 'records') {
      _loadRecords();
    } else if (name === 'reports') {
      _loadReports();
    } else if (name === 'courses') {
      _loadCourses();
    } else if (name === 'tas') {
      _loadTAs();
    } else if (name === 'session') {
      _loadActiveSessionsOnly();
    }
  }

  // ==================== ACTIVE SESSIONS TAB ====================
  async function _loadActiveSessionsOnly() {
    const container = document.getElementById('active-sessions-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading active sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="att-empty">Unable to load sessions. Please refresh the page.</div>';
        return;
      }
      
      const allSessions = await DB.SESSION.byLec(myId);
      const activeSessions = allSessions.filter(s => s.active === true);
      
      if (activeSessions.length === 0) {
        container.innerHTML = '<div class="att-empty">No active sessions. Go to "My Courses" to start a session.</div>';
        return;
      }
      
      let html = '<h2 style="margin-bottom:15px">🟢 Active Sessions</h2><p class="sub">Sessions currently running. They will end automatically when duration expires.</p>';
      
      for (const session of activeSessions) {
        const timeRemaining = Math.max(0, session.expiresAt - Date.now());
        const minutesLeft = Math.floor(timeRemaining / 60000);
        const secondsLeft = Math.floor((timeRemaining % 60000) / 1000);
        const records = session.records ? Object.values(session.records).length : 0;
        
        if (timeRemaining <= 0) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          continue;
        }
        
        const qrPayload = UI.b64e(JSON.stringify({ 
          id: session.id, token: session.token, code: session.courseCode, 
          course: session.courseName, date: session.date, expiresAt: session.expiresAt,
          lat: session.lat, lng: session.lng, radius: session.radius, locEnabled: session.locEnabled
        }));
        const qrUrl = `${CONFIG.SITE_URL}?ci=${qrPayload}`;
        
        html += `
          <div class="sess-card" style="margin-bottom:20px; border-left: 4px solid var(--teal)">
            <div style="background:var(--ug); color:white; padding:12px; border-radius:8px 8px 0 0; margin:-13px -13px 0 -13px; display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px">
              <div>
                <strong>📚 ${UI.esc(session.courseCode)} - ${UI.esc(session.courseName)}</strong>
                <span style="margin-left:15px">📅 ${session.date}</span>
                <span style="margin-left:15px">👥 ${records} checked in</span>
              </div>
              <div>
                <span class="countdown ok" style="color:#fcd116">⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
                <button class="btn btn-danger btn-sm" onclick="LEC.endSessionById('${session.id}')" style="margin-left:10px">⏹️ End Session</button>
              </div>
            </div>
            <div style="padding:15px; text-align:center">
              <div id="qr-${session.id}" style="display:inline-block; background:#fff; padding:15px; border-radius:10px"></div>
              <div style="margin-top:15px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap">
                <button class="btn btn-secondary btn-sm" onclick="LEC.downloadSessionQR('${session.id}')">⬇ Download QR</button>
                <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${qrUrl}')">📋 Copy Link</button>
              </div>
            </div>
          </div>
        `;
        
        setTimeout(() => {
          const qrContainer = document.getElementById(`qr-${session.id}`);
          if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: qrUrl, width: 180, height: 180, colorDark: '#1a1a18', colorLight: '#ffffff' });
          }
        }, 100);
      }
      
      container.innerHTML = html;
      
      if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
      S.activeSessionsRefresh = setInterval(() => _checkAndUpdateActiveSessions(), 5000);
      
    } catch(err) {
      console.error('Load active sessions error:', err);
      container.innerHTML = `<div class="att-empty">Error loading sessions: ${UI.esc(err.message)}</div>`;
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
      
      if (needsRefresh) {
        await _loadActiveSessionsOnly();
      }
    } catch(e) { console.warn(e); }
  }

  async function endSessionById(sessionId) {
    const confirmed = await MODAL.confirm('End Session', 'End this session? All records will be saved.', 
      { confirmLabel: 'Yes, End Session', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), endedReason: 'manual' });
      await MODAL.success('Session Ended', 'The session has been ended.');
      await _loadActiveSessionsOnly();
    } catch(err) {
      console.error('End session error:', err);
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
  async function showStartSessionPage(courseCode, courseName) {
    console.log('[LEC] Showing start session page for:', courseCode, courseName);
    
    sessionStorage.setItem('starting_course_code', courseCode);
    sessionStorage.setItem('starting_course_name', courseName);
    
    const container = document.getElementById('courses-display');
    if (!container) return;
    
    container.innerHTML = `
      <div class="start-session-page" style="max-width:500px; margin:0 auto">
        <button class="btn btn-outline btn-sm" onclick="LEC.viewCourses()" style="margin-bottom:20px">← Back to Courses</button>
        
        <div class="inner-panel">
          <h2>▶ Start New Session</h2>
          <p class="sub">Course: <strong>${UI.esc(courseCode)} - ${UI.esc(courseName)}</strong></p>
          
          <div class="sl-row" style="margin-bottom:20px">
            <label class="fl">Duration (minutes)</label>
            <input type="range" id="start-dur" min="5" max="180" value="60" oninput="updateStartDurVal(this.value)"/>
            <span class="sv" id="start-dur-val">60 min</span>
          </div>
          
          <div class="loc-step">
            <h3>📍 Classroom Location (Required)</h3>
            <p>Set your current location as the classroom fence. Students must be within this radius to check in.</p>
            <div class="sl-row" style="margin-bottom:8px">
              <label class="fl">Fence radius</label>
              <input type="range" id="start-radius" min="20" max="500" value="100" oninput="updateStartRadiusVal(this.value)"/>
              <span class="sv" id="start-rad-val">100m</span>
            </div>
            <button class="btn btn-teal" id="start-get-loc-btn" onclick="LEC.getStartLocation()">📍 Get my location</button>
            <div class="loc-result" id="start-loc-result"></div>
          </div>
          
          <button class="btn btn-ug" id="start-gen-btn" onclick="LEC.generateAndStartSession()" disabled style="margin-top:20px">▶ Generate QR Code & Start Session</button>
          <p class="gen-hint" id="start-gen-hint">Get your classroom location first.</p>
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
    btn.innerHTML = '<span class="spin"></span>Getting location…';
    res.className = 'loc-result';
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…';
    
    if (!navigator.geolocation) { 
      _demoStartLoc(); 
      return; 
    }
    
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
    const mins = document.getElementById('start-dur') ? +(document.getElementById('start-dur').value) : 60;
    
    if (!courseCode || !courseName) {
      await MODAL.alert('Error', 'Course information missing. Please go back and try again.');
      return;
    }
    
    if (!S.locAcquired || !S.lecLat) {
      await MODAL.alert('Location required', 'Get your classroom location first.');
      return;
    }
    
    const genBtn = document.getElementById('start-gen-btn');
    UI.btnLoad('start-gen-btn', true);
    
    try {
      const user = getCurrentUser();
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const existing = await DB.SESSION.byLec(myId);
      if (existing.find(s => s.courseCode === courseCode && s.active)) {
        UI.btnLoad('start-gen-btn', false, 'Generate QR Code & Start Session');
        await MODAL.error('Session conflict', `A session for ${courseCode} is already active. Go to "Sessions" tab to view it.`);
        return;
      }
      
      const yearInt = new Date().getFullYear();
      const month = new Date().getMonth();
      let semInt = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
      
      const token = UI.makeToken(20);
      const sessId = token.slice(0, 12);
      const dateStr = new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'numeric'});
      const radius = document.getElementById('start-radius') ? +(document.getElementById('start-radius').value) : 100;
      
      const sessionData = {
        id: sessId, token: token, courseCode: courseCode, courseName: courseName,
        lecturer: user?.name || '', lecId: user?.lecId || '', lecFbId: myId,
        department: user?.department || '', date: dateStr,
        expiresAt: Date.now() + mins * 60000, durationMins: mins,
        lat: S.lecLat, lng: S.lecLng, radius: radius, locEnabled: true,
        active: true, createdAt: Date.now(), year: yearInt, semester: semInt,
        records: {}, sids: {}, devs: {}
      };
      
      await DB.SESSION.set(sessId, sessionData);
      await MODAL.success('Session Started', `Session for ${courseCode} has started! QR code is ready.`);
      
      sessionStorage.removeItem('starting_course_code');
      sessionStorage.removeItem('starting_course_name');
      tab('session');
      
    } catch(err) {
      UI.btnLoad('start-gen-btn', false, 'Generate QR Code & Start Session');
      console.error('Start session error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== MY COURSES TAB ====================
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    
    const now = new Date();
    let defaultYear = now.getFullYear();
    const month = now.getMonth();
    let defaultSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
    if (defaultSemester === 2 && month <= 6) defaultYear = defaultYear - 1;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="mycourses-year" class="fi" style="padding:8px">
            <option value="">Select Year</option>
            <option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option>
            <option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="mycourses-semester" class="fi" style="padding:8px">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div><button class="btn btn-ug" onclick="LEC.viewCourses()">View Courses</button></div>
        <div><button class="btn btn-secondary" onclick="LEC.showAddCourse()">+ Add New Course</button></div>
      </div>
      <div id="courses-display"><div class="att-empty">Select Year and Semester to view your courses</div></div>
      <div id="add-course-section" style="display:none; margin-top:20px">
        <div class="inner-panel"><h3>Add New Course</h3>
          <div class="two-col"><div class="field"><label class="fl">Course Code</label><input type="text" id="new-course-code" class="fi" placeholder="e.g., DCIT101" oninput="this.value=this.value.toUpperCase()"/></div>
          <div class="field"><label class="fl">Course Name</label><input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Computing"/></div></div>
          <div class="two-col" style="margin-top:10px"><div class="field"><label class="fl">Academic Year</label><select id="new-course-year" class="fi"><option value="">Select Year</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option></select></div>
          <div class="field"><label class="fl">Semester</label><select id="new-course-semester" class="fi"><option value="">Select Semester</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div></div>
          <button class="btn btn-ug" onclick="LEC.addNewCourse()">Create Course</button>
          <button class="btn btn-secondary" onclick="LEC.hideAddCourse()">Cancel</button>
        </div>
      </div>
    `;
    
    const yearSelect = document.getElementById('mycourses-year');
    const semSelect = document.getElementById('mycourses-semester');
    if (yearSelect) yearSelect.value = defaultYear;
    if (semSelect) semSelect.value = defaultSemester;
    await viewCourses();
  }

  async function viewCourses() {
    const year = document.getElementById('mycourses-year')?.value;
    const semester = document.getElementById('mycourses-semester')?.value;
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select both Year and Semester.');
      return;
    }
    
    S.currentViewYear = parseInt(year);
    S.currentViewSemester = parseInt(semester);
    const container = document.getElementById('courses-display');
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => c.year === S.currentViewYear && c.semester === S.currentViewSemester && c.active !== false);
      const allSessions = await DB.SESSION.byLec(myId);
      const sessionCounts = new Map();
      
      for (const session of allSessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const m = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (m >= 7 || m <= 0) ? 1 : (m >= 1 && m <= 6 ? 2 : 1);
        }
        if (sessionYear === S.currentViewYear && sessionSemester === S.currentViewSemester) {
          sessionCounts.set(session.courseCode, (sessionCounts.get(session.courseCode) || 0) + 1);
        }
      }
      
      const courses = periodCourses.map(c => ({
        code: c.code,
        name: c.name,
        sessionCount: sessionCounts.get(c.code) || 0,
        active: c.active !== false
      })).sort((a,b) => a.code.localeCompare(b.code));
      
      if (courses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">No active courses found for ${S.currentViewYear} - Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.<br/>Click "Add New Course" to create one.</div></div>`;
        return;
      }
      
      let html = `<h3 style="margin-bottom:15px; color:var(--ug)">📚 ${S.currentViewYear} - ${S.currentViewSemester === 1 ? 'First Semester' : 'Second Semester'} (${courses.length} courses)</h3>`;
      for (const c of courses) {
        html += `
          <div class="course-card-item" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px">
            <div>
              <div style="font-weight:700; font-size:16px; color:var(--ug)">${UI.esc(c.code)}</div>
              <div style="font-size:13px; color:var(--text2)">${UI.esc(c.name)}</div>
              <div style="font-size:11px; color:var(--text3); margin-top:5px">📊 ${c.sessionCount} session(s)</div>
            </div>
            <div>
              <button class="btn btn-ug btn-sm" onclick="LEC.showStartSessionPage('${c.code}', '${c.name.replace(/'/g, "\\'")}')">▶ Start Session</button>
              <button class="btn btn-outline btn-sm" onclick="LEC.editCourse('${c.code}', '${c.name.replace(/'/g, "\\'")}')" style="margin-left:5px">✏️ Edit</button>
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('View courses error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // Edit course function
  async function editCourse(courseCode, currentName) {
    const newName = await MODAL.prompt(
      'Edit Course Name',
      `Edit name for ${courseCode}:`,
      { icon: '✏️', placeholder: 'Course name', defVal: currentName, confirmLabel: 'Save Changes' }
    );
    
    if (!newName || newName === currentName) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const year = S.currentViewYear;
      const semester = S.currentViewSemester;
      
      await DB.COURSE.update(myId, courseCode, year, semester, { 
        name: newName,
        updatedAt: Date.now()
      });
      
      await MODAL.success('Course Updated', `${courseCode} name has been changed to "${newName}".`);
      await viewCourses();
    } catch(err) {
      console.error('Edit course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'block';
    if (S.currentViewYear) {
      const yearSelect = document.getElementById('new-course-year');
      if (yearSelect) yearSelect.value = S.currentViewYear;
    }
    if (S.currentViewSemester) {
      const semSelect = document.getElementById('new-course-semester');
      if (semSelect) semSelect.value = S.currentViewSemester;
    }
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
    ['new-course-code', 'new-course-name', 'new-course-year', 'new-course-semester'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    if (!code || !name || !year || !semester) {
      await MODAL.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const existing = await DB.COURSE.get(myId, code, yearInt, semInt);
      if (existing) {
        await MODAL.alert('Course Exists', `Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const user = getCurrentUser();
      await DB.COURSE.set(myId, code, yearInt, semInt, {
        code: code,
        name: name,
        year: yearInt,
        semester: semInt,
        active: true,
        status: 'active',
        createdAt: Date.now(),
        createdBy: user?.name || user?.email || 'unknown'
      });
      
      await MODAL.success('Course Created', `${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCourses();
    } catch(err) {
      console.error('Add course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== MY RECORDS TAB (FIXED) ====================
  async function _loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="records-year" class="fi">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="records-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="flex:1; min-width:180px">
          <label class="fl">Course</label>
          <select id="records-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadRecords()">Load Records</button>
        </div>
      </div>
      <div id="records-results"><div class="att-empty">Select filters and click Load Records</div></div>
    `;
    
    // Add event listeners
    const yearSelect = document.getElementById('records-year');
    const semSelect = document.getElementById('records-semester');
    if (yearSelect) yearSelect.onchange = () => _populateRecordsCourses();
    if (semSelect) semSelect.onchange = () => _populateRecordsCourses();
  }

  async function _populateRecordsCourses() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      // Get all courses for this lecturer
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      console.log('[LEC] All courses for records:', allCourses);
      
      // Filter by selected year and semester
      const filteredCourses = allCourses.filter(c => 
        c.year === parseInt(year) && 
        c.semester === parseInt(semester)
      );
      
      console.log('[LEC] Filtered courses for records:', filteredCourses);
      
      if (filteredCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of filteredCourses) {
        options += `<option value="${UI.esc(course.code)}">${UI.esc(course.code)} - ${UI.esc(course.name)}</option>`;
      }
      
      courseSelect.innerHTML = options;
      
    } catch(err) { 
      console.error('Populate records courses error:', err);
      courseSelect.innerHTML = '<option value="">Error loading courses</option>'; 
    }
  }

  async function loadRecords() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseCode = document.getElementById('records-course')?.value;
    const container = document.getElementById('records-results');
    
    if (!year || !semester || !courseCode) {
      await MODAL.alert('Missing Info', 'Please select Year, Semester, and Course.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading sessions...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      // Get all sessions for this lecturer
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const filteredSessions = sessions.filter(s => {
        let sessionYear = s.year, sessionSemester = s.semester;
        if (!sessionYear && s.date) {
          const sessionDate = new Date(s.date);
          const m = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (m >= 7 || m <= 0) ? 1 : (m >= 1 && m <= 6 ? 2 : 1);
        }
        return sessionYear === yearInt && sessionSemester === semInt;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No sessions found for this course.</div>';
        return;
      }
      
      // Get course name from course data
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const course = allCourses.find(c => c.code === courseCode);
      const courseName = course?.name || filteredSessions[0]?.courseName || '';
      
      let html = `<h3 style="margin-bottom:15px">📋 ${UI.esc(courseCode)} - ${UI.esc(courseName)}</h3>`;
      html += `<div style="margin-bottom:20px"><button class="btn btn-ug" onclick="LEC.exportAllSessionsToExcel('${courseCode}', ${yearInt}, ${semInt})">📊 Export All to Excel</button></div>`;
      
      for (const session of filteredSessions) {
        const records = session.records ? Object.values(session.records) : [];
        const displayRecords = records.slice(0, 5);
        const hasMore = records.length > 5;
        
        html += `
          <div class="sess-card" style="margin-bottom:16px">
            <div style="background:var(--ug); color:white; padding:12px; border-radius:8px 8px 0 0; margin:-13px -13px 0 -13px; display:flex; justify-content:space-between; flex-wrap:wrap">
              <div><strong>📅 ${session.date}</strong> <span style="margin-left:10px">⏱️ ${session.durationMins || 60} min</span> <span style="margin-left:10px">👥 ${records.length} students</span></div>
              <div><button class="btn btn-secondary btn-sm" onclick="LEC.exportSessionToExcel('${session.id}')">📥 Download Excel</button>
              <button class="btn btn-outline btn-sm" onclick="LEC.showManualCheckinModal('${session.id}', '${courseCode}')" style="margin-left:5px">📝 Manual Check-in</button></div>
            </div>
            <div style="padding:12px; overflow-x:auto">
              <table style="width:100%; border-collapse:collapse">
                <thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:8px">#</th><th style="padding:8px">Student Name</th><th style="padding:8px">Student ID</th><th style="padding:8px">Time</th><th style="padding:8px">Method</th></tr></thead>
                <tbody>
                  ${displayRecords.map((r, i) => `<tr style="border-bottom:1px solid var(--border2)"><td style="padding:8px">${i+1}</td><td style="padding:8px">${UI.esc(r.name)}</td><td style="padding:8px">${UI.esc(r.studentId)}</td><td style="padding:8px">${r.time}</td><td style="padding:8px">${r.authMethod === 'manual' ? '📝 Manual' : '🔐 Biometric'}</td></tr>`).join('')}
                  ${hasMore ? `<tr><td colspan="5" style="padding:12px; text-align:center; color:var(--text3)">... and ${records.length - 5} more students</td></table>` : ''}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('Load records error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function showManualCheckinModal(sessionId, courseCode) {
    const studentId = await MODAL.prompt(
      'Manual Check-in',
      `Enter Student ID for ${courseCode}:`,
      { icon: '🎓', placeholder: 'e.g., 10967696', confirmLabel: 'Check In' }
    );
    if (!studentId) return;
    
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.error('Error', 'Session not found.');
      return;
    }
    
    const normalizedId = studentId.trim().toUpperCase();
    const student = await DB.STUDENTS.byStudentId(normalizedId);
    
    if (!student) {
      await MODAL.alert('Student Not Found', `No student found with ID: ${normalizedId}<br/><br/>Please ask the student to register first.`);
      return;
    }
    
    const myId = getCurrentLecturerId();
    const isEnrolled = await DB.ENROLLMENT.isEnrolled(normalizedId, myId, courseCode);
    if (!isEnrolled) {
      const enrollNow = await MODAL.confirm('Student Not Enrolled', `${student.name} is not enrolled. Enroll and check in?`, { confirmLabel: 'Yes' });
      if (!enrollNow) return;
      await DB.ENROLLMENT.enroll(normalizedId, myId, courseCode, session.courseName, session.semester, session.year);
    }
    
    if (await DB.SESSION.hasSid(sessionId, normalizedId)) {
      await MODAL.alert('Already Checked In', `${student.name} already checked in.`);
      return;
    }
    
    await DB.SESSION.addDevice(sessionId, `manual_${Date.now()}`);
    await DB.SESSION.addSid(sessionId, normalizedId);
    await DB.SESSION.pushRecord(sessionId, {
      name: student.name, studentId: normalizedId, biometricId: `manual_${Date.now()}`,
      authMethod: 'manual', locNote: 'Manual check-in', time: UI.nowTime(),
      checkedAt: Date.now(), manualCheckin: true, checkedBy: getCurrentUser()?.name
    });
    
    await MODAL.success('Checked In', `${student.name} checked in successfully.`);
    await loadRecords();
  }

  async function exportSessionToExcel(sessionId) {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    
    const records = session.records ? Object.values(session.records) : [];
    const wsData = [['Attendance Record', session.courseCode, session.courseName], ['Date', session.date], ['Duration', `${session.durationMins || 60} minutes`], ['Lecturer', session.lecturer], [], ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method']];
    records.forEach((r, i) => wsData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Biometric']));
    wsData.push([], ['Total Students Present:', records.length]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:25}, {wch:15}, {wch:12}, {wch:18}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${session.courseCode}_${session.date}`);
    XLSX.writeFile(wb, `UG_ATT_${session.courseCode}_${session.date}.xlsx`);
    await MODAL.success('Export Complete', 'Excel file downloaded.');
  }

  async function exportAllSessionsToExcel(courseCode, year, semester) {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    const myId = getCurrentLecturerId();
    if (!myId) throw new Error('Unable to identify lecturer');
    
    let sessions = await DB.SESSION.byLec(myId);
    sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
    
    const filteredSessions = sessions.filter(s => {
      let sessionYear = s.year, sessionSemester = s.semester;
      if (!sessionYear && s.date) {
        const sessionDate = new Date(s.date);
        const m = sessionDate.getMonth();
        sessionYear = sessionDate.getFullYear();
        sessionSemester = (m >= 7 || m <= 0) ? 1 : (m >= 1 && m <= 6 ? 2 : 1);
      }
      return sessionYear === year && sessionSemester === semester;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const wb = XLSX.utils.book_new();
    const summaryData = [['Attendance Summary Report'], [`Course: ${courseCode}`], [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`], [`Generated: ${new Date().toLocaleString()}`], [], ['Student ID', 'Student Name', 'Total Sessions', 'Sessions Attended', 'Attendance Rate (%)']];
    
    const studentStats = new Map();
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      for (const r of records) {
        if (!studentStats.has(r.studentId)) studentStats.set(r.studentId, { name: r.name, attended: 0, total: filteredSessions.length });
        studentStats.get(r.studentId).attended++;
      }
    }
    
    for (const [sid, stat] of studentStats) summaryData.push([sid, stat.name, stat.total, stat.attended, ((stat.attended / stat.total) * 100).toFixed(1)]);
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      const sessionData = [[`Session: ${session.date}`], [`Total Students: ${records.length}`], [], ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method']];
      records.forEach((r, i) => sessionData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Biometric']));
      const ws = XLSX.utils.aoa_to_sheet(sessionData);
      XLSX.utils.book_append_sheet(wb, ws, session.date.replace(/\//g, '-').substring(0, 31));
    }
    
    XLSX.writeFile(wb, `UG_ATT_${courseCode}_${year}_Sem${semester}_FULL.xlsx`);
    await MODAL.success('Export Complete', 'Excel workbook downloaded.');
  }

  // ==================== REPORTS TAB (FIXED) ====================
  async function _loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="report-year" class="fi">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1; min-width:150px">
          <label class="fl">Semester</label>
          <select id="report-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="flex:1; min-width:180px">
          <label class="fl">Course</label>
          <select id="report-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.generateReport()">Generate Report</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.exportReportToExcel()">📥 Export Excel</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">Select filters and click Generate Report</div></div>
    `;
    
    const yearSelect = document.getElementById('report-year');
    const semSelect = document.getElementById('report-semester');
    if (yearSelect) yearSelect.onchange = () => _populateReportCourses();
    if (semSelect) semSelect.onchange = () => _populateReportCourses();
  }

  async function _populateReportCourses() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      // Get all courses for this lecturer
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      console.log('[LEC] All courses for reports:', allCourses);
      
      // Filter by selected year and semester - include both active and archived for reports
      const filteredCourses = allCourses.filter(c => 
        c.year === parseInt(year) && 
        c.semester === parseInt(semester)
      );
      
      console.log('[LEC] Filtered courses for reports:', filteredCourses);
      
      if (filteredCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of filteredCourses) {
        options += `<option value="${UI.esc(course.code)}">${UI.esc(course.code)} - ${UI.esc(course.name)}</option>`;
      }
      
      courseSelect.innerHTML = options;
      
    } catch(err) { 
      console.error('Populate report courses error:', err);
      courseSelect.innerHTML = '<option value="">Error loading courses</option>'; 
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseCode = document.getElementById('report-course')?.value;
    const container = document.getElementById('report-results');
    
    if (!year || !semester || !courseCode) {
      await MODAL.alert('Missing Info', 'Please select Year, Semester, and Course.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      // Get course name
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const course = allCourses.find(c => c.code === courseCode);
      const courseName = course?.name || courseCode;
      
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const filteredSessions = sessions.filter(s => {
        let sessionYear = s.year, sessionSemester = s.semester;
        if (!sessionYear && s.date) {
          const sessionDate = new Date(s.date);
          const m = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (m >= 7 || m <= 0) ? 1 : (m >= 1 && m <= 6 ? 2 : 1);
        }
        return sessionYear === yearInt && sessionSemester === semInt;
      });
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No sessions found for this course.</div>';
        return;
      }
      
      const studentStats = new Map();
      for (const session of filteredSessions) {
        const records = session.records ? Object.values(session.records) : [];
        for (const r of records) {
          if (!studentStats.has(r.studentId)) {
            studentStats.set(r.studentId, { name: r.name, attended: 0 });
          }
          const stat = studentStats.get(r.studentId);
          stat.attended++;
          studentStats.set(r.studentId, stat);
        }
      }
      
      const totalSessions = filteredSessions.length;
      const sortedStats = Array.from(studentStats.entries()).sort((a,b) => b[1].attended - a[1].attended);
      
      let html = `
        <div style="margin-bottom:20px">
          <h3>📊 Attendance Report: ${UI.esc(courseCode)} - ${UI.esc(courseName)}</h3>
          <p class="sub">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${studentStats.size}</div><div class="stat-label">Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${Math.round(Array.from(studentStats.values()).reduce((sum,s) => sum + s.attended, 0) / totalSessions)}</div><div class="stat-label">Avg per Session</div></div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%; border-collapse:collapse">
            <thead>
              <tr style="background:var(--ug); color:white">
                <th style="padding:10px; text-align:left">#</th>
                <th style="padding:10px; text-align:left">Student ID</th>
                <th style="padding:10px; text-align:left">Student Name</th>
                <th style="padding:10px; text-align:center">Attended</th>
                <th style="padding:10px; text-align:center">Rate</th>
                <th style="padding:10px; text-align:left">Status</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      let i = 1;
      for (const [sid, stat] of sortedStats) {
        const rate = ((stat.attended / totalSessions) * 100).toFixed(1);
        const rateNum = parseFloat(rate);
        let status = '';
        let statusColor = '';
        if (rateNum >= 80) { 
          status = '✅ Excellent'; 
          statusColor = 'var(--teal)'; 
        } else if (rateNum >= 60) { 
          status = '⚠️ Good'; 
          statusColor = 'var(--amber)'; 
        } else { 
          status = '❌ Poor'; 
          statusColor = 'var(--danger)'; 
        }
        
        html += `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:10px">${i++}</td>
            <td style="padding:10px">${UI.esc(sid)}</td>
            <td style="padding:10px">${UI.esc(stat.name)}</td>
            <td style="padding:10px; text-align:center">${stat.attended}/${totalSessions}</td>
            <td style="padding:10px; text-align:center; font-weight:bold; color:${rateNum >= 60 ? 'var(--teal)' : 'var(--danger)'}">${rate}%</td>
            <td style="padding:10px; color:${statusColor}">${status}</td>
          </tr>
        `;
      }
      
      html += `
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
      S.currentReportData = { year: yearInt, semester: semInt, courseCode, courseName, studentStats, totalSessions };
      
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    if (!S.currentReportData) { await MODAL.alert('No Data', 'Generate a report first.'); return; }
    
    const { year, semester, courseCode, courseName, studentStats, totalSessions } = S.currentReportData;
    const wsData = [
      ['Attendance Report'],
      [`Course: ${courseCode} - ${courseName}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${totalSessions}`, `Total Students: ${studentStats.size}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Rate (%)', 'Status']
    ];
    
    let i = 1;
    for (const [sid, stat] of studentStats) {
      const rate = ((stat.attended / totalSessions) * 100).toFixed(1);
      wsData.push([i++, sid, stat.name, stat.attended, totalSessions, rate, parseFloat(rate) >= 60 ? 'Good Standing' : 'At Risk']);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:15}, {wch:25}, {wch:18}, {wch:15}, {wch:18}, {wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', 'Report downloaded.');
  }

  // ==================== COURSE MANAGEMENT TAB (FIXED) ====================
  async function _loadCourses() {
    const container = document.getElementById('active-courses-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px"><label class="fl">Academic Year</label><select id="course-year" class="fi"><option value="">Select Year</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option></select></div>
        <div style="flex:1; min-width:150px"><label class="fl">Semester</label><select id="course-semester" class="fi"><option value="">Select Semester</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div>
        <div><button class="btn btn-ug" onclick="LEC.loadCoursesManagement()">Load Courses</button></div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">Select Year and Semester to view courses</div></div>
      <div id="archived-courses-list" style="margin-top:20px"><h3>📦 Archived Courses</h3><div class="att-empty">Select Year and Semester to view archived courses</div></div>
    `;
  }

  async function loadCoursesManagement() {
    const year = document.getElementById('course-year')?.value;
    const semester = document.getElementById('course-semester')?.value;
    const activeContainer = document.getElementById('active-courses-list-container');
    const archivedContainer = document.getElementById('archived-courses-list');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester.');
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
      
      // Process courses
      for (const course of allCourses) {
        if (course.year === yearInt && course.semester === semInt) {
          // Get session count from sessions
          let sessionCount = 0;
          let lastSessionDate = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'Never';
          
          for (const session of sessions) {
            let sessionYear = session.year, sessionSemester = session.semester;
            if (!sessionYear && session.date) {
              const sessionDate = new Date(session.date);
              const m = sessionDate.getMonth();
              sessionYear = sessionDate.getFullYear();
              sessionSemester = (m >= 7 || m <= 0) ? 1 : (m >= 1 && m <= 6 ? 2 : 1);
            }
            if (sessionYear === yearInt && sessionSemester === semInt && session.courseCode === course.code) {
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
            disabledAt: course.disabledAt
          };
          
          if (course.active !== false) {
            activeCourses.push(courseInfo);
          } else {
            archivedCourses.push(courseInfo);
          }
        }
      }
      
      // Sort courses
      activeCourses.sort((a,b) => a.code.localeCompare(b.code));
      archivedCourses.sort((a,b) => a.code.localeCompare(b.code));
      
      // Display active courses
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = activeCourses.map(c => `
          <div class="course-management-card" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:10px">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px">
              <div class="course-code" style="font-weight:700; font-size:16px; color:var(--ug)">${UI.esc(c.code)}</div>
              <div class="course-status active" style="color:var(--teal); font-weight:600">🟢 Active</div>
            </div>
            <div class="course-name" style="font-size:14px; color:var(--text2); margin-bottom:8px">${UI.esc(c.name)}</div>
            <div class="course-meta" style="font-size:11px; color:var(--text3); margin:6px 0">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}</div>
            <button class="btn btn-warning btn-sm" onclick="LEC.disableCourse('${c.code}', ${yearInt}, ${semInt})">⏹️ Disable Course</button>
          </div>
        `).join('');
      }
      
      // Display archived courses
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = archivedCourses.map(c => `
            <div class="course-management-card archived" style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:15px; margin-bottom:10px; opacity:0.8">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px">
                <div class="course-code" style="font-weight:700; font-size:16px; color:var(--text3)">${UI.esc(c.code)}</div>
                <div class="course-status inactive" style="color:var(--danger); font-weight:600">🔴 Archived</div>
              </div>
              <div class="course-name" style="font-size:14px; color:var(--text2); margin-bottom:8px">${UI.esc(c.name)}</div>
              <div class="course-meta" style="font-size:11px; color:var(--text3); margin:6px 0">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}${c.disabledAt ? ` · Disabled: ${new Date(c.disabledAt).toLocaleDateString()}` : ''}</div>
              <button class="btn btn-teal btn-sm" onclick="LEC.enableCourse('${c.code}', ${yearInt}, ${semInt})">🔄 Enable Course</button>
            </div>
          `).join('');
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      activeContainer.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Disable Course', `Disable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}? This will move it to archives.`, { confirmLabel: 'Yes, Disable', confirmCls: 'btn-warning' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      await DB.COURSE.disableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Disabled', `${courseCode} has been moved to archives.`);
      await loadCoursesManagement();
      if (document.getElementById('lec-pg-mycourses').classList.contains('active')) {
        await viewCourses();
      }
    } catch(err) {
      console.error('Disable course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Enable Course', `Enable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Enable', confirmCls: 'btn-teal' });
    if (!confirmed) return;
    
    try {
      const myId = getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      await DB.COURSE.enableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Enabled', `${courseCode} is now active.`);
      await loadCoursesManagement();
      if (document.getElementById('lec-pg-mycourses').classList.contains('active')) {
        await viewCourses();
      }
    } catch(err) {
      console.error('Enable course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== TAS TAB ====================
  async function _loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom:20px">
        <h3>Invite New Teaching Assistant</h3>
        <div class="field"><label class="fl">TA Email Address</label><input type="email" id="ta-email-input" class="fi" placeholder="ta@ug.edu.gh"/><p class="note" style="font-size:11px; margin-top:5px">The TA will receive an email with their unique invite code and registration link.</p></div>
        <button class="btn btn-ug" onclick="LEC.inviteTA()" style="width:auto; padding:10px 20px; margin-top:10px">📧 Send Invite Email</button>
      </div>
      <div class="list-hdr" style="display:flex; justify-content:space-between; margin-bottom:10px; margin-top:20px"><h3>My Teaching Assistants</h3><span class="badge" id="ta-count">0</span></div>
      <div id="ta-list-container"><div class="att-empty">No TAs added yet. Send an invite above.</div></div>
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
        container.innerHTML = '<div class="no-rec">Unable to load TAs</div>';
        return;
      }
      
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId) && ta.active !== false);
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      container.innerHTML = myTAs.map(ta => `
        <div class="att-item" style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; margin-bottom:8px; flex-wrap:wrap">
          <div class="att-dot" style="width:8px; height:8px; border-radius:50%; background:var(--teal)"></div>
          <span class="att-name" style="font-weight:500; flex:1; min-width:100px">${UI.esc(ta.name || 'Pending Registration')}</span>
          <span class="att-sid" style="font-size:12px; color:var(--text3); font-family:monospace">${UI.esc(ta.email)}</span>
          <span class="pill ${ta.status === 'active' ? 'pill-teal' : 'pill-gray'}" style="padding:3px 10px; border-radius:20px; font-size:11px">${ta.status === 'active' ? '✓ Registered' : '⏳ Pending'}</span>
          <button class="btn btn-danger btn-sm" onclick="LEC.endTenure('${ta.id}')" style="margin-left:auto">End Tenure</button>
        </div>
      `).join('');
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    if (!email) { await MODAL.alert('Missing Info', 'Please enter TA email address.'); return; }
    if (!email.includes('@')) { await MODAL.alert('Invalid Email', 'Please enter a valid email address.'); return; }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = UI.makeToken();
    const user = getCurrentUser();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    await DB.TA.setInvite(inviteKey, { 
      code, toEmail: email, lecturerId: getCurrentLecturerId(), lecturerName: user?.name, 
      createdAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, usedAt: null 
    });
    
    let emailSent = false;
    if (typeof AUTH !== 'undefined' && AUTH._sendTAInviteEmail) {
      emailSent = await AUTH._sendTAInviteEmail(email, '', code, signupLink, user?.name);
    }
    
    if (emailSent) {
      await MODAL.success('Invite Sent', `An invite email has been sent to ${email}`);
    } else {
      await MODAL.alert('Invite Code', `<div style="text-align:center"><div style="font-size:36px; background:var(--ug); color:var(--gold); padding:20px; border-radius:10px">${code}</div><p>Share this code with the TA at ${email}</p><p>Registration: <a href="${signupLink}" target="_blank">${signupLink}</a></p></div>`, { icon: '📧' });
    }
    
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
      await DB.TA.update(taId, { 
        lecturers: updatedLecturers, 
        endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() } 
      });
      if (updatedLecturers.length === 0) await DB.TA.update(taId, { active: false });
      await MODAL.success('Tenure Ended', 'TA removed from your dashboard.');
      await refreshTAList();
    }
  }

  // ==================== RESET FORM ====================
  function resetForm() {
    S.locOn = true; S.locAcquired = false; S.lecLat = S.lecLng = null; S.session = null;
    
    if (S.activeSessionsRefresh) clearInterval(S.activeSessionsRefresh);
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    if (S.refreshInterval) { clearInterval(S.refreshInterval); S.refreshInterval = null; }
    
    tab('mycourses');
  }

  // ==================== EXPORTS ====================
  return {
    tab, resetForm,
    viewCourses, showAddCourse, hideAddCourse, addNewCourse, showStartSessionPage, editCourse,
    generateAndStartSession, getStartLocation,
    endSessionById, downloadSessionQR,
    loadRecords, exportSessionToExcel, exportAllSessionsToExcel, showManualCheckinModal,
    generateReport, exportReportToExcel,
    loadCoursesManagement, disableCourse, enableCourse,
    inviteTA, endTenure, refreshTAList
  };
})();
