/* session-reports.js — Reports for Lecturer/TA Dashboard */
'use strict';

const SESSION_REPORTS = (() => {
  const core = () => window.SESSION_CORE;
  
  async function loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    const myId = core().getCurrentLecturerId();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="report-year" class="fi" onchange="SESSION_REPORTS.populateReportCourses()">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="report-semester" class="fi" onchange="SESSION_REPORTS.populateReportCourses()">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div style="min-width: 200px;">
          <label class="fl">📚 Course</label>
          <select id="report-course" class="fi">
            <option value="">Select Course</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="SESSION_REPORTS.generateReport()">📊 Generate Report</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="SESSION_REPORTS.exportReportToExcel()">📥 Export Excel</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">📭 Select course and click Generate Report</div></div>
    `;
  }

  async function populateReportCourses() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseSelect = document.getElementById('report-course');
    if (!year || !semester || !courseSelect) return;
    
    courseSelect.innerHTML = '<option value=""><span class="spin-ug"></span> Loading...</option>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        courseSelect.innerHTML = '<option value="">📭 No courses found for this period</option>';
        return;
      }
      
      let options = '<option value="">Select Course</option>';
      for (const course of periodCourses) {
        options += `<option value="${core().escapeHtml(course.code)}|${core().escapeHtml(course.name)}">${core().escapeHtml(course.code)} - ${core().escapeHtml(course.name)}</option>`;
      }
      courseSelect.innerHTML = options;
    } catch(err) { 
      courseSelect.innerHTML = '<option value="">❌ Error loading courses</option>'; 
    }
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const courseValue = document.getElementById('report-course')?.value;
    const container = document.getElementById('report-results');
    
    if (!year || !semester || !courseValue) {
      await MODAL.alert('Missing Info', '⚠️ Please select Year, Semester, and Course.');
      return;
    }
    
    const [courseCode, courseName] = courseValue.split('|');
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Generating report...</div>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const allSessions = await DB.SESSION.getAll();
      const courseSessions = allSessions.filter(s => 
        s.lecFbId === myId &&
        s.courseCode === courseCode && 
        s.year === yearInt && 
        s.semester === semInt &&
        s.active === false
      );
      
      const totalSessions = courseSessions.length;
      
      if (totalSessions === 0) {
        container.innerHTML = '<div class="no-rec">📭 No completed sessions found for this course in the selected period.</div>';
        return;
      }
      
      const allEnrollments = await DB.ENROLLMENT.getAll();
      const courseEnrollments = allEnrollments.filter(e => 
        e.lecId === myId &&
        e.courseCode === courseCode && 
        e.year === yearInt && 
        e.semester === semInt
      );
      
      if (courseEnrollments.length === 0) {
        container.innerHTML = '<div class="no-rec">📭 No students enrolled in this course for the selected period.</div>';
        return;
      }
      
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
        const category = core().getAttendanceCategory(percentage);
        
        studentStats.push({
          id: student.studentId,
          name: student.name,
          email: student.email,
          presentCount: presentCount,
          totalSessions: totalSessions,
          percentage: percentage,
          status: category.text,
          statusColor: category.color
        });
      }
      
      studentStats.sort((a, b) => b.percentage - a.percentage);
      
      const totalStudents = studentStats.length;
      const totalAttendance = studentStats.reduce((sum, s) => sum + s.presentCount, 0);
      const averageAttendance = totalSessions > 0 && totalStudents > 0 
        ? Math.round((totalAttendance / (totalSessions * totalStudents)) * 100) : 0;
      
      const excellent = studentStats.filter(s => s.percentage >= 80).length;
      const good = studentStats.filter(s => s.percentage >= 75 && s.percentage < 80).length;
      const atRisk = studentStats.filter(s => s.percentage >= 60 && s.percentage < 75).length;
      const critical = studentStats.filter(s => s.percentage < 60).length;
      
      let html = `
        <div style="background: linear-gradient(135deg, var(--ug), #001f5c); color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
          <h3 style="margin: 0; color: white;">📊 Attendance Frequency Report</h3>
          <p style="margin: 5px 0 0; opacity: 0.9;">${core().escapeHtml(courseCode)} - ${core().escapeHtml(courseName)}</p>
          <p style="margin: 5px 0 0; opacity: 0.8;">${yearInt} - ${semInt === 1 ? 'First Semester' : 'Second Semester'}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📅 Generated: ${new Date().toLocaleString()}</p>
          <p style="margin: 5px 0 0; opacity: 0.7;">📊 Total Sessions Conducted: ${totalSessions}</p>
        </div>
        
        <div class="stats-grid" style="margin-bottom: 20px;">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">📚 Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">🎓 Total Students</div></div>
          <div class="stat-card"><div class="stat-value">${averageAttendance}%</div><div class="stat-label">📊 Avg Attendance</div></div>
          <div class="stat-card"><div class="stat-value">${totalAttendance}</div><div class="stat-label">✅ Total Check-ins</div></div>
        </div>
        
        <div class="report-chart" style="margin-bottom: 20px;">
          <h4>📈 Attendance Distribution</h4>
          <div class="chart-bar"><span class="chart-label">✅ Excellent (80%+)</span><div class="chart-bar-fill" style="width: ${(excellent / Math.max(totalStudents, 1)) * 100}%; background: var(--teal);"></div><span class="chart-value">${excellent} students</span></div>
          <div class="chart-bar"><span class="chart-label">⚠️ Good (75-79%)</span><div class="chart-bar-fill" style="width: ${(good / Math.max(totalStudents, 1)) * 100}%; background: var(--amber);"></div><span class="chart-value">${good} students</span></div>
          <div class="chart-bar"><span class="chart-label">🔴 At Risk (60-74%)</span><div class="chart-bar-fill" style="width: ${(atRisk / Math.max(totalStudents, 1)) * 100}%; background: #e67e22;"></div><span class="chart-value">${atRisk} students</span></div>
          <div class="chart-bar"><span class="chart-label">❌ Critical (<60%)</span><div class="chart-bar-fill" style="width: ${(critical / Math.max(totalStudents, 1)) * 100}%; background: var(--danger);"></div><span class="chart-value">${critical} students</span></div>
        </div>
        
        <div style="overflow-x: auto;">
          <h4>📋 Student Attendance Frequency</h4>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: var(--ug); color: white;">
                <th style="padding: 12px;">#</th>
                <th style="padding: 12px;">Student ID</th>
                <th style="padding: 12px;">Student Name</th>
                <th style="padding: 12px;">Email</th>
                <th style="padding: 12px;">Present</th>
                <th style="padding: 12px;">Total Sessions</th>
                <th style="padding: 12px;">Attendance Rate</th>
                <th style="padding: 12px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${studentStats.map((s, i) => `
                <tr style="border-bottom: 1px solid var(--border); ${s.percentage < 60 ? 'background: var(--danger-s);' : (s.percentage < 75 ? 'background: var(--amber-s);' : '')}">
                  <td style="padding: 10px;">${i + 1}<\/td>
                  <td style="padding: 10px;"><strong>${core().escapeHtml(s.id)}<\/strong><\/td>
                  <td style="padding: 10px;">${core().escapeHtml(s.name)}<\/td>
                  <td style="padding: 10px;">${core().escapeHtml(s.email)}<\/td>
                  <td style="padding: 10px; text-align: center;"><strong>${s.presentCount}<\/strong><\/td>
                  <td style="padding: 10px; text-align: center;">${s.totalSessions}<\/td>
                  <td style="padding: 10px; text-align: center;"><strong style="color: ${s.statusColor};">${s.percentage}%<\/strong><\/td>
                  <td style="padding: 10px; color: ${s.statusColor}; font-weight: 600;">${s.status}<\/td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      
      container.innerHTML = html;
      
      core().state.currentReportData = { 
        courseCode, courseName, year: yearInt, semester: semInt, 
        studentStats, totalSessions, totalStudents, 
        averageAttendance, excellent, good, atRisk, critical 
      };
      
    } catch(err) {
      console.error('[SESSION_REPORTS] Generate report error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}<\/div>`;
    }
  }

  async function exportReportToExcel() {
    if (typeof XLSX === 'undefined') { 
      await MODAL.alert('Library Error', 'Excel export not loaded.'); 
      return; 
    }
    if (!core().state.currentReportData) { 
      await MODAL.alert('No Data', '📭 Generate a report first.'); 
      return; 
    }
    
    const { courseCode, courseName, year, semester, studentStats, totalSessions, totalStudents, averageAttendance, excellent, good, atRisk, critical } = core().state.currentReportData;
    
    const wsData = [
      [`Attendance Frequency Report - ${courseCode} - ${courseName}`],
      [`Academic Year: ${year} - Semester ${semester === 1 ? 'First' : 'Second'}`],
      [`Generated: ${new Date().toLocaleString()}`],
      [`Total Sessions: ${totalSessions}`, `Total Students: ${totalStudents}`, `Average Attendance: ${averageAttendance}%`],
      [`Distribution: Excellent: ${excellent}, Good: ${good}, At Risk: ${atRisk}, Critical: ${critical}`],
      [],
      ['#', 'Student ID', 'Student Name', 'Email', 'Present', 'Total Sessions', 'Attendance Rate (%)', 'Status']
    ];
    
    studentStats.forEach((s, i) => {
      wsData.push([i + 1, s.id, s.name, s.email, s.presentCount, s.totalSessions, `${s.percentage}%`, s.status]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Report_${courseCode}_${year}_Sem${semester}`);
    XLSX.writeFile(wb, `UG_ATT_Report_${courseCode}_${year}_Sem${semester}.xlsx`);
    await MODAL.success('Export Complete', `✅ Report exported with ${studentStats.length} students.`);
  }

  return {
    loadReports,
    populateReportCourses,
    generateReport,
    exportReportToExcel
  };
})();

window.SESSION_REPORTS = SESSION_REPORTS;
