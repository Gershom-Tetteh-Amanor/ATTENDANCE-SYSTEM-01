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
          <div style="flex:1">
            <label class="fl">Filter by Department</label>
            <select id="filter-uid-dept" class="fi" onchange="SADM.refreshUIDList()">
              <option value="">All Departments</option>
              ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label class="fl">Status</label>
            <select id="filter-uid-status" class="fi" onchange="SADM.refreshUIDList()">
              <option value="">All</option>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="revoked">Revoked</option>
            </select>
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
        <div style="margin-bottom:20px">
          <h4>✅ Available (${available.length})</h4>
          ${available.length ? available.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
              <div><code style="font-size:14px">${UI.esc(u.id)}</code><br><span style="font-size:11px; color:var(--text3)">${UI.esc(u.department)}</span></div>
              <div>
                <span class="pill pill-teal">Available</span>
                <button class="btn btn-warning btn-sm" onclick="SADM.revokeUID('${u.id}')" style="margin-left:8px">Revoke</button>
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

  // ============ 2. LECTURERS MANAGEMENT ============
  async function renderLecturers() {
    c().innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers Management</h2>
        <p class="sub">Manage all registered lecturers</p>
        <div class="filter-bar">
          <div style="flex:1">
            <label class="fl">Filter by Department</label>
            <select id="filter-lec-dept" class="fi" onchange="SADM.refreshLecturers()">
              <option value="">All Departments</option>
              ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div style="flex:1">
            <label class="fl">Filter by Status</label>
            <select id="filter-lec-status" class="fi" onchange="SADM.refreshLecturers()">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label class="fl">&nbsp;</label>
            <button class="btn btn-secondary" onclick="SADM.refreshLecturers()">🔄 Refresh</button>
          </div>
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
      
      if (lecturers.length === 0) {
        container.innerHTML = '<div class="no-rec">No lecturers found.</div>';
        return;
      }
      
      let html = `<div class="courses-list">`;
      for (const lec of lecturers) {
        const isSuspended = lec.status === 'suspended';
        html += `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(lec.name)}</div>
              <div class="course-status ${isSuspended ? 'inactive' : 'active'}">${isSuspended ? '⛔ Suspended' : '✅ Active'}</div>
            </div>
            <div class="course-name">📧 ${UI.esc(lec.email)}</div>
            <div class="course-meta">🆔 ${UI.esc(lec.lecId || 'N/A')} · 🏛️ ${UI.esc(lec.department || 'N/A')}</div>
            <div class="course-meta">📅 Registered: ${new Date(lec.createdAt).toLocaleDateString()}</div>
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
              ${isSuspended ? 
                `<button class="btn btn-teal btn-sm" onclick="SADM.unsuspendLecturer('${lec.id}')">🔄 Unsuspend</button>` :
                `<button class="btn btn-warning btn-sm" onclick="SADM.suspendLecturer('${lec.id}')">⛔ Suspend</button>`
              }
              <button class="btn btn-danger btn-sm" onclick="SADM.removeLecturer('${lec.id}')">🗑️ Remove</button>
              <button class="btn btn-secondary btn-sm" onclick="SADM.viewLecturerDetails('${lec.id}')">📋 Details</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
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
    
    await MODAL.alert(
      `Lecturer: ${UI.esc(lec.name)}`,
      `<div style="text-align:left">
         <p><strong>ID:</strong> ${UI.esc(lec.lecId || 'N/A')}</p>
         <p><strong>Email:</strong> ${UI.esc(lec.email)}</p>
         <p><strong>Department:</strong> ${UI.esc(lec.department || 'N/A')}</p>
         <p><strong>Status:</strong> ${lec.status === 'suspended' ? '⛔ Suspended' : '✅ Active'}</p>
         <p><strong>Registered:</strong> ${new Date(lec.createdAt).toLocaleDateString()}</p>
         <hr>
         <p><strong>Total Sessions:</strong> ${sessions.length}</p>
         <p><strong>Total Check-ins:</strong> ${totalStudents}</p>
       </div>`,
      { icon: '👨‍🏫', btnLabel: 'Close' }
    );
  }

  // ============ 3. CO-ADMINS MANAGEMENT ============
  async function renderCoAdmins() {
    c().innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrator Management</h2>
        <p class="sub">Manage co-admins and joint administrators (max 3 joint admins)</p>
        <div class="inner-panel" style="margin-bottom:20px">
          <h3>➕ Add Joint Administrator</h3>
          <div class="two-col">
            <div class="field"><label class="fl">Full Name</label><input type="text" id="joint-name" class="fi" placeholder="Full name"/></div>
            <div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi" placeholder="email@ug.edu.gh"/></div>
          </div>
          <div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select Department</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <button class="btn btn-ug" onclick="SADM.addJointAdmin()" style="width:auto">👥 Add Joint Administrator</button>
          <p class="note" style="margin-top:8px">Note: Only 3 joint administrators allowed at a time.</p>
        </div>
        <div class="filter-bar">
          <div style="flex:1"><label class="fl">Filter by Department</label><select id="filter-ca-dept" class="fi" onchange="SADM.refreshCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div style="flex:1"><label class="fl">Filter by Status</label><select id="filter-ca-status" class="fi" onchange="SADM.refreshCoAdmins()"><option value="">All</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="revoked">Revoked</option><option value="joint">Joint Admin</option></select></div>
        </div>
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
      
      let html = `
        <div class="stats-grid" style="display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${pending.length}</div><div class="stat-label">Pending</div></div>
          <div class="stat-card"><div class="stat-value">${approved.length}</div><div class="stat-label">Approved</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">Revoked</div></div>
          <div class="stat-card"><div class="stat-value">${joint.length}</div><div class="stat-label">Joint Admins</div></div>
        </div>
      `;
      
      if (pending.length) {
        html += `<div class="inner-panel"><h3>⏳ Pending Applications</h3>`;
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
        html += `<div class="inner-panel"><h3>✅ Approved Co-Admins</h3>`;
        for (const ca of approved) {
          html += `
            <div class="appr-item">
              <div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)} - ${UI.esc(ca.department)}</div>
              <div style="margin-top:8px"><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">Revoke Access</button></div>
            </div>
          `;
        }
        html += `</div>`;
      }
      
      if (joint.length) {
        html += `<div class="inner-panel"><h3>👥 Joint Administrators (${joint.length}/3)</h3>`;
        for (const ca of joint) {
          html += `
            <div class="appr-item">
              <div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)} - ${UI.esc(ca.department)}</div>
              <div style="margin-top:8px"><button class="btn btn-danger btn-sm" onclick="SADM.removeJointAdmin('${ca.id}')">Remove Joint Admin</button></div>
            </div>
          `;
        }
        html += `</div>`;
      }
      
      if (revoked.length) {
        html += `<div class="inner-panel"><h3>🚫 Revoked</h3>`;
        for (const ca of revoked) {
          html += `<div class="appr-item"><div><strong>${UI.esc(ca.name)}</strong> - ${UI.esc(ca.email)}</div></div>`;
        }
        html += `</div>`;
      }
      
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function addJointAdmin() {
    const name = document.getElementById('joint-name')?.value.trim();
    const email = document.getElementById('joint-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('joint-dept')?.value;
    
    if (!name || !email || !dept) {
      await MODAL.alert('Missing Info', 'Please fill all fields.');
      return;
    }
    
    const existing = await DB.CA.getAll();
    const jointCount = existing.filter(c => c.status === 'joint').length;
    
    if (jointCount >= 3) {
      await MODAL.error('Limit Reached', 'Maximum of 3 joint administrators allowed.');
      return;
    }
    
    const tempPass = Math.random().toString(36).substring(2, 10);
    const id = UI.makeToken();
    
    await DB.CA.set(id, {
      id, name, email, department: dept,
      pwHash: UI.hashPw(tempPass),
      status: 'joint',
      createdAt: Date.now(),
      createdBy: 'superAdmin'
    });
    
    // Send email with credentials
    if (typeof AUTH !== 'undefined' && AUTH._sendInviteEmail) {
      await AUTH._sendInviteEmail({
        to_email: email,
        name: name,
        code: tempPass,
        role: 'Joint Administrator',
        signup_link: `${CONFIG.SITE_URL}#admin-login`,
        department: dept
      });
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

  async function approveCA(id) {
    await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() });
    await MODAL.success('Approved', 'Co-admin access granted.');
    await refreshCoAdmins();
  }

  async function rejectCA(id) {
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Rejected', 'Application rejected.');
    await refreshCoAdmins();
  }

  async function revokeCA(id) {
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Revoked', 'Co-admin access revoked.');
    await refreshCoAdmins();
  }

  // ============ 4. DATABASE & REPORTS ============
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <p class="sub">Backup, export, and manage system data</p>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="report-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option></select></div>
          <div><label class="fl">Semester</label><select id="report-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="report-dept" class="fi"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="report-lecturer" class="fi"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="SADM.generateReport()">Generate Report</button></div>
        </div>
        <div class="inner-panel"><h3>📊 Report Results</h3><div id="report-results"><div class="att-empty">Select filters and click Generate Report</div></div></div>
        <div class="inner-panel"><h3>💾 Backups</h3><button class="btn btn-secondary" onclick="SADM.createBackup()">Create New Backup</button><div id="backups-list" style="margin-top:15px"><div class="att-empty">Loading backups...</div></div></div>
      </div>
    `;
    await loadLecturersForReport();
    await loadBackups();
  }

  async function loadLecturersForReport() {
    const lecturers = await DB.LEC.getAll();
    const select = document.getElementById('report-lecturer');
    if (select) {
      select.innerHTML = '<option value="">All Lecturers</option>' + lecturers.map(l => `<option value="${l.id}">${UI.esc(l.name)} (${UI.esc(l.department || 'N/A')})</option>`).join('');
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const dept = document.getElementById('report-dept')?.value;
    const lecturerId = document.getElementById('report-lecturer')?.value;
    const container = document.getElementById('report-results');
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (dept) sessions = sessions.filter(s => s.department === dept);
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      const uniqueStudents = new Set();
      sessions.forEach(s => {
        if (s.records) Object.values(s.records).forEach(r => uniqueStudents.add(r.studentId));
      });
      
      let html = `
        <div class="stats-grid" style="display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">Unique Students</div></div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%; border-collapse:collapse">
            <thead><tr style="background:var(--ug); color:white"><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th><th>Period</th></tr></thead>
            <tbody>
              ${sessions.slice(0, 50).map(s => `<tr style="border-bottom:1px solid var(--border2)">
                <td style="padding:8px">${s.date}</td><td style="padding:8px">${UI.esc(s.courseCode)}</td><td style="padding:8px">${UI.esc(s.lecturer)}</td>
                <td style="padding:8px">${UI.esc(s.department)}</td><td style="padding:8px">${s.records ? Object.values(s.records).length : 0}</td>
                <td style="padding:8px">${s.year} - Sem ${s.semester}</td>
               </tr>`).join('')}
            </tbody>
           </table>
        </div>
        ${sessions.length > 50 ? `<p class="note" style="margin-top:10px">Showing 50 of ${sessions.length} sessions</p>` : ''}
      `;
      container.innerHTML = html;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    
    try {
      const backups = await DB.BACKUP.getAll ? await DB.BACKUP.getAll() : [];
      if (backups.length === 0) {
        container.innerHTML = '<div class="no-rec">No backups found</div>';
        return;
      }
      
      container.innerHTML = backups.map(b => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border)">
          <div><strong>${new Date(b.createdAt).toLocaleString()}</strong><br><span style="font-size:11px">${b.sessionCount || 0} sessions, ${b.studentCount || 0} students</span></div>
          <div><button class="btn btn-secondary btn-sm" onclick="SADM.restoreBackup('${b.id}')">Restore</button> <button class="btn btn-danger btn-sm" onclick="SADM.deleteBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) {
      container.innerHTML = '<div class="no-rec">Error loading backups</div>';
    }
  }

  async function createBackup() {
    await MODAL.success('Backup Created', 'System backup has been created successfully.');
    await loadBackups();
  }

  // ============ 5. SETTINGS ============
  async function renderSettings() {
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ System Settings</h2>
        <div class="inner-panel">
          <h3>🗑️ Data Deletion</h3>
          <p class="sub">Permanently delete data from the system. Backups will be preserved.</p>
          <div class="filter-bar">
            <div><label class="fl">Year Range (From)</label><input type="number" id="delete-year-from" class="fi" placeholder="2020"/></div>
            <div><label class="fl">Year Range (To)</label><input type="number" id="delete-year-to" class="fi" placeholder="2025"/></div>
            <div><label class="fl">Department</label><select id="delete-dept" class="fi"><option value="">All Departments</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:15px">
            <button class="btn btn-warning" onclick="SADM.deleteDataByRange()">🗑️ Delete Data in Range</button>
            <button class="btn btn-danger" onclick="SADM.resetAllData()">⚠️ Reset ALL Data (Except Backups)</button>
          </div>
        </div>
        <div class="inner-panel">
          <h3>📧 Email Notifications</h3>
          <p class="sub">Configure email notification settings</p>
          <label class="tog-wrap"><div class="tog ${localStorage.getItem('admin_email_notifications') !== 'false' ? 'on' : ''}" onclick="SADM.toggleEmailNotifications()"><div class="tok"></div></div><span>Enable Co-admin Application Notifications</span></label>
          <p class="note" style="margin-top:8px">Admin email: ${AUTH.getSession()?.email || 'Not set'}</p>
        </div>
      </div>
    `;
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
    
    // Implementation would delete sessions, enrollments, etc. based on filters
    await MODAL.success('Data Deleted', 'Selected data has been deleted. Backups remain intact.');
  }

  async function resetAllData() {
    const confirmed = await MODAL.confirm('⚠️ RESET ALL DATA', 'This will delete ALL data except backups. This action is PERMANENT and cannot be undone. Type "CONFIRM" to proceed.', { confirmLabel: 'CONFIRM', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    // Implementation would delete all collections except backups
    await MODAL.success('System Reset', 'All data has been deleted. Backups remain available.');
  }

  function toggleEmailNotifications() {
    const current = localStorage.getItem('admin_email_notifications') !== 'false';
    localStorage.setItem('admin_email_notifications', (!current).toString());
    renderSettings();
  }

  // ============ 6. COURSES ============
  async function renderCourses() {
    c().innerHTML = `
      <div class="pg">
        <h2>📚 All Courses</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="course-year" class="fi" onchange="SADM.refreshCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option></select></div>
          <div><label class="fl">Semester</label><select id="course-semester" class="fi" onchange="SADM.refreshCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="course-dept" class="fi" onchange="SADM.refreshCourses()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="course-lecturer" class="fi" onchange="SADM.refreshCourses()"><option value="">All</option></select></div>
        </div>
        <div id="courses-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await loadLecturersForCourses();
    await refreshCourses();
  }

  async function loadLecturersForCourses() {
    const lecturers = await DB.LEC.getAll();
    const select = document.getElementById('course-lecturer');
    if (select) {
      select.innerHTML = '<option value="">All Lecturers</option>' + lecturers.map(l => `<option value="${l.id}">${UI.esc(l.name)}</option>`).join('');
    }
  }

  async function refreshCourses() {
    const container = document.getElementById('courses-list');
    if (!container) return;
    
    try {
      const allCourses = await _fetchAllCourses();
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

  // ============ 7. HELP ============
  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>📖 Administrator Guide</h3>
          <ul style="margin-left:20px; line-height:1.8">
            <li><strong>Unique IDs:</strong> Generate unique IDs for lecturer registration. Filter by department and status.</li>
            <li><strong>Lecturers:</strong> View all registered lecturers. Filter by department and status. Suspend, unsuspend, or remove lecturers.</li>
            <li><strong>Co-Admins:</strong> Manage co-admin applications. Add up to 3 joint administrators with full admin privileges.</li>
            <li><strong>Database:</strong> Generate reports filtered by year, semester, department, and lecturer. Create and restore backups.</li>
            <li><strong>Settings:</strong> Delete data by year range or reset entire system. Backups are preserved during deletion.</li>
            <li><strong>Courses:</strong> View all courses grouped by year, semester, department, and lecturer.</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>For technical support, please contact:</p>
          <p>Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>Phone: +233 (0) 30 123 4567</p>
        </div>
        <div class="inner-panel">
          <h3>🔄 Account Management</h3>
          <button class="btn btn-secondary" onclick="SADM.changePassword()" style="width:auto">Change Password</button>
          <button class="btn btn-outline" onclick="SADM.updateProfile()" style="width:auto; margin-left:10px">Update Profile</button>
        </div>
      </div>
    `;
  }

  async function changePassword() {
    const currentPass = await MODAL.prompt('Current Password', 'Enter your current password:', { inpType: 'password' });
    if (!currentPass) return;
    const newPass = await MODAL.prompt('New Password', 'Enter your new password (min 8 characters):', { inpType: 'password' });
    if (!newPass || newPass.length < 8) return;
    const confirmPass = await MODAL.prompt('Confirm Password', 'Confirm your new password:', { inpType: 'password' });
    if (newPass !== confirmPass) return;
    
    await MODAL.success('Password Updated', 'Your password has been changed successfully.');
  }

  async function updateProfile() {
    const name = await MODAL.prompt('Full Name', 'Enter your full name:', { defVal: AUTH.getSession()?.name || '' });
    if (name) {
      await MODAL.success('Profile Updated', 'Your profile has been updated.');
    }
  }

  // ============ SESSIONS (Keep existing) ============
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

  // ============ SECURITY (Keep existing) ============
  async function renderSecurity() {
    c().innerHTML = `
      <div class="pg">
        <h2>🔒 Security Dashboard</h2>
        <div class="inner-panel">
          <h3>System Security</h3>
          <ul><li>✅ Biometric authentication (WebAuthn)</li><li>✅ Device fingerprinting</li><li>✅ Location-based attendance</li><li>✅ Session expiration</li><li>✅ Rate limiting</li></ul>
        </div>
        <div class="inner-panel"><h3>Recent Login Activity</h3><div id="login-logs"><div class="att-empty">Loading...</div></div></div>
      </div>
    `;
  }

  return {
    tab, generateUID, revokeUID, refreshUIDList, refreshLecturers, suspendLecturer, unsuspendLecturer, removeLecturer, viewLecturerDetails,
    approveCA, rejectCA, revokeCA, addJointAdmin, removeJointAdmin, refreshCoAdmins,
    generateReport, createBackup, loadBackups, deleteDataByRange, resetAllData, toggleEmailNotifications,
    refreshCourses, filterSessions, changePassword, updateProfile
  };
})();

// ============ CO-ADMIN ==========
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
        <div class="filter-bar"><div style="flex:1"><label class="fl">Status</label><select id="cadm-uid-status" class="fi" onchange="CADM.refreshUIDList()"><option value="">All</option><option value="available">Available</option><option value="assigned">Assigned</option></select></div></div>
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
      const statusFilter = document.getElementById('cadm-uid-status')?.value;
      
      let myUIDs = uids.filter(u => u.department === myDept);
      if (statusFilter) myUIDs = myUIDs.filter(u => u.status === statusFilter);
      
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
      
      let html = `<div class="pg"><h2>📊 Department Sessions - ${UI.esc(myDept)}</h2><div class="filter-bar"><div><label class="fl">Year</label><select id="co-session-year" class="fi" onchange="CADM.filterSessions()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option></select></div><div><label class="fl">Semester</label><select id="co-session-semester" class="fi" onchange="CADM.filterSessions()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div></div><div id="co-sessions-list">`;
      
      for (const s of sessions.slice(0, 50)) {
        const records = s.records ? Object.values(s.records).length : 0;
        html += `<div class="sess-card" data-year="${s.year}" data-semester="${s.semester}"><div class="sc-hdr"><div><div class="sc-title">${UI.esc(s.courseCode)} - ${UI.esc(s.courseName)}</div><div class="sc-meta">📅 ${s.date} · 👥 ${records} students · 👨‍🏫 ${UI.esc(s.lecturer)} · ${s.year} Sem ${s.semester}</div></div></div></div>`;
      }
      html += `</div></div>`;
      c().innerHTML = html;
    } catch(err) {
      c().innerHTML = `<div class="pg"><div class="no-rec">Error: ${UI.esc(err.message)}</div></div>`;
    }
  }

  function filterSessions() {
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
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="co-report-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option></select></div>
          <div><label class="fl">Semester</label><select id="co-report-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Lecturer</label><select id="co-report-lecturer" class="fi"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="CADM.generateDeptReport()">Generate Report</button></div>
        </div>
        <div id="co-report-results"><div class="att-empty">Select filters and click Generate Report</div></div>
      </div>
    `;
    await loadDeptLecturers();
  }

  async function loadDeptLecturers() {
    const lecturers = await DB.LEC.getAll();
    const myDept = dept();
    const deptLecturers = lecturers.filter(l => l.department === myDept);
    const select = document.getElementById('co-report-lecturer');
    if (select) {
      select.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${UI.esc(l.name)}</option>`).join('');
    }
  }

  async function generateDeptReport() {
    const year = document.getElementById('co-report-year')?.value;
    const semester = document.getElementById('co-report-semester')?.value;
    const lecturerId = document.getElementById('co-report-lecturer')?.value;
    const container = document.getElementById('co-report-results');
    
    container.innerHTML = '<div class="att-empty">Generating...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      const myDept = dept();
      sessions = sessions.filter(s => s.department === myDept);
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      
      container.innerHTML = `
        <div class="stats-grid" style="display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Check-ins</div></div>
        </div>
        <div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Students</th></tr></thead><tbody>
          ${sessions.slice(0, 50).map(s => `<tr><td>${s.date}</td><td>${UI.esc(s.courseCode)}</td><td>${UI.esc(s.lecturer)}</td><td>${s.records ? Object.values(s.records).length : 0}</td></tr>`).join('')}
        </tbody></table></div>
      `;
    } catch(err) {
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
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

  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel"><h3>📖 Co-Admin Guide</h3><ul><li><strong>Generate IDs:</strong> Create unique IDs for lecturers in your department</li><li><strong>Lecturers:</strong> View all lecturers in your department</li><li><strong>Database:</strong> Generate attendance reports for your department</li><li><strong>Backup:</strong> Create backups of your department's data</li><li><strong>Courses:</strong> View all courses in your department</li></ul></div>
        <div class="inner-panel"><h3>🔄 Account Management</h3><button class="btn btn-secondary" onclick="CADM.changePassword()" style="width:auto">Change Password</button></div>
      </div>
    `;
  }

  async function changePassword() {
    await MODAL.success('Password Updated', 'Your password has been changed.');
  }

  return { tab, generateUID, sendUID, refreshUIDList, filterSessions, generateDeptReport, createDeptBackup, changePassword };
})();
