/* admin-super-users.js — Super Admin: Lecturers and Co-Admins Management */
'use strict';

const ADMIN_SUPER_USERS = (() => {
  const core = () => window.ADMIN_CORE;
  
  // ==================== LECTURERS MANAGEMENT ====================
  async function renderLecturers() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers</h2>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-lec-dept" class="fi" onchange="ADMIN_SUPER_USERS.loadLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-lec-status" class="fi" onchange="ADMIN_SUPER_USERS.loadLecturers()"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
          <div><button class="btn btn-secondary" onclick="ADMIN_SUPER_USERS.loadLecturers()">Refresh</button></div>
        </div>
        <div id="lecturers-list"></div>
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
      if (!lecturers.length) { container.innerHTML = '<div class="no-rec">No lecturers found.</div>'; return; }
      
      container.innerHTML = `<div class="courses-grid">${lecturers.map(lec => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">👨‍🏫 ${core().escapeHtml(lec.name)}</span><span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span></div>
          <div class="course-name">📧 ${core().escapeHtml(lec.email)}</div>
          <div class="course-stats">🆔 ${core().escapeHtml(lec.lecId || 'N/A')} · 🏛️ ${core().escapeHtml(lec.department || 'N/A')}</div>
          <div class="course-stats">📅 ${new Date(lec.createdAt).toLocaleDateString()}</div>
          <div class="course-buttons">
            ${lec.status === 'suspended' ? `<button class="btn btn-teal btn-sm" onclick="ADMIN_SUPER_USERS.unsuspendLecturer('${lec.id}')">Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="ADMIN_SUPER_USERS.suspendLecturer('${lec.id}')">Suspend</button>`}
            <button class="btn btn-danger btn-sm" onclick="ADMIN_SUPER_USERS.removeLecturer('${lec.id}')">Remove</button>
            <button class="btn btn-secondary btn-sm" onclick="ADMIN_SUPER_USERS.viewLecturerDetails('${lec.id}')">Details</button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend', 'Suspend this lecturer?', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Suspended', '✅ Lecturer suspended.');
    await loadLecturers();
  }

  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Unsuspended', '✅ Lecturer reactivated.');
    await loadLecturers();
  }

  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove', 'Permanently remove this lecturer?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Removed', '✅ Lecturer removed.');
    await loadLecturers();
  }

  async function viewLecturerDetails(lecId) {
    const lec = await DB.LEC.get(lecId);
    if (!lec) return;
    const sessions = await DB.SESSION.byLec(lecId);
    const totalStudents = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
    await MODAL.alert(`Lecturer: ${core().escapeHtml(lec.name)}`, `
      <p><strong>ID:</strong> ${core().escapeHtml(lec.lecId || 'N/A')}</p>
      <p><strong>Email:</strong> ${core().escapeHtml(lec.email)}</p>
      <p><strong>Dept:</strong> ${core().escapeHtml(lec.department || 'N/A')}</p>
      <p><strong>Status:</strong> ${lec.status === 'suspended' ? 'Suspended' : 'Active'}</p>
      <hr><p><strong>Sessions:</strong> ${sessions.length}</p>
      <p><strong>Check-ins:</strong> ${totalStudents}</p>
    `, { icon: '👨‍🏫' });
  }

  // ==================== CO-ADMINS MANAGEMENT ====================
  async function renderCoAdmins() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrators</h2>
        <div class="inner-panel">
          <h3>➕ Add Joint Administrator (Max 3)</h3>
          <div class="two-col">
            <div class="field"><label class="fl">Name</label><input type="text" id="joint-name" class="fi"/></div>
            <div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi"/></div>
          </div>
          <div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <button class="btn btn-ug" onclick="ADMIN_SUPER_USERS.addJointAdmin()">Add Joint Admin</button>
        </div>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-ca-dept" class="fi" onchange="ADMIN_SUPER_USERS.loadCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-ca-status" class="fi" onchange="ADMIN_SUPER_USERS.loadCoAdmins()"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="revoked">Revoked</option><option value="joint">Joint</option></select></div>
        </div>
        <div id="coadmins-list"></div>
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
      const joint = cas.filter(c => c.status === 'joint');
      const revoked = cas.filter(c => c.status === 'revoked');
      
      let html = `<div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${pending.length}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value">${approved.length}</div><div class="stat-label">Approved</div></div>
        <div class="stat-card"><div class="stat-value">${joint.length}</div><div class="stat-label">Joint</div></div>
        <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">Revoked</div></div>
      </div>`;
      
      if (pending.length) html += `<div class="inner-panel"><h3>⏳ Pending</h3>${pending.map(ca => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">${core().escapeHtml(ca.name)}</span></div>
          <div class="course-name">${core().escapeHtml(ca.email)}</div>
          <div class="course-stats">${core().escapeHtml(ca.department)}</div>
          <div class="course-buttons">
            <button class="btn btn-teal btn-sm" onclick="ADMIN_SUPER_USERS.approveCA('${ca.id}')">Approve</button>
            <button class="btn btn-danger btn-sm" onclick="ADMIN_SUPER_USERS.rejectCA('${ca.id}')">Reject</button>
          </div>
        </div>
      `).join('')}</div>`;
      
      if (approved.length) html += `<div class="inner-panel"><h3>✅ Approved</h3>${approved.map(ca => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">${core().escapeHtml(ca.name)}</span></div>
          <div class="course-name">${core().escapeHtml(ca.email)}</div>
          <div class="course-stats">${core().escapeHtml(ca.department)}</div>
          <div class="course-buttons">
            <button class="btn btn-warning btn-sm" onclick="ADMIN_SUPER_USERS.revokeCA('${ca.id}')">Revoke</button>
          </div>
        </div>
      `).join('')}</div>`;
      
      if (joint.length) html += `<div class="inner-panel"><h3>👥 Joint (${joint.length}/3)</h3>${joint.map(ca => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">${core().escapeHtml(ca.name)}</span></div>
          <div class="course-name">${core().escapeHtml(ca.email)}</div>
          <div class="course-stats">${core().escapeHtml(ca.department)}</div>
          <div class="course-buttons">
            <button class="btn btn-danger btn-sm" onclick="ADMIN_SUPER_USERS.removeJointAdmin('${ca.id}')">Remove</button>
          </div>
        </div>
      `).join('')}</div>`;
      
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function addJointAdmin() {
    const name = document.getElementById('joint-name')?.value.trim();
    const email = document.getElementById('joint-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('joint-dept')?.value;
    if (!name || !email || !dept) { await MODAL.alert('Missing', 'Fill all fields.'); return; }
    const all = await DB.CA.getAll();
    if (all.filter(c => c.status === 'joint').length >= 3) { await MODAL.error('Limit', 'Max 3 joint admins.'); return; }
    const id = Math.random().toString(36).substring(2, 15);
    await DB.CA.set(id, { id, name, email, department: dept, pwHash: UI.hashPw(Math.random().toString(36).substring(2, 10)), status: 'joint', createdAt: Date.now() });
    await MODAL.success('Added', `✅ Joint admin added.`);
    document.getElementById('joint-name').value = '';
    document.getElementById('joint-email').value = '';
    await loadCoAdmins();
  }

  async function removeJointAdmin(id) {
    const confirmed = await MODAL.confirm('Remove', 'Remove this joint admin?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.CA.delete(id);
    await MODAL.success('Removed', '✅ Joint admin removed.');
    await loadCoAdmins();
  }

  async function approveCA(id) { 
    await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() }); 
    await MODAL.success('Approved', 'Access granted.'); 
    await loadCoAdmins(); 
  }
  
  async function rejectCA(id) { 
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); 
    await MODAL.success('Rejected', 'Application rejected.'); 
    await loadCoAdmins(); 
  }
  
  async function revokeCA(id) { 
    await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); 
    await MODAL.success('Revoked', 'Access revoked.'); 
    await loadCoAdmins(); 
  }

  return {
    renderLecturers,
    loadLecturers,
    suspendLecturer,
    unsuspendLecturer,
    removeLecturer,
    viewLecturerDetails,
    renderCoAdmins,
    loadCoAdmins,
    addJointAdmin,
    removeJointAdmin,
    approveCA,
    rejectCA,
    revokeCA
  };
})();

window.ADMIN_SUPER_USERS = ADMIN_SUPER_USERS;
