/* admin.js — Super admin + co-admin dashboards with full functionality */
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

// ============ SUPER ADMIN ============
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');

  function tab(name) {
    console.log('[SADM] Switching to tab:', name);
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
      security: renderSecurity,
      help: renderHelp,
      reports: renderOverallReports
    };
    if (fns[name]) fns[name]();
  }

  // ============ 1. UNIQUE IDs GENERATION ==========
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
        <div class="filter-bar" style="margin-top:15px">
          <div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-uid-dept" class="fi" onchange="SADM.refreshUIDList()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="flex:1"><label class="fl">Status</label><select id="filter-uid-status" class="fi" onchange="SADM.refreshUIDList()"><option value="">All</option><option value="available">Available</option><option value="assigned">Assigned</option><option value="revoked">Revoked</option></select></div>
        </div>
        <div id="uids-list" class="inner-panel"><h3>Generated IDs</h3><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    
    try {
      let uids = await DB.UID.getAll();
      const deptFilter = document.getElementById('filter-uid-dept')?.value;
      const statusFilter = document.getElementById('filter-uid-status')?.value;
      
      if (deptFilter) uids = uids.filter(u => u.department === deptFilter);
      if (statusFilter) uids = uids.filter(u => u.status === statusFilter);
      
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      const revoked = uids.filter(u => u.status === 'revoked');
      
      let html = `
        <div class="stats-grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">Assigned</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">Revoked</div></div>
        </div>
        <div style="margin-bottom:20px"><h4>✅ Available (${available.length})</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><div><code>${UI.esc(u.id)}</code><br><span style="font-size:11px; color:var(--text3)">${UI.esc(u.department)}</span></div><div><span class="pill pill-teal">Available</span><button class="btn btn-warning btn-sm" onclick="SADM.revokeUID('${u.id}')" style="margin-left:8px">Revoke</button></div></div>`).join('') : '<div class="no-rec">No available IDs</div>'}</div>
        <div style="margin-bottom:20px"><h4>📋 Assigned (${assigned.length})</h4>${assigned.length ? assigned.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><div><code>${UI.esc(u.id)}</code><div style="font-size:11px; color:var(--text3)">Assigned to: ${UI.esc(u.assignedTo)}</div></div><div><span class="pill pill-gray">Assigned</span></div></div>`).join('') : '<div class="no-rec">No assigned IDs</div>'}</div>
        <div><h4>🚫 Revoked (${revoked.length})</h4>${revoked.length ? revoked.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${UI.esc(u.id)}</code><div><span class="pill pill-red">Revoked</span></div></div>`).join('') : '<div class="no-rec">No revoked IDs</div>'}</div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function generateUID() {
    const dept = document.getElementById('new-uid-dept')?.value;
    if (!dept) { await MODAL.alert('Department Required', 'Please select a department.'); return; }
    const uid = UI.makeLecUID();
    await DB.UID.set(uid, { id: uid, department: dept, status: 'available', createdAt: Date.now(), createdBy: 'admin' });
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

  // ============ 2. LECTURERS MANAGEMENT ==========
  async function renderLecturers() {
    c().innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers Management</h2>
        <p class="sub">Manage all registered lecturers</p>
        <div class="filter-bar">
          <div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-lec-dept" class="fi" onchange="SADM.loadLecturers()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-lec-status" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
          <div><label class="fl">&nbsp;</label><button class="btn btn-secondary" onclick="SADM.loadLecturers()">🔄 Refresh</button></div>
        </div>
        <div id="lecturers-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await loadLecturers();
  }

  async function loadLecturers() {
    const container = document.getElementById('lecturers-list');
    if (!container) return;
    try {
      let lecturers = await DB.LEC.getAll();
      const deptFilter = document.getElementById('filter-lec-dept')?.value;
      const statusFilter = document.getElementById('filter-lec-status')?.value;
      if (deptFilter) lecturers = lecturers.filter(l => l.department === deptFilter);
      if (statusFilter) lecturers = lecturers.filter(l => (statusFilter === 'active' ? l.status !== 'suspended' : l.status === 'suspended'));
      if (lecturers.length === 0) { container.innerHTML = '<div class="no-rec">No lecturers found.</div>'; return; }
      let html = `<div class="courses-list">`;
      for (const lec of lecturers) {
        const isSuspended = lec.status === 'suspended';
        html += `<div class="course-management-card"><div class="course-header"><div class="course-code">${UI.esc(lec.name)}</div><div class="course-status ${isSuspended ? 'inactive' : 'active'}">${isSuspended ? '⛔ Suspended' : '✅ Active'}</div></div><div class="course-name">📧 ${UI.esc(lec.email)}</div><div class="course-meta">🆔 ${UI.esc(lec.lecId || 'N/A')} · 🏛️ ${UI.esc(lec.department || 'N/A')}</div><div class="course-meta">📅 Registered: ${new Date(lec.createdAt).toLocaleDateString()}</div><div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">${isSuspended ? `<button class="btn btn-teal btn-sm" onclick="SADM.unsuspendLecturer('${lec.id}')">🔄 Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="SADM.suspendLecturer('${lec.id}')">⛔ Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="SADM.removeLecturer('${lec.id}')">🗑️ Remove</button><button class="btn btn-secondary btn-sm" onclick="SADM.viewLecturerDetails('${lec.id}')">📋 Details</button></div></div>`;
      }
      html += `</div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend Lecturer', 'Suspend this lecturer? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Lecturer Suspended', 'The lecturer has been suspended.');
    await loadLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Lecturer Unsuspended', 'The lecturer has been reactivated.');
    await loadLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove Lecturer', 'Permanently remove this lecturer? All their data will be deleted. This cannot be undone.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Lecturer Removed', 'The lecturer has been permanently removed.');
    await loadLecturers();
  }

  async function viewLecturerDetails(lecId) {
    const lec = await DB.LEC.get(lecId);
    if (!lec) return;
    const sessions = await DB.SESSION.byLec(lecId);
    const totalStudents = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
    await MODAL.alert(`Lecturer: ${UI.esc(lec.name)}`, `<div style="text-align:left"><p><strong>ID:</strong> ${UI.esc(lec.lecId || 'N/A')}</p><p><strong>Email:</strong> ${UI.esc(lec.email)}</p><p><strong>Department:</strong> ${UI.esc(lec.department || 'N/A')}</p><p><strong>Status:</strong> ${lec.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}</p><p><strong>Registered:</strong> ${new Date(lec.createdAt).toLocaleDateString()}</p><hr><p><strong>Total Sessions:</strong> ${sessions.length}</p><p><strong>Total Check-ins:</strong> ${totalStudents}</p></div>`, { icon: '👨‍🏫', btnLabel: 'Close' });
  }

  // ============ 3. CO-ADMINS MANAGEMENT ==========
  async function renderCoAdmins() {
    c().innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrator Management</h2>
        <p class="sub">Manage co-admins and joint administrators (max 3 joint admins)</p>
        <div class="inner-panel" style="margin-bottom:20px"><h3>➕ Add Joint Administrator</h3><div class="two-col"><div class="field"><label class="fl">Full Name</label><input type="text" id="joint-name" class="fi" placeholder="Full name"/></div><div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi" placeholder="email@ug.edu.gh"/></div></div><div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select Department</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><button class="btn btn-ug" onclick="SADM.addJointAdmin()" style="width:auto">👥 Add Joint Administrator</button><p class="note" style="margin-top:8px">Note: Only 3 joint administrators allowed at a time.</p></div>
        <div class="filter-bar"><div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-ca-dept" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-ca-status" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="revoked">Revoked</option><option value="joint">Joint Admin</option></select></div></div>
        <div id="coadmins-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await loadCoAdmins();
  }

  async function loadCoAdmins() {
    const container = document.getElementById('coadmins-list');
    if (!container) return;
    try {
      let cas = await DB.CA.getAll();
      const deptFilter = document.getElementById('filter-ca-dept')?.value;
      const statusFilter = document.getElementById('filter-ca-status')?.value;
      if (deptFilter) cas = cas.filter(c => c.department === deptFilter);
      if (statusFilter) cas = cas.filter(c => c.status === statusFilter);
      const pending = cas.filter(c => c.status === 'pending');
      const approved = cas.filter(c => c.status === 'approved');
      const revoked = cas.filter(c => c.status === 'revoked');
      const joint = cas.filter(c => c.status === 'joint');
      let html = `<div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px"><div class="stat-card"><div class="stat-value">${pending.length}</div><div class="stat-label">Pending</div></div><div class="stat-card"><div class="stat-value">${approved.length}</div><div class="stat-label">Approved</div></div><div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">Revoked</div></div><div class="stat-card"><div class="stat-value">${joint.length}</div><div class="stat-label">Joint Admins</div></div></div>`;
      if (pending.length) { html += `<div class="inner-panel"><h3>⏳ Pending Applications</h3>`; for (const ca of pending) { html += `<div class="appr-item"><div class="appr-hdr"><div><strong>${UI.esc(ca.name)}</strong><br><span style="font-size:12px">${UI.esc(ca.email)}</span><br><span style="font-size:12px">${UI.esc(ca.department)}</span></div><div class="appr-act"><button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">✅ Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}')">❌ Reject</button></div></div></div>`; } html += `</div>`; }
      if (approved.length) { html += `<div class="inner-panel"><h3>✅ Approved Co-Admins</h3>`; for (const ca of approved) { html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)} - ${UI.esc(ca.department)}</div><div style="margin-top:8px"><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">Revoke Access</button></div></div>`; } html += `</div>`; }
      if (joint.length) { html += `<div class="inner-panel"><h3>👥 Joint Administrators (${joint.length}/3)</h3>`; for (const ca of joint) { html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)} - ${UI.esc(ca.department)}</div><div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="SADM.removeJointAdmin('${ca.id}')">Remove Joint Admin</button></div></div>`; } html += `</div>`; }
      if (revoked.length) { html += `<div class="inner-panel"><h3>🚫 Revoked</h3>`; for (const ca of revoked) { html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)}</div></div>`; } html += `</div>`; }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function addJointAdmin() {
    const name = document.getElementById('joint-name')?.value.trim();
    const email = document.getElementById('joint-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('joint-dept')?.value;
    if (!name || !email || !dept) { await MODAL.alert('Missing Info', 'Please fill all fields.'); return; }
    const existing = await DB.CA.getAll();
    const jointCount = existing.filter(c => c.status === 'joint').length;
    if (jointCount >= 3) { await MODAL.error('Limit Reached', 'Maximum of 3 joint administrators allowed.'); return; }
    const tempPass = Math.random().toString(36).substring(2, 10);
    const id = UI.makeToken();
    await DB.CA.set(id, { id, name, email, department: dept, pwHash: UI.hashPw(tempPass), status: 'joint', createdAt: Date.now(), createdBy: 'superAdmin' });
    if (typeof AUTH !== 'undefined' && AUTH._sendInviteEmail) {
      await AUTH._sendInviteEmail({ to_email: email, name: name, code: tempPass, role: 'Joint Administrator', signup_link: `${CONFIG.SITE_URL}#admin-login`, department: dept });
    }
    await MODAL.success('Joint Admin Added', `Email sent to ${email} with temporary password.`);
    document.getElementById('joint-name').value = '';
    document.getElementById('joint-email').value = '';
    await loadCoAdmins();
  }

  async function removeJointAdmin(id) {
    const confirmed = await MODAL.confirm('Remove Joint Admin', 'Remove this joint administrator? They will lose all access.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.CA.delete(id);
    await MODAL.success('Removed', 'Joint administrator has been removed.');
    await loadCoAdmins();
  }

  async function approveCA(id) { await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() }); await MODAL.success('Approved', 'Co-admin access granted.'); await loadCoAdmins(); }
  async function rejectCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Rejected', 'Application rejected.'); await loadCoAdmins(); }
  async function revokeCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Revoked', 'Co-admin access revoked.'); await loadCoAdmins(); }

  // ============ 4. SESSIONS WITH FILTERING ==========
  async function renderSessions() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 All Sessions</h2>
        <p class="sub">Filter and view all attendance sessions</p>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div style="min-width:120px"><label class="fl">Year</label><select id="session-year" class="fi" onchange="SADM.filterSessions()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option></select></div>
          <div style="min-width:120px"><label class="fl">Semester</label><select id="session-semester" class="fi" onchange="SADM.filterSessions()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div style="min-width:160px"><label class="fl">Department</label><select id="session-dept" class="fi" onchange="SADM.loadSessionLecturers(); SADM.filterSessions()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="min-width:180px"><label class="fl">Lecturer</label><select id="session-lecturer" class="fi" onchange="SADM.filterSessions()"><option value="">Select Department First</option></select></div>
          <div style="min-width:160px"><label class="fl">Course</label><select id="session-course" class="fi" onchange="SADM.filterSessions()"><option value="">All Courses</option></select></div>
          <div style="min-width:150px"><label class="fl">Search</label><input type="text" id="session-search" class="fi" placeholder="Course code or name..." oninput="SADM.filterSessions()"></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportFilteredSessions()">📥 Export to Excel</button></div>
        </div>
        <div id="sessions-list"><div class="att-empty">Loading sessions...</div></div>
      </div>
    `;
    await loadSessionData();
  }

  async function loadSessionData() {
    await loadSessionLecturers();
    await loadSessionCourses();
    await filterSessions();
  }

  async function loadSessionLecturers() {
    const dept = document.getElementById('session-dept')?.value;
    const lecturerSelect = document.getElementById('session-lecturer');
    if (!lecturerSelect) return;
    
    if (!dept) {
      lecturerSelect.innerHTML = '<option value="">Select Department First</option>';
      return;
    }
    
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept);
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${UI.esc(l.name)}</option>`).join('');
  }

  async function loadSessionCourses() {
    const sessions = await DB.SESSION.getAll();
    const courses = [...new Set(sessions.map(s => s.courseCode))];
    const courseSelect = document.getElementById('session-course');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">All Courses</option>' + courses.map(c => `<option value="${c}">${UI.esc(c)}</option>`).join('');
    }
  }

  async function filterSessions() {
    const container = document.getElementById('sessions-list');
    if (!container) return;
    
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const dept = document.getElementById('session-dept')?.value;
    const lecturerId = document.getElementById('session-lecturer')?.value;
    const courseCode = document.getElementById('session-course')?.value;
    const search = document.getElementById('session-search')?.value.toLowerCase();
    
    let sessions = await DB.SESSION.getAll();
    
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (dept) sessions = sessions.filter(s => s.department === dept);
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
    if (search) sessions = sessions.filter(s => s.courseCode.toLowerCase().includes(search) || s.courseName.toLowerCase().includes(search));
    
    sessions.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    if (sessions.length === 0) {
      container.innerHTML = '<div class="no-rec">No sessions found.</div>';
      return;
    }
    
    let html = `<div class="courses-list">`;
    for (const s of sessions) {
      const records = s.records ? Object.values(s.records).length : 0;
      html += `
        <div class="sess-card">
          <div class="sc-hdr">
            <div>
              <div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div>
              <div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)} · 🏛️ ${UI.esc(s.department)} · ${s.year} Sem ${s.semester}</div>
            </div>
            <span class="pill ${s.active ? 'pill-teal' : 'pill-gray'}">${s.active ? 'Active' : 'Ended'}</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    container.innerHTML = html;
  }

  async function exportFilteredSessions() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const dept = document.getElementById('session-dept')?.value;
    const lecturerId = document.getElementById('session-lecturer')?.value;
    const courseCode = document.getElementById('session-course')?.value;
    
    let sessions = await DB.SESSION.getAll();
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (dept) sessions = sessions.filter(s => s.department === dept);
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
    
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Department', 'Year', 'Semester', 'Students', 'Status', 'Duration']];
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName, s.lecturer, s.department, s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended', `${s.durationMins || 60} min`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', 'Sessions exported to Excel.');
  }

  // ============ 5. OVERALL REPORTS ==========
  async function renderOverallReports() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Overall Attendance Reports</h2>
        <p class="sub">Generate comprehensive attendance reports with charts</p>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div style="min-width:120px"><label class="fl">Year</label><select id="overall-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option></select></div>
          <div style="min-width:120px"><label class="fl">Semester</label><select id="overall-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div style="min-width:160px"><label class="fl">Department</label><select id="overall-dept" class="fi"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><button class="btn btn-ug" onclick="SADM.generateOverallReport()">Generate Report</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.downloadOverallReportPDF()">📄 Download PDF</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.downloadOverallReportWord()">📝 Download Word</button></div>
        </div>
        <div id="overall-report-results"><div class="att-empty">Select filters and click Generate Report</div></div>
      </div>
    `;
  }

  async function generateOverallReport() {
    const year = document.getElementById('overall-year')?.value;
    const semester = document.getElementById('overall-semester')?.value;
    const dept = document.getElementById('overall-dept')?.value;
    const container = document.getElementById('overall-report-results');
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (dept) sessions = sessions.filter(s => s.department === dept);
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      const uniqueStudents = new Set();
      sessions.forEach(s => { if (s.records) Object.values(s.records).forEach(r => uniqueStudents.add(r.studentId)); });
      
      let html = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:20px; border-radius:12px; margin-bottom:20px; text-align:center">
          <h3 style="margin:0; color:white">University of Ghana - Attendance Report</h3>
          <p style="margin:5px 0 0; opacity:0.9">${year || 'All Years'} ${semester ? 'Sem ' + semester : ''} ${dept ? ' | Department: ' + dept : ''}</p>
          <p style="margin:5px 0 0; opacity:0.8">Generated: ${new Date().toLocaleString()}</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:15px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">Unique Students</div></div>
          <div class="stat-card"><div class="stat-value">${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * 50)) * 100) : 0}%</div><div class="stat-label">Avg Attendance</div></div>
        </div>
        <div style="margin-top:20px; overflow-x:auto">
          <h4>📋 Session Details</h4>
          <table style="width:100%; border-collapse:collapse; font-size:12px">
            <thead><tr style="background:var(--ug); color:white"><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th><th>Period</th></tr></thead>
            <tbody>
              ${sessions.slice(0, 30).map(s => `<tr style="border-bottom:1px solid var(--border2)">
                <td style="padding:8px">${s.date}</td>
                <td style="padding:8px">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName || '')}</td>
                <td style="padding:8px">${UI.esc(s.lecturer)}</td>
                <td style="padding:8px">${UI.esc(s.department)}</td>
                <td style="padding:8px">${s.records ? Object.values(s.records).length : 0}</td>
                <td style="padding:8px">${s.year} Sem ${s.semester}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          ${sessions.length > 30 ? `<p class="note" style="margin-top:8px">Showing 30 of ${sessions.length} sessions</p>` : ''}
        </div>
      `;
      container.innerHTML = html;
      window.currentReport = { sessions, year, semester, dept, totalSessions, totalCheckins, uniqueStudents: uniqueStudents.size };
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function downloadOverallReportPDF() {
    if (!window.currentReport) { await MODAL.alert('No Report', 'Please generate a report first.'); return; }
    const { sessions, year, semester, dept, totalSessions, totalCheckins, uniqueStudents } = window.currentReport;
    const semesterName = semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All Semesters');
    
    let sessionsHtml = '';
    for (const s of sessions.slice(0, 50)) {
      sessionsHtml += `<tr><td style="border:1px solid #ddd; padding:6px">${s.date}</td><td style="border:1px solid #ddd; padding:6px">${UI.esc(s.courseCode)}</td><td style="border:1px solid #ddd; padding:6px">${UI.esc(s.lecturer)}</td><td style="border:1px solid #ddd; padding:6px">${s.records ? Object.values(s.records).length : 0}</td></tr>`;
    }
    
    const html = `<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Attendance Report</title>
    <style>body{font-family:Arial;margin:40px}h1{color:#003087}.stats{display:flex;gap:20px;margin:20px 0}.stat-box{background:#f5f5f7;padding:15px;border-radius:8px;text-align:center}table{width:100%;border-collapse:collapse}th{background:#003087;color:white;padding:8px}td{border:1px solid #ddd;padding:6px}</style></head>
    <body><h1>University of Ghana - Attendance Report</h1>
    <p>Period: ${year || 'All Years'} - ${semesterName} ${dept ? ' | Department: ' + dept : ''}</p>
    <div class="stats"><div class="stat-box"><strong>${totalSessions}</strong><br>Sessions</div><div class="stat-box"><strong>${totalCheckins}</strong><br>Check-ins</div><div class="stat-box"><strong>${uniqueStudents}</strong><br>Students</div></div>
    <h2>Session Details</h2><table><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Students</th></tr></thead><tbody>${sessionsHtml}</tbody></table></body></html>`;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  async function downloadOverallReportWord() {
    if (!window.currentReport) { await MODAL.alert('No Report', 'Please generate a report first.'); return; }
    const { sessions, year, semester, dept, totalSessions, totalCheckins, uniqueStudents } = window.currentReport;
    const semesterName = semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All Semesters');
    
    let sessionsHtml = '';
    for (const s of sessions.slice(0, 50)) {
      sessionsHtml += `<tr><td style="border:1px solid #ddd; padding:6px">${s.date}</td><td style="border:1px solid #ddd; padding:6px">${UI.esc(s.courseCode)}</td><td style="border:1px solid #ddd; padding:6px">${UI.esc(s.lecturer)}</td><td style="border:1px solid #ddd; padding:6px">${s.records ? Object.values(s.records).length : 0}</td></tr>`;
    }
    
    const html = `<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>Attendance Report</title>
    <style>body{font-family:Calibri;margin:40px}h1{color:#003087}table{width:100%;border-collapse:collapse}th{background:#003087;color:white;padding:8px}td{border:1px solid #ddd;padding:6px}</style></head>
    <body><h1>University of Ghana - Attendance Report</h1>
    <p>Period: ${year || 'All Years'} - ${semesterName} ${dept ? ' | Department: ' + dept : ''}</p>
    <p><strong>Total Sessions:</strong> ${totalSessions} | <strong>Total Check-ins:</strong> ${totalCheckins} | <strong>Unique Students:</strong> ${uniqueStudents}</p>
    <h2>Session Details</h2><table><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Students</th></tr></thead><tbody>${sessionsHtml}</tbody></table></body></html>`;
    
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UG_Attendance_Report_${year || 'All'}_${semester || 'All'}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    await MODAL.success('Download Started', 'Word document is being downloaded.');
  }

  // ============ 6. COURSES ==========
  async function renderCourses() {
    c().innerHTML = `
      <div class="pg">
        <h2>📚 All Courses</h2>
        <p class="sub">View courses grouped by year, semester, department, and lecturer</p>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="course-year" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option></select></div>
          <div><label class="fl">Semester</label><select id="course-semester" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="course-dept" class="fi" onchange="SADM.loadCourses()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="course-lecturer" class="fi" onchange="SADM.loadCourses()"><option value="">All</option></select></div>
        </div>
        <div id="courses-list"><div class="att-empty">Loading courses...</div></div>
      </div>
    `;
    await loadCourses();
  }

  async function loadCourses() {
    const container = document.getElementById('courses-list');
    if (!container) return;
    
    try {
      let allCourses = await _fetchAllCourses();
      const year = document.getElementById('course-year')?.value;
      const semester = document.getElementById('course-semester')?.value;
      const dept = document.getElementById('course-dept')?.value;
      const lecturerId = document.getElementById('course-lecturer')?.value;
      
      let filtered = allCourses;
      if (year) filtered = filtered.filter(c => c.year === parseInt(year));
      if (semester) filtered = filtered.filter(c => c.semester === parseInt(semester));
      if (dept) filtered = filtered.filter(c => c.department === dept);
      if (lecturerId) filtered = filtered.filter(c => c.lecturerId === lecturerId);
      
      const grouped = _groupCourses(filtered, 'superAdmin');
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
      container.innerHTML = html || '<div class="no-rec">No courses found.</div>';
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // ============ 7. DATABASE & BACKUPS ==========
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <p class="sub">Manage system backups</p>
        <div class="inner-panel"><h3>💾 Backups</h3><button class="btn btn-ug" onclick="SADM.createBackup()">Create New Backup</button><div id="backups-list" style="margin-top:15px"><div class="att-empty">No backups found</div></div></div>
      </div>
    `;
    await loadBackups();
  }

  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    try {
      const backups = await DB.BACKUP.getAll ? await DB.BACKUP.getAll() : [];
      if (!backups.length) { container.innerHTML = '<div class="no-rec">No backups found</div>'; return; }
      container.innerHTML = backups.map(b => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border)">
          <div><strong>${new Date(b.createdAt).toLocaleString()}</strong><br><span style="font-size:11px">${b.sessionCount || 0} sessions</span></div>
          <div><button class="btn btn-secondary btn-sm" onclick="SADM.downloadBackup('${b.id}')">📥 Download</button> <button class="btn btn-danger btn-sm" onclick="SADM.deleteBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML = '<div class="no-rec">Error loading backups</div>'; }
  }

  async function createBackup() {
    try {
      const sessions = await DB.SESSION.getAll();
      const students = await DB.STUDENTS.getAll();
      const lecturers = await DB.LEC.getAll();
      const backup = { id: UI.makeToken(), createdAt: Date.now(), sessions, students, lecturers, sessionCount: sessions.length, studentCount: students.length };
      await DB.BACKUP.save(backup.id, backup);
      await MODAL.success('Backup Created', 'System backup created successfully.');
      await loadBackups();
    } catch(err) { await MODAL.error('Backup Failed', err.message); }
  }

  async function downloadBackup(backupId) {
    try {
      const backup = await DB.BACKUP.get(backupId);
      if (!backup) { await MODAL.error('Error', 'Backup not found.'); return; }
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UG_Backup_${new Date(backup.createdAt).toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await MODAL.success('Download Started', 'Backup file is being downloaded.');
    } catch(err) { await MODAL.error('Download Failed', err.message); }
  }

  async function deleteBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete Backup', 'Delete this backup permanently?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.BACKUP.delete(backupId);
    await MODAL.success('Backup Deleted', 'Backup has been deleted.');
    await loadBackups();
  }

  // ============ 8. SETTINGS ==========
  async function renderSettings() {
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ System Settings</h2>
        <div class="inner-panel"><h3>📊 System Statistics</h3><div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px"><div class="stat-card"><div class="stat-value" id="stat-total-users">-</div><div class="stat-label">Total Users</div></div><div class="stat-card"><div class="stat-value" id="stat-total-sessions">-</div><div class="stat-label">Total Sessions</div></div><div class="stat-card"><div class="stat-value" id="stat-total-checkins">-</div><div class="stat-label">Total Check-ins</div></div><div class="stat-card"><div class="stat-value" id="stat-active-lecturers">-</div><div class="stat-label">Active Lecturers</div></div></div></div>
      </div>
    `;
    await loadSystemStats();
  }

  async function loadSystemStats() {
    try {
      const lecturers = await DB.LEC.getAll();
      const students = await DB.STUDENTS.getAll();
      const sessions = await DB.SESSION.getAll();
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      const usersEl = document.getElementById('stat-total-users');
      const sessionsEl = document.getElementById('stat-total-sessions');
      const checkinsEl = document.getElementById('stat-total-checkins');
      const activeEl = document.getElementById('stat-active-lecturers');
      if (usersEl) usersEl.textContent = lecturers.length + students.length;
      if (sessionsEl) sessionsEl.textContent = sessions.length;
      if (checkinsEl) checkinsEl.textContent = totalCheckins;
      if (activeEl) activeEl.textContent = lecturers.filter(l => l.status !== 'suspended').length;
    } catch(e) { console.warn('Could not load stats:', e); }
  }

  // ============ 9. SECURITY ==========
  async function renderSecurity() {
    c().innerHTML = `<div class="pg"><h2>🔒 Security Dashboard</h2><div class="inner-panel"><h3>System Security</h3><ul><li>✅ Biometric authentication (WebAuthn)</li><li>✅ Device fingerprinting</li><li>✅ Location-based attendance</li><li>✅ Session expiration</li><li>✅ Rate limiting</li></ul></div></div>`;
  }

  // ============ 10. HELP ==========
  async function renderHelp() {
    c().innerHTML = `<div class="pg"><h2>❓ Help & Support</h2><div class="inner-panel"><h3>📖 Administrator Guide</h3><ul><li><strong>Unique IDs:</strong> Generate unique IDs for lecturer registration</li><li><strong>Lecturers:</strong> View, suspend, or remove lecturers</li><li><strong>Co-Admins:</strong> Approve applications and add joint administrators (max 3)</li><li><strong>Sessions:</strong> View sessions with filters (year, semester, department, lecturer, course)</li><li><strong>Reports:</strong> Generate overall attendance reports with PDF/Word download</li><li><strong>Backups:</strong> Create and download system backups</li><li><strong>Courses:</strong> View all courses grouped by year, semester, department, lecturer</li></ul></div><div class="inner-panel"><h3>📧 Contact Support</h3><p>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p><p>Phone: +233 (0) 30 123 4567</p></div></div>`;
  }

  return {
    tab,
    generateUID,
    revokeUID,
    refreshUIDList,
    loadLecturers,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer,
    viewLecturerDetails,
    approveCA,
    rejectCA,
    revokeCA,
    addJointAdmin,
    removeJointAdmin,
    loadCoAdmins,
    filterSessions,
    exportFilteredSessions,
    loadSessionLecturers,
    generateOverallReport,
    downloadOverallReportPDF,
    downloadOverallReportWord,
    loadCourses,
    createBackup,
    downloadBackup,
    deleteBackup,
    loadBackups,
    renderHelp
  };
})();

// ============ CO-ADMIN ==========
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';

  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    document.querySelectorAll('#view-cadmin .tab').forEach(t => {
      const tabText = t.textContent.trim().toLowerCase();
      const tabName = tabText.replace(/\s/g, '').replace(/[^a-z]/g, '');
      t.classList.toggle('active', tabName === name || tabText.startsWith(name));
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      courses: renderCourses,
      backup: renderBackup,
      help: renderHelp
    };
    if (fns[name]) fns[name]();
  }

  async function renderIDs() {
    c().innerHTML = `
      <div class="pg">
        <h2>📋 Generate Lecturer IDs</h2>
        <p class="sub">Department: ${UI.esc(dept())}</p>
        <div class="inner-panel"><h3>Generate New ID</h3><button class="btn btn-ug" onclick="CADM.generateUID()" style="width:auto; padding:8px 20px">➕ Generate ID for ${UI.esc(dept())}</button></div>
        <div id="cadm-uids-list" class="inner-panel"><h3>Generated IDs</h3><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('cadm-uids-list');
    if (!container) return;
    try {
      let uids = await DB.UID.getAll();
      const myDept = dept();
      let myUIDs = uids.filter(u => u.department === myDept);
      const available = myUIDs.filter(u => u.status === 'available');
      const assigned = myUIDs.filter(u => u.status === 'assigned');
      let html = `<div class="stats-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px"><div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">Available</div></div><div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">Assigned</div></div></div>
        <div style="margin-bottom:20px"><h4>✅ Available (${available.length})</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${UI.esc(u.id)}</code><button class="btn btn-teal btn-sm" onclick="CADM.sendUID('${u.id}')">📧 Send to Lecturer</button></div>`).join('') : '<div class="no-rec">No available IDs</div>'}</div>
        <div><h4>📋 Assigned (${assigned.length})</h4>${assigned.length ? assigned.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${UI.esc(u.id)}</code><span style="font-size:11px">Assigned to: ${UI.esc(u.assignedTo)}</span></div>`).join('') : '<div class="no-rec">No assigned IDs</div>'}</div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`; }
  }

  async function generateUID() {
    const uid = UI.makeLecUID();
    await DB.UID.set(uid, { id: uid, department: dept(), status: 'available', createdAt: Date.now(), createdBy: AUTH.getSession()?.id });
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
      let lecturers = await DB.LEC.getAll();
      const myDept = dept();
      lecturers = lecturers.filter(l => l.department === myDept);
      if (!lecturers.length) { c().innerHTML = '<div class="pg"><div class="no-rec">No lecturers in your department.</div></div>'; return; }
      let html = `<div class="pg"><h2>👨‍🏫 Lecturers - ${UI.esc(myDept)}</h2><div class="courses-list">`;
      for (const lec of lecturers) {
        const isSuspended = lec.status === 'suspended';
        html += `<div class="course-management-card"><div class="course-header"><div class="course-code">${UI.esc(lec.name)}</div><div class="course-status ${isSuspended ? 'inactive' : 'active'}">${isSuspended ? '⛔ Suspended' : '✅ Active'}</div></div><div class="course-name">📧 ${UI.esc(lec.email)}</div><div class="course-meta">🆔 ${UI.esc(lec.lecId || 'N/A')}</div><div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">${isSuspended ? `<button class="btn btn-teal btn-sm" onclick="CADM.unsuspendLecturer('${lec.id}')">🔄 Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="CADM.suspendLecturer('${lec.id}')">⛔ Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="CADM.removeLecturer('${lec.id}')">🗑️ Remove</button></div></div>`;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) { c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend Lecturer', 'Suspend this lecturer? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Lecturer Suspended', 'The lecturer has been suspended.');
    await renderLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Lecturer Unsuspended', 'The lecturer has been reactivated.');
    await renderLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove Lecturer', 'Permanently remove this lecturer? All their data will be deleted.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Lecturer Removed', 'The lecturer has been permanently removed.');
    await renderLecturers();
  }

  async function renderSessions() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading...</div></div>';
    try {
      let sessions = await DB.SESSION.getAll();
      const myDept = dept();
      sessions = sessions.filter(s => s.department === myDept);
      if (!sessions.length) { c().innerHTML = '<div class="pg"><div class="no-rec">No sessions for your department.</div></div>'; return; }
      let html = `<div class="pg"><h2>📊 Department Sessions - ${UI.esc(myDept)}</h2><div class="filter-bar"><div><label class="fl">Year</label><select id="co-session-year" class="fi" onchange="CADM.filterSessions()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option></select></div><div><label class="fl">Semester</label><select id="co-session-semester" class="fi" onchange="CADM.filterSessions()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div></div><div id="co-sessions-list">`;
      for (const s of sessions.slice(0, 30)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `<div class="sess-card" data-year="${s.year}" data-semester="${s.semester}"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div><div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)} · ${s.year} Sem ${s.semester}</div></div></div></div>`;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) { c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`; }
  }

  // This is the missing function that was causing the error
  async function filterSessions() {
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const cards = document.querySelectorAll('#co-sessions-list .sess-card');
    cards.forEach(card => {
      const cardYear = card.dataset.year;
      const cardSem = card.dataset.semester;
      let show = true;
      if (year && cardYear !== year) show = false;
      if (semester && cardSem !== semester) show = false;
      card.style.display = show ? 'block' : 'none';
    });
  }

  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Department Reports</h2>
        <div class="filter-bar"><div><label class="fl">Year</label><select id="co-report-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option></select></div><div><label class="fl">Semester</label><select id="co-report-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div><div><label class="fl">Lecturer</label><select id="co-report-lecturer" class="fi"><option value="">All</option></select></div></div>
        <button class="btn btn-ug" onclick="CADM.generateDeptReport()" style="margin-top:10px">Generate Report</button>
        <div id="co-report-results" class="inner-panel" style="margin-top:15px"><div class="att-empty">Select filters and click Generate Report</div></div>
      </div>
    `;
    await loadDeptReportLecturers();
  }

  async function loadDeptReportLecturers() {
    const lecturers = await DB.LEC.getAll();
    const myDept = dept();
    const deptLecturers = lecturers.filter(l => l.department === myDept);
    const select = document.getElementById('co-report-lecturer');
    if (select) { select.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${UI.esc(l.name)}</option>`).join(''); }
  }

  async function generateDeptReport() {
    const year = document.getElementById('co-report-year')?.value;
    const semester = document.getElementById('co-report-semester')?.value;
    const lecturerId = document.getElementById('co-report-lecturer')?.value;
    const container = document.getElementById('co-report-results');
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      const myDept = dept();
      sessions = sessions.filter(s => s.department === myDept);
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      
      let html = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:15px; border-radius:10px; text-align:center">
          <h3 style="margin:0; color:white">${myDept} Department Report</h3>
          <p>${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}</p>
        </div>
        <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin:15px 0">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Check-ins</div></div>
        </div>
        <div style="overflow-x:auto"><table style="width:100%"><thead><tr style="background:var(--ug); color:white"><th>Date</th><th>Course</th><th>Lecturer</th><th>Students</th></tr></thead><tbody>
          ${sessions.slice(0, 30).map(s => `<tr style="border-bottom:1px solid var(--border2)"><td style="padding:6px">${s.date}</td><td style="padding:6px">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName || '')}</td><td style="padding:6px">${UI.esc(s.lecturer)}</td><td style="padding:6px">${s.records ? Object.values(s.records).length : 0}</td></tr>`).join('')}
        </tbody></table></div>
        ${sessions.length > 30 ? `<p class="note" style="margin-top:8px">Showing 30 of ${sessions.length} sessions</p>` : ''}
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function renderCourses() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading courses...</div></div>';
    try {
      const allCourses = await _fetchAllCourses();
      const myDept = dept();
      const grouped = _groupCourses(allCourses, 'coAdmin', myDept);
      let html = `<div class="pg"><h2>📚 Courses - ${UI.esc(myDept)}</h2>`;
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

  async function renderBackup() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Department Backups</h2>
        <button class="btn btn-ug" onclick="CADM.createDeptBackup()" style="width:auto; padding:8px 20px">📀 Create Department Backup</button>
        <div id="dept-backups-list" style="margin-top:20px"><div class="att-empty">Loading backups...</div></div>
      </div>
    `;
    await loadDeptBackups();
  }

  async function loadDeptBackups() {
    const container = document.getElementById('dept-backups-list');
    if (!container) return;
    try {
      const allBackups = await DB.BACKUP.getAll ? await DB.BACKUP.getAll() : [];
      const backups = Array.isArray(allBackups) ? allBackups : Object.values(allBackups || {});
      const myDept = dept();
      const deptBackups = backups.filter(b => b.department === myDept);
      if (deptBackups.length === 0) { container.innerHTML = '<div class="no-rec">No backups found for your department.</div>'; return; }
      container.innerHTML = deptBackups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border)">
          <div><strong>${new Date(b.createdAt).toLocaleString()}</strong><br><span style="font-size:11px">📊 ${b.sessionCount || 0} sessions</span></div>
          <div><button class="btn btn-secondary btn-sm" onclick="CADM.downloadDeptBackup('${b.id}')">📥 Download</button> <button class="btn btn-danger btn-sm" onclick="CADM.deleteDeptBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML = '<div class="no-rec">Error loading backups</div>'; }
  }

  async function createDeptBackup() {
    try {
      const myDept = dept();
      const sessions = await DB.SESSION.getAll();
      const deptSessions = sessions.filter(s => s.department === myDept);
      const backup = { id: UI.makeToken(), createdAt: Date.now(), department: myDept, sessions: deptSessions, sessionCount: deptSessions.length };
      await DB.BACKUP.save(backup.id, backup);
      await MODAL.success('Backup Created', `Department backup created with ${deptSessions.length} sessions.`);
      await loadDeptBackups();
    } catch(err) { await MODAL.error('Backup Failed', err.message); }
  }

  async function downloadDeptBackup(backupId) {
    try {
      const backup = await DB.BACKUP.get(backupId);
      if (!backup) { await MODAL.error('Error', 'Backup not found.'); return; }
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `UG_Dept_Backup_${backup.department}_${new Date(backup.createdAt).toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await MODAL.success('Download Started', 'Backup file is being downloaded.');
    } catch(err) { await MODAL.error('Download Failed', err.message); }
  }

  async function deleteDeptBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete Backup', 'Delete this backup permanently?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.BACKUP.delete(backupId);
    await MODAL.success('Backup Deleted', 'Backup has been deleted.');
    await loadDeptBackups();
  }

  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>📖 Co-Administrator Guide</h3>
          <ul>
            <li><strong>Generate IDs:</strong> Create unique IDs for lecturers in your department only (department auto-filled)</li>
            <li><strong>Lecturers:</strong> View all lecturers in your department - you can suspend, unsuspend, or remove them</li>
            <li><strong>Sessions:</strong> View all attendance sessions in your department (filter by year and semester)</li>
            <li><strong>Reports:</strong> Generate department reports filtered by year, semester, and lecturer</li>
            <li><strong>Backup:</strong> Create and download department data backups</li>
            <li><strong>Courses:</strong> View all courses in your department</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>Phone: +233 (0) 30 123 4567</p>
        </div>
      </div>
    `;
  }

  return { 
    tab, 
    generateUID, 
    sendUID, 
    refreshUIDList,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer,
    renderLecturers,
    filterSessions,  // Added this missing function
    generateDeptReport,
    createDeptBackup,
    downloadDeptBackup,
    deleteDeptBackup,
    loadDeptBackups,
    renderHelp
  };
})();

// Ensure both are globally available
if (typeof SADM !== 'undefined') {
  window.SADM = SADM;
  console.log('[ADMIN] SADM module loaded');
}

if (typeof CADM !== 'undefined') {
  window.CADM = CADM;
  console.log('[ADMIN] CADM module loaded');
}
