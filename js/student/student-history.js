/* student-history.js — Attendance history with pagination and export */
'use strict';

const STUDENT_HISTORY = (() => {
  const core = () => window.STUDENT_CORE;
  const overview = () => window.STUDENT_OVERVIEW;
  
  function renderHistoryItems(sessions) {
    if (!sessions || sessions.length === 0) return '<div class="no-rec">📭 No sessions found for the selected period.</div>';
    const periodCourses = overview().getCoursesForCurrentPeriod();
    return `<div class="courses-grid">${sessions.map(session => {
      const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
      const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
      return `<div class="course-card"><div class="course-header"><span class="course-code">📅 ${session.date}</span><span class="badge" style="background: ${session.attended ? 'var(--teal)' : 'var(--danger)'};">${session.attended ? 'Present' : 'Absent'}</span></div><div class="course-name">📚 ${core().escapeHtml(session.courseCode)} - ${core().escapeHtml(session.courseName || 'Course')}</div><div class="course-stats"><span>👨‍🏫 ${core().escapeHtml(lecturerName)}</span>${session.attended && session.myRecord ? `<span>⏰ ${session.myRecord.time}</span>` : ''}</div></div>`;
    }).join('')}</div>`;
  }

  async function loadHistoryView() {
    const container = document.getElementById('history-view');
    if (!container) return;
    
    container.innerHTML = `<div class="filter-bar" style="margin-bottom: 20px;"><div style="min-width: 150px;"><div class="skeleton" style="height: 40px;"></div></div><div style="min-width: 200px;"><div class="skeleton" style="height: 40px;"></div></div><div style="min-width: 200px;"><div class="skeleton" style="height: 40px;"></div></div><div><div class="skeleton" style="height: 40px; width: 100px;"></div></div></div><div class="courses-grid">${Array(3).fill().map(() => `<div class="course-card"><div class="skeleton" style="height: 100px;"></div></div>`).join('')}</div>`;
    
    const periodCourses = overview().getCoursesForCurrentPeriod();
    const availablePeriods = [...new Set(core().state.enrolledCourses.map(c => `${c.year}_${c.semester}`))].sort((a, b) => {
      const [yearA, semA] = a.split('_');
      const [yearB, semB] = b.split('_');
      if (yearA !== yearB) return yearB - yearA;
      return semB - semA;
    });
    
    const availableLecturers = [...new Map(periodCourses.map(c => [c.lecId, c.lecturerName]))].map(([id, name]) => ({ id, name }));
    const availableCourses = periodCourses.map(c => ({ key: core().getCourseKey(c.courseCode, c.lecId), code: c.courseCode, name: c.courseName, lecturerName: c.lecturerName }));
    
    const allSessions = await DB.SESSION.getAll();
    const enrolledKeys = new Set(periodCourses.map(c => core().getCourseKey(c.courseCode, c.lecId)));
    
    let filteredSessions = [];
    for (const session of allSessions) {
      const sessionKey = core().getCourseKey(session.courseCode, session.lecFbId);
      const isEnrolled = enrolledKeys.has(sessionKey);
      if (isEnrolled && session.year === core().state.currentSelectedYear && session.semester === core().state.currentSelectedSemester) {
        const records = session.records ? Object.values(session.records) : [];
        const attended = records.some(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase());
        filteredSessions.push({ ...session, attended, myRecord: records.find(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase()) });
      }
    }
    
    if (core().state.currentFilterCourseKey) filteredSessions = filteredSessions.filter(s => core().getCourseKey(s.courseCode, s.lecFbId) === core().state.currentFilterCourseKey);
    if (core().state.currentFilterLecturer) filteredSessions = filteredSessions.filter(s => s.lecFbId === core().state.currentFilterLecturer);
    
    filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const totalPages = Math.ceil(filteredSessions.length / core().state.itemsPerPage);
    const startIndex = (core().state.currentHistoryPage - 1) * core().state.itemsPerPage;
    const paginatedSessions = filteredSessions.slice(startIndex, startIndex + core().state.itemsPerPage);
    
    let periodsHtml = '';
    if (availablePeriods.length > 0) {
      periodsHtml = availablePeriods.map(p => { const [year, semester] = p.split('_'); return `<option value="${p}" ${parseInt(year) === core().state.currentSelectedYear && parseInt(semester) === core().state.currentSelectedSemester ? 'selected' : ''}>${year} - ${semester === '1' ? 'First Semester' : 'Second Semester'}</option>`; }).join('');
    } else {
      const availableYears = core().getAvailableYears();
      const currentYear = new Date().getFullYear();
      periodsHtml = availableYears.map(year => `<option value="${year}_1" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 1 ? 'selected' : ''}>${year} - First Semester</option><option value="${year}_2" ${year === core().state.currentSelectedYear && core().state.currentSelectedSemester === 2 ? 'selected' : ''}>${year} - Second Semester</option>`).join('');
    }
    
    container.innerHTML = `
      <div class="filter-bar" style="margin-bottom: 20px; flex-wrap: wrap;">
        <div><label class="fl">📅 Academic Period</label><select id="history-period" class="fi" onchange="STUDENT_HISTORY.changeHistoryPeriod()"><option value="">Select Period</option>${periodsHtml}</select></div>
        <div><label class="fl">📚 Course</label><select id="history-course" class="fi" onchange="STUDENT_HISTORY.filterHistory()"><option value="">All</option>${availableCourses.map(c => `<option value="${c.key}" ${core().state.currentFilterCourseKey === c.key ? 'selected' : ''}>${c.code} (${c.lecturerName})</option>`).join('')}</select></div>
        <div><label class="fl">👨‍🏫 Lecturer</label><select id="history-lecturer" class="fi" onchange="STUDENT_HISTORY.filterHistory()"><option value="">All</option>${availableLecturers.map(l => `<option value="${l.id}" ${core().state.currentFilterLecturer === l.id ? 'selected' : ''}>${core().escapeHtml(l.name)}</option>`).join('')}</select></div>
        <div><button class="btn btn-secondary" onclick="STUDENT_HISTORY.exportHistoryToExcel()">📥 Export</button></div>
      </div>
      <div id="history-items-container">${renderHistoryItems(paginatedSessions)}</div>
      ${totalPages > 1 ? `<div class="pagination-bar" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; padding: 10px;"><button class="btn btn-outline btn-sm" id="prev-history-page" ${core().state.currentHistoryPage === 1 ? 'disabled' : ''}>← Previous</button><span id="history-page-info" style="font-size: 13px;">Page ${core().state.currentHistoryPage} of ${totalPages} (Showing ${startIndex + 1}-${Math.min(startIndex + core().state.itemsPerPage, filteredSessions.length)} of ${filteredSessions.length})</span><button class="btn btn-outline btn-sm" id="next-history-page" ${core().state.currentHistoryPage === totalPages ? 'disabled' : ''}>Next →</button></div>` : ''}
    `;
    
    if (totalPages > 1) {
      document.getElementById('prev-history-page')?.addEventListener('click', () => { if (core().state.currentHistoryPage > 1) { core().state.currentHistoryPage--; loadHistoryView(); } });
      document.getElementById('next-history-page')?.addEventListener('click', () => { if (core().state.currentHistoryPage < totalPages) { core().state.currentHistoryPage++; loadHistoryView(); } });
    }
  }

  async function filterHistory() {
    core().state.currentFilterCourseKey = document.getElementById('history-course')?.value || null;
    core().state.currentFilterLecturer = document.getElementById('history-lecturer')?.value || null;
    core().state.currentHistoryPage = 1;
    await loadHistoryView();
  }

  async function changeHistoryPeriod() {
    const select = document.getElementById('history-period');
    if (select && select.value) {
      const [year, semester] = select.value.split('_');
      core().state.currentSelectedYear = parseInt(year);
      core().state.currentSelectedSemester = parseInt(semester);
      core().state.currentFilterCourseKey = null;
      core().state.currentFilterLecturer = null;
      core().state.currentHistoryPage = 1;
      await loadHistoryView();
    }
  }

  async function exportHistoryToExcel() {
    await core().rateLimiters.exports.execute(async () => {
      if (typeof XLSX === 'undefined') { await MODAL.alert('Library Error', 'Excel export not loaded.'); return; }
      
      const periodCourses = overview().getCoursesForCurrentPeriod();
      const enrolledKeys = new Set(periodCourses.map(c => core().getCourseKey(c.courseCode, c.lecId)));
      const allSessions = await DB.SESSION.getAll();
      
      let filteredSessions = [];
      for (const session of allSessions) {
        const isEnrolled = enrolledKeys.has(core().getCourseKey(session.courseCode, session.lecFbId));
        if (isEnrolled && session.year === core().state.currentSelectedYear && session.semester === core().state.currentSelectedSemester) {
          const records = session.records ? Object.values(session.records) : [];
          const attended = records.some(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase());
          filteredSessions.push({ ...session, attended, myRecord: records.find(r => r.studentId?.toUpperCase() === core().state.currentStudent.studentId?.toUpperCase()) });
        }
      }
      
      if (core().state.currentFilterCourseKey) filteredSessions = filteredSessions.filter(s => core().getCourseKey(s.courseCode, s.lecFbId) === core().state.currentFilterCourseKey);
      if (core().state.currentFilterLecturer) filteredSessions = filteredSessions.filter(s => s.lecFbId === core().state.currentFilterLecturer);
      filteredSessions.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const wsData = [['📋 Attendance History'], [`Student: ${core().state.currentStudent.name} (${core().state.currentStudent.studentId})`], [`Period: ${core().state.currentSelectedYear} - Semester ${core().state.currentSelectedSemester}`], [`Generated: ${new Date().toLocaleString()}`], [], ['#', 'Date', 'Course', 'Lecturer', 'Status', 'Time', 'Method']];
      let i = 1;
      for (const session of filteredSessions) {
        const enrollment = periodCourses.find(e => e.courseCode === session.courseCode && e.lecId === session.lecFbId);
        const lecturerName = enrollment?.lecturerName || session.lecturer || 'Unknown';
        wsData.push([i++, session.date, `${session.courseCode} ${session.courseName || ''}`, lecturerName, session.attended ? 'Present' : 'Absent', session.myRecord?.time || '—', session.myRecord?.authMethod === 'webauthn' ? 'Biometric' : (session.myRecord?.authMethod === 'manual' ? 'Manual' : '—')]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${core().state.currentStudent.studentId}`);
      XLSX.writeFile(wb, `UG_Attendance_${core().state.currentStudent.studentId}_${core().state.currentSelectedYear}_Sem${core().state.currentSelectedSemester}.xlsx`);
      await MODAL.success('Export Complete', '✅ Exported.');
    });
  }

  return {
    loadHistoryView,
    filterHistory,
    changeHistoryPeriod,
    exportHistoryToExcel
  };
})();

window.STUDENT_HISTORY = STUDENT_HISTORY;
