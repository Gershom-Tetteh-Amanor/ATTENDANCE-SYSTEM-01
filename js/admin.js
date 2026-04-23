/* admin.js — Super admin + co-admin dashboards */
'use strict';

// Helper: group courses by hierarchy
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
      const l = t.textContent.trim().toLowerCase().replace(/\s/g, '').replace(/[^a-z]/g, '');
      t.classList.toggle('active', l.startsWith(name));
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      coadmins: renderCoAdmins,
      settings: renderSettings,
      courses: renderCourses,
      security: renderSecurity
    };
    if (fns[name]) fns[name]();
  }

  async function renderIDs() {
    c().innerHTML = `
      <div class="pg">
        <h2>📋 Generate Unique Lecturer IDs</h2>
        <p class="sub">Generate and manage unique IDs for lecturer registration</p>
        <div class="inner-panel">
          <h3>Generate New ID</h3>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            <select id="new-uid-dept" class="fi" style="flex:1; padding:8px">
              <option value="">Select Department</option>
              ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
            <button class="btn btn-ug" onclick="SADM.generateUID()" style="width:auto; padding:8px 20px">➕ Generate ID</button>
          </div>
        </div>
        <div id="uids-list" class="inner-panel">
          <h3>Generated IDs</h3>
          <div class="att-empty">Loading...</div>
        </div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    
    try {
      const uids = await DB.UID.getAll();
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      const revoked = uids.filter(u => u.status === 'revoked');
      
      let html = `
        <div style="margin-bottom:20px">
          <h4>✅ Available (${available.length})</h4>
          ${available.length ? available.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <code style="font-size:14px">${UI.esc(u.id)}</code>
              <div>
                <span class="pill pill-teal">Available</span>
                <button class="btn btn-secondary btn-sm" onclick="SADM.revokeUID('${u.id}')" style="margin-left:8px">Revoke</button>
              </div>
            </div>
          `).join('') : '<div class="no-rec">No available IDs</div>'}
        </div>
        <div style="margin-bottom:20px">
          <h4>📋 Assigned (${assigned.length})</h4>
          ${assigned.length ? assigned.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <div>
                <code style="font-size:14px">${UI.esc(u.id)}</code>
                <div style="font-size:11px; color:var(--text3)">Assigned to: ${UI.esc(u.assignedTo)}</div>
              </div>
              <div><span class="pill pill-gray">Assigned</span></div>
            </div>
          `).join('') : '<div class="no-rec">No assigned IDs</div>'}
        </div>
        <div>
          <h4>🚫 Revoked (${revoked.length})</h4>
          ${revoked.length ? revoked.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <code style="font-size:14px">${UI.esc(u.id)}</code>
              <div><span class="pill pill-red">Revoked</span></div>
            </div>
          `).join('') : '<div class="no-rec">No revoked IDs</div>'}
        </div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function generateUID() {
    const dept = document.getElementById('new-uid-dept')?.value;
    if (!dept) {
      await MODAL.alert('Department Required', 'Please select a department.');
      return;
    }
    
    const uid = UI.makeLecUID();
    await DB.UID.set(uid, {
      id: uid,
      department: dept,
      status: 'available',
      createdAt: Date.now(),
      createdBy: 'admin'
    });
    
    await MODAL.success('ID Generated', `Unique ID: <strong>${uid}</strong><br>Department: ${dept}`);
    await refreshUIDList();
  }

  async function revokeUID(uid) {
    const confirmed = await MODAL.confirm('Revoke ID', `Revoke ID ${uid}? This cannot be undone.`, { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('ID Revoked', `${uid} has been revoked.`);
    await refreshUIDList();
  }

  async function renderLecturers() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading lecturers...</div></div>';
    try {
      const lecturers = await DB.LEC.getAll();
      if (!lecturers.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No lecturers registered yet.</div></div>';
        return;
      }
      
      let html = `<div class="pg"><h2>👨‍🏫 Registered Lecturers</h2><div class="courses-list">`;
      for (const lec of lecturers) {
        html += `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(lec.name)}</div>
              <div class="course-status active">${UI.esc(lec.department || 'No department')}</div>
            </div>
            <div class="course-name">📧 ${UI.esc(lec.email)}</div>
            <div class="course-meta">🆔 Lecturer ID: ${UI.esc(lec.lecId || 'N/A')}</div>
          </div>
        `;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function renderSessions() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading sessions...</div></div>';
    try {
      const sessions = await DB.SESSION.getAll();
      if (!sessions.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No sessions found.</div></div>';
        return;
      }
      
      const sorted = sessions.sort((a,b) => new Date(b.date) - new Date(a.date));
      let html = `<div class="pg"><h2>📊 All Sessions</h2>`;
      
      for (const s of sorted.slice(0, 50)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `
          <div class="sess-card">
            <div class="sc-hdr">
              <div>
                <div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div>
                <div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)}</div>
              </div>
              <span class="pill ${s.active ? 'pill-teal' : 'pill-gray'}">${s.active ? 'Active' : 'Ended'}</span>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <p class="sub">Backup and export your data</p>
        <div class="inner-panel">
          <h3>Export Data</h3>
          <button class="btn btn-secondary" onclick="SADM.exportAllData()" style="margin-bottom:10px">📥 Export All Data (JSON)</button>
          <button class="btn btn-secondary" onclick="SADM.exportSessionsCSV()">📊 Export Sessions to CSV</button>
        </div>
      </div>
    `;
  }

  async function exportAllData() {
    try {
      const data = {
        sessions: await DB.SESSION.getAll(),
        lecturers: await DB.LEC.getAll(),
        students: await DB.STUDENTS.getAll(),
        courses: await DB.COURSE.getAll(),
        exportedAt: new Date().toISOString()
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ug_attendance_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await MODAL.success('Export Complete', 'Data has been exported.');
    } catch(err) {
      await MODAL.error('Export Failed', err.message);
    }
  }

  async function exportSessionsCSV() {
    try {
      const sessions = await DB.SESSION.getAll();
      const rows = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Students Present', 'Duration', 'Active']];
      for (const s of sessions) {
        const records = s.records ? Object.values(s.records).length : 0;
        rows.push([s.date, s.courseCode, s.courseName, s.lecturer, records, `${s.durationMins || 60} min`, s.active ? 'Yes' : 'No']);
      }
      UI.dlCSV(rows, `ug_sessions_${Date.now()}`);
      await MODAL.success('Export Complete', 'CSV file downloaded.');
    } catch(err) {
      await MODAL.error('Export Failed', err.message);
    }
  }

  async function renderCoAdmins() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading co-admins...</div></div>';
    try {
      const cas = await DB.CA.getAll();
      const pending = cas.filter(c => c.status === 'pending');
      const approved = cas.filter(c => c.status === 'approved');
      const revoked = cas.filter(c => c.status === 'revoked');
      
      let html = `<div class="pg"><h2>🤝 Co-Administrator Management</h2>`;
      
      if (pending.length) {
        html += `<div class="inner-panel"><h3>⏳ Pending Applications (${pending.length})</h3>`;
        for (const ca of pending) {
          html += `
            <div class="appr-item">
              <div class="appr-hdr">
                <div><strong>${UI.esc(ca.name)}</strong><br><span style="font-size:12px">${UI.esc(ca.email)}</span><br><span style="font-size:12px">${UI.esc(ca.department)}</span></div>
                <div class="appr-act">
                  <button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">✅ Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}')">❌ Reject</button>
                </div>
              </div>
            </div>
          `;
        }
        html += `</div>`;
      }
      
      if (approved.length) {
        html += `<div class="inner-panel"><h3>✅ Approved Co-Admins (${approved.length})</h3>`;
        for (const ca of approved) {
          html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)} - ${UI.esc(ca.department)}</div><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">Revoke Access</button></div>`;
        }
        html += `</div>`;
      }
      
      if (revoked.length) {
        html += `<div class="inner-panel"><h3>🚫 Revoked Co-Admins (${revoked.length})</h3>`;
        for (const ca of revoked) {
          html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)}</div></div>`;
        }
        html += `</div>`;
      }
      
      html += `</div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function approveCA(id) {
    await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() });
    await MODAL.success('Approved', 'Co-admin access granted.');
    renderCoAdmins();
  }

  async function rejectCA(id) {
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Rejected', 'Application rejected.');
    renderCoAdmins();
  }

  async function revokeCA(id) {
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Revoked', 'Co-admin access revoked.');
    renderCoAdmins();
  }

  async function renderSettings() {
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ System Settings</h2>
        <div class="inner-panel">
          <h3>System Information</h3>
          <p><strong>Version:</strong> 2.0.0</p>
          <p><strong>Firebase Status:</strong> ${window._db ? 'Connected ✅' : 'Demo Mode ⚠️'}</p>
          <p><strong>EmailJS Status:</strong> ${CONFIG.EMAILJS && !CONFIG.EMAILJS.PUBLIC_KEY.startsWith('YOUR_') ? 'Configured ✅' : 'Not Configured ⚠️'}</p>
        </div>
      </div>
    `;
  }

  async function renderCourses() {
    c().innerHTML = '<div class="pg"><h2>📚 All Courses</h2><div class="att-empty">Loading courses...</div></div>';
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'superAdmin');
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:32px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">📅 Academic Year ${year}</h3>`;
        const depts = Object.keys(grouped[year]).sort();
        for (const dept of depts) {
          html += `<div style="margin-left:20px; margin-bottom:20px;"><h4 style="color:var(--teal);">🏛️ Department: ${UI.esc(dept)}</h4>`;
          const semesters = Object.keys(grouped[year][dept]).sort((a,b) => a - b);
          for (const sem of semesters) {
            const semName = sem === '1' ? 'First Semester' : 'Second Semester';
            html += `<div style="margin-left:20px; margin-bottom:16px;"><h5 style="color:var(--amber);">📖 ${semName}</h5>`;
            const lecturers = Object.keys(grouped[year][dept][sem]).sort();
            for (const lecId of lecturers) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
              for (const course of lecGroup.courses) {
                html += `<span class="pill pill-blue" style="padding:4px 10px;">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.sessionCount} sessions)</span>`;
              }
              html += `</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      document.getElementById('sadm-content').innerHTML = `<div class="pg">${html || '<div class="no-rec">No courses found.</div>'}</div>`;
    } catch(err) {
      document.getElementById('sadm-content').innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function renderSecurity() {
    c().innerHTML = `
      <div class="pg">
        <h2>🔒 Security Dashboard</h2>
        <div class="inner-panel">
          <h3>System Security</h3>
          <p>Security features active:</p>
          <ul>
            <li>✅ Biometric authentication (WebAuthn)</li>
            <li>✅ Device fingerprinting</li>
            <li>✅ Location-based attendance</li>
            <li>✅ Session expiration</li>
          </ul>
        </div>
      </div>
    `;
  }

  return {
    tab,
    generateUID,
    revokeUID,
    approveCA,
    rejectCA,
    revokeCA,
    exportAllData,
    exportSessionsCSV
  };
})();

// ---------- CO-ADMIN ----------
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';

  function tab(name) {
    document.querySelectorAll('#view-cadmin .tab').forEach(t => t.classList.toggle('active', t.textContent.trim().toLowerCase().startsWith(name)));
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
    c().innerHTML = `
      <div class="pg">
        <h2>📋 Generate Lecturer IDs</h2>
        <p class="sub">Department: ${UI.esc(dept())}</p>
        <div class="inner-panel">
          <h3>Generate New ID</h3>
          <button class="btn btn-ug" onclick="CADM.generateUID()" style="width:auto; padding:8px 20px">➕ Generate ID for ${UI.esc(dept())}</button>
        </div>
        <div id="cadm-uids-list" class="inner-panel">
          <h3>Generated IDs</h3>
          <div class="att-empty">Loading...</div>
        </div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('cadm-uids-list');
    if (!container) return;
    
    try {
      const uids = await DB.UID.getAll();
      const myDept = dept();
      const myUIDs = uids.filter(u => u.department === myDept);
      const available = myUIDs.filter(u => u.status === 'available');
      const assigned = myUIDs.filter(u => u.status === 'assigned');
      
      let html = `
        <div style="margin-bottom:20px">
          <h4>✅ Available (${available.length})</h4>
          ${available.length ? available.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <code style="font-size:14px">${UI.esc(u.id)}</code>
              <button class="btn btn-teal btn-sm" onclick="CADM.sendUID('${u.id}')">📧 Send to Lecturer</button>
            </div>
          `).join('') : '<div class="no-rec">No available IDs</div>'}
        </div>
        <div>
          <h4>📋 Assigned (${assigned.length})</h4>
          ${assigned.length ? assigned.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <code style="font-size:14px">${UI.esc(u.id)}</code>
              <div style="font-size:11px; color:var(--text3)">Assigned to: ${UI.esc(u.assignedTo)}</div>
            </div>
          `).join('') : '<div class="no-rec">No assigned IDs</div>'}
        </div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function generateUID() {
    const uid = UI.makeLecUID();
    await DB.UID.set(uid, {
      id: uid,
      department: dept(),
      status: 'available',
      createdAt: Date.now(),
      createdBy: AUTH.getSession()?.id
    });
    await MODAL.success('ID Generated', `Unique ID: <strong>${uid}</strong>`);
    await refreshUIDList();
  }

  async function sendUID(uid) {
    const email = await MODAL.prompt('Send to Lecturer', 'Enter lecturer email address:', { placeholder: 'lecturer@ug.edu.gh' });
    if (!email) return;
    
    await MODAL.success('Email Sent', `UID ${uid} has been sent to ${email}`);
    await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
    await refreshUIDList();
  }

  async function renderLecturers() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading...</div></div>';
    try {
      const lecturers = await DB.LEC.getAll();
      const myDept = dept();
      const myLecturers = lecturers.filter(l => l.department === myDept);
      
      if (!myLecturers.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No lecturers in your department.</div></div>';
        return;
      }
      
      let html = `<div class="pg"><h2>👨‍🏫 Lecturers - ${UI.esc(myDept)}</h2><div class="courses-list">`;
      for (const lec of myLecturers) {
        html += `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(lec.name)}</div>
            </div>
            <div class="course-name">📧 ${UI.esc(lec.email)}</div>
            <div class="course-meta">🆔 ${UI.esc(lec.lecId || 'N/A')}</div>
          </div>
        `;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function renderSessions() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading...</div></div>';
    try {
      const sessions = await DB.SESSION.getAll();
      const myDept = dept();
      const deptSessions = sessions.filter(s => s.department === myDept);
      
      if (!deptSessions.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No sessions for your department.</div></div>';
        return;
      }
      
      let html = `<div class="pg"><h2>📊 Department Sessions - ${UI.esc(myDept)}</h2>`;
      for (const s of deptSessions.slice(0, 30)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `
          <div class="sess-card">
            <div class="sc-hdr">
              <div>
                <div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div>
                <div class="sc-meta">📅 ${s.date} · 👥 ${records} students</div>
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Export</h2>
        <div class="inner-panel">
          <button class="btn btn-secondary" onclick="CADM.exportDeptData()">📥 Export Department Data</button>
        </div>
      </div>
    `;
  }

  async function exportDeptData() {
    try {
      const myDept = dept();
      const sessions = await DB.SESSION.getAll();
      const deptSessions = sessions.filter(s => s.department === myDept);
      const data = {
        department: myDept,
        sessions: deptSessions,
        exportedAt: new Date().toISOString()
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${myDept}_data_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await MODAL.success('Export Complete', 'Department data exported.');
    } catch(err) {
      await MODAL.error('Export Failed', err.message);
    }
  }

  async function renderCourses() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading courses...</div></div>';
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'coAdmin', dept());
      let html = `<div class="pg"><h2>📚 Courses - ${UI.esc(dept())}</h2>`;
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:24px;"><h3 style="color:var(--ug);">📅 ${year}</h3>`;
        const semesters = Object.keys(grouped[year]).sort((a,b) => a - b);
        for (const sem of semesters) {
          const semName = sem === '1' ? 'First Semester' : 'Second Semester';
          html += `<div style="margin-left:20px;"><h4 style="color:var(--teal);">📖 ${semName}</h4>`;
          const lecturers = Object.keys(grouped[year][sem]).sort();
          for (const lecId of lecturers) {
            const lecGroup = grouped[year][sem][lecId];
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
            for (const course of lecGroup.courses) {
              html += `<span class="pill pill-blue">${UI.esc(course.courseCode)} (${course.sessionCount} sessions)</span>`;
            }
            html += `</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  return {
    tab,
    generateUID,
    sendUID,
    exportDeptData
  };
})();
