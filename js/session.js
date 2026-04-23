/* session.js — Lecturer & TA Dashboard with Year/Semester Grouping */
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
    currentFilterYear: null,
    currentFilterSemester: null,
    currentViewYear: null,
    currentViewSemester: null
  };

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // MAIN TAB FUNCTION - Fixed
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
      // Session tab - just show the form
      const setup = document.getElementById('lec-setup');
      const active = document.getElementById('lec-active');
      if (setup) setup.style.display = 'block';
      if (active) active.style.display = 'none';
    }
  }

  // LOAD MY COURSES TAB
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:16px">
        <div style="flex:1">
          <label class="fl">Academic Year</label>
          <select id="mycourses-year" class="fi" style="padding:6px 8px;font-size:12px">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
            <option value="2029">2029</option>
            <option value="2030">2030</option>
          </select>
        </div>
        <div style="flex:1">
          <label class="fl">Semester</label>
          <select id="mycourses-semester" class="fi" style="padding:6px 8px;font-size:12px">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug btn-sm" onclick="LEC.viewCourses()" style="margin-top:18px">View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="LEC.showAddCourse()" style="margin-top:18px">+ Add New Course</button>
        </div>
      </div>
      <div id="courses-display"><div class="att-empty">Select Year and Semester to view your courses</div></div>
      <div id="add-course-section" style="display:none; margin-top:20px">
        <div class="inner-panel">
          <h3>Add New Course</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">Course Code</label>
              <input type="text" id="new-course-code" class="fi" placeholder="MATH101" oninput="this.value=this.value.toUpperCase()"/>
            </div>
            <div class="field">
              <label class="fl">Course Name</label>
              <input type="text" id="new-course-name" class="fi" placeholder="Mathematics"/>
            </div>
          </div>
          <button class="btn btn-ug btn-sm" onclick="LEC.addNewCourse()">Create Course</button>
          <button class="btn btn-secondary btn-sm" onclick="LEC.hideAddCourse()">Cancel</button>
        </div>
      </div>
    `;
  }

  // VIEW COURSES - Fixed
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
    container.innerHTML = '<div class="att-empty">Loading courses...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of allSessions) {
        const sessionDate = new Date(session.date);
        let sessionYear = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
        if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
        
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
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">No courses found for ${S.currentViewYear} - Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.<br/>Click "+ Add New Course" to create one.</div></div>`;
        return;
      }
      
      container.innerHTML = `<div class="year-group"><h3 style="font-size:16px;margin-bottom:12px;color:var(--ug);border-left:3px solid var(--ug);padding-left:10px">${S.currentViewYear} - ${S.currentViewSemester === 1 ? 'First Semester' : 'Second Semester'}</h3>
        ${courses.map(c => `<div class="course-card-item"><div><div style="font-weight:700;font-size:14px">${UI.esc(c.code)} - ${UI.esc(c.name)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">📊 ${c.sessionCount} session(s) · Last: ${c.lastSessionDate}</div></div><div><button class="btn btn-ug btn-sm" onclick="LEC.startSessionForCourse('${c.code}', ${S.currentViewYear}, ${S.currentViewSemester})">▶ Start Session</button></div></div>`).join('')}
      </div>`;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // SHOW ADD COURSE
  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'block';
  }

  // HIDE ADD COURSE
  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
    const codeInput = document.getElementById('new-course-code');
    const nameInput = document.getElementById('new-course-name');
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
  }

  // ADD NEW COURSE
  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    
    if (!code || !name) {
      await MODAL.alert('Missing Info', 'Please enter both course code and name.');
      return;
    }
    
    if (!S.currentViewYear || !S.currentViewSemester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester first.');
      return;
    }
    
    try {
      const courseKey = `${code}_${S.currentViewYear}_${S.currentViewSemester}`;
      const existing = await DB.COURSE.get(courseKey);
      
      if (existing) {
        await MODAL.alert('Course Exists', `Course ${code} already exists for ${S.currentViewYear} Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      await DB.COURSE.set(courseKey, {
        code: code,
        name: name,
        year: S.currentViewYear,
        semester: S.currentViewSemester,
        active: true,
        createdAt: Date.now(),
        createdBy: AUTH.getSession()?.id
      });
      
      await MODAL.success('Course Created', `${code} has been added for ${S.currentViewYear} Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.`);
      hideAddCourse();
      await viewCourses();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // START SESSION FOR COURSE
  async function startSessionForCourse(courseCode, year, semester) {
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    
    await onYearSemesterChange();
    
    // Switch to session tab
    tab('session');
  }

  // RESET FORM - Fixed
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
    
    // Default to mycourses tab
    tab('mycourses');
  }

  // ON YEAR/SEMESTER CHANGE
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
        const sessionDate = new Date(session.date);
        let sessionYear = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
        if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
        
        if (sessionYear === year && sessionSemester === semester) {
          if (!uniqueCourses.has(session.courseCode)) {
            uniqueCourses.set(session.courseCode, { code: session.courseCode, name: session.courseName });
          }
        }
      }
      
      const select = document.getElementById('existing-course-select-dropdown');
      if (select) {
        const options = Array.from(uniqueCourses.values());
        select.innerHTML = options.length ? `<option value="">-- Select existing course --</option>${options.map(c => `<option value="${UI.esc(c.code)}" data-name="${UI.esc(c.name)}">${UI.esc(c.code)} - ${UI.esc(c.name)}</option>`).join('')}` : `<option value="">-- No existing courses for this period --</option>`;
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

  // GET LOCATION
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

  // START SESSION
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
      if (lCode) lCode.classList.add('err');
      if (lCourse) lCourse.classList.add('err');
      await MODAL.alert('Missing Info', 'Please enter course code and name.');
      return;
    }
    if (lCode) lCode.classList.remove('err');
    if (lCourse) lCourse.classList.remove('err');
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    const courseKey = `${code}_${yearInt}_${semInt}`;
    
    const existingCourse = await DB.COURSE.get(courseKey);
    if (!existingCourse) {
      await DB.COURSE.set(courseKey, {
        code: code,
        name: course,
        year: yearInt,
        semester: semInt,
        active: true,
        createdAt: Date.now(),
        createdBy: AUTH.getSession()?.id
      });
    }
    
    if (S.locOn && !S.locAcquired) { 
      await MODAL.alert('Location required', 'Get your classroom location first.'); 
      return; 
    }
    
    const genBtn = document.getElementById('gen-btn');
    UI.btnLoad('gen-btn', true);
    try { 
      const user = AUTH.getSession(); 
      const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''); 
      const existing = await DB.SESSION.byLec(myId); 
      if (existing.find(s => s.courseCode === code && s.active)) { 
        UI.btnLoad('gen-btn', false, 'Generate QR code'); 
        await MODAL.error('Session conflict', `A session for ${code} is already active.`); 
        return; 
      } 
      const token = UI.makeToken(20), sessId = token.slice(0, 12); 
      S.session = { 
        id: sessId, token, courseCode: code, courseName: course, 
        lecturer: lecName, lecId: user?.lecId || '', lecFbId: myId, department: user?.department || '', 
        date: UI.todayStr(), expiresAt: Date.now() + mins * 60000, durationMins: mins, 
        lat: S.locOn ? S.lecLat : null, lng: S.locOn ? S.lecLng : null, 
        radius: S.locOn ? +(document.getElementById('l-radius')?.value || 100) : null, 
        locEnabled: S.locOn, active: true, createdAt: Date.now(), 
        year: yearInt, semester: semInt
      }; 
      await DB.SESSION.set(sessId, S.session); 
      _buildPanel(lecName, mins); 
    } catch (err) { 
      UI.btnLoad('gen-btn', false, 'Generate QR code'); 
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
    const lfcTitle = document.getElementById('l-lfc-title');
    const lfcDetail = document.getElementById('l-lfc-detail');
    if (lc) {
      if (s.locEnabled && s.lat) {
        lc.className = 'strip strip-teal';
        if (lfcTitle) lfcTitle.textContent = `Location fence — within ${s.radius}m`;
        if (lfcDetail) lfcDetail.textContent = `Anchor: ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
      } else {
        lc.className = 'strip strip-gray';
        if (lfcTitle) lfcTitle.textContent = 'Location check disabled';
        if (lfcDetail) lfcDetail.textContent = '';
      }
    }
    
    const qrBox = document.getElementById('qr-box');
    if (qrBox) {
      qrBox.innerHTML = '';
      qrBox.style.opacity = '1';
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
    
    UI.btnLoad('gen-btn', false, 'Generate QR code');
    
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.tickTimer) clearInterval(S.tickTimer);
    
    S.unsubRec = DB.SESSION.listenRecords(s.id, recs => { _renderAtt(recs); });
    S.unsubBlk = DB.SESSION.listenBlocked(s.id, _renderBlk);
    _tick(); 
    S.tickTimer = setInterval(_tick, 1000);
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
      return; 
    } 
    const m = Math.floor(rem / 60000), ss = Math.floor((rem % 60000) / 1000); 
    el.textContent = `${m}:${UI.pad(ss)}`; 
    el.className = 'countdown ' + (rem < 180000 ? 'warn' : 'ok'); 
  }

  function _renderAtt(records) { 
    if (!Array.isArray(records)) records = []; 
    const attCount = document.getElementById('l-att-count');
    const attList = document.getElementById('l-att-list');
    if (attCount) attCount.textContent = records.length;
    if (attList) {
      attList.innerHTML = records.length ? records.map((r, i) => `<div class="att-item">
        <div class="att-dot"></div>
        <span style="font-size:11px;min-width:22px">${i + 1}.</span>
        <span class="att-name">${UI.esc(r.name)}</span>
        <span class="att-sid">${UI.esc(r.studentId)}</span>
        <span class="att-time">${UI.esc(r.time)}</span>
      </div>`).join('') : '<div class="att-empty">Waiting for students…</div>';
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
      blkList.innerHTML = blocked.map(b => `<div class="blk-item">
        <span><strong>${UI.esc(b.name)}</strong> (${UI.esc(b.studentId)}) — ${UI.esc(b.reason)}</span>
        <span style="white-space:nowrap">${UI.esc(b.time)}</span>
      </div>`).join('');
    }
  }

  async function endSession() { 
    const ok = await MODAL.confirm('End session?', 'All records will be saved and backed up.', 
      { icon: '🛑', confirmLabel: 'End session', confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    if (S.tickTimer) clearInterval(S.tickTimer);
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
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

  // PLACEHOLDERS for other tabs (to prevent errors)
  async function _loadRecords() {
    const el = document.getElementById('records-list');
    if (el) el.innerHTML = '<div class="no-rec">Records feature coming soon...</div>';
  }

  async function _loadReports() {
    const el = document.getElementById('reports-list');
    if (el) el.innerHTML = '<div class="no-rec">Reports feature coming soon...</div>';
  }

  async function _loadCourses() {
    const activeEl = document.getElementById('active-courses-list');
    const historyEl = document.getElementById('course-history-list');
    if (activeEl) activeEl.innerHTML = '<div class="no-rec">Course management coming soon...</div>';
    if (historyEl) historyEl.innerHTML = '';
  }

  async function _loadTAs() {
    const el = document.getElementById('ta-list');
    if (el) el.innerHTML = '<div class="no-rec">TA management coming soon...</div>';
  }

  async function inviteTA() {
    await MODAL.alert('Coming Soon', 'TA invitation feature will be available soon.');
  }

  async function removeTA(taId, taName) {
    await MODAL.alert('Coming Soon', 'TA removal feature will be available soon.');
  }

  // Export all public methods
  return {
    tab,
    resetForm,
    getLoc,
    toggleFence,
    startSession,
    endSession,
    downloadQR,
    exportLiveCSV,
    viewCourses,
    showAddCourse,
    hideAddCourse,
    addNewCourse,
    startSessionForCourse,
    onYearSemesterChange,
    selectExistingCourse,
    toggleNewCourseFields,
    inviteTA,
    removeTA
  };
})();
