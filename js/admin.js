/* admin.js — Super Admin and Co-Admin Dashboards with Session Export and Lecturer Email on ID Generation */
'use strict';

// Helper functions
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Helper function to export a single session to Excel
async function exportSingleSessionHelper(sessionId) {
  if (typeof XLSX === 'undefined') {
    await MODAL.alert('Library Error', 'Excel export not loaded.');
    return;
  }
  
  try {
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.alert('Error', 'Session not found.');
      return;
    }
    
    const records = session.records ? Object.values(session.records) : [];
    
    const wsData = [
      [`Attendance Records - ${session.courseCode} - ${session.courseName}`],
      [`Session Date: ${session.date}`],
      [`Lecturer: ${session.lecturer || 'Unknown'}`],
      [`Department: ${session.department || 'Unknown'}`],
      [`Academic Year: ${session.year} - Semester ${session.semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Check-ins: ${records.length}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Check-in Time', 'Verification Method', 'Distance', 'Location Note']
    ];
    
    records.forEach((r, i) => {
      wsData.push([
        i + 1,
        r.studentId || '',
        r.name || '',
        r.time || new Date(r.checkedAt).toLocaleTimeString(),
        r.authMethod === 'webauthn' ? 'Biometric' : (r.authMethod === 'manual' ? 'Manual' : '—'),
        r.distanceMeters ? r.distanceMeters + 'm' : (r.locNote || '—'),
        r.locNote || ''
      ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}`);
    XLSX.writeFile(wb, `UG_Session_${session.courseCode}_${session.date.replace(/\s/g, '_')}.xlsx`);
    await MODAL.success('Export Complete', `✅ Session exported with ${records.length} records.`);
    
  } catch(err) {
    console.error('Export session error:', err);
    await MODAL.error('Export Failed', err.message);
  }
}

// ==================== SUPER ADMIN ==================
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');
  let currentReportData = null;
  let minAttendancePercentage = 75;

  // Load saved min attendance
  (function() {
    const saved = localStorage.getItem('min_attendance_percentage');
    if (saved && !isNaN(parseInt(saved))) minAttendancePercentage = parseInt(saved);
  })();

  function tab(name) {
    console.log('[SADM] Switching to tab:', name);
    
    // Update sidebar active state
    document.querySelectorAll('#view-sadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) item.classList.add('active');
      else item.classList.remove('active');
    });
    
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
    
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
    if (tabs[name]) tabs[name]();
  }

  // ==================== 1. UNIQUE IDs (with email) ==================
  async function renderIDs() {
    c().innerHTML = `
      <div class="pg">
        <h2>📋 Generate Unique Lecturer IDs</h2>
        <div class="inner-panel">
          <h3>➕ Generate New ID</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">📧 Lecturer Email</label>
              <input type="email" id="new-uid-email" class="fi" placeholder="lecturer@ug.edu.gh">
            </div>
            <div class="field">
              <label class="fl">🏛️ Department</label>
              <select id="new-uid-dept" class="fi">
                <option value="">Select Department</option>
                ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field">
            <label class="fl">👤 Lecturer Name</label>
            <input type="text" id="new-uid-name" class="fi" placeholder="Full name of lecturer">
          </div>
          <button class="btn btn-ug" onclick="SADM.generateUID()">Generate ID & Send Email</button>
        </div>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-uid-dept" class="fi" onchange="SADM.refreshUIDList()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-uid-status" class="fi" onchange="SADM.refreshUIDList()"><option value="">All</option><option value="available">Available</option><option value="assigned">Assigned</option><option value="revoked">Revoked</option></select></div>
        </div>
        <div id="uids-list"></div>
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
      container.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${available.length}</div><div class="stat-label">✅ Available</div></div>
          <div class="stat-card"><div class="stat-value">${assigned.length}</div><div class="stat-label">📋 Assigned</div></div>
          <div class="stat-card"><div class="stat-value">${revoked.length}</div><div class="stat-label">🚫 Revoked</div></div>
        </div>
        <div><h4>✅ Available</h4>${available.length ? available.map(u => `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;"><code>${escapeHtml(u.id)}</code><span>${escapeHtml(u.department)}</span><span>📧 ${escapeHtml(u.email) || 'No email'}</span><button class="btn btn-warning btn-sm" onclick="SADM.revokeUID('${u.id}')">Revoke</button></div>`).join('') : '<div class="no-rec">None</div>'}</div>
        <div><h4>📋 Assigned</h4>${assigned.length ? assigned.map(u => `<div style="padding:8px; border-bottom:1px solid var(--border)"><code>${escapeHtml(u.id)}</code><span>To: ${escapeHtml(u.assignedTo)} (${escapeHtml(u.lecturerName || 'Unknown')})</span><span>📧 ${escapeHtml(u.email)}</span></div>`).join('') : '<div class="no-rec">None</div>'}</div>
      `;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function generateUID() {
    const email = document.getElementById('new-uid-email')?.value.trim().toLowerCase();
    const dept = document.getElementById('new-uid-dept')?.value;
    const name = document.getElementById('new-uid-name')?.value.trim();
    
    if (!email) { await MODAL.alert('Required', 'Please enter lecturer email.'); return; }
    if (!dept) { await MODAL.alert('Required', 'Please select department.'); return; }
    if (!name) { await MODAL.alert('Required', 'Please enter lecturer name.'); return; }
    
    if (!email.endsWith('@ug.edu.gh') && !email.includes('@')) {
      await MODAL.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    const signupLink = `${CONFIG.SITE_URL}#lec-signup`;
    
    await DB.UID.set(uid, { 
      id: uid, 
      department: dept, 
      email: email,
      lecturerName: name,
      status: 'available', 
      createdAt: Date.now() 
    });
    
    // Send email with the UID
    const emailResult = await AUTH._sendUIDEmail(uid, name, email, dept);
    
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
    c().innerHTML = `
      <div class="pg">
        <h2>👨‍🏫 Lecturers</h2>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-lec-dept" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-lec-status" class="fi" onchange="SADM.loadLecturers()"><option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
          <div><button class="btn btn-secondary" onclick="SADM.loadLecturers()">Refresh</button></div>
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
          <div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span></div>
          <div class="course-name">📧 ${escapeHtml(lec.email)}</div>
          <div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')} · 🏛️ ${escapeHtml(lec.department || 'N/A')}</div>
          <div class="course-stats">📅 ${new Date(lec.createdAt).toLocaleDateString()}</div>
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

  // ==================== 3. SESSIONS (with export button) ==================
  async function renderSessions() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 All Sessions</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="session-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">Semester</label><select id="session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="session-dept" class="fi" onchange="SADM.loadSessionLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="session-lecturer" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Course</label><select id="session-course" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Search</label><input type="text" id="session-search" class="fi" placeholder="Search..."></div>
          <div><button class="btn btn-ug" onclick="SADM.filterSessions()">Filter</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportFilteredSessions()">Export All to Excel</button></div>
        </div>
        <div id="sessions-list"></div>
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
        <div class="course-stats">📖 ${s.year} Sem ${s.semester} · ⏱️ ${s.durationMins || 60} min</div>
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
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div><div class="stat-card"><div class="stat-value">${session.durationMins || 60}</div><div class="stat-label">Duration</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${escapeHtml(session.department || 'Unknown')}</p>
      <div class="session-table-wrapper"><table class="session-table"><thead><tr><th>Student</th><th>ID</th><th>Time</th><th>Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.time}</td><td>${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</td></tr>`).join('')}</tbody></table></div>
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
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Department', 'Year', 'Semester', 'Students Count', 'Status', 'Duration (mins)']];
    for (const s of sessions) {
      wsData.push([
        s.date, 
        s.courseCode, 
        s.courseName || '', 
        s.lecturer || 'Unknown', 
        s.department || 'Unknown', 
        s.year, 
        s.semester, 
        s.records ? Object.values(s.records).length : 0, 
        s.active ? 'Active' : 'Ended',
        s.durationMins || 60
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }

  // ==================== 4. CO-ADMINS ==================
  async function renderCoAdmins() {
    c().innerHTML = `
      <div class="pg">
        <h2>🤝 Co-Administrators</h2>
        <div class="inner-panel">
          <h3>➕ Add Joint Administrator (Max 3)</h3>
          <div class="two-col">
            <div class="field"><label class="fl">Name</label><input type="text" id="joint-name" class="fi"/></div>
            <div class="field"><label class="fl">Email</label><input type="email" id="joint-email" class="fi"/></div>
          </div>
          <div class="field"><label class="fl">Department</label><select id="joint-dept" class="fi"><option value="">Select</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <button class="btn btn-ug" onclick="SADM.addJointAdmin()">Add Joint Admin</button>
        </div>
        <div class="filter-bar">
          <div><label class="fl">Department</label><select id="filter-ca-dept" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Status</label><select id="filter-ca-status" class="fi" onchange="SADM.loadCoAdmins()"><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="revoked">Revoked</option><option value="joint">Joint</option></select></div>
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
      if (pending.length) html += `<div class="inner-panel"><h3>⏳ Pending</h3>${pending.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-teal btn-sm" onclick="SADM.approveCA('${ca.id}')">Approve</button><button class="btn btn-danger btn-sm" onclick="SADM.rejectCA('${ca.id}')">Reject</button></div></div>`).join('')}</div>`;
      if (approved.length) html += `<div class="inner-panel"><h3>✅ Approved</h3>${approved.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-warning btn-sm" onclick="SADM.revokeCA('${ca.id}')">Revoke</button></div></div>`).join('')}</div>`;
      if (joint.length) html += `<div class="inner-panel"><h3>👥 Joint (${joint.length}/3)</h3>${joint.map(ca => `<div class="course-card"><div class="course-header"><span class="course-code">${escapeHtml(ca.name)}</span></div><div class="course-name">${escapeHtml(ca.email)}</div><div class="course-stats">${escapeHtml(ca.department)}</div><div class="course-buttons"><button class="btn btn-danger btn-sm" onclick="SADM.removeJointAdmin('${ca.id}')">Remove</button></div></div>`).join('')}</div>`;
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
    const tempPass = Math.random().toString(36).substring(2, 10);
    const id = Math.random().toString(36).substring(2, 15);
    await DB.CA.set(id, { id, name, email, department: dept, pwHash: UI.hashPw(tempPass), status: 'joint', createdAt: Date.now() });
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
    c().innerHTML = `
      <div class="pg">
        <h2>📚 All Courses</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="course-year" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">Semester</label><select id="course-semester" class="fi" onchange="SADM.loadCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="course-dept" class="fi" onchange="SADM.loadCourses(); SADM.loadCourseLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="course-lecturer" class="fi" onchange="SADM.loadCourses()"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="SADM.loadCourses()">Filter</button></div>
        </div>
        <div id="courses-list"></div>
      </div>
    `;
  }

  async function loadCourseLecturers() {
    const dept = document.getElementById('course-dept')?.value;
    const lecturerSelect = document.getElementById('course-lecturer');
    if (!dept) { lecturerSelect.innerHTML = '<option value="">Select Department First</option>'; return; }
    const lecturers = await DB.LEC.getAll();
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
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
      if (!filtered.length) { container.innerHTML = '<div class="no-rec">No courses found.</div>'; return; }
      const grouped = _groupCourses(filtered, 'superAdmin');
      let html = '';
      for (const year of Object.keys(grouped).sort((a,b) => b - a)) {
        html += `<div style="margin-bottom:32px;"><h3>📅 ${year}</h3>`;
        for (const dept of Object.keys(grouped[year]).sort()) {
          html += `<div style="margin-left:20px;"><h4>🏛️ ${escapeHtml(dept)}</h4>`;
          for (const sem of Object.keys(grouped[year][dept]).sort((a,b) => a - b)) {
            html += `<div style="margin-left:20px;"><h5>📖 ${sem === '1' ? 'First Semester' : 'Second Semester'}</h5>`;
            for (const lecId of Object.keys(grouped[year][dept][sem]).sort()) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px;"><strong>👨‍🏫 ${escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">${lecGroup.courses.map(c => `<span class="pill">📚 ${escapeHtml(c.courseCode)} (${c.sessionCount} sessions)</span>`).join('')}</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  // Helper function to fetch all courses
  async function _fetchAllCourses() {
    const sessions = await DB.SESSION.getAll();
    const courseMap = new Map();
    for (const sess of sessions) {
      const key = `${sess.courseCode}_${sess.year}_${sess.semester}_${sess.lecFbId}`;
      if (!courseMap.has(key)) {
        const lec = await DB.LEC.get(sess.lecFbId);
        courseMap.set(key, {
          year: sess.year, semester: sess.semester, department: sess.department || lec?.department || 'Unknown',
          lecturerName: lec?.name || sess.lecturer, lecturerId: sess.lecFbId,
          courseCode: sess.courseCode, courseName: sess.courseName, sessionCount: 1
        });
      } else {
        const existing = courseMap.get(key);
        existing.sessionCount++;
      }
    }
    return Array.from(courseMap.values());
  }

  function _groupCourses(courses, role) {
    const groups = {};
    for (const c of courses) {
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.department]) groups[c.year][c.department] = {};
      if (!groups[c.year][c.department][c.semester]) groups[c.year][c.department][c.semester] = {};
      if (!groups[c.year][c.department][c.semester][c.lecturerId]) {
        groups[c.year][c.department][c.semester][c.lecturerId] = { lecturerName: c.lecturerName, courses: [] };
      }
      groups[c.year][c.department][c.semester][c.lecturerId].courses.push(c);
    }
    return groups;
  }

  // ==================== 6. DATABASE & BACKUPS ==================
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>💾 Database</h2>
        <div class="inner-panel"><h3>Backups</h3><button class="btn btn-ug" onclick="SADM.createBackup()">Create Backup</button><div id="backups-list" style="margin-top:15px"></div></div>
      </div>
    `;
    await loadBackups();
  }

  async function loadBackups() {
    const container = document.getElementById('backups-list');
    if (!container) return;
    try {
      const backups = await DB.BACKUP.getAll();
      if (!backups || !backups.length) { container.innerHTML = '<div class="no-rec">No backups</div>'; return; }
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
    c().innerHTML = `
      <div class="pg">
        <h2>⚙️ Settings</h2>
        <div class="inner-panel"><h3>System Stats</h3><div class="stats-grid">
          <div class="stat-card"><div class="stat-value" id="stat-total-users">-</div><div class="stat-label">Users</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-total-sessions">-</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-total-checkins">-</div><div class="stat-label">Check-ins</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-active-lecturers">-</div><div class="stat-label">Active Lecturers</div></div>
        </div></div>
        <div class="inner-panel"><h3>Min Attendance</h3><div class="two-col"><div class="field"><label class="fl">Minimum %</label><input type="number" id="min-attendance-percent" class="fi" value="${minAttendancePercentage}"></div><div><button class="btn btn-ug" onclick="SADM.updateSystemMinAttendance()">Save</button></div></div></div>
        <div class="inner-panel"><h3>Data Deletion</h3><div class="filter-bar">
          <div><label class="fl">Year From</label><input type="number" id="delete-year-from" class="fi"></div>
          <div><label class="fl">Year To</label><input type="number" id="delete-year-to" class="fi"></div>
          <div><label class="fl">Department</label><select id="delete-dept" class="fi"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
        </div><div style="display:flex; gap:10px; margin-top:15px"><button class="btn btn-warning" onclick="SADM.deleteDataByRange()">Delete Range</button><button class="btn btn-danger" onclick="SADM.resetAllData()">Reset All</button></div></div>
      </div>
    `;
    await loadSystemStats();
  }

  async function updateSystemMinAttendance() {
    const newValue = document.getElementById('min-attendance-percent')?.value;
    if (newValue && !isNaN(newValue)) {
      minAttendancePercentage = parseInt(newValue);
      localStorage.setItem('min_attendance_percentage', minAttendancePercentage);
      await MODAL.success('Updated', `Min attendance: ${minAttendancePercentage}%`);
    }
  }

  async function loadSystemStats() {
    try {
      const lecturers = await DB.LEC.getAll();
      const students = await DB.STUDENTS.getAll();
      const sessions = await DB.SESSION.getAll();
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      document.getElementById('stat-total-users').textContent = lecturers.length + students.length;
      document.getElementById('stat-total-sessions').textContent = sessions.length;
      document.getElementById('stat-total-checkins').textContent = totalCheckins;
      document.getElementById('stat-active-lecturers').textContent = lecturers.filter(l => l.status !== 'suspended').length;
    } catch(e) { console.warn(e); }
  }

  async function deleteDataByRange() {
    const fromYear = document.getElementById('delete-year-from')?.value;
    const toYear = document.getElementById('delete-year-to')?.value;
    const dept = document.getElementById('delete-dept')?.value;
    const confirmed = await MODAL.confirm('Delete Data', 'Delete data?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    let sessions = await DB.SESSION.getAll();
    if (fromYear && toYear) sessions = sessions.filter(s => s.year >= parseInt(fromYear) && s.year <= parseInt(toYear));
    if (dept) sessions = sessions.filter(s => s.department === dept);
    for (const session of sessions) await DB.SESSION.delete(session.id);
    await MODAL.success('Deleted', `Deleted ${sessions.length} sessions.`);
    await loadSystemStats();
  }

  async function resetAllData() {
    const confirmed = await MODAL.confirm('RESET ALL', 'Delete ALL data except backups? Type CONFIRM', { confirmLabel: 'CONFIRM', confirmCls: 'btn-danger' });
    if (!confirmed) return;
    const sessions = await DB.SESSION.getAll();
    for (const session of sessions) await DB.SESSION.delete(session.id);
    const lecturers = await DB.LEC.getAll();
    for (const lecturer of lecturers) await DB.LEC.delete(lecturer.id);
    const students = await DB.STUDENTS.getAll();
    for (const student of students) await DB.STUDENTS.delete(student.studentId);
    await MODAL.success('Reset', 'All data deleted. Backups preserved.');
    await loadSystemStats();
  }

  // ==================== 8. OVERALL REPORTS ==================
  async function renderOverallReports() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Overall Reports</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="overall-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
          <div><label class="fl">Semester</label><select id="overall-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="overall-dept" class="fi" onchange="SADM.loadOverallReportLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="overall-lecturer" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Min %</label><input type="number" id="min-attendance" class="fi" value="${minAttendancePercentage}" style="width:80px"></div>
          <div><button class="btn btn-ug" onclick="SADM.generateOverallReport()">Generate</button></div>
          <div><button class="btn btn-secondary" onclick="SADM.exportOverallReportToExcel()">Export Excel</button></div>
          <div><button class="btn btn-teal" onclick="SADM.downloadOverallReportPDF()">Export PDF</button></div>
          <div><button class="btn btn-outline" onclick="SADM.updateMinAttendance()">Update Min</button></div>
        </div>
        <div id="overall-report-results"></div>
      </div>
    `;
  }

  async function loadOverallReportLecturers() {
    const dept = document.getElementById('overall-dept')?.value;
    const lecturerSelect = document.getElementById('overall-lecturer');
    if (!dept) { lecturerSelect.innerHTML = '<option value="">Select Department First</option>'; return; }
    const lecturers = await DB.LEC.getAll();
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  async function updateMinAttendance() {
    const newValue = document.getElementById('min-attendance')?.value;
    if (newValue && !isNaN(newValue)) {
      minAttendancePercentage = parseInt(newValue);
      localStorage.setItem('min_attendance_percentage', minAttendancePercentage);
      await MODAL.success('Updated', `Min attendance: ${minAttendancePercentage}%`);
      await generateOverallReport();
    }
  }

  async function generateOverallReport() {
    const year = document.getElementById('overall-year')?.value;
    const semester = document.getElementById('overall-semester')?.value;
    const dept = document.getElementById('overall-dept')?.value;
    const lecturerId = document.getElementById('overall-lecturer')?.value;
    const container = document.getElementById('overall-report-results');
    container.innerHTML = '<div class="att-empty">Generating...</div>';
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
      const studentAttendance = new Map();
      for (const session of sessions) {
        const records = session.records ? Object.values(session.records) : [];
        for (const r of records) {
          if (!studentAttendance.has(r.studentId)) studentAttendance.set(r.studentId, { name: r.name, count: 0, total: sessions.length });
          studentAttendance.get(r.studentId).count++;
        }
      }
      const excellent = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= 80).length;
      const good = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendancePercentage && (s.count / s.total) * 100 < 80).length;
      const atRisk = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendancePercentage - 20 && (s.count / s.total) * 100 < minAttendancePercentage).length;
      const critical = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 < minAttendancePercentage - 20).length;
      container.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:20px; border-radius:12px; text-align:center">
          <h3>📊 Attendance Report</h3>
          <p>${year || 'All Years'} ${semester ? 'Sem ' + semester : ''} ${dept || 'All'}</p>
          <p>Min Required: ${minAttendancePercentage}%</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">Students</div></div>
          <div class="stat-card"><div class="stat-value">${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents.size, 1))) * 100) : 0}%</div><div class="stat-label">Avg</div></div>
        </div>
        <div class="report-chart"><h4>Distribution</h4>
          <div class="chart-bar"><span class="chart-label">Excellent (80-100%)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--teal);"></div><span>${excellent}</span></div>
          <div class="chart-bar"><span class="chart-label">Good (${minAttendancePercentage}-79%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--amber);"></div><span>${good}</span></div>
          <div class="chart-bar"><span class="chart-label">At Risk (${minAttendancePercentage - 20}-${minAttendancePercentage - 1}%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(uniqueStudents.size, 1)) * 100}%; background: #e67e22;"></div><span>${atRisk}</span></div>
          <div class="chart-bar"><span class="chart-label">Critical (<${minAttendancePercentage - 20}%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--danger);"></div><span>${critical}</span></div>
        </div>
        <div><h4>Recent Sessions</h4><table class="session-table"><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th><th></th></tr></thead><tbody>${sessions.slice(0, 20).map(s => `<td>${s.date}</td>         <td>${escapeHtml(s.courseCode)}</td>
         <td>${escapeHtml(s.lecturer)}</td>
         <td>${escapeHtml(s.department)}</td>
         <td>${s.records ? Object.values(s.records).length : 0}</td>
         <td><button class="btn btn-teal btn-sm" onclick="SADM.exportSingleSession('${s.id}')">📥 Download</button></td>
        </tr>
      `).join('')}</tbody>
     </table>${sessions.length > 20 ? '<p>Showing 20 of ' + sessions.length + '</p>' : ''}</div>
    `;
      currentReportData = { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents: uniqueStudents.size, excellent, good, atRisk, critical };
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function exportOverallReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    if (!currentReportData) { await MODAL.alert('No Data', 'Generate report first.'); return; }
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    const wsData = [
      ['Attendance Report'], [`Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}`], [`Department: ${dept || 'All'}`], [`Lecturer: ${lecturer?.name || 'All'}`],
      [`Min Attendance: ${minAttendancePercentage}%`], [], ['Summary', `Sessions: ${totalSessions}`, `Check-ins: ${totalCheckins}`, `Students: ${uniqueStudents}`, `Avg: ${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%`],
      [], ['Distribution', `Excellent: ${excellent}`, `Good: ${good}`, `At Risk: ${atRisk}`, `Critical: ${critical}`], [], ['Session Details'], ['Date', 'Course', 'Lecturer', 'Department', 'Year', 'Semester', 'Students', 'Status']
    ];
    for (const s of sessions) wsData.push([s.date, s.courseCode, s.lecturer, s.department, s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `UG_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Report exported.');
  }

  async function downloadOverallReportPDF() {
    if (!currentReportData) { await MODAL.alert('No Report', 'Generate first.'); return; }
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance Report</title><style>body{font-family:Arial;margin:40px}h1{color:#003087}table{width:100%;border-collapse:collapse}th{background:#003087;color:white;padding:10px}td{border:1px solid #ddd;padding:8px}</style></head><body><h1>📊 Attendance Report</h1><p>Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}</p><p>Department: ${dept || 'All'} | Lecturer: ${lecturer?.name || 'All'}</p><p>Min Required: ${minAttendancePercentage}%</p><h2>Summary</h2><p>Sessions: ${totalSessions} | Check-ins: ${totalCheckins} | Students: ${uniqueStudents} | Avg: ${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%</p><h2>Distribution</h2><p>Excellent: ${excellent} | Good: ${good} | At Risk: ${atRisk} | Critical: ${critical}</p><h2>Sessions</h2></table><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th></tr></thead><tbody>${sessions.slice(0, 30).map(s => `<tr><td>${s.date}</td><td>${escapeHtml(s.courseCode)}</td><td>${escapeHtml(s.lecturer)}</td><td>${escapeHtml(s.department)}</td><td>${s.records ? Object.values(s.records).length : 0}</td></tr>`).join('')}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ==================== 9. ANNOUNCEMENT SYSTEM ==================
  async function renderAnnouncements() {
    c().innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading announcements...</div>';
    
    try {
      const announcements = await DB.get('announcements/system');
      if (!announcements || Object.keys(announcements).length === 0) {
        c().innerHTML = '<div class="inner-panel"><div class="att-empty">📭 No system announcements yet.</div></div>';
        return;
      }
      
      const announcementList = Object.values(announcements).sort((a, b) => b.timestamp - a.timestamp);
      
      let html = `<div class="inner-panel"><h2>📢 System Announcements</h2>`;
      
      for (const ann of announcementList) {
        const priorityColor = ann.priority === 'danger' ? 'var(--danger)' : (ann.priority === 'warning' ? 'var(--amber)' : 'var(--teal)');
        const priorityIcon = ann.priority === 'danger' ? '🚨' : (ann.priority === 'warning' ? '⚠️' : 'ℹ️');
        
        html += `
          <div class="course-card" style="margin-bottom: 15px; border-left: 4px solid ${priorityColor};">
            <div class="course-header">
              <span class="course-code">${priorityIcon} ${escapeHtml(ann.title)}</span>
              <span class="badge" style="background: ${priorityColor};">${ann.priority === 'danger' ? 'Urgent' : (ann.priority === 'warning' ? 'Important' : 'Info')}</span>
            </div>
            <div class="course-name">📅 ${new Date(ann.timestamp).toLocaleString()}</div>
            <div class="course-stats">👤 Sent by: ${escapeHtml(ann.senderName)} (${ann.senderRole === 'superAdmin' ? 'Admin' : ann.senderRole})</div>
            <div class="course-stats">👥 Audience: ${ann.audience === 'all' ? 'Everyone' : ann.audience} ${ann.department ? ` - ${ann.department}` : ''}</div>
            <div class="message-content" style="margin-top: 10px; padding: 12px; background: var(--surface2); border-radius: 8px;">
              ${escapeHtml(ann.message)}
            </div>
          </div>
        `;
      }
      
      html += `</div>`;
      c().innerHTML = html;
      
    } catch(err) {
      console.error('Load announcements error:', err);
      c().innerHTML = '<div class="no-rec">❌ Error loading announcements</div>';
    }
  }

  async function showAdminAnnouncementModal() {
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="field">
          <label class="fl">👥 Send To</label>
          <select id="admin-announcement-audience" class="fi" onchange="SADM.toggleAdminAnnouncementFilters()">
            <option value="all">Everyone (All Users)</option>
            <option value="coadmins">Co-Admins Only</option>
            <option value="lecturers">Lecturers Only</option>
            <option value="students">Students Only</option>
            <option value="department">Specific Department</option>
          </select>
        </div>
        <div id="admin-dept-filter" style="display: none;">
          <div class="field">
            <label class="fl">🏛️ Department</label>
            <select id="admin-announcement-dept" class="fi">
              <option value="">Select Department</option>
              ${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <label class="fl">📢 Announcement Title</label>
          <input type="text" id="admin-announcement-title" class="fi" placeholder="e.g., System Maintenance, Policy Update, etc.">
        </div>
        <div class="field">
          <label class="fl">📝 Announcement Message</label>
          <textarea id="admin-announcement-message" class="fi" rows="5" placeholder="Type your announcement here..."></textarea>
        </div>
        <div class="field">
          <label class="fl">🔔 Priority Level</label>
          <select id="admin-announcement-priority" class="fi">
            <option value="info">ℹ️ Normal (Info)</option>
            <option value="warning">⚠️ Important (Warning)</option>
            <option value="danger">🚨 Urgent (Critical)</option>
          </select>
        </div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('📢 Send System Announcement', modalContent, { 
      confirmLabel: '📢 Send Announcement', 
      cancelLabel: 'Cancel',
      confirmCls: 'btn-ug',
      width: '550px'
    });
    
    if (!confirmed) return;
    
    const audience = document.getElementById('admin-announcement-audience')?.value;
    const department = document.getElementById('admin-announcement-dept')?.value;
    const title = document.getElementById('admin-announcement-title')?.value.trim();
    const message = document.getElementById('admin-announcement-message')?.value.trim();
    const priority = document.getElementById('admin-announcement-priority')?.value;
    
    if (!title || !message) {
      await MODAL.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const user = AUTH.getSession();
    
    try {
      let recipients = [];
      let notifiedCount = 0;
      
      if (audience === 'all') {
        const lecturers = await DB.LEC.getAll();
        const students = await DB.STUDENTS.getAll();
        const coadmins = await DB.CA.getAll();
        recipients = [...lecturers, ...students, ...coadmins];
      } else if (audience === 'coadmins') {
        recipients = await DB.CA.getAll();
      } else if (audience === 'lecturers') {
        let lecturers = await DB.LEC.getAll();
        if (department) {
          lecturers = lecturers.filter(l => l.department === department);
        }
        recipients = lecturers;
      } else if (audience === 'students') {
        let students = await DB.STUDENTS.getAll();
        if (department) {
          students = students.filter(s => s.department === department);
        }
        recipients = students;
      } else if (audience === 'department' && department) {
        const lecturers = await DB.LEC.getAll();
        const students = await DB.STUDENTS.getAll();
        const deptLecturers = lecturers.filter(l => l.department === department);
        const deptStudents = students.filter(s => s.department === department);
        recipients = [...deptLecturers, ...deptStudents];
      }
      
      const announcement = {
        id: announcementId,
        title: title,
        message: message,
        priority: priority,
        audience: audience,
        department: department || null,
        senderId: user?.id || 'admin',
        senderName: user?.name || 'System Administrator',
        senderRole: user?.role || 'superAdmin',
        timestamp: Date.now(),
        readBy: []
      };
      
      await DB.set(`announcements/system/${announcementId}`, announcement);
      
      for (const recipient of recipients) {
        let role = 'student';
        if (recipient.lecId || recipient.id?.startsWith('LEC')) role = 'lecturer';
        else if (recipient.status === 'approved' || recipient.status === 'joint') role = 'coAdmin';
        else if (recipient.studentId) role = 'student';
        
        const recipientId = recipient.studentId || recipient.id;
        
        await DB.set(`notifications/${role}/${recipientId}/announcements/${announcementId}`, {
          id: announcementId,
          title: `📢 ${title}`,
          message: `${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`,
          type: priority,
          timestamp: Date.now(),
          read: false,
          link: null,
          announcementId: announcementId
        });
        notifiedCount++;
      }
      
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${notifiedCount} recipients.`);
      
    } catch(err) {
      console.error('Send admin announcement error:', err);
      await MODAL.error('Error', 'Failed to send announcement. Please try again.');
    }
  }

  function toggleAdminAnnouncementFilters() {
    const audience = document.getElementById('admin-announcement-audience')?.value;
    const deptFilter = document.getElementById('admin-dept-filter');
    if (deptFilter) {
      deptFilter.style.display = (audience === 'department' || audience === 'lecturers' || audience === 'students') ? 'block' : 'none';
    }
  }

  // ==================== 10. HELP ==================
  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help</h2>
        <div class="inner-panel"><h3>Admin Guide</h3><ul>
          <li>📢 Announcements: Send system-wide announcements to all users or specific roles/departments</li>
          <li>🆔 Unique IDs: Generate lecturer registration IDs with email</li>
          <li>👨‍🏫 Lecturers: View, suspend, remove</li>
          <li>🤝 Co-Admins: Approve applications, add joint admins (max 3)</li>
          <li>📊 Sessions: Filter by year, semester, department, lecturer, course - Download individual session Excel</li>
          <li>📈 Reports: Generate reports with charts, PDF, set min attendance</li>
          <li>💾 Backups: Create/download system backups</li>
          <li>⚙️ Settings: Delete data by range, reset system</li>
          <li>📚 Courses: View grouped by year/semester/dept/lecturer</li>
        </ul></div>
        <div class="inner-panel"><h3>Contact</h3><p>📧 support@ug.edu.gh | 📞 +233 30 123 4567</p></div>
      </div>
    `;
  }

  // Add announcement button to admin sidebar
  //function addAnnouncementButtonToSidebar() {
   // const sidebarNav = document.querySelector('#view-sadmin .sidebar-nav');
    //if (!sidebarNav) return;
    
    //if (document.getElementById('admin-announcement-nav')) return;
    
    //const announcementNav = `
      //<div class="nav-section" id="admin-announcement-nav">
        //<div class="nav-section-title">ANNOUNCEMENTS</div>
        //<div class="nav-item" onclick="SADM.showAdminAnnouncementModal()">
          //<span class="nav-icon">📢</span><span>Send Announcement</span>
        //</div>
        //<div class="nav-item" data-tab="announcements" onclick="SADM.tab('announcements')">
          //<span class="nav-icon">📋</span><span>View Announcements</span>
        //</div>
      //</div>
    //`;
    
    //const accessSection = sidebarNav.querySelector('.nav-section');
    //if (accessSection) {
   //   accessSection.insertAdjacentHTML('afterend', announcementNav);
  //  }
 // }

  // Call this after sidebar loads
 // setTimeout(() => {
 //   addAnnouncementButtonToSidebar();
//  }, 500);

  return {
    tab, generateUID, revokeUID, refreshUIDList, loadLecturers, suspendLecturer, unsuspendLecturer, removeLecturer, viewLecturerDetails,
    approveCA, rejectCA, revokeCA, addJointAdmin, removeJointAdmin, loadCoAdmins, filterSessions, exportFilteredSessions, loadSessionLecturers,
    generateOverallReport, exportOverallReportToExcel, downloadOverallReportPDF, loadOverallReportLecturers, loadCourses, loadCourseLecturers,
    createBackup, downloadBackup, deleteBackup, loadBackups, deleteDataByRange, resetAllData, loadSystemStats, renderHelp, viewSessionDetails,
    updateMinAttendance, updateSystemMinAttendance, exportSingleSession, showAdminAnnouncementModal, toggleAdminAnnouncementFilters, renderAnnouncements
  };
})();

// ==================== CO-ADMIN ==================
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';
  let currentDeptReportData = null;

  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    document.querySelectorAll('#view-cadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) item.classList.add('active');
      else item.classList.remove('active');
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">📭 Loading…</div></div>';
    const fns = { ids: renderIDs, lecturers: renderLecturers, sessions: renderSessions, database: renderDatabase, courses: renderCourses, backup: renderBackup, help: renderHelp };
    if (fns[name]) fns[name]();
  }

  async function renderIDs() {
    c().innerHTML = `<div class="pg"><h2>📋 Generate IDs</h2><p>Department: ${escapeHtml(dept())}</p><div class="inner-panel"><div class="two-col"><div class="field"><label class="fl">📧 Lecturer Email</label><input type="email" id="cadm-uid-email" class="fi" placeholder="lecturer@ug.edu.gh"></div><div class="field"><label class="fl">👤 Lecturer Name</label><input type="text" id="cadm-uid-name" class="fi" placeholder="Full name"></div></div><button class="btn btn-ug" onclick="CADM.generateUID()">Generate ID & Send</button></div><div id="cadm-uids-list"></div></div>`;
    await refreshUIDList();
  }

  async function refreshUIDList() {
    const container = document.getElementById('cadm-uids-list');
    if (!container) return;
    try {
      let uids = await DB.UID.getAll();
      uids = uids.filter(u => u.department === dept());
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
    
    if (!email.endsWith('@ug.edu.gh') && !email.includes('@')) {
      await MODAL.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    
    const uid = 'LEC-' + Math.random().toString(36).substring(2, 12).toUpperCase();
    
    await DB.UID.set(uid, { 
      id: uid, 
      department: dept(), 
      email: email,
      lecturerName: name,
      status: 'available', 
      createdAt: Date.now() 
    });
    
    await AUTH._sendUIDEmail(uid, name, email, dept());
    
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
    try {
      let lecturers = await DB.LEC.getAll();
      lecturers = lecturers.filter(l => l.department === dept());
      if (!lecturers.length) { c().innerHTML = '<div class="pg"><div class="no-rec">No lecturers</div></div>'; return; }
      c().innerHTML = `<div class="pg"><h2>👨‍🏫 Lecturers - ${escapeHtml(dept())}</h2><div class="courses-grid">${lecturers.map(lec => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">👨‍🏫 ${escapeHtml(lec.name)}</span><span class="badge ${lec.status === 'suspended' ? 'badge-red' : 'badge'}">${lec.status === 'suspended' ? 'Suspended' : 'Active'}</span></div>
          <div class="course-name">📧 ${escapeHtml(lec.email)}</div>
          <div class="course-stats">🆔 ${escapeHtml(lec.lecId || 'N/A')}</div>
          <div class="course-buttons">${lec.status === 'suspended' ? `<button class="btn btn-teal btn-sm" onclick="CADM.unsuspendLecturer('${lec.id}')">Unsuspend</button>` : `<button class="btn btn-warning btn-sm" onclick="CADM.suspendLecturer('${lec.id}')">Suspend</button>`}<button class="btn btn-danger btn-sm" onclick="CADM.removeLecturer('${lec.id}')">Remove</button></div>
        </div>
      `).join('')}</div></div>`;
    } catch(err) { c().innerHTML = `<div class="pg"><div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div></div>`; }
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

  // ==================== CO-ADMIN SESSIONS (with export button) ==================
  async function renderSessions() {
    c().innerHTML = `<div class="pg"><h2>📊 Sessions - ${escapeHtml(dept())}</h2><div class="filter-bar"><div><label class="fl">Year</label><select id="co-session-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div><div><label class="fl">Semester</label><select id="co-session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div><div><label class="fl">Lecturer</label><select id="co-session-lecturer" class="fi"><option value="">All</option></select></div><div><button class="btn btn-ug" onclick="CADM.filterSessions()">Filter</button></div><div><button class="btn btn-secondary" onclick="CADM.exportSessionsToExcel()">Export All to Excel</button></div></div><div id="co-sessions-list"></div></div>`;
    await loadCoSessionLecturers();
  }

  async function loadCoSessionLecturers() {
    const lecturers = await DB.LEC.getAll();
    const select = document.getElementById('co-session-lecturer');
    if (select) select.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept()).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  async function filterSessions() {
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    const container = document.getElementById('co-sessions-list');
    container.innerHTML = '<div class="att-empty">Loading...</div>';
    try {
      let sessions = await DB.SESSION.getAll();
      sessions = sessions.filter(s => s.department === dept());
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!sessions.length) { container.innerHTML = '<div class="no-rec">No sessions</div>'; return; }
      container.innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total</div></div></div><div class="courses-grid">${sessions.slice(0, 50).map(s => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</span><span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? 'Active' : 'Ended'}</span></div>
          <div class="course-stats">📅 ${s.date} · 👥 ${s.records ? Object.values(s.records).length : 0}</div>
          <div class="course-stats">👨‍🏫 ${escapeHtml(s.lecturer || 'Unknown')} · 🏛️ ${escapeHtml(s.department || 'Unknown')}</div>
          <div class="course-stats">📖 ${s.year} Sem ${s.semester}</div>
          <div class="course-buttons">
            <button class="btn btn-secondary btn-sm" onclick="CADM.viewSessionDetails('${s.id}')">View Details</button>
            <button class="btn btn-teal btn-sm" onclick="CADM.exportSingleSession('${s.id}')">📥 Download Excel</button>
          </div>
        </div>
      `).join('')}</div>${sessions.length > 50 ? '<p>Showing 50 of ' + sessions.length + '</p>' : ''}`;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    await MODAL.alert(`Session: ${session.courseCode}`, `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${escapeHtml(session.department || 'Unknown')}</p>
      <div class="session-table-wrapper"><table class="session-table"><thead><tr><th>Student</th><th>ID</th><th>Time</th><th>Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.time}</td><td>${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</td></tr>`).join('')}</tbody>}</div>
    `, { icon: '📊', width: '700px' });
  }

  async function exportSingleSession(sessionId) {
    await exportSingleSessionHelper(sessionId);
  }

  async function exportSessionsToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    let sessions = await DB.SESSION.getAll();
    sessions = sessions.filter(s => s.department === dept());
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Department', 'Year', 'Semester', 'Students Count', 'Status']];
    for (const s of sessions) wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.department || 'Unknown', s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Dept_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }

  // ==================== CO-ADMIN ANNOUNCEMENT SYSTEM ==================
  async function showCoAdminAnnouncementModal() {
    const myDept = dept();
    
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="field">
          <label class="fl">👥 Send To</label>
          <select id="coadmin-announcement-audience" class="fi">
            <option value="lecturers">Lecturers in ${escapeHtml(myDept)}</option>
            <option value="students">Students in ${escapeHtml(myDept)}</option>
            <option value="both">Both Lecturers & Students in ${escapeHtml(myDept)}</option>
          </select>
        </div>
        <div class="field">
          <label class="fl">📢 Announcement Title</label>
          <input type="text" id="coadmin-announcement-title" class="fi" placeholder="e.g., Department Meeting, Important Update">
        </div>
        <div class="field">
          <label class="fl">📝 Announcement Message</label>
          <textarea id="coadmin-announcement-message" class="fi" rows="5" placeholder="Type your announcement here..."></textarea>
        </div>
        <div class="field">
          <label class="fl">🔔 Priority Level</label>
          <select id="coadmin-announcement-priority" class="fi">
            <option value="info">ℹ️ Normal (Info)</option>
            <option value="warning">⚠️ Important (Warning)</option>
            <option value="danger">🚨 Urgent (Critical)</option>
          </select>
        </div>
        <p class="note">📧 This announcement will be sent to all ${escapeHtml(myDept)} department members.</p>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('📢 Send Department Announcement', modalContent, { 
      confirmLabel: '📢 Send Announcement', 
      cancelLabel: 'Cancel',
      confirmCls: 'btn-ug',
      width: '550px'
    });
    
    if (!confirmed) return;
    
    const audience = document.getElementById('coadmin-announcement-audience')?.value;
    const title = document.getElementById('coadmin-announcement-title')?.value.trim();
    const message = document.getElementById('coadmin-announcement-message')?.value.trim();
    const priority = document.getElementById('coadmin-announcement-priority')?.value;
    
    if (!title || !message) {
      await MODAL.alert('Missing Info', 'Please fill in all fields.');
      return;
    }
    
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const user = AUTH.getSession();
    const myDeptName = dept();
    
    try {
      let recipients = [];
      
      if (audience === 'lecturers' || audience === 'both') {
        const lecturers = await DB.LEC.getAll();
        const deptLecturers = lecturers.filter(l => l.department === myDeptName);
        recipients.push(...deptLecturers);
      }
      
      if (audience === 'students' || audience === 'both') {
        const students = await DB.STUDENTS.getAll();
        const deptStudents = students.filter(s => s.department === myDeptName);
        recipients.push(...deptStudents);
      }
      
      const announcement = {
        id: announcementId,
        title: title,
        message: message,
        priority: priority,
        audience: audience,
        department: myDeptName,
        senderId: user?.id,
        senderName: user?.name || 'Co-Administrator',
        senderRole: 'coAdmin',
        timestamp: Date.now(),
        readBy: []
      };
      
      await DB.set(`announcements/department/${myDeptName}/${announcementId}`, announcement);
      
      let notifiedCount = 0;
      for (const recipient of recipients) {
        let role = 'student';
        if (recipient.lecId || recipient.id?.startsWith('LEC')) role = 'lecturer';
        else if (recipient.studentId) role = 'student';
        
        const recipientId = recipient.studentId || recipient.id;
        
        await DB.set(`notifications/${role}/${recipientId}/announcements/${announcementId}`, {
          id: announcementId,
          title: `📢 ${title}`,
          message: `${myDeptName}: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`,
          type: priority,
          timestamp: Date.now(),
          read: false,
          link: null,
          announcementId: announcementId
        });
        notifiedCount++;
      }
      
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${notifiedCount} recipients in ${myDeptName} department.`);
      
    } catch(err) {
      console.error('Send co-admin announcement error:', err);
      await MODAL.error('Error', 'Failed to send announcement. Please try again.');
    }
  }

  // Add announcement button to co-admin sidebar
  function addCoAdminAnnouncementButton() {
    const sidebarNav = document.querySelector('#view-cadmin .sidebar-nav');
    if (!sidebarNav) return;
    
    if (document.getElementById('coadmin-announcement-nav')) return;
    
    const announcementNav = `
      <div class="nav-section" id="coadmin-announcement-nav">
        <div class="nav-section-title">ANNOUNCEMENTS</div>
        <div class="nav-item" onclick="CADM.showCoAdminAnnouncementModal()">
          <span class="nav-icon">📢</span><span>Send Announcement</span>
        </div>
      </div>
    `;
    
    const accessSection = sidebarNav.querySelector('.nav-section');
    if (accessSection) {
      accessSection.insertAdjacentHTML('afterend', announcementNav);
    }
  }

  setTimeout(() => {
    addCoAdminAnnouncementButton();
  }, 500);

  // ==================== CO-ADMIN REPORTS ==================
  async function renderDatabase() {
    c().innerHTML = `<div class="pg"><h2>📊 Department Reports</h2><div class="filter-bar"><div><label class="fl">Year</label><select id="co-report-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div><div><label class="fl">Semester</label><select id="co-report-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div><div><label class="fl">Lecturer</label><select id="co-report-lecturer" class="fi"><option value="">All</option></select></div><div><button class="btn btn-ug" onclick="CADM.generateDeptReport()">Generate</button></div><div><button class="btn btn-secondary" onclick="CADM.exportDeptReportToExcel()">Export Excel</button></div><div><button class="btn btn-teal" onclick="CADM.exportDeptReportToPDF()">Export PDF</button></div></div><div id="co-report-results"></div></div>`;
    await loadDeptReportLecturers();
  }

  async function loadDeptReportLecturers() {
    const select = document.getElementById('co-report-lecturer');
    if (select) select.innerHTML = '<option value="">All Lecturers</option>' + (await DB.LEC.getAll()).filter(l => l.department === dept()).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  async function generateDeptReport() {
    const year = document.getElementById('co-report-year')?.value;
    const semester = document.getElementById('co-report-semester')?.value;
    const lecturerId = document.getElementById('co-report-lecturer')?.value;
    const container = document.getElementById('co-report-results');
    container.innerHTML = '<div class="att-empty">Generating...</div>';
    try {
      let sessions = await DB.SESSION.getAll();
      sessions = sessions.filter(s => s.department === dept());
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!sessions.length) { container.innerHTML = '<div class="no-rec">No data</div>'; return; }
      
      const totalSessions = sessions.length;
      const totalCheckins = sessions.reduce((sum, s) => sum + (s.records ? Object.values(s.records).length : 0), 0);
      const uniqueStudents = new Set();
      sessions.forEach(s => { if (s.records) Object.values(s.records).forEach(r => uniqueStudents.add(r.studentId)); });
      
      container.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:15px; border-radius:10px; text-align:center">
          <h3>${escapeHtml(dept())} Department Report</h3>
          <p>${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All')}</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">Students</div></div>
        </div>
        <div><h4>Recent Sessions</h4><div class="courses-grid">${sessions.slice(0, 20).map(s => `
          <div class="course-card">
            <div class="course-header"><span class="course-code">📅 ${s.date}</span><span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? 'Active' : 'Ended'}</span></div>
            <div class="course-name">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</div>
            <div class="course-stats">👨‍🏫 ${escapeHtml(s.lecturer)} · 👥 ${s.records ? Object.values(s.records).length : 0}</div>
            <div class="course-buttons">
              <button class="btn btn-secondary btn-sm" onclick="CADM.viewSessionDetails('${s.id}')">View Details</button>
              <button class="btn btn-teal btn-sm" onclick="CADM.exportSingleSession('${s.id}')">📥 Download Excel</button>
            </div>
          </div>
        `).join('')}</div>${sessions.length > 20 ? '<p class="note">Showing 20 of ' + sessions.length + '</p>' : ''}</div>
      `;
      currentDeptReportData = { sessions, year, semester, dept: dept(), totalSessions, totalCheckins, uniqueStudents: uniqueStudents.size };
      
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function exportDeptReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    if (!currentDeptReportData) { await MODAL.alert('No Data', 'Generate first.'); return; }
    const { sessions, year, semester, dept, totalSessions, totalCheckins, uniqueStudents } = currentDeptReportData;
    const wsData = [[`${dept} Department Report`], [`Period: ${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All')}`], [], ['Session Details'], ['Date', 'Course Code', 'Course Name', 'Lecturer', 'Students', 'Semester', 'Status']];
    for (const s of sessions) wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.records ? Object.values(s.records).length : 0, `${s.year} Sem ${s.semester}`, s.active ? 'Active' : 'Ended']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dept_Report');
    XLSX.writeFile(wb, `UG_${dept}_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Report exported.');
  }

  async function exportDeptReportToPDF() {
    if (!currentDeptReportData) { await MODAL.alert('No Report', 'Generate first.'); return; }
    const { sessions, year, semester, dept, totalSessions, totalCheckins, uniqueStudents } = currentDeptReportData;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${dept} Department Report</title><style>body{font-family:Arial;margin:40px}h1{color:#003087}table{width:100%;border-collapse:collapse}th{background:#003087;color:white;padding:10px}td{border:1px solid #ddd;padding:8px}</style></head><body><h1>📊 ${escapeHtml(dept)} Department Report</h1><p>Period: ${year || 'All Years'} - ${semester === '1' ? 'First Semester' : (semester === '2' ? 'Second Semester' : 'All')}</p><p>Generated: ${new Date().toLocaleString()}</p><h2>Summary</h2><p>Sessions: ${totalSessions} | Check-ins: ${totalCheckins} | Students: ${uniqueStudents}</p><h2>Session Details</h2></table><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th></tr></thead><tbody>${sessions.slice(0, 30).map(s => `<tr><td>${s.date}</td><td>${escapeHtml(s.courseCode)}          <td>${escapeHtml(s.lecturer)}</td>
          <td>${escapeHtml(s.department)}</td>
          <td>${s.records ? Object.values(s.records).length : 0}</td>
        </tr>
      `).join('')}</tbody>
    </table></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ==================== CO-ADMIN COURSES ==================
  async function renderCourses() {
    c().innerHTML = `<div class="pg"><h2>📚 Courses - ${escapeHtml(dept())}</h2><div class="filter-bar"><div><label class="fl">Year</label><select id="co-course-year" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div><div><label class="fl">Semester</label><select id="co-course-semester" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div><div><label class="fl">Lecturer</label><select id="co-course-lecturer" class="fi" onchange="CADM.loadDepartmentCourses()"><option value="">All</option></select></div><div><button class="btn btn-ug" onclick="CADM.loadDepartmentCourses()">Filter</button></div></div><div id="co-courses-list"></div></div>`;
    await loadDepartmentCourseLecturers();
  }

  async function loadDepartmentCourseLecturers() {
    const select = document.getElementById('co-course-lecturer');
    if (select) select.innerHTML = '<option value="">All Lecturers</option>' + (await DB.LEC.getAll()).filter(l => l.department === dept()).map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
  }

  async function loadDepartmentCourses() {
    const container = document.getElementById('co-courses-list');
    const year = document.getElementById('co-course-year')?.value;
    const semester = document.getElementById('co-course-semester')?.value;
    const lecturerId = document.getElementById('co-course-lecturer')?.value;
    container.innerHTML = '<div class="att-empty">Loading...</div>';
    try {
      let allCourses = await _fetchAllCoursesForDept();
      let filtered = allCourses.filter(c => c.department === dept());
      if (year) filtered = filtered.filter(c => c.year === parseInt(year));
      if (semester) filtered = filtered.filter(c => c.semester === parseInt(semester));
      if (lecturerId) filtered = filtered.filter(c => c.lecturerId === lecturerId);
      if (!filtered.length) { container.innerHTML = '<div class="no-rec">No courses found.</div>'; return; }
      const grouped = _groupCoursesForDept(filtered);
      let html = '';
      for (const year of Object.keys(grouped).sort((a,b) => b - a)) {
        html += `<div style="margin-bottom:24px;"><h3>📅 ${year}</h3>`;
        for (const sem of Object.keys(grouped[year]).sort((a,b) => a - b)) {
          html += `<div style="margin-left:20px;"><h4>📖 ${sem === '1' ? 'First Semester' : 'Second Semester'}</h4>`;
          for (const lecId of Object.keys(grouped[year][sem]).sort()) {
            const lecGroup = grouped[year][sem][lecId];
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">${lecGroup.courses.map(c => `<span class="pill">📚 ${escapeHtml(c.courseCode)} (${c.sessionCount} sessions)</span>`).join('')}</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`; }
  }

  async function _fetchAllCoursesForDept() {
    const sessions = await DB.SESSION.getAll();
    const courseMap = new Map();
    for (const sess of sessions) {
      const key = `${sess.courseCode}_${sess.year}_${sess.semester}_${sess.lecFbId}`;
      if (!courseMap.has(key)) {
        const lec = await DB.LEC.get(sess.lecFbId);
        courseMap.set(key, {
          year: sess.year, semester: sess.semester, department: sess.department || lec?.department || 'Unknown',
          lecturerName: lec?.name || sess.lecturer, lecturerId: sess.lecFbId,
          courseCode: sess.courseCode, courseName: sess.courseName, sessionCount: 1
        });
      } else {
        courseMap.get(key).sessionCount++;
      }
    }
    return Array.from(courseMap.values());
  }

  function _groupCoursesForDept(courses) {
    const groups = {};
    for (const c of courses) {
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.semester]) groups[c.year][c.semester] = {};
      if (!groups[c.year][c.semester][c.lecturerId]) {
        groups[c.year][c.semester][c.lecturerId] = { lecturerName: c.lecturerName, courses: [] };
      }
      groups[c.year][c.semester][c.lecturerId].courses.push(c);
    }
    return groups;
  }

  // ==================== CO-ADMIN BACKUP ==================
  async function renderBackup() {
    c().innerHTML = `<div class="pg"><h2>💾 Department Backups</h2><button class="btn btn-ug" onclick="CADM.createDeptBackup()">Create Backup</button><div id="dept-backups-list" style="margin-top:20px"></div></div>`;
    await loadDeptBackups();
  }

  async function loadDeptBackups() {
    const container = document.getElementById('dept-backups-list');
    if (!container) return;
    try {
      const backups = await DB.BACKUP.getAll();
      const deptBackups = backups.filter(b => b.department === dept());
      if (!deptBackups.length) { container.innerHTML = '<div class="no-rec">No backups</div>'; return; }
      container.innerHTML = deptBackups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid var(--border)">
          <div><strong>📀 ${new Date(b.createdAt).toLocaleString()}</strong><div>📊 ${b.sessionCount || 0} sessions</div></div>
          <div><button class="btn btn-secondary btn-sm" onclick="CADM.downloadDeptBackup('${b.id}')">Download</button><button class="btn btn-danger btn-sm" onclick="CADM.deleteDeptBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML = '<div class="no-rec">Error loading backups</div>'; }
  }

  async function createDeptBackup() {
    try {
      const myDept = dept();
      const sessions = await DB.SESSION.getAll();
      const deptSessions = sessions.filter(s => s.department === myDept);
      const backup = { id: `dept_backup_${myDept.replace(/\s/g, '_')}_${Date.now()}`, createdAt: Date.now(), department: myDept, sessions: deptSessions, sessionCount: deptSessions.length };
      await DB.BACKUP.save(backup.id, backup);
      await MODAL.success('Backup Created', `✅ ${deptSessions.length} sessions backed up.`);
      await loadDeptBackups();
    } catch(err) { await MODAL.error('Failed', err.message); }
  }

  async function downloadDeptBackup(backupId) {
    const backup = await DB.BACKUP.get(backupId);
    if (!backup) { await MODAL.error('Error', 'Backup not found.'); return; }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `UG_Dept_Backup_${backup.department}_${new Date(backup.createdAt).toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await MODAL.success('Downloaded', 'Backup downloaded.');
  }

  async function deleteDeptBackup(backupId) {
    const confirmed = await MODAL.confirm('Delete', 'Delete this backup?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    await DB.BACKUP.delete(backupId);
    await MODAL.success('Deleted', 'Backup deleted.');
    await loadDeptBackups();
  }

  // ==================== CO-ADMIN HELP ==================
  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help</h2>
        <div class="inner-panel"><h3>Co-Admin Guide</h3><ul>
          <li>📢 Announcements: Send announcements to lecturers and students in your department</li>
          <li>🆔 Generate IDs: Create unique IDs for your department lecturers (with email)</li>
          <li>👨‍🏫 Lecturers: View, suspend, remove in your department</li>
          <li>📊 Sessions: Filter by year, semester, lecturer - Download individual session Excel</li>
          <li>📈 Reports: Department reports, export Excel/PDF</li>
          <li>💾 Backup: Create/download department backups</li>
          <li>📚 Courses: Filter by year, semester, lecturer</li>
        </ul></div>
        <div class="inner-panel"><h3>Contact</h3><p>📧 support@ug.edu.gh | 📞 +233 30 123 4567</p></div>
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
    viewSessionDetails,
    exportSingleSession,
    exportSessionsToExcel,
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
    renderHelp,
    showCoAdminAnnouncementModal
  };
})();

// Make globally available
if (typeof SADM !== 'undefined') { window.SADM = SADM; console.log('[ADMIN] SADM loaded'); }
if (typeof CADM !== 'undefined') { window.CADM = CADM; console.log('[ADMIN] CADM loaded'); }
