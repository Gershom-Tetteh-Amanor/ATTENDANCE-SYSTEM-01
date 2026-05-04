/* admin-super-reports.js — Super Admin: Reports, Announcements, Settings */
'use strict';

const ADMIN_SUPER_REPORTS = (() => {
  const core = () => window.ADMIN_CORE;
  let currentReportData = null;
  
  // ==================== SETTINGS ====================
  async function renderSettings() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    const currentMin = core().getGlobalMinAttendance();
    
    container.innerHTML = `
      <div class="pg">
        <h2>⚙️ Settings</h2>
        <div class="inner-panel">
          <h3>📊 Minimum Attendance Percentage (Global)</h3>
          <p class="sub">This value applies to ALL attendance calculations across the system.</p>
          <div class="two-col">
            <div class="field">
              <label class="fl">Minimum Required %</label>
              <input type="number" id="global-min-attendance" class="fi" value="${currentMin}" min="0" max="100" step="5">
            </div>
            <div><button class="btn btn-ug" onclick="ADMIN_SUPER_REPORTS.updateGlobalMinAttendance()">Save Global Setting</button></div>
          </div>
          <p class="note" style="margin-top: 8px;">⚠️ Changing this value affects all attendance reports for lecturers, co-admins, and students.</p>
        </div>
        <div class="inner-panel"><h3>System Stats</h3><div class="stats-grid">
          <div class="stat-card"><div class="stat-value" id="stat-total-users">-</div><div class="stat-label">Users</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-total-sessions">-</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-total-checkins">-</div><div class="stat-label">Check-ins</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-active-lecturers">-</div><div class="stat-label">Active Lecturers</div></div>
        </div></div>
        <div class="inner-panel"><h3>Data Deletion</h3><div class="filter-bar">
          <div><label class="fl">Year From</label><input type="number" id="delete-year-from" class="fi"></div>
          <div><label class="fl">Year To</label><input type="number" id="delete-year-to" class="fi"></div>
          <div><label class="fl">Department</label><select id="delete-dept" class="fi"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
        </div><div style="display:flex; gap:10px; margin-top:15px"><button class="btn btn-warning" onclick="ADMIN_SUPER_REPORTS.deleteDataByRange()">Delete Range</button><button class="btn btn-danger" onclick="ADMIN_SUPER_REPORTS.resetAllData()">Reset All</button></div></div>
      </div>
    `;
    await loadSystemStats();
  }

  async function updateGlobalMinAttendance() {
    const newValue = document.getElementById('global-min-attendance')?.value;
    if (newValue && !isNaN(newValue)) {
      await core().setGlobalMinAttendance(parseInt(newValue));
      await MODAL.success('Updated', `Global minimum attendance set to ${core().getGlobalMinAttendance()}%`);
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

  // ==================== OVERALL REPORTS ====================
  async function renderOverallReports() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    const currentMin = core().getGlobalMinAttendance();
    
    container.innerHTML = `
      <div class="pg">
        <h2>📊 Overall Reports</h2>
        <div class="filter-bar">
          <div><label class="fl">Year</label><select id="overall-year" class="fi"><option value="">All</option>${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          <div><label class="fl">Semester</label><select id="overall-semester" class="fi"><option value="">All</option><option value="1">First</option><option value="2">Second</option></select></div>
          <div><label class="fl">Department</label><select id="overall-dept" class="fi" onchange="ADMIN_SUPER_REPORTS.loadOverallReportLecturers()"><option value="">All</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
          <div><label class="fl">Lecturer</label><select id="overall-lecturer" class="fi"><option value="">All</option></select></div>
          <div><label class="fl">Min % (Global: ${currentMin}%)</label><input type="number" id="min-attendance" class="fi" value="${currentMin}" style="width:80px"></div>
          <div><button class="btn btn-ug" onclick="ADMIN_SUPER_REPORTS.generateOverallReport()">Generate</button></div>
          <div><button class="btn btn-secondary" onclick="ADMIN_SUPER_REPORTS.exportOverallReportToExcel()">Export Excel</button></div>
          <div><button class="btn btn-teal" onclick="ADMIN_SUPER_REPORTS.downloadOverallReportPDF()">Export PDF</button></div>
          <div><button class="btn btn-outline" onclick="ADMIN_SUPER_REPORTS.updateReportMinAttendance()">Update Min</button></div>
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
    lecturerSelect.innerHTML = '<option value="">All Lecturers</option>' + lecturers.filter(l => l.department === dept).map(l => `<option value="${l.id}">${core().escapeHtml(l.name)}</option>`).join('');
  }

  async function updateReportMinAttendance() {
    const newValue = document.getElementById('min-attendance')?.value;
    if (newValue && !isNaN(newValue)) {
      await core().setGlobalMinAttendance(parseInt(newValue));
      await MODAL.success('Updated', `Global minimum attendance set to ${core().getGlobalMinAttendance()}%`);
      await generateOverallReport();
    }
  }

  async function generateOverallReport() {
    const year = document.getElementById('overall-year')?.value;
    const semester = document.getElementById('overall-semester')?.value;
    const dept = document.getElementById('overall-dept')?.value;
    const lecturerId = document.getElementById('overall-lecturer')?.value;
    const container = document.getElementById('overall-report-results');
    const minAttendance = core().getGlobalMinAttendance();
    
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
      const good = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendance && (s.count / s.total) * 100 < 80).length;
      const atRisk = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 >= minAttendance - 20 && (s.count / s.total) * 100 < minAttendance).length;
      const critical = Array.from(studentAttendance.values()).filter(s => (s.count / s.total) * 100 < minAttendance - 20).length;
      
      container.innerHTML = `
        <div style="background:linear-gradient(135deg, var(--ug), #001f5c); color:white; padding:20px; border-radius:12px; text-align:center">
          <h3 style="margin:0; color:white;">📊 Attendance Report</h3>
          <p style="margin:8px 0 0;">${year || 'All Years'} ${semester ? 'Sem ' + semester : ''} ${dept || 'All'}</p>
          <p style="margin:4px 0 0; opacity:0.9;">Global Min Required: ${minAttendance}%</p>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${uniqueStudents.size}</div><div class="stat-label">Students</div></div>
          <div class="stat-card"><div class="stat-value">${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents.size, 1))) * 100) : 0}%</div><div class="stat-label">Avg</div></div>
        </div>
        <div class="report-chart"><h4>📈 Attendance Distribution</h4>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (80-100%)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (${minAttendance}-79%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (${minAttendance - 20}-${minAttendance - 1}%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(uniqueStudents.size, 1)) * 100}%; background: #e67e22;"></div><span class="chart-value">${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<${minAttendance - 20}%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(uniqueStudents.size, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${critical} students</span></div>
        </div>
        <div style="margin-top: 24px;">
          <h4>📋 Recent Sessions</h4>
          <div style="overflow-x: auto; width: 100%;">
            <table style="width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px;">
              <thead>
                <tr style="background: var(--ug); color: white;">
                  <th style="padding: 12px; text-align: left;">📅 Date</th>
                  <th style="padding: 12px; text-align: left;">Course</th>
                  <th style="padding: 12px; text-align: left;">Lecturer</th>
                  <th style="padding: 12px; text-align: left;">Department</th>
                  <th style="padding: 12px; text-align: center;">Students</th>
                  <th style="padding: 12px; text-align: center;">Actions</th>
                </td>
              </thead>
              <tbody>
                ${sessions.slice(0, 20).map(s => `
                  <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 10px;">${core().escapeHtml(s.date)}</td>
                    <td style="padding: 10px;"><strong>${core().escapeHtml(s.courseCode)}</strong><br><small>${core().escapeHtml(s.courseName || '')}</small></td>
                    <td style="padding: 10px;">${core().escapeHtml(s.lecturer || 'Unknown')}</td>
                    <td style="padding: 10px;">${core().escapeHtml(s.department || 'Unknown')}</td>
                    <td style="padding: 10px; text-align: center;">${s.records ? Object.values(s.records).length : 0}</td>
                    <td style="padding: 10px; text-align: center;"><button class="btn btn-teal btn-sm" onclick="ADMIN_SUPER_DATA.exportSingleSession('${s.id}')">📥 Download</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
      currentReportData = { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents: uniqueStudents.size, excellent, good, atRisk, critical, minAttendance };
    } catch(err) { container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`; }
  }

  async function exportOverallReportToExcel() {
    if (typeof XLSX === 'undefined') { await MODAL.alert('Error', 'Excel not loaded.'); return; }
    if (!currentReportData) { await MODAL.alert('No Data', 'Generate report first.'); return; }
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical, minAttendance } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    const wsData = [
      ['Attendance Report'], [`Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}`], [`Department: ${dept || 'All'}`], [`Lecturer: ${lecturer?.name || 'All'}`],
      [`Global Min Attendance: ${minAttendance}%`], [], ['Summary', `Sessions: ${totalSessions}`, `Check-ins: ${totalCheckins}`, `Students: ${uniqueStudents}`, `Avg: ${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%`],
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
    const { sessions, year, semester, dept, lecturerId, totalSessions, totalCheckins, uniqueStudents, excellent, good, atRisk, critical, minAttendance } = currentReportData;
    const lecturer = lecturerId ? await DB.LEC.get(lecturerId) : null;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Attendance Report</title><style>body{font-family:Arial;margin:40px}h1{color:#003087}table{width:100%;border-collapse:collapse}th{background:#003087;color:white;padding:10px}td{border:1px solid #ddd;padding:8px}</style></head><body><h1>📊 Attendance Report</h1><p>Period: ${year || 'All Years'} ${semester ? 'Sem ' + semester : ''}</p><p>Department: ${dept || 'All'} | Lecturer: ${lecturer?.name || 'All'}</p><p>Global Min Required: ${minAttendance}%</p><h2>Summary</h2><p>Sessions: ${totalSessions} | Check-ins: ${totalCheckins} | Students: ${uniqueStudents} | Avg: ${totalSessions > 0 ? Math.round((totalCheckins / (totalSessions * Math.max(uniqueStudents, 1))) * 100) : 0}%</p><h2>Distribution</h2><p>Excellent: ${excellent} | Good: ${good} | At Risk: ${atRisk} | Critical: ${critical}</p><h2>Sessions</h2><table><thead><tr><th>Date</th><th>Course</th><th>Lecturer</th><th>Department</th><th>Students</th></tr></thead><tbody>${sessions.slice(0, 30).map(s => `<tr><td>${s.date}</td><td>${core().escapeHtml(s.courseCode)}</td><td>${core().escapeHtml(s.lecturer)}</td><td>${core().escapeHtml(s.department)}</td><td>${s.records ? Object.values(s.records).length : 0}</td></tr>`).join('')}</tbody></table></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  }

  // ==================== ANNOUNCEMENTS ====================
  async function renderAnnouncements() {
    const container = document.getElementById('sadm-content');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading announcements...</div>';
    
    try {
      const announcements = await DB.get('announcements/system');
      if (!announcements || Object.keys(announcements).length === 0) {
        container.innerHTML = '<div class="inner-panel"><div class="att-empty">📭 No system announcements yet.</div></div>';
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
              <span class="course-code">${priorityIcon} ${core().escapeHtml(ann.title)}</span>
              <span class="badge" style="background: ${priorityColor};">${ann.priority === 'danger' ? 'Urgent' : (ann.priority === 'warning' ? 'Important' : 'Info')}</span>
            </div>
            <div class="course-name">📅 ${new Date(ann.timestamp).toLocaleString()}</div>
            <div class="course-stats">👤 Sent by: ${core().escapeHtml(ann.senderName)} (${ann.senderRole === 'superAdmin' ? 'Admin' : ann.senderRole})</div>
            <div class="course-stats">👥 Audience: ${ann.audience === 'all' ? 'Everyone' : ann.audience} ${ann.department ? ` - ${ann.department}` : ''}</div>
            <div class="message-content" style="margin-top: 10px; padding: 12px; background: var(--surface2); border-radius: 8px;">${core().escapeHtml(ann.message)}</div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
    } catch(err) {
      console.error('Load announcements error:', err);
      container.innerHTML = '<div class="no-rec">❌ Error loading announcements</div>';
    }
  }

  async function showAdminAnnouncementModal() {
    const modalContent = `
      <div style="max-height: 60vh; overflow-y: auto; padding-right: 5px;">
        <div class="field">
          <label class="fl">👥 Send To</label>
          <select id="admin-announcement-audience" class="fi" onchange="ADMIN_SUPER_REPORTS.toggleAdminAnnouncementFilters()">
            <option value="all">Everyone (All Users)</option>
            <option value="coadmins">Co-Admins Only</option>
            <option value="lecturers">Lecturers Only</option>
            <option value="students">Students Only</option>
            <option value="department">Specific Department</option>
          </select>
        </div>
        <div id="admin-dept-filter" style="display: none;">
          <div class="field"><label class="fl">🏛️ Department</label><select id="admin-announcement-dept" class="fi"><option value="">Select Department</option>${CONFIG.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label class="fl">📢 Announcement Title</label><input type="text" id="admin-announcement-title" class="fi" placeholder="e.g., System Maintenance, Policy Update, etc."></div>
        <div class="field"><label class="fl">📝 Announcement Message</label><textarea id="admin-announcement-message" class="fi" rows="5" placeholder="Type your announcement here..."></textarea></div>
        <div class="field"><label class="fl">🔔 Priority Level</label><select id="admin-announcement-priority" class="fi"><option value="info">ℹ️ Normal (Info)</option><option value="warning">⚠️ Important (Warning)</option><option value="danger">🚨 Urgent (Critical)</option></select></div>
      </div>
    `;
    
    const confirmed = await MODAL.confirm('📢 Send System Announcement', modalContent, { confirmLabel: '📢 Send Announcement', cancelLabel: 'Cancel', confirmCls: 'btn-ug', width: '550px' });
    if (!confirmed) return;
    
    const audience = document.getElementById('admin-announcement-audience')?.value;
    const department = document.getElementById('admin-announcement-dept')?.value;
    const title = document.getElementById('admin-announcement-title')?.value.trim();
    const message = document.getElementById('admin-announcement-message')?.value.trim();
    const priority = document.getElementById('admin-announcement-priority')?.value;
    if (!title || !message) { await MODAL.alert('Missing Info', 'Please fill in all fields.'); return; }
    
    const announcementId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    const user = AUTH.getSession();
    
    try {
      let recipients = [];
      if (audience === 'all') {
        const lecturers = await DB.LEC.getAll();
        const students = await DB.STUDENTS.getAll();
        const coadmins = await DB.CA.getAll();
        recipients = [...lecturers, ...students, ...coadmins];
      } else if (audience === 'coadmins') { recipients = await DB.CA.getAll();
      } else if (audience === 'lecturers') {
        let lecturers = await DB.LEC.getAll();
        if (department) lecturers = lecturers.filter(l => l.department === department);
        recipients = lecturers;
      } else if (audience === 'students') {
        let students = await DB.STUDENTS.getAll();
        if (department) students = students.filter(s => s.department === department);
        recipients = students;
      } else if (audience === 'department' && department) {
        const lecturers = await DB.LEC.getAll();
        const students = await DB.STUDENTS.getAll();
        recipients = [...lecturers.filter(l => l.department === department), ...students.filter(s => s.department === department)];
      }
      
      const announcement = { id: announcementId, title, message, priority, audience, department: department || null, senderId: user?.id || 'admin', senderName: user?.name || 'System Administrator', senderRole: user?.role || 'superAdmin', timestamp: Date.now(), readBy: [] };
      await DB.set(`announcements/system/${announcementId}`, announcement);
      
      for (const recipient of recipients) {
        let role = 'student';
        if (recipient.lecId || recipient.id?.startsWith('LEC')) role = 'lecturer';
        else if (recipient.status === 'approved' || recipient.status === 'joint') role = 'coAdmin';
        else if (recipient.studentId) role = 'student';
        const recipientId = recipient.studentId || recipient.id;
        await DB.set(`notifications/${role}/${recipientId}/announcements/${announcementId}`, { id: announcementId, title: `📢 ${title}`, message: `${message.substring(0, 150)}${message.length > 150 ? '...' : ''}`, type: priority, timestamp: Date.now(), read: false, link: null, announcementId });
      }
      await MODAL.success('Announcement Sent', `✅ Announcement sent to ${recipients.length} recipients.`);
    } catch(err) { console.error('Send admin announcement error:', err); await MODAL.error('Error', 'Failed to send announcement. Please try again.'); }
  }

  function toggleAdminAnnouncementFilters() {
    const audience = document.getElementById('admin-announcement-audience')?.value;
    const deptFilter = document.getElementById('admin-dept-filter');
    if (deptFilter) deptFilter.style.display = (audience === 'department' || audience === 'lecturers' || audience === 'students') ? 'block' : 'none';
  }

  return {
    renderSettings,
    updateGlobalMinAttendance,
    loadSystemStats,
    deleteDataByRange,
    resetAllData,
    renderOverallReports,
    loadOverallReportLecturers,
    updateReportMinAttendance,
    generateOverallReport,
    exportOverallReportToExcel,
    downloadOverallReportPDF,
    renderAnnouncements,
    showAdminAnnouncementModal,
    toggleAdminAnnouncementFilters
  };
})();

window.ADMIN_SUPER_REPORTS = ADMIN_SUPER_REPORTS;
