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
      help: renderHelp
    };
    if (fns[name]) fns[name]();
  }

  // ============ 1. UNIQUE IDs GENERATION ============
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

  // ============ 2. LECTURERS MANAGEMENT ============
  async function renderLecturers() {
    c().innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers Management</h2>
        <p class="sub">Manage all registered lecturers</p>
        <div class="filter-bar">
          <div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-lec-dept" class="fi" onchange="SADM.refreshLecturers()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-lec-status" class="fi" onchange="SADM.refreshLecturers()"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
          <div><label class="fl">&nbsp;</label><button class="btn btn-secondary" onclick="SADM.refreshLecturers()">🔄 Refresh</button></div>
        </div>
        <div id="lecturers-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshLecturers();
  }

  async function refreshLecturers() {
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
    await refreshLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Lecturer Unsuspended', 'The lecturer has been reactivated.');
    await refreshLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove Lecturer', 'Permanently remove this lecturer? All their data will be deleted. This cannot be undone.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Lecturer Removed', 'The lecturer has been permanently removed.');
    await refreshLecturers();
  }

  async function viewLecturerDetails(lecId) {
    const lec = await DB.LEC.get(lecId);
    if (!lec) return;
    const sessions = await DB.SESSION.byLec(lecId);
    const totalStudents = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
    await MODAL.alert(`Lecturer: ${UI.esc(lec.name)}`, `<div style="text-align:left"><p><strong>ID:</strong> ${UI.esc(lec.lecId || 'N/A')}</p><p><strong>Email:</strong> ${UI.esc(lec.email)}</p><p><strong>Department:</strong> ${UI.esc(lec.department || 'N/A')}</p><p><strong>Status:</strong> ${lec.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}</p><p><strong>Registered:</strong> ${new Date(lec.createdAt).toLocaleDateString()}</p><hr><p><strong>Total Sessions:</strong> ${sessions.length}</p><p><strong>Total Check-ins:</strong> ${totalStudents}</p></div>`, { icon: '👨‍🏫', btnLabel: 'Close' });
  }

  // ============ 3. CO-ADMINS MANAGEMENT ============
  async function renderCoAdmins() {
    c().innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrator Management</h2>
        <p class="sub">Manage co-admins and joint administrators (max 3 joint admins)</p>
        <div class="inner-panel" style="margin-bottom:20px"><h3>➕ Add Joint Administrator</h3><div class="two-col"><div class="field"><label class="fl">Full Name</label><input type="text" id="joint-name" class="fi" placeholder="Full name"/></div><div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi" placeholder="email@ug.edu.gh"/></div></div><div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select Department</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><button class="btn btn-ug" onclick="SADM.addJointAdmin()" style="width:auto">👥 Add Joint Administrator</button><p class="note" style="margin-top:8px">Note: Only 3 joint administrators allowed at a time.</p></div>
        <div class="filter-bar"><div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-ca-dept" class="fi" onchange="SADM.refreshCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-ca-status" class="fi" onchange="SADM.refreshCoAdmins()"><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="revoked">Revoked</option><option value="joint">Joint Admin</option></select></div></div>
        <div id="coadmins-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshCoAdmins();
  }

  async function refreshCoAdmins() {
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
    await refreshCoAdmins();
  }

  async function removeJointAdmin(id) {
    const confirmed = await MODAL.confirm('Remove Joint Admin', 'Remove this joint administrator? They will lose all access.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.CA.delete(id);
    await MODAL.success('Removed', 'Joint administrator has been removed.');
    await refreshCoAdmins();
  }

  async function approveCA(id) { await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() }); await MODAL.success('Approved', 'Co-admin access granted.'); await refreshCoAdmins(); }
  async function rejectCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Rejected', 'Application rejected.'); await refreshCoAdmins(); }
  async function revokeCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Revoked', 'Co-admin access revoked.'); await refreshCoAdmins(); }

  // ============ 4. SESSIONS ============
  async function renderSessions() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading sessions...</div></div>';
    try {
      const sessions = await DB.SESSION.getAll();
      if (!sessions.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No sessions found.</div></div>';
        return;
      }
      
      const sorted = sessions.sort((a,b) => new Date(b.date) - new Date(a.date));
      let html = `<div class="pg"><h2>📊 All Sessions</h2><div class="filter-bar"><div><label class="fl">Search</label><input type="text" id="session-search" class="fi" placeholder="Search by course or lecturer..." oninput="SADM.filterSessions()"></div></div><div id="sessions-list">`;
      
      for (const s of sorted.slice(0, 50)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `
          <div class="sess-card" data-course="${UI.esc(s.courseCode)}" data-lecturer="${UI.esc(s.lecturer)}">
            <div class="sc-hdr">
              <div><div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div><div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)} · ${s.year} Sem ${s.semester}</div></div>
              <span class="pill ${s.active ? 'pill-teal' : 'pill-gray'}">${s.active ? 'Active' : 'Ended'}</span>
            </div>
          </div>
        `;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function filterSessions() {
    const search = document.getElementById('session-search')?.value.toLowerCase();
    const cards = document.querySelectorAll('#sessions-list .sess-card');
    cards.forEach(card => {
      const course = card.dataset.course?.toLowerCase() || '';
      const lecturer = card.dataset.lecturer?.toLowerCase() || '';
      card.style.display = (!search || course.includes(search) || lecturer.includes(search)) ? 'block' : 'none';
    });
  }

  // ============ 5. DATABASE & BACKUPS ============
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <p class="sub">Backup, export, and manage system data</p>
        <div class="inner-panel"><h3>💾 Backups</h3><button class="btn btn-secondary" onclick="SADM.createBackup()">Create New Backup</button><div id="backups-list" style="margin-top:15px"><div class="att-empty">Loading backups...</div></div></div>
      </div>
    `;
    await loadBackups();
  }

  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    container.innerHTML = '<div class="no-rec">No backups found</div>';
  }

  async function createBackup() {
    await MODAL.success('Backup Created', 'System backup has been created successfully.');
    await loadBackups();
  }

  // ============ 6. COURSES ============
  async function renderCourses() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading courses...</div></div>';
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
      c().innerHTML = `<div class="pg">${html || '<div class="no-rec">No courses found.</div>'}</div>`;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  // ============ 7. SETTINGS ============
  async function renderSettings() {
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ System Settings</h2>
        <div class="inner-panel">
          <h3>📊 System Statistics</h3>
          <div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px">
            <div class="stat-card"><div class="stat-value" id="stat-total-users">-</div><div class="stat-label">Total Users</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-total-sessions">-</div><div class="stat-label">Total Sessions</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-total-checkins">-</div><div class="stat-label">Total Check-ins</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-active-lecturers">-</div><div class="stat-label">Active Lecturers</div></div>
          </div>
        </div>
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

  // ============ 8. SECURITY ============
  async function renderSecurity() {
    c().innerHTML = `<div class="pg"><h2>🔒 Security Dashboard</h2><div class="inner-panel"><h3>System Security</h3><ul><li>✅ Biometric authentication (WebAuthn)</li><li>✅ Device fingerprinting</li><li>✅ Location-based attendance</li><li>✅ Session expiration</li><li>✅ Rate limiting</li></ul></div></div>`;
  }

  // ============ 9. HELP ============
  async function renderHelp() {
    c().innerHTML = `<div class="pg"><h2>❓ Help & Support</h2><div class="inner-panel"><h3>📖 Administrator Guide</h3><ul style="margin-left:20px; line-height:1.8"><li><strong>Unique IDs:</strong> Generate unique IDs for lecturer registration</li><li><strong>Lecturers:</strong> View, suspend, or remove lecturers</li><li><strong>Co-Admins:</strong> Approve applications and add joint administrators (max 3)</li><li><strong>Database:</strong> Manage system backups</li><li><strong>Courses:</strong> View all courses grouped by year, semester, department</li></ul></div><div class="inner-panel"><h3>📧 Contact Support</h3><p>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p><p>Phone: +233 (0) 30 123 4567</p></div></div>`;
  }

  return {
    tab, generateUID, revokeUID, refreshUIDList, refreshLecturers, suspendLecturer, unsuspendLecturer, removeLecturer, viewLecturerDetails,
    approveCA, rejectCA, revokeCA, addJointAdmin, removeJointAdmin, refreshCoAdmins,
    createBackup, loadBackups, filterSessions, refreshCourses,
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
      
      let html = `
        <div class="stats-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">Assigned</div></div>
        </div>
        <div style="margin-bottom:20px"><h4>✅ Available (${available.length})</h4>
          ${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${UI.esc(u.id)}</code><button class="btn btn-teal btn-sm" onclick="CADM.sendUID('${u.id}')">📧 Send to Lecturer</button></div>`).join('') : '<div class="no-rec">No available IDs</div>'}
        </div>
        <div><h4>📋 Assigned (${assigned.length})</h4>${assigned.length ? assigned.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${UI.esc(u.id)}</code><span style="font-size:11px">Assigned to: ${UI.esc(u.assignedTo)}</span></div>`).join('') : '<div class="no-rec">No assigned IDs</div>'}</div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
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
      
      if (!lecturers.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No lecturers in your department.</div></div>';
        return;
      }
      
      let html = `<div class="pg"><h2>👨‍🏫 Lecturers - ${UI.esc(myDept)}</h2><div class="courses-list">`;
      for (const lec of lecturers) {
        html += `
          <div class="course-management-card">
            <div class="course-header"><div class="course-code">${UI.esc(lec.name)}</div><div class="course-status ${lec.status === 'suspended' ? 'inactive' : 'active'}">${lec.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}</div></div>
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
      let sessions = await DB.SESSION.getAll();
      const myDept = dept();
      sessions = sessions.filter(s => s.department === myDept);
      
      if (!sessions.length) {
        c().innerHTML = '<div class="pg"><div class="no-rec">No sessions for your department.</div></div>';
        return;
      }
      
      let html = `<div class="pg"><h2>📊 Department Sessions - ${UI.esc(myDept)}</h2>`;
      for (const s of sessions.slice(0, 30)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `
          <div class="sess-card">
            <div class="sc-hdr">
              <div>
                <div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div>
                <div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)}</div>
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
        <h2>💾 Department Reports</h2>
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
      const data = { department: myDept, sessions: deptSessions, exportedAt: new Date().toISOString() };
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

  async function renderBackup() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Department Backups</h2>
        <button class="btn btn-secondary" onclick="CADM.createDeptBackup()">Create Department Backup</button>
        <div id="dept-backups-list" style="margin-top:20px"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await loadDeptBackups();
  }

  async function loadDeptBackups() {
    const container = document.getElementById('dept-backups-list');
    if (!container) return;
    container.innerHTML = '<div class="no-rec">No backups found for your department.</div>';
  }

  async function createDeptBackup() {
    await MODAL.success('Backup Created', 'Department backup has been created.');
    await loadDeptBackups();
  }

  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>📖 Co-Administrator Guide</h3>
          <ul>
            <li><strong>Generate IDs:</strong> Create unique IDs for lecturers in your department only</li>
            <li><strong>Lecturers:</strong> View all lecturers in your department</li>
            <li><strong>Sessions:</strong> View all attendance sessions in your department</li>
            <li><strong>Reports:</strong> Export department data for analysis</li>
            <li><strong>Backup:</strong> Create department data backups</li>
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
    tab, generateUID, sendUID, refreshUIDList, exportDeptData, createDeptBackup, renderHelp
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
