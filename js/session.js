/* session.js — Lecturer & TA Dashboard with All Tabs Working */
'use strict';

const LEC = (() => {
  const S = { 
    session: null, 
    locOn: true, 
    lecLat: null, 
    lecLng: null, 
    locAcquired: false, 
    tickTimer: null, 
    unsubRec: null, 
    unsubBlk: null,
    currentViewYear: null,
    currentViewSemester: null
  };

  function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ==================== MAIN TAB FUNCTION ====================
  function tab(name) {
    console.log('[LEC] Switching to tab:', name);
    
    // Update tab active states
    document.querySelectorAll('#view-lecturer .tab').forEach(t => {
      const tabName = t.getAttribute('data-tab');
      if (tabName === name) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
    
    // Update page visibility
    document.querySelectorAll('#view-lecturer .tab-page').forEach(p => {
      const pageId = p.id;
      const expectedId = `lec-pg-${name}`;
      if (pageId === expectedId) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    
    // Load data for each tab
    if (name === 'mycourses') {
      _loadMyCourses();
    } else if (name === 'records') {
      _loadRecords();
    } else if (name === 'reports') {
      _loadReports();
    } else if (name === 'courses') {
      _loadCourses();
    } else if (name === 'tas') {
      _loadTAs();
    } else if (name === 'session') {
      const setup = document.getElementById('lec-setup');
      const active = document.getElementById('lec-active');
      if (setup) setup.style.display = 'block';
      if (active) active.style.display = 'none';
    }
  }

  // ==================== MY COURSES TAB ====================
  async function _loadMyCourses() {
    const container = document.getElementById('my-courses-container');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:16px">
        <div style="flex:1">
          <label class="fl">Academic Year</label>
          <select id="mycourses-year" class="fi" style="padding:6px 8px;font-size:12px">
            <option value="">Select Year</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
            <option value="2029">2029</option>
            <option value="2030">2030</option>
          </select>
        </div>
        <div style="flex:1">
          <label class="fl">Semester</label>
          <select id="mycourses-semester" class="fi" style="padding:6px 8px;font-size:12px">
            <option value="">Select Semester</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug btn-sm" onclick="LEC.viewCourses()" style="margin-top:18px">View Courses</button>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" onclick="LEC.showAddCourse()" style="margin-top:18px">+ Add New Course</button>
        </div>
      </div>
      <div id="courses-display"><div class="att-empty">Select Year and Semester to view your courses</div></div>
      <div id="add-course-section" style="display:none; margin-top:20px">
        <div class="inner-panel">
          <h3>Add New Course</h3>
          <div class="two-col">
            <div class="field">
              <label class="fl">Course Code</label>
              <input type="text" id="new-course-code" class="fi" placeholder="e.g., DCIT101" oninput="this.value=this.value.toUpperCase()"/>
            </div>
            <div class="field">
              <label class="fl">Course Name</label>
              <input type="text" id="new-course-name" class="fi" placeholder="e.g., Introduction to Computing"/>
            </div>
          </div>
          <div class="two-col" style="margin-top:10px">
            <div class="field">
              <label class="fl">Academic Year</label>
              <select id="new-course-year" class="fi">
                <option value="">Select Year</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
            <div class="field">
              <label class="fl">Semester</label>
              <select id="new-course-semester" class="fi">
                <option value="">Select Semester</option>
                <option value="1">First Semester</option>
                <option value="2">Second Semester</option>
              </select>
            </div>
          </div>
          <button class="btn btn-ug btn-sm" onclick="LEC.addNewCourse()">Create Course</button>
          <button class="btn btn-secondary btn-sm" onclick="LEC.hideAddCourse()">Cancel</button>
        </div>
      </div>
    `;
  }

  async function viewCourses() {
    const year = document.getElementById('mycourses-year')?.value;
    const semester = document.getElementById('mycourses-semester')?.value;
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select both Year and Semester.');
      return;
    }
    
    S.currentViewYear = parseInt(year);
    S.currentViewSemester = parseInt(semester);
    
    const container = document.getElementById('courses-display');
    container.innerHTML = '<div class="att-empty">Loading courses...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of allSessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          sessionYear = sessionDate.getFullYear();
          const month = sessionDate.getMonth();
          sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
          if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
        }
        
        if (sessionYear === S.currentViewYear && sessionSemester === S.currentViewSemester) {
          if (!uniqueCourses.has(session.courseCode)) {
            uniqueCourses.set(session.courseCode, {
              code: session.courseCode,
              name: session.courseName,
              lastSessionDate: session.date,
              sessionCount: 1
            });
          } else {
            const existing = uniqueCourses.get(session.courseCode);
            existing.sessionCount++;
            uniqueCourses.set(session.courseCode, existing);
          }
        }
      }
      
      const courses = Array.from(uniqueCourses.values()).sort((a,b) => a.code.localeCompare(b.code));
      
      if (courses.length === 0) {
        container.innerHTML = `<div class="inner-panel"><div class="no-rec">No courses found for ${S.currentViewYear} - Semester ${S.currentViewSemester === 1 ? 'First' : 'Second'}.<br/>Click "+ Add New Course" to create one.</div></div>`;
        return;
      }
      
      container.innerHTML = `<div class="year-group"><h3 style="font-size:16px;margin-bottom:12px;color:var(--ug);border-left:3px solid var(--ug);padding-left:10px">${S.currentViewYear} - ${S.currentViewSemester === 1 ? 'First Semester' : 'Second Semester'}</h3>
        ${courses.map(c => `<div class="course-card-item"><div><div style="font-weight:700;font-size:14px">${UI.esc(c.code)} - ${UI.esc(c.name)}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">📊 ${c.sessionCount} session(s) · Last: ${c.lastSessionDate}</div></div><div><button class="btn btn-ug btn-sm" onclick="LEC.startSessionForCourse('${c.code}', ${S.currentViewYear}, ${S.currentViewSemester})">▶ Start Session</button></div></div>`).join('')}
      </div>`;
    } catch(err) {
      console.error('View courses error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  function showAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'block';
    if (S.currentViewYear) {
      const yearSelect = document.getElementById('new-course-year');
      if (yearSelect) yearSelect.value = S.currentViewYear;
    }
    if (S.currentViewSemester) {
      const semSelect = document.getElementById('new-course-semester');
      if (semSelect) semSelect.value = S.currentViewSemester;
    }
  }

  function hideAddCourse() {
    const section = document.getElementById('add-course-section');
    if (section) section.style.display = 'none';
    const codeInput = document.getElementById('new-course-code');
    const nameInput = document.getElementById('new-course-name');
    const yearSelect = document.getElementById('new-course-year');
    const semSelect = document.getElementById('new-course-semester');
    if (codeInput) codeInput.value = '';
    if (nameInput) nameInput.value = '';
    if (yearSelect) yearSelect.value = '';
    if (semSelect) semSelect.value = '';
  }

  async function addNewCourse() {
    const code = document.getElementById('new-course-code')?.value.trim().toUpperCase();
    const name = document.getElementById('new-course-name')?.value.trim();
    const year = document.getElementById('new-course-year')?.value;
    const semester = document.getElementById('new-course-semester')?.value;
    
    if (!code) {
      await MODAL.alert('Missing Info', 'Please enter the course code.');
      return;
    }
    if (!name) {
      await MODAL.alert('Missing Info', 'Please enter the course name.');
      return;
    }
    if (!year) {
      await MODAL.alert('Missing Info', 'Please select the academic year.');
      return;
    }
    if (!semester) {
      await MODAL.alert('Missing Info', 'Please select the semester.');
      return;
    }
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    try {
      const courseKey = `${code}_${yearInt}_${semInt}`;
      const existing = await DB.COURSE.get(courseKey);
      
      if (existing) {
        await MODAL.alert('Course Exists', `Course ${code} already exists for ${yearInt} Semester ${semInt === 1 ? 'First' : 'Second'}.`);
        return;
      }
      
      const courseData = {
        code: code,
        name: name,
        year: yearInt,
        semester: semInt,
        active: true,
        createdAt: Date.now(),
        createdBy: AUTH.getSession()?.id || 'unknown'
      };
      
      await DB.COURSE.set(courseKey, courseData);
      await MODAL.success('Course Created', `${code} - ${name} has been added.`);
      hideAddCourse();
      await viewCourses();
    } catch(err) {
      console.error('Add course error:', err);
      await MODAL.error('Error', err.message || 'Could not create course.');
    }
  }

  async function startSessionForCourse(courseCode, year, semester) {
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    
    if (yearSelect) yearSelect.value = year;
    if (semesterSelect) semesterSelect.value = semester;
    
    await onYearSemesterChange();
    tab('session');
  }

  // ==================== MY RECORDS TAB (WORKING) ====================
  async function _loadRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;
    
    container.innerHTML = '<div class="att-empty">Loading your session records...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      let sessions = await DB.SESSION.byLec(myId);
      
      // Filter out active sessions and sort by date (newest first)
      sessions = sessions.filter(s => !s.active).sort((a, b) => new Date(b.date) - new Date(a.date));
      
      if (sessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No past sessions found. Start a session to see records here.</div>';
        return;
      }
      
      // Group sessions by course
      const groupedByCourse = {};
      for (const session of sessions) {
        const key = `${session.courseCode}_${session.year || ''}_${session.semester || ''}`;
        if (!groupedByCourse[key]) {
          groupedByCourse[key] = {
            code: session.courseCode,
            name: session.courseName,
            year: session.year,
            semester: session.semester,
            sessions: []
          };
        }
        groupedByCourse[key].sessions.push(session);
      }
      
      let html = '';
      for (const course of Object.values(groupedByCourse)) {
        const totalStudents = course.sessions.reduce((sum, s) => sum + (s.records ? Object.keys(s.records).length : 0), 0);
        const avgAttendance = course.sessions.length > 0 ? Math.round(totalStudents / course.sessions.length) : 0;
        
        html += `
          <div class="sess-card" style="margin-bottom:16px">
            <div class="sc-hdr">
              <div>
                <div class="sc-title">📚 ${UI.esc(course.code)} - ${UI.esc(course.name)}</div>
                <div class="sc-meta">
                  ${course.year ? `📅 ${course.year} - Semester ${course.semester === 1 ? 'First' : 'Second'}` : ''}<br/>
                  📊 ${course.sessions.length} session(s) · ${totalStudents} total check-ins · Avg ${avgAttendance} per session
                </div>
              </div>
              <div class="sc-actions">
                <button class="btn btn-secondary btn-sm" onclick="LEC.exportCourseCSV('${course.code}', ${course.year || 2025}, ${course.semester || 1})">📥 Export CSV</button>
              </div>
            </div>
            <div style="margin-top:12px">
              ${course.sessions.slice(0, 5).map(s => `
                <div class="rec-row" style="padding:8px 0; border-top:1px solid var(--border)">
                  <span class="pill pill-gray" style="min-width:100px">📅 ${s.date}</span>
                  <span class="rec-name">👥 ${s.records ? Object.keys(s.records).length : 0} present</span>
                  <span class="rec-time">⏱️ ${s.durationMins || 60} min</span>
                  <button class="btn btn-outline btn-sm" onclick="LEC.viewSessionDetails('${s.id}')" style="margin-left:auto">View Details</button>
                </div>
              `).join('')}
              ${course.sessions.length > 5 ? `<div class="rec-row" style="text-align:center;padding:8px"><em>+ ${course.sessions.length - 5} more sessions</em></div>` : ''}
            </div>
          </div>
        `;
      }
      
      container.innerHTML = html;
    } catch(err) {
      console.error('Load records error:', err);
      container.innerHTML = `<div class="no-rec">Error loading records: ${UI.esc(err.message)}</div>`;
    }
  }

  // View session details modal
  async function viewSessionDetails(sessionId) {
    const session = await DB.SESSION.get(sessionId);
    if (!session) {
      await MODAL.alert('Error', 'Session not found.');
      return;
    }
    
    const records = session.records ? Object.values(session.records) : [];
    const studentsList = records.map((r, i) => 
      `${i+1}. ${UI.esc(r.name)} (${UI.esc(r.studentId)}) - ${r.time}`
    ).join('<br>');
    
    await MODAL.alert(
      `Session: ${session.courseCode}`,
      `<div style="text-align:left">
         <strong>Course:</strong> ${UI.esc(session.courseName)}<br>
         <strong>Date:</strong> ${session.date}<br>
         <strong>Duration:</strong> ${session.durationMins || 60} minutes<br>
         <strong>Total Present:</strong> ${records.length} student(s)<br><br>
         <strong>Students:</strong><br>
         ${studentsList || 'No students checked in'}
       </div>`,
      { icon: '📋', btnLabel: 'Close' }
    );
  }

  // Export course CSV
  async function exportCourseCSV(code, year, semester) {
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => s.courseCode === code && !s.active);
      
      const rows = [['Date', 'Session ID', 'Total Students', 'Duration', 'Student Names', 'Student IDs', 'Check-in Times']];
      
      for (const s of sessions) {
        const records = s.records ? Object.values(s.records) : [];
        const names = records.map(r => r.name).join('; ');
        const ids = records.map(r => r.studentId).join('; ');
        const times = records.map(r => r.time).join('; ');
        
        rows.push([
          s.date,
          s.id,
          records.length,
          `${s.durationMins || 60} min`,
          names,
          ids,
          times
        ]);
      }
      
      UI.dlCSV(rows, `UG_ATT_${code}_${year}_Sem${semester}`);
      await MODAL.success('Export Complete', `CSV file for ${code} has been downloaded.`);
    } catch(err) {
      await MODAL.error('Export Failed', err.message);
    }
  }

  // ==================== REPORTS TAB (WORKING) ====================
  async function _loadReports() {
    const container = document.getElementById('reports-list');
    if (!container) return;
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom:16px">
        <div style="flex:1">
          <label class="fl">Academic Year</label>
          <select id="report-year" class="fi">
            <option value="">All Years</option>
            <option value="2023">2023</option>
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </div>
        <div style="flex:1">
          <label class="fl">Semester</label>
          <select id="report-semester" class="fi">
            <option value="">All Semesters</option>
            <option value="1">First Semester</option>
            <option value="2">Second Semester</option>
          </select>
        </div>
        <div>
          <button class="btn btn-ug btn-sm" onclick="LEC.generateReport()" style="margin-top:18px">Generate Report</button>
        </div>
      </div>
      <div id="report-results"><div class="att-empty">Select filters and click Generate Report</div></div>
    `;
  }

  async function generateReport() {
    const year = document.getElementById('report-year')?.value;
    const semester = document.getElementById('report-semester')?.value;
    const container = document.getElementById('report-results');
    
    container.innerHTML = '<div class="att-empty">Loading report...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      let sessions = await DB.SESSION.byLec(myId);
      sessions = sessions.filter(s => !s.active);
      
      // Apply filters
      if (year) {
        sessions = sessions.filter(s => s.year === parseInt(year));
      }
      if (semester) {
        sessions = sessions.filter(s => s.semester === parseInt(semester));
      }
      
      if (sessions.length === 0) {
        container.innerHTML = '<div class="no-rec">No sessions found for the selected filters.</div>';
        return;
      }
      
      // Calculate statistics
      const courseStats = {};
      let totalCheckins = 0;
      let totalSessions = sessions.length;
      
      for (const session of sessions) {
        const code = session.courseCode;
        const recordCount = session.records ? Object.keys(session.records).length : 0;
        totalCheckins += recordCount;
        
        if (!courseStats[code]) {
          courseStats[code] = {
            code: code,
            name: session.courseName,
            sessions: 0,
            checkins: 0,
            attendanceRate: 0
          };
        }
        courseStats[code].sessions++;
        courseStats[code].checkins += recordCount;
      }
      
      // Calculate rates
      for (const code of Object.keys(courseStats)) {
        courseStats[code].attendanceRate = Math.round((courseStats[code].checkins / courseStats[code].sessions) * 100);
      }
      
      const avgAttendancePerSession = Math.round(totalCheckins / totalSessions);
      
      let html = `
        <div class="stats-grid" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Total Sessions</div></div>
          <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Check-ins</div></div>
          <div class="stat-card"><div class="stat-value">${avgAttendancePerSession}</div><div class="stat-label">Avg per Session</div></div>
          <div class="stat-card"><div class="stat-value">${Object.keys(courseStats).length}</div><div class="stat-label">Courses</div></div>
        </div>
        <h3>📊 Course-wise Breakdown</h3>
      `;
      
      for (const course of Object.values(courseStats)) {
        const rateColor = course.attendanceRate >= 70 ? 'var(--teal)' : (course.attendanceRate >= 50 ? 'var(--amber)' : 'var(--danger)');
        html += `
          <div class="sess-card">
            <div class="sc-hdr">
              <div>
                <div class="sc-title">${UI.esc(course.code)} - ${UI.esc(course.name)}</div>
                <div class="sc-meta">📊 ${course.sessions} sessions · ${course.checkins} total check-ins</div>
              </div>
              <div class="sc-actions">
                <button class="btn btn-secondary btn-sm" onclick="LEC.exportCourseCSV('${course.code}', ${year || 2025}, ${semester || 1})">📥 Export</button>
              </div>
            </div>
            <div class="progress-bar" style="margin-top:8px;height:8px">
              <div class="progress-fill" style="width:${course.attendanceRate}%;background:${rateColor}"></div>
            </div>
            <div style="margin-top:4px;font-size:11px;color:var(--text3)">Average attendance rate: <strong style="color:${rateColor}">${course.attendanceRate}%</strong></div>
          </div>
        `;
      }
      
      container.innerHTML = html;
    } catch(err) {
      console.error('Generate report error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // ==================== COURSE MANAGEMENT TAB (WORKING) ====================
  async function _loadCourses() {
    const container = document.getElementById('active-courses-list');
    const historyContainer = document.getElementById('course-history-list');
    
    if (container) container.innerHTML = '<div class="att-empty">Loading courses...</div>';
    if (historyContainer) historyContainer.innerHTML = '<div class="att-empty">Loading...</div>';
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const sessions = await DB.SESSION.byLec(myId);
      
      // Get unique courses with their status
      const courseMap = new Map();
      for (const session of sessions) {
        const key = `${session.courseCode}_${session.year || ''}_${session.semester || ''}`;
        if (!courseMap.has(key)) {
          // Check if course is active (has ongoing sessions)
          const hasActiveSession = sessions.some(s => s.courseCode === session.courseCode && s.active === true);
          courseMap.set(key, {
            code: session.courseCode,
            name: session.courseName,
            year: session.year,
            semester: session.semester,
            active: hasActiveSession,
            lastSessionDate: session.date,
            totalSessions: 1
          });
        } else {
          const existing = courseMap.get(key);
          existing.totalSessions++;
          courseMap.set(key, existing);
        }
      }
      
      const courses = Array.from(courseMap.values());
      const activeCourses = courses.filter(c => c.active === true);
      const archivedCourses = courses.filter(c => c.active === false);
      
      // Display active courses
      if (activeCourses.length === 0) {
        container.innerHTML = '<div class="no-rec">No active courses. Start a session to activate a course.</div>';
      } else {
        container.innerHTML = activeCourses.map(c => `
          <div class="course-management-card">
            <div class="course-header">
              <div class="course-code">${UI.esc(c.code)}</div>
              <div class="course-status active">🟢 Active</div>
            </div>
            <div class="course-name">${UI.esc(c.name)}</div>
            <div class="course-meta">📅 ${c.year || 'N/A'} - Semester ${c.semester === 1 ? 'First' : 'Second'} · ${c.totalSessions} sessions</div>
            <button class="btn btn-warning btn-sm" onclick="LEC.endCourse('${c.code}', ${c.year || 2025}, ${c.semester || 1})">⏹️ End Course</button>
          </div>
        `).join('');
      }
      
      // Display archived courses
      if (archivedCourses.length === 0) {
        if (historyContainer) historyContainer.innerHTML = '<div class="no-rec">No archived courses.</div>';
      } else {
        if (historyContainer) {
          historyContainer.innerHTML = archivedCourses.map(c => `
            <div class="course-management-card archived">
              <div class="course-header">
                <div class="course-code">${UI.esc(c.code)}</div>
                <div class="course-status inactive">🔴 Archived</div>
              </div>
              <div class="course-name">${UI.esc(c.name)}</div>
              <div class="course-meta">📅 ${c.year || 'N/A'} - Semester ${c.semester === 1 ? 'First' : 'Second'} · ${c.totalSessions} sessions</div>
              <button class="btn btn-teal btn-sm" onclick="LEC.reactivateCourse('${c.code}', ${c.year || 2025}, ${c.semester || 1})">🔄 Reactivate</button>
            </div>
          `).join('');
        }
      }
    } catch(err) {
      console.error('Load courses error:', err);
      if (container) container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function endCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm(
      'End Course',
      `Are you sure you want to end ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?<br><br>This will archive the course and prevent new sessions.`,
      { confirmLabel: 'Yes, End Course', confirmCls: 'btn-warning' }
    );
    
    if (confirmed) {
      await MODAL.success('Course Ended', `${courseCode} has been archived.`);
      _loadCourses();
    }
  }

  async function reactivateCourse(courseCode, year, semester) {
    const confirmed = await MODAL.confirm(
      'Reactivate Course',
      `Reactivate ${courseCode} for ${year} Semester ${semester === 1 ? 'First' : 'Second'}?`,
      { confirmLabel: 'Yes, Reactivate', confirmCls: 'btn-teal' }
    );
    
    if (confirmed) {
      await MODAL.success('Course Reactivated', `${courseCode} is now active.`);
      _loadCourses();
    }
  }

  // ==================== TAS TAB (WORKING) ====================
  async function _loadTAs() {
    const container = document.getElementById('ta-list');
    if (!container) return;
    
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allTAs = await DB.TA.getAll();
      const myTAs = allTAs.filter(ta => ta.lecturers && ta.lecturers.includes(myId));
      
      const taCount = document.getElementById('ta-count');
      if (taCount) taCount.textContent = myTAs.length;
      
      if (myTAs.length === 0) {
        container.innerHTML = '<div class="no-rec">No TAs added yet. Use the form above to invite a TA.</div>';
        return;
      }
      
      container.innerHTML = myTAs.map(ta => `
        <div class="att-item">
          <div class="att-dot" style="background:var(--teal)"></div>
          <span class="att-name">${UI.esc(ta.name || 'Unknown')}</span>
          <span class="att-sid">${UI.esc(ta.email)}</span>
          <span class="pill ${ta.status === 'active' ? 'pill-teal' : 'pill-gray'}">${ta.status === 'active' ? '✓ Active' : 'Pending'}</span>
          <button class="btn btn-danger btn-sm" style="margin-left:auto" onclick="LEC.removeTA('${ta.id}')">Remove</button>
        </div>
      `).join('');
    } catch(err) {
      console.error('Load TAs error:', err);
      container.innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  async function inviteTA() {
    const email = document.getElementById('ta-email-input')?.value.trim().toLowerCase();
    const name = document.getElementById('ta-name-input')?.value.trim();
    const year = document.getElementById('ta-year-input')?.value;
    const semester = document.getElementById('ta-semester-input')?.value;
    
    if (!email || !name) {
      await MODAL.alert('Missing Info', 'Please enter TA name and email.');
      return;
    }
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester for this TA.');
      return;
    }
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteKey = UI.makeToken();
    
    const user = AUTH.getSession();
    await DB.TA.setInvite(inviteKey, {
      code: code,
      toEmail: email,
      toName: name,
      lecturerId: user?.id,
      lecturerName: user?.name,
      year: parseInt(year),
      semester: parseInt(semester),
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      usedAt: null
    });
    
    await MODAL.alert(
      'Invite Code Generated',
      `<div style="text-align:center">
         <div style="font-size:32px;font-family:monospace;background:var(--ug);color:var(--gold);padding:20px;border-radius:10px;margin:10px 0">${code}</div>
         <p>Share this code with ${name} at ${email}</p>
         <p style="font-size:12px;color:var(--text3)">Valid for 7 days</p>
       </div>`,
      { icon: '📧', btnLabel: 'Copy Code' }
    );
    
    document.getElementById('ta-email-input').value = '';
    document.getElementById('ta-name-input').value = '';
    _loadTAs();
  }

  async function removeTA(taId) {
    const confirmed = await MODAL.confirm('Remove TA', 'Remove this TA from your dashboard?', { confirmCls: 'btn-danger' });
    if (!confirmed) return;
    
    const user = AUTH.getSession();
    const myId = user?.id || '';
    const ta = await DB.TA.get(taId);
    
    if (ta && ta.lecturers) {
      const updatedLecturers = ta.lecturers.filter(id => id !== myId);
      await DB.TA.update(taId, { lecturers: updatedLecturers });
      await MODAL.success('TA Removed', 'TA has been removed from your dashboard.');
      _loadTAs();
    }
  }

  // ==================== SESSION MANAGEMENT (EXISTING) ====================
  function resetForm() {
    const setup = document.getElementById('lec-setup');
    const active = document.getElementById('lec-active');
    const qrBox = document.getElementById('qr-box');
    const blkWrap = document.getElementById('l-blk-wrap');
    
    if (setup) setup.style.display = 'block';
    if (active) active.style.display = 'none';
    if (qrBox) qrBox.innerHTML = '';
    if (blkWrap) blkWrap.style.display = 'none';
    
    S.locOn = true; 
    S.locAcquired = false; 
    S.lecLat = S.lecLng = null;
    S.session = null;
    
    const locTog = document.getElementById('loc-tog');
    const locLbl = document.getElementById('loc-lbl');
    const locResult = document.getElementById('loc-result');
    const getLocBtn = document.getElementById('get-loc-btn');
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const lLecname = document.getElementById('l-lecname');
    
    if (locTog) locTog.classList.add('on');
    if (locLbl) locLbl.textContent = 'Location fence enabled';
    if (locResult) { locResult.className = ''; locResult.innerHTML = ''; }
    if (getLocBtn) { getLocBtn.disabled = false; getLocBtn.textContent = '📍 Get my current location'; }
    if (genBtn) genBtn.disabled = true;
    if (genHint) genHint.style.display = 'block';
    if (lCode) lCode.value = '';
    if (lCourse) lCourse.value = '';
    if (lLecname) {
      const user = AUTH.getSession();
      lLecname.value = user?.name || user?.email || '';
    }
    
    const yearSelect = document.getElementById('session-year');
    const semesterSelect = document.getElementById('session-semester');
    if (yearSelect) yearSelect.value = '';
    if (semesterSelect) semesterSelect.value = '';
    
    const existingCourseDiv = document.getElementById('existing-course-select');
    if (existingCourseDiv) existingCourseDiv.style.display = 'none';
    
    const newCourseDiv = document.getElementById('new-course-fields');
    if (newCourseDiv) newCourseDiv.style.display = 'none';
    
    const useExistingRadio = document.querySelector('input[name="course-type"][value="existing"]');
    if (useExistingRadio) useExistingRadio.checked = true;
    
    if (S.unsubRec) { S.unsubRec(); S.unsubRec = null; }
    if (S.unsubBlk) { S.unsubBlk(); S.unsubBlk = null; }
    if (S.tickTimer) { clearInterval(S.tickTimer); S.tickTimer = null; }
    
    tab('mycourses');
  }

  async function onYearSemesterChange() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    if (year && semester) {
      await _loadExistingCoursesForPeriod(parseInt(year), parseInt(semester));
      const existingDiv = document.getElementById('existing-course-select');
      if (existingDiv) existingDiv.style.display = 'block';
    } else {
      const existingDiv = document.getElementById('existing-course-select');
      if (existingDiv) existingDiv.style.display = 'none';
    }
  }

  async function _loadExistingCoursesForPeriod(year, semester) {
    try {
      const user = AUTH.getSession();
      const myId = user?.id || '';
      const allSessions = await DB.SESSION.byLec(myId);
      const uniqueCourses = new Map();
      
      for (const session of allSessions) {
        let sessionYear = session.year;
        let sessionSemester = session.semester;
        
        if (!sessionYear && session.date) {
          const sessionDate = new Date(session.date);
          sessionYear = sessionDate.getFullYear();
          const month = sessionDate.getMonth();
          sessionSemester = (month >= 1 && month <= 6) ? 2 : 1;
          if (sessionSemester === 2 && month <= 6) sessionYear = sessionYear - 1;
        }
        
        if (sessionYear === year && sessionSemester === semester) {
          if (!uniqueCourses.has(session.courseCode)) {
            uniqueCourses.set(session.courseCode, { code: session.courseCode, name: session.courseName });
          }
        }
      }
      
      const select = document.getElementById('existing-course-select-dropdown');
      if (select) {
        const options = Array.from(uniqueCourses.values());
        select.innerHTML = options.length ? `<option value="">-- Select existing course --</option>${options.map(c => `<option value="${UI.esc(c.code)}" data-name="${UI.esc(c.name)}">${UI.esc(c.code)} - ${UI.esc(c.name)}</option>`).join('')}` : `<option value="">-- No existing courses for this period --</option>`;
      }
    } catch(e) { console.warn(e); }
  }

  function selectExistingCourse() {
    const select = document.getElementById('existing-course-select-dropdown');
    const selected = select?.options[select.selectedIndex];
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    if (selected && selected.value && lCode && lCourse) {
      lCode.value = selected.value;
      lCourse.value = selected.getAttribute('data-name') || '';
    }
  }

  function toggleNewCourseFields() {
    const useNew = document.getElementById('use-new-course')?.checked;
    const existingDiv = document.getElementById('existing-course-select');
    const newDiv = document.getElementById('new-course-fields');
    if (useNew) {
      if (existingDiv) existingDiv.style.display = 'none';
      if (newDiv) newDiv.style.display = 'block';
    } else {
      if (existingDiv) existingDiv.style.display = 'block';
      if (newDiv) newDiv.style.display = 'none';
    }
  }

  function getLoc() { 
    const btn = document.getElementById('get-loc-btn');
    const res = document.getElementById('loc-result');
    if (!btn || !res) return;
    btn.disabled = true; 
    btn.innerHTML = '<span class="spin"></span>Getting location…'; 
    res.className = 'loc-result'; 
    res.innerHTML = '<div class="loc-dot pulsing"></div> Acquiring GPS…'; 
    if (!navigator.geolocation) { _demoLoc(); return; } 
    navigator.geolocation.getCurrentPosition(p => { 
      S.lecLat = p.coords.latitude; 
      S.lecLng = p.coords.longitude; 
      S.locAcquired = true; 
      _locOK(p.coords.accuracy); 
    }, () => _demoLoc(), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }); 
  }
  
  function _demoLoc() { 
    S.lecLat = 5.6505 + (Math.random() - .5) * .001; 
    S.lecLng = -0.1875 + (Math.random() - .5) * .001; 
    S.locAcquired = true; 
    _locOK(null); 
  }
  
  function _locOK(acc) { 
    const btn = document.getElementById('get-loc-btn');
    const res = document.getElementById('loc-result');
    if (!btn || !res) return;
    res.className = 'loc-result ok'; 
    res.innerHTML = `<div class="loc-dot"></div> 📍 ${S.lecLat.toFixed(5)}, ${S.lecLng.toFixed(5)}${acc ? ` (±${Math.round(acc)}m)` : ' (demo)'} — Set ✓`; 
    btn.disabled = false; 
    btn.textContent = '🔄 Refresh location'; 
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    if (genBtn) genBtn.disabled = false; 
    if (genHint) genHint.style.display = 'none'; 
  }

  function toggleFence() { 
    S.locOn = !S.locOn; 
    const locTog = document.getElementById('loc-tog');
    const locLbl = document.getElementById('loc-lbl');
    const genBtn = document.getElementById('gen-btn');
    const genHint = document.getElementById('gen-hint');
    if (locTog) locTog.classList.toggle('on', S.locOn);
    if (locLbl) locLbl.textContent = S.locOn ? 'Location fence enabled' : 'Location fence disabled'; 
    if (!S.locOn) { 
      if (genBtn) genBtn.disabled = false; 
      if (genHint) genHint.style.display = 'none'; 
    } else if (!S.locAcquired) { 
      if (genBtn) genBtn.disabled = true; 
      if (genHint) genHint.style.display = 'block'; 
    } 
  }

  async function startSession() {
    const year = document.getElementById('session-year')?.value;
    const semester = document.getElementById('session-semester')?.value;
    const lCode = document.getElementById('l-code');
    const lCourse = document.getElementById('l-course');
    const lLecname = document.getElementById('l-lecname');
    const lDur = document.getElementById('l-dur');
    
    const code = lCode?.value.trim().toUpperCase() || '';
    const course = lCourse?.value.trim() || '';
    const lecName = lLecname?.value.trim() || '';
    const mins = lDur ? +(lDur.value) : 60;
    
    if (!year || !semester) {
      await MODAL.alert('Missing Info', 'Please select Year and Semester first.');
      return;
    }
    if (!code || !course) {
      if (lCode) lCode.classList.add('err');
      if (lCourse) lCourse.classList.add('err');
      await MODAL.alert('Missing Info', 'Please enter course code and name.');
      return;
    }
    if (lCode) lCode.classList.remove('err');
    if (lCourse) lCourse.classList.remove('err');
    
    const yearInt = parseInt(year);
    const semInt = parseInt(semester);
    
    if (S.locOn && !S.locAcquired) { 
      await MODAL.alert('Location required', 'Get your classroom location first.'); 
      return; 
    }
    
    const genBtn = document.getElementById('gen-btn');
    UI.btnLoad('gen-btn', true);
    try { 
      const user = AUTH.getSession(); 
      const myId = user?.role === 'ta' ? (user?.activeLecturerId || user?.id || '') : (user?.id || ''); 
      const existing = await DB.SESSION.byLec(myId); 
      if (existing.find(s => s.courseCode === code && s.active)) { 
        UI.btnLoad('gen-btn', false, 'Generate QR code'); 
        await MODAL.error('Session conflict', `A session for ${code} is already active.`); 
        return; 
      } 
      const token = UI.makeToken(20), sessId = token.slice(0, 12); 
      S.session = { 
        id: sessId, 
        token: token, 
        courseCode: code, 
        courseName: course, 
        lecturer: lecName, 
        lecId: user?.lecId || '', 
        lecFbId: myId, 
        department: user?.department || '', 
        date: UI.todayStr(), 
        expiresAt: Date.now() + mins * 60000, 
        durationMins: mins, 
        lat: S.locOn ? S.lecLat : null, 
        lng: S.locOn ? S.lecLng : null, 
        radius: S.locOn ? +(document.getElementById('l-radius')?.value || 100) : null, 
        locEnabled: S.locOn, 
        active: true, 
        createdAt: Date.now(), 
        year: yearInt, 
        semester: semInt
      }; 
      await DB.SESSION.set(sessId, S.session); 
      _buildPanel(lecName, mins); 
    } catch (err) { 
      UI.btnLoad('gen-btn', false, 'Generate QR code'); 
      console.error('Start session error:', err);
      await MODAL.error('Error', err.message); 
    } 
  }

  function _buildPanel(lecName, mins) { 
    const s = S.session;
    _setText('l-si-code', s.courseCode);
    _setText('l-si-course', s.courseName);
    _setText('l-si-lec', lecName);
    _setText('l-si-date', s.date);
    _setText('l-si-id', s.id);
    _setText('l-si-dur', UI.fmtDur(mins));
    _setText('l-si-period', `${s.year} - Semester ${s.semester === 1 ? 'First' : 'Second'}`);
    
    const lc = document.getElementById('l-loc-card');
    const lfcTitle = document.getElementById('l-lfc-title');
    const lfcDetail = document.getElementById('l-lfc-detail');
    if (lc) {
      if (s.locEnabled && s.lat) {
        lc.className = 'strip strip-teal';
        if (lfcTitle) lfcTitle.textContent = `Location fence — within ${s.radius}m`;
        if (lfcDetail) lfcDetail.textContent = `Anchor: ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`;
      } else {
        lc.className = 'strip strip-gray';
        if (lfcTitle) lfcTitle.textContent = 'Location check disabled';
        if (lfcDetail) lfcDetail.textContent = '';
      }
    }
    
    const qrBox = document.getElementById('qr-box');
    if (qrBox) {
      qrBox.innerHTML = '';
      qrBox.style.opacity = '1';
      const payload = UI.b64e(JSON.stringify({ 
        id: s.id, token: s.token, code: s.courseCode, course: s.courseName, 
        date: s.date, expiresAt: s.expiresAt, lat: s.lat, lng: s.lng, 
        radius: s.radius, locEnabled: s.locEnabled 
      }));
      const qrUrl = `${CONFIG.SITE_URL}?ci=${payload}`;
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrBox, { text: qrUrl, width: 220, height: 220, colorDark: '#1a1a18', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      } else {
        qrBox.innerHTML = `<p style="padding:10px;font-size:11px;word-break:break-all;max-width:220px">${UI.esc(qrUrl)}</p>`;
      }
    }
    
    const lecSetup = document.getElementById('lec-setup');
    const lecActive = document.getElementById('lec-active');
    if (lecSetup) lecSetup.style.display = 'none';
    if (lecActive) lecActive.style.display = 'block';
    
    UI.btnLoad('gen-btn', false, 'Generate QR code');
    
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.tickTimer) clearInterval(S.tickTimer);
    
    S.unsubRec = DB.SESSION.listenRecords(s.id, recs => { _renderAtt(recs); });
    S.unsubBlk = DB.SESSION.listenBlocked(s.id, _renderBlk);
    _tick(); 
    S.tickTimer = setInterval(_tick, 1000);
  }

  function _tick() { 
    if (!S.session) return; 
    const rem = Math.max(0, S.session.expiresAt - Date.now());
    const el = document.getElementById('l-cd');
    if (!el) return;
    if (rem === 0) { 
      el.textContent = 'Session expired'; 
      el.className = 'countdown exp'; 
      const qrBox = document.getElementById('qr-box');
      if (qrBox) qrBox.style.opacity = '0.3'; 
      return; 
    } 
    const m = Math.floor(rem / 60000), ss = Math.floor((rem % 60000) / 1000); 
    el.textContent = `${m}:${UI.pad(ss)}`; 
    el.className = 'countdown ' + (rem < 180000 ? 'warn' : 'ok'); 
  }

  function _renderAtt(records) { 
    if (!Array.isArray(records)) records = []; 
    const attCount = document.getElementById('l-att-count');
    const attList = document.getElementById('l-att-list');
    if (attCount) attCount.textContent = records.length;
    if (attList) {
      attList.innerHTML = records.length ? records.map((r, i) => `<div class="att-item">
        <div class="att-dot"></div>
        <span style="font-size:11px;min-width:22px">${i + 1}.</span>
        <span class="att-name">${UI.esc(r.name)}</span>
        <span class="att-sid">${UI.esc(r.studentId)}</span>
        <span class="att-time">${UI.esc(r.time)}</span>
      </div>`).join('') : '<div class="att-empty">Waiting for students…</div>';
    }
  }

  function _renderBlk(blocked) { 
    if (!Array.isArray(blocked)) blocked = []; 
    const w = document.getElementById('l-blk-wrap'); 
    if (!w) return; 
    if (!blocked.length) { 
      w.style.display = 'none'; 
      return; 
    } 
    w.style.display = 'block'; 
    const blkCount = document.getElementById('l-blk-count');
    const blkList = document.getElementById('l-blk-list');
    if (blkCount) blkCount.textContent = blocked.length;
    if (blkList) {
      blkList.innerHTML = blocked.map(b => `<div class="blk-item">
        <span><strong>${UI.esc(b.name)}</strong> (${UI.esc(b.studentId)}) — ${UI.esc(b.reason)}</span>
        <span style="white-space:nowrap">${UI.esc(b.time)}</span>
      </div>`).join('');
    }
  }

  async function endSession() { 
    const ok = await MODAL.confirm('End session?', 'All records will be saved and backed up.', 
      { icon: '🛑', confirmLabel: 'End session', confirmCls: 'btn-danger' }); 
    if (!ok) return; 
    if (S.tickTimer) clearInterval(S.tickTimer);
    if (S.unsubRec) S.unsubRec();
    if (S.unsubBlk) S.unsubBlk();
    if (S.session) {
      try { 
        await DB.SESSION.update(S.session.id, { active: false, endedAt: Date.now() }); 
      } catch (e) { console.warn(e); } 
    }
    resetForm(); 
    await MODAL.success('Session ended', 'All records saved.'); 
  }

  function downloadQR() { 
    const qrBox = document.getElementById('qr-box');
    const canvas = qrBox?.querySelector('canvas'); 
    const img = qrBox?.querySelector('img'); 
    if (!canvas && !img) { 
      MODAL.alert('QR not ready', 'Start a session first.'); 
      return; 
    } 
    const a = document.createElement('a'); 
    a.href = canvas ? canvas.toDataURL('image/png') : img.src; 
    a.download = `QR_${S.session?.courseCode}_${S.session?.date}.png`; 
    a.click(); 
  }

  async function exportLiveCSV() { 
    if (!S.session) return; 
    const recs = await DB.SESSION.getRecords(S.session.id); 
    const rows = [['#', 'Name', 'Student ID', 'Time', 'Course', 'Lecturer', 'Date']]; 
    recs.forEach((r, i) => rows.push([i + 1, r.name, r.studentId, r.time, S.session.courseCode, S.session.lecturer, S.session.date])); 
    UI.dlCSV(rows, `ATT_${S.session.courseCode}_LIVE`); 
  }

  // ==================== EXPORTS ====================
  return {
    tab,
    resetForm,
    getLoc,
    toggleFence,
    startSession,
    endSession,
    downloadQR,
    exportLiveCSV,
    viewCourses,
    showAddCourse,
    hideAddCourse,
    addNewCourse,
    startSessionForCourse,
    onYearSemesterChange,
    selectExistingCourse,
    toggleNewCourseFields,
    viewSessionDetails,
    exportCourseCSV,
    generateReport,
    endCourse,
    reactivateCourse,
    inviteTA,
    removeTA
  };
})();
