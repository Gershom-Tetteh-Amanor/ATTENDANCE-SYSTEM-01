/* session.js — Lecturer & TA Dashboard with Full Functionality */
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
    currentFilterYearStart: 2024,
    currentFilterYearEnd: 2026,
    currentFilterSemester: null
  };

  // Helper to get composite course key
  function _getCourseKey(code, year, semester) {
    return `${DB.normalizeCourseCode(code)}_${year}_${semester}`;
  }

  function tab(name) {
    document.querySelectorAll('#view-lecturer .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => p.classList.toggle('active', p.id === `lec-pg-${name}`));
    if (name === 'records') _loadRecords();
    if (name === 'reports') _loadReports();
    if (name === 'tas') _loadTAs();
    if (name === 'courses') _loadCourses();
    if (name === 'session') _loadMyCourses();
  }

  function resetForm() {
    const setup = document.getElementById('lec-setup');
    const active = document.getElementById('lec-active');
    const qrBox = document.getElementById('qr-box');
    const blkWrap = document.getElementById('l-blk-wrap');
    
    if (setup) setup.style.display = 'block';
    if (active) active.style.display = 'none';
    if (qrBox) qrBox.innerHTML = '';
    if (blkWrap) blkWrap.style.display = 'none';
    
    S.locOn = true; S.locAcquired = false; S.lecLat = S.lecLng = null;
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
    
    // Reset course selection UI
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    const existingCourseDiv = document.getElementById('existing-course-select');
    const newCourseDiv = document.getElementById('new-course-fields');
    const existingCourseSelect = document.getElementById('existing-course-select-dropdown');
    const useExistingRadio = document.querySelector('input[name="course-type"][value="existing"]');
    const useNewRadio = document.getElementById('use-new-course');
    
    if (yearSelect) yearSelect.value = '';
    if (semesterSelect) semesterSelect.value = '';
    if (existingCourseDiv) existingCourseDiv.style.display = 'none';
    if (newCourseDiv) newCourseDiv.style.display = 'none';
    if (existingCourseSelect) existingCourseSelect.innerHTML = '<option value="">-- First select year and semester --</option>';
    if (useExistingRadio) useExistingRadio.checked = true;
    if (useNewRadio) useNewRadio.checked = false;
    
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    
    tab('session');
  }

  // ==================== VIEW MY COURSES ====================
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    container.innerHTML = '<div class="att-empty">Loading your courses...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      
      const coursesMap = new Map();
      for (const session of allSessions) {
        const courseCode = session.courseCode;
        const courseName = session.courseName;
        const sessionDate = new Date(session.date);
        let year = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let semester = (month >= 1 && month <= 6) ? 2 : 1;
        if (semester === 2 && month <= 6) year = year - 1;
        
        const key = _getCourseKey(courseCode, year, semester);
        const courseRecord = await DB.COURSE.get(key);
        const isArchived = courseRecord ? !courseRecord.active : false;
        
        if (!coursesMap.has(key)) {
          coursesMap.set(key, {
            code: courseCode,
            name: courseName,
            year: year,
            semester: semester,
            lastSessionDate: session.date,
            sessionCount: 1,
            isArchived: isArchived,
            archivedAt: courseRecord?.endedAt || null
          });
        } else {
          const existing = coursesMap.get(key);
          existing.sessionCount++;
          coursesMap.set(key, existing);
        }
      }
      
      let courses = Array.from(coursesMap.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        if (a.semester !== b.semester) return b.semester - a.semester;
        return a.code.localeCompare(b.code);
      });
      
      if (courses.length === 0) {
        container.innerHTML = '<div class="no-rec">No courses found. Start a session to create your first course.</div>';
        return;
      }
      
      const groupedByYear = {};
      for (const course of courses) {
        if (!groupedByYear[course.year]) groupedByYear[course.year] = [];
        groupedByYear[course.year].push(course);
      }
      
      const years = Object.keys(groupedByYear).sort((a,b) => b - a);
      let html = `<div class="filter-bar" style="margin-bottom:16px">
        <div style="flex:1"><label class="fl">Year Range (Start)</label>
          <select id="mycourses-year-start" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterMyCourses()">
            ${years.map(y => `<option value="${y}" ${S.currentFilterYearStart == y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1"><label class="fl">Year Range (End)</label>
          <select id="mycourses-year-end" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterMyCourses()">
            ${years.map(y => `<option value="${y}" ${S.currentFilterYearEnd == y ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div style="flex:1"><label class="fl">Semester</label>
          <select id="mycourses-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterMyCourses()">
            <option value="all" ${S.currentFilterSemester === null ? 'selected' : ''}>All Semesters</option>
            <option value="1" ${S.currentFilterSemester === 1 ? 'selected' : ''}>First Semester</option>
            <option value="2" ${S.currentFilterSemester === 2 ? 'selected' : ''}>Second Semester</option>
          </select>
        </div>
        <div><button class="btn btn-secondary btn-sm" onclick="LEC.filterMyCourses()" style="margin-top:18px">Apply Filter</button></div>
      </div><div class="courses-overview">`;
      
      for (const year of years) {
        let yearCourses = groupedByYear[year];
        if (S.currentFilterYearStart && S.currentFilterYearEnd) {
          if (year < S.currentFilterYearStart || year > S.currentFilterYearEnd) continue;
        }
        if (S.currentFilterSemester) {
          yearCourses = yearCourses.filter(c => c.semester === S.currentFilterSemester);
        }
        if (yearCourses.length === 0) continue;
        
        html += `<div class="year-group" style="margin-bottom:24px">
          <h3 style="font-size:16px;margin-bottom:12px;color:var(--ug);border-left:3px solid var(--ug);padding-left:10px">Academic Year ${year}</h3>
          <div class="semester-group">`;
        
        const sem1Courses = yearCourses.filter(c => c.semester === 1);
        if (sem1Courses.length > 0) {
          html += `<div style="margin-bottom:16px"><h4 style="font-size:13px;margin-bottom:8px;color:var(--teal)">📚 First Semester</h4>${sem1Courses.map(c => _renderCourseCard(c)).join('')}</div>`;
        }
        const sem2Courses = yearCourses.filter(c => c.semester === 2);
        if (sem2Courses.length > 0) {
          html += `<div style="margin-bottom:16px"><h4 style="font-size:13px;margin-bottom:8px;color:var(--amber)">📚 Second Semester</h4>${sem2Courses.map(c => _renderCourseCard(c)).join('')}</div>`;
        }
        html += `</div></div>`;
      }
      html += `</div>`;
      container.innerHTML = html;
    } catch(err) {
      console.error(err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }
  
  function _renderCourseCard(course) {
    const statusBadge = course.isArchived ? 
      '<span class="pill pill-gray">🔴 Archived</span>' : 
      '<span class="pill pill-teal">🟢 Active</span>';
    const actionButton = course.isArchived ?
      `<button class="btn btn-teal btn-sm" onclick="LEC.reactivateCourseForSession('${course.code}', ${course.year}, ${course.semester})">🔄 Reactivate</button>` :
      `<button class="btn btn-ug btn-sm" onclick="LEC.startSessionForCourse('${course.code}', ${course.year}, ${course.semester})">▶ Start Session</button>`;
    return `<div class="course-card-item"><div><div style="font-weight:700;font-size:14px">${UI.esc(course.code)} - ${UI.esc(course.name)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">📅 Last session: ${course.lastSessionDate} | 📊 ${course.sessionCount} session(s)</div></div><div style="display:flex;gap:8px;align-items:center">${statusBadge}${actionButton}</div></div>`;
  }
  
  async function filterMyCourses() {
    const yearStart = document.getElementById('mycourses-year-start')?.value;
    const yearEnd = document.getElementById('mycourses-year-end')?.value;
    const semester = document.getElementById('mycourses-semester')?.value;
    if (yearStart) S.currentFilterYearStart = parseInt(yearStart);
    if (yearEnd) S.currentFilterYearEnd = parseInt(yearEnd);
    S.currentFilterSemester = semester === 'all' ? null : parseInt(semester);
    await _loadMyCourses();
  }
  
  // ==================== START SESSION FROM COURSE CARD (FULL AUTO-FILL) ====================
  async function startSessionForCourse(courseCode, year, semester) {
    // Set year and semester selects
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    
    // Trigger change to load existing courses for this period
    await onYearSemesterChange();
    
    // Switch to "Use Existing Course" radio
    const useExistingRadio = document.querySelector('input[name="course-type"][value="existing"]');
    if (useExistingRadio && !useExistingRadio.checked) {
      useExistingRadio.checked = true;
      toggleNewCourseFields(); // ensure the correct UI is shown
    }
    
    // Wait a moment for dropdown to populate
    await new Promise(r => setTimeout(r, 100));
    
    // Select the course in the dropdown
    const existingCourseSelect = document.getElementById('existing-course-select-dropdown');
    if (existingCourseSelect) {
      for (let i = 0; i < existingCourseSelect.options.length; i++) {
        if (existingCourseSelect.options[i].value === courseCode) {
          existingCourseSelect.selectedIndex = i;
          selectExistingCourse(); // this fills the code and name inputs
          break;
        }
      }
    }
    
    // Scroll to the form
    document.getElementById('lec-setup')?.scrollIntoView({ behavior: 'smooth' });
  }
  
  async function reactivateCourseForSession(courseCode, year, semester) {
    const confirm = await MODAL.confirm('Reactivate Course', `Reactivate <strong>${UI.esc(courseCode)}</strong> for Year ${year} - Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Reactivate', confirmCls: 'btn-teal' });
    if (!confirm) return;
    try {
      const key = _getCourseKey(courseCode, year, semester);
      await DB.COURSE.update(key, { active: true, reactivatedAt: Date.now(), reactivatedBy: AUTH.getSession()?.id });
      await MODAL.success('Course Reactivated', `${courseCode} is now active for ${year} Semester ${semester}.`);
      await _loadMyCourses();
      await _loadCourses();
    } catch(err) { await MODAL.error('Error', err.message); }
  }
  
  // ==================== START SESSION UI HELPERS ====================
  async function onYearSemesterChange() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    if (year && semester) {
      await _loadExistingCoursesForPeriod(parseInt(year), parseInt(semester));
      document.getElementById('existing-course-select').style.display = 'block';
    } else {
      document.getElementById('existing-course-select').style.display = 'none';
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
            const key = _getCourseKey(session.courseCode, year, semester);
            const courseRecord = await DB.COURSE.get(key);
            if (courseRecord && courseRecord.active !== false) {
              uniqueCourses.set(session.courseCode, { code: session.courseCode, name: session.courseName });
            }
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
  
  async function startSession() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const useNew = document.getElementById('use-new-course')?.checked;
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
    const courseKey = _getCourseKey(code, yearInt, semInt);
    
    // Create or update course record for this specific period
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
    } else if (!existingCourse.active) {
      await DB.COURSE.update(courseKey, { 
        active: true, 
        reactivatedAt: Date.now(),
        reactivatedBy: AUTH.getSession()?.id
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
    _setText('l-si-lecid', s.lecId || '—');
    _setText('l-si-id', s.id);
    _setText('l-si-dur', UI.fmtDur(mins));
    _setText('l-si-period', `${s.year} - Semester ${s.semester === 1 ? 'First' : 'Second'}`);
    
    const secPills = document.getElementById('sec-pills');
    if (secPills) {
      secPills.innerHTML = [
        { l: 'Device fingerprint', on: true }, 
        { l: 'Biometric verification', on: true }, 
        { l: 'Unique Student ID', on: true }, 
        { l: 'Location fence', on: s.locEnabled }, 
        { l: 'Time-limited QR', on: true }
      ].map(p => `<span class="spill ${p.on ? 'on' : 'off'}">${p.on ? '✓' : '–'} ${p.l}</span>`).join('');
    }
    
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
    
    const liveCsvBtn = document.getElementById('live-csv-btn');
    if (liveCsvBtn) liveCsvBtn.style.display = 'none';
    
    UI.btnLoad('gen-btn', false, 'Generate QR code');
    
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.tickTimer) clearInterval(S.tickTimer);
    
    S.unsubRec = DB.SESSION.listenRecords(s.id, recs => { 
      _renderAtt(recs); 
      const liveBtn = document.getElementById('live-csv-btn');
      if (liveBtn && recs.length > 0) liveBtn.style.display = 'inline-block'; 
    });
    S.unsubBlk = DB.SESSION.listenBlocked(s.id, _renderBlk);
    _tick(); 
    S.tickTimer = setInterval(_tick, 1000);
  }
  
  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
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
      if (S.tickTimer) clearInterval(S.tickTimer); 
      S.tickTimer = null; 
      _markEnded('timeout', 'Session duration expired');
      const lecSetup = document.getElementById('lec-setup');
      const lecActive = document.getElementById('lec-active');
      if (lecSetup) lecSetup.style.display = 'block';
      if (lecActive) lecActive.style.display = 'none';
      return; 
    } 
    const h = Math.floor(rem / 3600000), m = Math.floor((rem % 3600000) / 60000), ss = Math.floor((rem % 60000) / 1000); 
    el.textContent = h > 0 ? `${h}h ${UI.pad(m)}m ${UI.pad(ss)}s` : `${m}:${UI.pad(ss)}`; 
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
        <span class="pill pill-gray">🔏 ${UI.esc((r.biometricId || '').slice(0, 8))}</span>
        ${r.locNote ? `<span class="pill pill-teal">📍 ${UI.esc(r.locNote)}</span>` : ''}
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
  
  async function _markEnded(endedBy = 'manual', reason = '') { 
    if (!S.session) return; 
    try { 
      await DB.SESSION.update(S.session.id, { active: false, endedAt: Date.now(), endedBy: endedBy, endedReason: reason }); 
      const recs = await DB.SESSION.getRecords(S.session.id), blks = await DB.SESSION.getBlocked(S.session.id); 
      await DB.BACKUP.save(S.session.lecId || S.session.lecFbId, S.session.id, { 
        session: { ...S.session, active: false }, 
        records: recs, 
        blocked: blks, 
        savedAt: new Date().toISOString() 
      }); 
    } catch (e) { console.warn(e); } 
    S.session = null; 
  }
  
  async function endSession() { 
    const ok = await MODAL.confirm('End session?', 'All records will be saved and backed up.', 
      { icon: '🛑', confirmLabel: 'End session', confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    if (S.tickTimer) clearInterval(S.tickTimer);
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    await _markEnded('manual', 'Manually ended'); 
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
    const rows = [['#', 'Name', 'Student ID', 'Biometric ID', 'Location', 'Time', 'Course', 'Lecturer', 'Date']]; 
    recs.forEach((r, i) => rows.push([i + 1, r.name, r.studentId, (r.biometricId || '').slice(0, 16), r.locNote || '', r.time, S.session.courseCode, S.session.lecturer, S.session.date])); 
    UI.dlCSV(rows, `ATT_${S.session.courseCode}_LIVE`); 
  }
  
  // ==================== MY RECORDS TAB ====================
  async function _loadRecords() {
    const el = document.getElementById('records-list');
    if (!el) return;
    el.innerHTML = '<div class="att-empty">Loading records...</div>';
    try {
      const user = AUTH.getSession();
      const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || '');
      let sessions = (await DB.SESSION.byLec(myId)).filter(s => !s.deletedByLec).sort((a, b) => b.createdAt - a.createdAt);
      const grouped = {};
      for (const session of sessions) {
        const sessionDate = new Date(session.date);
        let year = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let semester = (month >= 1 && month <= 6) ? 2 : 1;
        if (semester === 2 && month <= 6) year = year - 1;
        const key = `${year}_${semester}`;
        if (!grouped[key]) grouped[key] = { year, semester, sessions: [] };
        grouped[key].sessions.push(session);
      }
      if (Object.keys(grouped).length === 0) {
        el.innerHTML = '<div class="no-rec">No sessions found.</div>';
        return;
      }
      let html = '';
      for (const key of Object.keys(grouped).sort((a,b) => {
        const [yearA, semA] = a.split('_');
        const [yearB, semB] = b.split('_');
        if (yearA !== yearB) return yearB - yearA;
        return semB - semA;
      })) {
        const group = grouped[key];
        html += `<div style="margin-bottom:24px"><h3 style="font-size:16px;margin-bottom:12px;color:var(--ug);border-left:3px solid var(--ug);padding-left:10px">Academic Year ${group.year} - ${group.semester === 1 ? 'First Semester' : 'Second Semester'}</h3>${group.sessions.map(s => _renderRecordCard(s)).join('')}</div>`;
      }
      el.innerHTML = html;
    } catch(err) {
      console.error(err);
      el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }
  
  function _renderRecordCard(session) {
    const recs = session.records ? Object.values(session.records) : [];
    const isActive = session.active === true;
    const statusBadge = isActive ? `<span class="pill pill-teal" style="background:var(--teal);color:white">🟢 ACTIVE</span>` : `<span class="pill pill-gray">🔴 ENDED</span>`;
    const endButton = isActive ? `<button class="btn btn-warning btn-sm" onclick="LEC.endSessionFromRecord('${session.id}')" style="background:var(--amber)">⏹️ End Session</button>` : '';
    return `<div class="sess-card" style="border-left:4px solid ${isActive ? 'var(--teal)' : 'var(--text4)'}">
      <div class="sc-hdr"><div><div class="sc-title">${UI.esc(session.courseCode)} — ${UI.esc(session.courseName)} ${statusBadge}</div><div class="sc-meta">📅 ${UI.esc(session.date)} · 👥 ${recs.length} present · ⏱️ Duration: ${UI.fmtDur(session.durationMins || 60)}</div>${isActive ? `<div class="sc-meta" style="color:var(--teal);font-size:11px">⏰ Expires: ${new Date(session.expiresAt).toLocaleTimeString()}</div>` : ''}</div><div class="sc-actions">${endButton}<button class="btn btn-secondary btn-sm" onclick="LEC.exportSessCSV('${session.id}')">⬇ CSV</button>${!isActive ? `<button class="btn btn-danger btn-sm" onclick="LEC.deleteSess('${session.id}')">🗑️ Del</button>` : ''}</div></div>
      ${recs.length ? `<div style="margin-top:10px">${recs.slice(0, 3).map((r, i) => `<div class="rec-row"><span style="font-size:11px;min-width:22px">${i+1}.</span><span class="rec-name">${UI.esc(r.name)}</span><span class="rec-sid">${UI.esc(r.studentId)}</span><span class="rec-time">${UI.esc(r.time)}</span></div>`).join('')}${recs.length > 3 ? `<div style="font-size:11px;padding:4px 0">…${recs.length-3} more</div>` : ''}</div>` : '<div class="no-rec" style="margin-top:8px">No check-ins yet</div>'}
    </div>`;
  }
  
  async function endSessionFromRecord(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) { await MODAL.error('Not found', 'Session not found.'); return; }
    if (!session.active) { await MODAL.alert('Already ended', 'Session already ended.'); _loadRecords(); return; }
    const confirm = await MODAL.confirm('End this session?', `<strong>${UI.esc(session.courseCode)} — ${UI.esc(session.courseName)}</strong><br/>Date: ${session.date}<br/>Check-ins: ${session.records ? Object.keys(session.records).length : 0}`, { icon: '🛑', confirmLabel: 'End Session', confirmCls: 'btn-warning' });
    if (!confirm) return;
    try {
      const recs = await DB.SESSION.getRecords(sessionId), blks = await DB.SESSION.getBlocked(sessionId);
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), manuallyEnded: true, endedBy: 'manual_from_records' });
      await DB.BACKUP.save(session.lecFbId || session.lecId, sessionId, { session: { ...session, active: false }, records: recs, blocked: blks, savedAt: new Date().toISOString() });
      if (S.session && S.session.id === sessionId) {
        if (S.tickTimer) clearInterval(S.tickTimer);
        if (S.unsubRec) S.unsubRec();
        if (S.unsubBlk) S.unsubBlk();
        S.session = null;
        resetForm();
      }
      await MODAL.success('Session Ended', `Session for ${session.courseCode} ended. ${recs.length} check-in${recs.length !== 1 ? 's were' : ' was'} saved.`);
      _loadRecords();
    } catch(err) { await MODAL.error('Error', err.message); }
  }
  
  async function deleteSess(id) {
    const session = await DB.SESSION.get(id);
    if (session && session.active) {
      const endFirst = await MODAL.confirm('Cannot delete active session', 'End it first?', { confirmLabel: 'Yes, end it', cancelLabel: 'Cancel', confirmCls: 'btn-warning' });
      if (endFirst) await endSessionFromRecord(id);
      return;
    }
    const ok = await MODAL.confirm('Delete session?', 'Admin backup preserved.', { confirmCls: 'btn-danger' });
    if (!ok) return;
    try { await DB.SESSION.update(id, { deletedByLec: true }); _loadRecords(); } 
    catch(err) { MODAL.error('Error', err.message); }
  }
  
  async function exportSessCSV(id) {
    const s = await DB.SESSION.get(id);
    if (!s) return;
    const recs = await DB.SESSION.getRecords(id);
    if (!recs.length) { MODAL.alert('No records', 'No check-ins to export.'); return; }
    const rows = [['#', 'Name', 'Student ID', 'Biometric ID', 'Location', 'Time', 'Course', 'Lecturer', 'Date']];
    recs.forEach((r, i) => rows.push([i+1, r.name, r.studentId, (r.biometricId||'').slice(0,16), r.locNote||'', r.time, s.courseCode, s.lecturer, s.date]));
    UI.dlCSV(rows, `ATT_${s.courseCode}_${s.date}`);
  }
  
  // ==================== REPORTS TAB WITH FREQUENCY SHEET ====================
  async function _loadReports() {
    const el = document.getElementById('reports-list');
    if (!el) return;
    el.innerHTML = '<div class="att-empty">Loading reports...</div>';
    try {
      const user = AUTH.getSession();
      const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || '');
      let sessions = (await DB.SESSION.byLec(myId)).filter(s => !s.deletedByLec);
      const courseGroups = {};
      for (const session of sessions) {
        const sessionDate = new Date(session.date);
        let year = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let semester = (month >= 1 && month <= 6) ? 2 : 1;
        if (semester === 2 && month <= 6) year = year - 1;
        const key = `${session.courseCode}_${year}_${semester}`;
        if (!courseGroups[key]) {
          courseGroups[key] = { code: session.courseCode, name: session.courseName, year: year, semester: semester, sessions: [] };
        }
        courseGroups[key].sessions.push(session);
      }
      if (Object.keys(courseGroups).length === 0) {
        el.innerHTML = '<div class="no-rec">No reports available.</div>';
        return;
      }
      let html = `<div class="filter-bar" style="margin-bottom:16px"><div style="flex:1"><label class="fl">Academic Year</label><select id="reports-year" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterReports()"><option value="all">All Years</option>${[...new Set(Object.values(courseGroups).map(g => g.year))].sort((a,b)=>b-a).map(y => `<option value="${y}">${y}</option>`).join('')}</select></div><div style="flex:1"><label class="fl">Semester</label><select id="reports-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterReports()"><option value="all">All Semesters</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div><div><button class="btn btn-secondary btn-sm" onclick="LEC.filterReports()" style="margin-top:18px">Apply Filter</button></div></div><div id="reports-content">${_renderReportCards(Object.values(courseGroups))}</div>`;
      el.innerHTML = html;
    } catch(err) {
      console.error(err);
      el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }
  
  function _renderReportCards(courseGroups) {
    const yearFilter = document.getElementById('reports-year')?.value;
    const semesterFilter = document.getElementById('reports-semester')?.value;
    let filtered = courseGroups;
    if (yearFilter && yearFilter !== 'all') filtered = filtered.filter(g => g.year == yearFilter);
    if (semesterFilter && semesterFilter !== 'all') filtered = filtered.filter(g => g.semester == semesterFilter);
    filtered.sort((a,b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.semester !== b.semester) return b.semester - a.semester;
      return a.code.localeCompare(b.code);
    });
    if (filtered.length === 0) return '<div class="no-rec">No courses match the filters.</div>';
    return filtered.map(g => {
      const totalSessions = g.sessions.length;
      let totalCheckins = 0;
      for (const s of g.sessions) totalCheckins += s.records ? Object.keys(s.records).length : 0;
      return `<div class="sess-card" style="margin-bottom:12px"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(g.code)} — ${UI.esc(g.name)}</div><div class="sc-meta">Year: ${g.year} | Semester: ${g.semester === 1 ? 'First' : 'Second'}</div><div class="sc-meta">📊 ${totalSessions} sessions · ${totalCheckins} total check-ins</div></div><div class="sc-actions"><button class="btn btn-ug btn-sm" onclick="LEC.exportCourseReport('${g.code}', ${g.year}, ${g.semester})">⬇ Excel (with frequency)</button><button class="btn btn-secondary btn-sm" onclick="LEC.exportCourseCSV('${g.code}', ${g.year}, ${g.semester})">⬇ CSV</button></div></div></div>`;
    }).join('');
  }
  
  async function filterReports() {
    const content = document.getElementById('reports-content');
    if (!content) return;
    const user = AUTH.getSession();
    const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || '');
    let sessions = (await DB.SESSION.byLec(myId)).filter(s => !s.deletedByLec);
    const courseGroups = {};
    for (const session of sessions) {
      const sessionDate = new Date(session.date);
      let year = sessionDate.getFullYear();
      const month = sessionDate.getMonth();
      let semester = (month >= 1 && month <= 6) ? 2 : 1;
      if (semester === 2 && month <= 6) year = year - 1;
      const key = `${session.courseCode}_${year}_${semester}`;
      if (!courseGroups[key]) courseGroups[key] = { code: session.courseCode, name: session.courseName, year: year, semester: semester, sessions: [] };
      courseGroups[key].sessions.push(session);
    }
    content.innerHTML = _renderReportCards(Object.values(courseGroups));
  }
  
  // Excel with two sheets: attendance list + frequency/percentage
  async function exportCourseReport(code, year, semester) {
    if (typeof XLSX === 'undefined') { MODAL.alert('Library not ready', 'SheetJS not loaded.'); return; }
    MODAL.loading('Preparing Excel workbook...');
    try {
      const user = AUTH.getSession();
      const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || '');
      let sessions = (await DB.SESSION.byLec(myId)).filter(s => s.courseCode === code && !s.deletedByLec);
      sessions = sessions.filter(s => {
        const sessionDate = new Date(s.date);
        let sessionYear = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
        if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
        return sessionYear === year && sessionSemester === semester;
      });
      if (!sessions.length) { MODAL.close(); MODAL.alert('No data', 'No sessions for this period.'); return; }
      
      const wb = XLSX.utils.book_new();
      
      // Sheet 1: Attendance List
      const attendanceRows = [['#', 'Date', 'Student Name', 'Student ID', 'Biometric ID', 'Location', 'Time']];
      let n = 1;
      for (const s of sessions) {
        const recs = s.records ? Object.values(s.records) : [];
        for (const r of recs) {
          attendanceRows.push([n++, s.date, r.name, r.studentId, (r.biometricId||'').slice(0,16), r.locNote||'', r.time]);
        }
      }
      const ws1 = XLSX.utils.aoa_to_sheet(attendanceRows);
      ws1['!cols'] = attendanceRows[0].map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(wb, ws1, 'Attendance List');
      
      // Sheet 2: Frequency & Percentage
      // Build frequency map: studentId -> { name, count }
      const freq = new Map();
      let totalSessions = 0;
      for (const s of sessions) {
        totalSessions++;
        const recs = s.records ? Object.values(s.records) : [];
        const presentSet = new Set();
        for (const r of recs) {
          presentSet.add(r.studentId);
          if (!freq.has(r.studentId)) {
            freq.set(r.studentId, { name: r.name, count: 0 });
          }
        }
        for (const sid of presentSet) {
          freq.get(sid).count++;
        }
      }
      const freqRows = [['Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance Percentage']];
      for (const [sid, data] of freq.entries()) {
        const pct = totalSessions > 0 ? ((data.count / totalSessions) * 100).toFixed(2) : '0.00';
        freqRows.push([sid, data.name, data.count, totalSessions, pct + '%']);
      }
      // Also include students with 0 attendance? optional: you could add all enrolled students, but for simplicity we show only those who attended at least once.
      const ws2 = XLSX.utils.aoa_to_sheet(freqRows);
      ws2['!cols'] = freqRows[0].map(() => ({ wch: 20 }));
      XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Frequency');
      
      XLSX.writeFile(wb, `UG_ATT_${code}_${year}_Sem${semester}.xlsx`);
      MODAL.close();
    } catch(err) { MODAL.close(); MODAL.error('Export failed', err.message); }
  }
  
  async function exportCourseCSV(code, year, semester) {
    const user = AUTH.getSession();
    const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || '');
    let sessions = (await DB.SESSION.byLec(myId)).filter(s => s.courseCode === code && !s.deletedByLec);
    sessions = sessions.filter(s => {
      const sessionDate = new Date(s.date);
      let sessionYear = sessionDate.getFullYear();
      const month = sessionDate.getMonth();
      let sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
      if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
      return sessionYear === year && sessionSemester === semester;
    });
    const rows = [['#', 'Date', 'Student Name', 'Student ID', 'Biometric ID', 'Location', 'Time']];
    let n = 1;
    for (const s of sessions) {
      const recs = s.records ? Object.values(s.records) : [];
      for (const r of recs) {
        rows.push([n++, s.date, r.name, r.studentId, (r.biometricId||'').slice(0,16), r.locNote||'', r.time]);
      }
    }
    UI.dlCSV(rows, `UG_ATT_${code}_${year}_Sem${semester}`);
  }
  
  // ==================== COURSE MANAGEMENT TAB ====================
  async function _loadCourses() {
    const activeEl = document.getElementById('active-courses-list');
    const historyEl = document.getElementById('course-history-list');
    if (!activeEl) return;
    activeEl.innerHTML = '<div class="att-empty">Loading courses...</div>';
    if (historyEl) historyEl.innerHTML = '<div class="att-empty">Loading...</div>';
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      for (const s of sessions) {
        const sessionDate = new Date(s.date);
        let year = sessionDate.getFullYear();
        const month = sessionDate.getMonth();
        let semester = (month >= 1 && month <= 6) ? 2 : 1;
        if (semester === 2 && month <= 6) year = year - 1;
        const key = _getCourseKey(s.courseCode, year, semester);
        if (!uniqueCourses.has(key)) {
          const cr = await DB.COURSE.get(key);
          uniqueCourses.set(key, {
            code: s.courseCode,
            name: s.courseName,
            year: year,
            semester: semester,
            active: cr ? cr.active : true,
            lastSessionDate: s.date
          });
        }
      }
      const courses = Array.from(uniqueCourses.values());
      const active = courses.filter(c => c.active === true);
      const inactive = courses.filter(c => c.active === false);
      activeEl.innerHTML = active.length ? active.map(c => `
        <div class="course-management-card">
          <div class="course-header"><div class="course-code">${UI.esc(c.code)}</div><div class="course-status active">🟢 Active</div></div>
          <div class="course-name">${UI.esc(c.name)}</div>
          <div class="course-meta">Year: ${c.year} | Semester: ${c.semester === 1 ? 'First' : 'Second'}</div>
          <button class="btn btn-warning btn-sm" onclick="LEC.endCourseForSemester('${c.code}', ${c.year}, ${c.semester})">⏹️ End Course</button>
        </div>
      `).join('') : '<div class="no-rec">No active courses.</div>';
      if (historyEl) {
        historyEl.innerHTML = inactive.length ? inactive.map(c => `
          <div class="course-management-card archived">
            <div class="course-header"><div class="course-code">${UI.esc(c.code)}</div><div class="course-status inactive">🔴 Archived</div></div>
            <div class="course-name">${UI.esc(c.name)}</div>
            <div class="course-meta">Year: ${c.year} | Semester: ${c.semester === 1 ? 'First' : 'Second'} | Last: ${c.lastSessionDate}</div>
            <button class="btn btn-teal btn-sm" onclick="LEC.reactivateCourse('${c.code}', ${c.year}, ${c.semester})">🔄 Reactivate</button>
          </div>
        `).join('') : '<div class="no-rec">No archived courses.</div>';
      }
    } catch(err) {
      console.error(err);
      activeEl.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }
  
  async function endCourseForSemester(courseCode, year, semester) {
    const ok = await MODAL.confirm('End Course', `End <strong>${UI.esc(courseCode)}</strong> for Year ${year} - Semester ${semester === 1 ? 'First' : 'Second'}?<br/>Students cannot check in until reactivated.`, { confirmLabel: 'Yes, End', confirmCls: 'btn-warning' });
    if (!ok) return;
    try {
      const key = _getCourseKey(courseCode, year, semester);
      await DB.COURSE.update(key, { active: false, endedAt: Date.now(), endedBy: AUTH.getSession()?.id });
      await MODAL.success('Course Ended', `${courseCode} ended for the semester.`);
      await _loadCourses();
      await _loadMyCourses();
    } catch(err) { await MODAL.error('Error', err.message); }
  }
  
  async function reactivateCourse(courseCode, year, semester) {
    const ok = await MODAL.confirm('Reactivate Course', `Reactivate <strong>${UI.esc(courseCode)}</strong> for Year ${year} - Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Reactivate', confirmCls: 'btn-teal' });
    if (!ok) return;
    try {
      const key = _getCourseKey(courseCode, year, semester);
      await DB.COURSE.update(key, { active: true, reactivatedAt: Date.now(), reactivatedBy: AUTH.getSession()?.id });
      await MODAL.success('Course Reactivated', `${courseCode} is now active.`);
      await _loadCourses();
      await _loadMyCourses();
    } catch(err) { await MODAL.error('Error', err.message); }
  }
  
  // ==================== TA MANAGEMENT ====================
  async function _loadTAs() {
    const el = document.getElementById('ta-list');
    if (!el) return;
    el.innerHTML = '<div class="att-empty">Loading TAs...</div>';
    try {
      const user = AUTH.getSession(), myId = user?.id || '';
      const all = await DB.TA.getAll();
      const mine = all.filter(ta => ta.lecturers?.includes(myId));
      const taCount = document.getElementById('ta-count');
      if (taCount) taCount.textContent = mine.length;
      if (!mine.length) { el.innerHTML = '<div class="no-rec">No Teaching Assistants added yet.</div>'; return; }
      el.innerHTML = mine.map(ta => `<div class="att-item"><div class="att-dot" style="background:var(--teal)"></div><span class="att-name">${UI.esc(ta.name || '(not registered)')}</span><span class="att-sid">${UI.esc(ta.email)}</span><span class="pill ${ta.status === 'active' ? 'pill-teal' : 'pill-gray'}">${ta.status === 'active' ? '✓ Active' : 'Pending'}</span><button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="LEC.removeTA('${ta.id}','${UI.esc(ta.name || ta.email)}')">Remove</button></div>`).join('');
    } catch(err) { el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }
  
  async function inviteTA() {
    const emailEl = document.getElementById('ta-email-input');
    const nameEl = document.getElementById('ta-name-input');
    const email = (emailEl?.value || '').trim().toLowerCase();
    const taName = nameEl?.value?.trim() || '';
    UI.clrAlert('ta-add-alert');
    if (!email) return UI.setAlert('ta-add-alert', 'Enter TA email.');
    if (!taName) return UI.setAlert('ta-add-alert', 'Enter TA name.');
    UI.btnLoad('ta-invite-btn', true);
    try {
      const user = AUTH.getSession(), myId = user?.id || '';
      const existing = await DB.TA.byEmail(email);
      if (existing) {
        const lecs = existing.lecturers || [];
        if (lecs.includes(myId)) {
          UI.btnLoad('ta-invite-btn', false);
          return UI.setAlert('ta-add-alert', 'TA already linked.');
        }
        await DB.TA.update(existing.id, { lecturers: [...lecs, myId] });
        if (emailEl) emailEl.value = '';
        if (nameEl) nameEl.value = '';
        UI.btnLoad('ta-invite-btn', false);
        await MODAL.success('Linked!', `${taName} added to your dashboard.`);
        _loadTAs();
        return;
      }
      const code = UI.makeCode(), invKey = UI.makeToken(), signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`;
      await DB.TA.setInvite(invKey, { code, toEmail: email, toName: taName, lecturerId: myId, lecturerName: user?.name, createdAt: Date.now(), expiresAt: Date.now() + 48 * 3600 * 1000, usedAt: null });
      if (emailEl) emailEl.value = '';
      if (nameEl) nameEl.value = '';
      UI.btnLoad('ta-invite-btn', false);
      await MODAL.alert('Invite Code Generated', `<div style="text-align:center"><div style="margin-bottom:16px">Share with <strong>${UI.esc(taName)}</strong> at <strong>${UI.esc(email)}</strong></div><div style="background:var(--ug);color:var(--gold);padding:20px;border-radius:12px;margin-bottom:16px"><div style="font-size:12px">Invite Code</div><div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:4px">${code}</div><div style="font-size:11px">Valid 48h</div></div><div style="display:flex;gap:10px;justify-content:center"><button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${code}')">📋 Copy Code</button><button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${signupLink}')">🔗 Copy Link</button></div></div>`, { icon: '🎓', btnLabel: 'Done' });
      _loadTAs();
    } catch(err) { UI.setAlert('ta-add-alert', err.message); }
    finally { UI.btnLoad('ta-invite-btn', false, 'Send invite'); }
  }
  
  async function removeTA(taId, taName) {
    const ok = await MODAL.confirm(`Remove ${taName}?`, 'They lose access to your dashboard.', { confirmCls: 'btn-danger' });
    if (!ok) return;
    try {
      const user = AUTH.getSession(), myId = user?.id || '', ta = await DB.TA.get(taId);
      if (!ta) return;
      await DB.TA.update(taId, { lecturers: (ta.lecturers || []).filter(id => id !== myId) });
      _loadTAs();
    } catch(err) { MODAL.error('Error', err.message); }
  }
  
  return {
    tab, resetForm, toggleFence, getLoc, startSession, endSession, endSessionFromRecord,
    downloadQR, exportLiveCSV, deleteSess, exportSessCSV,
    filterMyCourses, filterReports, filterRecords: _loadRecords,
    startSessionForCourse, reactivateCourseForSession,
    onYearSemesterChange, selectExistingCourse, toggleNewCourseFields,
    endCourseForSemester, reactivateCourse,
    inviteTA, removeTA, _loadMyCourses, _loadRecords, _loadReports, _loadCourses,
    exportCourseReport, exportCourseCSV
  };
})();
