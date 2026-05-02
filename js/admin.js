/* admin.js — Super Admin and Co-Admin Dashboards (UPDATED with Department Meeting Reports) */
'use strict';

// Helper functions
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Helper function to calculate attendance statistics for a course
async function calculateCourseAttendanceStats(courseCode, lecId, year, semester) {
  try {
    // Get all sessions for this course and lecturer
    const allSessions = await DB.SESSION.getAll();
    const courseSessions = allSessions.filter(s => 
      s.lecFbId === lecId &&
      s.courseCode === courseCode && 
      s.year === year && 
      s.semester === semester &&
      s.active === false
    );
    
    const totalSessions = courseSessions.length;
    if (totalSessions === 0) return null;
    
    // Get enrolled students
    const allEnrollments = await DB.ENROLLMENT.getAll();
    const courseEnrollments = allEnrollments.filter(e => 
      e.lecId === lecId &&
      e.courseCode === courseCode && 
      e.year === year && 
      e.semester === semester
    );
    
    const studentStats = [];
    for (const enrollment of courseEnrollments) {
      const student = await DB.STUDENTS.byStudentId(enrollment.studentId);
      if (!student) continue;
      
      let presentCount = 0;
      for (const session of courseSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          const attended = records.some(r => r.studentId === enrollment.studentId);
          if (attended) presentCount++;
        }
      }
      
      const percentage = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;
      studentStats.push({
        id: student.studentId,
        name: student.name,
        email: student.email,
        presentCount,
        totalSessions,
        percentage
      });
    }
    
    const minAttendancePercentage = 75; // Default minimum attendance
    const closeThreshold = minAttendancePercentage - 5; // 70% (5% away)
    
    const qualified = studentStats.filter(s => s.percentage >= minAttendancePercentage).length;
    const notQualified = studentStats.filter(s => s.percentage < minAttendancePercentage).length;
    const closeToQualified = studentStats.filter(s => s.percentage >= closeThreshold && s.percentage < minAttendancePercentage).length;
    const averageAttendance = studentStats.length > 0 
      ? Math.round(studentStats.reduce((sum, s) => sum + s.percentage, 0) / studentStats.length) 
      : 0;
    
    // Get course name
    const course = await DB.COURSE.get(lecId, courseCode, year, semester);
    
    return {
      courseCode,
      courseName: course?.name || courseCode,
      lecturerId: lecId,
      totalSessions,
      totalStudents: studentStats.length,
      qualified,
      notQualified,
      closeToQualified,
      averageAttendance,
      studentStats
    };
  } catch(err) {
    console.error('Error calculating course stats:', err);
    return null;
  }
}

// ==================== CO-ADMIN ==================
const CADM = (() => {
  const c = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';
  let currentDeptReportData = null;
  let currentReportCourseStats = [];

  function tab(name) {
    console.log('[CADM] Switching to tab:', name);
    document.querySelectorAll('#view-cadmin .nav-item').forEach(item => {
      const tabName = item.getAttribute('data-tab');
      if (tabName === name) item.classList.add('active');
      else item.classList.remove('active');
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

  // ==================== CO-ADMIN SESSIONS (Filter by Year, Semester, Course, Lecturer) ====================
  async function renderSessions() {
    c().innerHTML = `<div class="pg">
      <h2>📊 Sessions - ${escapeHtml(dept())}</h2>
      <div class="filter-bar" style="flex-wrap: wrap;">
        <div><label class="fl">Year</label><select id="co-session-year" class="fi"><option value="">All</option><option value="2023">2023</option><option value="2024">2024</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option></select></div>
        <div><label class="fl">Semester</label><select id="co-session-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
        <div><label class="fl">Course</label><select id="co-session-course" class="fi"><option value="">All Courses</option></select></div>
        <div><label class="fl">Lecturer</label><select id="co-session-lecturer" class="fi"><option value="">All Lecturers</option></select></div>
        <div><button class="btn btn-ug" onclick="CADM.filterSessions()">Filter</button></div>
        <div><button class="btn btn-secondary" onclick="CADM.exportSessionsToExcel()">Export All to Excel</button></div>
      </div>
      <div id="co-sessions-list"></div>
    </div>`;
    await loadCoSessionFilters();
  }

  async function loadCoSessionFilters() {
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept());
    const lecturerSelect = document.getElementById('co-session-lecturer');
    if (lecturerSelect) {
      lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    }
    
    // Load courses from department lecturers' courses
    const courseSelect = document.getElementById('co-session-course');
    if (courseSelect) {
      courseSelect.innerHTML = '<option value="">Loading...</option>';
      const allCoursesSet = new Set();
      for (const lecturer of deptLecturers) {
        const courses = await DB.COURSE.getAllForLecturer(lecturer.id);
        courses.forEach(c => allCoursesSet.add(JSON.stringify({ code: c.code, name: c.name })));
      }
      const uniqueCourses = Array.from(allCoursesSet).map(c => JSON.parse(c));
      courseSelect.innerHTML = '<option value="">All Courses</option>' + uniqueCourses.map(c => `<option value="${c.code}">${c.code} - ${c.name}</option>`).join('');
    }
  }

  async function filterSessions() {
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const courseCode = document.getElementById('co-session-course')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    const container = document.getElementById('co-sessions-list');
    container.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      let sessions = await DB.SESSION.getAll();
      sessions = sessions.filter(s => {
        const lecturer = s.lecFbId ? true : false;
        return true;
      });
      
      // Filter by department first (through lecturer)
      const deptLecturers = (await DB.LEC.getAll()).filter(l => l.department === dept()).map(l => l.id);
      sessions = sessions.filter(s => deptLecturers.includes(s.lecFbId));
      
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (!sessions.length) { container.innerHTML = '<div class="no-rec">No sessions found</div>'; return; }
      
      container.innerHTML = `<div class="stats-grid"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div></div>
      <div class="courses-grid">${sessions.slice(0, 50).map(s => `
        <div class="course-card">
          <div class="course-header"><span class="course-code">📚 ${escapeHtml(s.courseCode)} - ${escapeHtml(s.courseName)}</span><span class="badge ${s.active ? 'badge-teal' : 'badge-gray'}">${s.active ? 'Active' : 'Ended'}</span></div>
          <div class="course-stats">📅 ${s.date} · 👥 ${s.records ? Object.values(s.records).length : 0}</div>
          <div class="course-stats">👨‍🏫 ${escapeHtml(s.lecturer || 'Unknown')}</div>
          <div class="course-buttons">
            <button class="btn btn-secondary btn-sm" onclick="CADM.viewSessionDetails('${s.id}')">View Details</button>
            <button class="btn btn-teal btn-sm" onclick="CADM.exportSingleSession('${s.id}')">📥 Download Excel</button>
          </div>
        </div>
      `).join('')}</div>${sessions.length > 50 ? '<p class="note">Showing 50 of ' + sessions.length + '</p>' : ''}`;
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
      <div class="session-table-wrapper"><table class="session-table"><thead><tr><th>Student</th><th>ID</th><th>Time</th><th>Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.studentId)}</td><td>${r.time}</td><td>${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}</td></tr>`).join('')}</tbody></table></div>
    `, { icon: '📊', width: '700px' });
  }

  async function exportSingleSession(sessionId) {
    await exportSingleSessionHelper(sessionId);
  }

  async function exportSessionsToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const courseCode = document.getElementById('co-session-course')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    
    let sessions = await DB.SESSION.getAll();
    const deptLecturers = (await DB.LEC.getAll()).filter(l => l.department === dept()).map(l => l.id);
    sessions = sessions.filter(s => deptLecturers.includes(s.lecFbId));
    
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Year', 'Semester', 'Students Count', 'Status']];
    for (const s of sessions) {
      wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended']);
    }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Dept_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }

  // ==================== CO-ADMIN DEPARTMENT REPORT (For Meetings) ====================
  async function renderDatabase() {
    c().innerHTML = `
      <div class="pg">
        <h2>📊 Department Attendance Report</h2>
        <p class="sub">Generate comprehensive attendance report for departmental meetings</p>
        
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 120px;">
            <label class="fl">📅 Academic Year</label>
            <select id="dept-report-year" class="fi">
              <option value="">Select Year</option>
              <option value="2023">2023</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>
          <div style="min-width: 120px;">
            <label class="fl">📖 Semester</label>
            <select id="dept-report-semester" class="fi">
              <option value="">Select Semester</option>
              <option value="1">First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
          <div style="min-width: 200px;">
            <label class="fl">👨‍🏫 Lecturer</label>
            <select id="dept-report-lecturer" class="fi">
              <option value="">All Lecturers</option>
            </select>
          </div>
          <div>
            <button class="btn btn-ug" onclick="CADM.generateDepartmentReport()">📊 Generate Report</button>
          </div>
          <div>
            <button class="btn btn-secondary" onclick="CADM.exportDepartmentReportToExcel()">📥 Export Excel</button>
          </div>
          <div>
            <button class="btn btn-teal" onclick="CADM.exportDepartmentReportToPDF()">📄 Export PDF</button>
          </div>
        </div>
        
        <div id="dept-report-results">
          <div class="att-empty">📭 Select Year, Semester, and Lecturer to generate report</div>
        </div>
      </div>
    `;
    await loadDeptReportLecturers();
  }

  async function loadDeptReportLecturers() {
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === dept());
    const select = document.getElementById('dept-report-lecturer');
    if (select) {
      select.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('');
    }
  }

  async function generateDepartmentReport() {
    const year = document.getElementById('dept-report-year')?.value;
    const semester = document.getElementById('dept-report-semester')?.value;
    const lecturerId = document.getElementById('dept-report-lecturer')?.value;
    const container = document.getElementById('dept-report-results');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select both Year and Semester.');
      return;
    }
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const minAttendancePercentage = 75;
      const closeThreshold = minAttendancePercentage - 5; // 70%
      
      // Get all lecturers in the department
      const allLecturers = await DB.LEC.getAll();
      const deptLecturers = allLecturers.filter(l => l.department === dept());
      let targetLecturers = deptLecturers;
      if (lecturerId) {
        targetLecturers = deptLecturers.filter(l => l.id === lecturerId);
      }
      
      const courseStats = [];
      
      for (const lecturer of targetLecturers) {
        // Get all courses for this lecturer in the selected period
        const courses = await DB.COURSE.getAllForLecturer(lecturer.id);
        const periodCourses = courses.filter(c => c.year === yearInt && c.semester === semInt && c.active !== false);
        
        for (const course of periodCourses) {
          const stats = await calculateCourseAttendanceStats(course.code, lecturer.id, yearInt, semInt);
          if (stats && stats.totalStudents > 0) {
            courseStats.push({
              ...stats,
              lecturerName: lecturer.name,
              closeToQualifiedPercentage: stats.closeToQualified > 0 ? Math.round((stats.closeToQualified / stats.totalStudents) * 100) : 0,
              qualifiedPercentage: stats.qualified > 0 ? Math.round((stats.qualified / stats.totalStudents) * 100) : 0,
              notQualifiedPercentage: stats.notQualified > 0 ? Math.round((stats.notQualified / stats.totalStudents) * 100) : 0
            });
          }
        }
      }
      
      if (courseStats.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No data found for the selected period.</div>';
        return;
      }
      
      // Calculate department totals
      const totalStudents = courseStats.reduce((sum, c) => sum + c.totalStudents, 0);
      const totalQualified = courseStats.reduce((sum, c) => sum + c.qualified, 0);
      const totalNotQualified = courseStats.reduce((sum, c) => sum + c.notQualified, 0);
      const totalCloseToQualified = courseStats.reduce((sum, c) => sum + c.closeToQualified, 0);
      const overallAverageAttendance = courseStats.length > 0 
        ? Math.round(courseStats.reduce((sum, c) => sum + c.averageAttendance, 0) / courseStats.length) 
        : 0;
      
      currentReportCourseStats = courseStats;
      
      // Build HTML report with graphs
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 25px; border-radius: 16px; margin-bottom: 25px; text-align: center;">
          <h2 style="margin: 0; color: white;">📊 Department Attendance Report</h2>
          <p style="margin: 10px 0 0; opacity: 0.9;">${escapeHtml(dept())} Department</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">🎯 Minimum Attendance Required: ${minAttendancePercentage}%</p>
        </div>
        
        <!-- Summary Cards -->
        <div class="stats-grid" style="margin-bottom: 25px;">
          <div class="stat-card"><div class="stat-value">${courseStats.length}</div><div class="stat-label">📚 Courses Analyzed</div></div>
          <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">🎓 Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${overallAverageAttendance}%</div><div class="stat-label">📊 Avg Attendance</div></div>
          <div class="stat-card"><div class="stat-value">${totalQualified}</div><div class="stat-label">✅ Qualified Students</div></div>
        </div>
        
        <!-- Charts Section -->
        <div class="report-chart" style="margin-bottom: 25px;">
          <h4>📈 Overall Attendance Distribution</h4>
          <div class="chart-bar"><span class="chart-label">✅ Qualified (≥${minAttendancePercentage}%)</span><div class="chart-bar-fill" style="width: ${(totalQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${totalQualified} students (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Close to Qualified (${closeThreshold}-${minAttendancePercentage-1}%)</span><div class="chart-bar-fill" style="width: ${(totalCloseToQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${totalCloseToQualified} students (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Not Qualified (<${closeThreshold}%)</span><div class="chart-bar-fill" style="width: ${(totalNotQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${totalNotQualified} students (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
        </div>
        
        <!-- Course Summary Table -->
        <div style="overflow-x: auto; margin-bottom: 25px;">
          <h4>📋 Course-by-Course Summary</h4>
          <table class="session-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 12px;">Course Code</th>
                <th style="padding: 12px;">Course Name</th>
                <th style="padding: 12px;">Lecturer</th>
                <th style="padding: 12px;">Sessions</th>
                <th style="padding: 12px;">Students</th>
                <th style="padding: 12px;">Qualified</th>
                <th style="padding: 12px;">Not Qualified</th>
                <th style="padding: 12px;">Close (5%)</th>
                <th style="padding: 12px;">Avg %</th>
              </tr>
            </thead>
            <tbody>
              ${courseStats.map(c => `
                <tr style="border-bottom: 1px solid var(--border);">
                  <td style="padding: 10px;"><strong>${escapeHtml(c.courseCode)}</strong></td>
                  <td style="padding: 10px;">${escapeHtml(c.courseName)}</td>
                  <td style="padding: 10px;">${escapeHtml(c.lecturerName)}</td>
                  <td style="padding: 10px; text-align: center;">${c.totalSessions}</td>
                  <td style="padding: 10px; text-align: center;">${c.totalStudents}</td>
                  <td style="padding: 10px; text-align: center; color: var(--teal);">${c.qualified} (${c.qualifiedPercentage}%)</td>
                  <td style="padding: 10px; text-align: center; color: var(--danger);">${c.notQualified} (${c.notQualifiedPercentage}%)</td>
                  <td style="padding: 10px; text-align: center; color: var(--amber);">${c.closeToQualified} (${c.closeToQualifiedPercentage}%)</td>
                  <td style="padding: 10px; text-align: center;"><strong>${c.averageAttendance}%</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <!-- Department Summary Write-up -->
        <div class="inner-panel" style="background: var(--surface2); margin-top: 20px;">
          <h4>📝 Executive Summary</h4>
          <p>During the <strong>${yearInt} ${semInt === 1 ? 'First Semester' : 'Second Semester'}</strong>, the <strong>${escapeHtml(dept())} Department</strong> conducted a total of <strong>${courseStats.reduce((sum, c) => sum + c.totalSessions, 0)} sessions</strong> across <strong>${courseStats.length} courses</strong>.</p>
          <p>Out of <strong>${totalStudents} students</strong> enrolled in these courses, <strong style="color: var(--teal);">${totalQualified} students (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> have met the minimum attendance requirement of <strong>${minAttendancePercentage}%</strong>.</p>
          <p><strong style="color: var(--amber);">${totalCloseToQualified} students (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> are within 5% of the threshold and require close monitoring to improve their attendance.</p>
          <p><strong style="color: var(--danger);">${totalNotQualified} students (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> are below the acceptable attendance threshold and may be at risk of failing due to attendance requirements.</p>
          <p>The department's overall average attendance rate is <strong>${overallAverageAttendance}%</strong>.</p>
          <hr style="margin: 15px 0;">
          <h4>📌 Recommendations</h4>
          <ul>
            <li>Focus intervention efforts on the <strong>${totalCloseToQualified} students</strong> who are close to the threshold to help them achieve qualification.</li>
            <li>Schedule academic advising meetings for the <strong>${totalNotQualified} students</strong> who are significantly below the attendance requirement.</li>
            <li>Consider implementing additional support mechanisms for courses with low average attendance.</li>
            <li>Recognize and reward courses with high attendance rates to encourage best practices.</li>
          </ul>
        </div>
      `;
      
      container.innerHTML = html;
      currentDeptReportData = { courseStats, year: yearInt, semester: semInt, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage };
      
    } catch(err) {
      console.error('[CADM] Generate report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function exportDepartmentReportToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    if (!currentDeptReportData || !currentReportCourseStats.length) { 
      await MODAL.alert('No Data', '📭 Generate a report first.'); 
      return; 
    }
    
    const { year, semester, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage } = currentDeptReportData;
    const courseStats = currentReportCourseStats;
    
    const wsData = [
      [`${escapeHtml(dept())} Department - Attendance Report`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Minimum Attendance Required: ${minAttendancePercentage}%`],
      [],
      ['SUMMARY STATISTICS'],
      [`Total Courses Analyzed:`, courseStats.length],
      [`Total Students:`, totalStudents],
      [`Total Qualified Students (≥${minAttendancePercentage}%):`, `${totalQualified} (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Total Not Qualified Students (<${minAttendancePercentage - 5}%):`, `${totalNotQualified} (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Total Students Close to Threshold (${minAttendancePercentage - 5}-${minAttendancePercentage-1}%):`, `${totalCloseToQualified} (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Overall Average Attendance:`, `${overallAverageAttendance}%`],
      [],
      ['COURSE-BY-COURSE DETAILS'],
      ['Course Code', 'Course Name', 'Lecturer', 'Total Sessions', 'Total Students', 'Qualified', 'Not Qualified', 'Close (5%)', 'Avg Attendance (%)']
    ];
    
    for (const c of courseStats) {
      wsData.push([
        c.courseCode, c.courseName, c.lecturerName, c.totalSessions, c.totalStudents,
        `${c.qualified} (${c.qualifiedPercentage}%)`,
        `${c.notQualified} (${c.notQualifiedPercentage}%)`,
        `${c.closeToQualified} (${c.closeToQualifiedPercentage}%)`,
        `${c.averageAttendance}%`
      ]);
    }
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${dept()}_Attendance_Report`);
    XLSX.writeFile(wb, `UG_${dept()}_Attendance_Report_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', '✅ Report exported to Excel.');
  }

  async function exportDepartmentReportToPDF() {
    if (!currentDeptReportData || !currentReportCourseStats.length) { 
      await MODAL.alert('No Report', '📭 Generate a report first.'); 
      return; 
    }
    
    const { year, semester, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage } = currentDeptReportData;
    const courseStats = currentReportCourseStats;
    const deptName = dept();
    
    let tableRows = '';
    for (const c of courseStats) {
      tableRows += `
        <tr>
          <td>${escapeHtml(c.courseCode)}</td>
          <td>${escapeHtml(c.courseName)}</td>
          <td>${escapeHtml(c.lecturerName)}</td>
          <td style="text-align: center;">${c.totalSessions}</td>
          <td style="text-align: center;">${c.totalStudents}</td>
          <td style="text-align: center; color: #1d9e75;">${c.qualified} (${c.qualifiedPercentage}%)</td>
          <td style="text-align: center; color: #d42b2b;">${c.notQualified} (${c.notQualifiedPercentage}%)</td>
          <td style="text-align: center; color: #b8860b;">${c.closeToQualified} (${c.closeToQualifiedPercentage}%)</td>
          <td style="text-align: center;"><strong>${c.averageAttendance}%</strong></td>
        </tr>
      `;
    }
    
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${deptName} Department Attendance Report</title>
      <style>
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        h1 {
          color: #003087;
          border-bottom: 3px solid #fcd116;
          padding-bottom: 10px;
        }
        h2 {
          color: #003087;
          margin-top: 30px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .summary-cards {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin: 30px 0;
          flex-wrap: wrap;
        }
        .card {
          background: #f5f5f7;
          border-radius: 12px;
          padding: 15px;
          text-align: center;
          flex: 1;
          min-width: 150px;
          border: 1px solid #ddd;
        }
        .card-value {
          font-size: 28px;
          font-weight: bold;
          color: #003087;
        }
        .card-label {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        th {
          background: #003087;
          color: white;
          padding: 12px;
          text-align: left;
        }
        td {
          border-bottom: 1px solid #ddd;
          padding: 10px;
        }
        .summary-box {
          background: #f8f9fa;
          border-left: 4px solid #fcd116;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .recommendations {
          background: #e6ecf4;
          padding: 15px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .footer {
          text-align: center;
          font-size: 10px;
          color: #999;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
        }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 ${escapeHtml(deptName)} Department</h1>
        <h2>Attendance Report</h2>
        <p><strong>Academic Year:</strong> ${year} - ${semester === 1 ? 'First Semester' : 'Second Semester'}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Minimum Attendance Required:</strong> ${minAttendancePercentage}%</p>
      </div>
      
      <div class="summary-cards">
        <div class="card"><div class="card-value">${courseStats.length}</div><div class="card-label">📚 Courses</div></div>
        <div class="card"><div class="card-value">${courseStats.reduce((sum, c) => sum + c.totalSessions, 0)}</div><div class="card-label">📊 Sessions</div></div>
        <div class="card"><div class="card-value">${totalStudents}</div><div class="card-label">🎓 Students</div></div>
        <div class="card"><div class="card-value">${overallAverageAttendance}%</div><div class="card-label">📈 Avg Attendance</div></div>
      </div>
      
      <h2>📋 Course-by-Course Summary</h2>
      <table>
        <thead>
          <tr><th>Course Code</th><th>Course Name</th><th>Lecturer</th><th>Sessions</th><th>Students</th><th>Qualified</th><th>Not Qualified</th><th>Close (5%)</th><th>Avg %</th></tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      
      <div class="summary-box">
        <h3>📊 Executive Summary</h3>
        <p>During the <strong>${year} ${semester === 1 ? 'First Semester' : 'Second Semester'}</strong>, the <strong>${escapeHtml(deptName)} Department</strong> conducted a total of <strong>${courseStats.reduce((sum, c) => sum + c.totalSessions, 0)} sessions</strong> across <strong>${courseStats.length} courses</strong>.</p>
        <p>Out of <strong>${totalStudents} students</strong> enrolled, <strong style="color: #1d9e75;">${totalQualified} students (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> met the minimum attendance requirement of <strong>${minAttendancePercentage}%</strong>.</p>
        <p><strong style="color: #b8860b;">${totalCloseToQualified} students (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> are within 5% of the threshold and require monitoring.</p>
        <p><strong style="color: #d42b2b;">${totalNotQualified} students (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)</strong> are below the acceptable attendance threshold.</p>
        <p>The department's overall average attendance rate is <strong>${overallAverageAttendance}%</strong>.</p>
      </div>
      
      <div class="recommendations">
        <h3>📌 Recommendations</h3>
        <ul>
          <li>Focus intervention on the <strong>${totalCloseToQualified} students</strong> close to the attendance threshold.</li>
          <li>Schedule advising meetings for the <strong>${totalNotQualified} students</strong> below the requirement.</li>
          <li>Consider support mechanisms for courses with low average attendance.</li>
          <li>Recognize courses with high attendance rates to encourage best practices.</li>
        </ul>
      </div>
      
      <div class="footer">
        <p>University of Ghana, Legon - ${escapeHtml(deptName)} Department</p>
        <p>This report was generated automatically by the UG QR Attendance System</p>
      </div>
    </body>
    </html>`;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ==================== CO-ADMIN COURSES ====================
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
      let allCourses = await fetchAllCoursesForDept();
      let filtered = allCourses.filter(c => c.department === dept());
      if (year) filtered = filtered.filter(c => c.year === parseInt(year));
      if (semester) filtered = filtered.filter(c => c.semester === parseInt(semester));
      if (lecturerId) filtered = filtered.filter(c => c.lecturerId === lecturerId);
      if (!filtered.length) { container.innerHTML = '<div class="no-rec">No courses found.</div>'; return; }
      const grouped = groupCoursesForDept(filtered);
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

  async function fetchAllCoursesForDept() {
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

  function groupCoursesForDept(courses) {
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

  // ==================== CO-ADMIN BACKUP & HELP ====================
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

  async function renderHelp() {
    c().innerHTML = `
      <div class="pg">
        <h2>❓ Help - Co-Admin Dashboard</h2>
        <div class="inner-panel">
          <h3>📊 Department Reports</h3>
          <ul>
            <li>Select Academic Year and Semester to generate attendance reports</li>
            <li>Filter by specific lecturer or view all lecturers in the department</li>
            <li>Reports include course-by-course summary with qualification statistics</li>
            <li>Export reports to Excel or PDF for departmental meetings</li>
          </ul>
        </div>
        <div class="inner-panel">
          <h3>🆔 Generate IDs</h3>
          <ul><li>Create unique registration IDs for lecturers in your department</li></ul>
        </div>
        <div class="inner-panel">
          <h3>👨‍🏫 Lecturers</h3>
          <ul><li>View, suspend, or remove lecturers in your department</li></ul>
        </div>
        <div class="inner-panel">
          <h3>📊 Sessions</h3>
          <ul><li>Filter sessions by Year, Semester, Course, and Lecturer</li></ul>
        </div>
        <div class="inner-panel">
          <h3>📚 Courses</h3>
          <ul><li>View all courses in your department with filters</li></ul>
        </div>
      </div>
    `;
  }

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

  // Helper for exporting single session
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
    showCoAdminAnnouncementModal
  };
})();

// Make globally available
if (typeof SADM !== 'undefined') { window.SADM = SADM; console.log('[ADMIN] SADM loaded'); }
if (typeof CADM !== 'undefined') { window.CADM = CADM; console.log('[ADMIN] CADM loaded'); }
