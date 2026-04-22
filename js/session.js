/* session.js — Lecturer & TA dashboard with Course Management and Filtering */
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
    heartbeatInterval: null,
    currentFilterYear: null,
    currentFilterSemester: null
  };

  // Helper function to safely set text content
  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Helper function to safely set display
  function _setDisplay(id, display) {
    const el = document.getElementById(id);
    if (el) el.style.display = display;
  }

  // Get current academic period for default filter
  function _getCurrentFilterPeriod() {
    const period = DB.getCurrentAcademicPeriod();
    S.currentFilterYear = period.year;
    S.currentFilterSemester = period.semester;
    return { year: period.year, semester: period.semester };
  }

  // Filter sessions by year and semester
  function _filterSessionsByPeriod(sessions) {
    if (!S.currentFilterYear || !S.currentFilterSemester) return sessions;
    return sessions.filter(session => {
      // Extract year and semester from session date
      const sessionDate = new Date(session.date);
      let sessionYear = sessionDate.getFullYear();
      let sessionMonth = sessionDate.getMonth();
      let sessionSemester = (sessionMonth >= 1 && sessionMonth <= 6) ? 2 : 1;
      
      // Adjust year for semester 2 (Feb-July belongs to previous academic year)
      if (sessionSemester === 2 && sessionMonth <= 6) {
        sessionYear = sessionYear - 1;
      }
      
      return sessionYear === S.currentFilterYear && sessionSemester === S.currentFilterSemester;
    });
  }

  function tab(name) {
    document.querySelectorAll('#view-lecturer .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => p.classList.toggle('active', p.id === `lec-pg-${name}`));
    if (name === 'records') _loadRecords();
    if (name === 'reports') _loadReports();
    if (name === 'tas') _loadTAs();
    if (name === 'courses') _loadCourses();
  }

  function resetForm() {
    const setup = document.getElementById('lec-setup');
    const active = document.getElementById('lec-active');
    const qrBox = document.getElementById('qr-box');
    const blkWrap = document.getElementById('l-blk-wrap');
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const locTog = document.getElementById('loc-tog');
    const locLbl = document.getElementById('loc-lbl');
    const locResult = document.getElementById('loc-result');
    const getLocBtn = document.getElementById('get-loc-btn');
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    const courseType = document.getElementById('course-type');
    const existingSelect = document.getElementById('existing-course-select');
    const newFields = document.getElementById('new-course-fields');
    
    if (setup) setup.style.display = 'block';
    if (active) active.style.display = 'none';
    if (qrBox) qrBox.innerHTML = '';
    if (blkWrap) blkWrap.style.display = 'none';
    if (lCode) lCode.value = '';
    if (lCourse) lCourse.value = '';
    if (courseType) courseType.value = 'existing';
    if (existingSelect) existingSelect.style.display = 'block';
    if (newFields) newFields.style.display = 'none';
    
    S.locOn = true; S.locAcquired = false; S.lecLat = S.lecLng = null;
    if (locTog) locTog.classList.add('on');
    if (locLbl) locLbl.textContent = 'Location fence enabled';
    if (locResult) { locResult.className = ''; locResult.innerHTML = ''; }
    if (getLocBtn) { getLocBtn.disabled = false; getLocBtn.textContent = '📍 Get my current location'; }
    if (genBtn) genBtn.disabled = true;
    if (genHint) genHint.style.display = 'block';
    
    tab('session');
    _loadExistingCourses();
    _getCurrentFilterPeriod();
  }

  async function _loadExistingCourses() {
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = {};
      for (const session of sessions) {
        const code = session.courseCode;
        if (!uniqueCourses[code]) {
          uniqueCourses[code] = { code, name: session.courseName };
        }
      }
      const select = document.getElementById('existing-course-select-dropdown');
      if (select) {
        const options = Object.values(uniqueCourses);
        if (options.length) {
          select.innerHTML = `<option value="">-- Select existing course --</option>` + options.map(c => `<option value="${UI.esc(c.code)}" data-name="${UI.esc(c.name)}">${UI.esc(c.code)} - ${UI.esc(c.name)}</option>`).join('');
        } else {
          select.innerHTML = `<option value="">-- No existing courses --</option>`;
        }
      }
    } catch(e) { console.warn(e); }
  }

  function toggleCourseType() {
    const type = document.getElementById('course-type')?.value;
    const existingSelect = document.getElementById('existing-course-select');
    const newFields = document.getElementById('new-course-fields');
    if (type === 'existing') {
      if (existingSelect) existingSelect.style.display = 'block';
      if (newFields) newFields.style.display = 'none';
    } else {
      if (existingSelect) existingSelect.style.display = 'none';
      if (newFields) newFields.style.display = 'block';
    }
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
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const lLecname = document.getElementById('l-lecname');
    const lDur = document.getElementById('l-dur');
    const courseType = document.getElementById('course-type');
    
    const code = lCode?.value.trim().toUpperCase() || '';
    const course = lCourse?.value.trim() || '';
    const lecName = lLecname?.value.trim() || '';
    const mins = lDur ? +(lDur.value) : 60;
    const type = courseType?.value || 'existing';
    
    if (!code || !course) {
      if (lCode) lCode.classList.add('err');
      if (lCourse) lCourse.classList.add('err');
      return;
    }
    if (lCode) lCode.classList.remove('err');
    if (lCourse) lCourse.classList.remove('err');
    
    if (type === 'new') {
      const year = document.getElementById('new-course-year')?.value;
      const semester = document.getElementById('new-course-semester')?.value;
      if (!year || !semester) {
        await MODAL.alert('Missing Info', 'Please select Year and Semester for the new course.');
        return;
      }
      const existingCourse = await DB.COURSE.get(code);
      if (!existingCourse) {
        await DB.COURSE.set(code, {
          code: code,
          name: course,
          year: parseInt(year),
          semester: parseInt(semester),
          active: true,
          createdAt: Date.now(),
          createdBy: AUTH.getSession()?.id
        });
      } else if (!existingCourse.active) {
        await DB.COURSE.update(code, { active: true, year: parseInt(year), semester: parseInt(semester), reactivatedAt: Date.now() });
      }
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
        UI.btnLoad('gen-btn', false, 'Step 2 — Generate QR code'); 
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
        locEnabled: S.locOn, active: true, createdAt: Date.now(), lastHeartbeat: Date.now() 
      }; 
      await DB.SESSION.set(sessId, S.session); 
      _buildPanel(lecName, mins); 
      _startHeartbeat(); 
    } catch (err) { 
      UI.btnLoad('gen-btn', false, 'Step 2 — Generate QR code'); 
      await MODAL.error('Error', err.message); 
    } 
  }

  function _startHeartbeat() { 
    if (S.heartbeatInterval) clearInterval(S.heartbeatInterval); 
    S.heartbeatInterval = setInterval(async () => { 
      if (S.session && S.session.active) { 
        try { 
          await DB.SESSION.update(S.session.id, { lastHeartbeat: Date.now() }); 
          S.session.lastHeartbeat = Date.now(); 
        } catch (e) { } 
      } 
    }, 60000); 
  }
  
  function _stopHeartbeat() { 
    if (S.heartbeatInterval) { 
      clearInterval(S.heartbeatInterval); 
      S.heartbeatInterval = null; 
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
    
    const secPills = document.getElementById('sec-pills');
    if (secPills) {
      secPills.innerHTML = [
        { l: '1 device/sign-in', on: true }, 
        { l: 'Fingerprint scan', on: true }, 
        { l: 'Unique Student ID', on: true }, 
        { l: 'Location fence', on: s.locEnabled }, 
        { l: 'Time-limited QR', on: true }, 
        { l: 'Manual end only', on: true }
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
    
    UI.btnLoad('gen-btn', false, 'Step 2 — Generate QR code');
    stopTimers();
    
    S.unsubRec = DB.SESSION.listenRecords(s.id, recs => { 
      _renderAtt(recs); 
      const liveBtn = document.getElementById('live-csv-btn');
      if (liveBtn && recs.length > 0) liveBtn.style.display = 'inline-block'; 
    });
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
      attList.innerHTML = records.length ? records.map((r, i) => `<div class="att-item"><div class="att-dot"></div><span style="font-size:11px;min-width:22px">${i + 1}.</span><span class="att-name">${UI.esc(r.name)}</span><span class="att-sid">${UI.esc(r.studentId)}</span><span class="pill pill-gray">🔏 ${UI.esc((r.biometricId || '').slice(0, 8))}</span>${r.locNote ? `<span class="pill pill-teal">📍 ${UI.esc(r.locNote)}</span>` : ''}<span class="att-time">${UI.esc(r.time)}</span></div>`).join('') : '<div class="att-empty">Waiting for students…</div>';
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
      blkList.innerHTML = blocked.map(b => `<div class="blk-item"><span><strong>${UI.esc(b.name)}</strong> (${UI.esc(b.studentId)}) — ${UI.esc(b.reason)}</span><span style="white-space:nowrap">${UI.esc(b.time)}</span></div>`).join('');
    }
  }
  
  async function _markEnded(endedBy = 'manual', reason = '') { 
    if (!S.session) return; 
    try { 
      await DB.SESSION.update(S.session.id, { active: false, endedAt: Date.now(), endedBy: endedBy, endedReason: reason }); 
      const recs = await DB.SESSION.getRecords(S.session.id), blks = await DB.SESSION.getBlocked(S.session.id); 
      await DB.BACKUP.save(S.session.lecId || S.session.lecFbId, S.session.id, { session: { ...S.session, active: false }, records: recs, blocked: blks, savedAt: new Date().toISOString() }); 
    } catch (e) { } 
    S.session = null; 
    _stopHeartbeat(); 
  }
  
  async function endSession() { 
    const ok = await MODAL.confirm('End session?', 'All records will be saved.', { icon: '🛑', confirmLabel: 'End session', confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    stopTimers(); 
    await _markEnded('manual', 'Manually ended'); 
    resetForm(); 
    await MODAL.success('Session ended', 'All records saved.'); 
  }
  
  function stopTimers() { 
    if (S.tickTimer) clearInterval(S.tickTimer); 
    S.tickTimer = null; 
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; } 
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; } 
    _stopHeartbeat(); 
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

  // ==================== RECORDS TAB WITH FILTERING ====================
  async function _loadRecords() { 
    const el = document.getElementById('records-list'); 
    if (!el) return;
    
    // Create filter bar if not exists
    let filterBar = document.getElementById('records-filter-bar');
    if (!filterBar) {
      filterBar = document.createElement('div');
      filterBar.id = 'records-filter-bar';
      filterBar.className = 'filter-bar';
      filterBar.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end';
      filterBar.innerHTML = `
        <div style="flex:1"><label class="fl" style="font-size:11px">Academic Year</label>
          <select id="records-filter-year" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterRecords()">
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1"><label class="fl" style="font-size:11px">Semester</label>
          <select id="records-filter-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterRecords()">
            <option value="1">First Semester (Aug - Jan)</option>
            <option value="2">Second Semester (Feb - Jul)</option>
          </select>
        </div>
        <div><button class="btn btn-secondary btn-sm" onclick="LEC.filterRecords()" style="margin-top:18px;padding:6px 12px">Apply Filter</button></div>
      `;
      el.parentNode.insertBefore(filterBar, el);
    }
    
    // Set current filter values
    const yearSelect = document.getElementById('records-filter-year');
    const semesterSelect = document.getElementById('records-filter-semester');
    if (yearSelect && !yearSelect.value) yearSelect.value = S.currentFilterYear || 2024;
    if (semesterSelect && !semesterSelect.value) semesterSelect.value = S.currentFilterSemester || 1;
    
    el.innerHTML = '<div class="att-empty">Loading…</div>'; 
    try { 
      const user = AUTH.getSession(); 
      const myLecId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''); 
      let sessions = (await DB.SESSION.byLec(myLecId)).filter(s => !s.deletedByLec).sort((a, b) => b.createdAt - a.createdAt);
      
      // Apply filter
      sessions = _filterSessionsByPeriod(sessions);
      
      if (!sessions.length) { 
        el.innerHTML = '<div class="no-rec">No sessions found for the selected academic period.</div>'; 
        return; 
      } 
      el.innerHTML = sessions.map(s => { 
        const recs = s.records ? Object.values(s.records) : []; 
        const isActive = s.active === true; 
        const statusBadge = isActive ? `<span class="pill pill-teal" style="background:var(--teal);color:white">🟢 ACTIVE</span>` : `<span class="pill pill-gray">🔴 ENDED</span>`; 
        const endButton = isActive ? `<button class="btn btn-warning btn-sm" onclick="LEC.endSessionFromRecord('${s.id}')" style="background:var(--amber)">⏹️ End Session</button>` : ''; 
        return `<div class="sess-card" style="border-left:4px solid ${isActive ? 'var(--teal)' : 'var(--text4)'}"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)} ${statusBadge}</div><div class="sc-meta">${UI.esc(s.date)} · ${recs.length} present · Duration: ${UI.fmtDur(s.durationMins || 60)}</div>${isActive ? `<div class="sc-meta" style="color:var(--teal);font-size:11px">⏱️ Expires: ${new Date(s.expiresAt).toLocaleTimeString()}</div>` : ''}</div><div class="sc-actions">${endButton}<button class="btn btn-secondary btn-sm" onclick="LEC.exportSessCSV('${s.id}')">⬇ CSV</button>${!isActive ? `<button class="btn btn-danger btn-sm" onclick="LEC.deleteSess('${s.id}')">🗑️ Del</button>` : ''}</div></div>${recs.length ? `<div style="margin-top:10px">${recs.slice(0, 5).map((r, i) => `<div class="rec-row"><span style="font-size:11px;min-width:22px">${i + 1}.</span><span class="rec-name">${UI.esc(r.name)}</span><span class="rec-sid">${UI.esc(r.studentId)}</span><span class="rec-time">${UI.esc(r.time)}</span></div>`).join('')}${recs.length > 5 ? `<div style="font-size:11px;padding:4px 0">…${recs.length - 5} more</div>` : ''}</div>` : '<div class="no-rec" style="margin-top:8px">No check-ins yet</div>'}</div>`; 
      }).join(''); 
    } catch (err) { 
      el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; 
    } 
  }
  
  async function filterRecords() {
    const yearSelect = document.getElementById('records-filter-year');
    const semesterSelect = document.getElementById('records-filter-semester');
    if (yearSelect) S.currentFilterYear = parseInt(yearSelect.value);
    if (semesterSelect) S.currentFilterSemester = parseInt(semesterSelect.value);
    await _loadRecords();
  }
  
  async function endSessionFromRecord(sessionId) { 
    const session = await DB.SESSION.get(sessionId); 
    if (!session) { 
      await MODAL.error('Not found', 'Session not found.'); 
      return; 
    } 
    if (!session.active) { 
      await MODAL.alert('Already ended', 'Session already ended.'); 
      _loadRecords(); 
      return; 
    } 
    const confirm = await MODAL.confirm('End this session?', `<strong>${UI.esc(session.courseCode)} — ${UI.esc(session.courseName)}</strong><br/>Date: ${session.date}<br/>Check-ins: ${session.records ? Object.keys(session.records).length : 0}`, { icon: '🛑', confirmLabel: 'End Session', confirmCls: 'btn-warning' }); 
    if (!confirm) return; 
    try { 
      const recs = await DB.SESSION.getRecords(sessionId), blks = await DB.SESSION.getBlocked(sessionId); 
      await DB.SESSION.update(sessionId, { active: false, endedAt: Date.now(), manuallyEnded: true, endedBy: 'manual_from_records' }); 
      await DB.BACKUP.save(session.lecFbId || session.lecId, sessionId, { session: { ...session, active: false }, records: recs, blocked: blks, savedAt: new Date().toISOString() }); 
      if (S.session && S.session.id === sessionId) { 
        stopTimers(); 
        S.session = null; 
        resetForm(); 
      } 
      await MODAL.success('Session Ended', `Session for ${session.courseCode} ended. ${recs.length} check-in${recs.length !== 1 ? 's were' : ' was'} saved.`); 
      _loadRecords(); 
      const activeTab = document.querySelector('#view-lecturer .tab.active')?.dataset?.tab;
      if (activeTab === 'session' && S.session === null) resetForm(); 
    } catch (err) { 
      await MODAL.error('Error', err.message); 
    } 
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
    try { 
      await DB.SESSION.update(id, { deletedByLec: true }); 
      _loadRecords(); 
    } catch (err) { 
      MODAL.error('Error', err.message); 
    } 
  }
  
  async function exportSessCSV(id) { 
    const s = await DB.SESSION.get(id); 
    if (!s) return; 
    const recs = await DB.SESSION.getRecords(id); 
    if (!recs.length) { 
      MODAL.alert('No records', 'No check-ins to export.'); 
      return; 
    } 
    const rows = [['#', 'Name', 'Student ID', 'Biometric ID', 'Location', 'Time', 'Course', 'Lecturer', 'Date']]; 
    recs.forEach((r, i) => rows.push([i + 1, r.name, r.studentId, (r.biometricId || '').slice(0, 16), r.locNote || '', r.time, s.courseCode, s.lecturer, s.date])); 
    UI.dlCSV(rows, `ATT_${s.courseCode}_${s.date}`); 
  }

  // ==================== REPORTS TAB WITH FILTERING ====================
  async function _loadReports() { 
    const el = document.getElementById('reports-list'); 
    if (!el) return;
    
    // Create filter bar if not exists
    let filterBar = document.getElementById('reports-filter-bar');
    if (!filterBar) {
      filterBar = document.createElement('div');
      filterBar.id = 'reports-filter-bar';
      filterBar.className = 'filter-bar';
      filterBar.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end';
      filterBar.innerHTML = `
        <div style="flex:1"><label class="fl" style="font-size:11px">Academic Year</label>
          <select id="reports-filter-year" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterReports()">
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1"><label class="fl" style="font-size:11px">Semester</label>
          <select id="reports-filter-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterReports()">
            <option value="1">First Semester (Aug - Jan)</option>
            <option value="2">Second Semester (Feb - Jul)</option>
          </select>
        </div>
        <div><button class="btn btn-secondary btn-sm" onclick="LEC.filterReports()" style="margin-top:18px;padding:6px 12px">Apply Filter</button></div>
      `;
      el.parentNode.insertBefore(filterBar, el);
    }
    
    // Set current filter values
    const yearSelect = document.getElementById('reports-filter-year');
    const semesterSelect = document.getElementById('reports-filter-semester');
    if (yearSelect && !yearSelect.value) yearSelect.value = S.currentFilterYear || 2024;
    if (semesterSelect && !semesterSelect.value) semesterSelect.value = S.currentFilterSemester || 1;
    
    el.innerHTML = '<div class="att-empty">Loading…</div>'; 
    try { 
      const user = AUTH.getSession(); 
      let all = (await DB.SESSION.byLec(user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''))).filter(s => !s.deletedByLec);
      
      // Apply filter
      all = _filterSessionsByPeriod(all);
      
      if (!all.length) { 
        el.innerHTML = '<div class="no-rec">No sessions found for the selected academic period.</div>'; 
        return; 
      } 
      const grouped = {}; 
      all.forEach(s => { 
        if (!grouped[s.courseCode]) grouped[s.courseCode] = { code: s.courseCode, name: s.courseName, sessions: [] }; 
        grouped[s.courseCode].sessions.push(s); 
      }); 
      el.innerHTML = Object.values(grouped).map(g => { 
        const total = g.sessions.reduce((n, s) => n + (s.records ? Object.keys(s.records).length : 0), 0); 
        return `<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(g.code)} — ${UI.esc(g.name)}</div><div class="sc-meta">${g.sessions.length} session${g.sessions.length !== 1 ? 's' : ''} · ${total} total check-ins</div></div><div class="sc-actions"><button class="btn btn-ug btn-sm" onclick="LEC.exportCourseXL('${UI.esc(g.code)}')">⬇ Excel</button><button class="btn btn-secondary btn-sm" onclick="LEC.exportCourseCSV('${UI.esc(g.code)}')">⬇ CSV</button></div></div></div>`; 
      }).join(''); 
    } catch (err) { 
      el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; 
    } 
  }
  
  async function filterReports() {
    const yearSelect = document.getElementById('reports-filter-year');
    const semesterSelect = document.getElementById('reports-filter-semester');
    if (yearSelect) S.currentFilterYear = parseInt(yearSelect.value);
    if (semesterSelect) S.currentFilterSemester = parseInt(semesterSelect.value);
    await _loadReports();
  }
  
  async function exportCourseXL(code) { 
    if (typeof XLSX === 'undefined') { 
      MODAL.alert('Library not ready', 'SheetJS not loaded.'); 
      return; 
    } 
    MODAL.loading('Preparing Excel…'); 
    try { 
      const user = AUTH.getSession(); 
      let all = (await DB.SESSION.byLec(user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''))).filter(s => s.courseCode === code && !s.deletedByLec);
      
      // Apply filter
      all = _filterSessionsByPeriod(all);
      
      if (!all.length) { 
        MODAL.close(); 
        MODAL.alert('No data', 'No sessions for this course in the selected period.'); 
        return; 
      } 
      const wb = XLSX.utils.book_new(); 
      const r1 = [['#', 'Date', 'Session ID', 'Student Name', 'Student ID', 'Biometric ID', 'Location', 'Check-in Time', 'Course', 'Lecturer', 'Lecturer ID']]; 
      let n = 1; 
      all.forEach(s => { 
        const recs = s.records ? Object.values(s.records) : []; 
        if (!recs.length) r1.push([n++, s.date, s.id, '(no check-ins)', '', '', '', '', s.courseName, s.lecturer, s.lecId]); 
        else recs.forEach(r => r1.push([n++, s.date, s.id, r.name, r.studentId, (r.biometricId || '').slice(0, 16), r.locNote || '', r.time, s.courseName, s.lecturer, s.lecId])); 
      }); 
      const ws1 = XLSX.utils.aoa_to_sheet(r1); 
      ws1['!cols'] = r1[0].map(() => ({ wch: 20 })); 
      XLSX.utils.book_append_sheet(wb, ws1, 'Attendance List'); 
      const freq = {}; 
      all.forEach(s => (s.records ? Object.values(s.records) : []).forEach(r => { 
        const sid = r.studentId.toUpperCase().trim(); 
        if (!freq[sid]) freq[sid] = { sid: r.studentId, name: r.name, count: 0, dates: [] }; 
        freq[sid].count++; 
        freq[sid].dates.push(s.date); 
      })); 
      const r2 = [['Student ID', 'Student Name', 'Sessions Attended', 'Total Sessions', 'Attendance %', 'Dates']]; 
      Object.values(freq).sort((a, b) => b.count - a.count).forEach(f => r2.push([f.sid, f.name, f.count, all.length, Math.round(f.count / all.length * 100) + '%', f.dates.join(', ')])); 
      const ws2 = XLSX.utils.aoa_to_sheet(r2); 
      ws2['!cols'] = r2[0].map(() => ({ wch: 22 })); 
      XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Frequency'); 
      XLSX.writeFile(wb, `UG_ATT_${code}_${(user?.lecId || '').replace(/[^a-z0-9]/gi, '_')}.xlsx`); 
      MODAL.close(); 
    } catch (err) { 
      MODAL.close(); 
      MODAL.error('Export failed', err.message); 
    } 
  }
  
  async function exportCourseCSV(code) { 
    const user = AUTH.getSession(); 
    let all = (await DB.SESSION.byLec(user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''))).filter(s => s.courseCode === code && !s.deletedByLec);
    
    // Apply filter
    all = _filterSessionsByPeriod(all);
    
    const rows = [['#', 'Date', 'Student Name', 'Student ID', 'Biometric ID', 'Location', 'Time', 'Course', 'Lecturer']]; 
    let n = 1; 
    all.forEach(s => (s.records ? Object.values(s.records) : []).forEach(r => rows.push([n++, s.date, r.name, r.studentId, (r.biometricId || '').slice(0, 16), r.locNote || '', r.time, s.courseName, s.lecturer]))); 
    UI.dlCSV(rows, `UG_ATT_${code}`); 
  }

  // ==================== COURSE MANAGEMENT TAB WITH FILTERING ====================
  async function _loadCourses() { 
    const activeEl = document.getElementById('active-courses-list');
    const historyEl = document.getElementById('course-history-list');
    if (!activeEl) return; 
    
    // Create filter bar if not exists
    let filterBar = document.getElementById('courses-filter-bar');
    if (!filterBar && activeEl.parentNode) {
      filterBar = document.createElement('div');
      filterBar.id = 'courses-filter-bar';
      filterBar.className = 'filter-bar';
      filterBar.style.cssText = 'display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:flex-end';
      filterBar.innerHTML = `
        <div style="flex:1"><label class="fl" style="font-size:11px">Academic Year</label>
          <select id="courses-filter-year" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterCourses()">
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
        </div>
        <div style="flex:1"><label class="fl" style="font-size:11px">Semester</label>
          <select id="courses-filter-semester" class="fi" style="padding:6px 8px;font-size:12px" onchange="LEC.filterCourses()">
            <option value="1">First Semester (Aug - Jan)</option>
            <option value="2">Second Semester (Feb - Jul)</option>
          </select>
        </div>
        <div><button class="btn btn-secondary btn-sm" onclick="LEC.filterCourses()" style="margin-top:18px;padding:6px 12px">Apply Filter</button></div>
      `;
      activeEl.parentNode.insertBefore(filterBar, activeEl);
    }
    
    // Set current filter values
    const yearSelect = document.getElementById('courses-filter-year');
    const semesterSelect = document.getElementById('courses-filter-semester');
    if (yearSelect && !yearSelect.value) yearSelect.value = S.currentFilterYear || 2024;
    if (semesterSelect && !semesterSelect.value) semesterSelect.value = S.currentFilterSemester || 1;
    
    try { 
      const user = AUTH.getSession(), myId = user?.id || '', sessions = await DB.SESSION.byLec(myId), unique = {}; 
      for (const s of sessions) { 
        const code = s.courseCode; 
        if (!unique[code]) { 
          const cr = await DB.COURSE.get(code); 
          if (cr) { 
            unique[code] = { 
              code: s.courseCode, 
              name: s.courseName, 
              active: cr.active, 
              year: cr.year, 
              semester: cr.semester, 
              lastSessionDate: s.date 
            }; 
          } 
        } 
      } 
      
      // Filter courses by selected year and semester
      let filteredCourses = Object.values(unique);
      if (S.currentFilterYear && S.currentFilterSemester) {
        filteredCourses = filteredCourses.filter(c => c.year === S.currentFilterYear && c.semester === S.currentFilterSemester);
      }
      
      const active = filteredCourses.filter(c => c.active === true);
      const inactive = filteredCourses.filter(c => c.active === false);
      
      activeEl.innerHTML = active.length ? active.map(c => `<div class="course-management-card"><div class="course-header"><div class="course-code">${UI.esc(c.code)}</div><div class="course-status active">🟢 Active</div></div><div class="course-name">${UI.esc(c.name)}</div><div class="course-meta">Year: ${c.year} | Semester: ${c.semester === 1 ? 'First' : 'Second'}</div><button class="btn btn-warning btn-sm" onclick="LEC.endCourseForSemester('${c.code}')">⏹️ End Course</button></div>`).join('') : '<div class="no-rec">No active courses for selected period.</div>'; 
      
      if (historyEl) historyEl.innerHTML = inactive.length ? inactive.map(c => `<div class="course-management-card archived"><div class="course-header"><div class="course-code">${UI.esc(c.code)}</div><div class="course-status inactive">🔴 Archived</div></div><div class="course-name">${UI.esc(c.name)}</div><div class="course-meta">Last: ${c.lastSessionDate}</div><button class="btn btn-teal btn-sm" onclick="LEC.reactivateCourse('${c.code}')">🔄 Reactivate</button></div>`).join('') : '<div class="no-rec">No archived courses for selected period.</div>'; 
    } catch (err) { 
      activeEl.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; 
    } 
  }
  
  async function filterCourses() {
    const yearSelect = document.getElementById('courses-filter-year');
    const semesterSelect = document.getElementById('courses-filter-semester');
    if (yearSelect) S.currentFilterYear = parseInt(yearSelect.value);
    if (semesterSelect) S.currentFilterSemester = parseInt(semesterSelect.value);
    await _loadCourses();
  }
  
  async function endCourseForSemester(courseCode) { 
    const ok = await MODAL.confirm('End Course', `End ${courseCode} for semester? Students cannot check in.`, { confirmLabel: 'Yes, End', confirmCls: 'btn-warning' }); 
    if (!ok) return; 
    try { 
      await DB.COURSE.endCourseForSemester(courseCode, AUTH.getSession()?.id); 
      await MODAL.success('Course Ended', `${courseCode} ended.`); 
      await _loadCourses(); 
      await _loadRecords(); // Refresh records too
    } catch (err) { 
      await MODAL.error('Error', err.message); 
    } 
  }
  
  async function reactivateCourse(courseCode) { 
    const period = DB.getCurrentAcademicPeriod(); 
    const ok = await MODAL.confirm('Reactivate', `Reactivate ${courseCode} for Year ${period.year} - Semester ${period.semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Reactivate', confirmCls: 'btn-teal' }); 
    if (!ok) return; 
    try { 
      await DB.COURSE.reactivateCourse(courseCode, period.year, period.semester, AUTH.getSession()?.id); 
      await MODAL.success('Reactivated', `${courseCode} is active.`); 
      await _loadCourses(); 
      await _loadRecords(); // Refresh records too
    } catch (err) { 
      await MODAL.error('Error', err.message); 
    } 
  }

  // ==================== TEACHING ASSISTANTS TAB ====================
  async function _loadTAs() { 
    const el = document.getElementById('ta-list'); 
    if (!el) return; 
    el.innerHTML = '<div class="att-empty">Loading…</div>'; 
    try { 
      const user = AUTH.getSession(), myId = user?.id || ''; 
      const all = await DB.TA.getAll(), mine = all.filter(ta => ta.lecturers?.includes(myId)); 
      const taCount = document.getElementById('ta-count');
      if (taCount) taCount.textContent = mine.length; 
      if (!mine.length) { 
        el.innerHTML = '<div class="no-rec">No TAs yet.</div>'; 
        return; 
      } 
      el.innerHTML = mine.map(ta => `<div class="att-item"><div class="att-dot" style="background:var(--teal)"></div><span class="att-name">${UI.esc(ta.name || '(not registered)')}</span><span class="att-sid">${UI.esc(ta.email)}</span><span class="pill ${ta.status === 'active' ? 'pill-teal' : 'pill-gray'}">${ta.status === 'active' ? '✓ Active' : 'Pending'}</span><button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="LEC.removeTA('${ta.id}','${UI.esc(ta.name || ta.email)}')">Remove</button></div>`).join(''); 
    } catch (err) { 
      el.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; 
    } 
  }
  
  async function inviteTA() { 
    const emailEl = document.getElementById('ta-email-input');
    const nameEl = document.getElementById('ta-name-input');
    const courseEl = document.getElementById('ta-course-input');
    const email = (emailEl?.value || '').trim().toLowerCase(); 
    const taName = nameEl?.value?.trim() || ''; 
    const courseName = courseEl?.value?.trim() || 'Course'; 
    UI.clrAlert('ta-add-alert'); 
    if (!email) return UI.setAlert('ta-add-alert', 'Enter TA email.'); 
    if (!email.endsWith('@st.ug.edu.gh')) return UI.setAlert('ta-add-alert', 'Email must end with @st.ug.edu.gh'); 
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
        if (courseEl) courseEl.value = ''; 
        UI.btnLoad('ta-invite-btn', false); 
        await MODAL.success('Linked!', `${taName} added.`); 
        _loadTAs(); 
        return; 
      } 
      const code = UI.makeCode(), invKey = UI.makeToken(), signupLink = `${CONFIG.SITE_URL}?code=${code}#ta-signup`; 
      await DB.TA.setInvite(invKey, { code, toEmail: email, toName: taName, lecturerId: myId, lecturerName: user?.name, courseName, createdAt: Date.now(), expiresAt: Date.now() + 48 * 3600 * 1000, usedAt: null }); 
      if (emailEl) emailEl.value = ''; 
      if (nameEl) nameEl.value = ''; 
      if (courseEl) courseEl.value = ''; 
      UI.btnLoad('ta-invite-btn', false); 
      await MODAL.alert('Invite Code', `<div style="text-align:center"><div style="background:var(--ug);color:var(--gold);padding:20px;border-radius:12px;margin-bottom:16px"><div style="font-size:12px">Invite Code</div><div style="font-size:36px;font-weight:700;letter-spacing:4px">${code}</div><div style="font-size:11px">Valid 48h</div></div><div style="display:flex;gap:10px;justify-content:center"><button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${code}')">📋 Copy Code</button><button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${signupLink}')">🔗 Copy Link</button></div></div>`, { icon: '🎓', btnLabel: 'Done' }); 
      _loadTAs(); 
    } catch (err) { 
      UI.setAlert('ta-add-alert', err.message); 
    } finally { 
      UI.btnLoad('ta-invite-btn', false, 'Send invite'); 
    } 
  }
  
  async function removeTA(taId, taName) { 
    const ok = await MODAL.confirm(`Remove ${taName}?`, 'They lose access.', { confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    try { 
      const user = AUTH.getSession(), myId = user?.id || '', ta = await DB.TA.get(taId); 
      if (!ta) return; 
      await DB.TA.update(taId, { lecturers: (ta.lecturers || []).filter(id => id !== myId) }); 
      _loadTAs(); 
    } catch (err) { 
      MODAL.error('Error', err.message); 
    } 
  }

  return { 
    tab, resetForm, toggleFence, getLoc, startSession, endSession, endSessionFromRecord, 
    downloadQR, exportLiveCSV, stopTimers, deleteSess, exportSessCSV, 
    exportCourseXL, exportCourseCSV, inviteTA, removeTA, 
    endCourseForSemester, reactivateCourse, toggleCourseType, selectExistingCourse, _loadExistingCourses,
    filterRecords, filterReports, filterCourses
  };
})();
