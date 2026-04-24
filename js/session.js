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
    refreshInterval: null
  };

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ==================== MAIN TAB FUNCTION ====================
  function tab(name) {
    console.log('[LEC] Switching to tab:', name);
    
    // Update tab active states
    document.querySelectorAll('#view-lecturer .tab').forEach(t => {
      const tabName = t.getAttribute('data-tab');
      if (tabName === name) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    
    // Update page visibility
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => {
      const pageId = p.id;
      const expectedId = `lec-pg-${name}`;
      if (pageId === expectedId) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    
    // Load data for each tab
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
      const setup = document.getElementById('lec-setup');
      const active = document.getElementById('lec-active');
      if (setup) setup.style.display = 'block';
      if (active) active.style.display = 'none';
    }
  }

  // ==================== 1. MY COURSES TAB ====================
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    
    // Get current date for default selection
    const now = new Date();
    let defaultYear = now.getFullYear();
    const month = now.getMonth();
    let defaultSemester = (month >= 7 || month <= 0) ? 1 : 2;
    if (defaultSemester === 2 && month <= 6) defaultYear = defaultYear - 1;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="mycourses-year" class="fi" style="padding:8px">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
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
        <div>
          <button class="btn btn-ug" onclick="LEC.viewCourses()">View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="LEC.showAddCourse()">+ Add New Course</button>
        </div>
      </div>
      <div id="courses-display"><div class="att-empty">Select Year and Semester to view your courses</div></div>
      <div id="add-course-section" style="display:none; margin-top:20px">
        <div class="inner-panel">
          <h3>Add New Course</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">Course Code</label>
              <input type="text" id="new-course-code" class="fi" placeholder="e.g., DCIT101" oninput="this.value=this.value.toUpperCase()"/>
            </div>
            <div class="field">
              <label class="fl">Course Name</label>
              <input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Computing"/>
            </div>
          </div>
          <div class="two-col" style="margin-top:10px">
            <div class="field">
              <label class="fl">Academic Year</label>
              <select id="new-course-year" class="fi">
                <option value="">Select Year</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
            <div class="field">
              <label class="fl">Semester</label>
              <select id="new-course-semester" class="fi">
                <option value="">Select Semester</option>
                <option value="1">First Semester</option>
                <option value="2">Second Semester</option>
              </select>
            </div>
          </div>
          <button class="btn btn-ug" onclick="LEC.addNewCourse()">Create Course</button>
          <button class="btn btn-secondary" onclick="LEC.hideAddCourse()">Cancel</button>
        </div>
      </div>
    `;
    
    // Set default values
    const yearSelect = document.getElementById('mycourses-year');
    const semSelect = document.getElementById('mycourses-semester');
    if (yearSelect) yearSelect.value = defaultYear;
    if (semSelect) semSelect.value = defaultSemester;
    
    // Auto-load courses for current period
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
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of allSessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        
        if (sessionYear === S.currentViewYear && sessionSemester === S.currentViewSemester) {
          if (!uniqueCourses.has(session.courseCode)) {
            uniqueCourses.set(session.courseCode, {
              code: session.courseCode,
              name: session.courseName,
              lastSessionDate: session.date,
              sessionCount: 1
            });
          } else {
            const existing = uniqueCourses.get(session.courseCode);
            existing.sessionCount++;
            uniqueCourses.set(session.courseCode, existing);
          }
        }
      }
      
      const courses = Array.from(uniqueCourses.values()).sort((a,b) => a.code.localeCompare(b.code));
      
      if (courses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">No courses found for ${S.currentViewYear} - Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.<br/>Click "Add New Course" to create one.</div></div>`;
        return;
      }
      
      let html = `<h3 style="margin-bottom:15px; color:var(--ug)">📚 ${S.currentViewYear} - ${S.currentViewSemester === 1 ? 'First Semester' : 'Second Semester'}</h3>`;
      for (const c of courses) {
        html += `
          <div class="course-card-item">
            <div>
              <div style="font-weight:700; font-size:16px; color:var(--ug)">${UI.esc(c.code)}</div>
              <div style="font-size:13px; color:var(--text2)">${UI.esc(c.name)}</div>
              <div style="font-size:11px; color:var(--text3); margin-top:5px">📊 ${c.sessionCount} session(s) · Last: ${c.lastSessionDate}</div>
            </div>
            <button class="btn btn-ug btn-sm" onclick="LEC.startSessionForCourse('${c.code}', ${S.currentViewYear}, ${S.currentViewSemester})">▶ Start Session</button>
          </div>
        `;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('View courses error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
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
      const courseKey = `${code}_${yearInt}_${semInt}`;
      const existing = await DB.COURSE.get(courseKey);
      
      if (existing) {
        await MODAL.alert('Course Exists', `Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const courseData = {
        code: code,
        name: name,
        year: yearInt,
        semester: semInt,
        active: true,
        createdAt: Date.now(),
        createdBy: AUTH.getSession()?.id || 'unknown'
      };
      
      await DB.COURSE.set(courseKey, courseData);
      await MODAL.success('Course Created', `${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCourses();
    } catch(err) {
      console.error('Add course error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  async function startSessionForCourse(courseCode, year, semester) {
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    if (lCode) lCode.value = courseCode;
    
    // Get course name
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const found = sessions.find(s => s.courseCode === courseCode);
      if (found && lCourse) lCourse.value = found.courseName;
    } catch(e) {}
    
    await onYearSemesterChange();
    tab('session');
    document.getElementById('lec-setup')?.scrollIntoView({ behavior: 'smooth' });
  }

  // ==================== 2. SESSION TAB ====================
  async function onYearSemesterChange() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    if (year && semester) {
      await _loadExistingCoursesForPeriod(parseInt(year), parseInt(semester));
      const existingDiv = document.getElementById('existing-course-select');
      if (existingDiv) existingDiv.style.display = 'block';
    } else {
      const existingDiv = document.getElementById('existing-course-select');
      if (existingDiv) existingDiv.style.display = 'none';
    }
  }

  async function _loadExistingCoursesForPeriod(year, semester) {
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of allSessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        
        if (sessionYear === year && sessionSemester === semester) {
          if (!uniqueCourses.has(session.courseCode)) {
            uniqueCourses.set(session.courseCode, { 
              code: session.courseCode, 
              name: session.courseName 
            });
          }
        }
      }
      
      const select = document.getElementById('existing-course-select-dropdown');
      if (select) {
        const options = Array.from(uniqueCourses.values());
        if (options.length) {
          select.innerHTML = `<option value="">-- Select existing course --</option>` + 
            options.map(c => `<option value="${UI.esc(c.code)}" data-name="${UI.esc(c.name)}">${UI.esc(c.code)} - ${UI.esc(c.name)}</option>`).join('');
        } else {
          select.innerHTML = `<option value="">-- No existing courses for this period --</option>`;
        }
      }
    } catch(e) { console.warn(e); }
  }

  function selectExistingCourse() {
    const select = document.getElementById('existing-course-select-dropdown');
    const selected = select?.options[select.selectedIndex];
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    if (selected && selected.value && lCode && lCourse) {
      lCode.value = selected.value;
      lCourse.value = selected.getAttribute('data-name') || '';
    }
  }

  function toggleNewCourseFields() {
    const useNew = document.getElementById('use-new-course')?.checked;
    const existingDiv = document.getElementById('existing-course-select');
    const newDiv = document.getElementById('new-course-fields');
    if (useNew) {
      if (existingDiv) existingDiv.style.display = 'none';
      if (newDiv) newDiv.style.display = 'block';
    } else {
      if (existingDiv) existingDiv.style.display = 'block';
      if (newDiv) newDiv.style.display = 'none';
    }
  }

  function getLoc() { 
    const btn = document.getElementById('get-loc-btn');
    const res = document.getElementById('loc-result');
    if (!btn || !res) return;
    btn.disabled = true; 
    btn.innerHTML = '<span class="spin"></span>Getting location…'; 
    res.className = 'loc-result'; 
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…'; 
    if (!navigator.geolocation) { _demoLoc(); return; } 
    navigator.geolocation.getCurrentPosition(p => { 
      S.lecLat = p.coords.latitude; 
      S.lecLng = p.coords.longitude; 
      S.locAcquired = true; 
      _locOK(p.coords.accuracy); 
    }, () => _demoLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); 
  }
  
  function _demoLoc() { 
    S.lecLat = 5.6505 + (Math.random() - .5) * .001; 
    S.lecLng = -0.1875 + (Math.random() - .5) * .001; 
    S.locAcquired = true; 
    _locOK(null); 
  }
  
  function _locOK(acc) { 
    const btn = document.getElementById('get-loc-btn');
    const res = document.getElementById('loc-result');
    if (!btn || !res) return;
    res.className = 'loc-result ok'; 
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`; 
    btn.disabled = false; 
    btn.textContent = '🔄 Refresh location'; 
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    if (genBtn) genBtn.disabled = false; 
    if (genHint) genHint.style.display = 'none'; 
  }

  function toggleFence() { 
    S.locOn = !S.locOn; 
    const locTog = document.getElementById('loc-tog');
    const locLbl = document.getElementById('loc-lbl');
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    if (locTog) locTog.classList.toggle('on', S.locOn);
    if (locLbl) locLbl.textContent = S.locOn ? 'Location fence enabled' : 'Location fence disabled'; 
    if (!S.locOn) { 
      if (genBtn) genBtn.disabled = false; 
      if (genHint) genHint.style.display = 'none'; 
    } else if (!S.locAcquired) { 
      if (genBtn) genBtn.disabled = true; 
      if (genHint) genHint.style.display = 'block'; 
    } 
  }

  async function startSession() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const lLecname = document.getElementById('l-lecname');
    const lDur = document.getElementById('l-dur');
    
    const code = lCode?.value.trim().toUpperCase() || '';
    const course = lCourse?.value.trim() || '';
    const lecName = lLecname?.value.trim() || '';
    const mins = lDur ? +(lDur.value) : 60;
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester first.');
      return;
    }
    if (!code || !course) {
      await MODAL.alert('Missing Info', 'Please enter course code and name.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    if (S.locOn && !S.locAcquired) { 
      await MODAL.alert('Location required', 'Get your classroom location first.'); 
      return; 
    }
    
    const genBtn = document.getElementById('gen-btn');
    UI.btnLoad('gen-btn', true);
    try { 
      const user = AUTH.getSession(); 
      const myId = user?.id || ''; 
      const existing = await DB.SESSION.byLec(myId); 
      if (existing.find(s => s.courseCode === code && s.active)) { 
        UI.btnLoad('gen-btn', false, 'Start Session'); 
        await MODAL.error('Session conflict', `A session for ${code} is already active.`); 
        return; 
      } 
      const token = UI.makeToken(20), sessId = token.slice(0, 12); 
      S.session = { 
        id: sessId, 
        token: token, 
        courseCode: code, 
        courseName: course, 
        lecturer: lecName, 
        lecId: user?.lecId || '', 
        lecFbId: myId, 
        department: user?.department || '', 
        date: UI.todayStr(), 
        expiresAt: Date.now() + mins * 60000, 
        durationMins: mins, 
        lat: S.locOn ? S.lecLat : null, 
        lng: S.locOn ? S.lecLng : null, 
        radius: S.locOn ? +(document.getElementById('l-radius')?.value || 100) : null, 
        locEnabled: S.locOn, 
        active: true, 
        createdAt: Date.now(), 
        year: yearInt, 
        semester: semInt
      }; 
      await DB.SESSION.set(sessId, S.session); 
      _buildPanel(lecName, mins); 
    } catch (err) { 
      UI.btnLoad('gen-btn', false, 'Start Session'); 
      console.error('Start session error:', err);
      await MODAL.error('Error', err.message); 
    } 
  }

  function _buildPanel(lecName, mins) { 
    const s = S.session;
    _setText('l-si-code', s.courseCode);
    _setText('l-si-course', s.courseName);
    _setText('l-si-lec', lecName);
    _setText('l-si-date', s.date);
    _setText('l-si-id', s.id);
    _setText('l-si-dur', UI.fmtDur(mins));
    _setText('l-si-period', `${s.year} - Semester ${s.semester === 1 ? 'First' : 'Second'}`);
    
    const lc = document.getElementById('l-loc-card');
    if (lc) {
      if (s.locEnabled && s.lat) {
        lc.className = 'strip strip-teal';
        const lfcTitle = document.getElementById('l-lfc-title');
        const lfcDetail = document.getElementById('l-lfc-detail');
        if (lfcTitle) lfcTitle.textContent = `Location fence — within ${s.radius}m`;
        if (lfcDetail) lfcDetail.textContent = `Anchor: ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
      } else {
        lc.className = 'strip strip-gray';
      }
    }
    
    const qrBox = document.getElementById('qr-box');
    if (qrBox) {
      qrBox.innerHTML = '';
      const payload = UI.b64e(JSON.stringify({ 
        id: s.id, token: s.token, code: s.courseCode, course: s.courseName, 
        date: s.date, expiresAt: s.expiresAt, lat: s.lat, lng: s.lng, 
        radius: s.radius, locEnabled: s.locEnabled 
      }));
      const qrUrl = `${CONFIG.SITE_URL}?ci=${payload}`;
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrBox, { text: qrUrl, width: 220, height: 220, colorDark: '#1a1a18', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      } else {
        qrBox.innerHTML = `<p style="padding:10px;font-size:11px;word-break:break-all;max-width:220px">${UI.esc(qrUrl)}</p>`;
      }
    }
    
    const lecSetup = document.getElementById('lec-setup');
    const lecActive = document.getElementById('lec-active');
    if (lecSetup) lecSetup.style.display = 'none';
    if (lecActive) lecActive.style.display = 'block';
    
    UI.btnLoad('gen-btn', false, 'Start Session');
    
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.tickTimer) clearInterval(S.tickTimer);
    
    S.unsubRec = DB.SESSION.listenRecords(s.id, recs => { _renderAtt(recs); });
    S.unsubBlk = DB.SESSION.listenBlocked(s.id, _renderBlk);
    _tick(); 
    S.tickTimer = setInterval(_tick, 1000);
    
    if (S.refreshInterval) clearInterval(S.refreshInterval);
    S.refreshInterval = setInterval(async () => {
      if (S.session && S.session.id) {
        const recs = await DB.SESSION.getRecords(S.session.id);
        _renderAtt(recs);
      }
    }, 5000);
  }

  function _tick() { 
    if (!S.session) return; 
    const rem = Math.max(0, S.session.expiresAt - Date.now());
    const el = document.getElementById('l-cd');
    if (!el) return;
    if (rem === 0) { 
      el.textContent = 'Session expired'; 
      el.className = 'countdown exp'; 
      const qrBox = document.getElementById('qr-box');
      if (qrBox) qrBox.style.opacity = '0.3';
      _autoEndSession('timeout', 'Session duration expired');
      return; 
    } 
    const m = Math.floor(rem / 60000), ss = Math.floor((rem % 60000) / 1000); 
    el.textContent = `${m}:${UI.pad(ss)}`; 
    el.className = 'countdown ' + (rem < 180000 ? 'warn' : 'ok'); 
  }

  async function _autoEndSession(reason, details) {
    if (!S.session) return;
    if (S.tickTimer) clearInterval(S.tickTimer);
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.refreshInterval) clearInterval(S.refreshInterval);
    try { 
      await DB.SESSION.update(S.session.id, { active: false, endedAt: Date.now(), endedReason: reason }); 
    } catch (e) { console.warn(e); } 
    resetForm();
    if (reason !== 'manual') {
      await MODAL.alert('Session Ended', `Session ${S.session.courseCode} has ended automatically.`);
    }
    S.session = null;
  }

  function _renderAtt(records) { 
    if (!Array.isArray(records)) records = []; 
    const attCount = document.getElementById('l-att-count');
    const attList = document.getElementById('l-att-list');
    if (attCount) attCount.textContent = records.length;
    if (attList) {
      if (records.length) {
        attList.innerHTML = records.map((r, i) => `
          <div class="att-item">
            <div class="att-dot"></div>
            <span style="font-size:11px;min-width:22px">${i + 1}.</span>
            <span class="att-name">${UI.esc(r.name)}</span>
            <span class="att-sid">${UI.esc(r.studentId)}</span>
            <span class="att-time">${UI.esc(r.time)}</span>
            <button class="btn btn-outline btn-sm" onclick="LEC.manualCheckin('${r.studentId}')" style="margin-left:auto">Manual Check-in</button>
          </div>
        `).join('');
      } else {
        attList.innerHTML = '<div class="att-empty">Waiting for students to check in...</div>';
      }
    }
  }

  function _renderBlk(blocked) { 
    if (!Array.isArray(blocked)) blocked = []; 
    const w = document.getElementById('l-blk-wrap'); 
    if (!w) return; 
    if (!blocked.length) { 
      w.style.display = 'none'; 
      return; 
    } 
    w.style.display = 'block'; 
    const blkCount = document.getElementById('l-blk-count');
    const blkList = document.getElementById('l-blk-list');
    if (blkCount) blkCount.textContent = blocked.length;
    if (blkList) {
      blkList.innerHTML = blocked.map(b => `
        <div class="blk-item">
          <span><strong>${UI.esc(b.name)}</strong> (${UI.esc(b.studentId)}) — ${UI.esc(b.reason)}</span>
          <span style="white-space:nowrap">${UI.esc(b.time)}</span>
        </div>
      `).join('');
    }
  }

  async function manualCheckin(studentId) {
    if (!S.session) {
      await MODAL.alert('No Active Session', 'No active session to check into.');
      return;
    }
    
    const student = await DB.STUDENTS.byStudentId(studentId);
    if (!student) {
      await MODAL.alert('Student Not Found', `No student found with ID: ${studentId}`);
      return;
    }
    
    const confirmed = await MODAL.confirm(
      'Manual Check-in',
      `Check in ${student.name} (${student.studentId}) to ${S.session.courseCode}?`,
      { confirmLabel: 'Yes, Check In', confirmCls: 'btn-ug' }
    );
    
    if (!confirmed) return;
    
    const biometricId = `manual_${Date.now()}`;
    const normSid = student.studentId.toUpperCase();
    
    try {
      if (await DB.SESSION.hasSid(S.session.id, normSid)) {
        await MODAL.alert('Already Checked In', `${student.name} has already checked in.`);
        return;
      }
      
      await Promise.all([
        DB.SESSION.addDevice(S.session.id, biometricId),
        DB.SESSION.addSid(S.session.id, normSid),
        DB.SESSION.pushRecord(S.session.id, {
          name: student.name,
          studentId: normSid,
          biometricId: biometricId,
          authMethod: 'manual',
          locNote: 'Manual check-in by lecturer',
          time: UI.nowTime(),
          checkedAt: Date.now(),
          manualCheckin: true,
          checkedBy: AUTH.getSession()?.name || 'Lecturer'
        })
      ]);
      
      await MODAL.success('Checked In', `${student.name} has been manually checked in.`);
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function endSession() { 
    const ok = await MODAL.confirm('End session?', 'All records will be saved.', 
      { icon: '🛑', confirmLabel: 'End session', confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    if (S.tickTimer) clearInterval(S.tickTimer);
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.refreshInterval) clearInterval(S.refreshInterval);
    if (S.session) {
      try { 
        await DB.SESSION.update(S.session.id, { active: false, endedAt: Date.now() }); 
      } catch (e) { console.warn(e); } 
    }
    resetForm(); 
    await MODAL.success('Session ended', 'All records saved.'); 
  }

  function downloadQR() { 
    const qrBox = document.getElementById('qr-box');
    const canvas = qrBox?.querySelector('canvas'); 
    const img = qrBox?.querySelector('img'); 
    if (!canvas && !img) { 
      MODAL.alert('QR not ready', 'Start a session first.'); 
      return; 
    } 
    const a = document.createElement('a'); 
    a.href = canvas ? canvas.toDataURL('image/png') : img.src; 
    a.download = `QR_${S.session?.courseCode}_${S.session?.date}.png`; 
    a.click(); 
  }

  async function exportLiveCSV() { 
    if (!S.session) return; 
    const recs = await DB.SESSION.getRecords(S.session.id); 
    const rows = [['#', 'Name', 'Student ID', 'Time', 'Course', 'Lecturer', 'Date']]; 
    recs.forEach((r, i) => rows.push([i + 1, r.name, r.studentId, r.time, S.session.courseCode, S.session.lecturer, S.session.date])); 
    UI.dlCSV(rows, `ATT_${S.session.courseCode}_LIVE`); 
  }

  // ==================== 3. MY RECORDS TAB ====================
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
    
    const yearSelect = document.getElementById('records-year');
    const semSelect = document.getElementById('records-semester');
    if (yearSelect) yearSelect.onchange = () => _populateCourseSelect();
    if (semSelect) semSelect.onchange = () => _populateCourseSelect();
  }

  async function _populateCourseSelect() {
    const year = document.getElementById('records-year')?.value;
    const semester = document.getElementById('records-semester')?.value;
    const courseSelect = document.getElementById('records-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of sessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        if (sessionYear === parseInt(year) && sessionSemester === parseInt(semester)) {
          uniqueCourses.set(session.courseCode, session.courseName);
        }
      }
      
      if (uniqueCourses.size === 0) {
        courseSelect.innerHTML = '<option value="">No courses found</option>';
      } else {
        courseSelect.innerHTML = '<option value="">Select Course</option>' + 
          Array.from(uniqueCourses.entries()).map(([code, name]) => 
            `<option value="${UI.esc(code)}">${UI.esc(code)} - ${UI.esc(name)}</option>`
          ).join('');
      }
    } catch(err) {
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
      const user = AUTH.getSession();
      const myId = user?.id || '';
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const filteredSessions = sessions.filter(s => {
        let sessionYear = s.year;
        let sessionSemester = s.semester;
        if (!sessionYear && s.date) {
          const sessionDate = new Date(s.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        return sessionYear === yearInt && sessionSemester === semInt;
      }).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No sessions found for this course.</div>';
        return;
      }
      
      let html = `<h3 style="margin-bottom:15px">📋 ${UI.esc(courseCode)} - ${UI.esc(filteredSessions[0]?.courseName || '')}</h3>`;
      html += `<div style="margin-bottom:20px"><button class="btn btn-ug" onclick="LEC.exportAllSessionsToExcel('${courseCode}', ${yearInt}, ${semInt})">📊 Export All to Excel</button></div>`;
      
      for (const session of filteredSessions) {
        const records = session.records ? Object.values(session.records) : [];
        html += `
          <div class="sess-card" style="margin-bottom:16px">
            <div class="sc-hdr" style="background:var(--ug); color:white; padding:12px; border-radius:8px 8px 0 0; margin:-13px -13px 0 -13px">
              <div>
                <strong>📅 ${session.date}</strong> 
                <span style="margin-left:10px">⏱️ ${session.durationMins || 60} min</span>
                <span style="margin-left:10px">👥 ${records.length} students</span>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="LEC.exportSessionToExcel('${session.id}')">📥 Download Excel</button>
            </div>
            <div style="padding:12px; overflow-x:auto">
              <table style="width:100%; border-collapse:collapse">
                <thead>
                  <tr style="border-bottom:2px solid var(--border)">
                    <th style="padding:8px; text-align:left">#</th>
                    <th style="padding:8px; text-align:left">Student Name</th>
                    <th style="padding:8px; text-align:left">Student ID</th>
                    <th style="padding:8px; text-align:left">Check-in Time</th>
                    <th style="padding:8px; text-align:left">Method</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map((r, i) => `
                    <tr style="border-bottom:1px solid var(--border2)">
                      <td style="padding:8px">${i+1}</td>
                      <td style="padding:8px">${UI.esc(r.name)}</td>
                      <td style="padding:8px">${UI.esc(r.studentId)}</td>
                      <td style="padding:8px">${r.time}</td>
                      <td style="padding:8px">${r.authMethod === 'manual' ? 'Manual Check-in' : 'Biometric'}</td>
                    </tr>
                  `).join('')}
                  ${records.length === 0 ? '<tr><td colspan="5" style="padding:20px; text-align:center">No check-ins for this session</td></tr>' : ''}
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

  async function exportSessionToExcel(sessionId) {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export library not loaded. Please refresh.');
      return;
    }
    
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    
    const records = session.records ? Object.values(session.records) : [];
    const wsData = [
      ['Attendance Record', session.courseCode, session.courseName],
      ['Date', session.date],
      ['Duration', `${session.durationMins || 60} minutes`],
      ['Lecturer', session.lecturer],
      [''],
      ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method', 'Location']
    ];
    
    records.forEach((r, i) => {
      wsData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Biometric', r.locNote || 'N/A']);
    });
    
    wsData.push([''], ['Total Students Present:', records.length]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:25}, {wch:15}, {wch:12}, {wch:18}, {wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance_${session.courseCode}_${session.date}`);
    XLSX.writeFile(wb, `UG_ATT_${session.courseCode}_${session.date}.xlsx`);
    
    await MODAL.success('Export Complete', 'Excel file has been downloaded.');
  }

  async function exportAllSessionsToExcel(courseCode, year, semester) {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export library not loaded.');
      return;
    }
    
    const user = AUTH.getSession();
    const myId = user?.id || '';
    let sessions = await DB.SESSION.byLec(myId);
    sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
    
    const filteredSessions = sessions.filter(s => {
      let sessionYear = s.year;
      let sessionSemester = s.semester;
      if (!sessionYear && s.date) {
        const sessionDate = new Date(s.date);
        const month = sessionDate.getMonth();
        sessionYear = sessionDate.getFullYear();
        sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
      }
      return sessionYear === year && sessionSemester === semester;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['Attendance Summary Report'],
      [`Course: ${courseCode}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [],
      ['Student ID', 'Student Name', 'Total Sessions', 'Sessions Attended', 'Attendance Rate (%)']
    ];
    
    const studentStats = new Map();
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      for (const r of records) {
        if (!studentStats.has(r.studentId)) {
          studentStats.set(r.studentId, { name: r.name, attended: 0, total: filteredSessions.length });
        }
        const stat = studentStats.get(r.studentId);
        stat.attended++;
        studentStats.set(r.studentId, stat);
      }
    }
    
    for (const [sid, stat] of studentStats) {
      const rate = ((stat.attended / stat.total) * 100).toFixed(1);
      summaryData.push([sid, stat.name, stat.total, stat.attended, rate]);
    }
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{wch:15}, {wch:25}, {wch:15}, {wch:18}, {wch:18}];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    // Individual session sheets
    for (const session of filteredSessions) {
      const records = session.records ? Object.values(session.records) : [];
      const sessionData = [
        [`Session: ${session.date}`],
        [`Total Students: ${records.length}`],
        [],
        ['#', 'Student Name', 'Student ID', 'Check-in Time', 'Verification Method']
      ];
      records.forEach((r, i) => {
        sessionData.push([i+1, r.name, r.studentId, r.time, r.authMethod === 'manual' ? 'Manual' : 'Biometric']);
      });
      const ws = XLSX.utils.aoa_to_sheet(sessionData);
      const sheetName = session.date.replace(/\//g, '-').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    
    XLSX.writeFile(wb, `UG_ATT_${courseCode}_${year}_Sem${semester}_FULL.xlsx`);
    await MODAL.success('Export Complete', 'Excel workbook with all sessions has been downloaded.');
  }

  // ==================== 4. REPORTS TAB ====================
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
    if (yearSelect) yearSelect.onchange = () => _populateReportCourseSelect();
    if (semSelect) semSelect.onchange = () => _populateReportCourseSelect();
  }

  async function _populateReportCourseSelect() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of sessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        if (sessionYear === parseInt(year) && sessionSemester === parseInt(semester)) {
          uniqueCourses.set(session.courseCode, session.courseName);
        }
      }
      
      if (uniqueCourses.size === 0) {
        courseSelect.innerHTML = '<option value="">No courses found</option>';
      } else {
        courseSelect.innerHTML = '<option value="">Select Course</option>' + 
          Array.from(uniqueCourses.entries()).map(([code, name]) => 
            `<option value="${UI.esc(code)}">${UI.esc(code)} - ${UI.esc(name)}</option>`
          ).join('');
      }
    } catch(err) {
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
      const user = AUTH.getSession();
      const myId = user?.id || '';
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => s.courseCode === courseCode && !s.active);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const filteredSessions = sessions.filter(s => {
        let sessionYear = s.year;
        let sessionSemester = s.semester;
        if (!sessionYear && s.date) {
          const sessionDate = new Date(s.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        return sessionYear === yearInt && sessionSemester === semInt;
      }).sort((a, b) => new Date(a.date) - new Date(b.date));
      
      if (filteredSessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No sessions found for this course.</div>';
        return;
      }
      
      // Calculate student attendance statistics
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
        <div class="stats-grid" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${studentStats.size}</div><div class="stat-label">Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${Math.round(Array.from(studentStats.values()).reduce((sum,s) => sum + s.attended, 0) / totalSessions)}</div><div class="stat-label">Avg per Session</div></div>
        </div>
        <h3>📊 Attendance Report: ${UI.esc(courseCode)}</h3>
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
        if (rateNum >= 80) { status = '✅ Excellent'; statusColor = 'var(--teal)'; }
        else if (rateNum >= 60) { status = '⚠️ Good'; statusColor = 'var(--amber)'; }
        else { status = '❌ Poor'; statusColor = 'var(--danger)'; }
        
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
      
      html += `</tbody></table></div>`;
      container.innerHTML = html;
      S.currentReportData = { year: yearInt, semester: semInt, courseCode, studentStats, totalSessions };
      
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') {
      await MODAL.alert('Library Error', 'Excel export library not loaded.');
      return;
    }
    
    if (!S.currentReportData) {
      await MODAL.alert('No Data', 'Please generate a report first.');
      return;
    }
    
    const { year, semester, courseCode, studentStats, totalSessions } = S.currentReportData;
    
    const wsData = [
      ['Attendance Report'],
      [`Course: ${courseCode}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${totalSessions}`],
      [`Total Students: ${studentStats.size}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Rate (%)', 'Status']
    ];
    
    let i = 1;
    for (const [sid, stat] of studentStats) {
      const rate = ((stat.attended / totalSessions) * 100).toFixed(1);
      const status = parseFloat(rate) >= 60 ? 'Good Standing' : 'At Risk';
      wsData.push([i++, sid, stat.name, stat.attended, totalSessions, rate, status]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:5}, {wch:15}, {wch:25}, {wch:18}, {wch:15}, {wch:18}, {wch:15}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    
    await MODAL.success('Export Complete', 'Report has been downloaded.');
  }

  // ==================== 5. COURSE MANAGEMENT TAB ====================
  async function _loadCourses() {
    const container = document.getElementById('active-courses-list');
    const historyContainer = document.getElementById('course-history-list');
    
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:20px">
        <div style="flex:1; min-width:150px">
          <label class="fl">Academic Year</label>
          <select id="course-year" class="fi">
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
          <select id="course-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="LEC.loadCourses()">Load Courses</button>
        </div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">Select Year and Semester to view courses</div></div>
    `;
    
    if (historyContainer) {
      historyContainer.innerHTML = `
        <h3 style="margin:15px 0 10px">📦 Archived Courses</h3>
        <div id="archived-courses-list"><div class="att-empty">Select Year and Semester to view archived courses</div></div>
      `;
    }
  }

  async function loadCourses() {
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
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const allCourses = await DB.COURSE.getAll();
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const courseMap = new Map();
      for (const session of sessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          const month = sessionDate.getMonth();
          sessionYear = sessionDate.getFullYear();
          sessionSemester = (month >= 7 || month <= 0) ? 1 : (month >= 1 && month <= 6 ? 2 : 1);
        }
        if (sessionYear === yearInt && sessionSemester === semInt) {
          if (!courseMap.has(session.courseCode)) {
            const courseRecord = allCourses.find(c => 
              c.code === session.courseCode && c.year === yearInt && c.semester === semInt
            );
            courseMap.set(session.courseCode, {
              code: session.courseCode,
              name: session.courseName,
              active: courseRecord ? courseRecord.active !== false : true,
              sessionCount: 1,
              lastSessionDate: session.date
            });
          } else {
            const existing = courseMap.get(session.courseCode);
            existing.sessionCount++;
            courseMap.set(session.courseCode, existing);
          }
        }
      }
      
      const activeCourses = [];
      const archivedCourses = [];
      for (const [code, course] of courseMap) {
        if (course.active) {
          activeCourses.push(course);
        } else {
          archivedCourses.push(course);
        }
      }
      
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = activeCourses.map(c => `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(c.code)}</div>
              <div class="course-status active">🟢 Active</div>
            </div>
            <div class="course-name">${UI.esc(c.name)}</div>
            <div class="course-meta">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}</div>
            <button class="btn btn-warning btn-sm" onclick="LEC.disableCourse('${c.code}', ${yearInt}, ${semInt})">⏹️ Disable Course</button>
          </div>
        `).join('');
      }
      
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = archivedCourses.map(c => `
            <div class="course-management-card archived">
              <div class="course-header">
                <div class="course-code">${UI.esc(c.code)}</div>
                <div class="course-status inactive">🔴 Archived</div>
              </div>
              <div class="course-name">${UI.esc(c.name)}</div>
              <div class="course-meta">📊 ${c.sessionCount} sessions · Last: ${c.lastSessionDate}</div>
              <button class="btn btn-teal btn-sm" onclick="LEC.enableCourse('${c.code}', ${yearInt}, ${semInt})">🔄 Enable Course</button>
            </div>
          `).join('');
        }
      }
    } catch(err) {
      activeContainer.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm(
      'Disable Course',
      `Disable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}? Students cannot check in.`,
      { confirmLabel: 'Yes, Disable', confirmCls: 'btn-warning' }
    );
    
    if (!confirmed) return;
    
    try {
      const courseKey = `${courseCode}_${year}_${semester}`;
      await DB.COURSE.update(courseKey, { active: false, disabledAt: Date.now() });
      await MODAL.success('Course Disabled', `${courseCode} has been disabled.`);
      await loadCourses();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm(
      'Enable Course',
      `Enable ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`,
      { confirmLabel: 'Yes, Enable', confirmCls: 'btn-teal' }
    );
    
    if (!confirmed) return;
    
    try {
      const courseKey = `${courseCode}_${year}_${semester}`;
      await DB.COURSE.update(courseKey, { active: true, enabledAt: Date.now() });
      await MODAL.success('Course Enabled', `${courseCode} is now active.`);
      await loadCourses();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== 6. TAS TAB ====================
  async function _loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="inner-panel" style="margin-bottom:20px">
        <h3>Invite New Teaching Assistant</h3>
        <div class="two-col">
          <div class="field">
            <label class="fl">TA Email</label>
            <input type="email" id="ta-email-input" class="fi" placeholder="ta@example.com"/>
          </div>
          <div class="field">
            <label class="fl">TA Full Name</label>
            <input type="text" id="ta-name-input" class="fi" placeholder="John Mensah"/>
          </div>
        </div>
        <div class="two-col">
          <div class="field">
            <label class="fl">Academic Year</label>
            <select id="ta-year-input" class="fi">
              <option value="">Select Year</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>
          <div class="field">
            <label class="fl">Semester</label>
            <select id="ta-semester-input" class="fi">
              <option value="">Select Semester</option>
              <option value="1">First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
        </div>
        <button class="btn btn-ug" onclick="LEC.inviteTA()">📧 Send Invite</button>
      </div>
      <div class="list-hdr">
        <h3>My Teaching Assistants</h3>
        <span class="badge" id="ta-count">0</span>
      </div>
      <div id="ta-list-container"><div class="att-empty">Loading TAs...</div></div>
    `;
    
    await refreshTAList();
  }

  async function refreshTAList() {
    const container = document.getElementById('ta-list-container');
    const countElement = document.getElementById('ta-count');
    
    if (!container) return;
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId) && ta.active !== false);
      
      if (countElement) countElement.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">No TAs added yet. Send an invite above.</div>';
        return;
      }
      
      container.innerHTML = myTAs.map(ta => `
        <div class="att-item">
          <div class="att-dot" style="background:var(--teal)"></div>
          <span class="att-name">${UI.esc(ta.name || 'Unknown')}</span>
          <span class="att-sid">${UI.esc(ta.email)}</span>
          <span class="pill pill-teal">Active</span>
          ${ta.year ? `<span class="pill pill-gray">${ta.year} - Sem ${ta.semester}</span>` : ''}
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
    const name = document.getElementById('ta-name-input')?.value.trim();
    const year = document.getElementById('ta-year-input')?.value;
    const semester = document.getElementById('ta-semester-input')?.value;
    
    if (!email || !name) {
      await MODAL.alert('Missing Info', 'Please enter TA name and email.');
      return;
    }
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester for this TA.');
      return;
    }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = UI.makeToken();
    const user = AUTH.getSession();
    const signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
    
    // Save invite to database
    await DB.TA.setInvite(inviteKey, {
      code: code,
      toEmail: email,
      toName: name,
      lecturerId: user?.id,
      lecturerName: user?.name,
      year: parseInt(year),
      semester: parseInt(semester),
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      usedAt: null
    });
    
    // Try to send email
    let emailSent = false;
    if (typeof AUTH !== 'undefined' && AUTH._sendTAInviteEmail) {
      emailSent = await AUTH._sendTAInviteEmail(email, name, code, signupLink, user?.name, year, semester);
    }
    
    if (emailSent) {
      await MODAL.success('Invite Sent', `An invite email has been sent to ${email}`);
    } else {
      // Show code manually if email fails
      await MODAL.alert(
        'Invite Code Generated',
        `<div style="text-align:center">
           <div style="font-size:36px; font-family:monospace; background:var(--ug); color:var(--gold); 
                      padding:20px; border-radius:10px; margin:10px 0; letter-spacing:4px">${code}</div>
           <p><strong>Share this code with ${name}</strong></p>
           <p>Email: ${email}</p>
           <p>Registration link: <a href="${signupLink}" target="_blank">${signupLink}</a></p>
           <p style="font-size:11px; color:var(--text3); margin-top:10px">Valid for 7 days</p>
         </div>`,
        { icon: '📧', btnLabel: 'Done' }
      );
    }
    
    // Clear form
    document.getElementById('ta-email-input').value = '';
    document.getElementById('ta-name-input').value = '';
    if (document.getElementById('ta-year-input')) document.getElementById('ta-year-input').value = '';
    if (document.getElementById('ta-semester-input')) document.getElementById('ta-semester-input').value = '';
    
    await refreshTAList();
  }

  async function endTenure(taId) {
    const confirmed = await MODAL.confirm(
      'End Tenure',
      'End this TA\'s tenure? They will no longer access your dashboard.',
      { confirmLabel: 'Yes, End Tenure', confirmCls: 'btn-danger' }
    );
    
    if (!confirmed) return;
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const ta = await DB.TA.get(taId);
      
      if (ta && ta.lecturers) {
        const updatedLecturers = ta.lecturers.filter(id => id !== myId);
        await DB.TA.update(taId, { 
          lecturers: updatedLecturers,
          endedTenures: { ...(ta.endedTenures || {}), [myId]: Date.now() }
        });
        
        if (updatedLecturers.length === 0) {
          await DB.TA.update(taId, { active: false });
        }
        
        await MODAL.success('Tenure Ended', 'TA removed from your dashboard.');
        await refreshTAList();
      }
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== RESET FORM ====================
  function resetForm() {
    const setup = document.getElementById('lec-setup');
    const active = document.getElementById('lec-active');
    const qrBox = document.getElementById('qr-box');
    const blkWrap = document.getElementById('l-blk-wrap');
    
    if (setup) setup.style.display = 'block';
    if (active) active.style.display = 'none';
    if (qrBox) qrBox.innerHTML = '';
    if (blkWrap) blkWrap.style.display = 'none';
    
    S.locOn = true; 
    S.locAcquired = false; 
    S.lecLat = S.lecLng = null;
    S.session = null;
    
    const locTog = document.getElementById('loc-tog');
    const locLbl = document.getElementById('loc-lbl');
    const locResult = document.getElementById('loc-result');
    const getLocBtn = document.getElementById('get-loc-btn');
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const lLecname = document.getElementById('l-lecname');
    
    if (locTog) locTog.classList.add('on');
    if (locLbl) locLbl.textContent = 'Location fence enabled';
    if (locResult) { locResult.className = ''; locResult.innerHTML = ''; }
    if (getLocBtn) { getLocBtn.disabled = false; getLocBtn.textContent = '📍 Get my current location'; }
    if (genBtn) genBtn.disabled = true;
    if (genHint) genHint.style.display = 'block';
    if (lCode) lCode.value = '';
    if (lCourse) lCourse.value = '';
    if (lLecname) {
      const user = AUTH.getSession();
      lLecname.value = user?.name || user?.email || '';
    }
    
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    if (yearSelect) yearSelect.value = '';
    if (semesterSelect) semesterSelect.value = '';
    
    const existingCourseDiv = document.getElementById('existing-course-select');
    if (existingCourseDiv) existingCourseDiv.style.display = 'none';
    
    const newCourseDiv = document.getElementById('new-course-fields');
    if (newCourseDiv) newCourseDiv.style.display = 'none';
    
    const useExistingRadio = document.querySelector('input[name="course-type"][value="existing"]');
    if (useExistingRadio) useExistingRadio.checked = true;
    
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    if (S.refreshInterval) { clearInterval(S.refreshInterval); S.refreshInterval = null; }
    
    tab('mycourses');
  }

  // ==================== EXPORTS ====================
  return {
    // Tab navigation
    tab,
    resetForm,
    
    // My Courses
    viewCourses,
    showAddCourse,
    hideAddCourse,
    addNewCourse,
    startSessionForCourse,
    
    // Session
    getLoc,
    toggleFence,
    startSession,
    endSession,
    downloadQR,
    exportLiveCSV,
    onYearSemesterChange,
    selectExistingCourse,
    toggleNewCourseFields,
    manualCheckin,
    
    // My Records
    loadRecords,
    exportSessionToExcel,
    exportAllSessionsToExcel,
    
    // Reports
    generateReport,
    exportReportToExcel,
    
    // Course Management
    loadCourses,
    disableCourse,
    enableCourse,
    
    // TA Management
    inviteTA,
    endTenure,
    refreshTAList
  };
})();
