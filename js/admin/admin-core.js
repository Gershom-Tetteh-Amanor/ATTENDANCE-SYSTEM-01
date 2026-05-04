/* admin-core.js — Core utilities and helpers for Admin Dashboards */
'use strict';

const ADMIN_CORE = (() => {
  
  // Helper function to escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Helper function to get years from 2020 to current year
  function getAvailableYears() {
    const currentYear = new Date().getFullYear();
    const startYear = 2020;
    const years = [];
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }
    return years;
  }

  // Global minimum attendance percentage (set by Admin, stored in localStorage and Firebase)
  let GLOBAL_MIN_ATTENDANCE_PERCENTAGE = 75;

  // Helper function to get/set global min attendance
  function getGlobalMinAttendance() {
    const saved = localStorage.getItem('global_min_attendance_percentage');
    if (saved && !isNaN(parseInt(saved))) {
      GLOBAL_MIN_ATTENDANCE_PERCENTAGE = parseInt(saved);
    } else {
      // Try to get from Firebase
      DB.get('settings/minAttendance').then(val => {
        if (val && !isNaN(parseInt(val))) {
          GLOBAL_MIN_ATTENDANCE_PERCENTAGE = parseInt(val);
          localStorage.setItem('global_min_attendance_percentage', GLOBAL_MIN_ATTENDANCE_PERCENTAGE);
        }
      }).catch(() => {});
    }
    return GLOBAL_MIN_ATTENDANCE_PERCENTAGE;
  }

  async function setGlobalMinAttendance(value) {
    GLOBAL_MIN_ATTENDANCE_PERCENTAGE = parseInt(value);
    localStorage.setItem('global_min_attendance_percentage', GLOBAL_MIN_ATTENDANCE_PERCENTAGE);
    await DB.set('settings/minAttendance', GLOBAL_MIN_ATTENDANCE_PERCENTAGE);
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

  // Helper function to calculate attendance statistics for a course
  async function calculateCourseAttendanceStats(courseCode, lecId, year, semester) {
    try {
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
        
        const minAttendancePercentage = getGlobalMinAttendance();
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
      
      const minAttendance = getGlobalMinAttendance();
      const closeThreshold = minAttendance - 5;
      
      const qualified = studentStats.filter(s => s.percentage >= minAttendance).length;
      const notQualified = studentStats.filter(s => s.percentage < closeThreshold).length;
      const closeToQualified = studentStats.filter(s => s.percentage >= closeThreshold && s.percentage < minAttendance).length;
      const averageAttendance = studentStats.length > 0 
        ? Math.round(studentStats.reduce((sum, s) => sum + s.percentage, 0) / studentStats.length) 
        : 0;
      
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
        studentStats,
        qualifiedPercentage: studentStats.length > 0 ? Math.round((qualified / studentStats.length) * 100) : 0,
        notQualifiedPercentage: studentStats.length > 0 ? Math.round((notQualified / studentStats.length) * 100) : 0,
        closeToQualifiedPercentage: studentStats.length > 0 ? Math.round((closeToQualified / studentStats.length) * 100) : 0
      };
    } catch(err) {
      console.error('Error calculating course stats:', err);
      return null;
    }
  }

  // Get current department for Co-Admin
  function getCoAdminDepartment() {
    const session = AUTH.getSession();
    return session?.department || '';
  }

  // Render help content (used by both Super Admin and Co-Admin)
  async function renderHelp(role = 'superAdmin') {
    const minAttendance = getGlobalMinAttendance();
    const container = role === 'superAdmin' ? document.getElementById('sadm-content') : document.getElementById('cadm-content');
    if (!container) return;
    
    const isSuperAdmin = role === 'superAdmin';
    
    container.innerHTML = `
      <div class="pg">
        <h2>❓ Help - ${isSuperAdmin ? 'Super Administrator' : 'Co-Administrator'} Dashboard</h2>
        <div class="inner-panel">
          <h3>📊 System Overview</h3>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>Global Minimum Attendance:</strong> <strong style="color:var(--ug)">${minAttendance}%</strong> (set by System Admin in Settings)</li>
            <li><strong>Close Definition:</strong> Students within 5% of the minimum attendance (${minAttendance-5}-${minAttendance-1}% when minimum is ${minAttendance}%)</li>
            ${isSuperAdmin ? `
              <li>📢 Announcements: Send system-wide announcements to all users or specific roles/departments</li>
              <li>🆔 Unique IDs: Generate lecturer registration IDs with email</li>
              <li>👨‍🏫 Lecturers: View, suspend, remove</li>
              <li>🤝 Co-Admins: Approve applications, add joint admins (max 3)</li>
              <li>📊 Sessions: Filter by year, semester, department, lecturer, course - Download individual session Excel</li>
              <li>📈 Reports: Generate reports with charts, PDF, set min attendance (global setting)</li>
              <li>💾 Backups: Create/download system backups</li>
              <li>⚙️ Settings: Set global minimum attendance, delete data by range, reset system</li>
              <li>📚 Courses: View grouped by year/semester/dept/lecturer</li>
            ` : `
              <li>🆔 Generate IDs: Create unique registration IDs for lecturers in your department</li>
              <li>👨‍🏫 Lecturers: View, suspend, or remove lecturers in your department</li>
              <li>📊 Sessions: Filter sessions by Year, Semester, Course, and Lecturer</li>
              <li>📈 Reports: Generate department reports with charts, export Excel/PDF</li>
              <li>📚 Courses: View all courses in your department with filters</li>
              <li>💾 Backup: Create department data backups</li>
            `}
          </ul>
        </div>
        <div class="inner-panel">
          <h3>📧 Contact Support</h3>
          <p>📧 Email: <a href="mailto:support@ug.edu.gh">support@ug.edu.gh</a></p>
          <p>📞 Phone: +233 (0) 30 123 4567</p>
          <p>📱 WhatsApp: +233 (0) 50 123 4567</p>
          <p>🌐 Website: <a href="https://www.ug.edu.gh" target="_blank">www.ug.edu.gh</a></p>
        </div>
        <div class="inner-panel">
          <h3>⏰ Office Hours</h3>
          <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
          <p>Saturday: 9:00 AM - 1:00 PM</p>
          <p>Sunday: Closed</p>
        </div>
      </div>
    `;
  }

  return {
    escapeHtml,
    getAvailableYears,
    getGlobalMinAttendance,
    setGlobalMinAttendance,
    exportSingleSessionHelper,
    calculateCourseAttendanceStats,
    getCoAdminDepartment,
    renderHelp
  };
})();

// Make globally available
window.ADMIN_CORE = ADMIN_CORE;
