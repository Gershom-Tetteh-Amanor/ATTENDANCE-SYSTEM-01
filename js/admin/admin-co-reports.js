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
      container.innerHTML = html
