/* admin-super-data.js — Super Admin: Sessions, Courses, Database, Backups */
'use strict';

const ADMIN_SUPER_DATA = (() => {
  const core = () => window.ADMIN_CORE;
  
  // ==================== SESSIONS MANAGEMENT ====================
  async function renderSessions() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📊 All Sessions</h2>
        <div class="filter-bar" style="flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
          <div><label class="fl">Year</label><select id="session-year" class="fi"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div><label class="fl">Semester</label><select id="session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="session-dept" class="fi" onchange="ADMIN_SUPER_DATA.loadSessionLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="session-lecturer" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Course</label><select id="session-course" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Search</label><input type="text" id="session-search" class="fi" placeholder="Search..."></div>
          <div><button class="btn btn-ug" onclick="ADMIN_SUPER_DATA.filterSessions()">Filter</button></div>
          <div><button class="btn btn-secondary" onclick="ADMIN_SUPER_DATA.exportFilteredSessions()">Export All to Excel</button></div>
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
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
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
    
    container.innerHTML = `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div></div>
      <div style="overflow-x: auto; width: 100%;">
        <table style="width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: var(--ug); color: white;">
              <th style="padding: 12px; text-align: left;">📅 Date</th>
              <th style="padding: 12px; text-align: left;">Course Code</th>
              <th style="padding: 12px; text-align: left;">Course Name</th>
              <th style="padding: 12px; text-align: left;">👨‍🏫 Lecturer</th>
              <th style="padding: 12px; text-align: left;">🏛️ Department</th>
              <th style="padding: 12px; text-align: center;">Year</th>
              <th style="padding: 12px; text-align: center;">Semester</th>
              <th style="padding: 12px; text-align: center;">👥 Students</th>
              <th style="padding: 12px; text-align: center;">Status</th>
              <th style="padding: 12px; text-align: center;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.slice(0, 50).map(s => {
              const studentCount = s.records ? Object.values(s.records).length : 0;
              const statusBadge = s.active ? '<span style="background: #1d9e75; color: white; padding: 4px 8px; border-radius: 20px;">🟢 Active</span>' : '<span style="background: #6c757d; color: white; padding: 4px 8px; border-radius: 20px;">🔴 Ended</span>';
              return `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 12px;">${core().escapeHtml(s.date)}<\/td>
                  <td style="padding: 12px;"><strong>${core().escapeHtml(s.courseCode)}<\/strong><\/td>
                  <td style="padding: 12px;">${core().escapeHtml(s.courseName || '—')}<\/td>
                  <td style="padding: 12px;">${core().escapeHtml(s.lecturer || 'Unknown')}<\/td>
                  <td style="padding: 12px;">${core().escapeHtml(s.department || 'Unknown')}<\/td>
                  <td style="padding: 12px; text-align: center;">${s.year || '—'}<\/td>
                  <td style="padding: 12px; text-align: center;">${s.semester === 1 ? 'First' : (s.semester === 2 ? 'Second' : '—')}<\/td>
                  <td style="padding: 12px; text-align: center;">${studentCount}<\/td>
                  <td style="padding: 12px; text-align: center;">${statusBadge}<\/td>
                  <td style="padding: 12px; text-align: center;">
                    <button class="btn btn-secondary btn-sm" onclick="ADMIN_SUPER_DATA.viewSessionDetails('${s.id}')" style="margin-right: 5px;">View</button>
                    <button class="btn btn-teal btn-sm" onclick="ADMIN_SUPER_DATA.exportSingleSession('${s.id}')">Export</button>
                  <\/td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        ${sessions.length > 50 ? '<p class="note" style="margin-top: 12px;">📌 Showing 50 of ' + sessions.length + '</p>' : ''}
      </div>
    `;
  }

  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    await MODAL.alert(`Session: ${session.courseCode} - ${session.date}`, `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div><div class="stat-card"><div class="stat-value">${session.durationMins || 60}</div><div class="stat-label">Duration</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${core().escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${core().escapeHtml(session.department || 'Unknown')}</p>
      <div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: var(--ug); color: white;"><th style="padding: 8px;">Student</th><th style="padding: 8px;">ID</th><th style="padding: 8px;">Time</th><th style="padding: 8px;">Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td style="padding: 8px;">${core().escapeHtml(r.name)}</td><td style="padding: 8px;"><strong>${core().escapeHtml(r.studentId)}</strong></td><td style="padding: 8px;">${r.time}</td><td style="padding: 8px;">${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</td></tr>`).join('')}</tbody></table></div>
    `, { icon: '📊', width: '700px' });
  }

  async function exportSingleSession(sessionId) {
    await core().exportSingleSessionHelper(sessionId);
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
      wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.department || 'Unknown', s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended', s.durationMins || 60]);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }

  // ==================== COURSES MANAGEMENT ====================
  async function renderCourses() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📚 All Courses</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="course-year" class="fi" onchange="ADMIN_SUPER_DATA.loadCourses()"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div><label class="fl">Semester</label><select id="course-semester" class="fi" onchange="ADMIN_SUPER_DATA.loadCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="course-dept" class="fi" onchange="ADMIN_SUPER_DATA.loadCourses(); ADMIN_SUPER_DATA.loadCourseLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="course-lecturer" class="fi" onchange="ADMIN_SUPER_DATA.loadCourses()"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="ADMIN_SUPER_DATA.loadCourses()">Filter</button></div>
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
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
  }

  async function loadCourses() {
    const container = document.getElementById('courses-list');
    if (!container) return;
    try {
      let allCourses = await fetchAllCourses();
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
      const grouped = groupCoursesByYear(filtered);
      let html = '';
      for (const year of Object.keys(grouped).sort((a,b) => b - a)) {
        html += `<div style="margin-bottom:32px;"><h3>📅 ${year}</h3>`;
        for (const dept of Object.keys(grouped[year]).sort()) {
          html += `<div style="margin-left:20px;"><h4>🏛️ ${core().escapeHtml(dept)}</h4>`;
          for (const sem of Object.keys(grouped[year][dept]).sort((a,b) => a - b)) {
            html += `<div style="margin-left:20px;"><h5>📖 ${sem === '1' ? 'First Semester' : 'Second Semester'}</h5>`;
            for (const lecId of Object.keys(grouped[year][dept][sem]).sort()) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px;"><strong>👨‍🏫 ${core().escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">${lecGroup.courses.map(c => `<span class="pill">📚 ${core().escapeHtml(c.courseCode)} (${c.sessionCount} sessions)</span>`).join('')}</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function fetchAllCourses() {
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

  function groupCoursesByYear(courses) {
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

  // ==================== DATABASE & BACKUPS ====================
  async function renderDatabase() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="pg">
        <h2>💾 Database</h2>
        <div class="inner-panel"><h3>Backups</h3><button class="btn btn-ug" onclick="ADMIN_SUPER_DATA.createBackup()">Create Backup</button><div id="backups-list" style="margin-top:15px"></div></div>
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
          <div><button class="btn btn-secondary btn-sm" onclick="ADMIN_SUPER_DATA.downloadBackup('${b.id}')">Download</button><button class="btn btn-danger btn-sm" onclick="ADMIN_SUPER_DATA.deleteBackup('${b.id}')">Delete</button></div>
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

  return {
    renderSessions,
    loadSessionLecturers,
    filterSessions,
    viewSessionDetails,
    exportSingleSession,
    exportFilteredSessions,
    renderCourses,
    loadCourseLecturers,
    loadCourses,
    renderDatabase,
    loadBackups,
    createBackup,
    downloadBackup,
    deleteBackup
  };
})();

window.ADMIN_SUPER_DATA = ADMIN_SUPER_DATA;
