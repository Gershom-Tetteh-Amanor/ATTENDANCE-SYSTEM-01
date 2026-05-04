/* admin-co-reports.js — Co-Admin: Department Reports, Sessions, Backups */
'use strict';

const ADMIN_CO_REPORTS = (() => {
  const core = () => window.ADMIN_CORE;
  let currentDeptReportData = null;
  let currentReportCourseStats = [];
  let chartInstances = {};
  
  // ==================== SESSIONS ====================
  async function renderSessions() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📊 Sessions - ${core().escapeHtml(deptName)}</h2>
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
          <div style="min-width: 120px;"><label class="fl">📅 Year</label><select id="co-session-year" class="fi"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div style="min-width: 120px;"><label class="fl">📖 Semester</label><select id="co-session-semester" class="fi"><option value="">All</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div>
          <div style="min-width: 200px;"><label class="fl">📚 Course</label><select id="co-session-course" class="fi"><option value="">All Courses</option></select></div>
          <div style="min-width: 200px;"><label class="fl">👨‍🏫 Lecturer</label><select id="co-session-lecturer" class="fi"><option value="">All Lecturers</option></select></div>
          <div><button class="btn btn-ug" onclick="ADMIN_CO_REPORTS.filterSessions()">🔍 Filter</button></div>
          <div><button class="btn btn-secondary" onclick="ADMIN_CO_REPORTS.exportSessionsToExcel()">📥 Export to Excel</button></div>
        </div>
        <div id="co-sessions-list"><div class="att-empty">📭 Click Filter to view sessions</div></div>
      </div>
    `;
    await loadCoSessionFilters();
  }

  async function loadCoSessionFilters() {
    const deptName = core().getCoAdminDepartment();
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === deptName);
    const lecturerSelect = document.getElementById('co-session-lecturer');
    if (lecturerSelect) {
      lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
    }
    
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
    const deptName = core().getCoAdminDepartment();
    
    container.innerHTML = '<div class="att-empty">Loading...</div>';
    try {
      let sessions = await DB.SESSION.getAll();
      const deptLecturers = (await DB.LEC.getAll()).filter(l => l.department === deptName).map(l => l.id);
      sessions = sessions.filter(s => deptLecturers.includes(s.lecFbId));
      if (year) sessions = sessions.filter(s => s.year === parseInt(year));
      if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
      if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
      if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
      sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      if (!sessions.length) { container.innerHTML = '<div class="no-rec">No sessions found</div>'; return; }
      
      let html = `<div class="stats-grid" style="margin-bottom: 20px;"><div class="stat-card"><div class="stat-value">${sessions.length}</div><div class="stat-label">Total Sessions</div></div></div>
        <div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px;">
          <thead><tr style="background: var(--ug); color: white;">
            <th style="padding: 12px; text-align: left;">📅 Date</th><th style="padding: 12px; text-align: left;">Course Code</th>
            <th style="padding: 12px; text-align: left;">Course Name</th><th style="padding: 12px; text-align: left;">👨‍🏫 Lecturer</th>
            <th style="padding: 12px; text-align: center;">Year</th><th style="padding: 12px; text-align: center;">Semester</th>
            <th style="padding: 12px; text-align: center;">👥 Students</th><th style="padding: 12px; text-align: center;">Status</th>
            <th style="padding: 12px; text-align: center;">Actions</th>
          </tr></thead><tbody>`;
      for (const session of sessions) {
        const lecturer = await DB.LEC.get(session.lecFbId);
        const lecturerName = lecturer?.name || session.lecturer || 'Unknown';
        const studentCount = session.records ? Object.values(session.records).length : 0;
        const statusBadge = session.active ? '<span style="background: #1d9e75; color: white; padding: 4px 8px; border-radius: 20px;">🟢 Active</span>' : '<span style="background: #6c757d; color: white; padding: 4px 8px; border-radius: 20px;">🔴 Ended</span>';
        html += `<tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 12px;">${core().escapeHtml(session.date)}<\/td>
          <td style="padding: 12px;"><strong>${core().escapeHtml(session.courseCode)}<\/strong><\/td>
          <td style="padding: 12px;">${core().escapeHtml(session.courseName || '—')}<\/td>
          <td style="padding: 12px;">${core().escapeHtml(lecturerName)}<\/td>
          <td style="padding: 12px; text-align: center;">${session.year || '—'}<\/td>
          <td style="padding: 12px; text-align: center;">${session.semester === 1 ? 'First' : (session.semester === 2 ? 'Second' : '—')}<\/td>
          <td style="padding: 12px; text-align: center;">${studentCount}<\/td>
          <td style="padding: 12px; text-align: center;">${statusBadge}<\/td>
          <td style="padding: 12px; text-align: center;"><button class="btn btn-outline btn-sm" onclick="ADMIN_CO_REPORTS.viewSessionDetails('${session.id}')" style="margin-right: 5px;">📋 View</button><button class="btn btn-teal btn-sm" onclick="ADMIN_CO_REPORTS.exportSingleSession('${session.id}')">📥 Export</button><\/td>
        </td>`;
      }
      html += `</tbody></table></div>`;
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) return;
    const records = session.records ? Object.values(session.records) : [];
    await MODAL.alert(`Session: ${session.courseCode}`, `
      <div class="stats-grid"><div class="stat-card"><div class="stat-value">${records.length}</div><div class="stat-label">Students</div></div></div>
      <p><strong>👨‍🏫 Lecturer:</strong> ${core().escapeHtml(session.lecturer || 'Unknown')}</p>
      <p><strong>🏛️ Department:</strong> ${core().escapeHtml(session.department || 'Unknown')}</p>
      <div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: var(--ug); color: white;"><th style="padding: 8px;">Student</th><th style="padding: 8px;">ID</th><th style="padding: 8px;">Time</th><th style="padding: 8px;">Method</th></tr></thead><tbody>${records.slice(0, 20).map(r => `<tr><td style="padding: 8px;">${core().escapeHtml(r.name)}</td><td style="padding: 8px;"><strong>${core().escapeHtml(r.studentId)}</strong></td><td style="padding: 8px;">${r.time}</td><td style="padding: 8px;">${r.authMethod === 'webauthn' ? 'Biometric' : 'Manual'}<tr>`).join('')}</tbody></table></div>
    `, { icon: '📊', width: '700px' });
  }

  async function exportSingleSession(sessionId) {
    await core().exportSingleSessionHelper(sessionId);
  }

  async function exportSessionsToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    const year = document.getElementById('co-session-year')?.value;
    const semester = document.getElementById('co-session-semester')?.value;
    const courseCode = document.getElementById('co-session-course')?.value;
    const lecturerId = document.getElementById('co-session-lecturer')?.value;
    const deptName = core().getCoAdminDepartment();
    
    let sessions = await DB.SESSION.getAll();
    const deptLecturers = (await DB.LEC.getAll()).filter(l => l.department === deptName).map(l => l.id);
    sessions = sessions.filter(s => deptLecturers.includes(s.lecFbId));
    if (year) sessions = sessions.filter(s => s.year === parseInt(year));
    if (semester) sessions = sessions.filter(s => s.semester === parseInt(semester));
    if (courseCode) sessions = sessions.filter(s => s.courseCode === courseCode);
    if (lecturerId) sessions = sessions.filter(s => s.lecFbId === lecturerId);
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    const wsData = [['Date', 'Course Code', 'Course Name', 'Lecturer', 'Year', 'Semester', 'Students Count', 'Status']];
    for (const s of sessions) wsData.push([s.date, s.courseCode, s.courseName || '', s.lecturer || 'Unknown', s.year, s.semester, s.records ? Object.values(s.records).length : 0, s.active ? 'Active' : 'Ended']);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
    XLSX.writeFile(wb, `UG_Dept_Sessions_${new Date().toISOString().split('T')[0]}.xlsx`);
    await MODAL.success('Exported', '✅ Sessions exported.');
  }

  // ==================== DEPARTMENT REPORT ====================
  async function renderDatabase() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📊 Department Attendance Report</h2>
        <p class="sub">Generate attendance report for ${core().escapeHtml(deptName)} department</p>
        <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
          <div style="min-width: 120px;"><label class="fl">📅 Academic Year</label><select id="dept-report-year" class="fi"><option value="">Select Year</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div style="min-width: 120px;"><label class="fl">📖 Semester</label><select id="dept-report-semester" class="fi"><option value="">Select Semester</option><option value="1">First Semester</option><option value="2">Second Semester</option></select></div>
          <div style="min-width: 200px;"><label class="fl">👨‍🏫 Lecturer</label><select id="dept-report-lecturer" class="fi"><option value="">All Lecturers</option></select></div>
          <div><button class="btn btn-ug" onclick="ADMIN_CO_REPORTS.generateDepartmentReport()">📊 Generate Report</button></div>
          <div><button class="btn btn-secondary" onclick="ADMIN_CO_REPORTS.exportDepartmentReportToExcel()">📥 Export Excel</button></div>
          <div><button class="btn btn-teal" onclick="ADMIN_CO_REPORTS.exportDepartmentReportToPDF()">📄 Export PDF</button></div>
        </div>
        <div id="dept-report-results"><div class="att-empty">📭 Select Year, Semester, and Lecturer to generate report</div></div>
      </div>
    `;
    await loadDeptReportLecturers();
  }

  async function loadDeptReportLecturers() {
    const deptName = core().getCoAdminDepartment();
    const lecturers = await DB.LEC.getAll();
    const deptLecturers = lecturers.filter(l => l.department === deptName);
    const select = document.getElementById('dept-report-lecturer');
    if (select) select.innerHTML = '<option value="">All Lecturers</option>' + deptLecturers.map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
  }

  function renderCourseChart(canvasId, course) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (chartInstances[canvasId]) { try { chartInstances[canvasId].destroy(); } catch(e) {} delete chartInstances[canvasId]; }
    if (!canvas.isConnected || canvas.offsetParent === null) return;
    
    const minAttendance = core().getGlobalMinAttendance();
    const closeThreshold = minAttendance - 5;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const bins = [
      { range: `0-${closeThreshold-1}%`, min: 0, max: closeThreshold - 1, color: '#d42b2b', count: 0, label: 'Not Qualified' },
      { range: `${closeThreshold}-${minAttendance-1}%`, min: closeThreshold, max: minAttendance - 1, color: '#fcd116', count: 0, label: `⚠️ Close (within 5% of ${minAttendance}%)` },
      { range: `${minAttendance}-79%`, min: minAttendance, max: 79, color: '#1d9e75', count: 0, label: '✅ Minimum Met' },
      { range: '80-89%', min: 80, max: 89, color: '#0d6e4a', count: 0 },
      { range: '90-100%', min: 90, max: 100, color: '#0a5a3c', count: 0 }
    ];
    for (const student of course.studentDetails) {
      for (const bin of bins) { if (student.percentage >= bin.min && student.percentage <= bin.max) { bin.count++; break; } }
    }
    if (typeof Chart === 'undefined') return;
    try {
      chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: bins.map(b => b.range), datasets: [{ label: 'Number of Students', data: bins.map(b => b.count), backgroundColor: bins.map(b => b.color), borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: function(context) { const bin = bins[context.dataIndex]; let label = `${context.raw} students`; if (bin.label && context.raw > 0) label += ` (${bin.label})`; return label; } } } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Students' }, ticks: { stepSize: 1, precision: 0 } }, x: { title: { display: true, text: 'Attendance Percentage Range' } } } }
      });
    } catch(err) { console.error('Chart error:', err); }
  }

  async function generateDepartmentReport() {
    const year = document.getElementById('dept-report-year')?.value;
    const semester = document.getElementById('dept-report-semester')?.value;
    const lecturerId = document.getElementById('dept-report-lecturer')?.value;
    const container = document.getElementById('dept-report-results');
    const deptName = core().getCoAdminDepartment();
    
    if (!year || !semester) { await MODAL.alert('Missing Info', '⚠️ Please select both Year and Semester.'); return; }
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      const minAttendancePercentage = core().getGlobalMinAttendance();
      const closeThreshold = minAttendancePercentage - 5;
      
      const allLecturers = await DB.LEC.getAll();
      const deptLecturers = allLecturers.filter(l => l.department === deptName);
      let targetLecturers = deptLecturers;
      let selectedLecturerName = null;
      if (lecturerId) {
        const selected = deptLecturers.find(l => l.id === lecturerId);
        selectedLecturerName = selected?.name;
        targetLecturers = deptLecturers.filter(l => l.id === lecturerId);
      }
      
      const courseStats = [];
      for (const lecturer of targetLecturers) {
        const courses = await DB.COURSE.getAllForLecturer(lecturer.id);
        const periodCourses = courses.filter(c => c.year === yearInt && c.semester === semInt && c.active !== false);
        for (const course of periodCourses) {
          const stats = await core().calculateCourseAttendanceStats(course.code, lecturer.id, yearInt, semInt);
          if (stats && stats.totalStudents > 0) {
            courseStats.push({
              ...stats,
              lecturerName: lecturer.name,
              closeToQualified: stats.studentStats.filter(s => s.percentage >= closeThreshold && s.percentage < minAttendancePercentage).length,
              closeToQualifiedPercentage: stats.studentStats.length > 0 ? Math.round((stats.studentStats.filter(s => s.percentage >= closeThreshold && s.percentage < minAttendancePercentage).length / stats.totalStudents) * 100) : 0,
              qualified: stats.studentStats.filter(s => s.percentage >= minAttendancePercentage).length,
              qualifiedPercentage: stats.studentStats.length > 0 ? Math.round((stats.studentStats.filter(s => s.percentage >= minAttendancePercentage).length / stats.totalStudents) * 100) : 0,
              notQualified: stats.studentStats.filter(s => s.percentage < closeThreshold).length,
              notQualifiedPercentage: stats.studentStats.length > 0 ? Math.round((stats.studentStats.filter(s => s.percentage < closeThreshold).length / stats.totalStudents) * 100) : 0,
              studentDetails: stats.studentStats.map(s => ({ ...s, status: s.percentage >= minAttendancePercentage ? 'Qualified' : (s.percentage >= closeThreshold ? `Close (within 5% of ${minAttendancePercentage}%)` : 'Not Qualified'), statusColor: s.percentage >= minAttendancePercentage ? 'var(--teal)' : (s.percentage >= closeThreshold ? 'var(--amber)' : 'var(--danger)') }))
            });
          }
        }
      }
      
      if (courseStats.length === 0) { container.innerHTML = '<div class="no-rec">📭 No data found for the selected period.</div>'; return; }
      currentReportCourseStats = courseStats;
      
      const totalStudents = courseStats.reduce((sum, c) => sum + c.totalStudents, 0);
      const totalQualified = courseStats.reduce((sum, c) => sum + c.qualified, 0);
      const totalNotQualified = courseStats.reduce((sum, c) => sum + c.notQualified, 0);
      const totalCloseToQualified = courseStats.reduce((sum, c) => sum + c.closeToQualified, 0);
      const overallAverageAttendance = courseStats.length > 0 ? Math.round(courseStats.reduce((sum, c) => sum + c.averageAttendance, 0) / courseStats.length) : 0;
      
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align: center;">
          <h2 style="margin: 0; color: white;">📊 Department Attendance Report</h2>
          <p style="margin: 10px 0 0; opacity: 0.9;">${core().escapeHtml(deptName)} Department</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
          ${selectedLecturerName ? `<p style="margin: 5px 0 0; opacity: 0.8;">👨‍🏫 Lecturer: ${core().escapeHtml(selectedLecturerName)}</p>` : ''}
          <p style="margin: 5px 0 0; opacity: 0.7;">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">🎯 Minimum Attendance Required (Global): ${minAttendancePercentage}%</p>
          <p style="margin: 5px 0 0; opacity: 0.8; background: rgba(255,255,255,0.15); display: inline-block; padding: 4px 12px; border-radius: 20px; margin-top: 10px;">⚠️ "Close" = Students ${closeThreshold}-${minAttendancePercentage-1}% (within 5% of minimum)</p>
        </div>
        <div class="stats-grid" style="margin-bottom: 25px;">
          <div class="stat-card"><div class="stat-value">${courseStats.length}</div><div class="stat-label">📚 Courses Analyzed</div></div>
          <div class="stat-card"><div class="stat-value">${courseStats.reduce((sum, c) => sum + c.totalSessions, 0)}</div><div class="stat-label">📊 Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">🎓 Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${overallAverageAttendance}%</div><div class="stat-label">📈 Avg Attendance</div></div>
        </div>
        <div class="report-chart" style="margin-bottom: 30px;">
          <h4>📈 Overall Attendance Distribution (All Courses Combined)</h4>
          <div class="chart-bar"><span class="chart-label">✅ Qualified (≥${minAttendancePercentage}%)</span><div class="chart-bar-fill" style="width: ${(totalQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${totalQualified} students (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Close (${closeThreshold}-${minAttendancePercentage-1}%)</span><div class="chart-bar-fill" style="width: ${(totalCloseToQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${totalCloseToQualified} students (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Not Qualified (<${closeThreshold}%)</span><div class="chart-bar-fill" style="width: ${(totalNotQualified / Math.max(totalStudents, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${totalNotQualified} students (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)</span></div>
        </div>
        <div style="overflow-x: auto; margin-bottom: 30px;">
          <h4>📋 Course-by-Course Summary</h4>
          <table style="width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px;">
            <thead><tr style="background: var(--ug); color: white;">
              <th style="padding: 12px; text-align: left;">Course Code</th><th style="padding: 12px; text-align: left;">Course Name</th>
              <th style="padding: 12px; text-align: left;">Lecturer</th><th style="padding: 12px; text-align: center;">Sessions</th>
              <th style="padding: 12px; text-align: center;">Students</th><th style="padding: 12px; text-align: center;">Qualified</th>
              <th style="padding: 12px; text-align: center;">Not Qualified</th><th style="padding: 12px; text-align: center;">Close (5%)</th>
              <th style="padding: 12px; text-align: center;">Avg %</th><th style="padding: 12px; text-align: center;">Actions</th>
            </tr></thead>
            <tbody>${courseStats.map((c, idx) => `<tr style="border-bottom: 1px solid var(--border);">
              <td style="padding: 10px;"><strong>${core().escapeHtml(c.courseCode)}</strong></td>
              <td style="padding: 10px;">${core().escapeHtml(c.courseName)}</td>
              <td style="padding: 10px;">${core().escapeHtml(c.lecturerName)}</td>
              <td style="padding: 10px; text-align: center;">${c.totalSessions}</td>
              <td style="padding: 10px; text-align: center;">${c.totalStudents}</td>
              <td style="padding: 10px; text-align: center; color: var(--teal);">${c.qualified} (${c.qualifiedPercentage}%)</td>
              <td style="padding: 10px; text-align: center; color: var(--danger);">${c.notQualified} (${c.notQualifiedPercentage}%)</td>
              <td style="padding: 10px; text-align: center; color: var(--amber);"><strong>${c.closeToQualified} (${c.closeToQualifiedPercentage}%)</strong></td>
              <td style="padding: 10px; text-align: center;"><strong>${c.averageAttendance}%</strong></td>
              <td style="padding: 10px; text-align: center;"><button class="btn btn-outline btn-sm" onclick="ADMIN_CO_REPORTS.showCourseDetails('${c.courseCode}', '${c.lecturerId}', ${yearInt}, ${semInt})">📊 View Details</button></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
      
      html += `<div style="margin-top: 40px;"><h3>📊 Individual Course Attendance Graphs</h3>`;
      for (const course of courseStats) {
        const chartId = `chart-${course.courseCode}-${course.lecturerId}`.replace(/[^a-zA-Z0-9-]/g, '-');
        html += `<div class="course-graph-card" style="background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 16px;">
            <div><h4 style="margin: 0; color: var(--ug);">📚 ${core().escapeHtml(course.courseCode)} - ${core().escapeHtml(course.courseName)}</h4><p style="margin: 4px 0 0; font-size: 12px; color: var(--text3);">👨‍🏫 ${core().escapeHtml(course.lecturerName)}</p></div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;"><span class="badge" style="background: var(--teal);">✅ Qualified: ${course.qualified}</span><span class="badge" style="background: var(--amber);">⚠️ Close: ${course.closeToQualified}</span><span class="badge" style="background: var(--danger);">❌ Not Qualified: ${course.notQualified}</span></div>
          </div>
          <div style="margin-bottom: 20px;"><h5 style="margin-bottom: 10px; font-size: 14px;">📊 Attendance Distribution</h5>
            <div class="chart-bar"><span class="chart-label">✅ Qualified (≥${minAttendancePercentage}%)</span><div class="chart-bar-fill" style="width: ${course.qualifiedPercentage}%; background: var(--teal);"></div><span class="chart-value">${course.qualified} students (${course.qualifiedPercentage}%)</span></div>
            <div class="chart-bar"><span class="chart-label">⚠️ Close (${closeThreshold}-${minAttendancePercentage-1}%)</span><div class="chart-bar-fill" style="width: ${course.closeToQualifiedPercentage}%; background: var(--amber);"></div><span class="chart-value">${course.closeToQualified} students (${course.closeToQualifiedPercentage}%)</span></div>
            <div class="chart-bar"><span class="chart-label">❌ Not Qualified (<${closeThreshold}%)</span><div class="chart-bar-fill" style="width: ${course.notQualifiedPercentage}%; background: var(--danger);"></div><span class="chart-value">${course.notQualified} students (${course.notQualifiedPercentage}%)</span></div>
          </div>
          <div style="margin-bottom: 20px;"><canvas id="${chartId}" style="max-height: 300px; width: 100%;"></canvas></div>
          <details style="margin-top: 16px;"><summary style="cursor: pointer; color: var(--ug); font-weight: 500; padding: 8px; background: var(--surface2); border-radius: 8px;">📋 View Student Details (${course.totalStudents} students)</summary>
            <div style="overflow-x: auto; margin-top: 12px;"><table style="width: 100%; border-collapse: collapse; font-size: 12px;"><thead><tr style="background: var(--ug); color: white;"><th style="padding: 8px;">#</th><th style="padding: 8px;">Student ID</th><th style="padding: 8px;">Student Name</th><th style="padding: 8px;">Email</th><th style="padding: 8px;">Present</th><th style="padding: 8px;">Total</th><th style="padding: 8px;">Percentage</th><th style="padding: 8px;">Status</th></tr></thead><tbody>${course.studentDetails.sort((a, b) => b.percentage - a.percentage).map((s, i) => `<tr style="border-bottom: 1px solid var(--border); ${s.percentage < minAttendancePercentage - 5 ? 'background: var(--danger-s);' : (s.percentage < minAttendancePercentage ? 'background: var(--amber-s);' : '')}"><td style="padding: 8px;">${i + 1}</td><td style="padding: 8px;"><strong>${core().escapeHtml(s.id)}</strong></td><td style="padding: 8px;">${core().escapeHtml(s.name)}</td><td style="padding: 8px;">${core().escapeHtml(s.email)}</td><td style="padding: 8px; text-align: center;">${s.presentCount}</td><td style="padding: 8px; text-align: center;">${s.totalSessions}</td><td style="padding: 8px; text-align: center;"><strong style="color: ${s.statusColor};">${s.percentage}%</strong></td><td style="padding: 8px; color: ${s.statusColor};">${s.status}</td></tr>`).join('')}</tbody></table></div>
          </details>
        </div>`;
      }
      html += `</div>`;
      container.innerHTML = html;
      
      setTimeout(() => {
        if (typeof Chart === 'undefined') {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
          script.onload = () => { for (const course of courseStats) { const chartId = `chart-${course.courseCode}-${course.lecturerId}`.replace(/[^a-zA-Z0-9-]/g, '-'); setTimeout(() => renderCourseChart(chartId, course), 100); } };
          document.head.appendChild(script);
        } else {
          for (const course of courseStats) { const chartId = `chart-${course.courseCode}-${course.lecturerId}`.replace(/[^a-zA-Z0-9-]/g, '-'); setTimeout(() => renderCourseChart(chartId, course), 100); }
        }
      }, 200);
      currentDeptReportData = { courseStats, year: yearInt, semester: semInt, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage, closeThreshold, selectedLecturerName };
    } catch(err) { console.error('[CADM] Generate report error:', err); container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function showCourseDetails(courseCode, lecturerId, year, semester) {
    const course = currentReportCourseStats?.find(c => c.courseCode === courseCode && c.lecturerId === lecturerId);
    const minAttendance = core().getGlobalMinAttendance();
    if (!course) { await MODAL.alert('Error', 'Course details not found.'); return; }
    const qualifiedStudents = course.studentDetails.filter(s => s.percentage >= minAttendance);
    const closeStudents = course.studentDetails.filter(s => s.percentage >= (minAttendance - 5) && s.percentage < minAttendance);
    const notQualifiedStudents = course.studentDetails.filter(s => s.percentage < (minAttendance - 5));
    const modalContent = `<div style="max-height: 60vh; overflow-y: auto; padding-right: 10px;"><div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 15px; border-radius: 10px; margin-bottom: 20px;"><h3 style="margin: 0; color: white;">📚 ${core().escapeHtml(courseCode)} - ${core().escapeHtml(course.courseName)}</h3><p style="margin: 5px 0 0;">👨‍🏫 ${core().escapeHtml(course.lecturerName)}</p><p style="margin: 5px 0 0;">📊 ${course.totalSessions} sessions conducted</p><p style="margin: 5px 0 0;">🎯 Min Required (Global): ${minAttendance}%</p></div>
      <div class="stats-grid" style="margin-bottom: 20px;"><div class="stat-card"><div class="stat-value">${course.totalStudents}</div><div class="stat-label">Total Students</div></div><div class="stat-card"><div class="stat-value">${course.qualified}</div><div class="stat-label">✅ Qualified</div></div><div class="stat-card"><div class="stat-value" style="color: var(--amber);">${course.closeToQualified}</div><div class="stat-label">⚠️ Close (5% away)</div></div><div class="stat-card"><div class="stat-value" style="color: var(--danger);">${course.notQualified}</div><div class="stat-label">❌ Not Qualified</div></div></div>
      <div style="margin-bottom: 20px;"><h4>📊 Attendance Distribution</h4><div class="chart-bar"><span class="chart-label">✅ Qualified (≥${minAttendance}%)</span><div class="chart-bar-fill" style="width: ${course.qualifiedPercentage}%; background: var(--teal);"></div><span class="chart-value">${course.qualified} (${course.qualifiedPercentage}%)</span></div><div class="chart-bar"><span class="chart-label">⚠️ Close (${minAttendance-5}-${minAttendance-1}%)</span><div class="chart-bar-fill" style="width: ${course.closeToQualifiedPercentage}%; background: var(--amber);"></div><span class="chart-value">${course.closeToQualified} (${course.closeToQualifiedPercentage}%)</span></div><div class="chart-bar"><span class="chart-label">❌ Not Qualified (<${minAttendance-5}%)</span><div class="chart-bar-fill" style="width: ${course.notQualifiedPercentage}%; background: var(--danger);"></div><span class="chart-value">${course.notQualified} (${course.notQualifiedPercentage}%)</span></div></div>
      <div><h4>📋 Student List</h4><div class="filter-bar" style="margin-bottom: 10px;"><select id="student-filter-${courseCode}" class="fi" style="width: auto;" onchange="ADMIN_CO_REPORTS.filterStudentList('${courseCode}', '${lecturerId}')"><option value="all">All Students (${course.totalStudents})</option><option value="qualified">✅ Qualified (${qualifiedStudents.length})</option><option value="close">⚠️ Close - within 5% (${closeStudents.length})</option><option value="notqualified">❌ Not Qualified (${notQualifiedStudents.length})</option></select></div>
      <div id="student-list-container-${courseCode}">${renderStudentTable(qualifiedStudents.concat(closeStudents).concat(notQualifiedStudents), courseCode, minAttendance)}</div></div></div>`;
    await MODAL.alert(`Course Details: ${courseCode}`, modalContent, { icon: '📊', btnLabel: 'Close', width: '800px' });
  }

  function renderStudentTable(students, courseCode, minAttendance) {
    if (students.length === 0) return '<div class="no-rec">No students in this category.</div>';
    return `<div style="overflow-x: auto;"><table style="width: 100%; border-collapse: collapse; font-size: 12px;"><thead><tr style="background: var(--ug); color: white;"><th style="padding: 8px;">#</th><th style="padding: 8px;">Student ID</th><th style="padding: 8px;">Student Name</th><th style="padding: 8px;">Email</th><th style="padding: 8px;">Present</th><th style="padding: 8px;">Total</th><th style="padding: 8px;">Percentage</th><th style="padding: 8px;">Status</th></tr></thead><tbody>${students.sort((a, b) => b.percentage - a.percentage).map((s, i) => `<tr style="border-bottom: 1px solid var(--border); ${s.percentage < (minAttendance - 5) ? 'background: var(--danger-s);' : (s.percentage < minAttendance ? 'background: var(--amber-s);' : '')}"><td style="padding: 8px;">${i + 1}</td><td style="padding: 8px;"><strong>${core().escapeHtml(s.id)}</strong></td><td style="padding: 8px;">${core().escapeHtml(s.name)}</td><td style="padding: 8px;">${core().escapeHtml(s.email)}</td><td style="padding: 8px; text-align: center;">${s.presentCount}</td><td style="padding: 8px; text-align: center;">${s.totalSessions}</td><td style="padding: 8px; text-align: center;"><strong style="color: ${s.statusColor};">${s.percentage}%</strong></td><td style="padding: 8px; color: ${s.statusColor};">${s.status}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function filterStudentList(courseCode, lecturerId) {
    const filter = document.getElementById(`student-filter-${courseCode}`)?.value;
    const course = currentReportCourseStats?.find(c => c.courseCode === courseCode && c.lecturerId === lecturerId);
    const minAttendance = core().getGlobalMinAttendance();
    if (!course) return;
    let filteredStudents = [];
    switch(filter) {
      case 'qualified': filteredStudents = course.studentDetails.filter(s => s.percentage >= minAttendance); break;
      case 'close': filteredStudents = course.studentDetails.filter(s => s.percentage >= (minAttendance - 5) && s.percentage < minAttendance); break;
      case 'notqualified': filteredStudents = course.studentDetails.filter(s => s.percentage < (minAttendance - 5)); break;
      default: filteredStudents = course.studentDetails;
    }
    const container = document.getElementById(`student-list-container-${courseCode}`);
    if (container) container.innerHTML = renderStudentTable(filteredStudents, courseCode, minAttendance);
  }

  async function exportDepartmentReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
    if (!currentDeptReportData || !currentReportCourseStats.length) { await MODAL.alert('No Data', '📭 Generate a report first.'); return; }
    const { year, semester, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage, closeThreshold, selectedLecturerName } = currentDeptReportData;
    const courseStats = currentReportCourseStats;
    const deptName = core().getCoAdminDepartment();
    const wsData = [
      [`${core().escapeHtml(deptName)} Department - Attendance Report`], [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`], [`Minimum Attendance Required (Global): ${minAttendancePercentage}%`],
      [`Close Threshold (within 5%): ${closeThreshold}-${minAttendancePercentage-1}%`], selectedLecturerName ? [`Lecturer: ${core().escapeHtml(selectedLecturerName)}`] : [],
      [], ['SUMMARY STATISTICS'], [`Total Courses Analyzed:`, courseStats.length], [`Total Sessions Conducted:`, courseStats.reduce((sum, c) => sum + c.totalSessions, 0)],
      [`Total Students:`, totalStudents], [`Total Qualified Students (≥${minAttendancePercentage}%):`, `${totalQualified} (${Math.round((totalQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Total Not Qualified Students (<${closeThreshold}%):`, `${totalNotQualified} (${Math.round((totalNotQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Total Students Close to Threshold (${closeThreshold}-${minAttendancePercentage-1}%):`, `${totalCloseToQualified} (${Math.round((totalCloseToQualified / Math.max(totalStudents, 1)) * 100)}%)`],
      [`Overall Average Attendance:`, `${overallAverageAttendance}%`], [], ['COURSE-BY-COURSE DETAILS'],
      ['Course Code', 'Course Name', 'Lecturer', 'Total Sessions', 'Total Students', 'Qualified', 'Not Qualified', 'Close (5%)', 'Avg Attendance (%)']
    ];
    for (const c of courseStats) { wsData.push([c.courseCode, c.courseName, c.lecturerName, c.totalSessions, c.totalStudents, `${c.qualified} (${c.qualifiedPercentage}%)`, `${c.notQualified} (${c.notQualifiedPercentage}%)`, `${c.closeToQualified} (${c.closeToQualifiedPercentage}%)`, `${c.averageAttendance}%`]); }
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${deptName}_Attendance_Report`);
    XLSX.writeFile(wb, `UG_${deptName}_Attendance_Report_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', '✅ Report exported to Excel.');
  }

  async function exportDepartmentReportToPDF() {
    if (!currentDeptReportData || !currentReportCourseStats.length) { await MODAL.alert('No Report', '📭 Generate a report first.'); return; }
    const { year, semester, totalStudents, totalQualified, totalNotQualified, totalCloseToQualified, overallAverageAttendance, minAttendancePercentage, closeThreshold, selectedLecturerName } = currentDeptReportData;
    const courseStats = currentReportCourseStats;
    const deptName = core().getCoAdminDepartment();
    
    let summaryRows = '';
    for (const c of courseStats) {
      summaryRows += `<tr><td style="padding: 8px;"><strong>${core().escapeHtml(c.courseCode)}</strong></td><td style="padding: 8px;">${core().escapeHtml(c.courseName)}</strong></td><td style="padding: 8px;">${core().escapeHtml(c.lecturerName)}</strong></td><td style="padding: 8px; text-align: center;">${c.totalSessions}</strong></td><td style="padding: 8px; text-align: center;">${c.totalStudents}</strong></td><td style="padding: 8px; text-align: center; color: #1d9e75;">${c.qualified} (${c.qualifiedPercentage}%)</strong></td><td style="padding: 8px; text-align: center; color: #d42b2b;">${c.notQualified} (${c.notQualifiedPercentage}%)</strong></td><td style="padding: 8px; text-align: center; color: #b8860b;"><strong>${c.closeToQualified} (${c.closeToQualifiedPercentage}%)</strong></strong></td><td style="padding: 8px; text-align: center;"><strong>${c.averageAttendance}%</strong></strong></tr>`;
    }
    
    let courseGraphsHtml = '';
    for (const course of courseStats) {
      const bins = [
        { range: `0-${closeThreshold-1}%`, min: 0, max: closeThreshold - 1, color: '#d42b2b' },
        { range: `${closeThreshold}-${minAttendancePercentage-1}%`, min: closeThreshold, max: minAttendancePercentage - 1, color: '#fcd116' },
        { range: `${minAttendancePercentage}-79%`, min: minAttendancePercentage, max: 79, color: '#1d9e75' },
        { range: '80-89%', min: 80, max: 89, color: '#0d6e4a' },        { range: '90-100%', min: 90, max: 100, color: '#0a5a3c' }
      ];
      
      const binCounts = bins.map(bin => ({ ...bin, count: course.studentDetails.filter(s => s.percentage >= bin.min && s.percentage <= bin.max).length }));
      const maxCount = Math.max(...binCounts.map(b => b.count), 1);
      
      let studentRows = '';
      for (let i = 0; i < Math.min(course.studentDetails.length, 20); i++) {
        const s = course.studentDetails[i];
        const rowBg = s.percentage < (minAttendancePercentage - 5) ? '#fceaea' : (s.percentage < minAttendancePercentage ? '#fdf6d8' : '');
        studentRows += `
          <tr style="border-bottom: 1px solid #ddd; background: ${rowBg};">
            <td style="padding: 6px;">${i + 1}</td>
            <td style="padding: 6px;"><strong>${core().escapeHtml(s.id)}</strong></td>
            <td style="padding: 6px;">${core().escapeHtml(s.name)}</td>
            <td style="padding: 6px; text-align: center;">${s.presentCount}</td>
            <td style="padding: 6px; text-align: center;">${s.totalSessions}</td>
            <td style="padding: 6px; text-align: center;"><strong>${s.percentage}%</strong></td>
            <td style="padding: 6px;">${s.status}</td>
           </tr>
        `;
      }
      
      courseGraphsHtml += `
        <div style="margin: 30px 0; page-break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 15px;">
          <h3 style="color: #003087; margin: 0 0 5px 0;">📚 ${core().escapeHtml(course.courseCode)} - ${core().escapeHtml(course.courseName)}</h3>
          <p style="margin: 0 0 10px 0; color: #666; font-size: 12px;">👨‍🏫 ${core().escapeHtml(course.lecturerName)} | 📊 ${course.totalSessions} sessions | 🎓 ${course.totalStudents} students</p>
          
          <div style="display: flex; gap: 10px; margin: 15px 0; flex-wrap: wrap;">
            <div style="background: #1d9e75; padding: 8px 12px; border-radius: 8px; color: white; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${course.qualified}</div>
              <div style="font-size: 10px;">Qualified (≥${minAttendancePercentage}%)</div>
            </div>
            <div style="background: #b8860b; padding: 8px 12px; border-radius: 8px; color: white; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${course.closeToQualified}</div>
              <div style="font-size: 10px;">Close (${closeThreshold}-${minAttendancePercentage-1}%)</div>
            </div>
            <div style="background: #d42b2b; padding: 8px 12px; border-radius: 8px; color: white; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${course.notQualified}</div>
              <div style="font-size: 10px;">Not Qualified (<${closeThreshold}%)</div>
            </div>
            <div style="background: #003087; padding: 8px 12px; border-radius: 8px; color: white; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">${course.averageAttendance}%</div>
              <div style="font-size: 10px;">Average</div>
            </div>
          </div>
          
          <div style="margin: 15px 0;">
            <h4 style="margin: 0 0 10px 0; font-size: 14px;">📊 Attendance Distribution</h4>
            <table style="width: 100%; border-collapse: collapse;">
              ${binCounts.map(bin => `
                <tr>
                  <td style="width: 80px; padding: 4px; font-size: 11px;">${bin.range}</td>
                  <td style="padding: 4px;">
                    <div style="background: ${bin.color}; width: ${(bin.count / maxCount) * 100}%; min-width: ${bin.count > 0 ? '20px' : '0'}; height: 25px; border-radius: 4px; display: inline-block; text-align: right; padding-right: 5px; line-height: 25px; color: white; font-size: 11px; font-weight: bold;">
                      ${bin.count > 0 ? bin.count : ''}
                    </div>
                  </td>
                  <td style="width: 40px; padding: 4px; font-size: 11px;">${bin.count}</td>
                 </tr>
              `).join('')}
            </table>
          </div>
          
          <details style="margin-top: 15px;">
            <summary style="cursor: pointer; background: #f0f2f5; padding: 8px; border-radius: 5px; font-weight: 500;">📋 Student Details (${course.totalStudents} students)</summary>
            <div style="overflow-x: auto; margin-top: 10px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 10px;">
                <thead>
                  <tr style="background: #003087; color: white;">
                    <th style="padding: 6px;">#</th>
                    <th style="padding: 6px;">Student ID</th>
                    <th style="padding: 6px;">Name</th>
                    <th style="padding: 6px;">Present</th>
                    <th style="padding: 6px;">Total</th>
                    <th style="padding: 6px;">%</th>
                    <th style="padding: 6px;">Status</th>
                   </tr>
                </thead>
                <tbody>
                  ${studentRows}
                </tbody>
                ${course.studentDetails.length > 20 ? `<tfoot><tr><td colspan="7" style="padding: 6px; text-align: center; font-size: 10px;">... and ${course.studentDetails.length - 20} more students</td></tr></tfoot>` : ''}
              </table>
            </div>
          </details>
        </div>
      `;
    }
    
    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${deptName} Department Attendance Report</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; color: #333; line-height: 1.5; font-size: 12px; }
        h1 { color: #003087; border-bottom: 3px solid #fcd116; padding-bottom: 10px; margin-top: 0; }
        h2 { color: #003087; margin-top: 25px; font-size: 18px; }
        h3 { color: #003087; font-size: 16px; }
        h4 { font-size: 14px; margin: 10px 0; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary-cards { display: flex; justify-content: space-between; gap: 15px; margin: 20px 0; flex-wrap: wrap; }
        .card { background: #f5f5f7; border-radius: 8px; padding: 12px; text-align: center; flex: 1; min-width: 120px; border: 1px solid #ddd; }
        .card-value { font-size: 24px; font-weight: bold; color: #003087; }
        .card-label { font-size: 11px; color: #666; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #003087; color: white; padding: 8px; text-align: left; font-size: 11px; }
        td { border-bottom: 1px solid #ddd; padding: 6px; font-size: 10px; }
        .close-note { background: #fff3cd; border-left: 4px solid #fcd116; padding: 10px; margin: 15px 0; font-size: 11px; }
        .footer { text-align: center; font-size: 9px; color: #999; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; }
        .page-break { page-break-before: always; }
        @media print {
          body { margin: 0; padding: 15px; }
          .page-break { page-break-before: always; }
          th { background: #003087 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .card, .close-note, div[style*="background"] { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 ${core().escapeHtml(deptName)} Department</h1>
        <h2>Attendance Report</h2>
        <p><strong>Academic Year:</strong> ${year} - ${semester === 1 ? 'First Semester' : 'Second Semester'}</p>
        ${selectedLecturerName ? `<p><strong>Lecturer:</strong> ${core().escapeHtml(selectedLecturerName)}</p>` : ''}
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Minimum Attendance Required (Global):</strong> ${minAttendancePercentage}%</p>
      </div>
      
      <div class="close-note">
        ⚠️ <strong>Close Definition:</strong> Students with attendance between ${closeThreshold}% and ${minAttendancePercentage-1}% are within 5% of the minimum attendance requirement.
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
          <tr>
            <th>Course Code</th><th>Course Name</th><th>Lecturer</th><th>Sessions</th><th>Students</th><th>Qualified</th><th>Not Qualified</th><th>Close (5%)</th><th>Avg %</th>
          </tr>
        </thead>
        <tbody>${summaryRows}</tbody>
      </table>
      
      <div class="page-break"></div>
      
      <h2>📊 Individual Course Attendance Graphs</h2>
      ${courseGraphsHtml}
      
      <div class="footer">
        <p>University of Ghana, Legon - ${core().escapeHtml(deptName)} Department</p>
        <p>This report was generated automatically by the UG QR Attendance System</p>
      </div>
    </body>
    </html>`;
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ==================== COURSES ====================
  async function renderCourses() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📚 Courses - ${core().escapeHtml(deptName)}</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="co-course-year" class="fi" onchange="ADMIN_CO_REPORTS.loadDepartmentCourses()"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div><label class="fl">Semester</label><select id="co-course-semester" class="fi" onchange="ADMIN_CO_REPORTS.loadDepartmentCourses()"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Lecturer</label><select id="co-course-lecturer" class="fi" onchange="ADMIN_CO_REPORTS.loadDepartmentCourses()"><option value="">All</option></select></div>
          <div><button class="btn btn-ug" onclick="ADMIN_CO_REPORTS.loadDepartmentCourses()">Filter</button></div>
        </div>
        <div id="co-courses-list"></div>
      </div>
    `;
    await loadDepartmentCourseLecturers();
  }

  async function loadDepartmentCourseLecturers() {
    const deptName = core().getCoAdminDepartment();
    const select = document.getElementById('co-course-lecturer');
    if (select) {
      const lecturers = await DB.LEC.getAll();
      select.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === deptName).map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
    }
  }

  async function loadDepartmentCourses() {
    const container = document.getElementById('co-courses-list');
    const year = document.getElementById('co-course-year')?.value;
    const semester = document.getElementById('co-course-semester')?.value;
    const lecturerId = document.getElementById('co-course-lecturer')?.value;
    const deptName = core().getCoAdminDepartment();
    
    container.innerHTML = '<div class="att-empty">Loading...</div>';
    try {
      let allCourses = await fetchAllCoursesForDept();
      let filtered = allCourses.filter(c => c.department === deptName);
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
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${core().escapeHtml(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">${lecGroup.courses.map(c => `<span class="pill">📚 ${core().escapeHtml(c.courseCode)} (${c.sessionCount} sessions)</span>`).join('')}</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
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

  // ==================== BACKUP ====================
  async function renderBackup() {
    const container = document.getElementById('cadm-content');
    if (!container) return;
    
    const deptName = core().getCoAdminDepartment();
    
    container.innerHTML = `
      <div class="pg">
        <h2>💾 Department Backups - ${core().escapeHtml(deptName)}</h2>
        <button class="btn btn-ug" onclick="ADMIN_CO_REPORTS.createDeptBackup()">Create Backup</button>
        <div id="dept-backups-list" style="margin-top:20px"></div>
      </div>
    `;
    await loadDeptBackups();
  }

  async function loadDeptBackups() {
    const container = document.getElementById('dept-backups-list');
    if (!container) return;
    const deptName = core().getCoAdminDepartment();
    
    try {
      const backups = await DB.BACKUP.getAll();
      const deptBackups = backups.filter(b => b.department === deptName);
      if (!deptBackups.length) { container.innerHTML = '<div class="no-rec">No backups</div>'; return; }
      container.innerHTML = deptBackups.sort((a,b) => b.createdAt - a.createdAt).map(b => `
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid var(--border)">
          <div><strong>📀 ${new Date(b.createdAt).toLocaleString()}</strong><div>📊 ${b.sessionCount || 0} sessions</div></div>
          <div><button class="btn btn-secondary btn-sm" onclick="ADMIN_CO_REPORTS.downloadDeptBackup('${b.id}')">Download</button><button class="btn btn-danger btn-sm" onclick="ADMIN_CO_REPORTS.deleteDeptBackup('${b.id}')">Delete</button></div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML = '<div class="no-rec">Error loading backups</div>'; }
  }

  async function createDeptBackup() {
    try {
      const myDept = core().getCoAdminDepartment();
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

  // ==================== ANNOUNCEMENTS ====================
  async function showCoAdminAnnouncementModal() {
    const myDept = core().getCoAdminDepartment();
    
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="field">
          <label class="fl">👥 Send To</label>
          <select id="coadmin-announcement-audience" class="fi">
            <option value="lecturers">Lecturers in ${core().escapeHtml(myDept)}</option>
            <option value="students">Students in ${core().escapeHtml(myDept)}</option>
            <option value="both">Both Lecturers & Students in ${core().escapeHtml(myDept)}</option>
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
        <p class="note">📧 This announcement will be sent to all ${core().escapeHtml(myDept)} department members.</p>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('📢 Send Department Announcement', modalContent, { confirmLabel: '📢 Send Announcement', cancelLabel: 'Cancel', confirmCls: 'btn-ug', width: '550px' });
    if (!confirmed) return;
    
    const audience = document.getElementById('coadmin-announcement-audience')?.value;
    const title = document.getElementById('coadmin-announcement-title')?.value.trim();
    const message = document.getElementById('coadmin-announcement-message')?.value.trim();
    const priority = document.getElementById('coadmin-announcement-priority')?.value;
    
    if (!title || !message) { await MODAL.alert('Missing Info', 'Please fill in all fields.'); return; }
    
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const user = AUTH.getSession();
    const myDeptName = core().getCoAdminDepartment();
    
    try {
      let recipients = [];
      if (audience === 'lecturers' || audience === 'both') {
        const lecturers = await DB.LEC.getAll();
        recipients.push(...lecturers.filter(l => l.department === myDeptName));
      }
      if (audience === 'students' || audience === 'both') {
        const students = await DB.STUDENTS.getAll();
        recipients.push(...students.filter(s => s.department === myDeptName));
      }
      
      const announcement = { id: announcementId, title, message, priority, audience, department: myDeptName, senderId: user?.id, senderName: user?.name || 'Co-Administrator', senderRole: 'coAdmin', timestamp: Date.now(), readBy: [] };
      await DB.set(`announcements/department/${myDeptName}/${announcementId}`, announcement);
      
      let notifiedCount = 0;
      for (const recipient of recipients) {
        let role = 'student';
        if (recipient.lecId || recipient.id?.startsWith('LEC')) role = 'lecturer';
        else if (recipient.studentId) role = 'student';
        const recipientId = recipient.studentId || recipient.id;
        await DB.set(`notifications/${role}/${recipientId}/announcements/${announcementId}`, { id: announcementId, title: `📢 ${title}`, message: `${myDeptName}: ${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`, type: priority, timestamp: Date.now(), read: false, link: null, announcementId });
        notifiedCount++;
      }
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${notifiedCount} recipients in ${myDeptName} department.`);
    } catch(err) { console.error('Send co-admin announcement error:', err); await MODAL.error('Error', 'Failed to send announcement. Please try again.'); }
  }

  return {
    renderSessions,
    filterSessions,
    viewSessionDetails,
    exportSingleSession,
    exportSessionsToExcel,
    renderDatabase,
    generateDepartmentReport,
    exportDepartmentReportToExcel,
    exportDepartmentReportToPDF,
    loadDeptReportLecturers,
    renderCourses,
    loadDepartmentCourses,
    loadDepartmentCourseLecturers,
    renderBackup,
    createDeptBackup,
    downloadDeptBackup,
    deleteDeptBackup,
    loadDeptBackups,
    showCoAdminAnnouncementModal,
    showCourseDetails,
    filterStudentList,
    renderCourseChart
  };
})();

window.ADMIN_CO_REPORTS = ADMIN_CO_REPORTS;
