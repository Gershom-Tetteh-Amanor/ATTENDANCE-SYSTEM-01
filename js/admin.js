/* ============================================
   admin.js — Super admin + co-admin dashboards
   WITH COURSE GROUPING:
   - Super admin: Year → Department → Semester → Lecturer
   - Co-admin: Year → Semester → Lecturer (within their department)
   ============================================ */
'use strict';

// Helper: group courses by the specified hierarchy
function _groupCourses(courses, role, coAdminDept = null) {
  // courses: array of objects with fields: year, semester, department, lecturerName, lecturerId, courseCode, courseName, sessionCount, lastDate
  const groups = {};
  for (const c of courses) {
    if (role === 'superAdmin') {
      // Group by year -> department -> semester -> lecturer
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.department || 'Unknown']) groups[c.year][c.department || 'Unknown'] = {};
      if (!groups[c.year][c.department || 'Unknown'][c.semester]) groups[c.year][c.department || 'Unknown'][c.semester] = {};
      if (!groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId]) {
        groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId] = {
          lecturerName: c.lecturerName,
          courses: []
        };
      }
      groups[c.year][c.department || 'Unknown'][c.semester][c.lecturerId].courses.push(c);
    } else if (role === 'coAdmin') {
      // Co-admin: only courses in his department, grouped by year -> semester -> lecturer
      if (coAdminDept && c.department !== coAdminDept) continue;
      if (!groups[c.year]) groups[c.year] = {};
      if (!groups[c.year][c.semester]) groups[c.year][c.semester] = {};
      if (!groups[c.year][c.semester][c.lecturerId]) {
        groups[c.year][c.semester][c.lecturerId] = {
          lecturerName: c.lecturerName,
          courses: []
        };
      }
      groups[c.year][c.semester][c.lecturerId].courses.push(c);
    }
  }
  return groups;
}

// Helper to collect all courses from sessions (used by both admin roles)
async function _fetchAllCourses() {
  const sessions = await DB.SESSION.getAll();
  const courseMap = new Map(); // key: composite, value: course info
  for (const sess of sessions) {
    // Determine year and semester from session date
    const sessionDate = new Date(sess.date);
    let year = sessionDate.getFullYear();
    const month = sessionDate.getMonth();
    let semester = (month >= 1 && month <= 6) ? 2 : 1;
    if (semester === 2 && month <= 6) year = year - 1;
    const key = `${sess.courseCode}_${year}_${semester}_${sess.lecFbId}`;
    if (!courseMap.has(key)) {
      // Fetch lecturer name
      const lec = await DB.LEC.get(sess.lecFbId);
      courseMap.set(key, {
        year,
        semester,
        department: sess.department || lec?.department || 'Unknown',
        lecturerName: lec?.name || sess.lecturer,
        lecturerId: sess.lecFbId,
        courseCode: sess.courseCode,
        courseName: sess.courseName,
        sessionCount: 1,
        lastDate: sess.date
      });
    } else {
      const existing = courseMap.get(key);
      existing.sessionCount++;
      if (new Date(sess.date) > new Date(existing.lastDate)) existing.lastDate = sess.date;
      courseMap.set(key, existing);
    }
  }
  return Array.from(courseMap.values());
}

// ---------- SUPER ADMIN ----------
const SADM = (() => {
  const c = () => document.getElementById('sadm-content');

  function tab(name) {
    document.querySelectorAll('#view-sadmin .tab').forEach(t => {
      const l = t.textContent.trim().toLowerCase().replace(/\s/g, '').replace(/[^a-z]/g, '');
      t.classList.toggle('active', l.startsWith(name));
    });
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      coadmins: renderCoAdmins,
      settings: renderSettings,
      courses: renderCourses      // new tab for course grouping
    };
    if (fns[name]) fns[name]();
  }

  // Add a "Courses" tab to the super admin tabs (add to HTML as well)
  async function renderCourses() {
    c().innerHTML = '<div class="pg"><h2>All Courses</h2><p class="sub">Grouped by Year → Department → Semester → Lecturer</p><div id="sadm-courses-container"><div class="att-empty">Loading courses...</div></div></div>';
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'superAdmin');
      let html = '';
      // Sort years descending
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:32px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">Academic Year ${year}</h3>`;
        const depts = Object.keys(grouped[year]).sort();
        for (const dept of depts) {
          html += `<div style="margin-left:20px; margin-bottom:20px;"><h4 style="color:var(--teal);">📂 Department: ${UI.esc(dept)}</h4>`;
          const semesters = Object.keys(grouped[year][dept]).sort((a,b) => a - b);
          for (const sem of semesters) {
            const semName = sem === '1' ? 'First Semester' : 'Second Semester';
            html += `<div style="margin-left:20px; margin-bottom:16px;"><h5 style="color:var(--amber);">📖 ${semName}</h5>`;
            const lecturers = Object.keys(grouped[year][dept][sem]).sort();
            for (const lecId of lecturers) {
              const lecGroup = grouped[year][dept][sem][lecId];
              html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
              for (const course of lecGroup.courses) {
                html += `<div class="pill pill-blue" style="padding:4px 10px;">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.sessionCount} sessions)</div>`;
              }
              html += `</div></div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      document.getElementById('sadm-courses-container').innerHTML = html || '<div class="no-rec">No courses found.</div>';
    } catch(err) {
      document.getElementById('sadm-courses-container').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // The existing methods (renderIDs, renderLecturers, etc.) remain unchanged
  // ... (keep all previous functions for IDs, lecturers, sessions, database, coadmins, settings)
  // For brevity, I include only the new renderCourses and the tab addition.
  // The rest of the SADM object (genUID, revokeUID, etc.) stays as before.

  return { tab, renderCourses /* plus all existing exports */ };
})();

// ---------- CO-ADMIN ----------
const CADM = (() => {
  const c    = () => document.getElementById('cadm-content');
  const dept = () => AUTH.getSession()?.department || '';

  function tab(name) {
    document.querySelectorAll('#view-cadmin .tab').forEach(t => t.classList.toggle('active', t.textContent.trim().toLowerCase().startsWith(name)));
    if (c()) c().innerHTML = '<div class="pg"><div class="att-empty">Loading…</div></div>';
    const fns = {
      ids: renderIDs,
      lecturers: renderLecturers,
      sessions: renderSessions,
      database: renderDatabase,
      courses: renderCourses   // new tab for co-admin course grouping
    };
    if (fns[name]) fns[name]();
  }

  async function renderCourses() {
    c().innerHTML = `<div class="pg"><h2>Courses in ${UI.esc(dept())}</h2><p class="sub">Grouped by Year → Semester → Lecturer</p><div id="cadm-courses-container"><div class="att-empty">Loading courses...</div></div></div>`;
    try {
      const allCourses = await _fetchAllCourses();
      const grouped = _groupCourses(allCourses, 'coAdmin', dept());
      let html = '';
      const years = Object.keys(grouped).sort((a,b) => b - a);
      for (const year of years) {
        html += `<div style="margin-bottom:24px;"><h3 style="color:var(--ug);border-left:3px solid var(--ug);padding-left:10px;">Academic Year ${year}</h3>`;
        const semesters = Object.keys(grouped[year]).sort((a,b) => a - b);
        for (const sem of semesters) {
          const semName = sem === '1' ? 'First Semester' : 'Second Semester';
          html += `<div style="margin-left:20px; margin-bottom:16px;"><h4 style="color:var(--teal);">📖 ${semName}</h4>`;
          const lecturers = Object.keys(grouped[year][sem]).sort();
          for (const lecId of lecturers) {
            const lecGroup = grouped[year][sem][lecId];
            html += `<div style="margin-left:20px; margin-bottom:12px;"><strong>👨‍🏫 ${UI.esc(lecGroup.lecturerName)}</strong><div style="display:flex;flex-wrap:wrap;gap:8px; margin-top:6px;">`;
            for (const course of lecGroup.courses) {
              html += `<div class="pill pill-blue" style="padding:4px 10px;">${UI.esc(course.courseCode)} - ${UI.esc(course.courseName)} (${course.sessionCount} sessions)</div>`;
            }
            html += `</div></div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
      document.getElementById('cadm-courses-container').innerHTML = html || '<div class="no-rec">No courses in your department.</div>';
    } catch(err) {
      document.getElementById('cadm-courses-container').innerHTML = `<div class="no-rec">Error: ${UI.esc(err.message)}</div>`;
    }
  }

  // Keep all existing methods (renderIDs, renderLecturers, etc.) unchanged
  // ...

  return { tab, renderCourses /* plus existing exports */ };
})();
