/* session-courses.js — Course Management for Lecturer/TA Dashboard */
'use strict';

const SESSION_COURSES = (() => {
  // Use core utilities
  const core = () => window.SESSION_CORE;
  
  async function loadDashboardStats() {
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) return;
      
      const now = new Date();
      const period = core().getAcademicPeriod(now);
      const year = period.year;
      const semester = period.semester;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => c.year === year && c.semester === semester && c.active !== false);
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      const periodSessions = mySessions.filter(s => s.year === year && s.semester === semester && !s.active);
      
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          const records = Object.values(session.records);
          records.forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      let totalCheckins = 0;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = periodSessions.length > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (periodSessions.length * studentsSet.size)) * 100) : 0;
      
      const coursesEl = document.getElementById('stat-courses');
      const sessionsEl = document.getElementById('stat-sessions');
      const studentsEl = document.getElementById('stat-students');
      const attendanceEl = document.getElementById('stat-attendance');
      
      if (coursesEl) coursesEl.textContent = periodCourses.length;
      if (sessionsEl) sessionsEl.textContent = periodSessions.length;
      if (studentsEl) studentsEl.textContent = studentsSet.size;
      if (attendanceEl) attendanceEl.textContent = `${avgAttendance}%`;
      
      const user = core().getCurrentUser();
      const sidebarName = document.getElementById('sidebar-name');
      const sidebarDept = document.getElementById('sidebar-dept');
      const lecAvatar = document.getElementById('lec-avatar');
      const lecName = document.getElementById('lec-tb-name');
      
      if (sidebarName) sidebarName.textContent = user?.name || 'Lecturer';
      if (sidebarDept) sidebarDept.textContent = user?.department || '';
      if (lecAvatar) lecAvatar.textContent = user?.role === 'ta' ? '👥' : '👨‍🏫';
      if (lecName) lecName.textContent = user?.name || user?.email;
      
      const taTab = document.getElementById('ta-tab-nav');
      if (taTab) {
        taTab.style.display = user?.role === 'ta' ? 'none' : 'flex';
      }
      
    } catch(err) {
      console.error('[SESSION_COURSES] Load stats error:', err);
    }
  }

  async function loadMyCoursesGrid() {
    const container = document.getElementById('courses-list-container');
    if (!container) return;
    
    const now = new Date();
    const currentPeriod = core().getAcademicPeriod(now);
    const myId = core().getCurrentLecturerId();
    const availableYears = core().getAvailableYears();
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px;">
        <div>
          <label class="fl">📅 Academic Year</label>
          <select id="grid-year" class="fi" onchange="SESSION_COURSES.viewCoursesGrid()">
            ${availableYears.map(y => `<option value="${y}" ${y === currentPeriod.year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="fl">📖 Semester</label>
          <select id="grid-semester" class="fi" onchange="SESSION_COURSES.viewCoursesGrid()">
            <option value="1" ${currentPeriod.semester === 1 ? 'selected' : ''}>First Semester</option>
            <option value="2" ${currentPeriod.semester === 2 ? 'selected' : ''}>Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="SESSION_COURSES.viewCoursesGrid()">🔍 View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary" onclick="SESSION_COURSES.showAddCourse()">➕ Add Course</button>
        </div>
        <div>
          <button class="btn btn-gold" onclick="SESSION_ANNOUNCEMENTS.showAnnouncementModal()">📢 Send Announcement</button>
        </div>
      </div>
      <div id="courses-grid-container"></div>
      <div id="add-course-section" style="display:none; margin-top:20px"></div>
    `;
    
    await viewCoursesGrid();
  }

  async function viewCoursesGrid() {
    const year = document.getElementById('grid-year')?.value;
    const semester = document.getElementById('grid-semester')?.value;
    const container = document.getElementById('courses-grid-container');
    
    if (!year || !semester) {
      container.innerHTML = '<div class="att-empty">⚠️ Please select both Year and Semester</div>';
      return;
    }
    
    await loadFilteredStats(year, semester);
    
    container.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => 
        c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false
      );
      
      if (periodCourses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">📭 No courses found for ${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}.<br/>Click "Add Course" to create one.</div></div>`;
        return;
      }
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      
      let html = `<div class="courses-grid">`;
      for (const course of periodCourses) {
        const courseSessions = mySessions.filter(s => s.courseCode === course.code && s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active);
        const sessionCount = courseSessions.length;
        
        const enrollments = await DB.ENROLLMENT.getAll();
        const courseEnrollments = enrollments.filter(e => e.courseCode === course.code && e.year === parseInt(year) && e.semester === parseInt(semester) && e.lecId === myId);
        const studentCount = courseEnrollments.length;
        
        let totalCheckins = 0;
        for (const session of courseSessions) {
          totalCheckins += session.records ? Object.values(session.records).length : 0;
        }
        const avgAttendance = sessionCount > 0 && studentCount > 0 ? Math.round((totalCheckins / (sessionCount * studentCount)) * 100) : 0;
        
        html += `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${core().escapeHtml(course.code)}</span>
              <span class="badge">${sessionCount} sessions</span>
            </div>
            <div class="course-name">${core().escapeHtml(course.name)}</div>
            <div class="course-stats">
              <span>🎓 ${studentCount} students enrolled</span>
              <span>📊 ${avgAttendance}% avg attendance</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-ug btn-sm" onclick="SESSION_SESSIONS.showStartSessionPage('${course.code}', '${core().escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">▶ Start Session</button>
              <button class="btn btn-outline btn-sm" onclick="SESSION_COURSES.editCourse('${course.code}', '${core().escapeHtml(course.name).replace(/'/g, "\\'")}', ${course.year}, ${course.semester})">✏️ Edit</button>
            </div>
          </div>
        `;
      }
      html += `</div>`;
      container.innerHTML = html;
      
    } catch(err) {
      console.error('[SESSION_COURSES] View courses error:', err);
      container.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`;
    }
  }

  async function loadFilteredStats(year, semester) {
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) return;
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const periodCourses = allCourses.filter(c => c.year === parseInt(year) && c.semester === parseInt(semester) && c.active !== false);
      
      const allSessions = await DB.SESSION.getAll();
      const mySessions = allSessions.filter(s => s.lecFbId === myId);
      const periodSessions = mySessions.filter(s => s.year === parseInt(year) && s.semester === parseInt(semester) && !s.active);
      
      const studentsSet = new Set();
      for (const session of periodSessions) {
        if (session.records) {
          Object.values(session.records).forEach(r => {
            if (r.studentId) studentsSet.add(r.studentId);
          });
        }
      }
      
      let totalCheckins = 0;
      for (const session of periodSessions) {
        totalCheckins += session.records ? Object.values(session.records).length : 0;
      }
      const avgAttendance = periodSessions.length > 0 && studentsSet.size > 0 
        ? Math.round((totalCheckins / (periodSessions.length * studentsSet.size)) * 100) : 0;
      
      document.getElementById('stat-courses').textContent = periodCourses.length;
      document.getElementById('stat-sessions').textContent = periodSessions.length;
      document.getElementById('stat-students').textContent = studentsSet.size;
      document.getElementById('stat-attendance').textContent = `${avgAttendance}%`;
      
    } catch(err) {
      console.error('[SESSION_COURSES] Load filtered stats error:', err);
    }
  }

  async function loadCourses() {
    const container = document.getElementById('active-courses-list');
    if (!container) return;
    
    const myId = core().getCurrentLecturerId();
    const availableYears = core().getAvailableYears();
    const currentYear = new Date().getFullYear();
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div style="min-width: 120px;">
          <label class="fl">📅 Academic Year</label>
          <select id="course-year" class="fi">
            <option value="">Select Year</option>
            ${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div style="min-width: 120px;">
          <label class="fl">📖 Semester</label>
          <select id="course-semester" class="fi">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug" onclick="SESSION_COURSES.loadCoursesManagement()">🔍 Load Courses</button>
        </div>
      </div>
      <div id="active-courses-list-container"><div class="att-empty">📭 Select Year and Semester to view courses</div></div>
      <div id="archived-courses-list" style="margin-top: 20px;"><h3>📦 Archived Courses</h3><div class="att-empty">Select Year and Semester to view archived courses</div></div>
    `;
  }

  async function loadCoursesManagement() {
    const year = document.getElementById('course-year')?.value;
    const semester = document.getElementById('course-semester')?.value;
    const activeContainer = document.getElementById('active-courses-list-container');
    const archivedContainer = document.getElementById('archived-courses-list');
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select both Year and Semester before loading courses.');
      return;
    }
    
    activeContainer.innerHTML = '<div class="att-empty"><span class="spin-ug"></span> Loading courses...</div>';
    if (archivedContainer) archivedContainer.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      
      const allCourses = await DB.COURSE.getAllForLecturer(myId);
      const sessions = await DB.SESSION.getAll();
      const mySessions = sessions.filter(s => s.lecFbId === myId);
      
      const yearInt = parseInt(year);
      const semInt = parseInt(semester);
      
      const activeCourses = [];
      const archivedCourses = [];
      
      for (const course of allCourses) {
        if (course.year === yearInt && course.semester === semInt) {
          let sessionCount = 0;
          let lastSessionDate = course.createdAt ? new Date(course.createdAt).toLocaleDateString() : 'Never';
          
          for (const session of mySessions) {
            if (session.year === yearInt && session.semester === semInt && session.courseCode === course.code && !session.active) {
              sessionCount++;
              lastSessionDate = session.date;
            }
          }
          
          const courseInfo = {
            code: course.code,
            name: course.name,
            active: course.active !== false,
            sessionCount: sessionCount,
            lastSessionDate: lastSessionDate,
            disabledAt: course.disabledAt,
            year: course.year,
            semester: course.semester
          };
          
          if (course.active !== false) {
            activeCourses.push(courseInfo);
          } else {
            archivedCourses.push(courseInfo);
          }
        }
      }
      
      activeCourses.sort((a,b) => a.code.localeCompare(b.code));
      archivedCourses.sort((a,b) => a.code.localeCompare(b.code));
      
      if (activeCourses.length === 0) {
        activeContainer.innerHTML = '<div class="no-rec">📭 No active courses found for this period.</div>';
      } else {
        activeContainer.innerHTML = `<div class="courses-grid">${activeCourses.map(c => `
          <div class="course-card">
            <div class="course-header">
              <span class="course-code">📚 ${core().escapeHtml(c.code)}</span>
              <span class="badge" style="background: var(--teal);">🟢 Active</span>
            </div>
            <div class="course-name">${core().escapeHtml(c.name)}</div>
            <div class="course-stats">
              <span>📊 ${c.sessionCount} completed sessions</span>
              <span>📅 Last: ${c.lastSessionDate}</span>
            </div>
            <div class="course-buttons">
              <button class="btn btn-warning btn-sm" onclick="SESSION_COURSES.disableCourse('${c.code}', ${c.year}, ${c.semester})">📦 Archive Course</button>
            </div>
          </div>
        `).join('')}</div>`;
      }
      
      if (archivedContainer) {
        if (archivedCourses.length === 0) {
          archivedContainer.innerHTML = '<div class="no-rec">📭 No archived courses for this period.</div>';
        } else {
          archivedContainer.innerHTML = `<div class="courses-grid">${archivedCourses.map(c => `
            <div class="course-card" style="opacity: 0.8;">
              <div class="course-header">
                <span class="course-code">📚 ${core().escapeHtml(c.code)}</span>
                <span class="badge" style="background: var(--danger);">📦 Archived</span>
              </div>
              <div class="course-name">${core().escapeHtml(c.name)}</div>
              <div class="course-stats">
                <span>📊 ${c.sessionCount} completed sessions</span>
                <span>📅 Last: ${c.lastSessionDate}</span>
              </div>
              <div class="course-buttons">
                <button class="btn btn-teal btn-sm" onclick="SESSION_COURSES.enableCourse('${c.code}', ${c.year}, ${c.semester})">🔄 Restore Course</button>
              </div>
            </div>
          `).join('')}</div>`;
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      activeContainer.innerHTML = `<div class="no-rec">❌ Error: ${core().escapeHtml(err.message)}</div>`;
    }
  }

  async function disableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Archive Course', `Archive ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Archive', confirmCls: 'btn-warning' });
    if (!confirmed) return;
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.disableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Archived', `✅ ${courseCode} has been moved to archives.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function enableCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm('Restore Course', `Restore ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`, { confirmLabel: 'Yes, Restore', confirmCls: 'btn-teal' });
    if (!confirmed) return;
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.enableCourse(myId, courseCode, year, semester);
      await MODAL.success('Course Restored', `✅ ${courseCode} is now active.`);
      await loadCoursesManagement();
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  async function editCourse(courseCode, currentName, year, semester) {
    const newName = await MODAL.prompt('Edit Course Name', `Edit name for ${courseCode}:`, { icon: '✏️', placeholder: 'Course name', defVal: currentName });
    if (!newName || newName === currentName) return;
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) throw new Error('Unable to identify lecturer');
      await DB.COURSE.update(myId, courseCode, year, semester, { name: newName, updatedAt: Date.now() });
      await MODAL.success('Course Updated', `✅ ${courseCode} name has been changed.`);
      await viewCoursesGrid();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (!section) return;
    
    const currentYear = new Date().getFullYear();
    const availableYears = core().getAvailableYears();
    
    section.style.display = 'block';
    section.innerHTML = `
      <div class="inner-panel">
        <h3>➕ Add New Course</h3>
        <div class="two-col">
          <div class="field">
            <label class="fl">📚 Course Code</label>
            <input type="text" id="new-course-code" class="fi" placeholder="e.g., STAT111" oninput="this.value = this.value.toUpperCase()"/>
          </div>
          <div class="field">
            <label class="fl">📖 Course Name</label>
            <input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Statistics"/>
          </div>
        </div>
        <div class="two-col" style="margin-top: 10px;">
          <div class="field">
            <label class="fl">📅 Academic Year</label>
            <select id="new-course-year" class="fi">
              <option value="">Select Year</option>
              ${availableYears.map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="fl">📖 Semester</label>
            <select id="new-course-semester" class="fi">
              <option value="">Select Semester</option>
              <option value="1" selected>First Semester</option>
              <option value="2">Second Semester</option>
            </select>
          </div>
        </div>
        <p class="note" style="margin-top: 8px; font-size: 11px;">⚠️ Course will be created specifically for the selected Academic Year and Semester</p>
        <button class="btn btn-ug" onclick="SESSION_COURSES.addNewCourse()">✅ Create Course</button>
        <button class="btn btn-secondary" onclick="SESSION_COURSES.hideAddCourse()">❌ Cancel</button>
      </div>
    `;
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    
    if (!code || !name) {
      await MODAL.alert('Missing Info', '⚠️ Please enter course code and name.');
      return;
    }
    if (!year || !semester) {
      await MODAL.alert('Missing Info', '⚠️ Please select Academic Year and Semester.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const myId = core().getCurrentLecturerId();
      if (!myId) {
        await MODAL.error('Error', '⚠️ Could not identify your account.');
        return;
      }
      
      const existing = await DB.COURSE.get(myId, code, yearInt, semInt);
      if (existing) {
        await MODAL.alert('Course Exists', `⚠️ Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const user = core().getCurrentUser();
      await DB.COURSE.set(myId, code, yearInt, semInt, {
        code: code, name: name, year: yearInt, semester: semInt,
        active: true, status: 'active', createdAt: Date.now(),
        createdBy: user?.name || user?.email || 'unknown', lecId: myId
      });
      
      await MODAL.success('Course Created', `✅ ${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCoursesGrid();
      await loadDashboardStats();
    } catch(err) {
      await MODAL.error('Error', err.message);
    }
  }

  // Export public API
  return {
    loadDashboardStats,
    loadMyCoursesGrid,
    viewCoursesGrid,
    loadCourses,
    loadCoursesManagement,
    disableCourse,
    enableCourse,
    editCourse,
    showAddCourse,
    hideAddCourse,
    addNewCourse
  };
})();

window.SESSION_COURSES = SESSION_COURSES;
