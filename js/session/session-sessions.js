/* session-sessions.js — Active Session Management for Lecturer/TA Dashboard */
'use strict';

const SESSION_SESSIONS = (() => {
  const core = () => window.SESSION_CORE;
  
  async function loadActiveSessions() {
    const container = document.getElementById('active-sessions-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading active sessions...</div>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) {
        container.innerHTML = '<div class="att-empty">⚠️ Unable to load sessions</div>';
        return;
      }
      
      const allSessions = await DB.SESSION.getAll();
      const activeSessions = allSessions.filter(s => s.lecFbId === myId && s.active === true);
      
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
              <span class="course-code">📚 ${core().escapeHtml(session.courseCode)}</span>
              <span class="badge" style="background:#1d9e75;">🟢 ACTIVE</span>
            </div>
            <div class="course-name">${core().escapeHtml(session.courseName)}</div>
            <div class="course-stats">
              <span>📅 ${session.date}</span>
              <span>⏱️ ${minutesLeft}m ${secondsLeft}s left</span>
              <span>👥 ${records} checked in</span>
            </div>
            <div id="qr-${session.id}" style="text-align:center; margin:15px 0; padding:10px; background:#fff; border-radius:8px;"></div>
            <div class="course-buttons">
              <button class="btn btn-secondary btn-sm" onclick="SESSION_SESSIONS.downloadSessionQR('${session.id}')">📥 Download QR</button>
              <button class="btn btn-outline btn-sm" onclick="navigator.clipboard.writeText('${qrUrl}')">📋 Copy Link</button>
              <button class="btn btn-danger btn-sm" onclick="SESSION_SESSIONS.endSessionById('${session.id}')">⏹️ End Session</button>
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
      
      if (core().state.activeSessionsRefresh) clearInterval(core().state.activeSessionsRefresh);
      core().state.activeSessionsRefresh = setInterval(() => checkAndUpdateActiveSessions(), 5000);
    } catch(err) {
      console.error('Load active sessions error:', err);
      container.innerHTML = `<div class="att-empty">❌ Error: ${core().escapeHtml(err.message)}</div>`;
    }
  }

  async function checkAndUpdateActiveSessions() {
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) return;
      
      const allSessions = await DB.SESSION.getAll();
      const activeSessions = allSessions.filter(s => s.lecFbId === myId && s.active === true);
      let needsRefresh = false;
      
      for (const session of activeSessions) {
        if (session.expiresAt <= Date.now()) {
          await DB.SESSION.update(session.id, { active: false, endedAt: Date.now(), endedReason: 'timeout' });
          needsRefresh = true;
        }
      }
      if (needsRefresh) await loadActiveSessions();
    } catch(e) { console.warn(e); }
  }

  async function endSessionById(sessionId) {
    const confirmed = await MODAL.confirm('⏹️ End Session', 'End this session? All records will be saved.', { confirmLabel: 'Yes, End Session', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), endedReason: 'manual' });
      await MODAL.success('Session Ended', '✅ The session has been ended.');
      await loadActiveSessions();
      if (typeof SESSION_COURSES !== 'undefined') {
        await SESSION_COURSES.loadDashboardStats();
      }
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

  async function showStartSessionPage(courseCode, courseName, year, semester) {
    sessionStorage.setItem('starting_course_code', courseCode);
    sessionStorage.setItem('starting_course_name', courseName);
    sessionStorage.setItem('starting_course_year', year);
    sessionStorage.setItem('starting_course_semester', semester);
    
    const container = document.getElementById('courses-grid-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="start-session-page" style="max-width: 500px; margin: 0 auto;">
        <button class="btn btn-outline btn-sm" onclick="SESSION_COURSES.viewCoursesGrid()" style="margin-bottom: 20px;">← Back to Courses</button>
        <div class="inner-panel">
          <h2>▶️ Start New Session</h2>
          <p class="sub">Course: <strong>${core().escapeHtml(courseCode)} - ${core().escapeHtml(courseName)}</strong></p>
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
            <button class="btn btn-teal" id="start-get-loc-btn" onclick="SESSION_SESSIONS.getStartLocation()">📍 Get my location</button>
            <div class="loc-result" id="start-loc-result"></div>
          </div>
          <button class="btn btn-ug" id="start-gen-btn" onclick="SESSION_SESSIONS.generateAndStartSession()" disabled style="margin-top: 20px;">▶️ Generate QR Code & Start Session</button>
          <p class="gen-hint" id="start-gen-hint">📍 Get your classroom location first.</p>
        </div>
      </div>
    `;
    core().state.lecLat = null;
    core().state.lecLng = null;
    core().state.locAcquired = false;
  }
  
  function getStartLocation() {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    if (!btn || !res) return;
    
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Getting location…';
    res.className = 'loc-result';
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…';
    
    if (!navigator.geolocation) { demoStartLoc(); return; }
    
    navigator.geolocation.getCurrentPosition(p => {
      core().state.lecLat = p.coords.latitude;
      core().state.lecLng = p.coords.longitude;
      core().state.locAcquired = true;
      startLocOK(p.coords.accuracy);
    }, () => demoStartLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  
  function demoStartLoc() {
    core().state.lecLat = 5.6505 + (Math.random() - .5) * .001;
    core().state.lecLng = -0.1875 + (Math.random() - .5) * .001;
    core().state.locAcquired = true;
    startLocOK(null);
  }
  
  function startLocOK(acc) {
    const btn = document.getElementById('start-get-loc-btn');
    const res = document.getElementById('start-loc-result');
    const genBtn = document.getElementById('start-gen-btn');
    const genHint = document.getElementById('start-gen-hint');
    
    if (!btn || !res) return;
    
    res.className = 'loc-result ok';
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${core().state.lecLat.toFixed(5)}, ${core().state.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`;
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
    if (!core().state.locAcquired || !core().state.lecLat) {
      await MODAL.alert('Location required', '📍 Get your classroom location first.');
      return;
    }
    
    UI.btnLoad('start-gen-btn', true);
    
    try {
      const myId = core().getCurrentLecturerId();
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
      
      const user = core().getCurrentUser();
      const allSessions = await DB.SESSION.getAll();
      const existing = allSessions.filter(s => s.lecFbId === myId);
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
        lat: core().state.lecLat, lng: core().state.lecLng, radius: radius, locEnabled: true,
        active: true, createdAt: Date.now(), year: courseYear, semester: courseSemester,
        records: {}, sids: {}, devs: {}
      };
      
      await DB.SESSION.set(sessId, sessionData);
      
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
      core().switchTab('session');
    } catch(err) {
      UI.btnLoad('start-gen-btn', false, 'Start Session');
      await MODAL.error('Error', err.message);
    }
  }

  return {
    loadActiveSessions,
    endSessionById,
    downloadSessionQR,
    showStartSessionPage,
    getStartLocation,
    generateAndStartSession
  };
})();

window.SESSION_SESSIONS = SESSION_SESSIONS;
