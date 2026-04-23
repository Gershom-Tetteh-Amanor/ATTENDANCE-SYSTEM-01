/* ============================================
   admin.js — Super admin + co-admin dashboards
   WITH COURSE GROUPING:
   - Super admin: Year → Department → Semester → Lecturer
   - Co-admin: Year → Semester → Lecturer (within their department)
   ============================================ */
'use strict';

// Helper: group courses by the specified hierarchy
function _groupCourses(courses, role, coAdminDept = null) {
  const groups = {};
  for (const c of courses) {
    if (role === 'superAdmin') {
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.department || 'Unknown']) groups[c.year][c.department || 'Unknown'] = {};
      if (!groups[c.year][c.department || 'Unknown'][c.semester]) groups[c.year][c.department || 'Unknown'][c.semester] = {};
      if (!groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId]) {
        groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId] = {
          lecturerName: c.lecturerName,
          courses: []
        };
      }
      groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId].courses.push(c);
    } else if (role === 'coAdmin') {
      if (coAdminDept && c.department !== coAdminDept) continue;
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.semester]) groups[c.year][c.semester] = {};
      if (!groups[c.year][c.semester][c.lecturerId]) {
        groups[c.year][c.semester][c.lecturerId] = {
          lecturerName: c.lecturerName,
          courses: []
        };
      }
      groups[c.year][c.semester][c.lecturerId].courses.push(c);
    }
  }
  return groups;
}

// Helper to collect all courses from sessions
async function _fetchAllCourses() {
  const sessions = await DB.SESSION.getAll();
  const courseMap = new Map();
  for (const sess of sessions) {
    const sessionDate = new Date(sess.date);
    let year = sessionDate.getFullYear();
    const month = sessionDate.getMonth();
    let semester = (month >= 1 && month <= 6) ? 2 : 1;
    if (semester === 2 && month <= 6) year = year - 1;
    const key = `${sess.courseCode}_${year}_${semester}_${sess.lecFbId}`;
    if (!courseMap.has(key)) {
      const lec = await DB.LEC.get(sess.lecFbId);
      courseMap.set(key, {
        year,
        semester,
        department: sess.department || lec?.department || 'Unknown',
        lecturerName: lec?.name || sess.lecturer,
        lecturerId: sess.lecFbId,
        courseCode: sess.courseCode,
        courseName: sess.courseName,
        sessionCount: 1,
        lastDate: sess.date
      });
    } else {
      const existing = courseMap.get(key);
      existing.sessionCount++;
      if (new Date(sess.date) > new Date(existing.lastDate)) existing.lastDate = sess.date;
      courseMap.set(key, existing);
    }
  }
  return Array.from(courseMap.values());
}

// ---------- SUPER ADMIN ----------
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');

  function tab(name) {
    document.querySelectorAll('#view-sadmin .tab').forEach(t => {
      const txt = t.textContent.trim().toLowerCase();
      t.classList.toggle('active', txt === name || txt.startsWith(name));
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      coadmins: renderCoAdmins,
      settings: renderSettings,
      courses: renderCourses
    };
    if (fns[name]) fns[name]();
  }

  async function renderIDs() {
    c().innerHTML = '<div class="pg"><h2>Lecturer Unique IDs</h2><p class="sub">Generate and manage registration codes for lecturers</p><div class="row-btns" style="margin-bottom:16px"><button class="btn btn-ug" onclick="SADM.genUID()">➕ Generate new ID</button><button class="btn btn-secondary" onclick="SADM.loadUIDs()">🔄 Refresh list</button></div><div id="uids-list"><div class="att-empty">Loading...</div></div></div>';
    await loadUIDs();
  }

  async function loadUIDs() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    try {
      const uids = await DB.UID.getAll();
      if (!uids.length) { container.innerHTML = '<div class="no-rec">No Unique IDs generated yet.</div>'; return; }
      const sorted = uids.sort((a,b) => b.createdAt - a.createdAt);
      container.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="border-bottom:2px solid var(--border)"><th style="padding:8px 4px;text-align:left">UID</th><th style="padding:8px 4px;text-align:left">Status</th><th style="padding:8px 4px;text-align:left">Assigned To</th><th style="padding:8px 4px;text-align:left">Created</th><th style="padding:8px 4px"></th></tr></thead>
        <tbody>${sorted.map(uid => `<tr style="border-bottom:1px solid var(--border)"><td style="padding:10px 4px"><code>${UI.esc(uid.id)}</code></td>
          <td style="padding:10px 4px"><span class="pill ${uid.status === 'available' ? 'pill-green' : 'pill-gray'}">${uid.status}</span></td>
          <td style="padding:10px 4px">${uid.assignedTo ? UI.esc(uid.assignedTo) : '—'}</td>
          <td style="padding:10px 4px">${new Date(uid.createdAt).toLocaleDateString()}</td>
          <td style="padding:10px 4px">${uid.status === 'available' ? `<button class="btn btn-danger btn-sm" onclick="SADM.revokeUID('${uid.id}')">Revoke</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch(err) { container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function genUID() {
    try {
      const uid = UI.makeLecUID();
      await DB.UID.set(uid, { id: uid, status: 'available', createdAt: Date.now() });
      await MODAL.success('UID Generated', `<code>${uid}</code><br/>Share this with the lecturer for registration.`);
      await loadUIDs();
    } catch(err) { await MODAL.error('Error', err.message); }
  }

  async function revokeUID(uid) {
    const ok = await MODAL.confirm('Revoke UID?', `Revoke ${uid}? It will no longer be usable.`);
    if (!ok) return;
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await loadUIDs();
  }

  async function renderLecturers() {
    c().innerHTML = '<div class="pg"><h2>Lecturers</h2><p class="sub">All registered lecturers</p><div id="lecturers-list"><div class="att-empty">Loading...</div></div></div>';
    try {
      const lecs = await DB.LEC.getAll();
      if (!lecs.length) { document.getElementById('lecturers-list').innerHTML = '<div class="no-rec">No lecturers registered.</div>'; return; }
      document.getElementById('lecturers-list').innerHTML = lecs.map(l => `<div class="att-item"><div class="att-dot" style="background:var(--ug)"></div><div><strong>${UI.esc(l.name)}</strong><br/><span style="font-size:11px;color:var(--text3)">${UI.esc(l.email)} · ${UI.esc(l.department || '—')}</span></div><div style="margin-left:auto"><code>${UI.esc(l.lecId)}</code></div></div>`).join('');
    } catch(err) { document.getElementById('lecturers-list').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function renderSessions() {
    c().innerHTML = '<div class="pg"><h2>All Sessions</h2><p class="sub">Monitor all attendance sessions</p><div id="sessions-list"><div class="att-empty">Loading...</div></div></div>';
    try {
      const sessions = await DB.SESSION.getAll();
      if (!sessions.length) { document.getElementById('sessions-list').innerHTML = '<div class="no-rec">No sessions found.</div>'; return; }
      const sorted = sessions.sort((a,b) => b.createdAt - a.createdAt);
      document.getElementById('sessions-list').innerHTML = sorted.slice(0, 50).map(s => `<div class="sess-card"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} — ${UI.esc(s.courseName)}</div><div class="sc-meta">📅 ${s.date} · 👨‍🏫 ${UI.esc(s.lecturer)} · ${s.active ? '🟢 Active' : '🔴 Ended'}</div></div></div></div>`).join('');
    } catch(err) { document.getElementById('sessions-list').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function renderDatabase() {
    c().innerHTML = `<div class="pg"><h2>Database Management</h2><p class="sub">Export and backup data</p><div class="inner-panel"><h3>Export Data</h3><div class="row-btns"><button class="btn btn-secondary btn-sm" onclick="SADM.exportJSON()">📄 Export JSON</button><button class="btn btn-secondary btn-sm" onclick="SADM.exportCSV()">📊 Export CSV</button></div></div><div id="backup-info" class="inner-panel"><h3>Backups</h3><div class="att-empty">Loading backups...</div></div></div>`;
    try {
      const backups = await DB.get('backup') || {};
      const backupList = Object.values(backups).flatMap(lec => Object.values(lec || {}));
      const backupDiv = document.getElementById('backup-info');
      if (backupDiv) {
        if (!backupList.length) backupDiv.innerHTML = '<div class="no-rec">No backups found.</div>';
        else backupDiv.innerHTML = `<div><strong>Total backups:</strong> ${backupList.length}</div><div class="att-empty" style="margin-top:10px;font-size:12px">Use export for detailed data.</div>`;
      }
    } catch(err) { console.warn(err); }
  }

  async function exportJSON() {
    try {
      const data = {
        students: await DB.STUDENTS.getAll(),
        lecturers: await DB.LEC.getAll(),
        tas: await DB.TA.getAll(),
        sessions: await DB.SESSION.getAll(),
        uids: await DB.UID.getAll(),
        cas: await DB.CA.getAll(),
        exportedAt: new Date().toISOString()
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ug_attendance_export_${new Date().toISOString().slice(0,19)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await MODAL.success('Export Complete', `Exported ${data.students.length} students, ${data.lecturers.length} lecturers, ${data.sessions.length} sessions.`);
    } catch(err) { await MODAL.error('Export Failed', err.message); }
  }

  async function exportCSV() {
    try {
      const students = await DB.STUDENTS.getAll();
      const rows = [['Student ID', 'Name', 'Email', 'Registered At']];
      for (const s of students) rows.push([s.studentId, s.name, s.email, new Date(s.registeredAt).toLocaleDateString()]);
      UI.dlCSV(rows, 'students_export');
    } catch(err) { await MODAL.error('Export Failed', err.message); }
  }

  async function renderCoAdmins() {
    c().innerHTML = '<div class="pg"><h2>Co-Admin Applications</h2><p class="sub">Approve or reject co-admin requests</p><div id="coadmins-list"><div class="att-empty">Loading...</div></div></div>';
    try {
      const cas = await DB.CA.getAll();
      if (!cas.length) { document.getElementById('coadmins-list').innerHTML = '<div class="no-rec">No applications.</div>'; return; }
      const pending = cas.filter(c => c.status === 'pending');
      const approved = cas.filter(c => c.status === 'approved');
      const revoked = cas.filter(c => c.status === 'revoked');
      let html = '';
      if (pending.length) html += `<h3 style="margin:16px 0 8px;color:var(--amber)">Pending (${pending.length})</h3>${pending.map(c => `<div class="appr-item"><div class="appr-hdr"><div><strong>${UI.esc(c.name)}</strong><br/><span style="font-size:12px">${UI.esc(c.email)} · ${UI.esc(c.department)}</span></div><div class="appr-act"><button class="btn btn-success btn-sm" onclick="SADM.approveCoAdmin('${c.id}')">✅ Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCoAdmin('${c.id}')">❌ Reject</button></div></div></div>`).join('')}`;
      if (approved.length) html += `<h3 style="margin:16px 0 8px;color:var(--teal)">Approved (${approved.length})</h3>${approved.map(c => `<div class="appr-item"><div><strong>${UI.esc(c.name)}</strong><br/><span>${UI.esc(c.email)}</span></div><div class="appr-act"><button class="btn btn-danger btn-sm" onclick="SADM.revokeCoAdmin('${c.id}')">Revoke</button></div></div>`).join('')}`;
      if (revoked.length) html += `<h3 style="margin:16px 0 8px;color:var(--danger)">Revoked (${revoked.length})</h3>${revoked.map(c => `<div class="appr-item"><div><strong>${UI.esc(c.name)}</strong><br/><span>${UI.esc(c.email)}</span></div></div>`).join('')}`;
      document.getElementById('coadmins-list').innerHTML = html || '<div class="no-rec">No applications.</div>';
    } catch(err) { document.getElementById('coadmins-list').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function approveCoAdmin(id) {
    await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() });
    await renderCoAdmins();
    const dot = document.getElementById('cadm-dot');
    if (dot) dot.style.display = 'none';
  }

  async function rejectCoAdmin(id) {
    await DB.CA.update(id, { status: 'revoked', rejectedAt: Date.now() });
    await renderCoAdmins();
  }

  async function revokeCoAdmin(id) {
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() });
    await renderCoAdmins();
  }

  async function renderSettings() {
    c().innerHTML = `<div class="pg"><h2>System Settings</h2><p class="sub">Configuration options</p><div class="inner-panel"><h3>Appearance</h3><div class="row-btns"><button class="btn btn-secondary btn-sm" onclick="THEME.toggle()">Toggle Dark Mode</button></div></div><div class="inner-panel"><h3>Data Management</h3><div class="row-btns"><button class="btn btn-danger btn-sm" onclick="SADM.clearCache()">Clear Local Cache</button></div></div></div>`;
  }

  async function clearCache() {
    const ok = await MODAL.confirm('Clear Cache?', 'This will clear local data. You will need to sign in again.');
    if (!ok) return;
    localStorage.clear();
    window.location.reload();
  }

  async function renderCourses() {
    c().innerHTML = '<div class="pg"><h2>All Courses</h2><p class="sub">Grouped by Year → Department → Semester → Lecturer</p><div id="sadm-courses-container"><div class="att-empty">Loading courses...</div></div></div>';
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'superAdmin');
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:32px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">Academic Year ${year}</h3>`;
        const depts = Object.keys(grouped[year]).sort();
        for (const dept of depts) {
          html += `<div style="margin-left:20px; margin-bottom:20px;"><h4 style="color:var(--teal);">📂 Department: ${UI.esc(dept)}</h4>`;
          const semesters = Object.keys(grouped[year][dept]).sort((a,b) => a - b);
          for (const sem of semesters) {
            const semName = sem === '1' ? 'First Semester' : 'Second Semester';
            html += `<div style="margin-left:20px; margin-bottom:16px;"><h5 style="color:var(--amber);">📖 ${semName}</h5>`;
            const lecturers = Object.keys(grouped[year][dept][sem]).sort();
            for (const lecId of lecturers) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
              for (const course of lecGroup.courses) {
                html += `<div class="pill pill-blue" style="padding:4px 10px;">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.sessionCount} sessions)</div>`;
              }
              html += `</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      document.getElementById('sadm-courses-container').innerHTML = html || '<div class="no-rec">No courses found.</div>';
    } catch(err) {
      document.getElementById('sadm-courses-container').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  return { 
    tab, renderIDs, renderLecturers, renderSessions, renderDatabase, renderCoAdmins, renderSettings, renderCourses,
    genUID, loadUIDs, revokeUID, exportJSON, exportCSV, approveCoAdmin, rejectCoAdmin, revokeCoAdmin, clearCache
  };
})();

// ---------- CO-ADMIN ----------
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';

  function tab(name) {
    document.querySelectorAll('#view-cadmin .tab').forEach(t => {
      const txt = t.textContent.trim().toLowerCase();
      t.classList.toggle('active', txt === name || txt.startsWith(name));
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      courses: renderCourses
    };
    if (fns[name]) fns[name]();
  }

  async function renderIDs() {
    c().innerHTML = '<div class="pg"><h2>Manage Lecturer IDs</h2><p class="sub">Generate and manage registration codes</p><div class="row-btns" style="margin-bottom:16px"><button class="btn btn-ug" onclick="CADM.genUID()">➕ Generate new ID</button><button class="btn btn-secondary" onclick="CADM.loadUIDs()">🔄 Refresh list</button></div><div id="uids-list"><div class="att-empty">Loading...</div></div></div>';
    await loadUIDs();
  }

  async function loadUIDs() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    try {
      const uids = await DB.UID.getAll();
      const available = uids.filter(u => u.status === 'available');
      container.innerHTML = available.length ? available.map(uid => `<div class="att-item"><code>${UI.esc(uid.id)}</code><span class="pill pill-green" style="margin-left:10px">Available</span><div style="margin-left:auto"><button class="btn btn-danger btn-sm" onclick="CADM.revokeUID('${uid.id}')">Revoke</button></div></div>`).join('') : '<div class="no-rec">No available UIDs.</div>';
    } catch(err) { container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function genUID() {
    try {
      const uid = UI.makeLecUID();
      await DB.UID.set(uid, { id: uid, status: 'available', createdAt: Date.now() });
      await MODAL.success('UID Generated', `<code>${uid}</code>`);
      await loadUIDs();
    } catch(err) { await MODAL.error('Error', err.message); }
  }

  async function revokeUID(uid) {
    const ok = await MODAL.confirm('Revoke UID?', `Revoke ${uid}?`);
    if (!ok) return;
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await loadUIDs();
  }

  async function renderLecturers() {
    c().innerHTML = '<div class="pg"><h2>Lecturers</h2><p class="sub">Lecturers in your department</p><div id="lecturers-list"><div class="att-empty">Loading...</div></div></div>';
    try {
      const lecs = await DB.LEC.getAll();
      const mine = lecs.filter(l => l.department === dept());
      if (!mine.length) { document.getElementById('lecturers-list').innerHTML = '<div class="no-rec">No lecturers in your department.</div>'; return; }
      document.getElementById('lecturers-list').innerHTML = mine.map(l => `<div class="att-item"><div><strong>${UI.esc(l.name)}</strong><br/><span style="font-size:11px">${UI.esc(l.email)}</span></div><div style="margin-left:auto"><code>${UI.esc(l.lecId)}</code></div></div>`).join('');
    } catch(err) { document.getElementById('lecturers-list').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function renderSessions() {
    c().innerHTML = '<div class="pg"><h2>Sessions</h2><p class="sub">Attendance sessions in your department</p><div id="sessions-list"><div class="att-empty">Loading...</div></div></div>';
    try {
      const sessions = await DB.SESSION.getAll();
      const lecs = await DB.LEC.getAll();
      const myDeptLecIds = lecs.filter(l => l.department === dept()).map(l => l.id);
      const mine = sessions.filter(s => myDeptLecIds.includes(s.lecFbId));
      if (!mine.length) { document.getElementById('sessions-list').innerHTML = '<div class="no-rec">No sessions in your department.</div>'; return; }
      document.getElementById('sessions-list').innerHTML = mine.map(s => `<div class="sess-card"><div><strong>${UI.esc(s.courseCode)}</strong> — ${UI.esc(s.courseName)}</div><div class="sc-meta">📅 ${s.date} · 👨‍🏫 ${UI.esc(s.lecturer)} · ${s.active ? '🟢 Active' : '🔴 Ended'}</div></div>`).join('');
    } catch(err) { document.getElementById('sessions-list').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function renderDatabase() {
    c().innerHTML = `<div class="pg"><h2>Database</h2><p class="sub">Export data (your department only)</p><div class="row-btns"><button class="btn btn-secondary btn-sm" onclick="CADM.exportDeptCSV()">📊 Export Department CSV</button></div></div>`;
  }

  async function exportDeptCSV() {
    try {
      const lecs = await DB.LEC.getAll();
      const myDeptLecIds = lecs.filter(l => l.department === dept()).map(l => l.id);
      const sessions = await DB.SESSION.getAll();
      const mine = sessions.filter(s => myDeptLecIds.includes(s.lecFbId));
      const rows = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Total Check-ins']];
      for (const s of mine) {
        const recCount = s.records ? Object.keys(s.records).length : 0;
        rows.push([s.date, s.courseCode, s.courseName, s.lecturer, recCount]);
      }
      UI.dlCSV(rows, `dept_${dept().replace(/\s/g, '_')}_sessions`);
      await MODAL.success('Export Complete', `Exported ${mine.length} sessions.`);
    } catch(err) { await MODAL.error('Export Failed', err.message); }
  }

  async function renderCourses() {
    c().innerHTML = `<div class="pg"><h2>Courses in ${UI.esc(dept())}</h2><p class="sub">Grouped by Year → Semester → Lecturer</p><div id="cadm-courses-container"><div class="att-empty">Loading courses...</div></div></div>`;
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'coAdmin', dept());
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:24px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">Academic Year ${year}</h3>`;
        const semesters = Object.keys(grouped[year]).sort((a,b) => a - b);
        for (const sem of semesters) {
          const semName = sem === '1' ? 'First Semester' : 'Second Semester';
          html += `<div style="margin-left:20px; margin-bottom:16px;"><h4 style="color:var(--teal);">📖 ${semName}</h4>`;
          const lecturers = Object.keys(grouped[year][sem]).sort();
          for (const lecId of lecturers) {
            const lecGroup = grouped[year][sem][lecId];
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
            for (const course of lecGroup.courses) {
              html += `<div class="pill pill-blue" style="padding:4px 10px;">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.sessionCount} sessions)</div>`;
            }
            html += `</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      document.getElementById('cadm-courses-container').innerHTML = html || '<div class="no-rec">No courses in your department.</div>';
    } catch(err) {
      document.getElementById('cadm-courses-container').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  return { 
    tab, renderIDs, renderLecturers, renderSessions, renderDatabase, renderCourses,
    genUID, loadUIDs, revokeUID, exportDeptCSV
  };
})();
