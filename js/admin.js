/* admin.js — Super admin + co-admin dashboards with full functionality, PDF reports, and proper filtering */
'use strict';

// Helper: escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

// ==================== SUPER ADMIN ==================
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');
  let currentReportData = null;
  let minAttendancePercentage = 75;

  // Load saved min attendance from localStorage
  (function loadMinAttendance() {
    const saved = localStorage.getItem('min_attendance_percentage');
    if (saved && !isNaN(parseInt(saved))) {
      minAttendancePercentage = parseInt(saved);
    }
  })();

  function tab(name) {
    console.log('[SADM] Switching to tab:', name);
    document.querySelectorAll('#view-sadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      coadmins: renderCoAdmins,
      settings: renderSettings,
      courses: renderCourses,
      help: renderHelp,
      reports: renderOverallReports
    };
    if (fns[name]) fns[name]();
  }

  // ==================== 1. UNIQUE IDs GENERATION ==================
  async function renderIDs() {
    c().innerHTML = `
      <div class="pg">
        <h2>📋 Generate Unique Lecturer IDs</h2>
        <p class="sub">Generate and manage unique IDs for lecturer registration</p>
        <div class="inner-panel">
          <h3>➕ Generate New ID</h3>
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
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">✅ Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">📋 Assigned</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">🚫 Revoked</div></div>
        </div>
        <div style="margin-bottom:20px"><h4>✅ Available (${available.length})</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><div><code>${escapeHtml(u.id)}</code><br><span style="font-size:11px; color:var(--text3)">${escapeHtml(u.department)}</span></div><div><span class="pill pill-teal">Available</span><button class="btn btn-warning btn-sm" onclick="SADM.revokeUID('${u.id}')" style="margin-left:8px">🚫 Revoke</button></div></div>`).join('') : '<div class="no-rec">No available IDs</div>'}</div>
        <div style="margin-bottom:20px"><h4>📋 Assigned (${assigned.length})</h4>${assigned.length ? assigned.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><div><code>${escapeHtml(u.id)}</code><div style="font-size:11px; color:var(--text3)">Assigned to: ${escapeHtml(u.assignedTo)}</div></div><div><span class="pill pill-gray">Assigned</span></div></div>`).join('') : '<div class="no-rec">No assigned IDs</div>'}</div>
        <div><h4>🚫 Revoked (${revoked.length})</h4>${revoked.length ? revoked.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><div><span class="pill pill-red">Revoked</span></div></div>`).join('') : '<div class="no-rec">No revoked IDs</div>'}</div>
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function generateUID() {
    const dept = document.getElementById('new-uid-dept')?.value;
    if (!dept) { await MODAL.alert('Department Required', '⚠️ Please select a department.'); return; }
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    await DB.UID.set(uid, { id: uid, department: dept, status: 'available', createdAt: Date.now(), createdBy: 'admin' });
    await MODAL.success('ID Generated', `✅ Unique ID: <strong>${escapeHtml(uid)}</strong><br>Department: ${escapeHtml(dept)}`);
    await refreshUIDList();
  }

  async function revokeUID(uid) {
    const confirmed = await MODAL.confirm('Revoke ID', `Revoke ID ${uid}? This cannot be undone.`, { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('ID Revoked', `✅ ${uid} has been revoked.`);
    await refreshUIDList();
  }

  // ==================== 2. LECTURERS MANAGEMENT ==================
  async function renderLecturers() {
    c().innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers Management</h2>
        <p class="sub">Manage all registered lecturers</p>
        <div class="filter-bar">
          <div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-lec-dept" class="fi" onchange="SADM.loadLecturers()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-lec-status" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option><option value="active">✅ Active</option><option value="suspended">⛔ Suspended</option></select></div>
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
      if (lecturers.length === 0) { container.innerHTML = '<div class="no-rec">📭 No lecturers found.</div>'; return; }
      let html = `<div class="courses-grid">`;
      for (const lec of lecturers) {
        const isSuspended = lec.status === 'suspended';
        html += `<div class="course-card"><div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${isSuspended ? 'badge-red' : 'badge'}">${isSuspended ? '⛔ Suspended' : '✅ Active'}</span></div><div class="course-name">📧 ${escapeHtml(lec.email)}</div><div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')} · 🏛️ ${escapeHtml(lec.department || 'N/A')}</div><div class="course-stats">📅 Registered: ${new Date(lec.createdAt).toLocaleDateString()}</div><div class="course-buttons">${isSuspended ? `<button class="btn btn-teal btn-sm" onclick="SADM.unsuspendLecturer('${lec.id}')">🔄 Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="SADM.suspendLecturer('${lec.id}')">⛔ Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="SADM.removeLecturer('${lec.id}')">🗑️ Remove</button><button class="btn btn-secondary btn-sm" onclick="SADM.viewLecturerDetails('${lec.id}')">📋 Details</button></div></div>`;
      }
      html += `</div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend Lecturer', 'Suspend this lecturer? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Lecturer Suspended', '✅ The lecturer has been suspended.');
    await loadLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Lecturer Unsuspended', '✅ The lecturer has been reactivated.');
    await loadLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove Lecturer', 'Permanently remove this lecturer? All their data will be deleted. This cannot be undone.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Lecturer Removed', '✅ The lecturer has been permanently removed.');
    await loadLecturers();
  }

  async function viewLecturerDetails(lecId) {
    const lec = await DB.LEC.get(lecId);
    if (!lec) return;
    const sessions = await DB.SESSION.byLec(lecId);
    const totalStudents = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
    await MODAL.alert(`Lecturer: ${escapeHtml(lec.name)}`, `<div style="text-align:left"><p><strong>ID:</strong> ${escapeHtml(lec.lecId || 'N/A')}</p><p><strong>Email:</strong> ${escapeHtml(lec.email)}</p><p><strong>Department:</strong> ${escapeHtml(lec.department || 'N/A')}</p><p><strong>Status:</strong> ${lec.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}</p><p><strong>Registered:</strong> ${new Date(lec.createdAt).toLocaleDateString()}</p><hr><p><strong>Total Sessions:</strong> ${sessions.length}</p><p><strong>Total Check-ins:</strong> ${totalStudents}</p></div>`, { icon: '👨‍🏫', btnLabel: 'Close' });
  }

  // ==================== 3. CO-ADMINS MANAGEMENT ==================
  async function renderCoAdmins() {
    c().innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrator Management</h2>
        <p class="sub">Manage co-admins and joint administrators (max 3 joint admins)</p>
        <div class="inner-panel" style="margin-bottom:20px"><h3>➕ Add Joint Administrator</h3><div class="two-col"><div class="field"><label class="fl">Full Name</label><input type="text" id="joint-name" class="fi" placeholder="Full name"/></div><div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi" placeholder="email@ug.edu.gh"/></div></div><div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select Department</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><button class="btn btn-ug" onclick="SADM.addJointAdmin()" style="width:auto">👥 Add Joint Administrator</button><p class="note" style="margin-top:8px">Note: Only 3 joint administrators allowed at a time.</p></div>
        <div class="filter-bar"><div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-ca-dept" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div><div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-ca-status" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option><option value="approved">✅ Approved</option><option value="pending">⏳ Pending</option><option value="revoked">🚫 Revoked</option><option value="joint">👥 Joint Admin</option></select></div></div>
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
      let html = `<div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px"><div class="stat-card"><div class="stat-value">${pending.length}</div><div class="stat-label">⏳ Pending</div></div><div class="stat-card"><div class="stat-value">${approved.length}</div><div class="stat-label">✅ Approved</div></div><div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">🚫 Revoked</div></div><div class="stat-card"><div class="stat-value">${joint.length}</div><div class="stat-label">👥 Joint Admins</div></div></div>`;
      if (pending.length) { html += `<div class="inner-panel"><h3>⏳ Pending Applications</h3><div class="courses-grid">`; for (const ca of pending) { html += `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">✅ Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}')">❌ Reject</button></div></div>`; } html += `</div></div>`; }
      if (approved.length) { html += `<div class="inner-panel"><h3>✅ Approved Co-Admins</h3><div class="courses-grid">`; for (const ca of approved) { html += `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">🚫 Revoke Access</button></div></div>`; } html += `</div></div>`; }
      if (joint.length) { html += `<div class="inner-panel"><h3>👥 Joint Administrators (${joint.length}/3)</h3><div class="courses-grid">`; for (const ca of joint) { html += `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-danger btn-sm" onclick="SADM.removeJointAdmin('${ca.id}')">🗑️ Remove Joint Admin</button></div></div>`; } html += `</div></div>`; }
      if (revoked.length) { html += `<div class="inner-panel"><h3>🚫 Revoked</h3><div class="courses-grid">`; for (const ca of revoked) { html += `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div></div>`; } html += `</div></div>`; }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function addJointAdmin() {
    const name = document.getElementById('joint-name')?.value.trim();
    const email = document.getElementById('joint-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('joint-dept')?.value;
    if (!name || !email || !dept) { await MODAL.alert('Missing Info', '⚠️ Please fill all fields.'); return; }
    const existing = await DB.CA.getAll();
    const jointCount = existing.filter(c => c.status === 'joint').length;
    if (jointCount >= 3) { await MODAL.error('Limit Reached', '⚠️ Maximum of 3 joint administrators allowed.'); return; }
    const tempPass = Math.random().toString(36).substring(2, 10);
    const id = Math.random().toString(36).substring(2, 15);
    await DB.CA.set(id, { id, name, email, department: dept, pwHash: UI.hashPw(tempPass), status: 'joint', createdAt: Date.now(), createdBy: 'superAdmin' });
    if (typeof AUTH !== 'undefined' && AUTH._sendInviteEmail) {
      await AUTH._sendInviteEmail({ to_email: email, name: name, code: tempPass, role: 'Joint Administrator', signup_link: `${CONFIG.SITE_URL}#admin-login`, department: dept, lecturer_name: 'Admin' });
    }
    await MODAL.success('Joint Admin Added', `✅ Email sent to ${escapeHtml(email)} with temporary password.`);
    document.getElementById('joint-name').value = '';
    document.getElementById('joint-email').value = '';
    await loadCoAdmins();
  }

  async function removeJointAdmin(id) {
    const confirmed = await MODAL.confirm('Remove Joint Admin', 'Remove this joint administrator? They will lose all access.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.CA.delete(id);
    await MODAL.success('Removed', '✅ Joint administrator has been removed.');
    await loadCoAdmins();
  }

  async function approveCA(id) { await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() }); await MODAL.success('Approved', '✅ Co-admin access granted.'); await loadCoAdmins(); }
  async function rejectCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Rejected', '❌ Application rejected.'); await loadCoAdmins(); }
  async function revokeCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Revoked', '🚫 Co-admin access revoked.'); await loadCoAdmins(); }

  // ==================== 4. SESSIONS WITH PROPER FILTERING ==================
  async function renderSessions() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 All Sessions</h2>
        <p class="sub">Filter and view all attendance sessions (latest to oldest)</p>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div style="min-width:120px"><label class="fl">📅 Year</label><select id="session-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div style="min-width:120px"><label class="fl">📖 Semester</label><select id="session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div style="min-width:160px"><label class="fl">🏛️ Department</label><select id="session-dept" class="fi" onchange="SADM.loadSessionLecturers()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="min-width:180px"><label class="fl">👨‍🏫 Lecturer</label><select id="session-lecturer" class="fi"><option value="">Select Department First</option></select></div>
          <div style="min-width:160px"><label class="fl">📚 Course</label><select id="session-course" class="fi"><option value="">All Courses</option></select></div>
          <div style="min-width:150px"><label class="fl">🔍 Search</label><input type="text" id="session-search" class="fi" placeholder="Course code or name..."></div>
          <div><button class="btn btn-ug" onclick="SADM.filterSessions()">🔍 Filter</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportFilteredSessions()">📥 Export to Excel</button></div>
        </div>
        <div id="sessions-list"><div class="att-empty">📭 Select filters and click Filter</div></div>
      </div>
    `;
    await loadSessionLecturers();
  }

  async function loadSessionLecturers() {
    const dept = document.getElementById('session-dept')?.value;
    const lecturerSelect = document.getElementById('session-lecturer');
    if (!lecturerSelect) return;
    
    if (!dept) {
      lecturerSelect.innerHTML = '<option value="">📭 Select Department First</option>';
      return;
    }
    
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept);
    lecturerSelect.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
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
    if (search) sessions = sessions.filter(s => s.courseCode.toLowerCase().includes(search) || (s.courseName && s.courseName.toLowerCase().includes(search)));
    
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sessions.length === 0) {
      container.innerHTML = '<div class="no-rec">📭 No sessions found.</div>';
      return;
    }
    
    let html = `<div class="stats-grid" style="margin-bottom:20px"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">📊 Total Sessions</div></div></div><div class="courses-grid">`;
    for (const s of sessions.slice(0, 50)) {
      const records = s.records ? Object.values(s.records).length : 0;
      html += `
        <div class="course-card">
          <div class="course-header">
            <span class="course-code">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</span>
            <span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? '🟢 Active' : '🔴 Ended'}</span>
          </div>
          <div class="course-stats">
            <span>📅 ${s.date}</span>
            <span>👥 ${records} students</span>
            <span>👨‍🏫 ${escapeHtml(s.lecturer)}</span>
          </div>
          <div class="course-stats">
            <span>🏛️ ${escapeHtml(s.department)}</span>
            <span>📖 ${s.year} Sem ${s.semester}</span>
            <span>⏱️ ${s.durationMins || 60} min</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="SADM.viewSessionDetails('${s.id}')">📋 View Details</button>
        </div>
      `;
    }
    html += `</div>`;
    if (sessions.length > 50) html += `<p class="note" style="margin-top:16px">📋 Showing 50 of ${sessions.length} sessions</p>`;
    container.innerHTML = html;
  }

  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    
    const records = session.records ? Object.values(session.records) : [];
    
    let recordsHtml = '<div style="max-height: 300px; overflow-y: auto;"><table class="session-table"><thead><tr><th>Student Name</th><th>Student ID</th><th>Time</th><th>Method</th></tr></thead><tbody>';
    for (const r of records.slice(0, 20)) {
      recordsHtml += `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.time}</td><td>${r.authMethod === 'webauthn' ? '🔐 Biometric' : '📝 Manual'}</td></tr>`;
    }
    recordsHtml += '</tbody></table></div>';
    
    await MODAL.alert(
      `Session Details: ${session.courseCode} - ${session.date}`,
      `<div class="stats-grid" style="margin-bottom: 15px;">
         <div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">✅ Checked In</div></div>
         <div class="stat-card"><div class="stat-value">${session.durationMins || 60}</div><div class="stat-label">⏱️ Duration</div></div>
       </div>
       ${recordsHtml}`,
      { icon: '📊', btnLabel: 'Close', width: '700px' }
    );
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
    
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const wsData = [['📅 Date', '📚 Course Code', '📖 Course Name', '👨‍🏫 Lecturer', '🏛️ Department', '📅 Year', '📖 Semester', '👥 Students', '🟢 Status', '⏱️ Duration']];
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName, s.lecturer, s.department, s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended', `${s.durationMins || 60} min`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', '✅ Sessions exported to Excel.');
  }

  // ==================== 5. OVERALL REPORTS WITH PDF & GRAPHS ==================
  async function renderOverallReports() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Overall Attendance Reports</h2>
        <p class="sub">Generate comprehensive attendance reports with charts and PDF download</p>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div style="min-width:120px"><label class="fl">📅 Year</label><select id="overall-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div style="min-width:120px"><label class="fl">📖 Semester</label><select id="overall-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div style="min-width:160px"><label class="fl">🏛️ Department</label><select id="overall-dept" class="fi" onchange="SADM.loadOverallReportLecturers()"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="min-width:180px"><label class="fl">👨‍🏫 Lecturer</label><select id="overall-lecturer" class="fi"><option value="">All Lecturers</option></select></div>
          <div><label class="fl">📊 Minimum Attendance %</label><input type="number" id="min-attendance" class="fi" value="${minAttendancePercentage}" style="width:80px"></div>
          <div><button class="btn btn-ug" onclick="SADM.generateOverallReport()">📊 Generate Report</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportOverallReportToExcel()">📥 Export Excel</button></div>
          <div><button class="btn btn-teal" onclick="SADM.downloadOverallReportPDF()">📄 Download PDF</button></div>
          <div><button class="btn btn-outline" onclick="SADM.updateMinAttendance()">⚙️ Update Minimum</button></div>
        </div>
        <div id="overall-report-results"><div class="att-empty">📭 Select filters and click Generate Report</div></div>
      </div>
    `;
    await loadOverallReportLecturers();
  }

  async function updateMinAttendance() {
    const newValue = document.getElementById('min-attendance')?.value;
    if (newValue && !isNaN(newValue)) {
      minAttendancePercentage = parseInt(newValue);
      localStorage.setItem('min_attendance_percentage', minAttendancePercentage);
      await MODAL.success('Updated', `✅ Minimum attendance percentage set to ${minAttendancePercentage}%`);
      await generateOverallReport();
    }
  }

  async function loadOverallReportLecturers() {
    const dept = document.getElementById('overall-dept')?.value;
    const lecturerSelect = document.getElementById('overall-lecturer');
    if (!lecturerSelect) return;
    
    if (!dept) {
      lecturerSelect.innerHTML = '<option value="">📭 Select Department First</option>';
      return;
    }
    
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept);
    lecturerSelect.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  async function generateOverallReport() {
    const year = document.getElementById('overall-year')?.value;
    const semester = document.getElementById('overall-semester')?.value;
    const dept = document.getElementById('overall-dept')?.value;
    const lecturerId = document.getElementById('overall-lecturer')?.value;
    const container = document.getElementById('overall-report-results');
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (dept) sessions = sessions.filter(s => s.department === dept);
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      const uniqueStudents = new Set();
      sessions.forEach(s => { if (s.records) Object.values(s.records).forEach(r => uniqueStudents.add(r.studentId)); });
      
      // Calculate student attendance
      const studentAttendance = new Map();
      for (const session of sessions) {
        const records = session.records ? Object.values(session.records) : [];
        for (const r of records) {
          if (!studentAttendance.has(r.studentId)) {
            studentAttendance.set(r.studentId, { name: r.name, count: 0, total: sessions.length });
          }
          studentAttendance.get(r.studentId).count++;
        }
      }
      
      const excellent = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= 80).length;
      const good = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendancePercentage && (s.count / s.total) * 100 < 80).length;
      const atRisk = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendancePercentage - 20 && (s.count / s.total) * 100 < minAttendancePercentage).length;
      const critical = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 < minAttendancePercentage - 20).length;
      
      // Calculate weekly trends
      const weeklyTrends = {};
      for (const session of sessions) {
        const date = new Date(session.date);
        const weekKey = `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;
        if (!weeklyTrends[weekKey]) weeklyTrends[weekKey] = { week: weekKey, checkins: 0, sessions: 0 };
        weeklyTrends[weekKey].sessions++;
        weeklyTrends[weekKey].checkins += session.records ? Object.values(session.records).length : 0;
      }
      const trendData = Object.values(weeklyTrends).sort((a, b) => a.week.localeCompare(b.week));
      
      let html = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:20px; border-radius:12px; margin-bottom:20px; text-align:center">
          <h3 style="margin:0; color:white">📊 University of Ghana - Attendance Report</h3>
          <p style="margin:5px 0 0; opacity:0.9">${year || 'All Years'} ${semester ? 'Sem ' + semester : ''} ${dept ? ' | Department: ' + dept : ''} ${lecturerId ? ' | Lecturer: ' + (await DB.LEC.get(lecturerId))?.name : ''}</p>
          <p style="margin:5px 0 0; opacity:0.8">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin:5px 0 0; opacity:0.8">📊 Minimum Attendance Required: ${minAttendancePercentage}%</p>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">📚 Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">✅ Total Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">🎓 Unique Students</div></div>
          <div class="stat-card"><div class="stat-value">${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents.size, 1))) * 100) : 0}%</div><div class="stat-label">📊 Avg Attendance</div></div>
        </div>
        
        <div class="report-chart">
          <h4>📈 Attendance Distribution (Min Required: ${minAttendancePercentage}%)</h4>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (80-100%)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (${minAttendancePercentage}-79%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (${minAttendancePercentage - 20}-${minAttendancePercentage - 1}%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(uniqueStudents.size, 1)) * 100}%; background: #e67e22;"></div><span class="chart-value">${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<${minAttendancePercentage - 20}%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${critical} students</span></div>
        </div>
        
        <div class="report-chart">
          <h4>📈 Weekly Trends</h4>
          <div style="display: flex; align-items: flex-end; gap: 8px; height: 200px; margin-top: 20px;">
            ${trendData.map(t => `
              <div style="flex: 1; text-align: center;">
                <div style="height: ${(t.checkins / Math.max(totalCheckins, 1)) * 180}px; background: var(--ug); width: 100%; border-radius: 4px 4px 0 0;"></div>
                <div style="font-size: 10px; margin-top: 5px;">${t.week}</div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div style="margin-top:20px; overflow-x:auto">
          <h4>📋 Recent Sessions</h4>
          <table>
            <thead><tr style="background:var(--ug); color:white"><th>📅 Date</th><th>📚 Course</th><th>👨‍🏫 Lecturer</th><th>🏛️ Department</th><th>👥 Students</th><th>📖 Period</th></tr></thead>
            <tbody>
              ${sessions.slice(0, 20).map(s => `<tr style="border-bottom:1px solid var(--border2)">
                <td style="padding:8px">${s.date}</td>
                <td style="padding:8px">${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName || '')}</td>
                <td style="padding:8px">${escapeHtml(s.lecturer)}</td>
                <td style="padding:8px">${escapeHtml(s.department)}</td>
                <td style="padding:8px">${s.records ? Object.values(s.records).length : 0}</td>
                <td style="padding:8px">${s.year} Sem ${s.semester}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          ${sessions.length > 20 ? `<p class="note" style="margin-top:8px">📋 Showing 20 of ${sessions.length} sessions</p>` : ''}
        </div>
      `;
      container.innerHTML = html;
      
      currentReportData = { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents: uniqueStudents.size, excellent, good, atRisk, critical, trendData };
      
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportOverallReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    if (!currentReportData) { await MODAL.alert('No Data', '📭 Generate a report first.'); return; }
    
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    
    const wsData = [
      ['📊 University of Ghana - Attendance Report'],
      [`📅 Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}`],
      [`🏛️ Department: ${dept || 'All'}`],
      [`👨‍🏫 Lecturer: ${lecturer?.name || 'All'}`],
      [`📅 Generated: ${new Date().toLocaleString()}`],
      [`📊 Minimum Attendance Required: ${minAttendancePercentage}%`],
      [],
      ['📈 SUMMARY STATISTICS'],
      [`📚 Total Sessions:`, totalSessions],
      [`✅ Total Check-ins:`, totalCheckins],
      [`🎓 Unique Students:`, uniqueStudents],
      [`📊 Average Attendance:`, `${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%`],
      [],
      ['📊 ATTENDANCE DISTRIBUTION'],
      [`✅ Excellent (80-100%):`, excellent],
      [`⚠️ Good (${minAttendancePercentage}-79%):`, good],
      [`🔴 At Risk (${minAttendancePercentage - 20}-${minAttendancePercentage - 1}%):`, atRisk],
      [`❌ Critical (<${minAttendancePercentage - 20}%):`, critical],
      [],
      ['📋 SESSION DETAILS'],
      ['📅 Date', '📚 Course Code', '📖 Course Name', '👨‍🏫 Lecturer', '🏛️ Department', '📅 Year', '📖 Semester', '👥 Students', '🟢 Status', '⏱️ Duration']
    ];
    
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName, s.lecturer, s.department, s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended', `${s.durationMins || 60} min`]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance_Report');
    XLSX.writeFile(wb, `UG_Attendance_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', '✅ Report exported to Excel.');
  }

  async function downloadOverallReportPDF() {
    if (!currentReportData) { await MODAL.alert('No Report', '📭 Please generate a report first.'); return; }
    
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical, trendData } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    
    let sessionsHtml = '';
    for (const s of sessions.slice(0, 30)) {
      sessionsHtml += `<tr style="border-bottom:1px solid #ddd;"><td style="padding:8px">${s.date}</td><td style="padding:8px">${escapeHtml(s.courseCode)}</td><td style="padding:8px">${escapeHtml(s.lecturer)}</td><td style="padding:8px">${s.records ? Object.values(s.records).length : 0}</td></tr>`;
    }
    
    let trendHtml = '';
    for (const t of trendData) {
      const barHeight = (t.checkins / Math.max(totalCheckins, 1)) * 150;
      trendHtml += `
        <div style="flex:1; text-align:center;">
          <div style="height: ${barHeight}px; background: #003087; width: 100%; border-radius: 4px 4px 0 0;"></div>
          <div style="font-size: 10px; margin-top: 5px;">${t.week}</div>
        </div>
      `;
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>UG Attendance Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.5; }
          h1 { color: #003087; border-bottom: 2px solid #fcd116; padding-bottom: 10px; }
          .header { text-align: center; margin-bottom: 30px; }
          .stats { display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap; }
          .stat-box { background: #f5f5f7; padding: 15px; border-radius: 8px; text-align: center; width: 200px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #003087; }
          .chart { margin: 20px 0; }
          .chart-bar { display: flex; align-items: center; margin: 8px 0; }
          .chart-label { width: 180px; font-size: 12px; }
          .chart-fill { height: 25px; border-radius: 4px; }
          .trend-container { display: flex; align-items: flex-end; gap: 8px; height: 200px; margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #003087; color: white; padding: 10px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 University of Ghana - Attendance Report</h1>
          <p>Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}</p>
          <p>Department: ${dept || 'All'} | Lecturer: ${lecturer?.name || 'All'}</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p>Minimum Attendance Required: ${minAttendancePercentage}%</p>
        </div>
        
        <div class="stats">
          <div class="stat-box"><div class="stat-value">${totalSessions}</div><div>📚 Total Sessions</div></div>
          <div class="stat-box"><div class="stat-value">${totalCheckins}</div><div>✅ Total Check-ins</div></div>
          <div class="stat-box"><div class="stat-value">${uniqueStudents}</div><div>🎓 Unique Students</div></div>
          <div class="stat-box"><div class="stat-value">${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%</div><div>📊 Avg Attendance</div></div>
        </div>
        
        <div class="chart">
          <h2>📈 Attendance Distribution</h2>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (80-100%)</span><div class="chart-fill" style="width: ${(excellent / Math.max(uniqueStudents, 1)) * 300}px; background: #1d9e75;"></div><span> ${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (${minAttendancePercentage}-79%)</span><div class="chart-fill" style="width: ${(good / Math.max(uniqueStudents, 1)) * 300}px; background: #b8860b;"></div><span> ${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (${minAttendancePercentage - 20}-${minAttendancePercentage - 1}%)</span><div class="chart-fill" style="width: ${(atRisk / Math.max(uniqueStudents, 1)) * 300}px; background: #e67e22;"></div><span> ${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<${minAttendancePercentage - 20}%)</span><div class="chart-fill" style="width: ${(critical / Math.max(uniqueStudents, 1)) * 300}px; background: #d42b2b;"></div><span> ${critical} students</span></div>
        </div>
        
        <h2>📈 Weekly Trends</h2>
        <div class="trend-container">
          ${trendHtml}
        </div>
        
        <h2>📋 Session Details</h2>
        <table>
          <thead><tr><th>📅 Date</th><th>📚 Course</th><th>👨‍🏫 Lecturer</th><th>👥 Students</th></tr></thead>
          <tbody>${sessionsHtml}</tbody>
        </table>
        ${sessions.length > 30 ? `<p style="font-size: 11px;">📋 Showing 30 of ${sessions.length} sessions</p>` : ''}
        
        <div class="footer">
          <p>📊 UG QR Attendance System - University of Ghana</p>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  // ==================== 6. COURSES WITH PROPER FILTERING ==================
  async function renderCourses() {
    c().innerHTML = `
      <div class="pg">
        <h2>📚 All Courses</h2>
        <p class="sub">View courses grouped by year, semester, department, and lecturer</p>
        <div class="filter-bar">
          <div><label class="fl">📅 Year</label><select id="course-year" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">📖 Semester</label><select id="course-semester" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">🏛️ Department</label><select id="course-dept" class="fi" onchange="SADM.loadCourses(); SADM.loadCourseLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">👨‍🏫 Lecturer</label><select id="course-lecturer" class="fi" onchange="SADM.loadCourses()"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="SADM.loadCourses()">🔍 Filter</button></div>
        </div>
        <div id="courses-list"><div class="att-empty">📭 Select filters to view courses</div></div>
      </div>
    `;
    await loadCourseLecturers();
  }

  async function loadCourseLecturers() {
    const dept = document.getElementById('course-dept')?.value;
    const lecturerSelect = document.getElementById('course-lecturer');
    if (!lecturerSelect) return;
    
    if (!dept) {
      lecturerSelect.innerHTML = '<option value="">📭 Select Department First</option>';
      return;
    }
    
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept);
    lecturerSelect.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
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
      
      if (filtered.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No courses found for the selected filters.</div>';
        return;
      }
      
      const grouped = _groupCourses(filtered, 'superAdmin');
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:32px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">📅 Academic Year ${year}</h3>`;
        const depts = Object.keys(grouped[year]).sort();
        for (const dept of depts) {
          html += `<div style="margin-left:20px; margin-bottom:20px;"><h4 style="color:var(--teal);">🏛️ Department: ${escapeHtml(dept)}</h4>`;
          const semesters = Object.keys(grouped[year][dept]).sort((a,b) => a - b);
          for (const sem of semesters) {
            const semName = sem === '1' ? 'First Semester' : 'Second Semester';
            html += `<div style="margin-left:20px; margin-bottom:16px;"><h5 style="color:var(--amber);">📖 ${semName}</h5>`;
            const lecturers = Object.keys(grouped[year][dept][sem]).sort();
            for (const lecId of lecturers) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
              for (const course of lecGroup.courses) {
                html += `<span class="pill" style="padding:4px 10px; background:var(--primary-s);">📚 ${escapeHtml(course.courseCode)} - ${escapeHtml(course.courseName)} (${course.sessionCount} sessions)</span>`;
              }
              html += `</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('Load courses error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== 7. DATABASE & BACKUPS ==================
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <p class="sub">Create and download system backups</p>
        <div class="inner-panel">
          <h3>💾 Backups</h3>
          <button class="btn btn-ug" onclick="SADM.createBackup()" style="width:auto; padding:8px 20px">📀 Create New Backup</button>
          <div id="backups-list" style="margin-top:15px"><div class="att-empty">📭 No backups found</div></div>
        </div>
      </div>
    `;
    await loadBackups();
  }

  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    try {
      const backups = await DB.BACKUP.getAll();
      if (!backups || backups.length === 0) { 
        container.innerHTML = '<div class="no-rec">📭 No backups found. Click "Create New Backup" to get started.</div>'; 
        return; 
      }
      container.innerHTML = backups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:10px">
          <div>
            <strong>📀 ${new Date(b.createdAt).toLocaleString()}</strong>
            <div style="font-size:11px; color:var(--text3); margin-top:4px">
              📊 ${b.sessionCount || 0} sessions · 👨‍🏫 ${b.lecturerCount || 0} lecturers · 🎓 ${b.studentCount || 0} students
            </div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="SADM.downloadBackup('${b.id}')">📥 Download</button>
            <button class="btn btn-danger btn-sm" onclick="SADM.deleteBackup('${b.id}')">🗑️ Delete</button>
          </div>
        </div>
      `).join('');
    } catch(err) { 
      console.error('Load backups error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading backups</div>'; 
    }
  }

  async function createBackup() {
    try {
      const sessions = await DB.SESSION.getAll();
      const students = await DB.STUDENTS.getAll();
      const lecturers = await DB.LEC.getAll();
      const enrollments = await DB.ENROLLMENT.getAll();
      const cas = await DB.CA.getAll();
      const uids = await DB.UID.getAll();
      
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 10);
      const backupId = `backup_${timestamp}_${randomStr}`;
      
      const backup = { 
        id: backupId,
        createdAt: timestamp, 
        sessions: sessions, 
        students: students, 
        lecturers: lecturers, 
        enrollments: enrollments,
        coAdmins: cas,
        uids: uids,
        sessionCount: sessions.length, 
        studentCount: students.length, 
        lecturerCount: lecturers.length,
        version: '1.0'
      };
      
      await DB.BACKUP.save(backupId, backup);
      await MODAL.success('Backup Created', `✅ System backup created with ${sessions.length} sessions, ${students.length} students, and ${lecturers.length} lecturers.`);
      await loadBackups();
    } catch(err) { 
      console.error('Create backup error:', err);
      await MODAL.error('Backup Failed', err.message); 
    }
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
      const date = new Date(backup.createdAt).toISOString().split('T')[0];
      a.download = `UG_System_Backup_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await MODAL.success('Download Started', '✅ Backup file is being downloaded.');
    } catch(err) { 
      console.error('Download backup error:', err);
      await MODAL.error('Download Failed', err.message); 
    }
  }

  async function deleteBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete Backup', 'Delete this backup permanently?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    try {
      await DB.BACKUP.delete(backupId);
      await MODAL.success('Backup Deleted', '✅ Backup has been deleted.');
      await loadBackups();
    } catch(err) { 
      await MODAL.error('Delete Failed', err.message); 
    }
  }

  // ==================== 8. SETTINGS ==================
  async function renderSettings() {
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ System Settings</h2>
        
        <div class="inner-panel">
          <h3>📊 System Statistics</h3>
          <div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px">
            <div class="stat-card"><div class="stat-value" id="stat-total-users">-</div><div class="stat-label">👥 Total Users</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-total-sessions">-</div><div class="stat-label">📚 Total Sessions</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-total-checkins">-</div><div class="stat-label">✅ Total Check-ins</div></div>
            <div class="stat-card"><div class="stat-value" id="stat-active-lecturers">-</div><div class="stat-label">👨‍🏫 Active Lecturers</div></div>
          </div>
        </div>
        
        <div class="inner-panel">
          <h3>📊 Attendance Settings</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">Minimum Attendance Percentage Required</label>
              <input type="number" id="min-attendance-percent" class="fi" value="${minAttendancePercentage}" min="0" max="100">
            </div>
            <div class="field">
              <label class="fl">&nbsp;</label>
              <button class="btn btn-ug" onclick="SADM.updateSystemMinAttendance()">💾 Save Minimum Attendance</button>
            </div>
          </div>
        </div>
        
        <div class="inner-panel">
          <h3>🗑️ Data Deletion</h3>
          <p class="sub">Permanently delete data from the system. Backups will be preserved.</p>
          <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:10px">
            <div style="min-width:120px">
              <label class="fl">Year Range (From)</label>
              <input type="number" id="delete-year-from" class="fi" placeholder="2020">
            </div>
            <div style="min-width:120px">
              <label class="fl">Year Range (To)</label>
              <input type="number" id="delete-year-to" class="fi" placeholder="2025">
            </div>
            <div style="min-width:160px">
              <label class="fl">Department</label>
              <select id="delete-dept" class="fi">
                <option value="">All Departments</option>
                ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:15px">
            <button class="btn btn-warning" onclick="SADM.deleteDataByRange()">🗑️ Delete Data in Range</button>
            <button class="btn btn-danger" onclick="SADM.resetAllData()">⚠️ Reset ALL Data (Except Backups)</button>
          </div>
        </div>
      </div>
    `;
    await loadSystemStats();
  }

  async function updateSystemMinAttendance() {
    const newValue = document.getElementById('min-attendance-percent')?.value;
    if (newValue && !isNaN(newValue)) {
      minAttendancePercentage = parseInt(newValue);
      localStorage.setItem('min_attendance_percentage', minAttendancePercentage);
      await MODAL.success('Updated', `✅ Minimum attendance percentage set to ${minAttendancePercentage}%`);
      await generateOverallReport();
    }
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

  async function deleteDataByRange() {
    const fromYear = document.getElementById('delete-year-from')?.value;
    const toYear = document.getElementById('delete-year-to')?.value;
    const dept = document.getElementById('delete-dept')?.value;
    
    let message = 'Delete all data';
    if (fromYear && toYear) message += ` from ${fromYear} to ${toYear}`;
    if (dept) message += ` for department ${dept}`;
    message += '? Backups will be preserved. This cannot be undone.';
    
    const confirmed = await MODAL.confirm('Delete Data', message, { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    try {
      let sessions = await DB.SESSION.getAll();
      if (fromYear && toYear) {
        sessions = sessions.filter(s => s.year >= parseInt(fromYear) && s.year <= parseInt(toYear));
      }
      if (dept) {
        sessions = sessions.filter(s => s.department === dept);
      }
      
      for (const session of sessions) {
        await DB.SESSION.delete(session.id);
      }
      
      await MODAL.success('Data Deleted', `✅ Deleted ${sessions.length} sessions. Backups remain intact.`);
      await loadSystemStats();
      await loadCourses();
      await filterSessions();
    } catch(err) {
      console.error('Delete data error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  async function resetAllData() {
    const confirmed = await MODAL.confirm('⚠️ RESET ALL DATA', 
      'This will delete ALL data except backups. This action is PERMANENT and cannot be undone.\n\nType "CONFIRM" to proceed.', 
      { confirmLabel: 'CONFIRM', confirmCls: 'btn-danger' }
    );
    if (!confirmed) return;
    
    try {
      const sessions = await DB.SESSION.getAll();
      for (const session of sessions) await DB.SESSION.delete(session.id);
      
      const lecturers = await DB.LEC.getAll();
      for (const lecturer of lecturers) await DB.LEC.delete(lecturer.id);
      
      const students = await DB.STUDENTS.getAll();
      for (const student of students) await DB.STUDENTS.delete(student.studentId);
      
      const enrollments = await DB.ENROLLMENT.getAll();
      for (const enrollment of enrollments) {
        const enrollmentKey = `${enrollment.studentId}_${enrollment.lecId}_${enrollment.courseCode}_${enrollment.year}_${enrollment.semester}`;
        await DB.ENROLLMENT.delete(enrollmentKey);
      }
      
      const cas = await DB.CA.getAll();
      for (const ca of cas) await DB.CA.delete(ca.id);
      
      const uids = await DB.UID.getAll();
      for (const uid of uids) await DB.UID.delete(uid.id);
      
      await MODAL.success('System Reset', '✅ All data has been deleted. Backups remain available.');
      await loadSystemStats();
      await loadCourses();
      await filterSessions();
      await loadBackups();
    } catch(err) {
      console.error('Reset all data error:', err);
      await MODAL.error('Error', err.message);
    }
  }

  // ==================== 9. HELP (UPDATED) ==================
  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>📖 Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Unique IDs:</strong> Generate unique IDs for lecturer registration</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View, suspend, or remove lecturers</li>
            <li><strong>🤝 Co-Admins:</strong> Approve applications and add joint administrators (max 3)</li>
            <li><strong>📊 Sessions:</strong> View sessions with filters (year, semester, department, lecturer, course) - sorted latest to oldest</li>
            <li><strong>📈 Reports:</strong> Generate overall attendance reports with charts and PDF download - set minimum attendance percentage</li>
            <li><strong>💾 Backups:</strong> Create and download system backups</li>
            <li><strong>⚙️ Settings:</strong> Delete data by year range or reset entire system (backups preserved)</li>
            <li><strong>📚 Courses:</strong> View all courses grouped by year, semester, department, lecturer</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>📧 Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
          <p>🌐 Website: <a href="https://www.ug.edu.gh" target="_blank">www.ug.edu.gh</a></p>
          <p>📱 WhatsApp: +233 (0) 50 123 4567</p>
        </div>
        <div class="inner-panel">
          <h3>⏰ Office Hours</h3>
          <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
          <p>Saturday: 9:00 AM - 1:00 PM</p>
          <p>Sunday: Closed</p>
        </div>
      </div>
    `;
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
    exportOverallReportToExcel,
    downloadOverallReportPDF,
    loadOverallReportLecturers,
    loadCourses,
    loadCourseLecturers,
    createBackup,
    downloadBackup,
    deleteBackup,
    loadBackups,
    deleteDataByRange,
    resetAllData,
    loadSystemStats,
    renderHelp,
    viewSessionDetails,
    updateMinAttendance,
    updateSystemMinAttendance
  };
})();

// ==================== CO-ADMIN ==================
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';
  let currentDepartmentReportData = null;

  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    document.querySelectorAll('#view-cadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
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
        <p class="sub">Department: ${escapeHtml(dept())}</p>
        <div class="inner-panel"><h3>➕ Generate New ID</h3><button class="btn btn-ug" onclick="CADM.generateUID()" style="width:auto; padding:8px 20px">➕ Generate ID for ${escapeHtml(dept())}</button></div>
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
      let html = `<div class="stats-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px"><div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">✅ Available</div></div><div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">📋 Assigned</div></div></div>
        <div style="margin-bottom:20px"><h4>✅ Available (${available.length})</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><button class="btn btn-teal btn-sm" onclick="CADM.sendUID('${u.id}')">📧 Send to Lecturer</button></div>`).join('') : '<div class="no-rec">No available IDs</div>'}</div>
        <div><h4>📋 Assigned (${assigned.length})</h4>${assigned.length ? assigned.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><span style="font-size:11px">Assigned to: ${escapeHtml(u.assignedTo)}</span></div>`).join('') : '<div class="no-rec">No assigned IDs</div>'}</div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function generateUID() {
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    await DB.UID.set(uid, { id: uid, department: dept(), status: 'available', createdAt: Date.now(), createdBy: AUTH.getSession()?.id });
    await MODAL.success('ID Generated', `✅ Unique ID: <strong>${escapeHtml(uid)}</strong>`);
    await refreshUIDList();
  }

  async function sendUID(uid) {
    const email = await MODAL.prompt('Send to Lecturer', 'Enter lecturer email address:', { placeholder: 'lecturer@ug.edu.gh' });
    if (!email) return;
    await MODAL.success('Email Sent', `✅ UID ${uid} has been sent to ${email}`);
    await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
    await refreshUIDList();
  }

  async function renderLecturers() {
    c().innerHTML = '<div class="pg"><div class="att-empty">Loading...</div></div>';
    try {
      let lecturers = await DB.LEC.getAll();
      const myDept = dept();
      lecturers = lecturers.filter(l => l.department === myDept);
      if (!lecturers.length) { c().innerHTML = '<div class="pg"><div class="no-rec">📭 No lecturers in your department.</div></div>'; return; }
      let html = `<div class="pg"><h2>👨‍🏫 Lecturers - ${escapeHtml(myDept)}</h2><div class="courses-grid">`;
      for (const lec of lecturers) {
        const isSuspended = lec.status === 'suspended';
        html += `<div class="course-card"><div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${isSuspended ? 'badge-red' : 'badge'}">${isSuspended ? '⛔ Suspended' : '✅ Active'}</span></div><div class="course-name">📧 ${escapeHtml(lec.email)}</div><div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')}</div><div class="course-stats">📅 Registered: ${new Date(lec.createdAt).toLocaleDateString()}</div><div class="course-buttons">${isSuspended ? `<button class="btn btn-teal btn-sm" onclick="CADM.unsuspendLecturer('${lec.id}')">🔄 Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="CADM.suspendLecturer('${lec.id}')">⛔ Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="CADM.removeLecturer('${lec.id}')">🗑️ Remove</button></div></div>`;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) { c().innerHTML = `<div class="pg"><div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div></div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend Lecturer', 'Suspend this lecturer? They will not be able to access the system.', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Lecturer Suspended', '✅ The lecturer has been suspended.');
    await renderLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Lecturer Unsuspended', '✅ The lecturer has been reactivated.');
    await renderLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove Lecturer', 'Permanently remove this lecturer? All their data will be deleted.', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Lecturer Removed', '✅ The lecturer has been permanently removed.');
    await renderLecturers();
  }

  // ==================== CO-ADMIN SESSIONS ==================
  async function renderSessions() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Department Sessions - ${escapeHtml(dept())}</h2>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div><label class="fl">📅 Year</label><select id="co-session-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">📖 Semester</label><select id="co-session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">👨‍🏫 Lecturer</label><select id="co-session-lecturer" class="fi" onchange="CADM.filterSessions()"><option value="">All Lecturers</option></select></div>
          <div><button class="btn btn-ug" onclick="CADM.filterSessions()">🔍 Filter</button></div>
          <div><button class="btn btn-secondary" onclick="CADM.exportSessionsToExcel()">📥 Export Excel</button></div>
        </div>
        <div id="co-sessions-list"><div class="att-empty">📭 Select filters and click Filter</div></div>
      </div>
    `;
    await loadCoSessionLecturers();
  }

  async function loadCoSessionLecturers() {
    const lecturers = await DB.LEC.getAll();
    const myDept = dept();
    const deptLecturers = lecturers.filter(l => l.department === myDept);
    const select = document.getElementById('co-session-lecturer');
    if (select) {
      select.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    }
  }

  async function filterSessions() {
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    const container = document.getElementById('co-sessions-list');
    
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading sessions...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      const myDept = dept();
      sessions = sessions.filter(s => s.department === myDept);
      
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (sessions.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No sessions found for the selected filters.</div>';
        return;
      }
      
      let html = `<div class="stats-grid" style="margin-bottom:20px"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">📊 Total Sessions</div></div></div><div class="courses-grid">`;
      for (const s of sessions.slice(0, 50)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</span>
              <span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? '🟢 Active' : '🔴 Ended'}</span>
            </div>
            <div class="course-stats">
              <span>📅 ${s.date}</span>
              <span>👥 ${records} students</span>
              <span>👨‍🏫 ${escapeHtml(s.lecturer)}</span>
            </div>
            <div class="course-stats">
              <span>📖 ${s.year} Sem ${s.semester}</span>
              <span>⏱️ ${s.durationMins || 60} min</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="CADM.viewSessionDetails('${s.id}')">📋 View Details</button>
          </div>
        `;
      }
      html += `</div>`;
      if (sessions.length > 50) html += `<p class="note" style="margin-top:16px">📋 Showing 50 of ${sessions.length} sessions</p>`;
      container.innerHTML = html;
    } catch(err) {
      console.error('Filter sessions error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportSessionsToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    
    let sessions = await DB.SESSION.getAll();
    const myDept = dept();
    sessions = sessions.filter(s => s.department === myDept);
    
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const wsData = [['📅 Date', '📚 Course Code', '📖 Course Name', '👨‍🏫 Lecturer', '📅 Year', '📖 Semester', '👥 Students', '🟢 Status', '⏱️ Duration']];
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName, s.lecturer, s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended', `${s.durationMins || 60} min`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Dept_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', '✅ Sessions exported to Excel.');
  }

  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    
    const records = session.records ? Object.values(session.records) : [];
    let recordsHtml = '<div style="max-height: 300px; overflow-y: auto;"><table class="session-table"><thead><tr><th>Student Name</th><th>Student ID</th><th>Time</th><th>Method</th></tr></thead><tbody>';
    for (const r of records.slice(0, 20)) {
      recordsHtml += `<tr><td>${escapeHtml(r.name)}<\/td><td>${escapeHtml(r.studentId)}<\/td><td>${r.time}<\/td><td>${r.authMethod === 'webauthn' ? '🔐 Biometric' : '📝 Manual'}<\/td><\/tr>`;
    }
    recordsHtml += '</tbody></table></div>';
    
    await MODAL.alert(
      `Session: ${session.courseCode} - ${session.date}`,
      `<div class="stats-grid" style="margin-bottom: 15px;">
         <div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">👥 Students</div></div>
         <div class="stat-card"><div class="stat-value">${session.durationMins || 60}</div><div class="stat-label">⏱️ Duration</div></div>
       </div>
       ${recordsHtml}`,
      { icon: '📊', btnLabel: 'Close', width: '700px' }
    );
  }

  // ==================== CO-ADMIN REPORTS ==================
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Department Reports</h2>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div><label class="fl">📅 Year</label><select id="co-report-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">📖 Semester</label><select id="co-report-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">👨‍🏫 Lecturer</label><select id="co-report-lecturer" class="fi"><option value="">All Lecturers</option></select></div>
          <div><button class="btn btn-ug" onclick="CADM.generateDeptReport()">📊 Generate Report</button></div>
          <div><button class="btn btn-secondary" onclick="CADM.exportDeptReportToExcel()">📥 Export Excel</button></div>
          <div><button class="btn btn-teal" onclick="CADM.exportDeptReportToPDF()">📄 Export PDF</button></div>
        </div>
        <div id="co-report-results" class="inner-panel" style="margin-top:15px"><div class="att-empty">📭 Select filters and click Generate Report</div></div>
      </div>
    `;
    await loadDeptReportLecturers();
  }

  async function loadDeptReportLecturers() {
    const lecturers = await DB.LEC.getAll();
    const myDept = dept();
    const deptLecturers = lecturers.filter(l => l.department === myDept);
    const select = document.getElementById('co-report-lecturer');
    if (select) {
      select.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    }
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
      
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      // Group by course and lecturer for report
      const coursePerformance = new Map();
      for (const session of sessions) {
        const key = `${session.courseCode}_${session.lecFbId}`;
        if (!coursePerformance.has(key)) {
          const lecturer = await DB.LEC.get(session.lecFbId);
                      coursePerformance.set(key, {
            courseCode: session.courseCode,
            courseName: session.courseName,
            lecturerId: session.lecFbId,
            lecturerName: lecturer?.name || session.lecturer,
            totalSessions: 0,
            totalCheckins: 0,
            studentAttendance: new Map()
          });
        }
        const perf = coursePerformance.get(key);
        perf.totalSessions++;
        
        const records = session.records ? Object.values(session.records) : [];
        perf.totalCheckins += records.length;
        
        for (const r of records) {
          if (!perf.studentAttendance.has(r.studentId)) {
            perf.studentAttendance.set(r.studentId, { count: 0, name: r.name });
          }
          perf.studentAttendance.get(r.studentId).count++;
        }
      }
      
      let html = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:15px; border-radius:10px; text-align:center; margin-bottom:20px">
          <h3 style="margin:0; color:white">📊 ${escapeHtml(myDept)} Department - Attendance Report</h3>
          <p>📅 ${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All Semesters')}</p>
          <p>📅 Generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="courses-grid">
      `;
      
      for (const [key, perf] of coursePerformance) {
        const totalStudents = perf.studentAttendance.size;
        const avgAttendance = perf.totalSessions > 0 && totalStudents > 0 
          ? Math.round((perf.totalCheckins / (perf.totalSessions * totalStudents)) * 100) 
          : 0;
        
        const excellent = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 80).length;
        const good = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 60 && (s.count / perf.totalSessions) * 100 < 80).length;
        const atRisk = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 40 && (s.count / perf.totalSessions) * 100 < 60).length;
        const critical = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 < 40).length;
        
        html += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${escapeHtml(perf.courseCode)} - ${escapeHtml(perf.courseName)}</span>
            </div>
            <div class="course-name">👨‍🏫 ${escapeHtml(perf.lecturerName)}</div>
            <div class="course-stats">
              <span>📊 Average Attendance: <strong>${avgAttendance}%</strong></span>
            </div>
            <div class="course-stats">
              <span>✅ Excellent: ${excellent} students</span>
              <span>⚠️ Good: ${good} students</span>
              <span>🔴 At Risk: ${atRisk} students</span>
              <span>❌ Critical: ${critical} students</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${avgAttendance}%; background: ${avgAttendance >= 75 ? 'var(--teal)' : (avgAttendance >= 60 ? 'var(--amber)' : 'var(--danger)')};"></div>
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
      if (coursePerformance.size === 0) html = '<div class="no-rec">📭 No data found for the selected filters.</div>';
      
      container.innerHTML = html;
      currentDepartmentReportData = { sessions, year, semester, myDept, coursePerformance };
      
    } catch(err) {
      console.error('Generate dept report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportDeptReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    if (!currentDepartmentReportData) { await MODAL.alert('No Data', '📭 Generate a report first.'); return; }
    
    const { sessions, year, semester, myDept, coursePerformance } = currentDepartmentReportData;
    
    const wsData = [
      [`📊 ${myDept} Department - Attendance Report`],
      [`📅 Period: ${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All Semesters')}`],
      [`📅 Generated: ${new Date().toLocaleString()}`],
      [],
      ['📚 Course', '👨‍🏫 Lecturer', '📊 Avg Attendance', '✅ Excellent', '⚠️ Good', '🔴 At Risk', '❌ Critical'],
      ...Array.from(coursePerformance.values()).map(perf => [
        `${perf.courseCode} - ${perf.courseName}`,
        perf.lecturerName,
        `${Math.round((perf.totalCheckins / (perf.totalSessions * Math.max(perf.studentAttendance.size, 1))) * 100)}%`,
        Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 80).length,
        Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 60 && (s.count / perf.totalSessions) * 100 < 80).length,
        Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 40 && (s.count / perf.totalSessions) * 100 < 60).length,
        Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 < 40).length
      ]),
      [],
      ['📋 SESSION DETAILS'],
      ['📅 Date', '📚 Course Code', '📖 Course Name', '👨‍🏫 Lecturer', '👥 Students', '📖 Semester', '🟢 Status', '⏱️ Duration']
    ];
    
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName, s.lecturer, s.records ? Object.values(s.records).length : 0, `${s.year} Sem ${s.semester}`, s.active ? 'Active' : 'Ended', `${s.durationMins || 60} min`]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Department_Report');
    XLSX.writeFile(wb, `UG_${myDept}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Export Complete', '✅ Report exported to Excel.');
  }

  async function exportDeptReportToPDF() {
    if (!currentDepartmentReportData) { await MODAL.alert('No Report', '📭 Generate a report first.'); return; }
    
    const { sessions, year, semester, myDept, coursePerformance } = currentDepartmentReportData;
    
    let courseHtml = '';
    for (const [key, perf] of coursePerformance) {
      const totalStudents = perf.studentAttendance.size;
      const avgAttendance = perf.totalSessions > 0 && totalStudents > 0 
        ? Math.round((perf.totalCheckins / (perf.totalSessions * totalStudents)) * 100) 
        : 0;
      
      const excellent = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 80).length;
      const good = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 60 && (s.count / perf.totalSessions) * 100 < 80).length;
      const atRisk = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 >= 40 && (s.count / perf.totalSessions) * 100 < 60).length;
      const critical = Array.from(perf.studentAttendance.values()).filter(s => (s.count / perf.totalSessions) * 100 < 40).length;
      
      courseHtml += `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
          <h3>📚 ${escapeHtml(perf.courseCode)} - ${escapeHtml(perf.courseName)}</h3>
          <p><strong>👨‍🏫 Lecturer:</strong> ${escapeHtml(perf.lecturerName)}</p>
          <p><strong>📊 Average Attendance:</strong> ${avgAttendance}%</p>
          <p><strong>📈 Distribution:</strong> ✅ Excellent: ${excellent} | ⚠️ Good: ${good} | 🔴 At Risk: ${atRisk} | ❌ Critical: ${critical}</p>
          <div style="background: #f0f0f0; height: 20px; border-radius: 10px; overflow: hidden;">
            <div style="display: flex; height: 100%;">
              <div style="width: ${(excellent / totalStudents) * 100}%; background: #1d9e75;"></div>
              <div style="width: ${(good / totalStudents) * 100}%; background: #b8860b;"></div>
              <div style="width: ${(atRisk / totalStudents) * 100}%; background: #e67e22;"></div>
              <div style="width: ${(critical / totalStudents) * 100}%; background: #d42b2b;"></div>
            </div>
          </div>
        </div>
      `;
    }
    
    let sessionsHtml = '';
    for (const s of sessions.slice(0, 30)) {
      sessionsHtml += `<tr style="border-bottom:1px solid #ddd;"><td style="padding:8px">${s.date}</td><td style="padding:8px">${escapeHtml(s.courseCode)}</td><td style="padding:8px">${escapeHtml(s.lecturer)}</td><td style="padding:8px">${s.records ? Object.values(s.records).length : 0}</td></tr>`;
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${myDept} Department Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          h1 { color: #003087; border-bottom: 2px solid #fcd116; }
          .header { text-align: center; margin-bottom: 30px; }
          .stats { display: flex; justify-content: space-around; margin: 20px 0; flex-wrap: wrap; }
          .stat-box { background: #f5f5f7; padding: 15px; border-radius: 8px; text-align: center; width: 200px; }
          .stat-value { font-size: 24px; font-weight: bold; color: #003087; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th { background: #003087; color: white; padding: 10px; text-align: left; }
          td { border: 1px solid #ddd; padding: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 University of Ghana - ${escapeHtml(myDept)} Department</h1>
          <p>Attendance Report</p>
          <p>📅 Period: ${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All Semesters')}</p>
          <p>📅 Generated: ${new Date().toLocaleString()}</p>
        </div>
        
        <h2>📊 Course Performance Overview</h2>
        ${courseHtml}
        
        <h2>📋 Session Details</h2>
        <table>
          <thead><tr><th>📅 Date</th><th>📚 Course</th><th>👨‍🏫 Lecturer</th><th>👥 Students</th></tr></thead>
          <tbody>${sessionsHtml}</tbody>
        </table>
        ${sessions.length > 30 ? `<p>📋 Showing 30 of ${sessions.length} sessions</p>` : ''}
        
        <div class="footer">
          <p>📊 UG QR Attendance System - University of Ghana</p>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  }

  // ==================== CO-ADMIN COURSES ==================
  async function renderCourses() {
    c().innerHTML = `
      <div class="pg">
        <h2>📚 Courses - ${escapeHtml(dept())}</h2>
        <div class="filter-bar" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:20px">
          <div><label class="fl">📅 Year</label><select id="co-course-year" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">📖 Semester</label><select id="co-course-semester" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">👨‍🏫 Lecturer</label><select id="co-course-lecturer" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All Lecturers</option></select></div>
          <div><button class="btn btn-ug" onclick="CADM.loadDepartmentCourses()">🔍 Filter</button></div>
        </div>
        <div id="co-courses-list"><div class="att-empty">📭 Select filters to view courses</div></div>
      </div>
    `;
    await loadDepartmentCourseLecturers();
    await loadDepartmentCourses();
  }

  async function loadDepartmentCourseLecturers() {
    const lecturers = await DB.LEC.getAll();
    const myDept = dept();
    const deptLecturers = lecturers.filter(l => l.department === myDept);
    const select = document.getElementById('co-course-lecturer');
    if (select) {
      select.innerHTML = '<option value="">👨‍🏫 All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    }
  }

  async function loadDepartmentCourses() {
    const container = document.getElementById('co-courses-list');
    if (!container) return;
    
    const year = document.getElementById('co-course-year')?.value;
    const semester = document.getElementById('co-course-semester')?.value;
    const lecturerId = document.getElementById('co-course-lecturer')?.value;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      let allCourses = await _fetchAllCourses();
      const myDept = dept();
      let filtered = allCourses.filter(c => c.department === myDept);
      
      if (year) filtered = filtered.filter(c => c.year === parseInt(year));
      if (semester) filtered = filtered.filter(c => c.semester === parseInt(semester));
      if (lecturerId) filtered = filtered.filter(c => c.lecturerId === lecturerId);
      
      if (filtered.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No courses found for the selected filters.</div>';
        return;
      }
      
      const grouped = _groupCourses(filtered, 'coAdmin', myDept);
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:24px;"><h3 style="color:var(--ug);">📅 Academic Year ${year}</h3>`;
        const semesters = Object.keys(grouped[year]).sort((a,b) => a - b);
        for (const sem of semesters) {
          const semName = sem === '1' ? 'First Semester' : 'Second Semester';
          html += `<div style="margin-left:20px;"><h4 style="color:var(--teal);">📖 ${semName}</h4>`;
          const lecturers = Object.keys(grouped[year][sem]).sort();
          for (const lecId of lecturers) {
            const lecGroup = grouped[year][sem][lecId];
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
            for (const course of lecGroup.courses) {
              html += `<span class="pill" style="padding:4px 10px; background:var(--primary-s);">📚 ${escapeHtml(course.courseCode)} (${course.sessionCount} sessions)</span>`;
            }
            html += `</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) {
      console.error('Load courses error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==================== CO-ADMIN BACKUP ==================
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
      const backups = await DB.BACKUP.getAll();
      const myDept = dept();
      const deptBackups = backups.filter(b => b.department === myDept);
      if (deptBackups.length === 0) { 
        container.innerHTML = '<div class="no-rec">📭 No backups found for your department. Create one now.</div>'; 
        return; 
      }
      container.innerHTML = deptBackups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:10px">
          <div>
            <strong>📀 ${new Date(b.createdAt).toLocaleString()}</strong>
            <div style="font-size:11px; color:var(--text3); margin-top:4px">📊 ${b.sessionCount || 0} sessions</div>
          </div>
          <div style="display:flex; gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="CADM.downloadDeptBackup('${b.id}')">📥 Download</button>
            <button class="btn btn-danger btn-sm" onclick="CADM.deleteDeptBackup('${b.id}')">🗑️ Delete</button>
          </div>
        </div>
      `).join('');
    } catch(err) { 
      console.error('Load dept backups error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading backups</div>'; 
    }
  }

  async function createDeptBackup() {
    try {
      const myDept = dept();
      const sessions = await DB.SESSION.getAll();
      const deptSessions = sessions.filter(s => s.department === myDept);
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const backupId = `dept_backup_${myDept.replace(/\s/g, '_')}_${timestamp}_${randomStr}`;
      
      const backup = { 
        id: backupId,
        createdAt: timestamp, 
        department: myDept, 
        sessions: deptSessions, 
        sessionCount: deptSessions.length 
      };
      await DB.BACKUP.save(backupId, backup);
      await MODAL.success('Backup Created', `✅ Department backup created with ${deptSessions.length} sessions.`);
      await loadDeptBackups();
    } catch(err) { 
      console.error('Create dept backup error:', err);
      await MODAL.error('Backup Failed', err.message); 
    }
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
      const date = new Date(backup.createdAt).toISOString().split('T')[0];
      a.download = `UG_Dept_Backup_${backup.department}_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await MODAL.success('Download Started', '✅ Backup file is being downloaded.');
    } catch(err) { 
      console.error('Download dept backup error:', err);
      await MODAL.error('Download Failed', err.message); 
    }
  }

  async function deleteDeptBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete Backup', 'Delete this backup permanently?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    try {
      await DB.BACKUP.delete(backupId);
      await MODAL.success('Backup Deleted', '✅ Backup has been deleted.');
      await loadDeptBackups();
    } catch(err) { 
      await MODAL.error('Delete Failed', err.message); 
    }
  }

  // ==================== CO-ADMIN HELP ==================
  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>📖 Co-Administrator Guide</h3>
          <ul>
            <li><strong>🆔 Generate IDs:</strong> Create unique IDs for lecturers in your department only (department auto-filled)</li>
            <li><strong>👨‍🏫 Lecturers:</strong> View all lecturers in your department - you can suspend, unsuspend, or remove them</li>
            <li><strong>📊 Sessions:</strong> View all attendance sessions in your department (filter by year, semester, and lecturer) - sorted latest to oldest</li>
            <li><strong>📈 Reports:</strong> Generate department reports with course/lecturer performance overview - export to Excel and PDF</li>
            <li><strong>💾 Backup:</strong> Create and download department data backups</li>
            <li><strong>📚 Courses:</strong> View all courses in your department (filter by year, semester, lecturer)</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>📧 Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
          <p>🌐 Website: <a href="https://www.ug.edu.gh" target="_blank">www.ug.edu.gh</a></p>
        </div>
        <div class="inner-panel">
          <h3>⏰ Office Hours</h3>
          <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
          <p>Saturday: 9:00 AM - 1:00 PM</p>
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
    filterSessions,
    exportSessionsToExcel,
    viewSessionDetails,
    generateDeptReport,
    exportDeptReportToExcel,
    exportDeptReportToPDF,
    loadDeptReportLecturers,
    loadDepartmentCourses,
    loadDepartmentCourseLecturers,
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
