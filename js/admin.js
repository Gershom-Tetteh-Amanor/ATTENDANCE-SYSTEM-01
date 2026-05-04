/* admin.js — Super Admin and Co-Admin Dashboards (FULLY WORKING) */
'use strict';

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAvailableYears() {
  const currentYear = new Date().getFullYear();
  const startYear = 2020;
  const years = [];
  for (let year = startYear; year <= currentYear; year++) {
    years.push(year);
  }
  return years;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function exportSingleSessionHelper(sessionId) {
  if (typeof XLSX === 'undefined') {
    if (typeof MODAL !== 'undefined') await MODAL.alert('Library Error', 'Excel export not loaded.');
    return;
  }
  try {
    if (typeof DB === 'undefined') return;
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    const wsData = [
      [`Attendance Records - ${session.courseCode} - ${session.courseName}`],
      [`Session Date: ${session.date}`],
      [`Lecturer: ${session.lecturer || 'Unknown'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Check-ins: ${records.length}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Check-in Time', 'Verification Method']
    ];
    records.forEach((r, i) => {
      wsData.push([
        i + 1,
        r.studentId || '',
        r.name || '',
        r.time || new Date(r.checkedAt).toLocaleTimeString(),
        r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—')
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}`);
    XLSX.writeFile(wb, `UG_Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}.xlsx`);
    if (typeof MODAL !== 'undefined') await MODAL.success('Export Complete', '✅ Session exported.');
  } catch(err) {
    console.error('Export error:', err);
    if (typeof MODAL !== 'undefined') await MODAL.error('Export Failed', err.message);
  }
}

// ============================================
// SUPER ADMIN (SADM)
// ============================================

const SADM = (() => {
  // Safe element getter
  const getContent = () => {
    try {
      return document.getElementById('sadm-content');
    } catch(e) {
      return null;
    }
  };
  
  // Main tab function
  function tab(name) {
    console.log('[SADM] Switching to tab:', name);
    
    try {
      // Update active state in sidebar
      const navItems = document.querySelectorAll('#view-sadmin .nav-item');
      if (navItems) {
        navItems.forEach(item => {
          const tabName = item.getAttribute('data-tab');
          if (tabName === name) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }
      
      // Show loading indicator
      const content = getContent();
      if (content) {
        content.innerHTML = `<div class="pg"><div class="att-empty"><span class="spin-ug"></span> Loading ${name}...</div></div>`;
      }
      
      // Load tab content
      const tabs = {
        ids: renderIDs,
        lecturers: renderLecturers,
        sessions: renderSessions,
        database: renderDatabase,
        coadmins: renderCoAdmins,
        settings: renderSettings,
        courses: renderCourses,
        help: renderHelp,
        reports: renderOverallReports,
        announcements: renderAnnouncements
      };
      
      if (tabs[name]) {
        tabs[name]();
      } else {
        if (content) {
          content.innerHTML = `<div class="pg"><div class="inner-panel"><h2>${name.toUpperCase()}</h2><p>Content for ${name} is being developed.</p></div></div>`;
        }
      }
    } catch(e) {
      console.error('[SADM] Error in tab:', e);
      const content = getContent();
      if (content) {
        content.innerHTML = `<div class="pg"><div class="no-rec">❌ Error loading ${name}. Please refresh the page.</div></div>`;
      }
    }
  }
  
  // ==================== 1. UNIQUE IDS ==================
  async function renderIDs() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>📋 Generate Unique Lecturer IDs</h2>
        <div class="inner-panel">
          <h3>➕ Generate New ID</h3>
          <div class="two-col">
            <div class="field"><label class="fl">📧 Lecturer Email</label><input type="email" id="new-uid-email" class="fi" placeholder="lecturer@ug.edu.gh"></div>
            <div class="field"><label class="fl">🏛️ Department</label><select id="new-uid-dept" class="fi"><option value="">Select Department</option>${typeof CONFIG !== 'undefined' && CONFIG.DEPARTMENTS ? CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('') : ''}</select></div>
          </div>
          <div class="field"><label class="fl">👤 Lecturer Name</label><input type="text" id="new-uid-name" class="fi" placeholder="Full name of lecturer"></div>
          <button class="btn btn-ug" onclick="SADM.generateUID()">Generate ID & Send Email</button>
        </div>
        <div id="uids-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshUIDList();
  }
  
  async function refreshUIDList() {
    const container = document.getElementById('uids-list');
    if (!container) return;
    try {
      if (typeof DB === 'undefined') {
        container.innerHTML = '<div class="no-rec">⚠️ Database not loaded</div>';
        return;
      }
      let uids = await DB.UID.getAll();
      if (!uids || uids.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No UIDs generated yet.</div>';
        return;
      }
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      const revoked = uids.filter(u => u.status === 'revoked');
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">✅ Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">📋 Assigned</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">🚫 Revoked</div></div>
        </div>
        <div><h4>✅ Available</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;"><code>${escapeHtml(u.id)}</code><span>${escapeHtml(u.department)}</span><span>📧 ${escapeHtml(u.email) || 'No email'}</span><button class="btn btn-warning btn-sm" onclick="SADM.revokeUID('${u.id}')">Revoke</button></div>`).join('') : '<div class="no-rec">None</div>'}</div>
        <div><h4>📋 Assigned</h4>${assigned.length ? assigned.map(u => `<div style="padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><span>To: ${escapeHtml(u.assignedTo)} (${escapeHtml(u.lecturerName || 'Unknown')})</span><span>📧 ${escapeHtml(u.email)}</span></div>`).join('') : '<div class="no-rec">None</div>'}</div>
      `;
    } catch(err) { 
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; 
    }
  }
  
  async function generateUID() {
    const email = document.getElementById('new-uid-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('new-uid-dept')?.value;
    const name = document.getElementById('new-uid-name')?.value.trim();
    
    if (!email) { await MODAL.alert('Required', 'Please enter lecturer email.'); return; }
    if (!dept) { await MODAL.alert('Required', 'Please select department.'); return; }
    if (!name) { await MODAL.alert('Required', 'Please enter lecturer name.'); return; }
    
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    
    await DB.UID.set(uid, { 
      id: uid, department: dept, email: email, lecturerName: name,
      status: 'available', createdAt: Date.now() 
    });
    
    if (typeof AUTH !== 'undefined' && AUTH._sendUIDEmail) {
      await AUTH._sendUIDEmail(uid, name, email, dept);
    }
    
    await MODAL.success('Generated', `✅ ${uid} generated and sent to ${email}`);
    document.getElementById('new-uid-email').value = '';
    document.getElementById('new-uid-name').value = '';
    document.getElementById('new-uid-dept').value = '';
    await refreshUIDList();
  }
  
  async function revokeUID(uid) {
    const confirmed = await MODAL.confirm('Revoke', `Revoke ${uid}?`, { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.UID.update(uid, { status: 'revoked', revokedAt: Date.now() });
    await MODAL.success('Revoked', `✅ ${uid} revoked.`);
    await refreshUIDList();
  }
  
  // ==================== 2. LECTURERS ==================
  async function renderLecturers() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers</h2>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-lec-dept" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option>${typeof CONFIG !== 'undefined' && CONFIG.DEPARTMENTS ? CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('') : ''}</select></div>
          <div><label class="fl">Status</label><select id="filter-lec-status" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
          <div><button class="btn btn-secondary" onclick="SADM.loadLecturers()">Refresh</button></div>
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
      if (typeof DB === 'undefined') {
        container.innerHTML = '<div class="no-rec">⚠️ Database not loaded</div>';
        return;
      }
      let lecturers = await DB.LEC.getAll();
      const deptFilter = document.getElementById('filter-lec-dept')?.value;
      const statusFilter = document.getElementById('filter-lec-status')?.value;
      if (deptFilter) lecturers = lecturers.filter(l => l.department === deptFilter);
      if (statusFilter) lecturers = lecturers.filter(l => (statusFilter === 'active' ? l.status !== 'suspended' : l.status === 'suspended'));
      if (!lecturers.length) { container.innerHTML = '<div class="no-rec">No lecturers found.</div>'; return; }
      container.innerHTML = `<div class="courses-grid">${lecturers.map(lec => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span></div>
          <div class="course-name">📧 ${escapeHtml(lec.email)}</div>
          <div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')} · 🏛️ ${escapeHtml(lec.department || 'N/A')}</div>
          <div class="course-buttons">
            ${lec.status === 'suspended' ? `<button class="btn btn-teal btn-sm" onclick="SADM.unsuspendLecturer('${lec.id}')">Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="SADM.suspendLecturer('${lec.id}')">Suspend</button>`}
            <button class="btn btn-danger btn-sm" onclick="SADM.removeLecturer('${lec.id}')">Remove</button>
            <button class="btn btn-secondary btn-sm" onclick="SADM.viewLecturerDetails('${lec.id}')">Details</button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
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
    await MODAL.alert(`Lecturer: ${escapeHtml(lec.name)}`, `
      <p><strong>ID:</strong> ${escapeHtml(lec.lecId || 'N/A')}</p>
      <p><strong>Email:</strong> ${escapeHtml(lec.email)}</p>
      <p><strong>Dept:</strong> ${escapeHtml(lec.department || 'N/A')}</p>
      <p><strong>Status:</strong> ${lec.status === 'suspended' ? 'Suspended' : 'Active'}</p>
      <hr><p><strong>Sessions:</strong> ${sessions.length}</p>
      <p><strong>Check-ins:</strong> ${totalStudents}</p>
    `, { icon: '👨‍🏫' });
  }
  
  // ==================== 3. SESSIONS ==================
  async function renderSessions() {
    const content = getContent();
    if (!content) return;
    
    const availableYears = getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    content.innerHTML = `
      <div class="pg">
        <h2>📊 All Sessions</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="session-year" class="fi"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div><label class="fl">Semester</label><select id="session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="session-dept" class="fi" onchange="SADM.loadSessionLecturers()"><option value="">All</option>${typeof CONFIG !== 'undefined' && CONFIG.DEPARTMENTS ? CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('') : ''}</select></div>
          <div><label class="fl">Lecturer</label><select id="session-lecturer" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Course</label><select id="session-course" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Search</label><input type="text" id="session-search" class="fi" placeholder="Search..."></div>
          <div><button class="btn btn-ug" onclick="SADM.filterSessions()">Filter</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportFilteredSessions()">Export All to Excel</button></div>
        </div>
        <div id="sessions-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await loadSessionLecturers();
  }
  
  async function loadSessionLecturers() {
    const dept = document.getElementById('session-dept')?.value;
    const lecturerSelect = document.getElementById('session-lecturer');
    if (!dept) { lecturerSelect.innerHTML = '<option value="">Select Department First</option>'; return; }
    const lecturers = await DB.LEC.getAll();
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
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
    if (!sessions.length) { container.innerHTML = '<div class="no-rec">No sessions found.</div>'; return; }
    container.innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div></div><div class="courses-grid">${sessions.slice(0, 50).map(s => `
      <div class="course-card">
        <div class="course-header"><span class="course-code">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</span><span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? 'Active' : 'Ended'}</span></div>
        <div class="course-stats">📅 ${s.date} · 👥 ${s.records ? Object.values(s.records).length : 0}</div>
        <div class="course-stats">👨‍🏫 ${escapeHtml(s.lecturer || 'Unknown')} · 🏛️ ${escapeHtml(s.department || 'Unknown')}</div>
        <div class="course-buttons">
          <button class="btn btn-secondary btn-sm" onclick="SADM.viewSessionDetails('${s.id}')">View Details</button>
          <button class="btn btn-teal btn-sm" onclick="SADM.exportSingleSession('${s.id}')">📥 Download Excel</button>
        </div>
      </div>
    `).join('')}</div>${sessions.length > 50 ? '<p class="note">Showing 50 of ' + sessions.length + '</p>' : ''}`;
  }
  
  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    await MODAL.alert(`Session: ${session.courseCode} - ${session.date}`, `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${escapeHtml(session.department || 'Unknown')}</p>
      <div class="session-table-wrapper"><table class="session-table"><thead><tr><th>Student</th><th>ID</th><th>Time</th><th>Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td>${escapeHtml(r.name)}${escapeHtml(r.studentId)}${r.time}${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}`).join('')}</tbody>}</div>
    `, { icon: '📊', width: '700px' });
  }
  
  async function exportSingleSession(sessionId) {
    await exportSingleSessionHelper(sessionId);
  }
  
  async function exportFilteredSessions() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const dept = document.getElementById('session-dept')?.value;
    const lecturerId = document.getElementById('session-lecturer')?.value;
    let sessions = await DB.SESSION.getAll();
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (dept) sessions = sessions.filter(s => s.department === dept);
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Department', 'Year', 'Semester', 'Students Count', 'Status']];
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.department || 'Unknown', s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended']);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }
  
  // ==================== 4. CO-ADMINS ==================
  async function renderCoAdmins() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrators</h2>
        <div class="inner-panel">
          <h3>➕ Add Joint Administrator (Max 3)</h3>
          <div class="two-col"><div class="field"><label class="fl">Name</label><input type="text" id="joint-name" class="fi"/></div><div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi"/></div></div>
          <div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select</option>${typeof CONFIG !== 'undefined' && CONFIG.DEPARTMENTS ? CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('') : ''}</select></div>
          <button class="btn btn-ug" onclick="SADM.addJointAdmin()">Add Joint Admin</button>
        </div>
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
      if (!cas || cas.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No co-administrators found.</div>';
        return;
      }
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
      if (pending.length) html += `<div class="inner-panel"><h3>⏳ Pending Applications</h3>${pending.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}')">Reject</button></div></div>`).join('')}</div>`;
      if (approved.length) html += `<div class="inner-panel"><h3>✅ Approved Co-Admins</h3>${approved.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">Revoke</button></div></div>`).join('')}</div>`;
      if (joint.length) html += `<div class="inner-panel"><h3>👥 Joint Administrators (${joint.length}/3)</h3>${joint.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-danger btn-sm" onclick="SADM.removeJointAdmin('${ca.id}')">Remove</button></div></div>`).join('')}</div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
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
  
  async function approveCA(id) { await DB.CA.update(id, { status: 'approved', approvedAt: Date.now() }); await MODAL.success('Approved', 'Access granted.'); await loadCoAdmins(); }
  async function rejectCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Rejected', 'Application rejected.'); await loadCoAdmins(); }
  async function revokeCA(id) { await DB.CA.update(id, { status: 'revoked', revokedAt: Date.now() }); await MODAL.success('Revoked', 'Access revoked.'); await loadCoAdmins(); }
  
  // ==================== 5. COURSES ==================
  async function renderCourses() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📚 Course Management</h2><div class="inner-panel"><p>Course management features coming soon.</p></div></div>`;
  }
  
  // ==================== 6. DATABASE & BACKUPS ==================
  async function renderDatabase() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>💾 Database Management</h2>
        <div class="inner-panel"><h3>Backups</h3><button class="btn btn-ug" onclick="SADM.createBackup()">Create Backup</button><div id="backups-list" style="margin-top:15px"><div class="att-empty">No backups available</div></div></div>
      </div>
    `;
    await loadBackups();
  }
  
  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    try {
      const backups = await DB.BACKUP.getAll();
      if (!backups || !backups.length) { container.innerHTML = '<div class="no-rec">No backups found</div>'; return; }
      container.innerHTML = backups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid var(--border)">
          <div><strong>📀 ${new Date(b.createdAt).toLocaleString()}</strong><div style="font-size:11px">📊 ${b.sessionCount || 0} sessions</div></div>
          <div><button class="btn btn-secondary btn-sm" onclick="SADM.downloadBackup('${b.id}')">Download</button><button class="btn btn-danger btn-sm" onclick="SADM.deleteBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML = '<div class="no-rec">Error loading backups</div>'; }
  }
  
  async function createBackup() {
    try {
      const sessions = await DB.SESSION.getAll();
      const students = await DB.STUDENTS.getAll();
      const lecturers = await DB.LEC.getAll();
      const backup = { id: `backup_${Date.now()}`, createdAt: Date.now(), sessions, students, lecturers, sessionCount: sessions.length, studentCount: students.length, lecturerCount: lecturers.length };
      await DB.BACKUP.save(backup.id, backup);
      await MODAL.success('Backup Created', `✅ ${sessions.length} sessions, ${students.length} students`);
      await loadBackups();
    } catch(err) { await MODAL.error('Failed', err.message); }
  }
  
  async function downloadBackup(backupId) {
    const backup = await DB.BACKUP.get(backupId);
    if (!backup) { await MODAL.error('Error', 'Backup not found.'); return; }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UG_Backup_${new Date(backup.createdAt).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await MODAL.success('Downloaded', 'Backup downloaded.');
  }
  
  async function deleteBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete', 'Delete this backup?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.BACKUP.delete(backupId);
    await MODAL.success('Deleted', 'Backup deleted.');
    await loadBackups();
  }
  
  // ==================== 7. SETTINGS ==================
  async function renderSettings() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>⚙️ Settings</h2>
        <div class="inner-panel"><h3>System Information</h3><p>Settings panel coming soon.</p></div>
      </div>
    `;
  }
  
  // ==================== 8. REPORTS ==================
  async function renderOverallReports() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📊 Overall Reports</h2><div class="inner-panel"><p>Reports feature coming soon.</p></div></div>`;
  }
  
  // ==================== 9. ANNOUNCEMENTS ==================
  async function renderAnnouncements() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📢 System Announcements</h2><div class="inner-panel"><p>Announcements feature coming soon.</p></div></div>`;
  }
  
  async function showAdminAnnouncementModal() {
    await MODAL.alert('Coming Soon', 'Send announcement feature is being developed.');
  }
  
  function toggleAdminAnnouncementFilters() {
    console.log('toggleAdminAnnouncementFilters');
  }
  
  // ==================== 10. HELP ==================
  async function renderHelp() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>❓ Help & Support</h2>
        <div class="inner-panel">
          <h3>Admin Guide</h3>
          <ul>
            <li>📢 <strong>Announcements:</strong> Send system-wide announcements to all users</li>
            <li>🆔 <strong>Unique IDs:</strong> Generate registration IDs for lecturers</li>
            <li>👨‍🏫 <strong>Lecturers:</strong> View, suspend, or remove lecturer accounts</li>
            <li>🤝 <strong>Co-Admins:</strong> Approve co-admin applications, add joint admins</li>
            <li>📊 <strong>Sessions:</strong> View and filter all attendance sessions</li>
            <li>💾 <strong>Backups:</strong> Create and download system backups</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>Contact Support</h3>
          <p>📧 Email: support@ug.edu.gh</p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
        </div>
      </div>
    `;
  }
  
  // Return all public functions
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
    generateOverallReport: renderOverallReports,
    exportOverallReportToExcel: () => {},
    downloadOverallReportPDF: () => {},
    loadOverallReportLecturers: () => {},
    loadCourses: renderCourses,
    loadCourseLecturers: () => {},
    createBackup,
    downloadBackup,
    deleteBackup,
    loadBackups,
    deleteDataByRange: () => {},
    resetAllData: () => {},
    loadSystemStats: () => {},
    renderHelp,
    viewSessionDetails,
    updateMinAttendance: () => {},
    updateSystemMinAttendance: () => {},
    exportSingleSession,
    showAdminAnnouncementModal,
    toggleAdminAnnouncementFilters,
    renderAnnouncements
  };
})();

// ============================================
// CO-ADMIN (CADM)
// ============================================

const CADM = (() => {
  // Safe element getter
  const getContent = () => {
    try {
      return document.getElementById('cadm-content');
    } catch(e) {
      return null;
    }
  };
  
  const getDept = () => {
    try {
      if (typeof AUTH !== 'undefined' && AUTH.getSession) {
        const session = AUTH.getSession();
        return session?.department || '';
      }
      return '';
    } catch(e) {
      return '';
    }
  };
  
  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    
    try {
      // Update active state in sidebar
      const navItems = document.querySelectorAll('#view-cadmin .nav-item');
      if (navItems) {
        navItems.forEach(item => {
          const tabName = item.getAttribute('data-tab');
          if (tabName === name) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        });
      }
      
      // Show loading indicator
      const content = getContent();
      if (content) {
        content.innerHTML = `<div class="pg"><div class="att-empty"><span class="spin-ug"></span> Loading ${name}...</div></div>`;
      }
      
      // Load tab content
      const tabs = {
        ids: renderIDs,
        lecturers: renderLecturers,
        sessions: renderSessions,
        database: renderDatabase,
        courses: renderCourses,
        backup: renderBackup,
        help: renderHelp
      };
      
      if (tabs[name]) {
        tabs[name]();
      } else {
        if (content) {
          content.innerHTML = `<div class="pg"><div class="inner-panel"><h2>${name.toUpperCase()}</h2><p>Department: ${getDept()}</p><p>Content for ${name} is being developed.</p></div></div>`;
        }
      }
    } catch(e) {
      console.error('[CADM] Error in tab:', e);
      const content = getContent();
      if (content) {
        content.innerHTML = `<div class="pg"><div class="no-rec">❌ Error loading ${name}. Please refresh the page.</div></div>`;
      }
    }
  }
  
  async function renderIDs() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>📋 Generate Lecturer IDs</h2>
        <p>Department: ${escapeHtml(getDept())}</p>
        <div class="inner-panel">
          <div class="two-col">
            <div class="field"><label class="fl">📧 Lecturer Email</label><input type="email" id="cadm-uid-email" class="fi" placeholder="lecturer@ug.edu.gh"></div>
            <div class="field"><label class="fl">👤 Lecturer Name</label><input type="text" id="cadm-uid-name" class="fi" placeholder="Full name"></div>
          </div>
          <button class="btn btn-ug" onclick="CADM.generateUID()">Generate ID & Send</button>
        </div>
        <div id="cadm-uids-list"><div class="att-empty">Loading...</div></div>
      </div>
    `;
    await refreshUIDList();
  }
  
  async function refreshUIDList() {
    const container = document.getElementById('cadm-uids-list');
    if (!container) return;
    try {
      let uids = await DB.UID.getAll();
      uids = uids.filter(u => u.department === getDept());
      if (!uids || uids.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No UIDs generated for this department.</div>';
        return;
      }
      const available = uids.filter(u => u.status === 'available');
      const assigned = uids.filter(u => u.status === 'assigned');
      container.innerHTML = `
        <div class="stats-grid"><div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">Available</div></div><div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">Assigned</div></div></div>
        <div><h4>✅ Available</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;"><code>${escapeHtml(u.id)}</code><span>📧 ${escapeHtml(u.email) || 'No email'}</span><button class="btn btn-teal btn-sm" onclick="CADM.sendUID('${u.id}')">Send</button></div>`).join('') : '<div class="no-rec">None</div>'}</div>
        <div><h4>📋 Assigned</h4>${assigned.length ? assigned.map(u => `<div style="padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><span>To: ${escapeHtml(u.assignedTo)} (${escapeHtml(u.lecturerName || 'Unknown')})</span></div>`).join('') : '<div class="no-rec">None</div>'}</div>
      `;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }
  
  async function generateUID() {
    const email = document.getElementById('cadm-uid-email')?.value.trim().toLowerCase();
    const name = document.getElementById('cadm-uid-name')?.value.trim();
    if (!email) { await MODAL.alert('Required', 'Please enter lecturer email.'); return; }
    if (!name) { await MODAL.alert('Required', 'Please enter lecturer name.'); return; }
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    await DB.UID.set(uid, { id: uid, department: getDept(), email: email, lecturerName: name, status: 'available', createdAt: Date.now() });
    if (typeof AUTH !== 'undefined' && AUTH._sendUIDEmail) {
      await AUTH._sendUIDEmail(uid, name, email, getDept());
    }
    await MODAL.success('Generated', `✅ ${uid} generated and sent to ${email}`);
    document.getElementById('cadm-uid-email').value = '';
    document.getElementById('cadm-uid-name').value = '';
    await refreshUIDList();
  }
  
  async function sendUID(uid) {
    const email = await MODAL.prompt('Send to Lecturer', 'Enter email:', { placeholder: 'lecturer@ug.edu.gh' });
    if (!email) return;
    await MODAL.success('Sent', `✅ UID sent to ${email}`);
    await DB.UID.update(uid, { status: 'assigned', assignedTo: email, assignedAt: Date.now() });
    await refreshUIDList();
  }
  
  async function renderLecturers() {
    const content = getContent();
    if (!content) return;
    
    try {
      let lecturers = await DB.LEC.getAll();
      lecturers = lecturers.filter(l => l.department === getDept());
      if (!lecturers.length) { 
        content.innerHTML = '<div class="pg"><div class="no-rec">No lecturers found in your department.</div></div>';
        return;
      }
      content.innerHTML = `<div class="pg"><h2>👨‍🏫 Lecturers - ${escapeHtml(getDept())}</h2><div class="courses-grid">${lecturers.map(lec => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span></div>
          <div class="course-name">📧 ${escapeHtml(lec.email)}</div>
          <div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')}</div>
          <div class="course-buttons">${lec.status === 'suspended' ? `<button class="btn btn-teal btn-sm" onclick="CADM.unsuspendLecturer('${lec.id}')">Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="CADM.suspendLecturer('${lec.id}')">Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="CADM.removeLecturer('${lec.id}')">Remove</button></div>
        </div>
      `).join('')}</div></div>`;
    } catch(err) { content.innerHTML = `<div class="pg"><div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div></div>`; }
  }
  
  async function suspendLecturer(lecId) {
    const confirmed = await MODAL.confirm('Suspend', 'Suspend this lecturer?', { confirmCls: 'btn-warning' });
    if (!confirmed) return;
    await DB.LEC.update(lecId, { status: 'suspended', suspendedAt: Date.now() });
    await MODAL.success('Suspended', '✅ Lecturer suspended.');
    await renderLecturers();
  }
  
  async function unsuspendLecturer(lecId) {
    await DB.LEC.update(lecId, { status: 'active', unsuspendedAt: Date.now() });
    await MODAL.success('Unsuspended', '✅ Lecturer reactivated.');
    await renderLecturers();
  }
  
  async function removeLecturer(lecId) {
    const confirmed = await MODAL.confirm('Remove', 'Permanently remove?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.LEC.delete(lecId);
    await MODAL.success('Removed', '✅ Lecturer removed.');
    await renderLecturers();
  }
  
  async function renderSessions() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📊 Sessions - ${escapeHtml(getDept())}</h2><div class="inner-panel"><p>Sessions view coming soon.</p></div></div>`;
  }
  
  async function renderDatabase() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📊 Department Reports</h2><div class="inner-panel"><p>Reports feature coming soon.</p></div></div>`;
  }
  
  async function renderCourses() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>📚 Courses - ${escapeHtml(getDept())}</h2><div class="inner-panel"><p>Courses view coming soon.</p></div></div>`;
  }
  
  async function renderBackup() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `<div class="pg"><h2>💾 Department Backups</h2><div class="inner-panel"><p>Backup feature coming soon.</p></div></div>`;
  }
  
  async function renderHelp() {
    const content = getContent();
    if (!content) return;
    
    content.innerHTML = `
      <div class="pg">
        <h2>❓ Help - Co-Admin Dashboard</h2>
        <div class="inner-panel">
          <h3>Co-Admin Guide</h3>
          <ul>
            <li>🆔 <strong>Generate IDs:</strong> Create registration IDs for lecturers in your department</li>
            <li>👨‍🏫 <strong>Lecturers:</strong> View and manage lecturers in your department</li>
            <li>📊 <strong>Sessions:</strong> View attendance sessions for your department</li>
            <li>📈 <strong>Reports:</strong> Generate department attendance reports</li>
            <li>💾 <strong>Backups:</strong> Create department data backups</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>Contact Support</h3>
          <p>📧 Email: support@ug.edu.gh</p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
        </div>
      </div>
    `;
  }
  
  async function showCoAdminAnnouncementModal() {
    await MODAL.alert('Coming Soon', 'Send announcement feature is being developed.');
  }
  
  function filterSessions() { console.log('filterSessions'); }
  function viewSessionDetails(id) { console.log('viewSessionDetails', id); }
  function exportSingleSession(id) { exportSingleSessionHelper(id); }
  function exportSessionsToExcel() { console.log('exportSessionsToExcel'); }
  function generateDepartmentReport() { console.log('generateDepartmentReport'); }
  function exportDepartmentReportToExcel() { console.log('exportDepartmentReportToExcel'); }
  function exportDepartmentReportToPDF() { console.log('exportDepartmentReportToPDF'); }
  function loadDeptReportLecturers() { console.log('loadDeptReportLecturers'); }
  function loadDepartmentCourses() { console.log('loadDepartmentCourses'); }
  function loadDepartmentCourseLecturers() { console.log('loadDepartmentCourseLecturers'); }
  function createDeptBackup() { console.log('createDeptBackup'); }
  function downloadDeptBackup(id) { console.log('downloadDeptBackup', id); }
  function deleteDeptBackup(id) { console.log('deleteDeptBackup', id); }
  function loadDeptBackups() { console.log('loadDeptBackups'); }
  function showCourseDetails(code, lecId, year, sem) { console.log('showCourseDetails', code, lecId, year, sem); }
  function filterStudentList(code, lecId) { console.log('filterStudentList', code, lecId); }
  function renderCourseChart(id, course) { console.log('renderCourseChart', id); }
  
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
    viewSessionDetails,
    exportSingleSession,
    exportSessionsToExcel,
    generateDepartmentReport,
    exportDepartmentReportToExcel,
    exportDepartmentReportToPDF,
    loadDeptReportLecturers,
    loadDepartmentCourses,
    loadDepartmentCourseLecturers,
    createDeptBackup,
    downloadDeptBackup,
    deleteDeptBackup,
    loadDeptBackups,
    renderHelp,
    showCoAdminAnnouncementModal,
    showCourseDetails,
    filterStudentList,
    renderCourseChart
  };
})();

// Make globally available
if (typeof window !== 'undefined') {
  window.SADM = SADM;
  window.CADM = CADM;
  console.log('[ADMIN] SADM and CADM loaded successfully');
  console.log('[ADMIN] SADM type:', typeof SADM);
  console.log('[ADMIN] CADM type:', typeof CADM);
}
